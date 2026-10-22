import { currentUser } from "@/lib/auth";
import { database } from "@/lib/database";
import { readLocationPhoto } from "@/lib/location-photo";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  try {
    const user = await currentUser(request.headers);
    if (!user) return Response.json({ error: "Sign in again." }, { status: 401, headers });
    if (user.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403, headers });
    const params = new URL(request.url).searchParams;
    const locationId = params.get("locationId"), id = params.get("id"), size = params.get("size") || "thumbnail";
    if (!locationId || locationId.length > 256 || !id || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || !["thumbnail", "full"].includes(size)) return Response.json({ error: "Choose a valid location photo." }, { status: 400, headers });
    const row = await database().prepare("SELECT p.id FROM location_photos p JOIN entities e ON e.id = p.location_id AND e.type = 'store' WHERE p.id = ? AND p.location_id = ?").bind(id, locationId).first<{ id: string }>();
    if (!row) return Response.json({ error: "Photo not found." }, { status: 404, headers });
    let bytes: Buffer;
    try { bytes = await readLocationPhoto(id, size === "thumbnail"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return Response.json({ error: "Photo unavailable." }, { status: 404, headers }); throw error; }
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.length), "Content-Disposition": 'inline; filename="location-photo.webp"' } });
  } catch (error) { return requestFailure(error); }
}
