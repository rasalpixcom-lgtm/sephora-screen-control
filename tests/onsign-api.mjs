import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = new URL("../.server-runtime/onsign-api-test.cjs", import.meta.url);
await fs.mkdir(new URL("../.server-runtime/", import.meta.url), { recursive: true });
await build({ entryPoints: ["lib/onsign-api.ts"], outfile: fileURLToPath(output), platform: "node", format: "cjs", bundle: true });
const { createOnSignClient, OnSignApiError } = createRequire(import.meta.url)(fileURLToPath(output));
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
async function rejects(work, status, label) { await assert.rejects(work, error => error instanceof OnSignApiError && error.status === status && !error.message.includes("private-token"), label); checks++; }
const fixture = overrides => ({ id: "player-1", name: "Dubai player", isConnected: false, lastSeen: "2026-10-19T07:00:00Z", lastSync: null, syncProgress: 0, errorCount: 0, warningCount: 2, model: null, version: "Android 10.3.5", osVersion: "Android 10", timezone: "Asia/Dubai", signalStrength: 0, isInMaintenance: true, isDetached: false, network: [{ name: "wlan0", status: "ACTIVE", inet: "192.0.2.10", ssid: "Store Wi-Fi", rssi: -65 }], ...overrides });
const organizations = (nodes, hasNextPage = false, endCursor = null) => Response.json({ data: { organizations: { nodes, pageInfo: { hasNextPage, endCursor } } } });
function harness(handler, organizationHandler = () => organizations([{ id: "other-org", name: "Other Brand" }, { id: "sephora-org", name: "Sephora" }])) {
  let time = Date.parse("2026-10-19T08:00:00Z"), credential = "private-token", organizationId = "", calls = [], organizationCalls = [];
  const client = createOnSignClient({ token: () => credential, organizationId: () => organizationId, now: () => time, fetch: async (url, options) => {
    const body = JSON.parse(options.body);
    check(url === "https://api.onsign.tv/graphql" && options.redirect === "error", "fixed HTTPS endpoint prevents redirecting credentials");
    check(options.headers.Authorization === `token ${credential}` && options.cache === "no-store", "token authentication is server-side and uncached by HTTP");
    check(body.query.trim().startsWith("query ") && !body.query.includes("mutation"), "only read queries are sent");
    check(options.signal instanceof AbortSignal, "every upstream request has a timeout signal");
    if (body.query.includes("query Organizations")) { organizationCalls.push(body); return organizationHandler(body, organizationCalls.length); }
    check(body.query.includes("organizations(first: 1, ids: [$organizationId])") && !body.query.includes("{ organization {"), "player requests explicitly scope the organization instead of using the account default");
    calls.push(body);
    return handler(body, calls.length);
  } });
  return { client, calls, organizationCalls, advance: ms => { time += ms; }, token: value => { credential = value; }, organization: value => { organizationId = value; } };
}
const ok = (organization, id = "sephora-org") => Response.json({ data: { organizations: { nodes: [{ id, ...organization }] } } });
const pages = harness(({ variables }) => variables.after === null ? ok({ players: { nodes: [{ id: "2", name: "Zebra" }], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } } }) : ok({ players: { nodes: [{ id: "1", name: "Alpha" }, { id: "2", name: "Zebra" }], pageInfo: { hasNextPage: false, endCursor: "cursor-2" } } }));
const list = await pages.client.list();
check(list.players.length === 2 && list.players[0].name === "Alpha", "pagination collects all players, removes duplicates and sorts by name");
check(pages.calls.every(call => call.variables.organizationId === "sephora-org"), "all player pages target Sephora even when another organization is listed first");
check(pages.organizationCalls.length === 1, "organization lookup is reused across player pages");
await pages.client.list(); check(pages.calls.length === 2, "player list is cached for five minutes");
pages.advance(300001); await pages.client.list(); check(pages.calls.length === 4, "expired list is refreshed");
const single = harness(() => ok({ player: fixture() }));
const details = await single.client.details("player-1");
check(details.player.isConnected === false && details.player.syncProgress === 0 && details.player.errorCount === 0, "false and zero values are preserved");
check(details.player.model === null && details.player.lastSync === null, "missing optional fields remain unavailable");
check(details.player.network[0].inet === "192.0.2.10" && details.player.network[0].rssi === -65, "network details are mapped");
check(details.fetchedAt === "2026-10-19T08:00:00.000Z", "successful snapshots include the actual fetch time");
await single.client.details("player-1"); check(single.calls.length === 1, "details cache avoids repeated upstream calls");
single.advance(60001); await single.client.details("player-1"); check(single.calls.length === 2, "details expire after one minute");
single.token("rotated-token"); await single.client.details("player-1"); check(single.calls.length === 3, "rotating the token clears prior account data");
check(single.organizationCalls.length === 2, "rotating the token also revalidates the selected organization");
for (const id of ["", "bad id", "x\n", "a".repeat(257)]) await rejects(() => single.client.details(id), 400, "invalid player identifiers are rejected");
single.token(""); check(!single.client.configured(), "configuration status handles missing token");
await rejects(() => single.client.details("player-1"), 503, "missing token fails without a request");
const unknown = harness(() => ok({ player: null })); await rejects(() => unknown.client.details("player-1"), 404, "deleted or inaccessible player is reported clearly");
const partial = harness(() => Response.json({ data: { organization: { player: fixture() } }, errors: [{ message: "private-token secret upstream detail" }] }));
await rejects(() => partial.client.details("player-1"), 503, "partial GraphQL results are rejected and upstream errors redacted");
await rejects(() => partial.client.details("player-1"), 503, "failures are temporarily cached"); check(partial.calls.length === 1, "failures do not hammer OnSign");
partial.advance(30001); await rejects(() => partial.client.details("player-1"), 503, "failed calls are retried after backoff"); check(partial.calls.length === 2, "backoff expires");
for (const status of [401, 403, 429, 500]) { const test = harness(() => new Response("private-token", { status })); await rejects(() => test.client.list(), status === 429 ? 429 : 503, `HTTP ${status} is handled without exposing raw output`); }
for (const response of [() => new Response("not JSON"), () => Response.json({}), () => ok({ player: fixture({ id: "another-player" }) }), () => ok({ player: "invalid" })]) { const test = harness(response); await rejects(() => test.client.details("player-1"), 503, "malformed upstream responses are rejected"); }
const timeout = harness(() => { throw new DOMException("private-token", "TimeoutError"); }); await rejects(() => timeout.client.list(), 503, "timeouts become safe service errors");
const loop = harness(() => ok({ players: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "repeated" } } })); await rejects(() => loop.client.list(), 503, "pagination cursor loops cannot run indefinitely");
let release;
const concurrent = harness(() => new Promise(resolve => { release = () => resolve(ok({ player: fixture() })); }));
const first = concurrent.client.details("player-1"), second = concurrent.client.details("player-1");
await new Promise(resolve => setImmediate(resolve));
check(concurrent.calls.length === 1 && concurrent.organizationCalls.length === 1, "concurrent detail requests share organization discovery and the upstream request"); release(); await Promise.all([first, second]);

