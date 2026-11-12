import type { OnSignFilterPlayer } from "./onsign-api-shared";

export const onSignFilterLabels = { connectivity: "Connectivity", ssid: "Wi-Fi network (SSID)", os: "OS version" } as const;
export type OnSignScreenFilterKey = keyof typeof onSignFilterLabels;
export type OnSignScreenFilters = Record<OnSignScreenFilterKey, string>;
export const emptyOnSignScreenFilters = (): OnSignScreenFilters => ({ connectivity: "", ssid: "", os: "" });
export const onSignFilterValueLabel = (value: string) => value === "@unlinked" ? "No OnSign player linked" : value === "@unknown" ? "Not reported" : value.slice(2);
export function validOnSignScreenFilters(filters: OnSignScreenFilters) {
  return Object.entries(filters).every(([key, value]) => value === "" || value === "@unlinked" || value === "@unknown" || (value.startsWith("v:") && value.length > 2 && value.length <= 514 && !/[\u0000-\u001f\u007f]/.test(value) && (key !== "connectivity" || ["v:Connected", "v:Disconnected"].includes(value))));
}
export function onSignScreenValues(playerId: string | null | undefined, player: OnSignFilterPlayer | undefined, key: OnSignScreenFilterKey): string[] {
  if (!playerId) return ["@unlinked"];
  if (!player) return ["@unknown"];
  if (key === "connectivity") return [player.isConnected === null ? "@unknown" : player.isConnected ? "v:Connected" : "v:Disconnected"];
  if (key === "os") return [player.osVersion ? "v:" + player.osVersion : "@unknown"];
  return player.ssids.length ? player.ssids.map(value => "v:" + value) : ["@unknown"];
}
export function matchesOnSignScreen(screen: { onsignPlayerId?: string | null }, filters: OnSignScreenFilters, players: Map<string, OnSignFilterPlayer>): boolean {
  return (Object.keys(onSignFilterLabels) as OnSignScreenFilterKey[]).every(key => !filters[key] || onSignScreenValues(screen.onsignPlayerId, players.get(screen.onsignPlayerId || ""), key).includes(filters[key]));
}
