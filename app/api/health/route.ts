import { database } from "@/lib/database";
import { assertAuthConfig } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    assertAuthConfig();
    const db = database();
    await db.prepare("SELECT id, role, disabled FROM auth_user LIMIT 1").first();
    await db.prepare("SELECT id, selection FROM display_state LIMIT 1").first();
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
