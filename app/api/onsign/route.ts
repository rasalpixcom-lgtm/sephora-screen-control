import { currentUser } from "@/lib/auth";
import { database } from "@/lib/database";
import { OnSignApiError, onSignApi } from "@/lib/onsign-api";
import { requestFailure } from "@/lib/request";
import { onSignSections, onSignLoops, type OnSignSection, type OnSignLoop } from "@/lib/onsign-api-shared";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  try {
    const user = await currentUser(request.headers);
    if (!user) return Response.json({ error: "Sign in again." }, { status: 401, headers });
    if (user.role !== "admin") return Response.json({ error: "Admin access required." }, { status: 403, headers });
    const params = new URL(request.url).searchParams;
    const screenId = params.get("screenId"), section = params.get("section");
    if ((section !== null && (!screenId || !onSignSections.includes(section as OnSignSection)))
      || (params.has("loop") && !onSignLoops.includes(params.get("loop") as OnSignLoop))) return Response.json({ error: "Choose valid OnSign detail options." }, { status: 400, headers });
    if (screenId !== null) {
      if (!screenId || screenId.length > 256) return Response.json({ error: "Choose a valid screen." }, { status: 400, headers });
      const screen = await database().prepare("SELECT onsign_player_id AS \"playerId\" FROM entities WHERE id = ? AND type = 'screen'").bind(screenId).first<{ playerId: string | null }>();
      if (!screen) return Response.json({ error: "Screen not found." }, { status: 404, headers });
      if (!screen.playerId) return Response.json({ error: "Link an OnSign player in Edit screen to view its details." }, { status: 409, headers });
      if (section) return Response.json(await onSignApi.section(screen.playerId, section as OnSignSection, params.get("after"), (params.get("loop") || "PRIMARY") as OnSignLoop, params.get("groupId")), { headers });
      return Response.json(await onSignApi.details(screen.playerId), { headers });
    }
    if (!onSignApi.configured()) return Response.json({ configured: false, players: [] }, { headers });
    return Response.json({ configured: true, ...await onSignApi.list() }, { headers });
  } catch (error) {
    if (error instanceof OnSignApiError) return Response.json({ error: error.message }, { status: error.status, headers });
    return requestFailure(error);
  }
}
