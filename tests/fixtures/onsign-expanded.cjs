// Disposable API responses shared by the isolated server and API tests.
const page = (nodes, more = false, cursor = null) => ({ nodes, totalCount: more ? 2 : nodes.length, pageInfo: { hasNextPage: more, endCursor: cursor } });
const extended = {
  legacyId: "legacy-123", activeAlertCount: 1, lastSeenAgo: 0, lastSyncAgo: null,
  lastUpdate: "2026-10-20T06:30:00Z", lastUpdateAgo: 120,
  utcOffset: 14400, workingHoursStatus: "IN", estimatedLocalTime: "2026-10-20T10:32:00+04:00",
  tags: ["Sephora", "Store"], attrs: { "Asset number": "TEST-001", "Commissioned": false, "Count": 0 },
  associationDate: "2026-01-01T00:00:00Z", isUpdateLocked: false, updateRequested: false, updateReady: null,
  batteryLevel: 0, serialNumber: "TEST-SERIAL-123", webviewVersion: "120.0", spmVersion: null,
  workingHours: [{ weekDays: [0, 1, 2, 3, 4, 5, 6], startTime: "09:00:00", endTime: "22:00:00" }],
  workingExceptions: [{ date: "2026-12-25", ranges: [] }, { date: "2026-12-31", ranges: [{ startTime: "09:00:00", endTime: "18:00:00" }] }],
  pinnedNote: { text: "Test note <script>not executable</script> " + "LongAssetReference".repeat(15), createdAt: "2026-10-19T08:00:00Z", authorName: "Test administrator" },
  subscription: { planName: "Test signage plan", interval: 12, note: null, renewsOn: "2027-01-01", endsOn: null },
  location: { source: "GPS", latitude: 0, longitude: 0 },
  network: [{ name: "wlan0", mac: "00:00:5E:00:53:01", status: "ACTIVE", inet: "192.0.2.20", ssid: "Test Store Network", rssi: -58 }],
};
function sectionPlayer(id, query, variables) {
  if (query.includes("query PlayerMembership")) return { id, playerGroups: page([{ id: "group-1", name: "Test group", tags: ["Store"] }]) };
  if (query.includes("legacyId")) return { id, ...extended };
  if (query.includes("activeAlerts(")) return { id, activeAlerts: variables.after ? { ...page([{ id: "alert-2", name: "Content warning", lastNotification: "2026-10-20T07:00:00Z" }]), totalCount: 2 } : page([{ id: "alert-1", name: "Test alert", lastNotification: "2026-10-20T06:30:00Z" }], true, "next-alert") };
  if (query.includes("screenCaptures(")) return { id, screenCaptures: page([{ id: "capture-1", capturedAt: "2026-10-20T06:00:00Z", warning: "NONE", downloadURL: "https://example.test/saved-capture.png" }]) };
  if (query.includes("playerGroups(")) return { id, playerGroups: page([{ id: "group-1", name: "Test group", tags: ["Store"] }]) };
  return { id, loop: { id: "loop-1", kind: variables.loop, ...(variables.loop === "TRIGGER" ? { triggers: page([{ id: "trigger-1", name: "Test trigger", kind: "ON_DEMAND", isPaused: false, playLink: "https://example.test/do-not-execute", actions: [{ kind: "PLAY", duration: 10, content: { id: "media-1", name: "Test campaign", __typename: "Campaign", tags: [], attrs: {}, isPaused: false, restrictions: [] } }] }]) } : { items: { edges: [{ id: "item-1", position: 0, duration: 10, isPaused: false, restrictions: [], volume: 0, node: { id: "media-1", name: "Test image", __typename: "Content", tags: [], attrs: {}, isPaused: false, restrictions: [], width: 1920, height: 1080, downloadURL: "https://example.test/media.png" } }], totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null } } }) } };
}
module.exports = { extended, sectionPlayer, page };
