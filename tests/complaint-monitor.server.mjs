// Run against a disposable local PostgreSQL database with provider fetches intercepted.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";
import { closeTestPool } from "./fixtures/postgres-pool.mjs";

const base = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname) && base.port === "55432", "Use the isolated local development PostgreSQL service");
const databaseName = "sephora_complaint_monitor_test_" + randomBytes(8).toString("hex");
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const testUrl = new URL(base);
testUrl.pathname = "/" + databaseName;
const admin = new pg.Pool({ connectionString: adminUrl.href });
const pool = new pg.Pool({ connectionString: testUrl.href });
const hash = value => createHash("sha256").update(value).digest("hex");
const commonKey = randomBytes(32).toString("hex");
const privateKey = randomBytes(32).toString("hex");
const alertKey = randomBytes(32).toString("hex");
const allClientsAlertKey = randomBytes(32).toString("hex");
const sourceOrigin = "https://complaint-monitor-fixture.invalid";
const sourceToken = randomBytes(32).toString("hex");
const bootstrapToken = randomBytes(32).toString("hex");
const password = randomBytes(24).toString("hex");
const adminEmail = "complaint-admin@example.test";
const controllerEmail = "complaint-controller@example.test";
const screenMap = {
  101: "fixture-sephora-screen",
  102: "fixture-missing-screen",
  103: "fixture-other-screen",
  104: "fixture-sephora-store",
};
const endpoint = "/api/monitor-complaint-alerts";
const voicePath = "/api/controller-complaint-voice";
const complaintMigrations = ["0039_complaint_alerts.sql", "0040_common_monitor_complaint_voice.sql"];
const common = { Authorization: `Bearer ${commonKey}` };
const alert = { "X-Monitor-Alert-Key": alertKey };
const credentials = { ...common, ...alert };
const allClientsCredentials = { ...common, "X-Monitor-Alert-Key": allClientsAlertKey };
const pilotTarget = { clientId: "sephora", screenId: screenMap[101] };
const allClientsTarget = { clientId: "fixture-other", screenId: "fixture-other-screen" };
let created = false;
let server;
let origin;
let logs = "";

const preload = `
  const nativeFetch = globalThis.fetch;
  const fixtureEvents = JSON.parse(process.env.COMPLAINT_MOCK_EVENTS);
  const firstEventId = fixtureEvents[0]?.event_id;
  const received = new Set();
  let firstReceiptFailed = false;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
    if (url.origin === ${JSON.stringify(sourceOrigin)}) {
      if (new Headers(options?.headers).get("authorization") !== "Bearer " + process.env.COMPLAINT_ALERTS_TOKEN) {
        return new Response(null, { status: 401 });
      }
      if (url.pathname === "/api/integrations/screen-control/alerts" && options?.method === "GET") {
        return Response.json({ alerts: fixtureEvents.filter(event => !received.has(event.event_id)) });
      }
      if (url.pathname === "/api/integrations/screen-control/alerts/ack" && options?.method === "POST") {
        const id = JSON.parse(options.body).event_id;
        if (!fixtureEvents.some(event => event.event_id === id)) return new Response(null, { status: 404 });
        if (id === firstEventId && !firstReceiptFailed) {
          firstReceiptFailed = true;
          console.log("Fixture receipt temporarily unavailable");
          return new Response(null, { status: 503 });
        }
        received.add(id);
        console.log("Fixture receipt accepted " + id);
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    }
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return nativeFetch(input, options);
    throw new Error("Unexpected remote request from the complaint alert fixture");
  };
`;

