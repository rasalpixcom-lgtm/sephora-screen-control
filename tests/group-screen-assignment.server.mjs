// Every account, screen, write and failure below lives in one disposable local DB.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";
import { closeTestPool } from "./fixtures/postgres-pool.mjs";

const base = new URL(process.env.DATABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname) && base.port === "55432", "Use the separate local development PostgreSQL service only");
const suffix = crypto.randomBytes(8).toString("hex");
const name = "sephora_group_assignment_test_" + suffix;
const otherClient = "group-fixture-" + suffix;
const otherRole = "pixcom_client_" + crypto.createHash("md5").update(otherClient).digest("hex");
const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
const testUrl = new URL(base); testUrl.pathname = "/" + name;
const admin = new pg.Pool({ connectionString: adminUrl.href });
const pool = new pg.Pool({ connectionString: testUrl.href });
const adminEmail = "group-admin@example.test", controllerEmail = "group-controller@example.test", password = "Group-Assignment-Fixture-2026!";
const screenIds = Array.from({ length: 72 }, (_, index) => "screen-" + String(index + 1).padStart(3, "0"));
const initial = [screenIds[0], screenIds[1], screenIds[36], screenIds[37]];
let created = false, roleCreated = false, server, logs = "", checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log("PASS " + label); };
const sorted = values => [...values].sort();
const sameIds = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const members = async (groupId = "group-main", clientId = "sephora") => (await pool.query("SELECT screen_id FROM group_members WHERE client_id=$1 AND group_id=$2 ORDER BY screen_id", [clientId, groupId])).rows.map(row => row.screen_id);
const auditCount = async () => (await pool.query("SELECT count(*)::int AS n FROM activity_log")).rows[0].n;
async function preservedSnapshot() {
  const snapshot = {};
  for (const { tablename } of (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows) {
    if (["auth_session", "auth_rate_limit", "activity_log", "group_members"].includes(tablename)) continue;
    snapshot[tablename] = (await pool.query(`SELECT to_jsonb(t) AS row FROM "${tablename.replaceAll('"', '""')}" t ORDER BY to_jsonb(t)::text`)).rows;
  }
  snapshot.otherMemberships = (await pool.query("SELECT * FROM group_members WHERE group_id<>'group-main' OR client_id<>'sephora' ORDER BY client_id,group_id,screen_id")).rows;
  return JSON.stringify(snapshot);
}

try {
  await fs.mkdir(".server-runtime", { recursive: true });
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  await migrate(pool);
  await pool.query("INSERT INTO clients(id,slug,name) VALUES($1,$1,'Other fixture client')", [otherClient]);
  await pool.query("SELECT pixcom_provision_client($1)", [otherClient]); roleCreated = true;
  const rows = [
    ["country", "country", "United Arab Emirates", null],
    ["dubai", "region", "Dubai", "country"], ["abu-dhabi", "region", "Abu Dhabi", "country"],
    ["dubai-mall", "store", "Dubai Mall", "dubai"], ["yas-mall", "store", "Yas Mall", "abu-dhabi"],
    ["group-main", "group", "Behind Cash", null], ["group-other", "group", "Panoramic", null],
    ...screenIds.map((id, index) => [id, "screen", `${index < 36 ? "TDM" : "YAS"} - Screen ${String(index + 1).padStart(2, "0")} - Behind Cash`, index < 36 ? "dubai-mall" : "yas-mall"]),
  ];
  for (const [id, type, label, parent] of rows) await pool.query("INSERT INTO entities(id,type,name,parent_id,is_demo,created_at) VALUES($1,$2,$3,$4,0,'2026-01-01')", [id, type, label, parent]);
  await pool.query("INSERT INTO entities(client_id,id,type,name,parent_id,created_at) VALUES($1,'foreign-group','group','Foreign group',NULL,'2026-01-01'),($1,'foreign-screen','screen','Foreign screen',NULL,'2026-01-01')", [otherClient]);
  for (const id of initial) await pool.query("INSERT INTO group_members(group_id,screen_id) VALUES('group-main',$1)", [id]);
  await pool.query("INSERT INTO group_members(group_id,screen_id) VALUES('group-other',$1)", [screenIds[71]]);
  await pool.query("INSERT INTO group_members(client_id,group_id,screen_id) VALUES($1,'foreign-group','foreign-screen')", [otherClient]);
  await pool.query("INSERT INTO display_state(client_id,id,selection,auto_advance,interval_seconds,updated_at) VALUES('sephora','main','{\"groupId\":\"group-main\"}',0,17,'2026-01-01') ON CONFLICT(client_id,id) DO UPDATE SET selection=excluded.selection,auto_advance=excluded.auto_advance,interval_seconds=excluded.interval_seconds,updated_at=excluded.updated_at");
  await pool.query("INSERT INTO screen_notes(screen_id,note,version,updated_at) VALUES($1,'Preserved fixture note','original','2026-01-01')", [screenIds[0]]);
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex");
  server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, COMPLAINT_ALERTS_ENABLED: "false", PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: testUrl.href, AUTH_URL: origin, AUTH_ADDITIONAL_ORIGINS: "",
    SCREEN_PHOTO_DIR: path.resolve(".server-runtime", name + "-screen-photos"), LOCATION_PHOTO_DIR: path.resolve(".server-runtime", name + "-location-photos"),
    AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL: adminEmail, AUTH_BOOTSTRAP_HASH: crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600000),
    PIXCOM_CLIENT_INTEGRATIONS: JSON.stringify({ sephora: {}, [otherClient]: {} }), PREVIEW_WORKER_DISABLED: "true", EMAIL_ALERT_WORKER_DISABLED: "true", WHATSAPP_ALERT_WORKER_DISABLED: "true",
    ONSIGN_API_TOKEN: "", ALERT_EMAIL_USER: "", ALERT_EMAIL_APP_PASSWORD: "", ULTRAMSG_TOKEN: "",
  } });
  server.stdout.on("data", chunk => logs += chunk); server.stderr.on("data", chunk => logs += chunk);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {} if (server.exitCode !== null) break; await new Promise(resolve => setTimeout(resolve, 200)); }
  check(ready, "production server starts against disposable group fixtures");
  const request = (route, body, cookie = "", extra = {}) => fetch(origin + route, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = async email => { const response = await request("/api/auth/sign-in/email", { email, password }); assert.ok(response.ok, "fixture login succeeds"); return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); };
  const groupSavePath = "/api/state?action=group-members";
  const save = (screenIds, expectedScreenIds, cookie = adminCookie, extra = {}, groupId = "group-main") => request(groupSavePath, { action: "group-members", groupId, screenIds, expectedScreenIds }, cookie, extra);
  check((await request("/api/activate", { token, password })).ok, "fixture Administrator activates");
  const adminCookie = await login(adminEmail);
  check((await request("/api/users", { action: "create", name: "Group controller", email: controllerEmail, role: "controller", password }, adminCookie)).ok, "fixture Controller account is created");
  const controllerCookie = await login(controllerEmail);
  const preserved = await preservedSnapshot();
  const baselineAudits = await auditCount();
  check((await save([], initial, "")).status === 401, "anonymous group changes are rejected");
  check((await save([], initial, controllerCookie)).status === 403, "Controllers cannot change group membership");
  check((await save([], initial, adminCookie, { Origin: "https://evil.example" })).status === 403, "cross-origin group changes are rejected");
  check((await save([], initial, adminCookie, { "x-client-id": otherClient })).status === 403, "the stale-tab header cannot select another client");
  check(sameIds(await members(), initial) && await auditCount() === baselineAudits, "rejected permissions leave memberships and activity unchanged");

  const noOp = await save([...initial].reverse(), [...initial].reverse());
  check(noOp.ok, "unchanged membership accepts any ID order");
  check(await auditCount() === baselineAudits, "an unchanged membership creates no duplicate activity");
  const all = await save(screenIds, initial);
  check(all.ok && sameIds(await members(), screenIds), "Select all saves every screen, including screens below the scroll area");
  check(await auditCount() === baselineAudits + 1, "one bulk save creates exactly one activity entry");
  const savedActivity = (await pool.query("SELECT * FROM activity_log WHERE entity_id='group-main' ORDER BY created_at DESC LIMIT 1")).rows[0];
  check(savedActivity?.entity_type === "group" && savedActivity.actor === adminEmail && savedActivity.entity_name === "Behind Cash", "bulk activity identifies the group and signed-in actor");
  const exceptions = screenIds.filter(id => id !== screenIds[3] && id !== screenIds[45]);
  check((await save(exceptions, screenIds)).ok && sameIds(await members(), exceptions), "individual exceptions after Select all are persisted exactly");
  const matchingCleared = exceptions.filter(id => !screenIds.slice(0, 36).includes(id));
  check((await save(matchingCleared, exceptions)).ok && sameIds(await members(), matchingCleared), "clearing a filtered subset preserves selections outside that subset");
  check((await save([], matchingCleared)).ok && (await members()).length === 0, "all assignments can be deliberately cleared");
  check((await save(initial, [])).ok, "an empty group can receive a new draft selection");

  const beforeInvalid = JSON.stringify({ members: await members(), audits: await auditCount() });
  const valid = { action: "group-members", groupId: "group-main", screenIds: initial, expectedScreenIds: initial };
  for (const body of [
    { ...valid, screenIds: undefined }, { ...valid, expectedScreenIds: undefined }, { ...valid, screenIds: null }, { ...valid, screenIds: "screen-001" },
    { ...valid, expectedScreenIds: {} }, { ...valid, screenIds: [screenIds[0], screenIds[0]] }, { ...valid, expectedScreenIds: [screenIds[0], screenIds[0]] },
    { ...valid, screenIds: [null] }, { ...valid, screenIds: [42] }, { ...valid, screenIds: [""] },
    { ...valid, screenIds: ["missing-screen"] }, { ...valid, screenIds: ["dubai-mall"] }, { ...valid, screenIds: ["group-other"] },
    { ...valid, screenIds: ["foreign-screen"] }, { ...valid, groupId: "foreign-group" }, { ...valid, groupId: "missing-group" }, { ...valid, groupId: "dubai-mall" },
  ]) {
    const response = await request(groupSavePath, body, adminCookie);
    check([400, 404].includes(response.status), "invalid, duplicate or cross-client batch input is rejected");
  }
  check((await fetch(origin + groupSavePath, { method: "POST", headers: { Origin: origin, Cookie: adminCookie, "Content-Type": "application/json" }, body: "{" })).status === 400, "malformed JSON is rejected");
  check((await fetch(origin + groupSavePath, { method: "POST", headers: { Origin: origin, Cookie: adminCookie, "Content-Type": "text/plain" }, body: "{}" })).status === 415, "non-JSON batch input is rejected");
  const unrelated = { action: "create", type: "group", name: "Unintended group", oversized: "x".repeat(66_000) };
  check((await request("/api/state", unrelated, adminCookie)).status === 413, "ordinary inventory writes retain the smaller JSON limit");
  check((await request(groupSavePath, unrelated, adminCookie)).status === 400, "the bulk path rejects unrelated inventory actions");
  check((await request(groupSavePath, { ...valid, oversized: "x".repeat(1024 * 1024) }, adminCookie)).status === 413, "the larger bulk body is still bounded");
  check((await request(groupSavePath, { ...valid, oversized: "x".repeat(66_000) }, controllerCookie)).status === 403, "Controllers cannot use the larger bulk path");
  check(JSON.stringify({ members: await members(), audits: await auditCount() }) === beforeInvalid, "all malformed requests leave the original group and activity untouched");
  check((await save([], [])).status === 409, "a stale membership snapshot cannot overwrite a saved group");
  check(sameIds(await members(), initial), "a stale save leaves the group unchanged");

  const beforeRaceAudits = await auditCount();
  const race = await Promise.all([save([screenIds[0]], initial), save([screenIds[2]], initial)]);
  check(race.map(response => response.status).sort().join(",") === "200,409", "simultaneous editors accept exactly one save and reject the stale editor");
  const raceWinner = await members();
  check(raceWinner.length === 1 && [screenIds[0], screenIds[2]].includes(raceWinner[0]) && await auditCount() === beforeRaceAudits + 1, "concurrent saves commit one complete selection and one activity entry");
  check((await save(initial, raceWinner)).ok, "a fresh snapshot can deliberately update the winning selection");

  const beforeFailure = JSON.stringify({ members: await members(), audits: await auditCount() });
  await pool.query(`CREATE FUNCTION reject_group_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.screen_id='${screenIds[4]}' THEN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='private group fixture failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_group_fixture BEFORE INSERT ON group_members FOR EACH ROW EXECUTE FUNCTION reject_group_fixture();`);
  try {
    const failed = await save([screenIds[4]], initial);
    check(failed.status === 503 && !(await failed.text()).includes("private group fixture failure"), "database failures return a controlled error without private details");
    check(JSON.stringify({ members: await members(), audits: await auditCount() }) === beforeFailure, "failure after removals rolls back every membership and audit change");
  } finally { await pool.query("DROP TRIGGER reject_group_fixture ON group_members; DROP FUNCTION reject_group_fixture()"); }
  await pool.query("CREATE FUNCTION reject_group_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='private audit fixture failure'; END $$; CREATE TRIGGER reject_group_audit_fixture BEFORE INSERT ON activity_log FOR EACH ROW EXECUTE FUNCTION reject_group_audit_fixture();");
  try {
    check((await save([screenIds[4]], initial)).status === 503, "audit write failure rejects the entire group change");
    check(JSON.stringify({ members: await members(), audits: await auditCount() }) === beforeFailure, "audit failure also rolls back the selected screen set");
  } finally { await pool.query("DROP TRIGGER reject_group_audit_fixture ON activity_log; DROP FUNCTION reject_group_audit_fixture()"); }

  check((await request("/api/state", { action: "member", groupId: "group-main", screenId: screenIds[4], enabled: true }, adminCookie)).ok && (await members()).includes(screenIds[4]), "the existing individual membership action remains compatible");
  check((await request("/api/state", { action: "member", groupId: "group-main", screenId: screenIds[4], enabled: false }, adminCookie)).ok && sameIds(await members(), initial), "the existing individual unassignment action remains compatible");
  check(await preservedSnapshot() === preserved, "bulk changes preserve every other group, client, account, setting, inventory and photo reference");
  const freshState = await (await request("/api/state?activity=none", undefined, adminCookie)).json();
  check(sameIds(freshState.members.filter(member => member.groupId === "group-main").map(member => member.screenId), initial), "a fresh page receives the final saved membership from the server");

  const duplicate = (sourceGroupId, name, cookie = adminCookie, headers = {}) =>
    request("/api/state", { action: "duplicate-group", sourceGroupId, name }, cookie, headers);
  const beforeDuplicateAudits = await auditCount();
  check((await duplicate("group-main", "Test copy", "")).status === 401, "group duplication requires a signed-in user");
  check((await duplicate("group-main", "Test copy", controllerCookie)).status === 403, "Controllers cannot duplicate groups");
  check((await duplicate("group-main", "Test copy", adminCookie, { Origin: "https://evil.example" })).status === 403, "group duplication requires the same origin");
  check((await duplicate("group-main", "Test copy", adminCookie, { "x-client-id": otherClient })).status === 403, "a stale tab cannot duplicate a group in another client");
  for (const invalidName of [undefined, "   ", 42, "x".repeat(81), "Invalid\0copy"]) {
    check((await duplicate("group-main", invalidName)).status === 400, "invalid duplicate group names are rejected");
  }
  for (const invalidSource of ["missing-group", screenIds[0], "foreign-group"]) {
    check((await duplicate(invalidSource, "Test copy")).status === 404, "the source must be a group in the current client");
  }
  check((await duplicate("group-main", "  behind cash  ")).status === 409, "the copy cannot reuse the original name after trimming and ignoring case");
  check(await preservedSnapshot() === preserved && await auditCount() === beforeDuplicateAudits, "rejected duplicate attempts create no groups, memberships or activity");

  const copyResponse = await duplicate("group-main", "  Behind Cash (copy)  ");
  check(copyResponse.ok, "an Administrator can duplicate a group");
  const copyState = await copyResponse.json();
  const copyId = copyState.duplicatedGroupId;
  const copy = copyState.entities.find(entity => entity.id === copyId);
  check(copy?.type === "group" && copy.id !== "group-main" && copy.name === "Behind Cash (copy)", "the response identifies an independent group with the trimmed custom name");
  check(sameIds(await members(copyId), initial) && sameIds(await members(), initial), "the copy starts with the same screen IDs and the original keeps all assignments");
  check(sameIds(copyState.entities.filter(entity => entity.type === "screen").map(screen => screen.id), screenIds), "duplication shares existing screens without creating screen records");
  assert.deepEqual(copyState.display, freshState.display, "duplicating a group preserves the current wall selection and rotation");
  const copyAudits = (await pool.query("SELECT * FROM activity_log WHERE entity_id=$1", [copyId])).rows;
  check(copyAudits.length === 1 && copyAudits[0].entity_type === "group" && copyAudits[0].actor === adminEmail && copyAudits[0].entity_name === copy.name && await auditCount() === beforeDuplicateAudits + 1, "the copy creates one activity entry identifying the new group and actor");
  check((await save([screenIds[4]], initial, adminCookie, {}, copyId)).ok && sameIds(await members(copyId), [screenIds[4]]) && sameIds(await members(), initial), "editing the copied group's screens does not change the original");
  check((await duplicate("group-main", "Behind Cash (COPY)")).status === 409, "reusing an existing copy name is rejected");

  const simultaneousCopies = await Promise.all([duplicate("group-main", "Parallel copy"), duplicate("group-main", "PARALLEL COPY")]);
  check(simultaneousCopies.map(response => response.status).sort().join(",") === "200,409", "simultaneous duplicate names produce exactly one successful copy");
  const raceCopyId = (await simultaneousCopies.find(response => response.ok).json()).duplicatedGroupId;
  check(raceCopyId && sameIds(await members(raceCopyId), initial), "the winning copy has the complete source screen list");

  const emptyResponse = await request("/api/state", { action: "create", type: "group", name: "Empty fixture group" }, adminCookie);
  assert.ok(emptyResponse.ok, "empty group fixture can be created");
  const emptyId = (await emptyResponse.json()).entities.find(entity => entity.name === "Empty fixture group").id;
  const emptyCopyResponse = await duplicate(emptyId, "Foreign group");
  check(emptyCopyResponse.ok, "an empty group can be duplicated using a name in use only by a different client");
  const emptyCopyId = (await emptyCopyResponse.json()).duplicatedGroupId;
  check(emptyCopyId && (await members(emptyCopyId)).length === 0, "an empty group's copy has no assignments");

  const beforeFailedCopy = await preservedSnapshot(), beforeFailedCopyAudits = await auditCount();
  await pool.query("CREATE FUNCTION reject_group_copy_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='XX000', MESSAGE='private copy fixture failure'; END $$; CREATE TRIGGER reject_group_copy_fixture BEFORE INSERT ON activity_log FOR EACH ROW WHEN (NEW.entity_name = 'Rollback copy') EXECUTE FUNCTION reject_group_copy_fixture();");
  try {
    const failedCopy = await duplicate("group-main", "Rollback copy");
    check(failedCopy.status === 503 && !(await failedCopy.text()).includes("private copy fixture failure"), "a failed copy reports a controlled error");
    check(await preservedSnapshot() === beforeFailedCopy && sameIds(await members(), initial) && await auditCount() === beforeFailedCopyAudits, "audit failure rolls back the entire copy including the new group and assignments");
  } finally { await pool.query("DROP TRIGGER reject_group_copy_fixture ON activity_log; DROP FUNCTION reject_group_copy_fixture()"); }

  for (const id of [copyId, raceCopyId, emptyCopyId, emptyId]) {
    assert.ok((await request("/api/state", { action: "delete", id }, adminCookie)).ok, "temporary test copies can be deleted");
  }
  check(await preservedSnapshot() === preserved && sameIds(await members(), initial), "duplicating, modifying and deleting copies preserves the original groups, screens and wall settings");

  const largeGroupId = crypto.randomUUID();
  const largeScreenIds = Array.from({ length: 1_000 }, () => crypto.randomUUID());
  const largeGroupSave = (selectedIds, expectedIds) => save(selectedIds, expectedIds, adminCookie, {}, largeGroupId);
  await pool.query("INSERT INTO entities(id,type,name,is_demo,created_at) VALUES($1,'group','Large fixture group',0,'2026-01-01')", [largeGroupId]);
  await pool.query("INSERT INTO entities(id,type,name,parent_id,is_demo,created_at) SELECT id,'screen','Bulk screen ' || position,'dubai-mall',0,'2026-01-01' FROM unnest($1::text[]) WITH ORDINALITY AS screens(id,position)", [largeScreenIds]);
  check((await largeGroupSave(largeScreenIds, [])).ok && sameIds(await members(largeGroupId), largeScreenIds), "Select all saves 1,000 screens with real-length IDs");
  const oneUnticked = largeScreenIds.slice(1);
  check((await largeGroupSave(oneUnticked, largeScreenIds)).ok && sameIds(await members(largeGroupId), oneUnticked), "a group with 1,000 screens can save an exception with both full snapshots");
  check((await largeGroupSave([], largeScreenIds)).status === 409 && sameIds(await members(largeGroupId), oneUnticked), "a stale large snapshot cannot overwrite the current assignments");
  check((await largeGroupSave([], oneUnticked)).ok && !(await members(largeGroupId)).length, "all assignments can be removed from a large group");
  await pool.query("DELETE FROM entities WHERE id=ANY($1::text[])", [[largeGroupId, ...largeScreenIds]]);
  check(await preservedSnapshot() === preserved && sameIds(await members(), initial), "large saves preserve original groups, screens and wall settings");

  if (process.env.GROUP_SCREEN_ASSIGNMENT_UI === "true") {
    const done = path.resolve(".server-runtime/group-screen-assignment-ui.done");
    await fs.rm(done, { force: true });
    await pool.query("DELETE FROM auth_rate_limit");
    await fs.writeFile(".server-runtime/group-screen-assignment-ui.json", JSON.stringify({ origin, adminEmail, controllerEmail, password, dbName: name, groupId: "group-main", groupName: "Behind Cash", initial, screenIds, otherClient }));
    console.log("UI fixture ready: " + origin);
    while (!await fs.stat(done).then(() => true, () => false)) await new Promise(resolve => setTimeout(resolve, 500));
    await fs.rm(done, { force: true });
  }
  console.log(`${checks} group screen assignment integration checks passed.`);
} catch (error) { console.error(logs.slice(-1600)); throw error; }
finally {
  if (server && server.exitCode === null) { const exit = once(server, "exit"); server.kill(); await exit; }
  await closeTestPool(pool);
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  if (roleCreated) await admin.query(`DROP ROLE IF EXISTS "${otherRole}"`);
  await admin.end();
}
