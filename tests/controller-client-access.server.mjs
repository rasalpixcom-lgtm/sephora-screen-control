// Exercise the standalone application against an isolated PostgreSQL database.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import sharp from "sharp";
import { migrate } from "../scripts/migrate-postgres.mjs";
import { closeTestPool } from "./fixtures/postgres-pool.mjs";

const base = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname) && base.port === "55432", "Use the separate local development PostgreSQL service");
const controllerMigration = "0037_controller_client_access.sql";
const migrationName = "0038_staff_client_access.sql";
const databaseName = "sephora_controller_access_test_" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
const testUrl = new URL(base); testUrl.pathname = "/" + databaseName;
const admin = new pg.Pool({ connectionString: adminUrl.href });
const pool = new pg.Pool({ connectionString: testUrl.href });
const password = "Controller-Access-Fixture-2026!";
const adminEmail = "controller-access-admin@example.test";
const selectedAdminEmail = "selected-admin@example.test";
const secondAdminEmail = "second-full-admin@example.test";
const selectedEmail = "controller-access-selected@example.test";
const allEmail = "controller-access-all@example.test";
const assigned = { id: "field-assigned", name: "Assigned Client" };
const hidden = { id: "field-hidden", name: "Hidden Client" };
const future = { id: "field-future", name: "Future Client" };
let server, created = false, logs = "", checks = 0;
const check = (condition, description) => { assert.ok(condition, description); checks++; console.log("PASS " + description); };
const legacyAccounts = async () => (await pool.query("SELECT to_jsonb(u) - 'controller_client_ids' AS row FROM auth_user u ORDER BY id")).rows;
const applyFixtureMigration = async file => {
  const sql = (await fs.readFile(path.join("db/postgres-migrations", file), "utf8")).replace(/\r\n/g, "\n");
  await pool.query(sql);
  await pool.query("INSERT INTO server_migrations(name,checksum) VALUES($1,$2)", [file, crypto.createHash("sha256").update(sql).digest("hex")]);
};
const addClient = async ({ id, name }) => {
  await pool.query("INSERT INTO clients(id,slug,name) VALUES($1,$1,$2)", [id, name]);
  await pool.query("SELECT pixcom_provision_client($1)", [id]);
};

