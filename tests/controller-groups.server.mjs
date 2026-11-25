// All fixtures live in a disposable local database; no provider calls or real data.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";
import { emptyGroupScreenFilters, filteredGroupSelection, groupScreenView } from "../components/controller-group-filters.ts";

const base = new URL(process.env.DATABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname) && base.port === "55432", "Use the separate local development database only");
const name = "sephora_controller_test_" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
const testUrl = new URL(base); testUrl.pathname = "/" + name;
const admin = new pg.Pool({ connectionString: adminUrl.href }), pool = new pg.Pool({ connectionString: testUrl.href });
let server, created = false, logs = "", checks = 0;
const check = (ok, label) => { assert.ok(ok, label); checks++; console.log("PASS " + label); };
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true; await migrate(pool);
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex"), password = "Controller-Filter-Fixture-2026!";
  server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], { windowsHide: true, env: {
    ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: testUrl.href, AUTH_URL: origin, AUTH_ADDITIONAL_ORIGINS: "",
    AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL: "controller-filter@example.test", AUTH_BOOTSTRAP_HASH: crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600000),
    PIXCOM_CLIENT_INTEGRATIONS: '{"sephora":{}}', PREVIEW_WORKER_DISABLED: "true", EMAIL_ALERT_WORKER_DISABLED: "true", WHATSAPP_ALERT_WORKER_DISABLED: "true", COMPLAINT_ALERTS_ENABLED: "false",
  }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", data => logs += data); server.stderr.on("data", data => logs += data);
  let ready = false; for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 200)); }
  check(ready, "production server starts for controller fixtures");
  let cookie = "";
  const request = (route, body, session = cookie) => fetch(origin + route, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: session }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  check((await request("/api/activate", { token, password })).ok, "fixture Admin activates");
  const login = await request("/api/auth/sign-in/email", { email: "controller-filter@example.test", password }); check(login.ok, "fixture Admin signs in");
  cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const rows = [
    ["uae", "country", "United Arab Emirates", null], ["ksa", "country", "Saudi Arabia", null], ["oman", "country", "Oman", null],
    ["dubai", "region", "Dubai", "uae"], ["abu", "region", "Abu Dhabi", "uae"], ["riyadh", "region", "Riyadh", "ksa"], ["muscat", "region", "Muscat", "oman"],
    ["dm", "store", "Dubai Mall", "dubai"], ["moe", "store", "Mall of Emirates", "dubai"], ["galleria", "store", "Galleria", "abu"], ["park", "store", "Riyadh Park", "riyadh"], ["oman-mall", "store", "Muscat Mall", "muscat"],
    ...["Behind Cash", "Animation Table", "Panoramic", "Engraving", "Institutional", "PopUp", "KSA Conservative", "Head office"].map((label, index) => ["group-" + index, "group", label, null]),
    ...Array.from({ length: 80 }, (_, index) => ["screen-" + index, "screen", `${index < 25 ? "TDM" : index < 50 ? "MOE" : index < 70 ? "Galleria" : "Riyadh"} - Cash screen ${index + 1} - 1920 x 1080`, index < 25 ? "dm" : index < 50 ? "moe" : index < 70 ? "galleria" : "park"]),
    ["other-screen", "screen", "Muscat animation screen", "oman-mall"],
  ];
  for (const [index, row] of rows.entries()) await pool.query("INSERT INTO entities(id,type,name,parent_id,is_demo,created_at) VALUES($1,$2,$3,$4,0,$5)", [...row, new Date(Date.now() + index).toISOString()]);
  for (let i = 0; i < 80; i++) await pool.query("INSERT INTO group_members(group_id,screen_id) VALUES('group-0',$1)", ["screen-" + i]);
  await pool.query("INSERT INTO group_members(group_id,screen_id) VALUES('group-1','other-screen')");
  const snapshot = async () => JSON.stringify({ entities: (await pool.query("SELECT * FROM entities ORDER BY id")).rows, members: (await pool.query("SELECT * FROM group_members ORDER BY group_id,screen_id")).rows });
  const before = await snapshot();
  const setDisplay = (selection, rotation = {}) => request("/api/state", { action: "display", selection, autoAdvance: false, intervalSeconds: 20, ...rotation });
  check((await setDisplay({ groupId: "group-0" })).ok, "entire group can be displayed");
  const state = await (await request("/api/state")).json();
  const filtered = groupScreenView(state.entities, state.members, "group-0", { ...emptyGroupScreenFilters, countryId: "uae", regionId: "dubai" });
  check(filtered.screens.length === 80 && filtered.matching.length === 50, "group-scoped geographic filters choose the correct subset");
  check(!filtered.countries.some(country => country.id === "oman"), "places outside this group's membership stay out of the filters");
  check((await (await request("/api/state")).json()).display.selection.screenIds === undefined, "preparing filter results does not mutate the shared wall");
  const applied = await setDisplay(filteredGroupSelection("group-0", filtered.matching)); check(applied.ok, "filtered selection uses the existing display API");
  const display = (await applied.json()).display;
  check(display.selection.screenIds.length === 50 && !display.autoAdvance && display.intervalSeconds === 20, "filtered apply keeps rotation settings and records exactly 50 screens");
  const monitor = await (await request("/api/monitor-state")).json();
  check(monitor.entities.filter(entity => entity.type === "screen").length === 50 && !monitor.entities.some(entity => entity.id === "screen-50" || entity.id === "other-screen"), "monitor receives only the filtered group screens");
  const noMatches = groupScreenView(state.entities, state.members, "group-0", { ...emptyGroupScreenFilters, query: "missing screen" });
  check(filteredGroupSelection("group-0", noMatches.matching) === null, "zero matches cannot become the API's empty/all selection");
  check((await setDisplay({ groupId: "group-0" })).ok, "Show entire group restores the existing full-group selection");
  check((await (await request("/api/monitor-state")).json()).entities.filter(entity => entity.type === "screen").length === 80, "monitor returns to all 80 group screens");
  check((await setDisplay({ countryId: "uae", regionId: "dubai", storeId: "dm" })).ok, "existing By location selection remains available");
  check((await (await request("/api/monitor-state")).json()).entities.filter(entity => entity.type === "screen").length === 25, "location mode still shows exactly that location's screens");
  check(await snapshot() === before, "inventory and group memberships remain byte-for-byte unchanged");

  const operatorSessions = [];
  for (const number of [1, 2]) {
    const email = `wall-operator-${number}@example.test`;
    check((await request("/api/users", { action: "create", name: `Wall operator ${number}`, email, role: "controller", password })).ok, `operator ${number} account is created`);
    const operator = await request("/api/auth/sign-in/email", { email, password });
    check(operator.ok, `operator ${number} signs in`);
    operatorSessions.push(operator.headers.getSetCookie().map(value => value.split(";")[0]).join("; "));
  }
  const [selectionSession, rotationSession] = operatorSessions;
  const getDisplay = async session => (await (await request("/api/state", undefined, session)).json()).display;
  const patchDisplay = (patch, session = selectionSession) => request("/api/state", { action: "display", patch }, session);
  const openDisplays = await Promise.all(operatorSessions.map(getDisplay));
  check(openDisplays.every(display => display.selection.storeId === "dm" && !display.autoAdvance && display.intervalSeconds === 20), "both operators start with the same saved wall view");
  const [selected, toggled] = await Promise.all([
    patchDisplay({ selection: { groupId: "group-1" } }),
    patchDisplay({ autoAdvance: true }, rotationSession),
  ]);
  check(selected.ok && toggled.ok, "both operators can change different wall fields concurrently");
  const merged = await getDisplay(selectionSession);
  check(merged.selection.groupId === "group-1" && merged.autoAdvance && merged.intervalSeconds === 20, "concurrent selection and rotation changes preserve both fields and keep the interval");
  const intervalChange = await patchDisplay({ intervalSeconds: 45 }, rotationSession);
  const withInterval = (await intervalChange.json()).display;
  check(intervalChange.ok && withInterval.selection.groupId === "group-1" && withInterval.autoAdvance && withInterval.intervalSeconds === 45, "changing only the interval preserves the screen selection and rotation toggle");
  const showAll = await patchDisplay({ selection: {} });
  const allLocations = (await showAll.json()).display;
  check(showAll.ok && Object.keys(allLocations.selection).length === 0 && allLocations.autoAdvance && allLocations.intervalSeconds === 45, "an explicit empty selection still shows all locations and preserves both rotation settings");
  const invalidUpdates = [
    { patch: {} }, { patch: null }, { patch: { unknown: true } },
    { patch: { intervalSeconds: 10.5 } }, { patch: { autoAdvance: 0 } },
    { patch: { selection: { groupId: "missing-group" }, autoAdvance: false } },
    { patch: { autoAdvance: false }, selection: {} },
  ];
  for (const update of invalidUpdates) {
    assert.equal((await request("/api/state", { action: "display", ...update }, rotationSession)).status, 400);
  }
  check(JSON.stringify(await getDisplay(rotationSession)) === JSON.stringify(allLocations), "invalid or mixed wall updates leave the saved state untouched");
  const legacyWrite = await request("/api/state", { action: "display", selection: { groupId: "group-0" }, autoAdvance: false }, rotationSession);
  const legacyDisplay = (await legacyWrite.json()).display;
  check(legacyWrite.ok && legacyDisplay.selection.groupId === "group-0" && !legacyDisplay.autoAdvance && legacyDisplay.intervalSeconds === 10, "legacy full display writes still use defaults for omitted rotation fields");

  await pool.query(`INSERT INTO entities (id, type, name, parent_id, created_at) VALUES
    ('deleted-group-screen-1', 'screen', 'First selected screen to delete', 'dm', now()),
    ('deleted-group-screen-2', 'screen', 'Last selected screen to delete', 'dm', now()),
    ('deleted-entire-group', 'group', 'Active group to delete', NULL, now()),
    ('deleted-group-with-selection', 'group', 'Active group with explicit selection', NULL, now()),
    ('deleted-unrelated-group', 'group', 'Inactive group to delete', NULL, now()),
    ('deleted-store', 'store', 'Location to delete', 'dubai', now()),
    ('deleted-store-screen', 'screen', 'Screen in location to delete', 'deleted-store', now()),
    ('deleted-entire-store', 'store', 'Active location to delete', 'dubai', now()),
    ('deleted-entire-store-screen', 'screen', 'Screen in active location to delete', 'deleted-entire-store', now()),
    ('deleted-unscoped-screen', 'screen', 'Unscoped screen to delete', 'dm', now())`);
  await pool.query("INSERT INTO group_members (group_id, screen_id) VALUES ('group-0', 'deleted-group-screen-1'), ('group-0', 'deleted-group-screen-2')");
  await pool.query(`INSERT INTO group_members (group_id, screen_id) VALUES
    ('deleted-entire-group', 'screen-0'), ('deleted-entire-group', 'screen-25'),
    ('deleted-group-with-selection', 'screen-1'), ('deleted-unrelated-group', 'other-screen')`);
  const deleteInventory = id => request("/api/state", { action: "delete", id });
  const shown = state => state.entities.filter(entity => entity.type === "screen").map(entity => entity.id);
  const storedSelection = async () => JSON.parse((await pool.query("SELECT selection FROM display_state WHERE client_id = 'sephora' AND id = 'main'")).rows[0].selection);
  check((await setDisplay({ groupId: "group-0", screenIds: ["deleted-group-screen-1", "deleted-group-screen-2"] })).ok, "a group can display two explicitly selected screens");
  const partialDeletion = await deleteInventory("deleted-group-screen-1");
  check(partialDeletion.ok && (await partialDeletion.json()).display.selection.screenIds.join() === "deleted-group-screen-2", "deleting one selected screen keeps the other selection");
  const finalDeletion = await deleteInventory("deleted-group-screen-2");
  const afterDeletion = (await finalDeletion.json()).display;
  check(finalDeletion.ok && afterDeletion.selection.groupId === "group-0" && afterDeletion.selection.screenIds === null, "deleting the last selected screen keeps the group scope with a blank wall");
  const blankMonitor = await (await request("/api/monitor-state")).json();
  check(shown(blankMonitor).length === 0 && blankMonitor.previewSummary.counts.total === 0, "monitor exposes none of the other 80 screens after deleting the last selection");
  check((await request("/api/controller-client", {})).ok, "common wall follows the fixture Controller");
  const blankCommon = await (await request("/api/monitor-state?scope=all")).json();
  check(shown(blankCommon).length === 0 && blankCommon.display.selection.screenIds === null, "common wall also remains empty");
  const rotation = await patchDisplay({ autoAdvance: true, intervalSeconds: 30 }, rotationSession);
  const rotated = (await rotation.json()).display;
  check(rotation.ok && rotated.autoAdvance && rotated.intervalSeconds === 30 && rotated.selection.screenIds === null, "changing rotation preserves the empty selection");
  check(JSON.stringify(await storedSelection()) === JSON.stringify({ groupId: "group-0", screenIds: [null] }), "saving rotation persists the previous-build-safe empty selection");
  check((await setDisplay({ groupId: "group-0", screenIds: ["screen-0"] })).ok, "a deliberate individual choice restores a screen");
  check(shown(await (await request("/api/monitor-state")).json()).join() === "screen-0", "the wall shows only the new explicit selection");
  check((await setDisplay({ groupId: "group-0", screenIds: [] })).ok && shown(await (await request("/api/monitor-state")).json()).length === 80, "a legacy empty array still means the entire group");

  check((await setDisplay({ countryId: "uae", regionId: "dubai", storeId: "deleted-store", screenIds: ["deleted-store-screen"] })).ok, "a location can display a specific screen");
  const locationDeletion = await deleteInventory("deleted-store");
  const afterLocationDeletion = (await locationDeletion.json()).display.selection;
  check(locationDeletion.ok && afterLocationDeletion.storeId === undefined && afterLocationDeletion.regionId === "dubai" && afterLocationDeletion.screenIds === null, "a location deletion clears the missing scope and does not expand to the region");
  check(shown(await (await request("/api/monitor-state")).json()).length === 0, "the monitor displays no screens after a scoped cascade");
  check((await setDisplay({ screenIds: ["deleted-unscoped-screen"] })).ok, "an individual screen can be selected without a group or location");
  check((await deleteInventory("deleted-unscoped-screen")).ok && shown(await (await request("/api/monitor-state")).json()).length === 0, "deleting an unscoped screen does not expand to the entire inventory");

  check((await setDisplay({ groupId: "deleted-entire-group" })).ok && shown(await (await request("/api/monitor-state")).json()).length === 2, "the wall shows the whole temporary group before deletion");
  check((await deleteInventory("deleted-unrelated-group")).ok && shown(await (await request("/api/monitor-state")).json()).length === 2, "deleting an inactive group preserves the current view");
  const groupDeletion = await deleteInventory("deleted-entire-group");
  check(groupDeletion.ok, "the active whole group is deleted");
  const afterGroupDeletion = await groupDeletion.json();
  const blankGroupWall = await (await request("/api/monitor-state")).json();
  const blankCommonGroupWall = await (await request("/api/monitor-state?scope=all")).json();
  check(afterGroupDeletion.display.selection.groupId === undefined && afterGroupDeletion.display.selection.screenIds === null && shown(blankGroupWall).length === 0 && shown(blankCommonGroupWall).length === 0, "deleting the active whole group leaves both walls empty");
  const savedBlankWall = await storedSelection();
  check(JSON.stringify(savedBlankWall) === JSON.stringify({ screenIds: [null] }), "scope deletion saves the previous-build-safe empty selection");
  // Match the prior build's explicit-ID filter. A missing or empty array selects every screen.
  const previousBuildIds = savedBlankWall.screenIds?.length ? new Set(savedBlankWall.screenIds) : null;
  const remainingScreens = shown(afterGroupDeletion);
  check(remainingScreens.includes("screen-0") && remainingScreens.includes("other-screen") && remainingScreens.filter(id => !previousBuildIds || previousBuildIds.has(id)).length === 0, "the previous build also shows no screens from the persisted selection");
  check((await setDisplay({ groupId: "group-0" })).ok && shown(await (await request("/api/monitor-state?scope=all")).json()).length === 80, "the operator can restore the display by choosing a surviving group");

  check((await setDisplay({ groupId: "deleted-group-with-selection", screenIds: ["screen-1"] })).ok, "the temporary group can display one explicitly selected, surviving screen");
  check((await deleteInventory("deleted-group-with-selection")).ok && shown(await (await request("/api/monitor-state")).json()).length === 0, "deleting the active group clears even surviving explicit screen selections");

  check((await setDisplay({ countryId: "uae", regionId: "dubai", storeId: "deleted-entire-store" })).ok && shown(await (await request("/api/monitor-state")).json()).join() === "deleted-entire-store-screen", "the wall shows the entire temporary location before deletion");
  const wholeLocationDeletion = await deleteInventory("deleted-entire-store");
  check(wholeLocationDeletion.ok, "the active whole location is deleted");
  const afterWholeLocationDeletion = (await wholeLocationDeletion.json()).display.selection;
  check(afterWholeLocationDeletion.storeId === undefined && afterWholeLocationDeletion.regionId === "dubai" && afterWholeLocationDeletion.countryId === "uae" && afterWholeLocationDeletion.screenIds === null && shown(await (await request("/api/monitor-state")).json()).length === 0, "deleting a whole location preserves surviving scope labels and leaves the wall empty");
  check(await snapshot() === before, "deletion checks preserve all original inventory and memberships");

  check((await setDisplay({ groupId: "group-0" })).ok, "fixture returns to the full group for browser verification");
  if (process.env.CONTROLLER_GROUPS_UI === "true") {
    const done = path.resolve(".server-runtime/controller-groups-ui.done");
    await fs.rm(done, { force: true });
    console.log(`UI fixture: ${origin}; sign in controller-filter@example.test / ${password}`);
    await fs.writeFile(".server-runtime/controller-groups-ui.json", JSON.stringify({ origin, email: "controller-filter@example.test", password }));
    while (!await fs.stat(done).then(() => true, () => false)) await new Promise(resolve => setTimeout(resolve, 500));
    await fs.rm(done, { force: true });
  }
  console.log(`${checks} controller group display integration checks passed.`);
} catch (error) { console.error(logs.slice(-1500)); throw error; }
finally {
  if (server && server.exitCode === null) { const exit = once(server, "exit"); server.kill(); await exit; }
  await pool.end(); if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.end();
}
