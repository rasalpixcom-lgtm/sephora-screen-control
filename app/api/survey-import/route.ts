import { createHash, randomUUID } from "node:crypto";
import { currentUser, sameOrigin } from "@/lib/auth";
import { database, type ServerDatabase } from "@/lib/database";
import { readObject, requestFailure, RequestError } from "@/lib/request";
import { hardwareSections, parseHardwareFields, type HardwareSection } from "@/lib/screen-hardware";
import { parsePpmFields } from "@/lib/screen-ppm-inspection";
import { parseSurveyText, ppmImportLabels, surveyWarnings, type SurveyFields, type SurveyPreview, type SurveyRow } from "@/lib/survey-import";

export const runtime = "nodejs";
const reply = (body: object) => Response.json(body, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
async function snapshot(db: ServerDatabase, screenId: string) {
  const screen = await db.prepare(`SELECT e.name, e.screen_type AS "screenType", concat_ws(' · ', s.name, r.name, c.name) AS location
    FROM entities e LEFT JOIN entities s ON s.id=e.parent_id LEFT JOIN entities r ON r.id=s.parent_id LEFT JOIN entities c ON c.id=r.parent_id
    WHERE e.id=? AND e.type='screen'`).bind(screenId).first<{ name: string; screenType: string | null; location: string }>();
  if (!screen) throw new RequestError("Screen not found.", 404);
  const hardware = (await db.prepare("SELECT section, fields, version FROM screen_hardware_sections WHERE screen_id=? ORDER BY section").bind(screenId).all<{ section: HardwareSection; fields: SurveyFields; version: string }>()).results;
  const ppm = await db.prepare("SELECT fields, version FROM screen_ppm_inspections WHERE screen_id=?").bind(screenId).first<{ fields: SurveyFields; version: string }>();
  return { screen, hardware, ppm };
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
function preview(screenId: string, text: string, state: Snapshot) {
  let survey: ReturnType<typeof parseSurveyText>;
  try { survey = parseSurveyText(text); } catch (error) { throw new RequestError((error as Error).message); }
  const rows: SurveyRow[] = [];
  for (const [id, fields] of Object.entries(survey.hardware)) {
    const section = id as HardwareSection, current = state.hardware.find(row => row.section === section)?.fields || {};
    for (const [key, incoming] of Object.entries(fields)) {
      if (current[key] === incoming) continue;
      rows.push({ id: `${section}.${key}`, section, key, group: hardwareSections[section].title, label: hardwareSections[section].fields.find(([id]) => id === key)?.[1] || key, current: current[key] || "", incoming, selected: !current[key] });
    }
  }
  for (const [key, incoming] of Object.entries(survey.ppm)) {
    const current = state.ppm?.fields[key] || "";
    if (incoming !== current) rows.push({ id: `ppm.${key}`, section: "ppm", key, group: "PPM inspection", label: ppmImportLabels.find(([id]) => id === key)?.[1] || key, current, incoming, selected: !current });
  }
  const result: SurveyPreview = { screenId, screenName: state.screen.name, location: state.screen.location, source: survey.source, currentType: state.screen.screenType, screenType: survey.screenType,
    fingerprint: createHash("sha256").update(JSON.stringify([text, state])).digest("hex"), rows, warnings: surveyWarnings(survey, state.screen.name, state.screen.screenType, { ...state.ppm?.fields, ...survey.ppm }), skipped: survey.skipped };
  return { result, survey };
}
async function handle(request: Request, saving: boolean) {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const user = await currentUser(request.headers);
    if (!user) throw new RequestError("Sign in again.", 401);
    if (user.role !== "admin") throw new RequestError("Admin access required.", 403);
    const body = await readObject(request);
    if (typeof body.screenId !== "string" || !body.screenId || body.screenId.length > 256 || typeof body.text !== "string") throw new RequestError("Choose a screen and paste its survey details.");
    const screenId = body.screenId, text = body.text;
    return await database().transaction(async db => {
      // Shared with inventory, hardware edits, photo edits and PPM edits.
      await db.prepare("SELECT pg_advisory_xact_lock(724017)").run();
      const state = await snapshot(db, screenId), { result, survey } = preview(screenId, text, state);
      if (!saving) return reply({ preview: result });
      if (body.fingerprint !== result.fingerprint) throw new RequestError("These details changed since preview. Preview the survey again before saving.", 409);
      if (body.confirmScreen !== true) throw new RequestError("Confirm that the copied survey belongs to this selected screen.");
      if (result.currentType !== result.screenType && body.confirmType !== true) throw new RequestError("Confirm the screen-type change before saving.");
      if (result.warnings.length && body.confirmWarnings !== true) throw new RequestError("Review and acknowledge the import warnings before saving.");
      if (!Array.isArray(body.selected) || body.selected.length > result.rows.length || body.selected.some(id => typeof id !== "string" || !result.rows.some(row => row.id === id)) || new Set(body.selected).size !== body.selected.length) throw new RequestError("Choose valid fields from the preview.");
      const selected = new Set(body.selected as string[]), changes = result.rows.filter(row => selected.has(row.id));
      if (!changes.length && result.currentType === result.screenType) throw new RequestError("Select at least one change to import.");
      const groups = new Map<string, SurveyFields>();
      for (const row of changes) {
        if (!groups.has(row.section)) groups.set(row.section, { ...(row.section === "ppm" ? state.ppm?.fields : state.hardware.find(record => record.section === row.section)?.fields) });
        groups.get(row.section)![row.key] = row.incoming;
      }
      try {
        for (const [section, fields] of groups) groups.set(section, section === "ppm" ? { ...parsePpmFields(fields) } : parseHardwareFields(section as HardwareSection, fields));
      } catch (error) { throw new RequestError(`The selected changes cannot be combined with existing details: ${(error as Error).message}`); }
      const finalPpm = groups.get("ppm") || state.ppm?.fields || {};
      const finalWarnings = surveyWarnings(survey, state.screen.name, state.screen.screenType, finalPpm);
      if (finalWarnings.length && body.confirmWarnings !== true) throw new RequestError("Review the PPM status and import warnings before saving.");
      const now = new Date().toISOString();
      if (result.currentType !== result.screenType) await db.prepare("UPDATE entities SET screen_type=? WHERE id=?").bind(result.screenType, screenId).run();
      for (const [section, fields] of groups) {
        if (section === "ppm") await db.prepare("INSERT INTO screen_ppm_inspections (screen_id, fields, version, updated_at) VALUES (?, ?::jsonb, ?, ?) ON CONFLICT (screen_id) DO UPDATE SET fields=EXCLUDED.fields, version=EXCLUDED.version, updated_at=EXCLUDED.updated_at").bind(screenId, JSON.stringify(fields), randomUUID(), now).run();
        else await db.prepare("INSERT INTO screen_hardware_sections (screen_id, section, fields, version, updated_at) VALUES (?, ?, ?::jsonb, ?, ?) ON CONFLICT (screen_id, section) DO UPDATE SET fields=EXCLUDED.fields, version=EXCLUDED.version, updated_at=EXCLUDED.updated_at").bind(screenId, section, JSON.stringify(fields), randomUUID(), now).run();
      }
      await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, 'screen', ?, ?, ?, ?)").bind(randomUUID(), `imported survey details (${changes.length} fields)`, screenId, state.screen.name, user.email, now).run();
      return reply({ saved: true, fields: changes.length });
    });
  } catch (error) { return requestFailure(error); }
}
export const POST = (request: Request) => handle(request, false);
export const PUT = (request: Request) => handle(request, true);