async function startServer(enabled, fixtureEvents = [], mode = "") {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(preload)}`,
      PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: testUrl.href, DATABASE_SSL: "false",
      AUTH_URL: origin, AUTH_ADDITIONAL_ORIGINS: "", AUTH_SECRET: randomBytes(48).toString("hex"),
      AUTH_ADMIN_EMAIL: adminEmail, AUTH_BOOTSTRAP_HASH: hash(bootstrapToken), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600_000),
      PIXCOM_CLIENT_INTEGRATIONS: '{"sephora":{}}', PREVIEW_WORKER_DISABLED: "true",
      EMAIL_ALERT_WORKER_DISABLED: "true", WHATSAPP_ALERT_WORKER_DISABLED: "true",
      ONSIGN_API_TOKEN: "", ALERT_EMAIL_USER: "", ALERT_EMAIL_APP_PASSWORD: "", ULTRAMSG_TOKEN: "",
      COMPLAINT_ALERTS_ENABLED: String(enabled), COMPLAINT_ALERTS_ORIGIN: sourceOrigin,
      COMPLAINT_ALERTS_MODE: mode,
      COMPLAINT_ALERTS_TOKEN: sourceToken, COMPLAINT_ALERTS_SOURCE_CLIENT_ID: "11",
      COMPLAINT_ALERTS_SOURCE_STORE_ID: "21", COMPLAINT_ALERTS_SCREEN_MAP: JSON.stringify(screenMap),
      COMPLAINT_ALERTS_MONITOR_KEY_SHA256: hash(alertKey),
      COMPLAINT_ALERTS_ALL_CLIENTS_MONITOR_KEY_SHA256: hash(allClientsAlertKey),
      COMPLAINT_ALERTS_ALL_CLIENTS_SCREEN_MAP: JSON.stringify({ "44:51:701": allClientsTarget }),
      COMPLAINT_MOCK_EVENTS: JSON.stringify(fixtureEvents),
    },
  });
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(origin + "/api/health")).ok) return; } catch {}
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("The standalone complaint monitor fixture did not become healthy");
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, "exit");
  server.kill();
  await exited;
}

async function expectStatus(url, headers, status) {
  const response = await fetch(origin + url, { headers, redirect: "manual" });
  assert.equal(response.status, status, `${url} returned ${response.status}, expected ${status}`);
  return response;
}

async function waitForReceipts(...events) {
  const markers = events.map(event => `Fixture receipt accepted ${event.event_id}`);
  for (let attempt = 0; attempt < 100 && !markers.every(marker => logs.includes(marker)); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  for (const marker of markers) assert.ok(logs.includes(marker), "The collector acknowledged each event");
}

async function checkHealthWithoutMigration(name, expectedStatus) {
  const placeholder = `fixture-${name}`;
  await pool.query("UPDATE server_migrations SET name=$2 WHERE name=$1", [name, placeholder]);
  try { await expectStatus("/api/health", {}, expectedStatus); }
  finally { await pool.query("UPDATE server_migrations SET name=$1 WHERE name=$2", [name, placeholder]); }
}

function post(url, body, headers) {
  return fetch(origin + url, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
}

async function signIn(email) {
  const response = await post("/api/auth/sign-in/email", { email, password });
  assert.equal(response.status, 200);
  return { Cookie: response.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ") };
}

async function addAlert({ eventId = randomUUID(), complaintId = 1, clientId = 11, storeId = 21, screenId = 101, screenName = "Fixture Main LED" } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO complaint_alerts(event_id, complaint_id, occurred_at, priority, source_client_id, client_name,
       source_store_id, store_name, source_screen_id, screen_name, issue_label)
     VALUES ($1, $2, now(), 'high', $3, 'Sephora', $4, 'Fixture Store', $5, $6, 'Blank display')
     ON CONFLICT (event_id) DO NOTHING RETURNING id::text AS cursor`,
    [eventId, complaintId, clientId, storeId, screenId, screenName],
  );
  return rows[0] ? { eventId, cursor: rows[0].cursor } : null;
}

