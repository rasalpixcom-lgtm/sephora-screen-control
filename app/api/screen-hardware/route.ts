import { NextRequest, NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { database } from "@/lib/database";
import { readObject, requestFailure } from "@/lib/request";
import { displayHardwareFields, hardwareSectionsForType, hardwareSections, isHardwareSection, parseHardwareFields, type HardwareRecord, type HardwareSection } from "@/lib/screen-hardware";

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
    const screen = await db.prepare("SELECT id, screen_type AS \"screenType\" FROM entities WHERE id = ? AND type = 'screen'").bind(screenId).first<{ id: string; screenType: string | null }>();
    if (!screen) return reply({ error: "Screen not found." }, 404);
    const rows = await db.prepare('SELECT section, fields, version, updated_at AS "updatedAt" FROM screen_hardware_sections WHERE screen_id = ?').bind(screenId).all<{ section: HardwareSection; fields: Record<string, string>; version: string; updatedAt: Date }>();
    const allowed = hardwareSectionsForType(screen.screenType);
    const sections = Object.fromEntries(allowed.map(id => [id, { fields: {}, version: null, updatedAt: null }])) as Partial<Record<HardwareSection, HardwareRecord>>;
    for (const row of rows.results) if (allowed.includes(row.section)) sections[row.section] = { fields: displayHardwareFields(row.section, row.fields), version: row.version, updatedAt: row.updatedAt.toISOString() };
    return reply({ sections, screenType: screen.screenType });
  } catch (error) { return requestFailure(error); }
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Invalid request origin." }, 403);
  try {
    const user = await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    const body = await readObject(request);
    if (!validId(body.screenId) || !isHardwareSection(body.section)) return reply({ error: "Choose a valid screen and section." }, 400);
    if (body.version !== null && (typeof body.version !== "string" || !/^[a-f0-9-]{36}$/.test(body.version))) return reply({ error: "Refresh these details and try again." }, 400);
    const section = body.section;
    let fields: Record<string, string>;
    try { fields = parseHardwareFields(section, body.fields); }
    catch (error) { return reply({ error: error instanceof Error ? error.message : "Enter valid hardware details." }, 400); }
    const result = await database().transaction(async db => {
      // Serialize with screen-type changes and inventory deletion.
      await db.prepare("SELECT pg_advisory_xact_lock(724017)").run();
      const screen = await db.prepare('SELECT name, screen_type AS "screenType" FROM entities WHERE id = ? AND type = \'screen\'').bind(body.screenId).first<{ name: string; screenType: string | null }>();
      if (!screen) return reply({ error: "Screen not found." }, 404);
      if (!hardwareSectionsForType(screen.screenType).includes(section)) return reply({ error: screen.screenType ? "This hardware section does not apply to the current screen type. Refresh the page before editing again." : "Choose a screen type in Edit screen before adding hardware details." }, 400);
      const version = crypto.randomUUID(), now = new Date().toISOString();
      const row = body.version === null
        ? await db.prepare('INSERT INTO screen_hardware_sections (screen_id, section, fields, version, updated_at) VALUES (?, ?, ?::jsonb, ?, ?) ON CONFLICT DO NOTHING RETURNING version').bind(body.screenId, body.section, JSON.stringify(fields), version, now).first()
        : await db.prepare('UPDATE screen_hardware_sections SET fields = ?::jsonb, version = ?, updated_at = ? WHERE screen_id = ? AND section = ? AND version = ? RETURNING version').bind(JSON.stringify(fields), version, now, body.screenId, body.section, body.version).first();
      if (!row) return reply({ error: "These details changed elsewhere. Refresh this page before editing again." }, 409);
      await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, 'screen', ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), `${body.version === null ? "created" : "updated"} ${hardwareSections[section].title}`, body.screenId, screen.name, user.email, now).run();
      return reply({ record: { fields, version, updatedAt: now } });
    });
    return result;
  } catch (error) { return requestFailure(error); }
}
