import { currentUser, sameOrigin } from "@/lib/auth";
import { database } from "@/lib/database";
import { prepareScreenPhoto, readScreenMutation, readScreenPhoto, removeScreenPhoto } from "@/lib/screen-photo";
import { RequestError, requestFailure } from "@/lib/request";
import { validPhotoCategory, photoCategoryApplies, photoCategoriesForScreen } from "@/lib/screen-gallery-shared";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const reply = (body: object, status = 200) => Response.json(body, { status, headers });
const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 256;
const validKey = (key: unknown) => key === null || (typeof key === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key));

export async function GET(request: Request) {
  try {
    const user = await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    const params = new URL(request.url).searchParams, screenId = params.get("screenId");
    if (!validId(screenId)) throw new RequestError("Choose a screen.");
    const db = database();
    const screen = await db.prepare('SELECT photo_key AS key, screen_type AS "screenType" FROM entities WHERE id = ? AND type = \'screen\'').bind(screenId).first<{ key: string | null; screenType: string | null }>();
    if (!screen) return reply({ error: "Screen not found." }, 404);
    const rows = await db.prepare("SELECT category, photo_key AS key FROM screen_reference_photos WHERE screen_id = ?").bind(screenId).all<{ category: string; key: string }>();
    const photos: Record<string, string | null> = Object.fromEntries(photoCategoriesForScreen(screen.screenType).map(category => [category.id, category.id === "front" ? screen.key : null]));
    for (const row of rows.results) if (Object.hasOwn(photos, row.category)) photos[row.category] = row.key;
    if (!params.has("category")) return reply({ photos, screenType: screen.screenType });
    const category = params.get("category"), size = params.get("size") || "thumbnail";
    if (!validPhotoCategory(category) || !["thumbnail", "full"].includes(size)) throw new RequestError("Choose a valid photo.");
    if (!photoCategoryApplies(category, screen.screenType)) throw new RequestError("This photo category is not available for this screen type. Refresh photos and try again.");
    const key = photos[category];
    if (!key || params.get("v") !== key) return reply({ error: "Photo not found." }, 404);
    try {
      const bytes = await readScreenPhoto(key, size === "thumbnail");
      return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.length), "Content-Disposition": 'inline; filename="screen-photo.webp"' } });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return reply({ error: "Photo unavailable." }, 404);
      throw error;
    }
  } catch (error) { return requestFailure(error); }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Invalid request origin." }, 403);
  let prepared: string | null = null, obsolete: string | null = null, committed = false;
  try {
    const user = await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    const { body, file } = await readScreenMutation(request);
    if (!validId(body.screenId) || !validPhotoCategory(body.category) || !validKey(body.expectedKey)) throw new RequestError("Choose a valid screen photo.");
    const category = body.category;
    if (!["replace", "remove"].includes(String(body.action)) || (body.action === "replace") !== !!file) throw new RequestError("Choose a photo change.");
    if (file) prepared = await prepareScreenPhoto(file);
    const result = await database().transaction(async db => {
      // Use the inventory lock to serialize edits and parent/screen deletion.
      await db.prepare("SELECT pg_advisory_xact_lock(724017)").run();
      const screen = await db.prepare('SELECT name, photo_key AS key, screen_type AS "screenType" FROM entities WHERE id = ? AND type = \'screen\'').bind(body.screenId).first<{ name: string; key: string | null; screenType: string | null }>();
      if (!screen) throw new RequestError("Screen not found.", 404);
      if (!photoCategoryApplies(category, screen.screenType)) throw new RequestError("This photo category is not available for this screen type. Refresh photos and try again.");
      const current = body.category === "front" ? screen.key : (await db.prepare("SELECT photo_key AS key FROM screen_reference_photos WHERE screen_id = ? AND category = ?").bind(body.screenId, body.category).first<{ key: string }>())?.key || null;
      if (current !== body.expectedKey) throw new RequestError("This photo changed elsewhere. Cancel and refresh before editing again.", 409);
      if (body.category === "front") await db.prepare("UPDATE entities SET photo_key = ? WHERE id = ?").bind(prepared, body.screenId).run();
      else if (prepared) await db.prepare("INSERT INTO screen_reference_photos (screen_id, category, photo_key) VALUES (?, ?, ?) ON CONFLICT (screen_id, category) DO UPDATE SET photo_key = EXCLUDED.photo_key").bind(body.screenId, body.category, prepared).run();
      else await db.prepare("DELETE FROM screen_reference_photos WHERE screen_id = ? AND category = ?").bind(body.screenId, body.category).run();
      await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, 'screen', ?, ?, ?, ?)").bind(crypto.randomUUID(), `${body.action === "remove" ? "removed" : "updated"} screen ${body.category} photo`, body.screenId, screen.name, user.email, new Date().toISOString()).run();
      obsolete = current;
      return reply({ key: prepared });
    });
    committed = true;
    return result;
  } catch (error) { return requestFailure(error); }
  finally {
    if (!committed && prepared) await removeScreenPhoto(prepared);
    if (committed && obsolete) await removeScreenPhoto(obsolete);
  }
}
