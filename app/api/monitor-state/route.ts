import { currentUser } from "@/lib/auth";
import { validMonitorKey } from "@/lib/monitor-access";
import { readState } from "@/lib/store";
import { screensFor } from "@/lib/screens";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", Vary: "Authorization, Cookie" };
  try {
    const authorization = request.headers.get("authorization");
    const allowed = authorization !== null ? await validMonitorKey(authorization) : !!await currentUser(request.headers);
    if (!allowed) return Response.json({ error: "This monitor link is missing or inactive. Ask an Admin for the current link." }, { status: 401, headers });
    const state = await readState(undefined, false);
    // Expose only the current screens and their labels, without audit or accounts.
    const selected = screensFor(state, state.display.selection);
    const ids = new Set(selected.map(screen => screen.id));
    for (const screen of selected) {
      let parent = state.entities.find(entity => entity.id === screen.parentId);
      while (parent && !ids.has(parent.id)) { ids.add(parent.id); parent = state.entities.find(entity => entity.id === parent?.parentId); }
    }
    for (const id of [state.display.selection.countryId, state.display.selection.regionId, state.display.selection.storeId, state.display.selection.groupId]) if (id) ids.add(id);
    return Response.json({ entities: state.entities.filter(entity => ids.has(entity.id)), members: state.members.filter(member => ids.has(member.screenId) && ids.has(member.groupId)), display: state.display }, { headers });
  } catch (error) { return requestFailure(error); }
}
