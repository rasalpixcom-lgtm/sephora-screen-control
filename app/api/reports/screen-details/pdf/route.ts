import { currentUser } from "@/lib/auth";
import { database } from "@/lib/database";
import { RequestError, requestFailure } from "@/lib/request";
import { renderScreenDetailsPdf, type ScreenDetailsReport, type ScreenReportPhoto } from "@/lib/screen-details-pdf";
import { hardwareSectionsForType, type HardwareFields, type HardwareSection } from "@/lib/screen-hardware";
import { photoCategoriesForScreen } from "@/lib/screen-gallery-shared";
import { readScreenPhoto } from "@/lib/screen-photo";
import { readLocationPhoto } from "@/lib/location-photo";
import type { PpmFields } from "@/lib/screen-ppm-inspection";
import type { LocationDetailFields } from "@/lib/location-details";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await currentUser(request.headers);
    if (!user) throw new RequestError("Sign in again.", 401);
    if (user.role !== "admin") throw new RequestError("Admin access required.", 403);
    const params = new URL(request.url).searchParams, screenId = params.get("screenId"), locationPhotos = params.get("locationPhotos");
    if (!screenId || screenId.length > 256) throw new RequestError("Choose a screen.");
    if (locationPhotos !== null && locationPhotos !== "0" && locationPhotos !== "1") throw new RequestError("Choose whether to include location photos.");
    const includeLocationPhotos = locationPhotos === "1";
    const snapshot = await database().transaction(async db => {
      await db.prepare("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY").run();
      const screen = await db.prepare(`SELECT s.id, s.name, s.screen_type AS "screenType", s.photo_key AS "photoKey",
        l.id AS "locationId", COALESCE(l.name, '') AS location, COALESCE(r.name, '') AS region, COALESCE(c.name, '') AS country
        FROM entities s LEFT JOIN entities l ON l.id = s.parent_id AND l.type = 'store'
        LEFT JOIN entities r ON r.id = l.parent_id AND r.type = 'region'
        LEFT JOIN entities c ON c.id = r.parent_id AND c.type = 'country'
        WHERE s.id = ? AND s.type = 'screen'`).bind(screenId).first<{ id: string; name: string; screenType: string | null; photoKey: string | null; locationId: string | null; location: string; region: string; country: string }>();
      if (!screen) throw new RequestError("Screen not found.", 404);
      const hardware = await db.prepare("SELECT section, fields FROM screen_hardware_sections WHERE screen_id = ?").bind(screenId).all<{ section: HardwareSection; fields: HardwareFields }>();
      const ppm = await db.prepare("SELECT fields FROM screen_ppm_inspections WHERE screen_id = ?").bind(screenId).first<{ fields: PpmFields }>();
      const location = screen.locationId ? await db.prepare("SELECT fields FROM location_details WHERE location_id = ?").bind(screen.locationId).first<{ fields: LocationDetailFields }>() : null;
      const photos = await db.prepare('SELECT category, photo_key AS key FROM screen_reference_photos WHERE screen_id = ?').bind(screenId).all<{ category: string; key: string }>();
      const sharedPhotos = includeLocationPhotos && screen.locationId ? (await db.prepare("SELECT id, label, position FROM location_photos WHERE location_id = ? ORDER BY position, id").bind(screen.locationId).all<{ id: string; label: string; position: number }>()).results : [];
      return { screen, hardware: Object.fromEntries(hardware.results.filter(row => hardwareSectionsForType(screen.screenType).includes(row.section)).map(row => [row.section, row.fields])), ppm: ppm?.fields || {}, locationDetails: location?.fields || {}, photos: photos.results, sharedPhotos };
    });
    async function photo(label: string, key: string, location = false): Promise<ScreenReportPhoto> {
      try { return { label, bytes: await (location ? readLocationPhoto(key, false) : readScreenPhoto(key, false)) }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { label, bytes: null }; throw error; }
    }
    const screenPhotos: ScreenReportPhoto[] = [], sharedPhotos: ScreenReportPhoto[] = [];
    for (const category of photoCategoriesForScreen(snapshot.screen.screenType)) {
      const key = category.id === "front" ? snapshot.screen.photoKey : snapshot.photos.find(row => row.category === category.id)?.key;
      if (key) screenPhotos.push(await photo(category.label, key));
    }
    for (const item of snapshot.sharedPhotos) sharedPhotos.push(await photo(item.label || `Location photo ${item.position + 1}`, item.id, true));
    const report: ScreenDetailsReport = { ...snapshot.screen, hardware: snapshot.hardware, ppm: snapshot.ppm, locationDetails: snapshot.locationDetails, screenPhotos, locationPhotos: sharedPhotos, includeLocationPhotos };
    const pdf = await renderScreenDetailsPdf(report);
    const name = snapshot.screen.name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-").trim().slice(0, 100).replace(/[. ]+$/, "") || "screen";
    const filename = `${name} - Screen Details.pdf`;
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return requestFailure(error); }
}
