import { NextRequest, NextResponse } from "next/server";
import { database, readState, type EntityType, type Selection } from "@/lib/store";

export const runtime = "edge";
const types: EntityType[] = ["country", "region", "store", "screen", "group"];
const parentType: Partial<Record<EntityType, EntityType>> = { region: "country", store: "region", screen: "store" };
const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const validName = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= 80;

export async function GET() {
  try { return NextResponse.json(await readState(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { console.error("Read state failed", error); return bad("Screen data is temporarily unavailable.", 503); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return bad("Invalid request origin.", 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("Invalid request body."); }
  try {
    const db = database();
    const state = await readState();
    const entity = (id: unknown) => state.entities.find((item) => item.id === id);
    const now = new Date().toISOString();
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
        await db.prepare("INSERT INTO entities (id, type, name, parent_id, live_url, is_demo, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)")
          .bind(crypto.randomUUID(), type, name, parentId, liveUrl, now).run();
      } else {
        const existing = entity(body.id);
        if (!existing || existing.type !== type) return bad("Item not found.", 404);
        await db.prepare("UPDATE entities SET name = ?, parent_id = ?, live_url = ?, is_demo = 0 WHERE id = ?")
          .bind(name, parentId, liveUrl, existing.id).run();
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
    } else if (body.action === "member") {
      if (entity(body.groupId)?.type !== "group" || entity(body.screenId)?.type !== "screen") return bad("Choose a valid group and screen.");
      if (body.enabled === true) await db.prepare("INSERT OR IGNORE INTO group_members (group_id, screen_id) VALUES (?, ?)").bind(body.groupId, body.screenId).run();
      else await db.prepare("DELETE FROM group_members WHERE group_id = ? AND screen_id = ?").bind(body.groupId, body.screenId).run();
    } else if (body.action === "display") {
      const selection = body.selection as Selection;
      if (!selection || typeof selection !== "object" || Array.isArray(selection)) return bad("Invalid selection.");
      for (const [key, type] of [["countryId", "country"], ["regionId", "region"], ["storeId", "store"], ["groupId", "group"]] as const) {
        if (selection[key] && entity(selection[key])?.type !== type) return bad("A selected item no longer exists.");
      }
      if (selection.screenIds && (!Array.isArray(selection.screenIds) || selection.screenIds.some((id) => entity(id)?.type !== "screen"))) return bad("Invalid screen selection.");
      const autoAdvance = body.autoAdvance === false ? 0 : 1;
      const interval = Math.max(5, Math.min(60, Number(body.intervalSeconds) || 10));
      await db.prepare("INSERT INTO display_state (id, selection, auto_advance, interval_seconds, updated_at) VALUES ('main', ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET selection = excluded.selection, auto_advance = excluded.auto_advance, interval_seconds = excluded.interval_seconds, updated_at = excluded.updated_at")
        .bind(JSON.stringify(selection), autoAdvance, interval, now).run();
    } else if (body.action === "seed") {
      if (state.entities.length) return bad("Sample setup is available only for an empty workspace.");
      const rows: Array<[string, EntityType, string, string | null, string | null]> = [
        ["uae", "country", "United Arab Emirates", null, null], ["ksa", "country", "Saudi Arabia", null, null], ["qatar", "country", "Qatar", null, null],
        ["dubai", "region", "Dubai", "uae", null], ["abudhabi", "region", "Abu Dhabi", "uae", null], ["riyadh", "region", "Riyadh", "ksa", null], ["doha", "region", "Doha", "qatar", null],
        ["dubaimall", "store", "Dubai Mall", "dubai", null], ["moe", "store", "Mall of the Emirates", "dubai", null], ["mirdif", "store", "City Centre Mirdif", "dubai", null], ["yasmall", "store", "Yas Mall", "abudhabi", null],
        ["dmcash", "screen", "Cash table · 01", "dubaimall", null], ["dmwindow", "screen", "Entrance display · 01", "dubaimall", null], ["moecash", "screen", "Cash table · 01", "moe", null], ["moebeauty", "screen", "Beauty studio · 01", "moe", null], ["micash", "screen", "Cash table · 01", "mirdif", null], ["yasentry", "screen", "Entrance display · 01", "yasmall", null],
        ["cashgroup", "group", "Cash table", null, null], ["entrygroup", "group", "Entrance displays", null, null],
      ];
      await db.batch([
        ...rows.map(([id, type, name, parentId, liveUrl]) => db.prepare("INSERT INTO entities (id, type, name, parent_id, live_url, is_demo, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)").bind(id, type, name, parentId, liveUrl, now)),
        ...[["cashgroup","dmcash"],["cashgroup","moecash"],["cashgroup","micash"],["entrygroup","dmwindow"],["entrygroup","yasentry"]].map(([groupId,screenId]) => db.prepare("INSERT INTO group_members (group_id, screen_id) VALUES (?, ?)").bind(groupId,screenId)),
      ]);
    } else return bad("Unknown action.");
    return NextResponse.json(await readState(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Update state failed", error); return bad("Could not save. Please try again.", 503); }
}