const laterPage = harness(() => ok({ player: fixture() }), ({ variables }) => variables.after === null ? organizations([{ id: "other-org", name: "Other Brand" }], true, "next-org-page") : organizations([{ id: "sephora-org", name: "Sephora" }]));
await laterPage.client.details("player-1");
check(laterPage.organizationCalls.length === 2 && laterPage.calls[0].variables.organizationId === "sephora-org", "Sephora is found on a later organization page");
const noMatch = harness(() => { throw new Error("must not fetch players"); }, () => organizations([{ id: "other-org", name: "Sephora Other Brand" }]));
await rejects(() => noMatch.client.list(), 503, "partial organization names cannot match Sephora");
check(noMatch.calls.length === 0, "no default organization fallback when Sephora is absent");
const duplicate = harness(() => { throw new Error("must not fetch players"); }, ({ variables }) => organizations([{ id: variables.after ? "duplicate-org" : "sephora-org", name: "Sephora" }], !variables.after, "next-org-page"));
await rejects(() => duplicate.client.details("player-1"), 503, "duplicate Sephora names across pages require an explicit ID");
check(duplicate.calls.length === 0, "ambiguous names do not expose a player's details");
const organizationLoop = harness(() => ok({}), () => organizations([], true, "repeated"));
await rejects(() => organizationLoop.client.list(), 503, "organization pagination loops are rejected");
const inaccessible = harness(() => Response.json({ data: { organizations: { nodes: [] } } }));
await rejects(() => inaccessible.client.details("player-1"), 503, "inaccessible selected organization fails without fallback");
const mismatched = harness(() => ok({ player: fixture() }, "other-org"));
await rejects(() => mismatched.client.details("player-1"), 503, "unexpected organization IDs are rejected");
const tooMany = harness(() => Response.json({ data: { organizations: { nodes: [{ id: "sephora-org", player: fixture() }, { id: "other-org", player: fixture() }] } } }));
await rejects(() => tooMany.client.details("player-1"), 503, "unexpected multiple scoped organizations are rejected");
const pinned = harness(({ variables }) => ok({ player: fixture() }, variables.organizationId), () => { throw new Error("pinned IDs must not depend on organization names"); });
pinned.organization("sephora-stable-id"); await pinned.client.details("player-1");
check(pinned.organizationCalls.length === 0 && pinned.calls[0].variables.organizationId === "sephora-stable-id", "explicit ID skips discovery and remains usable after renaming");
pinned.organization("replacement-id"); await pinned.client.details("player-1");
check(pinned.calls.length === 2 && pinned.calls[1].variables.organizationId === "replacement-id", "changing organization ID invalidates cached player details");
pinned.organization("invalid id"); await rejects(() => pinned.client.list(), 503, "invalid configured organization IDs are rejected before requests");
const deletedPlayer = harness(() => ok({ player: null }));
await rejects(() => deletedPlayer.client.details("other-brand-player"), 404, "players outside Sephora are not returned even if token can access other brands");
const normalized = harness(() => ok({ player: fixture() }), () => organizations([{ id: "sephora-org", name: "  sePHora  " }]));
await normalized.client.details("player-1");
check(normalized.calls[0].variables.organizationId === "sephora-org", "whole-name matching tolerates letter case and surrounding spaces");
for (const response of [() => Response.json({ errors: [{ message: "private-token" }] }), () => Response.json({ data: { organizations: { nodes: null, pageInfo: { hasNextPage: false } } } }), () => organizations([{ id: "bad id", name: "Sephora" }])]) {
  const failedDiscovery = harness(() => { throw new Error("must not fetch players"); }, response);
  await rejects(() => failedDiscovery.client.list(), 503, "invalid organization discovery results fail safely");
  check(failedDiscovery.calls.length === 0, "discovery failures never fall back to default players");
}
const sharedDiscovery = harness(({ query }) => query.includes("query Players") ? ok({ players: { nodes: [{ id: "player-1", name: "Dubai player" }], pageInfo: { hasNextPage: false } } }) : ok({ player: fixture() }));
await Promise.all([sharedDiscovery.client.details("player-1"), sharedDiscovery.client.list()]);
check(sharedDiscovery.organizationCalls.length === 1, "simultaneous list and detail requests share organization discovery");
const { extended, sectionPlayer, page } = createRequire(import.meta.url)("./fixtures/onsign-expanded.cjs");
const expanded = harness(({ query, variables }) => ok({ [variables.groupId ? "playerGroup" : "player"]: sectionPlayer(variables.groupId || variables.id, query, variables) }));
const extra = await expanded.client.section("player-1", "extended");
check(extra.values.serialNumber === extended.serialNumber && extra.values.batteryLevel === 0 && extra.values.isUpdateLocked === false, "expanded fields preserve identity, zero and false values");
check(extra.values.location.latitude === 0 && extra.values.network[0].mac === extended.network[0].mac, "zero coordinates and MAC addresses are returned");
check(extra.values.workingExceptions[0].ranges.length === 0 && extra.values.subscription.endsOn === null, "empty schedule exceptions and unknown subscription dates remain distinct");
const firstAlerts = await expanded.client.section("player-1", "alerts");
check(firstAlerts.pageInfo.hasNextPage && firstAlerts.nodes[0].id === "alert-1", "related lists preserve pagination");
const nextAlerts = await expanded.client.section("player-1", "alerts", firstAlerts.pageInfo.endCursor);
check(nextAlerts.nodes[0].id === "alert-2" && !nextAlerts.pageInfo.hasNextPage, "subsequent pages use the supplied cursor");
for (const section of ["captures", "groups", "content"]) check((await expanded.client.section("player-1", section)).nodes.length === 1, `${section} are loaded separately`);
check(expanded.calls.find(call => call.variables.loop === "PRIMARY" && call.query.includes("loop(name:")).query.includes("edges { id position"), "published item settings come from GraphQL edges rather than unsupported nodes");
const triggers = await expanded.client.section("player-1", "content", null, "TRIGGER");
check(triggers.nodes[0].actions[0].kind === "PLAY", "trigger actions are read as metadata without executing them");
const beforeCache = expanded.calls.length;
await expanded.client.section("player-1", "extended");
check(expanded.calls.length === beforeCache, "expanded sections reuse their one-minute cache");
const groupContent = await expanded.client.section("player-1", "content", null, "PRIMARY", "group-1");
check(groupContent.nodes.length === 1 && expanded.calls.at(-2).query.includes("PlayerMembership"), "group content validates linked-player membership before querying the group");
await rejects(() => expanded.client.section("player-1", "content", null, "PRIMARY", "foreign-group"), 404, "unrelated groups cannot expose their content");
const lateGroup = harness(({ query, variables }) => query.includes("PlayerMembership") ? ok({ player: { id: variables.id, playerGroups: variables.after ? page([{ id: "group-2" }]) : page([{ id: "group-1" }], true, "next-group") } }) : ok({ playerGroup: sectionPlayer(variables.groupId, query, variables) }));
check((await lateGroup.client.section("player-1", "content", null, "PRIMARY", "group-2")).nodes.length === 1, "membership is checked across all group pages");
for (const args of [["player-1", "unknown"], ["player-1", "content", null, "INVALID"], ["player-1", "alerts", "x".repeat(2049)], ["player-1", "alerts", null, "PRIMARY", "group-1"], ["player-1", "extended", "cursor"]]) await rejects(() => expanded.client.section(...args), 400, "invalid detail options are rejected");
const deniedContent = harness(({ query, variables }) => query.includes("loop(name:") ? Response.json({ errors: [{ message: "private-token content access denied" }] }) : ok({ player: { id: variables.id, ...extended } }));
await rejects(() => deniedContent.client.section("player-1", "content"), 503, "content permission failure is redacted");
check((await deniedContent.client.section("player-1", "extended")).values.serialNumber === extended.serialNumber, "content failure does not poison the device information cache");
for (const [response, status] of [[() => ok({ player: null }), 404], [() => ok({ player: { id: "different-player" } }), 503]]) {
 const test = harness(response); await rejects(() => test.client.section("player-1", "extended"), status, "expanded data enforces the linked player identity");
}
const foreignSection = harness(() => ok({ player: { id: "player-1", ...extended } }, "other-org"));
await rejects(() => foreignSection.client.section("player-1", "extended"), 503, "expanded sections reject other organizations");
const badSection = harness(() => ok({ player: { id: "player-1", activeAlerts: { nodes: [], pageInfo: { hasNextPage: true } } } }));
await rejects(() => badSection.client.section("player-1", "alerts"), 503, "malformed related pagination is rejected");
console.log(`${checks} OnSign API checks passed (mocked transport; no live credentials used).`);
