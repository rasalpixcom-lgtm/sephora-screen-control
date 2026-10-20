export type OnSignPlayerOption = { id: string; name: string };
export type OnSignPlayer = OnSignPlayerOption & {
  isConnected: boolean | null; lastSeen: string | null; lastSync: string | null;
  syncProgress: number | null; errorCount: number | null; warningCount: number | null;
  model: string | null; version: string | null; osVersion: string | null;
  timezone: string | null; signalStrength: number | null;
  isInMaintenance: boolean | null; isDetached: boolean | null;
  network: { name: string | null; inet: string | null; ssid: string | null; status: string | null; rssi: number | null }[];
};
export type OnSignDetails = { player: OnSignPlayer; fetchedAt: string };

export type OnSignValue = string | number | boolean | null | OnSignValue[] | { [key: string]: OnSignValue };
export const onSignSections = ["extended", "alerts", "captures", "groups", "content"] as const;
export type OnSignSection = typeof onSignSections[number];
export const onSignLoops = ["PRIMARY", "FALLBACK", "WELCOME", "DYNAMIC", "SECONDARY", "TRIGGER"] as const;
export type OnSignLoop = typeof onSignLoops[number];
export type OnSignSectionResult = {
  section: OnSignSection; fetchedAt: string; values: Record<string, OnSignValue> | null;
  nodes: Record<string, OnSignValue>[]; totalCount: number | null;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export function validOnSignPlayerId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(value);
}
