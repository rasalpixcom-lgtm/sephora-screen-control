import { activeClientId, runWithWorkspace } from "./client-workspace";
import { getPool } from "./database";

// A worker's timer retains its original request context. Refresh the display
// name for each run so renaming takes effect without restarting its timer.
export async function withCurrentWorkerWorkspace<T>(work: () => Promise<T>) {
  const client = (await getPool().query<{ id: string; name: string }>(
    "SELECT id,name FROM clients WHERE id=$1 AND archived_at IS NULL", [activeClientId()],
  )).rows[0];
  if (client) return runWithWorkspace(client, work);
}
