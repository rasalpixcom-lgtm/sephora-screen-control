import { validClientId } from "./client-workspace";

type ScreenTarget = { clientId: string; screenId: string };
type ComplaintAlertSettings = { origin: string; token: string; monitorKeyHash: string } & (
  | { mode: "pilot"; sourceClientId: number; sourceStoreId: number; screenMap: Map<number, string> }
  | { mode: "all_clients"; screenMap: Map<string, ScreenTarget> }
);

function positiveId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) throw new Error("Invalid complaint alert ID setting.");
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new Error("Invalid complaint alert ID setting.");
  return id;
}

function mappingEntries(value: string): [string, unknown][] {
  let mappings: unknown;
  try { mappings = JSON.parse(value); }
  catch { throw new Error("Invalid complaint alert screen mapping."); }
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) throw new Error("Invalid complaint alert screen mapping.");
  return Object.entries(mappings);
}

function validScreenId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
}

export function complaintAlertSettings(env: NodeJS.ProcessEnv = process.env): ComplaintAlertSettings | null {
  if (env.COMPLAINT_ALERTS_ENABLED !== "true") return null;
  const configuredMode = env.COMPLAINT_ALERTS_MODE;
  const mode = configuredMode?.trim() ? configuredMode : "pilot";
  if (mode !== "pilot" && mode !== "all_clients") throw new Error("Invalid complaint alert mode.");

  let origin: URL;
  try { origin = new URL(env.COMPLAINT_ALERTS_ORIGIN ?? ""); }
  catch { throw new Error("Invalid complaint alert origin."); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("The complaint alert origin must be a bare HTTPS origin.");
  }

  const token = env.COMPLAINT_ALERTS_TOKEN ?? "";
  const pilotKeyHash = env.COMPLAINT_ALERTS_MONITOR_KEY_SHA256;
  const monitorKeyHash = (mode === "all_clients" ? env.COMPLAINT_ALERTS_ALL_CLIENTS_MONITOR_KEY_SHA256 : pilotKeyHash) ?? "";
  if (!/^[\x21-\x7e]{32,256}$/.test(token) || !/^[a-f0-9]{64}$/.test(monitorKeyHash)) {
    throw new Error("Invalid complaint alert credentials.");
  }
  const connection = { origin: origin.origin, token, monitorKeyHash };

  if (mode === "all_clients") {
    if (monitorKeyHash === pilotKeyHash?.trim().toLowerCase()) throw new Error("Use a separate monitor key for all-client complaint alerts.");
    const screenMap = new Map<string, ScreenTarget>();
    for (const [source, target] of mappingEntries(env.COMPLAINT_ALERTS_ALL_CLIENTS_SCREEN_MAP?.trim() || "{}")) {
      const sourceIds = source.split(":");
      if (sourceIds.length !== 3 || !target || typeof target !== "object" || Array.isArray(target) || Object.keys(target).length !== 2) {
        throw new Error("Invalid complaint alert screen mapping.");
      }
      sourceIds.forEach(positiveId);
      const { clientId, screenId } = target as Record<string, unknown>;
      if (typeof clientId !== "string" || !validClientId(clientId) || !validScreenId(screenId)) throw new Error("Invalid complaint alert screen mapping.");
      screenMap.set(source, { clientId, screenId });
    }
    return { ...connection, mode, screenMap };
  }

  const screenMap = new Map<number, string>();
  for (const [source, screen] of mappingEntries(env.COMPLAINT_ALERTS_SCREEN_MAP ?? "")) {
    if (!validScreenId(screen)) throw new Error("Invalid complaint alert screen mapping.");
    screenMap.set(positiveId(source), screen);
  }
  if (!screenMap.size) throw new Error("Map at least one screen to enable complaint alerts.");

  return {
    ...connection, mode, screenMap,
    sourceClientId: positiveId(env.COMPLAINT_ALERTS_SOURCE_CLIENT_ID),
    sourceStoreId: positiveId(env.COMPLAINT_ALERTS_SOURCE_STORE_ID),
  };
}
