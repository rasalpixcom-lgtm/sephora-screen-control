import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export type ClientWorkspace = { id: string; name: string };
const fallback: ClientWorkspace = Object.freeze({ id: "sephora", name: "Sephora" });
// Share one context across separately bundled Next.js route modules.
const shared = globalThis as typeof globalThis & { pixcomWorkspaceContext?: AsyncLocalStorage<ClientWorkspace> };
const context = shared.pixcomWorkspaceContext ??= new AsyncLocalStorage<ClientWorkspace>();
export const validClientId = (id: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 64;
export function activeWorkspace(): ClientWorkspace { return { ...(context.getStore() || fallback) }; }
export function activeClientId() { return activeWorkspace().id; }
export function activeClientName() { return activeWorkspace().name; }
export function clientDatabaseRole(id: string) {
  if (!validClientId(id)) throw new Error("Invalid client workspace.");
  return id === "sephora" ? "pixcom_sephora_runtime" : "pixcom_client_" + createHash("md5").update(id).digest("hex");
}
export function runWithWorkspace<T>(workspace: ClientWorkspace, work: () => T): T {
  if (!validClientId(workspace.id)) throw new Error("Invalid client workspace.");
  return context.run({ ...workspace }, work);
}
// Only call after validating an enabled account or a monitor capability.
export function selectWorkspace(workspace: ClientWorkspace) {
  const scope = context.getStore();
  if (!scope || !validClientId(workspace.id)) throw new Error("Workspace context is unavailable.");
  scope.id = workspace.id; scope.name = workspace.name;
}
// Each route/page gets a fresh holder before its first asynchronous operation.
export function withWorkspace<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
  return (...args) => runWithWorkspace(fallback, () => handler(...args));
}
export function inventoryLockSql() { return `SELECT pg_advisory_xact_lock(724017,hashtext('${activeClientId()}'))`; }
