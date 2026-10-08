import { NextRequest, NextResponse } from "next/server";
import { database, readState, type EntityType, type Selection } from "@/lib/store";
import { currentUser, sameOrigin } from "@/lib/auth";
import { canMutate } from "@/lib/auth-policy";
import { readObject, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
const types: EntityType[] = ["country", "region", "store", "screen", "group"];
const parentType: Partial<Record<EntityType, EntityType>> = { region: "country", store: "region", screen: "store" };
const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const validName = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;

export async function GET(request: NextRequest) {
  try {
  const user = await currentUser(request.headers);
  if (!user) return bad("Sign in again.", 401);
  const state = await readState(database(), user.role === "admin");
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestFailure(error); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return bad("Invalid request origin.", 403);
  try {
  const user = await currentUser(request.headers);
  if (!user) return bad("Sign in again.", 401);
  const body = await readObject(request);
  if (!canMutate(user.role, body.action)) return bad("You do not have permission for this action.", 403);
  return await database().transaction(async (db) => {
    // Validation and writes share the lock across every Node process.
    // This prevents duplicate names and children being created during parent deletion.
    await db.prepare("SELECT pg_advisory_xact_lock(724017)").run();
    const state = await readState(db, false);
    const entity = (id: unknown) => state.entities.find((item) => item.id === id);
    const now = new Date().toISOString();
    let audit: { action: string; type: string | null; id: string | null; name: string | null } | null = null;
    if (body.action === "create" || body.action === "update") {
      const type = body.type as EntityType;
      if (!types.includes(type) || !validName(body.name)) return bad("Enter a valid name.");
      const name = (body.name as string).trim();
      if (body.parentId !== undefined && body.parentId !== null && typeof body.parentId !== "string") return bad("Choose a valid parent.");
      const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
      if (parentType[type] && entity(parentId)?.type !== parentType[type]) return bad(`Select a ${parentType[type]} first.`);
      if (!parentType[type] && parentId) return bad("This item cannot have a parent.");
      const liveUrl = typeof body.liveUrl === "string" && body.liveUrl.trim() ? body.liveUrl.trim() : null;
      if (body.liveUrl !== undefined && body.liveUrl !== null && typeof body.liveUrl !== "string" || liveUrl && liveUrl.length > 8192) return bad("Enter a valid live link.");
      if (type === "screen" && liveUrl) {
        let parsed: URL;
        try { parsed = new URL(liveUrl); } catch { return bad("Enter a valid HTTPS live link."); }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) return bad("Live links must use HTTPS.");
      }
      if (type !== "screen" && liveUrl) return bad("Only screens can have live links.");
      const duplicate = state.entities.some((item) => item.type === type && item.parentId === parentId && item.name.toLowerCase() === name.toLowerCase() && (body.action === "create" || item.id !== body.id));
      if (duplicate) return bad("An item with this name already exists here.");
      if (body.action === "create") {
        const id = crypto.randomUUID();
        await db.prepare("INSERT INTO entities (id, type, name, parent_id, live_url, is_demo, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
          .bind(id, type, name, parentId, liveUrl, now).run();
        audit = { action: "created", type, id, name };
      } else {
        const existing = entity(body.id);
        if (!existing || existing.type !== type) return bad("Item not found.", 404);
        await db.prepare("UPDATE entities SET name = ?, parent_id = ?, live_url = ?, is_demo = 0 WHERE id = ?")
          .bind(name, parentId, liveUrl, existing.id).run();
        audit = { action: "updated", type, id: existing.id, name };
      }
    } else if (body.action === "delete") {
      const existing = entity(body.id);
      if (!existing) return bad("Item not found.", 404);
      const ids = new Set([existing.id]);
      let changed = true;
      while (changed) { changed = false; for (const item of state.entities) if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); changed = true; } }
      for (const id of ids) {
        await db.prepare("DELETE FROM group_members WHERE group_id = ? OR screen_id = ?").bind(id, id).run();
        await db.prepare("DELETE FROM entities WHERE id = ?").bind(id).run();
      }
      const selection = { ...state.display.selection };
      for (const key of ["countryId", "regionId", "storeId", "groupId"] as const) {
        if (selection[key] && (!entity(selection[key]) || ids.has(selection[key]!))) delete selection[key];
      }
      if (selection.screenIds) {
        const remaining = selection.screenIds.filter((id) => !ids.has(id) && entity(id)?.type === "screen");
        if (remaining.length) selection.screenIds = remaining;
        else delete selection.screenIds;
      }
      if (JSON.stringify(selection) !== JSON.stringify(state.display.selection)) {
        await db.prepare("UPDATE display_state SET selection = ?, updated_at = ? WHERE id = 'main'").bind(JSON.stringify(selection), now).run();
      }
      audit = { action: "deleted", type: existing.type, id: existing.id, name: existing.name };
    } else if (body.action === "member") {
      if (entity(body.groupId)?.type !== "group" || entity(body.screenId)?.type !== "screen") return bad("Choose a valid group and screen.");
      if (typeof body.enabled !== "boolean") return bad("Choose whether the screen is assigned.");
      if (body.enabled === true) await db.prepare("INSERT INTO group_members (group_id, screen_id) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(body.groupId, body.screenId).run();
      else await db.prepare("DELETE FROM group_members WHERE group_id = ? AND screen_id = ?").bind(body.groupId, body.screenId).run();
      audit = { action: body.enabled === true ? "assigned" : "unassigned", type: "screen", id: String(body.screenId), name: entity(body.screenId)?.name || null };
    } else if (body.action === "display") {
      const selection = body.selection as Selection;
      if (!selection || typeof selection !== "object" || Array.isArray(selection)) return bad("Invalid selection.");
      if (Object.keys(selection).some((key) => !["countryId", "regionId", "storeId", "groupId", "screenIds"].includes(key))) return bad("Invalid selection.");
      for (const [key, type] of [["countryId", "country"], ["regionId", "region"], ["storeId", "store"], ["groupId", "group"]] as const) {
        if (selection[key] !== undefined && (typeof selection[key] !== "string" || !selection[key] || entity(selection[key])?.type !== type)) return bad("A selected item no longer exists.");
      }
      const region = entity(selection.regionId);
      const store = entity(selection.storeId);
      if (region && selection.countryId && region.parentId !== selection.countryId) return bad("Region does not belong to the selected country.");
      if (store && selection.regionId && store.parentId !== selection.regionId) return bad("Location does not belong to the selected region.");
      if (store && selection.countryId && entity(store.parentId)?.parentId !== selection.countryId) return bad("Location does not belong to the selected country.");
      if (selection.screenIds !== undefined && (!Array.isArray(selection.screenIds) || selection.screenIds.length > 500 || selection.screenIds.some((id) => typeof id !== "string" || entity(id)?.type !== "screen") || new Set(selection.screenIds).size !== selection.screenIds.length)) return bad("Invalid screen selection.");
      if (body.autoAdvance !== undefined && typeof body.autoAdvance !== "boolean") return bad("Invalid rotation setting.");
      const autoAdvance = body.autoAdvance === false ? 0 : 1;
      const interval = body.intervalSeconds === undefined ? 10 : body.intervalSeconds;
      if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 5 || interval > 60) return bad("Rotation must be a whole number from 5 to 60 seconds.");
      await db.prepare("INSERT INTO display_state (id, selection, auto_advance, interval_seconds, updated_at) VALUES ('main', ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET selection = excluded.selection, auto_advance = excluded.auto_advance, interval_seconds = excluded.interval_seconds, updated_at = excluded.updated_at")
        .bind(JSON.stringify(selection), autoAdvance, interval, now).run();
      audit = { action: "changed wall selection", type: null, id: null, name: null };
    } else return bad("Unknown action.");
    if (audit) {
        await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), audit.action, audit.type, audit.id, audit.name, user.email, now).run();
    }
    const updated = await readState(db, user.role === "admin");
    return NextResponse.json({ ...updated, activity: user.role === "admin" ? updated.activity : [] }, { headers: { "Cache-Control": "no-store" } });
  });
  } catch (error) { return requestFailure(error); }
}
