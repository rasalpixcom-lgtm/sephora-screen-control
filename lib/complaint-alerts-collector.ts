export type ComplaintAlertEvent = {
  eventId: string;
  complaintId: number;
  createdAt: string;
  priority: "low" | "medium" | "high";
  sourceClientId: number;
  clientName: string;
  sourceStoreId: number;
  storeName: string;
  sourceScreenId: number;
  screenName: string;
  issueLabel: string;
};

type CollectorConfig = { origin: string; token: string } & (
  | { mode: "pilot"; sourceClientId: number; sourceStoreId: number }
  | { mode: "all_clients" }
);
type CollectorDependencies = { fetch: typeof fetch; save: (alert: ComplaintAlertEvent) => Promise<void> };

const alertsPath = "/api/integrations/screen-control/alerts";
const maxBatchSize = 50;
const maxResponseBytes = 256 * 1024;
const requestTimeoutMs = 5000;
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !utcTimestampPattern.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

function label(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed && trimmed.length <= 255 && !/[\u0000-\u001f\u007f]/u.test(trimmed) ? trimmed : null;
}

function parseAlert(value: unknown, config: CollectorConfig): ComplaintAlertEvent | null {
  const row = record(value);
  if (!row) return null;
  const { event_id: eventId, complaint_id: complaintId, created_at: createdAt, priority,
    client_id: sourceClientId, store_id: sourceStoreId, screen_id: sourceScreenId } = row;
  if (typeof eventId !== "string" || eventId.length !== 36 || !uuidPattern.test(eventId) || !positiveId(complaintId) || !validTimestamp(createdAt)
    || (priority !== "low" && priority !== "medium" && priority !== "high") || !positiveId(sourceScreenId)
    || !positiveId(sourceClientId) || !positiveId(sourceStoreId)) return null;
  if (config.mode === "pilot" && (sourceClientId !== config.sourceClientId || sourceStoreId !== config.sourceStoreId)) return null;

  const clientName = label(row.client_name);
  const storeName = label(row.store_name);
  const screenName = label(row.screen_name);
  const issueLabel = label(row.issue_label);
  if (!clientName || !storeName || !screenName || !issueLabel) return null;
  return { eventId, complaintId, createdAt, priority, sourceClientId, clientName, sourceStoreId, storeName, sourceScreenId, screenName, issueLabel };
}

async function readBatch(response: Response): Promise<unknown[]> {
  if (response.status !== 200 || response.redirected) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Complaint alert request failed.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Complaint alert response is empty.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let content = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxResponseBytes) throw new Error("Complaint alert response is too large.");
      content += decoder.decode(value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const payload = record(JSON.parse(content + decoder.decode()));
  if (!Array.isArray(payload?.alerts) || payload.alerts.length > maxBatchSize) throw new Error("Complaint alert response is invalid.");
  return payload.alerts;
}

export async function collectComplaintAlerts(config: CollectorConfig, dependencies: CollectorDependencies): Promise<{ failed: boolean }> {
  if (typeof config.token !== "string" || !config.token || config.token.length > 4096 || /[^!-~]/.test(config.token)
    || config.mode !== "all_clients" && (config.mode !== "pilot" || !positiveId(config.sourceClientId) || !positiveId(config.sourceStoreId))) return { failed: true };
  let alertsUrl: URL;
  let alerts: unknown[];
  const headers = { Authorization: `Bearer ${config.token}`, Accept: "application/json" };
  try {
    const origin = new URL(config.origin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return { failed: true };
    alertsUrl = new URL(alertsPath, origin);
    alerts = await readBatch(await dependencies.fetch(alertsUrl, {
      method: "GET", headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs),
    }));
  } catch {
    return { failed: true };
  }

  const ackUrl = new URL(`${alertsPath}/ack`, alertsUrl);
  let failed = false;
  for (const value of alerts) {
    const alert = parseAlert(value, config);
    if (!alert) {
      failed = true;
      continue;
    }
    try {
      // Saving an existing event also succeeds, so a failed acknowledgment can be retried safely.
      await dependencies.save(alert);
    } catch {
      // The feed is oldest first. Leave later events pending until this one is saved.
      return { failed: true };
    }
    try {
      const response = await dependencies.fetch(ackUrl, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ event_id: alert.eventId }),
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (response.status !== 204 || response.redirected) {
        void response.body?.cancel().catch(() => {});
        failed = true;
      }
    } catch {
      failed = true;
    }
  }
  return { failed };
}
