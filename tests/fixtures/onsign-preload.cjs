// Test-process-only transport. Never imported by application code.
const original = globalThis.fetch;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node loads this fixture with --require before the standalone server.
const { sectionPlayer } = require("./onsign-expanded.cjs");
const longPlayers = process.env.ONSIGN_TEST_LONG_NAMES === "true" ? Array.from({ length: 30 }, (_, index) => ({ id: `long-player-${index}`, name: `Sephora long-name player ${String(index).padStart(2, "0")} - ${"Mall location and display description - ".repeat(5)}${"UnbrokenPlayerName".repeat(12)}` })) : [];
globalThis.fetch = async (url, options) => {
  if (String(url) !== "https://api.onsign.tv/graphql") return original(url, options);
  if (options.headers.Authorization !== "token onsign-test-token") throw new Error("Unexpected test credentials");
  const { query, variables } = JSON.parse(options.body);
  if (!query.startsWith("query ")) throw new Error("Unexpected write request");
  if (query.includes("query Organizations")) return Response.json({ data: { organizations: {
    nodes: variables.after ? [{ id: "sephora-org", name: "Sephora" }] : [{ id: "other-org", name: "Other Brand" }],
    pageInfo: { hasNextPage: !variables.after, endCursor: variables.after ? "last-org" : "next-org" },
  } } });
  if (!query.includes("organizations(first: 1, ids: [$organizationId])") || variables.organizationId !== "sephora-org") throw new Error("Test request must explicitly select Sephora");
  if (query.includes("query Players")) return Response.json({ data: { organizations: { nodes: [{ id: "sephora-org", players: {
    nodes: variables.after ? [{ id: "player-2", name: "Abu Dhabi Player" }] : [{ id: "player-1", name: "Dubai Player" }, ...longPlayers],
    pageInfo: { hasNextPage: !variables.after, endCursor: variables.after ? "last" : "next" },
  } }] } } });
  const longPlayer = longPlayers.find(player => player.id === variables.id);
  if (query.includes("query PlayerSection") || query.includes("query PlayerMembership")) {
    const allowed = variables.id === "player-1" || variables.id === "player-2" || longPlayer;
    if (variables.groupId) return Response.json({ data: { organizations: { nodes: [{ id: "sephora-org", playerGroup: sectionPlayer(variables.groupId, query, variables) }] } } });
    return Response.json({ data: { organizations: { nodes: [{ id: "sephora-org", player: allowed ? sectionPlayer(variables.id, query, variables) : null }] } } });
  }
  const player = variables.id === "player-1" || variables.id === "player-2" || longPlayer ? {
    id: variables.id, name: longPlayer?.name || (variables.id === "player-1" ? "Dubai Player" : "Abu Dhabi Player"), isConnected: variables.id === "player-1",
    lastSeen: "2026-10-19T08:30:00Z", lastSync: "2026-10-19T08:00:00Z", syncProgress: 100, errorCount: 0, warningCount: 2,
    model: "Test signage player", version: "Android 10.3.5", osVersion: "Android 10", timezone: "Asia/Dubai", signalStrength: 75,
    isInMaintenance: false, isDetached: false,
    network: [{ name: "wlan0", inet: "192.0.2.20", ssid: "Test Store Network", rssi: -58, status: "ACTIVE" }],
  } : null;
  return Response.json({ data: { organizations: { nodes: [{ id: "sephora-org", player }] } } });
};
