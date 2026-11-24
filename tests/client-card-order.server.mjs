// All writes, migrations and accounts below belong to one disposable local DB.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import pg from "pg";
import sharp from "sharp";
import { migrate } from "../scripts/migrate-postgres.mjs";
import { closeTestPool } from "./fixtures/postgres-pool.mjs";

const base = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname) && base.port === "55432", "Use the isolated local development PostgreSQL service");
const name = "sephora_card_order_test_" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
const testUrl = new URL(base); testUrl.pathname = "/" + name;
const admin = new pg.Pool({ connectionString: adminUrl.href });
const pool = new pg.Pool({ connectionString: testUrl.href });
const adminEmail = "card-order-admin@example.test", controllerEmail = "card-order-controller@example.test";
const password = "Client-Card-Order-Fixture-2026!";
const fixtureNames = ["Acqua di Parma", "Axel Arigato", "Etisalat digital stores", "Etisalat internal screens", "Faces", "Jeddah Airport", "Kids Around", "Kilian Paris", "LOccitane", "Make Up For Ever", "Malabar", "Michael Kors", "NARS", "Tory Burch", "Tumi", "Valentino", "Zara"];
const fixtures = fixtureNames.map((label, index) => ({ id: "card-" + String(index + 1).padStart(2, "0"), name: label }));
let created = false, server, runtime, logs = "", checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; console.log("PASS " + label); };
async function snapshot(excluded = [], previousSchema = false) {
  const result = {};
  for (const { tablename } of (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows) {
    if (excluded.includes(tablename)) continue;
    const row = previousSchema && tablename === "auth_user" ? "to_jsonb(t) - 'controller_client_ids'" : "to_jsonb(t)";
    result[tablename] = JSON.stringify((await pool.query(`SELECT ${row} AS row FROM "${tablename.replaceAll('"', '""')}" t ORDER BY to_jsonb(t)::text`)).rows);
  }
  return result;
}
const orderedNames = html => Array.from(html.matchAll(/<button\b[^>]*aria-label="Open ([^"]+)"/g), match => match[1]);

try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  await pool.query("CREATE TABLE server_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
  for (const file of (await fs.readdir("db/postgres-migrations")).filter(file => file.endsWith(".sql") && file < "0036_user_client_order.sql").sort()) {
    const sql = (await fs.readFile(path.join("db/postgres-migrations", file), "utf8")).replace(/\r\n/g, "\n");
    await pool.query(sql);
    await pool.query("INSERT INTO server_migrations(name,checksum) VALUES($1,$2)", [file, crypto.createHash("sha256").update(sql).digest("hex")]);
  }
  const art = await sharp({ create: { width: 360, height: 360, channels: 3, background: "#14594c" } }).webp().toBuffer();
  const logo = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="100"><text x="180" y="65" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-size="40">SEPHORA</text></svg>')).webp().toBuffer();
  await pool.query(`INSERT INTO auth_user(id,name,email,created_at,updated_at,role,disabled)
      VALUES('migration-existing-user','Existing account','preserved@example.test',now(),now(),'controller',true);
    INSERT INTO auth_account(id,account_id,provider_id,user_id,password,created_at,updated_at)
      VALUES('preserved-account','migration-existing-user','credential','migration-existing-user','preserved-password-hash',now(),now());
    INSERT INTO entities(id,type,name,parent_id,created_at) VALUES
      ('country','country','United Arab Emirates',NULL,'2026-01-01'),('region','region','Dubai','country','2026-01-01'),
      ('store','store','Dubai Mall','region','2026-01-01'),('screen','screen','Existing Sephora screen','store','2026-01-01'),('group','group','Cash table',NULL,'2026-01-01');
    INSERT INTO group_members(group_id,screen_id) VALUES('group','screen');
    UPDATE entities SET onsign_player_id='existing-player',photo_key='11111111-1111-4111-8111-111111111111' WHERE id='screen';
    INSERT INTO screen_notes(screen_id,note,version,updated_at) VALUES('screen','Existing notes','original',now());
    INSERT INTO screen_ppm_inspections(screen_id,fields,version) VALUES('screen','{"overallStatus":"Pass"}','ppm-original');
    INSERT INTO location_photos(id,location_id,position,label) VALUES('22222222-2222-4222-8222-222222222222','store',0,'Rack room');
    INSERT INTO cms_updates(id,version,payload,updated_by) VALUES('cms','cms-original','{"contentName":"Existing campaign"}','fixture');
    INSERT INTO cms_reports(id,update_id,revision,source_version,pdf,created_by) VALUES('report','cms',1,'cms-original',decode('255044462d00ff','hex'),'fixture');
    UPDATE email_alert_settings SET recipients='["existing@example.test"]' WHERE client_id='sephora';
    UPDATE whatsapp_alert_settings SET recipients='["971500000000"]' WHERE client_id='sephora';
    UPDATE display_state SET selection='{"groupId":"group"}',interval_seconds=23 WHERE client_id='sephora';
    INSERT INTO client_onsign_settings(client_id,version,mode,organization_id,encrypted_token,updated_by)
      VALUES('sephora','44444444-4444-4444-8444-444444444444','custom','existing-org','v1.preserved-fixture','fixture');`);
  await pool.query("INSERT INTO client_logos(client_id,version,image,updated_by) VALUES('sephora',$1,$2,'fixture')", [crypto.randomUUID(), logo]);
  await pool.query("INSERT INTO client_backgrounds(client_id,version,image,updated_by) VALUES('sephora',$1,$2,'fixture')", [crypto.randomUUID(), art]);
  const beforeMigration = await snapshot(["server_migrations"]);
  await migrate(pool); await migrate(pool);
  check(JSON.stringify(await snapshot(["server_migrations", "user_client_order"], true)) === JSON.stringify(beforeMigration), "migration 0036 is repeatable and preserves every existing data/settings/account row");
  check((await pool.query("SELECT count(*)::int AS n FROM user_client_order")).rows[0].n === 0, "migration starts with empty personal preferences");
  // Bootstrap below needs an empty account list; this is fixture setup only.
  await pool.query("DELETE FROM auth_user WHERE id='migration-existing-user'");
  for (const client of fixtures) await pool.query("INSERT INTO clients(id,slug,name) VALUES($1,$1,$2)", [client.id, client.name]);
  for (const id of [fixtures[0].id, fixtures[2].id, fixtures[4].id]) {
    const background = await sharp({ create: { width: 360, height: 360, channels: 3, background: id === fixtures[2].id ? "#b40f19" : "#354868" } }).webp().toBuffer();
    await pool.query("INSERT INTO client_backgrounds(client_id,version,image,updated_by) VALUES($1,$2,$3,'fixture')", [id, crypto.randomUUID(), background]);
  }
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex");
  server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: testUrl.href, AUTH_URL: origin, AUTH_ADDITIONAL_ORIGINS: "",
    SCREEN_PHOTO_DIR: path.resolve(".server-runtime", name + "-screen-photos"),
    LOCATION_PHOTO_DIR: path.resolve(".server-runtime", name + "-location-photos"),
    AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL: adminEmail, AUTH_BOOTSTRAP_HASH: crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600000),
    PIXCOM_CLIENT_INTEGRATIONS: '{"sephora":{}}', PREVIEW_WORKER_DISABLED: "true", EMAIL_ALERT_WORKER_DISABLED: "true", WHATSAPP_ALERT_WORKER_DISABLED: "true",
    ONSIGN_API_TOKEN: "", ALERT_EMAIL_USER: "", ALERT_EMAIL_APP_PASSWORD: "", ULTRAMSG_TOKEN: "",
  } });
  server.stdout.on("data", chunk => logs += chunk); server.stderr.on("data", chunk => logs += chunk);
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 200)); }
  check(ready, "production server starts with personal-order storage");
  const migration = (await pool.query("DELETE FROM server_migrations WHERE name='0036_user_client_order.sql' RETURNING *")).rows[0];
  check((await fetch(origin + "/api/health")).status === 503, "health rejects a missing personal-order migration");
  await pool.query("INSERT INTO server_migrations(name,checksum,applied_at) VALUES($1,$2,$3)", [migration.name, migration.checksum, migration.applied_at]);
  check((await fetch(origin + "/api/health")).ok, "health recovers when migration readiness is restored");

  const cookieUsers = new Map();
  const request = (route, body, cookie = "", extra = {}) => fetch(origin + route, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, ...(body !== undefined && route.startsWith("/api/client-card-order") && cookieUsers.has(cookie) ? { "x-client-order-user": cookieUsers.get(cookie) } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const endpoint = "/api/client-card-order";
  const login = async email => { const response = await request("/api/auth/sign-in/email", { email, password }); assert.ok(response.ok, "fixture login: " + response.status); const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); cookieUsers.set(cookie, (await pool.query("SELECT id FROM auth_user WHERE email=$1", [email])).rows[0].id); return cookie; };
  const read = async cookie => { const response = await request(endpoint, undefined, cookie); assert.ok(response.ok); return response.json(); };
  const save = (order, expectedVersion, cookie, extra = {}) => request(endpoint, { order, expectedVersion }, cookie, extra);
  const pageOrder = async cookie => orderedNames(await (await fetch(origin + "/workspaces", { headers: { Cookie: cookie } })).text());
  check((await request(endpoint)).status === 401, "anonymous preference reads are rejected");
  check((await save([], null, "")).status === 401, "anonymous preference writes are rejected");
  assert.ok((await request("/api/activate", { token, password })).ok);
  let adminCookie = await login(adminEmail);
  const adminId = (await pool.query("SELECT id FROM auth_user WHERE email=$1", [adminEmail])).rows[0].id;
  assert.ok((await request("/api/users", { action: "create", name: "Controller", email: controllerEmail, role: "controller", password }, adminCookie)).ok);
  const controllerCookie = await login(controllerEmail);
  const controllerId = (await pool.query("SELECT id FROM auth_user WHERE email=$1", [controllerEmail])).rows[0].id;
  check(JSON.stringify(await read(adminCookie)) === JSON.stringify({ order: [], version: null }), "Admin begins with default A-Z and no saved version");
  check(JSON.stringify(await read(controllerCookie)) === JSON.stringify({ order: [], version: null }), "Controller independently begins with the default order");
  const response = await request(endpoint, undefined, adminCookie);
  check(response.headers.get("cache-control").includes("no-store") && response.headers.get("vary").includes("Cookie"), "preference responses are private and never cached");
  check((await request(endpoint, undefined, adminCookie + "; pixcom-workspace=invalid", { "x-client-id": "invalid" })).ok, "personal order works without a valid workspace selection");
  const defaultNames = ["Sephora", ...fixtureNames].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  check(JSON.stringify(await pageOrder(adminCookie)) === JSON.stringify(defaultNames), "server-rendered cards start in alphabetical order");

  const preserved = await snapshot(["auth_session", "auth_rate_limit", "user_client_order"]);
  const priority = ["sephora", fixtures[4].id, fixtures[2].id];
  const customIds = [...priority, ...[{ id: "sephora", name: "Sephora" }, ...fixtures].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map(client => client.id).filter(id => !priority.includes(id))];
  check((await save([], null, controllerCookie, { "x-client-order-user": adminId })).status === 403, "a stale Admin page cannot save under a different signed-in account");
  check((await save([], null, controllerCookie, { "x-client-order-user": "" })).status === 403, "a missing account guard cannot save even when both users have default orders");
  check(JSON.stringify(await read(controllerCookie)) === JSON.stringify({ order: [], version: null }), "stale-account requests leave the new account's default preference untouched");
  let saved = await save(customIds, null, adminCookie);
  check(saved.status === 200, "Admin saves a custom order without selecting a workspace");
  let state = await saved.json();
  check(JSON.stringify(state.order) === JSON.stringify(customIds) && /^[a-f0-9-]{36}$/.test(state.version), "successful save returns its ordered IDs and opaque version");
  check(JSON.stringify(await read(controllerCookie)) === JSON.stringify({ order: [], version: null }), "saving one account does not change another account's view");
  check((await pageOrder(adminCookie)).slice(0, 3).join("|") === "Sephora|Faces|Etisalat digital stores", "server rendering restores the user's saved card order");
  check(JSON.stringify(await pageOrder(controllerCookie)) === JSON.stringify(defaultNames), "another account's server-rendered cards remain alphabetical");

  const currentVersion = state.version;
  for (const body of [
    {}, { order: [] }, { expectedVersion: null }, { order: "sephora", expectedVersion: currentVersion },
    { order: ["sephora", "sephora"], expectedVersion: currentVersion }, { order: [null], expectedVersion: currentVersion },
    { order: ["../sephora"], expectedVersion: currentVersion }, { order: ["SEPHORA"], expectedVersion: currentVersion },
    { order: [" sephora"], expectedVersion: currentVersion }, { order: ["x".repeat(65)], expectedVersion: currentVersion },
    { order: [], expectedVersion: 1 }, { order: [], expectedVersion: "invalid" },
    { order: Array.from({ length: 501 }, (_, i) => "client-" + i), expectedVersion: currentVersion },
    { order: [], expectedVersion: currentVersion, userId: controllerId },
  ]) check((await request(endpoint, body, adminCookie)).status === 400, "invalid or cross-user preference payload is rejected");
  check((await request(endpoint + "?userId=" + controllerId, undefined, adminCookie)).status === 400, "GET cannot select another user's preferences");
  check((await request(endpoint + "?userId=" + controllerId, { order: [], expectedVersion: currentVersion }, adminCookie)).status === 400, "POST cannot select another user through a query string");
  check((await save([], currentVersion, adminCookie, { Origin: "https://evil.example" })).status === 403, "cross-origin changes are rejected");
  check((await fetch(origin + endpoint, { method: "POST", headers: { Origin: origin, Cookie: adminCookie, "Content-Type": "application/json", "x-client-order-user": adminId }, body: "{" })).status === 400, "malformed JSON is rejected");
  check((await fetch(origin + endpoint, { method: "POST", headers: { Origin: origin, Cookie: adminCookie, "Content-Type": "text/plain", "x-client-order-user": adminId }, body: "{}" })).status === 415, "non-JSON writes are rejected");
  check((await fetch(origin + endpoint, { method: "POST", headers: { Origin: origin, Cookie: adminCookie, "Content-Type": "application/json", "x-client-order-user": adminId }, body: JSON.stringify({ order: [], expectedVersion: currentVersion, oversized: "x".repeat(66000) }) })).status === 413, "oversized streamed requests are rejected");
  check((await save(["missing-client"], currentVersion, adminCookie)).status === 409, "unknown clients are rejected without changing the saved order");
  check((await save([], null, adminCookie)).status === 409, "a stale first-save version cannot overwrite an existing order");
  check((await save([], crypto.randomUUID(), adminCookie)).status === 409, "a stale editor cannot overwrite another saved version");
  check(JSON.stringify(await read(adminCookie)) === JSON.stringify(state), "all rejected requests preserve the previously saved order and version");

  const firstRace = await Promise.all([save([fixtures[0].id], null, controllerCookie), save([fixtures[1].id], null, controllerCookie)]);
  check(firstRace.map(result => result.status).sort().join(",") === "200,409", "concurrent first saves for one user accept exactly one request");
  const controllerState = await read(controllerCookie);
  check(JSON.stringify(await read(adminCookie)) === JSON.stringify(state), "concurrent saves for another user leave the Admin's order untouched");
  const race = await Promise.all([save([fixtures[0].id, "sephora"], state.version, adminCookie), save([fixtures[1].id, "sephora"], state.version, adminCookie)]);
  check(race.map(result => result.status).sort().join(",") === "200,409", "concurrent editors with the same version accept exactly one save");
  state = await read(adminCookie);
  check(state.version !== currentVersion, "successful edits advance the preference version");
  check((await save(customIds, state.version, adminCookie)).ok, "saved order can be deliberately updated with the latest version");
  state = await read(adminCookie);

  const secondSession = await login(adminEmail);
  check(JSON.stringify(await read(secondSession)) === JSON.stringify(state), "the same account sees its order in a separate login/device session");
  check((await request("/api/auth/sign-out", {}, secondSession)).ok, "the second session can log out normally");
  check((await request(endpoint, undefined, secondSession)).status === 401, "a signed-out session cannot read saved preferences");
  adminCookie = await login(adminEmail);
  check(JSON.stringify(await read(adminCookie)) === JSON.stringify(state), "logging out and back in preserves the account's order");
  check((await pageOrder(adminCookie)).slice(0, 3).join("|") === "Sephora|Faces|Etisalat digital stores", "fresh login server rendering uses the persisted arrangement");

  await pool.query(`CREATE FUNCTION reject_personal_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='private preference fixture failure'; END $$;
    CREATE TRIGGER reject_personal_order BEFORE INSERT OR UPDATE ON user_client_order FOR EACH ROW EXECUTE FUNCTION reject_personal_order();`);
  try {
    const failed = await save([], state.version, adminCookie);
    check(failed.status === 503 && !(await failed.text()).includes("private preference fixture failure"), "database failures return a controlled error without private details");
    check(JSON.stringify(await read(adminCookie)) === JSON.stringify(state), "a failed database save leaves the entire original preference intact");
  } finally { await pool.query("DROP TRIGGER reject_personal_order ON user_client_order; DROP FUNCTION reject_personal_order()"); }
  check(JSON.stringify(await snapshot(["auth_session", "auth_rate_limit", "user_client_order"])) === JSON.stringify(preserved), "preference writes preserve every existing inventory, photo reference, branding, PDF, integration, alert and wall setting");

  await pool.query("INSERT INTO clients(id,slug,name) VALUES('card-new','card-new','AAA Newly added')");
  check((await pageOrder(adminCookie)).at(-1) === "AAA Newly added", "new clients append after the visible saved order");
  // A partial saved order includes unsaved clients in A-Z order after its prefix.
  const namesWithNew = await pageOrder(adminCookie);
  check(namesWithNew.indexOf("AAA Newly added") >= customIds.length, "new clients never displace the saved priority prefix");
  await pool.query("UPDATE clients SET name='Faces Renamed' WHERE id=$1", [fixtures[4].id]);
  check((await pageOrder(adminCookie)).slice(0, 3).join("|") === "Sephora|Faces Renamed|Etisalat digital stores", "renaming a client keeps its saved position because order uses stable IDs");
  await pool.query("UPDATE clients SET archived_at=now() WHERE id=$1", [fixtures[4].id]);
  check(!(await pageOrder(adminCookie)).includes("Faces Renamed"), "archived saved clients are omitted without disturbing the surviving priority order");
  check((await save(customIds, state.version, adminCookie)).status === 409, "an editor cannot save an archived client");
  await pool.query("UPDATE clients SET name='Faces',archived_at=NULL WHERE id=$1", [fixtures[4].id]);
  await pool.query("DELETE FROM clients WHERE id='card-new'");
  check((await pageOrder(adminCookie))[1] === "Faces", "a restored client resumes its original saved position");
  const reset = await save([], state.version, adminCookie);
  check(reset.ok, "Reset to A-Z saves the default order explicitly");
  state = await reset.json();
  check(JSON.stringify(state.order) === "[]" && state.version, "reset retains a version while storing the default-order marker");
  check(JSON.stringify(await pageOrder(adminCookie)) === JSON.stringify(defaultNames), "reset returns server-rendered cards to alphabetical order");
  check(JSON.stringify(await read(controllerCookie)) === JSON.stringify(controllerState), "resetting the Admin's order preserves the Controller's custom order");

  const runtimeUrl = new URL(testUrl); runtimeUrl.searchParams.set("options", "-c role=pixcom_sephora_runtime");
  runtime = new pg.Pool({ connectionString: runtimeUrl.href });
  for (const statement of [
    "UPDATE user_client_order SET client_ids='[]'::jsonb",
    "DELETE FROM user_client_order",
    "INSERT INTO user_client_order(user_id,client_ids,version) VALUES('forged','[]','11111111-1111-4111-8111-111111111111')",
  ]) { await assert.rejects(runtime.query(statement), error => error.code === "42501"); checks++; }
  check(true, "runtime cannot directly insert, update or delete personal preference rows");
  for (const [order, version] of [[null, state.version], [{}, state.version], [[1], state.version], [["sephora", "sephora"], state.version], [["../sephora"], state.version], [[], "bad-version"], [Array.from({ length: 501 }, (_, i) => "client-" + i), state.version]]) {
    await assert.rejects(runtime.query("SELECT pixcom_set_user_client_order($1,$2::jsonb,$3)", [adminId, JSON.stringify(order), version]), error => error.code === "22023"); checks++;
  }
  check(!(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pixcom_set_user_client_order(text,jsonb,text)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS allowed")).rows[0].allowed, "PUBLIC has no permission to call the bounded preference setter");
  await pool.query("UPDATE auth_user SET disabled=true WHERE id=$1", [controllerId]);
  check((await request(endpoint, undefined, controllerCookie)).status === 401, "disabled accounts cannot read personal preferences");
  check((await save([], controllerState.version, controllerCookie)).status === 401, "disabled accounts cannot save personal preferences");
  await assert.rejects(runtime.query("SELECT pixcom_set_user_client_order($1,'[]'::jsonb,$2)", [controllerId, controllerState.version]), error => error.code === "42501"); checks++;
  await pool.query("UPDATE auth_user SET disabled=false WHERE id=$1", [controllerId]);
  assert.ok((await save([], controllerState.version, controllerCookie)).ok);

  const visible = [fixtures[0].id, fixtures[2].id, fixtures[4].id];
  const hidden = [fixtures[1].id, fixtures[3].id, fixtures[5].id];
  const interleaved = [hidden[0], visible[0], hidden[1], visible[1], hidden[2], visible[2]];
  const startingOrder = await save(interleaved, (await read(controllerCookie)).version, controllerCookie);
  assert.ok(startingOrder.ok);
  const startingVersion = (await startingOrder.json()).version;
  const setAccess = async clientIds => {
    const list = await request("/api/users", undefined, adminCookie);
    assert.ok(list.ok);
    const current = (await list.json()).users.find(user => user.id === controllerId);
    assert.ok((await request("/api/users", { action: "update", id: controllerId, expectedVersion: current.editVersion, role: "controller", disabled: false, clientIds }, adminCookie)).ok);
    return login(controllerEmail);
  };
  await pool.query("DELETE FROM auth_rate_limit");
  const limitedCookie = await setAccess(visible);
  const limitedOrder = await read(limitedCookie);
  assert.deepEqual(limitedOrder.order, visible);
  check((await save([], startingVersion, controllerCookie)).status === 401, "changing client access revokes the previous preference session");
  check((await save([], startingVersion, limitedCookie)).status === 409, "an open All clients tab cannot reset the order after the account is restricted");
  const rearranged = [visible[2], visible[0], visible[1]];
  const restrictedSave = await save(rearranged, limitedOrder.version, limitedCookie);
  assert.ok(restrictedSave.ok);
  const restrictedOrder = await restrictedSave.json();
  check(JSON.stringify(restrictedOrder.order) === JSON.stringify(rearranged), "restricted saves return only the visible order");
  check((await save([], limitedOrder.version, limitedCookie)).status === 409, "a stale restricted editor cannot reset a newer order");
  const restoredCookie = await setAccess(null);
  check((await save([], restrictedOrder.version, restoredCookie)).status === 409, "an open restricted tab cannot reset hidden positions after All clients access is restored");
  const restoredOrder = await read(restoredCookie);
  check(JSON.stringify(restoredOrder.order) === JSON.stringify([hidden[0], rearranged[0], hidden[1], rearranged[1], hidden[2], rearranged[2]]), "restoring access recovers hidden cards in their original slots after a restricted save");

  const limitedAgainCookie = await setAccess(visible);
  const restrictedReset = await save([], (await read(limitedAgainCookie)).version, limitedAgainCookie);
  assert.ok(restrictedReset.ok);
  assert.deepEqual((await restrictedReset.json()).order, []);
  check(JSON.stringify(await pageOrder(limitedAgainCookie)) === JSON.stringify([fixtures[0].name, fixtures[2].name, fixtures[4].name]), "restricted reset restores alphabetical order for the visible cards");
  const allClientsCookie = await setAccess(null);
  const afterRestrictedReset = await read(allClientsCookie);
  check(JSON.stringify(afterRestrictedReset.order) === JSON.stringify(hidden), "restoring access after a restricted reset recovers the hidden cards in their saved order");
  assert.ok((await save([], afterRestrictedReset.version, allClientsCookie)).ok);

  if (process.env.CLIENT_CARD_ORDER_UI === "true") {
    const done = path.resolve(".server-runtime/client-card-order-ui.done");
    await fs.rm(done, { force: true });
    await pool.query("DELETE FROM auth_rate_limit");
    await fs.writeFile(".server-runtime/client-card-order-ui.json", JSON.stringify({ origin, adminEmail, controllerEmail, password, dbName: name, clients: [{ id: "sephora", name: "Sephora" }, ...fixtures] }));
    console.log("UI fixture ready: " + origin);
    while (!await fs.stat(done).then(() => true, () => false)) await new Promise(resolve => setTimeout(resolve, 500));
    await fs.rm(done, { force: true });
  }
  console.log(`${checks} client card order integration checks passed.`);
} catch (error) {
  console.error(logs.slice(-1200));
  throw error;
} finally {
  if (server && server.exitCode === null) { const exit = once(server, "exit"); server.kill(); await exit; }
  if (runtime) await closeTestPool(runtime);
  await closeTestPool(pool);
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
