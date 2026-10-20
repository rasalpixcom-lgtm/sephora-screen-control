import { currentUser } from "@/lib/auth";
import { database } from "@/lib/database";
import { readScreenPhoto } from "@/lib/screen-photo";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  try {
    const user = await currentUser(request.headers);
    if (!user) return Response.json({ error: "Sign in again." }, { status: 401, headers });
    if (user.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403, headers });
    const params = new URL(request.url).searchParams, id = params.get("screenId"), size = params.get("size") || "thumbnail";
    if (!id || id.length > 256 || !["thumbnail", "full"].includes(size)) return Response.json({ error: "Choose a valid screen photo." }, { status: 400, headers });
    const row = await database().prepare("SELECT photo_key AS key FROM entities WHERE id = ? AND type = 'screen'").bind(id).first<{ key: string | null }>();
    if (!row?.key || params.get("v") !== row.key) return Response.json({ error: "Photo not found." }, { status: 404, headers });
    let bytes: Buffer;
    try { bytes = await readScreenPhoto(row.key, size === "thumbnail"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return Response.json({ error: "Photo unavailable." }, { status: 404, headers }); throw error; }
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.length), "Content-Disposition": 'inline; filename="screen-photo.webp"' } });
  } catch (error) { return requestFailure(error); }
}