try {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  await migrate(pool);
  await pool.query(
    `INSERT INTO common_monitor_access(id, token_hash, generation, updated_at, updated_by)
       VALUES ('main', $1, $2, now(), 'fixture');
    `, [hash(commonKey), randomUUID()],
  );
  await pool.query(
    `INSERT INTO monitor_access(client_id, id, token_hash, generation, updated_at)
       VALUES ('sephora', 'main', $1, $2, now())
       ON CONFLICT (client_id, id) DO UPDATE SET token_hash=EXCLUDED.token_hash, generation=EXCLUDED.generation`,
    [hash(privateKey), randomUUID()],
  );
  await pool.query(`
    INSERT INTO clients(id, slug, name) VALUES ('fixture-other', 'fixture-other', 'Fixture Other');
    SELECT pixcom_provision_client('fixture-other');
    INSERT INTO entities(client_id, id, type, name, parent_id, created_at) VALUES
      ('sephora', 'fixture-sephora-country', 'country', 'Fixture Country', NULL, now()),
      ('sephora', 'fixture-sephora-region', 'region', 'Fixture Region', 'fixture-sephora-country', now()),
      ('sephora', 'fixture-sephora-store', 'store', 'Fixture Store', 'fixture-sephora-region', now()),
      ('sephora', 'fixture-sephora-screen', 'screen', 'Fixture Main LED', 'fixture-sephora-store', now()),
      ('fixture-other', 'fixture-other-country', 'country', 'Fixture Other Country', NULL, now()),
      ('fixture-other', 'fixture-other-region', 'region', 'Fixture Other Region', 'fixture-other-country', now()),
      ('fixture-other', 'fixture-other-store', 'store', 'Fixture Other Store', 'fixture-other-region', now()),
      ('fixture-other', 'fixture-other-screen', 'screen', 'Fixture Other LED', 'fixture-other-store', now());
  `);

  await startServer(false);
  await expectStatus(endpoint, credentials, 404);
  await expectStatus(voicePath, {}, 404);
  for (const name of complaintMigrations) await checkHealthWithoutMigration(name, 200);
  const normalWall = await (await expectStatus("/api/monitor-state?scope=all", common, 200)).json();
  assert.equal(normalWall.voiceEnabled, undefined);
  console.log("PASS disabled complaint alerts leave the existing common monitor available");
  await stopServer();

  await startServer(true);
  for (const name of complaintMigrations) await checkHealthWithoutMigration(name, 503);
  await pool.query("ALTER TABLE common_monitor_display RENAME COLUMN complaint_voice_enabled TO fixture_hidden_voice_enabled");
  try { await expectStatus("/api/health", {}, 503); }
  finally { await pool.query("ALTER TABLE common_monitor_display RENAME COLUMN fixture_hidden_voice_enabled TO complaint_voice_enabled"); }
  await pool.query("REVOKE USAGE ON SEQUENCE complaint_alerts_id_seq FROM pixcom_sephora_runtime");
  try { await expectStatus("/api/health", {}, 503); }
  finally { await pool.query("GRANT USAGE ON SEQUENCE complaint_alerts_id_seq TO pixcom_sephora_runtime"); }
  await expectStatus("/api/health", {}, 200);
  console.log("PASS health checks complaint migrations, schema and receipt permissions only when enabled");
  await expectStatus(endpoint, {}, 401);
  await expectStatus(endpoint, common, 401);
  await expectStatus(endpoint, alert, 401);
  await expectStatus("/api/monitor-state", { Authorization: `Bearer ${privateKey}` }, 200);
  await expectStatus(endpoint, { Authorization: `Bearer ${privateKey}`, ...alert }, 401);
  await expectStatus(endpoint, { ...common, "X-Monitor-Alert-Key": randomBytes(32).toString("hex") }, 401);
  await expectStatus(`${endpoint}?after=invalid`, credentials, 400);
  await expectStatus(voicePath, credentials, 401);
  assert.equal((await post(voicePath, { voiceEnabled: true }, credentials)).status, 401);
  console.log("PASS the complaint route requires both the common monitor and alert keys and validates cursors");

  const initial = await (await expectStatus(endpoint, credentials, 200)).json();
  assert.deepEqual(initial, { alerts: [], cursor: "0", voiceEnabled: false });
  assert.equal((await post("/api/activate", { token: bootstrapToken, password })).status, 200);
  const adminLogin = await signIn(adminEmail);
  assert.equal((await post("/api/users", {
    action: "create", name: "Complaint Controller", email: controllerEmail, role: "controller", password, clientIds: ["sephora"],
  }, adminLogin)).status, 200);
  const controllerLogin = await signIn(controllerEmail);
  assert.deepEqual(await (await expectStatus(voicePath, controllerLogin, 200)).json(), { voiceEnabled: false });
  assert.equal((await post(voicePath, { voiceEnabled: true }, { ...controllerLogin, Origin: "https://other.example.test" })).status, 403);
  assert.equal((await post(voicePath, { voiceEnabled: true }, { ...controllerLogin, "X-Client-Id": "fixture-other" })).status, 403);
  assert.equal((await post(voicePath, { voiceEnabled: "true" }, controllerLogin)).status, 400);
  assert.equal((await post(voicePath, { voiceEnabled: true, clientId: "fixture-other" }, controllerLogin)).status, 400);
  const selection = "SELECT id,client_id,updated_at,updated_by FROM common_monitor_display WHERE id='main'";
  const { rows: originalSelection } = await pool.query(selection);
  const enable = await post(voicePath, { voiceEnabled: true }, controllerLogin);
  assert.equal(enable.status, 200);
  assert.match(enable.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await enable.json(), { voiceEnabled: true });
  assert.deepEqual((await pool.query(selection)).rows, originalSelection);
  assert.deepEqual(await (await expectStatus(voicePath, adminLogin, 200)).json(), { voiceEnabled: true });
  assert.deepEqual(await (await expectStatus(`${endpoint}?after=0`, credentials, 200)).json(), {
    alerts: [], cursor: "0", voiceEnabled: true,
  });
  const { rows: [controllerSession] } = await pool.query(
    "SELECT s.id FROM auth_session s JOIN auth_user u ON u.id=s.user_id WHERE u.email=$1",
    [controllerEmail],
  );
  const secondControllerLogin = await signIn(controllerEmail);
  const revoking = await pool.connect();
  let voiceSave;
  try {
    await revoking.query("BEGIN");
    await revoking.query("DELETE FROM auth_session WHERE id=$1", [controllerSession.id]);
    voiceSave = post(voicePath, { voiceEnabled: false }, controllerLogin);
    let waitingForRevocation = false;
    for (let attempt = 0; attempt < 100 && !waitingForRevocation; attempt++) {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",
        [revoking.processID],
      );
      waitingForRevocation = rowCount > 0;
      if (!waitingForRevocation) await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(waitingForRevocation, "The voice save waits for the original session's revocation");
    await revoking.query("COMMIT");
    assert.equal((await voiceSave).status, 409);
  } finally {
    await revoking.query("ROLLBACK");
    revoking.release();
    await voiceSave;
  }
  assert.deepEqual(await (await expectStatus(voicePath, secondControllerLogin, 200)).json(), { voiceEnabled: true });
  console.log("PASS revoking the original session blocks a pending voice change even when a second session is active");
  await pool.query("UPDATE auth_user SET controller_client_ids=ARRAY['fixture-other'] WHERE email=$1", [controllerEmail]);
  assert.equal((await post(voicePath, { voiceEnabled: false }, secondControllerLogin)).status, 403);
  console.log("PASS the saved preference defaults off, uses existing Controller permissions and leaves wall selection untouched");

  const visible = await addAlert();
  assert.equal(await addAlert({ eventId: visible.eventId }), null, "Redelivery keeps one alert row per event");
  await addAlert({ clientId: 12 });
  await addAlert({ storeId: 22 });
  await addAlert({ screenId: 102 });
  await addAlert({ screenId: 103 });
  await addAlert({ screenId: 104 });
  await addAlert({ screenId: 105 });
  const response = await expectStatus(`${endpoint}?after=${encodeURIComponent(initial.cursor)}`, credentials, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const first = await response.json();
  assert.equal(first.voiceEnabled, true);
  assert.deepEqual(first.alerts, [{
    cursor: visible.cursor, eventId: visible.eventId, priority: "high", clientName: "Sephora",
    storeName: "Fixture Store", screenName: "Fixture Main LED", issueLabel: "Blank display",
    target: pilotTarget,
  }]);
  assert.deepEqual((await (await expectStatus(`${endpoint}?after=${encodeURIComponent(first.cursor)}`, credentials, 200)).json()).alerts, []);
  const next = await addAlert({ complaintId: 2 });
  const later = await (await expectStatus(`${endpoint}?after=${encodeURIComponent(first.cursor)}`, credentials, 200)).json();
  assert.deepEqual(later.alerts.map(item => item.eventId), [next.eventId]);
  console.log("PASS Pilot alerts are deduplicated, restricted to mapped Sephora screens and include the matching tile target");

  await pool.query("UPDATE common_monitor_display SET client_id='fixture-other' WHERE id='main'");
  const other = await (await expectStatus(`${endpoint}?after=${encodeURIComponent(first.cursor)}`, credentials, 200)).json();
  assert.deepEqual(other.alerts.map(item => [item.eventId, item.target]), [[next.eventId, pilotTarget]]);
  const fresh = await (await expectStatus(endpoint, credentials, 200)).json();
  assert.deepEqual(fresh, { alerts: [], cursor: next.cursor, voiceEnabled: true });
  console.log("PASS the alert feed follows its Sephora pilot scope independently of the displayed client, and new viewers start at the current tail");

  const renamedName = "Renamed Checkout Display";
  const openingState = await (await expectStatus("/api/state", adminLogin, 200)).json();
  const openingScreen = openingState.entities.find(screen => screen.id === screenMap[101]);
  const renamed = await post("/api/state", {
    action: "update", type: "screen", id: screenMap[101], name: renamedName, parentId: "fixture-sephora-store",
    expectedVersion: openingScreen.editVersion,
  }, adminLogin);
  assert.equal(renamed.status, 200);
  const renamedState = await renamed.json();
  assert.equal(renamedState.entities.find(screen => screen.id === screenMap[101])?.name, renamedName);
  // Even an exact name match must not grant an unmapped source screen access to the wall.
  await addAlert({ screenId: 105, screenName: renamedName });

  await stopServer();
  const workerEvent = {
    event_id: randomUUID(), complaint_id: 3, created_at: new Date().toISOString(), priority: "medium",
    client_id: 11, client_name: "Sephora", store_id: 21, store_name: "Fixture Store",
    screen_id: 101, screen_name: "Fixture Mian LED", issue_label: "Screen Off",
  };
  await startServer(true, [workerEvent]);
  const restartedAdmin = await signIn(adminEmail);
  assert.deepEqual(await (await expectStatus(voicePath, restartedAdmin, 200)).json(), { voiceEnabled: true });
  const restartedWall = await (await expectStatus(endpoint, credentials, 200)).json();
  assert.equal(restartedWall.voiceEnabled, true);
  const mute = await post(voicePath, { voiceEnabled: false }, restartedAdmin);
  assert.equal(mute.status, 200);
  assert.deepEqual(await mute.json(), { voiceEnabled: false });
  console.log("PASS voice follows the shared wall across client changes and server restarts, and Admin can mute it");
  await waitForReceipts(workerEvent);
  assert.match(logs, /Fixture receipt temporarily unavailable/);
  const { rows: [saved] } = await pool.query("SELECT count(*)::int AS count FROM complaint_alerts WHERE event_id=$1", [workerEvent.event_id]);
  assert.equal(saved.count, 1);
  const collected = await (await expectStatus(`${endpoint}?after=${fresh.cursor}`, credentials, 200)).json();
  assert.equal(collected.voiceEnabled, false);
  assert.deepEqual(collected.alerts.map(item => [item.eventId, item.screenName, item.issueLabel, item.target]),
    [[workerEvent.event_id, workerEvent.screen_name, "Screen Off", pilotTarget]]);
  console.log("PASS the mapped screen still receives alerts after a rename and a source typo, while a matching name with the wrong ID is ignored");
  console.log("PASS the running collector saves the mocked Laravel alert and retries its receipt without duplicating it on the wall");

  await pool.query("UPDATE common_monitor_access SET token_hash=$1 WHERE id='main'", [hash(alertKey)]);
  await expectStatus(`${endpoint}?after=0`, { Authorization: `Bearer ${alertKey}`, ...alert }, 401);
  console.log("PASS one reused key cannot grant access to complaint alerts");

  await pool.query("UPDATE common_monitor_access SET token_hash=$1 WHERE id='main'", [hash(commonKey)]);
  await expectStatus(endpoint, credentials, 200);
  await pool.query("UPDATE common_monitor_access SET token_hash=NULL WHERE id='main'");
  await expectStatus(endpoint, credentials, 401);
  console.log("PASS disabling the common monitor key also revokes complaint alert access");

  await stopServer();
  await pool.query("UPDATE common_monitor_access SET token_hash=$1 WHERE id='main'", [hash(commonKey)]);
  const { rows: [{ cursor: allClientsStart }] } = await pool.query("SELECT max(id)::text AS cursor FROM complaint_alerts");
  const eventTime = Date.now();
  const mapped = {
    event_id: randomUUID(), complaint_id: 401, created_at: new Date(eventTime).toISOString(), priority: "medium",
    client_id: 44, client_name: "Fixture Other", store_id: 51, store_name: "Fixture Plaza",
    screen_id: 701, screen_name: "Identical screen name", issue_label: "Screen Off",
  };
  const unmatched = {
    ...mapped, event_id: randomUUID(), complaint_id: 402, created_at: new Date(eventTime + 1).toISOString(), priority: "high",
    client_id: 45, client_name: "Fixture Unmapped Client", store_id: 52, store_name: "Fixture Mall", screen_id: 702,
    issue_label: "Flickering",
  };
  await startServer(true, [mapped, unmatched], "all_clients");
  await expectStatus(endpoint, credentials, 401);
  await expectStatus(endpoint, { "X-Monitor-Alert-Key": allClientsAlertKey }, 401);
  await expectStatus(endpoint, { ...allClientsCredentials, Authorization: `Bearer ${privateKey}` }, 401);
  await expectStatus("/api/monitor-state?scope=all", common, 200);
  await waitForReceipts(mapped, unmatched);
  const allClientsBatch = await (await expectStatus(`${endpoint}?after=${allClientsStart}`, allClientsCredentials, 200)).json();
  assert.deepEqual(allClientsBatch.alerts.map(item => item.eventId), [mapped.event_id, unmatched.event_id]);
  assert.deepEqual(allClientsBatch.alerts.map(item => item.clientName), [mapped.client_name, unmatched.client_name]);
  assert.deepEqual(allClientsBatch.alerts.map(item => item.target), [allClientsTarget, undefined]);
  assert.equal(allClientsBatch.voiceEnabled, false);
  const { rows: [{ count: savedInAllClients }] } = await pool.query(
    "SELECT count(*)::int AS count FROM complaint_alerts WHERE event_id=ANY($1::uuid[])", [[mapped.event_id, unmatched.event_id]],
  );
  assert.equal(savedInAllClients, 2);
  assert.deepEqual(await (await expectStatus(endpoint, allClientsCredentials, 200)).json(), {
    alerts: [], cursor: allClientsBatch.cursor, voiceEnabled: false,
  });
  console.log("PASS all clients mode saves, acknowledges, and delivers two clients in order with its own key, including an unmapped screen");

  await stopServer();
  await startServer(true);
  await expectStatus(endpoint, allClientsCredentials, 401);
  const backInPilot = await (await expectStatus(`${endpoint}?after=${allClientsStart}`, credentials, 200)).json();
  assert.deepEqual(backInPilot.alerts, []);
  console.log("PASS switching back to Pilot restores its original key and screen scope");
} catch (error) {
  console.error(logs.slice(-2500));
  throw error;
} finally {
  await stopServer();
  await closeTestPool(pool);
  if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await closeTestPool(admin);
}
