import { NextRequest, NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { database } from "@/lib/database";
import { cmsId, parseCmsPayload, type CmsPayload } from "@/lib/cms-support";
import { RequestError, requestFailure } from "@/lib/request";
import { normalizePrivatePhoto } from "@/lib/screen-photo";
import { renderCmsPdf } from "@/lib/cms-pdf";

export const runtime = "nodejs";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
type Row = { id: string; version: string; payload: CmsPayload; image: Buffer | null; createdAt: Date; updatedAt: Date; updatedBy: string };
const select = 'SELECT id, version, payload, image, created_at AS "createdAt", updated_at AS "updatedAt", updated_by AS "updatedBy" FROM cms_updates';
async function authorize(request: NextRequest) {
  const user = await currentUser(request.headers);
  if (!user) throw new RequestError("Sign in again.", 401);
  if (user.role !== "admin") throw new RequestError("Admin access required.", 403);
  return user;
}
async function readMutation(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Enter content details.");
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 6 * 1024 * 1024) { await reader.cancel(); throw new RequestError("Upload is too large.", 413); } chunks.push(value); } } finally { reader.releaseLock(); }
  const type = request.headers.get("content-type") || "";
  let raw: string, image: File | null = null;
  if (type.toLowerCase().startsWith("multipart/form-data;")) {
    let form: FormData;
    try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": type } }).formData(); } catch { throw new RequestError("Invalid content upload."); }
    if (Array.from(form.keys()).some(key => !["metadata", "image"].includes(key)) || form.getAll("metadata").length !== 1 || form.getAll("image").length > 1 || typeof form.get("metadata") !== "string") throw new RequestError("Send one image and content details.");
    raw = form.get("metadata") as string;
    const file = form.get("image"); if (file !== null && !(file instanceof File)) throw new RequestError("Choose a content image.");
    image = file as File | null;
  } else if (type.split(";")[0].trim() === "application/json") raw = Buffer.concat(chunks).toString("utf8");
  else throw new RequestError("Send JSON or a content image upload.", 415);
  if (Buffer.byteLength(raw) > 512000) throw new RequestError("Content details are too large.", 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { throw new RequestError("Invalid content details."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RequestError("Invalid content details.");
  return { body, image };
}
export async function GET(request: NextRequest) {
  try {
    await authorize(request);
    const db = database(), params = request.nextUrl.searchParams, id = params.get("id");
    if (id) {
      if (!cmsId(id)) throw new RequestError("Invalid content reference.");
      const row = await db.prepare(select + " WHERE id = ?").bind(id).first<Row>();
      if (!row) throw new RequestError("Content update not found.", 404);
      if (params.get("image") === "1") {
        if (!row.image) throw new RequestError("Image not found.", 404);
        return new Response(new Uint8Array(row.image), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
      }
      const reports = await db.prepare('SELECT id, revision, created_at AS "createdAt", created_by AS "createdBy" FROM cms_reports WHERE update_id = ? ORDER BY revision DESC').bind(id).all();
      const { image, ...record } = row;
      return reply({ record: { ...record, hasImage: Boolean(image), reports: reports.results } });
    }
    const search = params.get("search") || "", country = params.get("country") || "", location = params.get("location") || "", status = params.get("status") || "", start = params.get("start") || "", end = params.get("end") || "";
    const page = Number(params.get("page") || 1);
    if (search.length > 160 || country.length > 200 || location.length > 200 || !["", "Scheduled", "Pending", "Failed", "Not required"].includes(status) || !Number.isInteger(page) || page < 1 || page > 100000 || [start, end].some(day => day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) || (start && end && start > end)) throw new RequestError("Invalid content filters.");
    const where = " WHERE (strpos(lower(concat(payload->>'contentName',' ',payload->>'campaignName',' ',payload->>'category')), lower(?)) > 0) AND EXISTS (SELECT 1 FROM jsonb_array_elements(payload->'screens') AS s WHERE (? = '' OR s->>'country' = ?) AND (? = '' OR s->>'location' = ?) AND (? = '' OR s->>'scheduling' = ?)) AND (? = '' OR payload->>'playbackEnd' >= ?) AND (? = '' OR payload->>'playbackStart' <= ?)";
    const values = [search, country, country, location, location, status, status, start, start, end, end];
    const count = await db.prepare("SELECT count(*)::int AS total FROM cms_updates" + where).bind(...values).first<{ total: number }>();
    const list = await db.prepare(`SELECT id, version, payload->>'contentName' AS "contentName", payload->>'campaignName' AS "campaignName", payload->>'category' AS category, payload->>'playbackStart' AS "playbackStart", payload->>'playbackEnd' AS "playbackEnd", jsonb_array_length(payload->'screens') AS screens, (SELECT count(*)::int FROM jsonb_array_elements(payload->'screens') AS s WHERE s->>'scheduling' = 'Scheduled') AS scheduled, updated_at AS "updatedAt", (SELECT count(*)::int FROM cms_reports WHERE update_id = cms_updates.id) AS reports FROM cms_updates` + where + " ORDER BY updated_at DESC, id LIMIT 25 OFFSET ?").bind(...values, (page - 1) * 25).all();
    const countries = await db.prepare("SELECT DISTINCT s->>'country' AS name FROM cms_updates, jsonb_array_elements(payload->'screens') AS s ORDER BY name").all();
    const locations = await db.prepare("SELECT DISTINCT s->>'location' AS name FROM cms_updates, jsonb_array_elements(payload->'screens') AS s WHERE (? = '' OR s->>'country' = ?) ORDER BY name").bind(country, country).all();
    return reply({ updates: list.results, total: count?.total || 0, countries: countries.results.map(row => row.name), locations: locations.results.map(row => row.name) });
  } catch (error) { return requestFailure(error); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: "Invalid request origin." }, 403);
  try {
    const user = await authorize(request);
    const { body, image } = await readMutation(request);
    const create = body.action === "create", finalize = body.action === "finalize";
    if (!["create", "update", "finalize"].includes(String(body.action))) throw new RequestError("Choose a valid content action.");
    if (!create && (!cmsId(body.id) || !cmsId(body.version))) throw new RequestError("Refresh this update before editing.");
    const imageAction = body.imageAction ?? "keep";
    if (!["keep", "remove", "replace"].includes(String(imageAction)) || (imageAction === "replace") !== Boolean(image) || (finalize && image)) throw new RequestError("Choose a valid content image change.");
    const prepared = image ? (await normalizePrivatePhoto(image)).full : null;
    if (prepared && prepared.length > 5 * 1024 * 1024) throw new RequestError("Choose a smaller content image.", 413);
    return await database().transaction(async db => {
      await db.prepare("SELECT pg_advisory_xact_lock(724017)").run();
      const previous = create ? null : await db.prepare(select + " WHERE id = ? FOR UPDATE").bind(body.id).first<Row>();
      if (!create && !previous) throw new RequestError("Content update not found.", 404);
      if (previous && previous.version !== body.version) throw new RequestError("This update changed elsewhere. Reopen it before editing.", 409);
      const now = new Date().toISOString();
      if (finalize) {
        const old = await db.prepare("SELECT id FROM cms_reports WHERE update_id = ? AND source_version = ?").bind(previous!.id, previous!.version).first<{ id: string }>();
        if (old) return reply({ reportId: old.id });
        const revision = (await db.prepare("SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM cms_reports WHERE update_id = ?").bind(previous!.id).first<{ revision: number }>())!.revision;
        const reportId = crypto.randomUUID();
        const pdf = await renderCmsPdf(previous!.payload, previous!.image, `CMS-${previous!.id.slice(0, 8).toUpperCase()} / R${revision}`, now);
        if (pdf.length > 10 * 1024 * 1024) throw new RequestError("Report is too large. Use a smaller content image.", 413);
        await db.prepare("INSERT INTO cms_reports (id, update_id, revision, source_version, pdf, created_by) VALUES (?, ?, ?, ?, ?, ?)").bind(reportId, previous!.id, revision, previous!.version, pdf, user.email).run();
        await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, 'finalized CMS report', 'cms', ?, ?, ?, ?)").bind(crypto.randomUUID(), previous!.id, previous!.payload.contentName, user.email, now).run();
        return reply({ reportId });
      }
      const inventory = await db.prepare('SELECT id, type, name, parent_id AS "parentId" FROM entities').all<{ id: string; type: string; name: string; parentId: string | null }>();
      let payload: CmsPayload;
      try { payload = parseCmsPayload(body.payload, inventory.results, previous?.payload); } catch (error) { throw new RequestError(error instanceof Error ? error.message : "Invalid content details."); }
      const id = previous?.id || crypto.randomUUID(), version = crypto.randomUUID();
      const bytes = imageAction === "remove" ? null : imageAction === "replace" ? prepared : previous?.image || null;
      if (create) await db.prepare("INSERT INTO cms_updates (id, version, payload, image, updated_by) VALUES (?, ?, ?::jsonb, ?, ?)").bind(id, version, JSON.stringify(payload), bytes, user.email).run();
      else await db.prepare("UPDATE cms_updates SET version = ?, payload = ?::jsonb, image = ?, updated_at = ?, updated_by = ? WHERE id = ?").bind(version, JSON.stringify(payload), bytes, now, user.email, id).run();
      await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, 'cms', ?, ?, ?, ?)").bind(crypto.randomUUID(), create ? "created CMS update" : "updated CMS update", id, payload.contentName, user.email, now).run();
      return reply({ id, version });
    });
  } catch (error) { return requestFailure(error); }
}
