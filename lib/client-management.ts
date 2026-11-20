import { getPool } from "./database";
import { RequestError } from "./request";

export type ManagedClient = { id: string; name: string; logoKey: string | null; logoVersion: string | null; backgroundKey: string | null; backgroundVersion: string | null };
export type ClientManagementData = { clients: ManagedClient[] };
export async function listManagedClients(): Promise<ClientManagementData> {
  const clients = await getPool("sephora").query<ManagedClient>(`SELECT c.id,c.name,CASE WHEN l.image IS NOT NULL THEN l.version END AS "logoKey",l.version AS "logoVersion",CASE WHEN b.image IS NOT NULL THEN b.version END AS "backgroundKey",b.version AS "backgroundVersion" FROM clients c LEFT JOIN client_logos l ON l.client_id=c.id LEFT JOIN client_backgrounds b ON b.client_id=c.id WHERE c.archived_at IS NULL ORDER BY lower(c.name),c.id`);
  return { clients: clients.rows };
}
export function clientNameInput(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || [...name].length > 120 || /[\u0000-\u001f\u007f]/.test(name)) throw new RequestError("Enter a client name between 1 and 120 characters.");
  return name;
}
export function clientManagementInput(body: Record<string, unknown>) {
  if (body.action !== "create") throw new RequestError("Unknown client action.");
  const name = clientNameInput(body.name);
  return { clientId: `client-${crypto.randomUUID()}`, name };
}
