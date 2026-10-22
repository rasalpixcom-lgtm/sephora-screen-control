import { NextRequest, NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { database } from "@/lib/database";
import { readObject, requestFailure } from "@/lib/request";
import { parseScreenNote } from "@/lib/screen-notes";

export const runtime = "nodejs";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256;

export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    const screenId = request.nextUrl.searchParams.get("screenId");
    if (!validId(screenId)) return reply({ error: "Choose a screen." }, 400);
    const db = database();
    const screen = await db.prepare("SELECT id FROM entities WHERE id = ? AND type = 'screen'").bind(screenId).first();
    if (!screen) return reply({ error: "Screen not found." }, 404);
    const row = await db.prepare('SELECT note, version, updated_at AS "updatedAt" FROM screen_notes WHERE screen_id = ?').bind(screenId).first<{ note: string; version: string; updatedAt: Date }>();
    return reply({ note: row ? { text: row.note, version: row.version, updatedAt: row.updatedAt.toISOString() } : { text: "", version: null, updatedAt: null } });
  } catch (error) { return requestFailure(error); }
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Invalid request origin." }, 403);
  try {
    const user = await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    const body = await readObject(request);
    if (!validId(body.screenId)) return reply({ error: "Choose a screen." }, 400);
    if (body.version !== null && (typeof body.version !== "string" || !/^[a-f0-9-]{36}$/.test(body.version))) return reply({ error: "Refresh this note and try again." }, 400);
    let note: string;
    try { note = parseScreenNote(body.note); }
    catch (error) { return reply({ error: error instanceof Error ? error.message : "Enter a valid note." }, 400); }
    const result = await database().transaction(async db => {
      const screen = await db.prepare("SELECT name FROM entities WHERE id = ? AND type = 'screen'").bind(body.screenId).first<{ name: string }>();
      if (!screen) return reply({ error: "Screen not found." }, 404);
      const version = crypto.randomUUID(), now = new Date().toISOString();
      const row = body.version === null
        ? await db.prepare("INSERT INTO screen_notes (screen_id, note, version, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING version").bind(body.screenId, note, version, now).first()
        : await db.prepare("UPDATE screen_notes SET note = ?, version = ?, updated_at = ? WHERE screen_id = ? AND version = ? RETURNING version").bind(note, version, now, body.screenId, body.version).first();
      if (!row) return reply({ error: "This note changed elsewhere. Refresh this page before editing again." }, 409);
      await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, 'screen', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), body.version === null ? "created screen note" : "updated screen note", body.screenId, screen.name, user.email, now).run();
      return reply({ note: { text: note, version, updatedAt: now } });
    });
    return result;
  } catch (error) { return requestFailure(error); }
}
