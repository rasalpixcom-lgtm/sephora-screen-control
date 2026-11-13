import { getPool } from "./database";
import { clientDatabaseRole, runWithWorkspace, validClientId } from "./client-workspace";
import { startPreviewHealthChecks } from "./preview-health-server";
import { startEmailAlertWorker } from "./email-alert-server";
import { startWhatsAppAlertWorker } from "./whatsapp-alert-server";
const shared = globalThis as typeof globalThis & { pixcomClientWorkerDiscovery?: boolean };
export function startClientWorkers() {
  if (shared.pixcomClientWorkerDiscovery) return;
  shared.pixcomClientWorkerDiscovery = true;
  const tick = async () => {
    try {
      const clients = (await getPool("sephora").query<{ id: string; name: string }>("SELECT id,name FROM clients WHERE archived_at IS NULL ORDER BY id")).rows;
      for (const client of clients) {
        if (!validClientId(client.id)) continue;
        const ready = await getPool("sephora").query("SELECT 1 FROM pg_roles WHERE rolname=$1 AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit AND NOT rolreplication", [clientDatabaseRole(client.id)]);
        if (ready.rowCount) runWithWorkspace(client, () => { startPreviewHealthChecks(); startEmailAlertWorker(); startWhatsAppAlertWorker(); });
      }
    } catch { console.error("Client workers unavailable"); }
    finally { const timer = setTimeout(tick, 60000); timer.unref(); }
  };
  void tick();
}
