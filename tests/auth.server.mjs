// Exercises the actual production Node server against a disposable PostgreSQL database.
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";
const root = process.cwd();
const databaseName = "sephora_test_" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(process.env.DATABASE_URL); adminUrl.pathname = "/postgres";
const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
await adminPool.query('CREATE DATABASE "' + databaseName + '"');
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = "/" + databaseName;
const pool = new pg.Pool({ connectionString: testUrl.toString() });
await migrate(pool);
function statement(sql, values = []) {
  const execute = () => { let index = 0; return pool.query(sql.replace(/\?/g, () => "$" + ++index), values); };
  return { bind: (...params) => statement(sql, params), first: async () => (await execute()).rows[0], all: async () => ({ results: (await execute()).rows }), run: execute };
}
const db = { prepare: statement };
const probe = net.createServer();
const testHost = process.env.TEST_LAN_IP || "127.0.0.1";
await new Promise(resolve => probe.listen(0, testHost, resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = "http://" + testHost + ":" + port;
const aliasOrigin = "http://localhost:" + port;
const token = crypto.randomBytes(32).toString("hex");
const password = crypto.randomBytes(24).toString("base64url");
const serverEnv = {...process.env, PORT:String(port), HOSTNAME:"0.0.0.0", ALLOW_LAN_HTTP:process.env.TEST_LAN_IP ? "true" : "false", DATABASE_URL:testUrl.toString(), AUTH_URL:origin, AUTH_ADDITIONAL_ORIGINS:aliasOrigin, AUTH_SECRET:crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL:"admin@example.test", AUTH_BOOTSTRAP_HASH:crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000), TRUST_PROXY:"true"};
let server = spawn(process.execPath, [path.join(root, ".next/standalone/server.js")], { cwd:root, env:serverEnv, stdio:["ignore","pipe","pipe"] });
let logs = "";
server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
let ready = false;
for (let attempt=0; attempt<60; attempt++) {
  try { if ((await fetch(origin+"/api/health")).status === 200) { ready=true; break; } } catch {}
  if (server.exitCode !== null) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!ready) { server.kill(); await pool.end(); await adminPool.query('DROP DATABASE "'+databaseName+'" WITH (FORCE)'); await adminPool.end(); throw new Error("Test server failed to start: "+logs.slice(-2000)); }
let checks = 0;
function check(condition, name) { assert.ok(condition, name); checks++; console.log(`PASS ${name}`); }
async function request(route, body, cookie = "", extra = {}) { return fetch(origin + route, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual" }); }
async function login(email, pw = password, ip = "192.0.2.10") { const response = await request("/api/auth/sign-in/email", { email, password: pw }, "", { "x-forwarded-for": ip }); const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); return { response, cookie }; }
try {
  check((await request("/api/state")).status === 401, "anonymous inventory is blocked");
  check((await request("/admin")).status === 307, "anonymous Admin redirects to login");
  const monitorPage = await request("/monitor");
  check(monitorPage.status === 200 && !monitorPage.headers.has("x-frame-options"), "monitor shell opens without login and permits OnSign embedding");
  check((await request("/admin")).headers.get("x-frame-options") === "DENY", "Admin retains framing protection");
  check((await request("/api/monitor-state")).status === 401, "anonymous monitor shell cannot expose screen data");
  check((await request("/api/monitor-link")).status === 401, "monitor link management requires login");
  check((await request("/api/auth/sign-up/email", { email: "intruder@example.test", password, name: "Intruder", role: "admin" })).status === 404, "public registration is unavailable");
  check((await request("/api/auth/get-session")).status === 404, "unused raw session endpoint is unavailable");
  check((await request("/activate")).status === 200 && (await (await request("/activate")).text()).includes("admin@example.test"), "first Admin form shows the configured login ID");
  check((await request("/api/activate", { token, password }, "", { Origin: "https://attacker.test" })).status === 403, "cross-origin setup is rejected");
  check((await request("/api/activate", { token: "0".repeat(64), password })).status === 400, "incorrect setup tokens are rejected");
  check((await request("/api/activate", { token, password: "short" })).status === 400, "first Admin setup rejects weak passwords");
  const competingSetups = await Promise.all([request("/api/activate", { token, password }), request("/api/activate", { token, password })]);
  const setup = competingSetups.find((response) => response.status === 200);
  if (!setup) console.error("Setup response statuses:", competingSetups.map(response => response.status));
  check(competingSetups.filter((response) => response.status === 200).length === 1 && Number((await db.prepare("SELECT COUNT(*) AS count FROM auth_user").first()).count) === 1, "concurrent setup creates exactly one first Admin");
  check(setup?.status === 200, "first Admin setup succeeds");
  check((await request("/api/activate", { token, password })).status === 400, "setup token cannot be reused");
  const admin = await login("admin@example.test"); check(admin.response.status === 200 && admin.cookie.includes("session_token"), "Admin receives a session cookie");
  check(admin.response.headers.getSetCookie().some((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)), "session cookies are HttpOnly and SameSite");
  check((await request("/api/users", undefined, admin.cookie)).status === 200, "Admin can list accounts");
  const aliasLogin = await fetch(aliasOrigin + "/api/auth/sign-in/email", { method: "POST", headers: { Origin: aliasOrigin, "Content-Type": "application/json", "x-forwarded-for": "192.0.2.91" }, body: JSON.stringify({ email: "admin@example.test", password }) });
  check(aliasLogin.status === 200, "localhost alias can sign in with the same account");
  const aliasCookie = aliasLogin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  check(!aliasLogin.headers.getSetCookie().some(value => /;\s*Domain=/i.test(value)), "alias login keeps cookies scoped to its browser host");
  for (const page of ["/admin", "/controller", "/monitor"]) check((await fetch(aliasOrigin + page, { headers: { Cookie: aliasCookie }, redirect: "manual" })).status === 200, "localhost renders " + page);
  const aliasWrite = await fetch(aliasOrigin + "/api/state", { method: "POST", headers: { Origin: aliasOrigin, Cookie: aliasCookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "display", selection: {}, intervalSeconds: 15 }) });
  check(aliasWrite.status === 200 && (await (await request("/api/state", undefined, admin.cookie)).json()).display.intervalSeconds === 15, "localhost changes reach the same wall state through the primary address");
  check((await request("/api/state", { action: "display", selection: {} }, admin.cookie, { Origin: aliasOrigin })).status === 403, "writes cannot cross between otherwise allowed hosts");
  for (const page of ["/admin", "/admin/screens", "/admin/countries", "/admin/regions", "/admin/locations", "/admin/groups", "/admin/activity", "/admin/settings", "/admin/users", "/controller", "/monitor", "/account"]) {
    check((await request(page, undefined, admin.cookie)).status === 200, `Admin route renders: ${page}`);
  }
  check((await request("/admin/unknown", undefined, admin.cookie)).status === 404, "unknown Admin section returns 404");
  for (const route of ["/api/state", "/api/users", "/api/auth/change-password"]) {
    check((await request(route, null, admin.cookie)).status === 400, `null JSON body is rejected: ${route}`);
    check((await request(route, [], admin.cookie)).status === 400, `array JSON body is rejected: ${route}`);
    check((await request(route, { padding: "x".repeat(66000) }, admin.cookie)).status === 413, `oversized body is rejected: ${route}`);
  }
  check((await request("/api/activate", null, "", { "x-forwarded-for": "192.0.2.80" })).status === 400, "null first Admin setup body is rejected");
  check((await request("/api/state", { action: "display", selection: { countryId: false } }, admin.cookie)).status === 400, "selection IDs require strings");
  check((await request("/api/state", { action: "display", selection: {}, intervalSeconds: 10.5 }, admin.cookie)).status === 400, "fractional rotation interval is rejected");
  const duplicateCreates = await Promise.all([1, 2].map(() => request("/api/state", { action: "create", type: "country", name: "Concurrent country" }, admin.cookie)));
  check(duplicateCreates.filter(response => response.status === 200).length === 1 && duplicateCreates.filter(response => response.status === 400).length === 1, "concurrent inventory creation cannot duplicate a name");
  const assetPage = await (await request("/login")).text();
  const stylePath = assetPage.match(/href="([^\"]+\.css[^\"]*)"/)?.[1];
  check(!!stylePath && (await request(stylePath)).status === 200, "standalone deployment serves its stylesheet assets");
  async function createEntity(type, name, parentId = null, liveUrl = null) {
    const response = await request("/api/state", { action: "create", type, name, parentId, liveUrl }, admin.cookie);
    check(response.status === 200, `PostgreSQL stores ${type}`);
    return (await response.json()).entities.find(item => item.type === type && item.name === name);
  }
  const country = await createEntity("country", "Test country");
  check((await request("/api/state", { action: "create", type: "country", name: country.name, id: country.id }, admin.cookie)).status === 400, "a supplied ID cannot bypass duplicate-name validation during creation");
  const region = await createEntity("region", "Test region", country.id);
  const location = await createEntity("store", "Test mall", region.id);
  const screen = await createEntity("screen", "Test screen", location.id, "https://example.test/preview");
  const group = await createEntity("group", "Test group");
  check(screen.parentId === location.id && screen.liveUrl === "https://example.test/preview" && typeof screen.isDemo === "number", "inventory preserves the frontend field names and preview URL");
  check((await request("/api/state", { action: "member", groupId: group.id, screenId: screen.id, enabled: true }, admin.cookie)).status === 200 && (await request("/api/state", { action: "member", groupId: group.id, screenId: screen.id, enabled: true }, admin.cookie)).status === 200, "group membership is idempotent on PostgreSQL");
  check((await request("/api/state", { action: "create", type: "screen", name: "Bad parent", parentId: country.id }, admin.cookie)).status === 400, "invalid inventory hierarchy is rejected");
  check((await request("/api/state", { action: "member", groupId: group.id, screenId: screen.id, enabled: "false" }, admin.cookie)).status === 400, "group assignment requires a boolean");
  check((await request("/api/state", { action: "update", type: "screen", id: screen.id, name: "Renamed screen", parentId: location.id, liveUrl: "https://example.test/updated" }, admin.cookie)).status === 200, "screen name and preview URL can be edited");
  check((await request("/api/state", { action: "update", type: "screen", id: screen.id, name: "Renamed screen", parentId: location.id, liveUrl: "javascript:alert(1)" }, admin.cookie)).status === 400, "unsafe preview protocol is rejected");
  for (const role of ["controller", "wall", "admin"]) {
    const response = await request("/api/users", { action: "create", name: `Test ${role}`, email: `${role}2@example.test`, role, password }, admin.cookie);
    check(response.status === 200, `Admin can create ${role} with direct credentials`);
  }
  check((await request("/api/users", { action: "create", name: "Duplicate", email: "controller2@example.test", role: "wall", password }, admin.cookie)).status === 400, "duplicate login IDs are rejected");
  check((await request("/api/users", { action: "create", name: "Weak", email: "weak@example.test", role: "wall", password: "short" }, admin.cookie)).status === 400, "short passwords are rejected");
  const controller = await login("controller2@example.test", password, "192.0.2.11"); const wall = await login("wall2@example.test", password, "192.0.2.12");
  check(controller.response.status === 200 && wall.response.status === 200, "staff and wall credentials work without email verification");
  const durations = (await db.prepare("SELECT u.role, EXTRACT(EPOCH FROM (s.expires_at - s.created_at)) * 1000 AS duration FROM auth_session s JOIN auth_user u ON s.user_id = u.id").all()).results;
  check(durations.every((s) => Math.abs(s.duration - (s.role === "wall" ? 30 * 86400 : 8 * 3600) * 1000) < 5000), "staff and wall sessions have the intended lifetimes");
  check((await request("/account", undefined, controller.cookie)).status === 200, "Controller can manage own password");
  check((await request("/admin/screens", undefined, controller.cookie)).status === 307, "Controller cannot open Admin pages");
  check((await request("/controller", undefined, wall.cookie)).status === 307, "Wall device cannot open Controller");
  check((await request("/monitor", undefined, wall.cookie)).status === 200, "Wall device can open Monitor");
  check((await request("/api/users", undefined, controller.cookie)).status === 403, "Controller cannot read user accounts");
  check((await request("/api/users", { action: "create", name: "Forbidden", email: "forbidden@example.test", role: "admin", password }, wall.cookie)).status === 403, "Wall device cannot create accounts");
  check((await request("/api/state", { action: "create", type: "country", name: "Forbidden" }, controller.cookie)).status === 403, "Controller cannot modify inventory");
  check((await request("/api/state", { action: "display", selection: {}, autoAdvance: true, intervalSeconds: 10 }, wall.cookie)).status === 403, "Wall device cannot control selection");
  check((await request("/api/state", { action: "display", selection: {}, autoAdvance: true, intervalSeconds: 10 }, controller.cookie)).status === 200, "Controller can change wall selection");
  const state = await (await request("/api/state", undefined, wall.cookie)).json(); check(state.activity.length === 0, "non-admin state excludes audit history");
  check((await request("/api/state", { action: "display", selection: { countryId: country.id, regionId: region.id, storeId: location.id }, autoAdvance: true, intervalSeconds: 15 }, controller.cookie)).status === 200, "Controller can select a saved country, region, and location");
  const monitorState = await (await request("/api/state", undefined, wall.cookie)).json();
  check(monitorState.display.selection.storeId === location.id && monitorState.display.intervalSeconds === 15 && monitorState.members.some(member => member.groupId === group.id && member.screenId === screen.id), "Monitor sees the shared Controller selection and group membership");
  for (const account of [controller, wall]) {
    check((await request("/api/monitor-link", undefined, account.cookie)).status === 403, "non-Admin cannot read link management");
    check((await request("/api/monitor-link", { action: "create" }, account.cookie)).status === 403, "non-Admin cannot create monitor links");
  }
  check((await request("/api/monitor-link", { action: "create" }, admin.cookie, { Origin: "https://attacker.test" })).status === 403, "cross-origin monitor link creation is rejected");
  check((await request("/api/monitor-link", null, admin.cookie)).status === 400, "monitor link management rejects invalid bodies");
  const competingLinks = await Promise.all([request("/api/monitor-link", { action: "create" }, admin.cookie), request("/api/monitor-link", { action: "create" }, admin.cookie)]);
  check(competingLinks.filter(response => response.status === 200).length === 1 && competingLinks.filter(response => response.status === 409).length === 1, "concurrent creation produces only one active monitor link");
  const firstLink = await competingLinks.find(response => response.status === 200).json();
  const key = new URLSearchParams(new URL(firstLink.link).hash.slice(1)).get("key");
  check(new URL(firstLink.link).origin === origin && !new URL(firstLink.link).search && /^[a-f0-9]{64}$/.test(key), "generated OnSign link uses a random key in the fragment only");
  const storedLink = await db.prepare("SELECT * FROM monitor_access").all();
  check(storedLink.results.length === 1 && storedLink.results[0].token_hash === crypto.createHash("sha256").update(key).digest("hex") && !JSON.stringify(storedLink).includes(key), "PostgreSQL stores one key hash without the raw private link");
  const metadata = await (await request("/api/monitor-link", undefined, admin.cookie)).json();
  check(metadata.active && metadata.generation === firstLink.generation && !JSON.stringify(metadata).includes(key) && !Object.hasOwn(metadata, "link"), "metadata never returns the raw link again");
  const monitorRead = keyValue => request("/api/monitor-state", undefined, "", { Authorization: "Bearer " + keyValue });
  const readWithoutLogin = await monitorRead(key);
  check(readWithoutLogin.status === 200 && !readWithoutLogin.headers.has("set-cookie") && readWithoutLogin.headers.get("cache-control") === "no-store", "private monitor works without login, cookies, or cached data");
  const viewData = await readWithoutLogin.json();
  check(Object.keys(viewData).sort().join(",") === "display,entities,members" && viewData.entities.filter(entity => entity.type === "screen").length === 1 && viewData.entities.some(entity => entity.id === screen.id) && !viewData.entities.some(entity => entity.name === "Concurrent country"), "monitor data contains only the selected screens and labels");
  check((await monitorRead("not-a-key")).status === 401 && (await monitorRead("0".repeat(64))).status === 401, "malformed and unknown monitor keys are rejected");
  for (const route of ["/api/users", "/api/state", "/api/monitor-link"]) check((await request(route, undefined, "", { Authorization: "Bearer " + key })).status === 401, "private key cannot read " + route);
  check((await request("/api/state", { action: "display", selection: {} }, "", { Authorization: "Bearer " + key })).status === 401, "private key cannot control or modify the wall");
  check((await request("/api/monitor-state", {}, "", { Authorization: "Bearer " + key })).status === 405, "private monitor endpoint has no write operation");
  check((await request("/api/monitor-state?key=" + key)).status === 401, "query-string keys cannot authorize monitor data");
  check((await request("/api/state", { action: "display", selection: { groupId: group.id }, intervalSeconds: 20 }, controller.cookie)).status === 200, "Controller can switch a private monitor to a group");
  const groupView = await (await monitorRead(key)).json();
  check(groupView.display.selection.groupId === group.id && groupView.members.some(member => member.screenId === screen.id) && groupView.entities.some(entity => entity.id === location.id), "private monitor follows groups with location captions intact");
  check((await request("/api/state", { action: "display", selection: { storeId: location.id }, intervalSeconds: 15 }, controller.cookie)).status === 200, "Controller restores the private monitor location selection");
  const replacements = await Promise.all([request("/api/monitor-link", { action: "replace", generation: firstLink.generation }, admin.cookie), request("/api/monitor-link", { action: "replace", generation: firstLink.generation }, admin.cookie)]);
  check(replacements.filter(response => response.status === 200).length === 1 && replacements.filter(response => response.status === 409).length === 1, "concurrent replacement cannot silently invalidate a newly issued link");
  const replacementLink = await replacements.find(response => response.status === 200).json();
  const nextKey = new URLSearchParams(new URL(replacementLink.link).hash.slice(1)).get("key");
  check((await monitorRead(key)).status === 401 && (await monitorRead(nextKey)).status === 200, "replacement immediately rejects the old key and accepts the new key");
  check((await request("/api/monitor-state", undefined, admin.cookie, { Authorization: "Bearer " + key })).status === 401, "an Admin cookie cannot rescue a revoked private link");
  check((await request("/api/monitor-link", { action: "disable", generation: firstLink.generation }, admin.cookie)).status === 409, "stale controls cannot disable the current link");
  check((await request("/api/monitor-link", { action: "disable", generation: replacementLink.generation }, admin.cookie)).status === 200 && (await monitorRead(nextKey)).status === 401, "disabling the link revokes monitor data access");
  check((await request("/api/monitor-state", undefined, admin.cookie)).status === 200, "signed-in staff can still view the normal monitor page");
  check(!(await (await request("/api/monitor-link", undefined, admin.cookie)).json()).active, "Admin sees disabled link status");
  const recreated = await request("/api/monitor-link", { action: "create" }, admin.cookie);
  check(recreated.status === 200 && Number((await db.prepare("SELECT COUNT(*) AS count FROM monitor_access").first()).count) === 1, "creating after disable reuses the single monitor access record");
  const activityAfterLinks = await (await request("/api/state", undefined, admin.cookie)).json();
  check(activityAfterLinks.activity.some(item => item.action === "Replaced monitor link") && !JSON.stringify(activityAfterLinks).includes(key) && !JSON.stringify(activityAfterLinks).includes(nextKey), "link changes are audited without exposing private keys");
  const persistentLink = await recreated.json();
  const persistentKey = new URLSearchParams(new URL(persistentLink.link).hash.slice(1)).get("key");
  await new Promise(resolve => { server.once("exit", resolve); server.kill(); });
  server = spawn(process.execPath, [path.join(root, ".next/standalone/server.js")], { cwd:root, env:serverEnv, stdio:["ignore","pipe","pipe"] });
  server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
  let restarted = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(origin + "/api/health")).status === 200) { restarted = true; break; } } catch {}
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  check(restarted && (await monitorRead(persistentKey)).status === 200 && (await monitorRead(key)).status === 401, "server restart preserves the active link and keeps old links revoked");
  if (process.env.TEST_MONITOR_UI === "true") {
    const fixture = path.join(root, ".server-runtime", "monitor-ui-fixture.json");
    const resume = path.join(root, ".server-runtime", "monitor-ui-resume");
    fs.mkdirSync(path.dirname(fixture), { recursive: true });
    fs.rmSync(resume, { force: true });
    fs.writeFileSync(fixture, JSON.stringify({ origin, aliasOrigin, email: "admin@example.test", password, link: persistentLink.link }), { mode: 0o600 });
    console.log("UI fixture ready on isolated test server " + origin + "; private credentials retained only in ignored runtime files.");
    try {
      const deadline = Date.now() + 600000;
      while (!fs.existsSync(resume) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 500));
      check(fs.existsSync(resume), "browser verification completed before the fixture timeout");
    } finally { fs.rmSync(fixture, { force: true }); fs.rmSync(resume, { force: true }); }
  }
  await pool.query("INSERT INTO entities (id, type, name, parent_id, is_demo, created_at) SELECT 'load-' || i, 'screen', 'Load screen ' || i, $1, 0, $2 FROM generate_series(1, 1000) i", [location.id, new Date().toISOString()]);
  const loadStarted = performance.now();
  const loadReads = await Promise.all(Array.from({ length: 30 }, () => request("/api/state", undefined, wall.cookie)));
  check(loadReads.every(response => response.status === 200) && (await loadReads[0].json()).entities.filter(item => item.type === "screen").length === 1001, "30 concurrent monitor reads handle an inventory of 1001 screens");
  console.log(`Local load smoke check: 30 reads completed in ${Math.round(performance.now() - loadStarted)} ms (not a production capacity benchmark).`);
  const interrupted = await pool.query("SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE datname = $1 AND application_name = 'sephora-screen-control' AND state = 'idle'", [databaseName]);
  check(interrupted.rows.some(row => row.terminated), "recovery test interrupts real application database connections");
  await new Promise(resolve => setTimeout(resolve, 250));
  check((await request("/api/health")).status === 200 && (await request("/api/state", undefined, wall.cookie)).status === 200, "server recovers after its idle database connections are interrupted");
  const racingDelete = await Promise.all([
    request("/api/state", { action: "create", type: "region", name: "Racing region", parentId: country.id }, admin.cookie),
    request("/api/state", { action: "delete", id: country.id }, admin.cookie),
  ]);
  check(racingDelete[1].status === 200 && [200, 400].includes(racingDelete[0].status) && Number((await pool.query("SELECT COUNT(*) AS count FROM entities e LEFT JOIN entities p ON e.parent_id = p.id WHERE e.parent_id IS NOT NULL AND p.id IS NULL")).rows[0].count) === 0, "concurrent parent deletion and child creation cannot leave orphans");
  const afterDelete = await (await request("/api/state", undefined, admin.cookie)).json();
  check(!afterDelete.entities.some(item => [country.id,region.id,location.id,screen.id].includes(item.id)) && !afterDelete.members.length, "cascading inventory deletion clears group memberships atomically");
  check(!afterDelete.display.selection.countryId && !afterDelete.display.selection.regionId && !afterDelete.display.selection.storeId && (await request("/api/state", { action: "display", selection: afterDelete.display.selection, intervalSeconds: 10 }, controller.cookie)).status === 200, "deletion removes obsolete wall filters so Controller rotation remains editable");
  check((await request("/api/state", { action: "create", type: "country", name: "Spoof" }, controller.cookie, { "oai-authenticated-user-email": "admin@example.test", "x-role": "admin" })).status === 403, "client headers cannot elevate roles");
  check((await request("/api/users", { action: "create", name: "CSRF", email: "csrf@example.test", role: "admin", password }, admin.cookie, { Origin: "https://attacker.test" })).status === 403, "cross-origin Admin mutations are rejected");
  const users = (await (await request("/api/users", undefined, admin.cookie)).json()).users;
  const c = users.find((u) => u.role === "controller"); const w = users.find((u) => u.role === "wall"); const self = users.find((u) => u.email === "admin@example.test");
  check((await request("/api/users", { action: "update", id: self.id, role: "wall", disabled: false }, admin.cookie)).status === 400, "Admin cannot remove own Admin access");
  check((await request("/api/users", { action: "update", id: c.id, role: "controller", disabled: true }, admin.cookie)).status === 200, "Admin can disable staff");
  check((await request("/api/state", undefined, controller.cookie)).status === 401, "disabling revokes existing sessions immediately");
  check((await login(c.email, password, "192.0.2.13")).response.status === 401, "disabled credentials receive a normal login rejection");
  const replacement = crypto.randomBytes(24).toString("base64url");
  check((await request("/api/users", { action: "reset", id: w.id, password: replacement }, admin.cookie)).status === 200, "Admin can set a new password without email");
  check((await request("/api/state", undefined, wall.cookie)).status === 401, "password reset revokes existing sessions");
  check((await login(w.email, password, "192.0.2.14")).response.status === 401, "old password stops working");
  const newWall = await login(w.email, replacement, "192.0.2.15"); check(newWall.response.status === 200, "new password works");
  check((await request("/api/auth/sign-out", {}, newWall.cookie)).status === 200 && (await request("/api/state", undefined, newWall.cookie)).status === 401, "sign-out invalidates the server session");
  const passwordChange = await login(w.email, replacement, "192.0.2.16"); const nextPassword = crypto.randomBytes(24).toString("base64url");
  const otherWallSession = await login(w.email, replacement, "192.0.2.22");
  check((await request("/api/auth/change-password", { currentPassword: "wrong-password", newPassword: nextPassword, revokeOtherSessions: true }, passwordChange.cookie)).status === 400, "self password changes require the current password");
  check((await request("/api/auth/change-password", { currentPassword: replacement, newPassword: nextPassword, revokeOtherSessions: false }, passwordChange.cookie)).status === 200, "Wall device can change its own password");
  check((await request("/api/state", undefined, otherWallSession.cookie)).status === 401, "password changes revoke other sessions even if a client requests otherwise");
  check((await login(w.email, replacement, "192.0.2.17")).response.status === 401 && (await login(w.email, nextPassword, "192.0.2.18")).response.status === 200, "self password change replaces credentials");
  await db.prepare("UPDATE auth_session SET expires_at = to_timestamp(0) WHERE user_id = ?").bind(w.id).run();
  check((await request("/api/state", undefined, passwordChange.cookie)).status === 401, "expired sessions cannot access inventory");
  check((await request("/api/users", { action: "update", id: c.id, role: "controller", disabled: false }, admin.cookie)).status === 200, "Admin can re-enable staff");
  const enabled = await login(c.email, password, "192.0.2.19");
  check((await request("/api/users", { action: "update", id: c.id, role: "wall", disabled: false }, admin.cookie)).status === 200 && (await request("/api/state", undefined, enabled.cookie)).status === 401, "changing roles revokes the old session");
  const changed = await login(c.email, password, "192.0.2.20");
  check((await request("/controller", undefined, changed.cookie)).status === 307, "new sessions enforce the changed role");
  check((await request("/api/users", { action: "update", id: c.id, name: "Updated staff", email: "updated@example.test", role: "wall", disabled: false }, admin.cookie)).status === 200, "Admin can edit a user's name and login ID");
  check((await request("/api/state", undefined, changed.cookie)).status === 401, "editing an account revokes its existing sessions");
  check((await login(c.email, password, "192.0.2.23")).response.status === 401 && (await login("updated@example.test", password, "192.0.2.24")).response.status === 200, "edited login ID replaces the old credentials without changing the password");
  check((await request("/api/users", { action: "update", id: c.id, name: "Updated staff", email: self.email, role: "wall", disabled: false }, admin.cookie)).status === 400, "editing cannot duplicate another account's login ID");
  check((await request("/api/users", { action: "update", id: c.id, name: " ", email: "updated@example.test", role: "wall", disabled: false }, admin.cookie)).status === 400, "editing rejects an empty name");
  const hashes=JSON.stringify((await db.prepare("SELECT password FROM auth_account").all()).results);
  check(!hashes.includes(password) && !hashes.includes(replacement) && hashes.includes(":"), "database stores hashes, not plaintext passwords");
  for (let i = 0; i < 6; i++) { const attempt = await login("unknown@example.test", password, "192.0.2.50"); if (i === 5) check(attempt.response.status === 429, "repeated login attempts are rate limited"); }
  const second = users.find((u) => u.email === "admin2@example.test"); const secondLogin = await login(second.email, password, "192.0.2.21");
  await Promise.all([request("/api/users", { action: "update", id: second.id, role: "wall", disabled: false }, admin.cookie), request("/api/users", { action: "update", id: self.id, role: "wall", disabled: false }, secondLogin.cookie)]);
  check((await db.prepare("SELECT COUNT(*) AS count FROM auth_user WHERE role = 'admin' AND disabled = false").first()).count >= 1, "concurrent changes cannot remove the last Admin");
  console.log(`\n${checks} integration checks passed on isolated PostgreSQL.`);
} catch (error) { console.error(logs.slice(-4000)); throw error; } finally {
  server.kill();
  await new Promise(resolve => server.once("exit", resolve));
  await pool.end();
  await adminPool.query('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await adminPool.end();
}
