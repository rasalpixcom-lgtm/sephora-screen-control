import { createHash } from "node:crypto";
import { activeClientId } from "./client-workspace";
import { readClientOnSign, onSignCredentials } from "./client-onsign";
import { createOnSignClient } from "./onsign-api";

type Api = ReturnType<typeof createOnSignClient>;
const clients = new Map<string, { identity: string; api: Api }>();
async function workspaceApi() {
  const id = activeClientId();
  const credentials = onSignCredentials(id, await readClientOnSign(id));
  const identity = createHash("sha256").update(JSON.stringify(credentials)).digest("hex");
  const previous = clients.get(id);
  if (previous?.identity === identity) return previous.api;
  // Each instance captures one credential snapshot; in-flight requests cannot mix accounts.
  const api = createOnSignClient({ clientId: () => id, token: () => credentials.token,
    organizationId: () => credentials.organizationId, fetch: (...args) => fetch(...args), now: Date.now });
  clients.set(id, { identity, api });
  return api;
}
export const onSignApi = {
  configured: async () => (await workspaceApi()).configured(),
  list: async () => (await workspaceApi()).list(),
  details: async (...args: Parameters<Api["details"]>) => (await workspaceApi()).details(...args),
  section: async (...args: Parameters<Api["section"]>) => (await workspaceApi()).section(...args),
  filterValues: async () => (await workspaceApi()).filterValues(),
};
