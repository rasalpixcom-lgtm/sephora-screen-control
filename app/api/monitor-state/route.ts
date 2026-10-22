import { currentUser } from "@/lib/auth";
import { validMonitorKey } from "@/lib/monitor-access";
import { readState } from "@/lib/store";
import { screensFor } from "@/lib/screens";
import { requestFailure } from "@/lib/request";
import { getPool } from "@/lib/database";
import { onSignToken } from "@/lib/onsign-stream";
import { previewSourceFingerprint } from "@/lib/preview-incidents";
import { startPreviewHealthChecks } from "@/lib/preview-health-server";
import { monitorPreviewSummary } from "@/lib/monitor-preview-summary";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", Vary: "Authorization, Cookie" };
  try {
    const authorization = request.headers.get("authorization");
    const allowed = authorization !== null ? await validMonitorKey(authorization) : !!await currentUser(request.headers);
    if (!allowed) return Response.json({ error: "This monitor link is missing or inactive. Ask an Admin for the current link." }, { status: 401, headers });
    const state = await readState(undefined, false, false);
    // Expose only the current screens and their labels, without audit or accounts.
    const selected = screensFor(state, state.display.selection);
    const health = startPreviewHealthChecks();
    const previewSummary = monitorPreviewSummary(selected, state.entities, health.checker.snapshotFor(selected), health.inventoryError);
    const incidents = selected.length ? (await getPool().query<{ screen_id: string; source_fingerprint: string; started_at: Date }>(
      "SELECT screen_id, source_fingerprint, started_at FROM preview_incident WHERE resolved_at IS NULL AND screen_id = ANY($1::text[])",
      [selected.map(screen => screen.id)],
    )).rows : [];
    const previewIncidents: Record<string, string> = {};
    for (const incident of incidents) {
      const screen = selected.find(screen => screen.id === incident.screen_id);
      const token = screen?.liveUrl ? onSignToken(screen.liveUrl) : null;
      if (token && previewSourceFingerprint(token) === incident.source_fingerprint) previewIncidents[incident.screen_id] = incident.started_at.toISOString();
    }
    const ids = new Set(selected.map(screen => screen.id));
    for (const screen of selected) {
      let parent = state.entities.find(entity => entity.id === screen.parentId);
      while (parent && !ids.has(parent.id)) { ids.add(parent.id); parent = state.entities.find(entity => entity.id === parent?.parentId); }
    }
    for (const id of [state.display.selection.countryId, state.display.selection.regionId, state.display.selection.storeId, state.display.selection.groupId]) if (id) ids.add(id);
    return Response.json({ entities: state.entities.filter(entity => ids.has(entity.id)), members: state.members.filter(member => ids.has(member.screenId) && ids.has(member.groupId)), display: state.display, previewIncidents, previewSummary, previewObservedAt: new Date().toISOString() }, { headers });
  } catch (error) { return requestFailure(error); }
}