try {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await pool.query("CREATE TABLE server_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const migrations = await fs.readdir("db/postgres-migrations");
  for (const file of migrations.filter(file => file.endsWith(".sql") && file < controllerMigration).sort()) await applyFixtureMigration(file);
  await pool.query(`INSERT INTO auth_user(id,name,email,created_at,updated_at,role,disabled)
    VALUES ('legacy-controller','Previous Controller','legacy@example.test',now(),now(),'controller',false);
    INSERT INTO auth_account(id,account_id,provider_id,user_id,password,created_at,updated_at)
    VALUES('legacy-credential','legacy-controller','credential','legacy-controller','existing-fixture-hash',now(),now());
    INSERT INTO client_memberships(client_id,user_id,role) VALUES ('sephora','legacy-controller','controller');`);
  const originalAccounts = await legacyAccounts();
  const originalCredentials = (await pool.query("SELECT * FROM auth_account ORDER BY id")).rows;
  const originalMemberships = (await pool.query("SELECT * FROM client_memberships ORDER BY client_id,user_id")).rows;
  await applyFixtureMigration(controllerMigration);
  assert.deepEqual(await legacyAccounts(), originalAccounts);
  assert.deepEqual((await pool.query("SELECT * FROM auth_account ORDER BY id")).rows, originalCredentials);
  assert.deepEqual((await pool.query("SELECT * FROM client_memberships ORDER BY client_id,user_id")).rows, originalMemberships);
  check((await pool.query("SELECT controller_client_ids FROM auth_user WHERE id='legacy-controller'")).rows[0].controller_client_ids === null,
    "migration preserves existing accounts, passwords and memberships and keeps All clients");
  await pool.query(`UPDATE auth_user SET controller_client_ids=ARRAY['sephora'] WHERE id='legacy-controller';
    INSERT INTO auth_user(id,name,email,created_at,updated_at,role,disabled)
    VALUES('legacy-admin','Previous Admin','legacy-admin@example.test',now(),now(),'admin',false)`);
  const accountsBeforeStaffMigration = (await pool.query("SELECT * FROM auth_user ORDER BY id")).rows;
  await migrate(pool);
  await migrate(pool);
  const accountsAfterStaffMigration = (await pool.query("SELECT * FROM auth_user ORDER BY id")).rows;
  check(JSON.stringify(accountsAfterStaffMigration) === JSON.stringify(accountsBeforeStaffMigration),
    "migration 0038 preserves existing Controller assignments, Admin access and account values");
  // Remove the migration-only fixtures so the normal first-Admin setup can run.
  await pool.query("DELETE FROM auth_user WHERE id IN ('legacy-controller','legacy-admin')");
  await addClient(assigned);
  await addClient(hidden);
  await pool.query("INSERT INTO clients(id,slug,name,archived_at) VALUES('field-archived','field-archived','Archived Client',now())");
  const art = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#19745d" } }).webp().toBuffer();
  const imageVersions = new Map();
  for (const { id } of [assigned, hidden]) {
    const version = crypto.randomUUID();
    imageVersions.set(id, version);
    await pool.query("INSERT INTO client_logos(client_id,version,image,updated_by) VALUES($1,$2,$3,'fixture')", [id, version, art]);
    await pool.query("INSERT INTO client_backgrounds(client_id,version,image,updated_by) VALUES($1,$2,$3,'fixture')", [id, version, art]);
  }

  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const token = crypto.randomBytes(32).toString("hex");
  server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: testUrl.href, AUTH_URL: origin, AUTH_ADDITIONAL_ORIGINS: "",
    AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL: adminEmail, AUTH_BOOTSTRAP_HASH: crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600000), TRUST_PROXY: "true",
    PIXCOM_CLIENT_INTEGRATIONS: '{"sephora":{}}', PREVIEW_WORKER_DISABLED: "true", EMAIL_ALERT_WORKER_DISABLED: "true", WHATSAPP_ALERT_WORKER_DISABLED: "true", COMPLAINT_ALERTS_ENABLED: "false",
    ONSIGN_API_TOKEN: "", ALERT_EMAIL_USER: "", ALERT_EMAIL_APP_PASSWORD: "", ULTRAMSG_TOKEN: "",
  } });
  server.stdout.on("data", chunk => logs += chunk); server.stderr.on("data", chunk => logs += chunk);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  check(ready, "production server accepts the new access migration");
  const migration = (await pool.query("DELETE FROM server_migrations WHERE name=$1 RETURNING *", [migrationName])).rows[0];
  try {
    check((await fetch(origin + "/api/health")).status === 503, "health refuses a missing access migration");
  } finally {
    await pool.query("INSERT INTO server_migrations(name,checksum,applied_at) VALUES($1,$2,$3)", [migration.name, migration.checksum, migration.applied_at]);
  }

  const request = (route, body, cookie = "", extra = {}) => fetch(origin + route, {
    method: body === undefined ? "GET" : "POST", redirect: "manual",
    headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let loginNumber = 0;
  const cookiesFrom = response => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const login = async (email, credential = password) => {
    const response = await request("/api/auth/sign-in/email", { email, password: credential }, "", { "x-forwarded-for": `192.0.2.${++loginNumber}` });
    assert.ok(response.ok, `Fixture login failed: ${response.status}`);
    return cookiesFrom(response);
  };
  const select = async (id, cookie) => {
    const response = await request("/api/workspaces", { clientId: id }, cookie);
    assert.ok(response.ok, await response.clone().text());
    return cookie + "; " + cookiesFrom(response).split("; ").find(value => value.startsWith("pixcom-workspace="));
  };
  const cards = async cookie => {
    const response = await request("/workspaces", undefined, cookie);
    assert.ok(response.ok, await response.clone().text());
    return Array.from((await response.text()).matchAll(/<button\b[^>]*aria-label="Open ([^"]+)"/g), match => match[1]);
  };
  assert.ok((await request("/api/activate", { token, password })).ok);
  const adminCookie = await login(adminEmail);
  const create = (email, role, fields = {}) => request("/api/users", { action: "create", name: email, email, role, password, ...fields }, adminCookie);
  for (const clientIds of ["all", ["../invalid"], [assigned.id, assigned.id], ["field-missing"], ["field-archived"], Array.from({ length: 501 }, (_, i) => `field-${i}`)]) {
    check((await create(selectedEmail, "controller", { clientIds })).status === 400, "invalid or unavailable client assignments are rejected");
  }
  assert.ok((await create(selectedEmail, "controller", { clientIds: [assigned.id] })).ok);
  assert.ok((await create(allEmail, "controller")).ok);
  assert.ok((await create(selectedAdminEmail, "admin", { clientIds: [assigned.id] })).ok);
  assert.ok((await create(secondAdminEmail, "admin")).ok);
  const list = async () => (await request("/api/users", undefined, adminCookie)).json();
  const { users, clients } = await list();
  const selectedUser = users.find(user => user.email === selectedEmail);
  const scopedAdmin = users.find(user => user.email === selectedAdminEmail);
  const fullAdmin = users.find(user => user.email === adminEmail);
  const secondAdmin = users.find(user => user.email === secondAdminEmail);
  const update = async (fields, revision, cookie = adminCookie) => {
    const expectedVersion = revision ?? (await list()).users.find(user => user.id === selectedUser.id).editVersion;
    return request("/api/users", { action: "update", id: selectedUser.id, expectedVersion, role: "controller", disabled: false, ...fields }, cookie);
  };
  assert.deepEqual(clients.map(client => client.id).sort(), [assigned.id, hidden.id, "sephora"].sort());
  assert.deepEqual(selectedUser.clientIds, [assigned.id]);
  check([fullAdmin, secondAdmin, users.find(user => user.email === allEmail)].every(user => user.clientIds === null), "Admin and Controller accounts default to All clients when no assignment is supplied");
  check(scopedAdmin.clientIds.join() === assigned.id, "Admin can be created with selected client access");
  assert.ok((await update({ name: "Renamed Controller" })).ok);
  check((await list()).users.find(user => user.id === selectedUser.id).clientIds.join() === assigned.id, "editing an account without client IDs preserves its assignments");

  const secondAdminCookie = await login(secondAdminEmail);
  const firstEditor = (await list()).users.find(user => user.id === selectedUser.id);
  const latestEdit = await update({ disabled: true, clientIds: [hidden.id] }, firstEditor.editVersion, secondAdminCookie);
  check(latestEdit.ok, "another Admin can save a current account edit");
  check((await update({ name: "Outdated edit", clientIds: [assigned.id] }, firstEditor.editVersion)).status === 409,
    "an older editor cannot overwrite newer status or client assignments");
  check((await update({ name: "Reload required", expectedVersion: undefined })).status === 409, "an edit without a version must reload the account");
  const latestUser = (await list()).users.find(user => user.id === selectedUser.id);
  check(latestUser.disabled && latestUser.clientIds.join() === hidden.id && latestUser.name === firstEditor.name,
    "the current account survives both rejected edits");
  check((await update({ clientIds: [assigned.id] }, latestUser.editVersion)).ok, "reopening the account allows a fresh edit");

  const allCookie = await login(allEmail);
  const selectedCookie = await login(selectedEmail);
  const selectedWorkspace = await select(assigned.id, selectedCookie);
  check((await cards(selectedCookie)).join() === assigned.name, "Choose client shows only the assigned card");
  check((await cards(allCookie)).includes(hidden.name) && (await cards(adminCookie)).includes(hidden.name), "All clients continues to include every active client");
  await addClient(future);
  check((await cards(allCookie)).includes(future.name) && (await cards(selectedCookie)).join() === assigned.name, "new clients are available only to All clients accounts until assigned");
  check((await request("/api/workspaces", { clientId: hidden.id }, selectedCookie)).status === 403, "switching to an unassigned client is denied");
  const direct = await request("/controller", undefined, selectedCookie);
  check(direct.status === 307 && direct.headers.get("location") === "/workspaces", "direct Controller link cannot open an unassigned default workspace");
  check((await request("/api/state", undefined, selectedWorkspace)).ok, "Controller opens inventory for the assigned client");
  check((await request("/api/state", undefined, selectedWorkspace, { "x-client-id": hidden.id })).status === 403, "workspace header cannot bypass assignments");
  check((await request("/api/users", undefined, selectedCookie)).status === 403, "Controller cannot administer accounts");

  for (const image of ["logo", "background"]) {
    const getImage = id => request(`/api/client-${image}?client=${id}&v=${imageVersions.get(id)}`, undefined, selectedCookie);
    check((await getImage(assigned.id)).ok && (await getImage(hidden.id)).status === 404, `Controller only receives assigned clients' ${image} images`);
  }
  await pool.query("INSERT INTO user_client_order(user_id,client_ids,version) VALUES($1,$2::jsonb,$3)", [selectedUser.id, JSON.stringify([hidden.id, assigned.id]), crypto.randomUUID()]);
  const orderRoute = "/api/client-card-order";
  const order = await (await request(orderRoute, undefined, selectedCookie)).json();
  check(order.order.join() === assigned.id, "saved order does not expose formerly available client IDs");
  check((await request(orderRoute, { order: [hidden.id], expectedVersion: order.version }, selectedCookie, { "x-client-order-user": selectedUser.id })).status === 403, "Controller cannot save an unassigned client in the card order");
  check((await request(orderRoute, { order: [assigned.id], expectedVersion: order.version }, selectedCookie, { "x-client-order-user": selectedUser.id })).ok, "Controller can save the assigned client in the card order");

  const hiddenAdminWorkspace = await select(hidden.id, adminCookie);
  assert.ok((await request("/api/controller-client", {}, hiddenAdminWorkspace)).ok);
  check((await request("/api/monitor-state?scope=all", undefined, selectedWorkspace)).status === 403, "signed-in common monitor does not expose an unassigned current client");
  const monitorListing = await request("/api/monitor-clients", undefined, selectedCookie);
  assert.ok(monitorListing.ok);
  check((await monitorListing.json()).clients.map(client => client.id).join() === assigned.id, "signed-in monitor client list is scoped to assignments");
  check((await request("/api/monitor-state", undefined, selectedWorkspace)).ok, "signed-in Controller can monitor the assigned client");
  for (const [scope, workspace, endpoint] of [["", hiddenAdminWorkspace, `?client=${hidden.id}`], ["?scope=all", adminCookie, "?scope=all"]]) {
    const response = await request("/api/monitor-link" + scope, { action: "create" }, workspace);
    assert.ok(response.ok, await response.clone().text());
    const key = new URL((await response.json()).link).hash.slice(5);
    const publicMonitor = await request("/api/monitor-state" + endpoint, undefined, "", { Authorization: "Bearer " + key });
    check(publicMonitor.ok && (await publicMonitor.json()).clientId === hidden.id, "a valid independent monitor link continues to open its display");
  }
  assert.ok((await request("/api/controller-client", {}, selectedWorkspace)).ok);
  const assignedCommonMonitor = await request("/api/monitor-state?scope=all", undefined, selectedWorkspace);
  check(assignedCommonMonitor.ok && (await assignedCommonMonitor.json()).clientId === assigned.id,
    "signed-in Controller can see the common wall when it shows an assigned client");

  // Simulate a previously signed workspace cookie after its membership is removed while the session still exists.
  await pool.query("UPDATE auth_user SET controller_client_ids='{}' WHERE id=$1", [selectedUser.id]);
  check((await request("/api/state", undefined, selectedWorkspace)).status === 403, "a signed workspace cookie cannot outlive its client assignment");
  check((await request("/api/controller-client", {}, selectedWorkspace)).status === 403, "a removed assignment cannot control the common wall");
  assert.ok((await update({ clientIds: [] })).ok);
  check((await request("/api/state", undefined, selectedWorkspace)).status === 401, "editing access revokes pre-existing sessions");
  const noClients = await login(selectedEmail);
  check((await cards(noClients)).length === 0, "Selected clients with an empty list authorizes no clients");
  const accountPage = await request("/account", undefined, noClients);
  check(accountPage.ok && (await accountPage.text()).includes("Your account"), "a Controller without client assignments can still open their own account");
  const newPassword = "Controller-Access-New-Fixture-2026!";
  check((await request("/api/auth/change-password", { currentPassword: password, newPassword }, noClients)).ok,
    "a Controller without client assignments can still change their own password");
  assert.ok((await update({ clientIds: null })).ok);
  const restored = await login(selectedEmail, newPassword);
  check((await cards(restored)).length === 4 && (await request("/api/workspaces", { clientId: hidden.id }, restored)).ok, "returning to All clients restores every active workspace");
  assert.ok((await update({ clientIds: [assigned.id, hidden.id] })).ok);
  const multiple = await login(selectedEmail, newPassword);
  check((await cards(multiple)).join() === [hidden.name, assigned.name].join() && (await request("/api/workspaces", { clientId: hidden.id }, multiple)).ok,
    "multiple selected clients can be opened in their restored saved order");

  const scopedAdminCookie = await login(selectedAdminEmail);
  const scopedAdminWorkspace = await select(assigned.id, scopedAdminCookie);
  check((await cards(scopedAdminCookie)).join() === assigned.name, "assigned Admin sees only their client cards");
  check(!(await (await request("/workspaces", undefined, scopedAdminCookie)).text()).includes('href="/admin/clients"'),
    "assigned Admin does not see the system Administration card");
  check((await cards(secondAdminCookie)).includes(future.name), "All clients Admin opens new clients without an assignment edit");
  check((await request("/api/workspaces", { clientId: hidden.id }, scopedAdminCookie)).status === 403, "assigned Admin cannot switch to an unassigned client");
  const scopedDirect = await request("/admin", undefined, scopedAdminCookie);
  check(scopedDirect.status === 307 && scopedDirect.headers.get("location") === "/workspaces", "direct Admin page requires an authorized workspace");
  for (const route of ["/admin", "/admin/screens", "/admin/groups", "/admin/settings"]) {
    check((await request(route, undefined, scopedAdminWorkspace)).ok, `assigned Admin can open ${route} for their client`);
  }
  for (const route of ["/admin/clients", "/admin/users"]) {
    const response = await request(route, undefined, scopedAdminWorkspace);
    check(response.status === 307 && response.headers.get("location") === "/workspaces", `assigned Admin cannot open global ${route}`);
    check((await request(route, undefined, secondAdminCookie)).ok, `All clients Admin can open ${route}`);
  }
  check((await request("/api/email-alerts", undefined, scopedAdminWorkspace)).ok, "assigned Admin can manage client email settings");
  check((await request("/api/whatsapp-alerts", undefined, scopedAdminWorkspace)).ok, "assigned Admin can manage client WhatsApp settings");
  const group = { action: "create", type: "group", name: "Assigned Admin group" };
  check((await request("/api/state", group, scopedAdminWorkspace)).ok, "assigned Admin can manage groups in the assigned client");
  check((await request("/api/state", { ...group, name: "Wrong client" }, scopedAdminWorkspace, { "x-client-id": hidden.id })).status === 403,
    "assigned Admin cannot redirect a client mutation with a different workspace header");
  const savedGroups = await pool.query("SELECT client_id,name FROM entities WHERE type='group' AND name IN ($1,$2)", [group.name, "Wrong client"]);
  assert.deepEqual(savedGroups.rows, [{ client_id: assigned.id, name: group.name }]);
  for (const image of ["logo", "background"]) {
    const getImage = id => request(`/api/client-${image}?client=${id}&v=${imageVersions.get(id)}`, undefined, scopedAdminCookie);
    check((await getImage(assigned.id)).ok && (await getImage(hidden.id)).status === 404, `assigned Admin can load only assigned clients' ${image} images`);
  }

  const assignedMonitor = await request("/api/monitor-link", { action: "create" }, scopedAdminWorkspace);
  check(assignedMonitor.ok, "assigned Admin can create a monitor link for the assigned client");
  const assignedLink = await assignedMonitor.json();
  const assignedKey = new URL(assignedLink.link).hash.slice(5);
  const assignedPublicMonitor = await request(`/api/monitor-state?client=${assigned.id}`, undefined, "", { Authorization: `Bearer ${assignedKey}` });
  check(assignedPublicMonitor.ok && (await assignedPublicMonitor.json()).clientId === assigned.id, "the assigned client's private monitor link works independently");
  const scopedMonitorListing = await request("/api/monitor-clients", undefined, scopedAdminCookie);
  check(scopedMonitorListing.ok && (await scopedMonitorListing.json()).clients.map(client => client.id).join() === assigned.id,
    "signed-in Admin monitor list respects client assignments");
  assert.ok((await request("/api/controller-client", {}, hiddenAdminWorkspace)).ok);
  check((await request("/api/monitor-state?scope=all", undefined, scopedAdminWorkspace)).status === 403,
    "assigned Admin cannot see an unassigned common wall without its independent key");
  check((await request("/api/controller-client", {}, scopedAdminWorkspace)).ok, "assigned Admin can control the wall for the assigned client");

  const blockedMutations = [
    ["/api/users", { action: "update", id: scopedAdmin.id, role: "admin", disabled: false, clientIds: null }],
    ["/api/users", { action: "reset", id: fullAdmin.id, password }],
    ["/api/clients", { action: "create", name: "Unauthorized fixture client" }],
    ["/api/client-branding", { clientId: assigned.id, name: "Unauthorized rename", expectedName: assigned.name,
      logo: { action: "keep", expectedVersion: imageVersions.get(assigned.id) }, background: { action: "keep", expectedVersion: imageVersions.get(assigned.id) } }],
    ["/api/client-logo", { clientId: assigned.id, action: "remove", expectedVersion: imageVersions.get(assigned.id) }],
    ["/api/client-onsign", { clientId: assigned.id, action: "disable", version: null }],
    ["/api/monitor-link?scope=all", { action: "create" }],
  ];
  for (const [route, body] of blockedMutations) {
    check((await request(route, body, scopedAdminWorkspace)).status === 403, `assigned Admin cannot change system settings through ${route} (${body.action || "branding"})`);
  }
  for (const route of ["/api/users", "/api/clients", `/api/client-onsign?client=${assigned.id}`, "/api/monitor-link?scope=all"]) {
    check((await request(route, undefined, scopedAdminWorkspace)).status === 403, `assigned Admin cannot read system settings through ${route}`);
    check((await request(route, undefined, secondAdminCookie)).ok, `All clients Admin can read ${route}`);
  }
  check((await cards(scopedAdminCookie)).join() === assigned.name, "a rejected self-assignment cannot grant global access");

  const updateAdmin = (target, authority, clientIds, disabled = false) => request("/api/users",
    { action: "update", id: target.id, expectedVersion: target.editVersion, role: "admin", disabled, clientIds }, authority);
  check((await updateAdmin(fullAdmin, adminCookie, [assigned.id])).status === 400, "All clients Admin cannot restrict their own access");
  const linkLock = await pool.connect();
  let queuedReplacement;
  try {
    await linkLock.query("BEGIN");
    await linkLock.query("SELECT pg_advisory_xact_lock(724018, hashtext($1))", [assigned.id]);
    queuedReplacement = request("/api/monitor-link", { action: "replace", generation: assignedLink.generation }, scopedAdminWorkspace);
    let waiting = false;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",
        [linkLock.processID],
      );
      waiting = rowCount > 0;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(waiting, "the assigned Admin's private link replacement reached the link lock");
    const grant = await updateAdmin(scopedAdmin, adminCookie, [hidden.id]);
    check(grant.ok, "All clients Admin can reassign another Admin while the private link replacement is waiting");
  } finally {
    try { await linkLock.query("ROLLBACK"); } finally { linkLock.release(); }
  }
  const blockedReplacement = await queuedReplacement;
  check(blockedReplacement.status === 401 && !Object.hasOwn(await blockedReplacement.json(), "link"),
    "the queued private monitor link replacement is denied after revocation without issuing a key");
  const unchangedPrivateMonitor = await request(`/api/monitor-state?client=${assigned.id}`, undefined, "", { Authorization: `Bearer ${assignedKey}` });
  check(unchangedPrivateMonitor.ok && (await unchangedPrivateMonitor.json()).clientId === assigned.id,
    "the assigned client's original private monitor link remains active after the denied replacement");
  check((await request("/api/state", undefined, scopedAdminWorkspace)).status === 401, "reassignment revokes the Admin's previous session");
  const reassignedCookie = await login(selectedAdminEmail);
  check((await cards(reassignedCookie)).join() === hidden.name && (await request("/api/workspaces", { clientId: assigned.id }, reassignedCookie)).status === 403,
    "reassigned Admin has the new client and loses the previous one on sign-in");

  const concurrentChanges = await Promise.all([
    updateAdmin(secondAdmin, adminCookie, [assigned.id]),
    updateAdmin(fullAdmin, secondAdminCookie, [hidden.id]),
  ]);
  check(concurrentChanges.filter(response => response.ok).length === 1, "concurrent restrictions cannot remove both All clients Admins");
  const remaining = (await pool.query("SELECT id FROM auth_user WHERE role='admin' AND NOT disabled AND controller_client_ids IS NULL")).rows;
  check(remaining.length === 1, "at least one enabled All clients Admin remains");
  const originalSurvives = remaining[0].id === fullAdmin.id;
  const survivorCookie = originalSurvives ? adminCookie : secondAdminCookie;
  const revokedCookie = originalSurvives ? secondAdminCookie : adminCookie;
  check((await updateAdmin(originalSurvives ? fullAdmin : secondAdmin, survivorCookie, null, true)).status === 400,
    "last enabled All clients Admin cannot disable their own account");
  check((await request("/api/users", { action: "revoke", id: selectedUser.id }, revokedCookie)).status === 401,
    "a revoked All clients Admin session cannot save a global account change");
  check((await request("/api/users", undefined, survivorCookie)).ok, "the remaining All clients Admin retains account management");
  console.log(`${checks} staff client access integration checks passed.`);
} catch (error) {
  console.error(logs.slice(-1800));
  throw error;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exit = once(server, "exit");
    server.kill();
    await exit;
  }
  await closeTestPool(pool);
  if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await closeTestPool(admin);
}
