import { clientIntegrations } from "./client-integrations";
import { getPool } from "./database";
import { decryptIntegrationToken } from "./integration-secret";
import { RequestError } from "./request";

export type OnSignSettings = {
  clientId: string; version: string | null; mode: "custom" | "disabled" | "server";
  configured: boolean; organizationId: string; hasToken: boolean;
};
type Row = { version: string; mode: OnSignSettings["mode"]; organization_id: string | null; encrypted_token: string | null };
export async function readClientOnSign(clientId: string) {
  const result = await getPool("sephora").query<Row & { id: string }>(`
    SELECT c.id,s.version,s.mode,s.organization_id,s.encrypted_token FROM clients c
    LEFT JOIN client_onsign_settings s ON s.client_id=c.id
    WHERE c.id=$1 AND c.archived_at IS NULL`, [clientId]);
  if (!result.rows[0]) throw new RequestError("Client not found.", 404);
  return result.rows[0];
}
export function onSignStatus(clientId: string, row: Row | null): OnSignSettings {
  const mode = row?.mode || "server";
  const fallback = mode === "server" ? clientIntegrations(clientId).onsign : undefined;
  const hasToken = mode === "custom" ? !!row?.encrypted_token : !!fallback?.token?.trim();
  return { clientId, mode, version: row?.version || null, configured: hasToken,
    hasToken, organizationId: mode === "custom" ? row?.organization_id || "" : fallback?.organizationId?.trim() || "" };
}
export function onSignCredentials(clientId: string, row: Row | null) {
  if (row?.mode === "disabled") return {};
  if (row?.mode === "custom") return {
    token: decryptIntegrationToken(clientId, row.encrypted_token!), organizationId: row.organization_id || undefined,
  };
  return clientIntegrations(clientId).onsign || {};
}
