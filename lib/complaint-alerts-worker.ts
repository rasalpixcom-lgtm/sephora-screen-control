import { collectComplaintAlerts, type ComplaintAlertEvent } from "./complaint-alerts-collector";
import { complaintAlertSettings } from "./complaint-alerts-settings";
import { getPool, ServerDatabase } from "./database";

const shared = globalThis as typeof globalThis & { pixcomComplaintAlertWorker?: boolean };
const intervalMs = 5000;
const maximumBackoffMs = 60000;

async function saveComplaintAlert(alert: ComplaintAlertEvent) {
  await new ServerDatabase(getPool("sephora")).transaction(async db => {
    // Assign cursor positions in commit order, including across server processes.
    await db.prepare("SELECT pg_advisory_xact_lock(724023)").run();
    await db.prepare(`INSERT INTO complaint_alerts (
      event_id, complaint_id, occurred_at, priority, source_client_id, client_name,
      source_store_id, store_name, source_screen_id, screen_name, issue_label
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (event_id) DO NOTHING`)
      .bind(alert.eventId, alert.complaintId, alert.createdAt, alert.priority, alert.sourceClientId, alert.clientName,
        alert.sourceStoreId, alert.storeName, alert.sourceScreenId, alert.screenName, alert.issueLabel).run();
  });
}

export function startComplaintAlertWorker() {
  if (shared.pixcomComplaintAlertWorker) return;
  let settings;
  try { settings = complaintAlertSettings(); }
  catch { console.error("Complaint alerts could not start. Check the integration settings."); return; }
  if (!settings) return;
  shared.pixcomComplaintAlertWorker = true;

  const config = settings;
  let delay = intervalMs;
  const tick = async () => {
    let failed = true;
    try { ({ failed } = await collectComplaintAlerts(config, { fetch: globalThis.fetch, save: saveComplaintAlert })); }
    catch { /* Retry without logging credentials or upstream responses. */ }
    if (failed && delay === intervalMs) console.warn("Complaint alerts are delayed. The server will retry.");
    delay = failed ? Math.min(delay * 2, maximumBackoffMs) : intervalMs;
    setTimeout(tick, delay).unref();
  };
  void tick();
}
