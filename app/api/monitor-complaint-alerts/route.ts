import { timingSafeEqual } from "node:crypto";
import { complaintAlertSettings } from "@/lib/complaint-alerts-settings";
import { getPool } from "@/lib/database";
import { monitorKeyHash, validCommonMonitorKey } from "@/lib/monitor-access";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization, X-Monitor-Alert-Key" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

type ComplaintRow = {
  cursor: string;
  eventId: string;
  priority: string;
  clientName: string;
  storeName: string;
  screenName: string;
  issueLabel: string;
  mappingKey: string;
};

function validCursor(cursor: string) {
  return /^(0|[1-9]\d{0,18})$/.test(cursor) && (cursor.length < 19 || cursor <= "9223372036854775807");
}

export async function GET(request: Request) {
  try {
    const settings = complaintAlertSettings();
    if (!settings) return fail("Complaint alerts are unavailable.", 404);
    const authorization = request.headers.get("authorization");
    const alertKey = request.headers.get("x-monitor-alert-key");
    if (!alertKey || !/^[a-f0-9]{64}$/.test(alertKey) ||
        authorization === `Bearer ${alertKey}` ||
        !timingSafeEqual(Buffer.from(monitorKeyHash(alertKey), "hex"), Buffer.from(settings.monitorKeyHash, "hex")) ||
        !await validCommonMonitorKey(authorization)) {
      return fail("Inactive complaint alert link.", 401);
    }

    const params = new URL(request.url).searchParams;
    const after = params.get("after");
    if (params.size !== (after === null ? 0 : 1) || (after !== null && !validCursor(after))) {
      return fail("Invalid complaint alert cursor.", 400);
    }
    const pool = getPool("sephora");
    const { rows: [wall] } = await pool.query<{ voiceEnabled: boolean }>(
      `SELECT complaint_voice_enabled AS "voiceEnabled" FROM common_monitor_display WHERE id='main'`,
    );
    const voiceEnabled = wall?.voiceEnabled ?? false;
    const conditions: string[] = [];
    const filters: (string | number | number[])[] = [];
    let targets: ReadonlyMap<string, { clientId: string; screenId: string }>;
    if (settings.mode === "pilot") {
      const { rows: screens } = await pool.query<{ id: string }>(
        `SELECT e.id FROM entities e JOIN clients c ON c.id=e.client_id
         WHERE e.client_id='sephora' AND e.type='screen' AND c.archived_at IS NULL AND e.id=ANY($1::text[])`,
        [[...settings.screenMap.values()]],
      );
      const screenIds = new Set(screens.map(screen => screen.id));
      const mappings = [...settings.screenMap].filter(([, screenId]) => screenIds.has(screenId));
      targets = new Map(mappings.map(([sourceId, screenId]) => [
        `${settings.sourceClientId}:${settings.sourceStoreId}:${sourceId}`, { clientId: "sephora", screenId },
      ]));
      conditions.push("source_client_id=$1", "source_store_id=$2", "source_screen_id=ANY($3::bigint[])");
      filters.push(settings.sourceClientId, settings.sourceStoreId, mappings.map(([sourceId]) => sourceId));
    } else {
      targets = settings.screenMap;
    }

    if (after === null) {
      // A newly opened monitor starts at the live end without replaying past alerts.
      const scope = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const { rows: [tail] } = await pool.query<{ cursor: string }>(`SELECT COALESCE(max(id),0)::text AS cursor FROM complaint_alerts ${scope}`, filters);
      return Response.json({ alerts: [], cursor: tail.cursor, voiceEnabled }, { headers });
    }
    filters.push(after);
    conditions.push(`id>$${filters.length}::bigint`);
    const { rows } = await pool.query<ComplaintRow>(
      `SELECT id::text AS cursor,event_id AS "eventId",priority,client_name AS "clientName",store_name AS "storeName",
        screen_name AS "screenName",issue_label AS "issueLabel",
        concat_ws(':',source_client_id,source_store_id,source_screen_id) AS "mappingKey"
        FROM complaint_alerts WHERE ${conditions.join(" AND ")} ORDER BY id LIMIT 50`,
      filters,
    );
    const alerts = rows.map(({ mappingKey, ...alert }) => {
      const target = targets.get(mappingKey);
      return target ? { ...alert, target } : alert;
    });
    return Response.json({ alerts, cursor: alerts.at(-1)?.cursor ?? after, voiceEnabled }, { headers });
  } catch (error) { return requestFailure(error); }
}
