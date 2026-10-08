import { NextRequest, NextResponse } from "next/server";
import { database, readState, type EntityType, type Selection } from "@/lib/store";
import { currentUser, sameOrigin } from "@/lib/auth";
import { canMutate } from "@/lib/auth-policy";

export const runtime = "edge";
const types: EntityType[] = ["country", "region", "store", "screen", "group"];
const parentType: Partial<Record<EntityType, EntityType>> = { region: "country", store: "region", screen: "store" };
const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const validName = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;

export async function GET(request: NextRequest) {
  const user = await currentUser(request.headers);
  if (!user) return bad("Sign in again.", 401);
  try { const state = await readState(); return NextResponse.json({ ...state, activity: user.role === "admin" ? state.activity : [] }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("Read state failed", error); return bad("Screen data is temporarily unavailable.", 503); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return bad("Invalid request origin.", 403);
  const user = await currentUser(request.headers);
  if (!user) return bad("Sign in again.", 401);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("Invalid request body."); }
  if (!canMutate(user.role, body.action)) return bad("You do not have permission for this action.", 403);
  try {
    const db = database();
    const state = await readState();
    const entity = (id: unknown) => state.entities.find((item) => item.id === id);
    const now = new Date().toISOString();
    let audit: { action: string; type: string | null; id: string | null; name: string | null } | null = null;
    if (body.action === "create" || body.action === "update") {
      const type = body.type as EntityType;
      if (!types.includes(type) || !validName(body.name)) return bad("Enter a valid name.");
      const name = (body.name as string).trim();
      const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
      if (parentType[type] && entity(parentId)?.type !== parentType[type]) return bad(`Select a ${parentType[type]} first.`);
      if (!parentType[type] && parentId) return bad("This item cannot have a parent.");
      const liveUrl = typeof body.liveUrl === "string" && body.liveUrl.trim() ? body.liveUrl.trim() : null;
      if (type === "screen" && liveUrl) {
        let parsed: URL;
        try { parsed = new URL(liveUrl); } catch { return bad("Enter a valid HTTPS live link."); }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) return bad("Live links must use HTTPS.");
      }
      if (type !== "screen" && liveUrl) return bad("Only screens can have live links.");
      const duplicate = state.entities.some((item) => item.type === type && item.parentId === parentId && item.name.toLowerCase() === name.toLowerCase() && item.id !== body.id);
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
      const statements = [...ids].flatMap((id) => [
        db.prepare("DELETE FROM group_members WHERE group_id = ? OR screen_id = ?").bind(id, id),
        db.prepare("DELETE FROM entities WHERE id = ?").bind(id),
      ]);
      await db.batch(statements);
      audit = { action: "deleted", type: existing.type, id: existing.id, name: existing.name };
    } else if (body.action === "member") {
      if (entity(body.groupId)?.type !== "group" || entity(body.screenId)?.type !== "screen") return bad("Choose a valid group and screen.");
      if (body.enabled === true) await db.prepare("INSERT OR IGNORE INTO group_members (group_id, screen_id) VALUES (?, ?)").bind(body.groupId, body.screenId).run();
      else await db.prepare("DELETE FROM group_members WHERE group_id = ? AND screen_id = ?").bind(body.groupId, body.screenId).run();
      audit = { action: body.enabled === true ? "assigned" : "unassigned", type: "screen", id: String(body.screenId), name: entity(body.screenId)?.name || null };
    } else if (body.action === "display") {
      const selection = body.selection as Selection;
      if (!selection || typeof selection !== "object" || Array.isArray(selection)) return bad("Invalid selection.");
      if (Object.keys(selection).some((key) => !["countryId", "regionId", "storeId", "groupId", "screenIds"].includes(key))) return bad("Invalid selection.");
      for (const [key, type] of [["countryId", "country"], ["regionId", "region"], ["storeId", "store"], ["groupId", "group"]] as const) {
        if (selection[key] && entity(selection[key])?.type !== type) return bad("A selected item no longer exists.");
      }
      const region = entity(selection.regionId);
      const store = entity(selection.storeId);
      if (region && selection.countryId && region.parentId !== selection.countryId) return bad("Region does not belong to the selected country.");
      if (store && selection.regionId && store.parentId !== selection.regionId) return bad("Location does not belong to the selected region.");
      if (store && selection.countryId && entity(store.parentId)?.parentId !== selection.countryId) return bad("Location does not belong to the selected country.");
      if (selection.screenIds && (!Array.isArray(selection.screenIds) || selection.screenIds.length > 500 || selection.screenIds.some((id) => entity(id)?.type !== "screen") || new Set(selection.screenIds).size !== selection.screenIds.length)) return bad("Invalid screen selection.");
      const autoAdvance = body.autoAdvance === false ? 0 : 1;
      const interval = Math.max(5, Math.min(60, Number(body.intervalSeconds) || 10));
      await db.prepare("INSERT INTO display_state (id, selection, auto_advance, interval_seconds, updated_at) VALUES ('main', ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET selection = excluded.selection, auto_advance = excluded.auto_advance, interval_seconds = excluded.interval_seconds, updated_at = excluded.updated_at")
        .bind(JSON.stringify(selection), autoAdvance, interval, now).run();
      audit = { action: "changed wall selection", type: null, id: null, name: null };
    } else return bad("Unknown action.");
    if (audit) {
      try {
        await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), audit.action, audit.type, audit.id, audit.name, user.email, now).run();
      } catch (error) { console.error("Activity logging failed", error); }
    }
    const updated = await readState();
    return NextResponse.json({ ...updated, activity: user.role === "admin" ? updated.activity : [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Update state failed", error); return bad("Could not save. Please try again.", 503); }
}
