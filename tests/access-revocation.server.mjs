import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";
import { closeTestPool } from "./fixtures/postgres-pool.mjs";
import { verifyQueuedWriteRevocation } from "./fixtures/queued-write.mjs";

const base = new URL(process.env.DATABASE_URL);
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname) && base.port === "55432", "Use the separate local development PostgreSQL service only");
const name = "sephora_access_revocation_test_" + randomBytes(8).toString("hex");
const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
const fixtureUrl = new URL(base); fixtureUrl.pathname = "/" + name;
const admin = new pg.Pool({ connectionString: adminUrl.href });
const pool = new pg.Pool({ connectionString: fixtureUrl.href });
const email = "access-revocation@example.test";
const password = randomBytes(24).toString("base64url");
const token = randomBytes(32).toString("hex");
const screenId = randomUUID();
const photoKey = randomUUID();
let server, created = false, logs = "", loginNumber = 0;

try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  await migrate(pool);
  await pool.query("INSERT INTO entities(id,type,name,screen_type,created_at) VALUES($1,'screen','Olaya Towers Cash Counter 1999 x 800','LED','2026-01-01')", [screenId]);
  await pool.query("INSERT INTO screen_reference_photos(screen_id,category,photo_key) VALUES($1,'media_player',$2)", [screenId, photoKey]);

  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const origin = `http://127.0.0.1:${probe.address().port}`;
  await new Promise(resolve => probe.close(resolve));
  server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      COMPLAINT_ALERTS_ENABLED:"false",
      PORT: new URL(origin).port, HOSTNAME: "127.0.0.1", DATABASE_URL: fixtureUrl.href, DATABASE_SSL: "false", DATABASE_POOL_SIZE: "5",
      AUTH_URL: origin, AUTH_ADDITIONAL_ORIGINS: "", AUTH_SECRET: randomBytes(48).toString("hex"), TRUST_PROXY: "true",
      AUTH_ADMIN_EMAIL: email, AUTH_BOOTSTRAP_HASH: createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600000),
      SCREEN_PHOTO_DIR: path.resolve(".server-runtime", name + "-photos"),
      PIXCOM_CLIENT_INTEGRATIONS: "", ONSIGN_API_TOKEN: "", ALERT_EMAIL_USER: "", ALERT_EMAIL_APP_PASSWORD: "", ULTRAMSG_TOKEN: "",
      PREVIEW_WORKER_DISABLED: "true", EMAIL_ALERT_WORKER_DISABLED: "true", WHATSAPP_ALERT_WORKER_DISABLED: "true",
    },
  });
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  function request(route, { cookie, method = "GET", body, headers } = {}) {
    return fetch(origin + route, {
      method, redirect: "manual", signal: AbortSignal.timeout(12000),
      headers: { Origin: origin, "Content-Type": "application/json", ...(cookie && { Cookie: cookie }), ...headers },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  }
  let ready = false;
  for (let attempt = 0; attempt < 100 && server.exitCode === null; attempt++) {
    if (await request("/api/health").then(response => response.ok, () => false)) { ready = true; break; }
    await delay(150);
  }
  assert.ok(ready, "server starts with the disposable fixture");
  assert.ok((await request("/api/activate", { method: "POST", body: { token, password } })).ok);

  async function signIn() {
    const response = await request("/api/auth/sign-in/email", {
      method: "POST", body: { email, password }, headers: { "x-forwarded-for": `192.0.2.${++loginNumber}` },
    });
    assert.equal(response.status, 200, "fixture Admin signs in");
    return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  }
  const activeCookie = await signIn();

  const rows = async (statement, params) => (await pool.query(statement, params)).rows;
  async function screenSnapshot() {
    return {
      screen: await rows("SELECT * FROM entities WHERE id=$1", [screenId]),
      hardware: await rows("SELECT * FROM screen_hardware_sections WHERE screen_id=$1 ORDER BY section", [screenId]),
      inspections: await rows("SELECT * FROM screen_ppm_inspections WHERE screen_id=$1", [screenId]),
      photos: await rows("SELECT * FROM screen_reference_photos WHERE screen_id=$1 ORDER BY category", [screenId]),
      notes: await rows("SELECT * FROM screen_notes WHERE screen_id=$1", [screenId]),
      remoteAccess: await rows("SELECT * FROM screen_remote_access WHERE screen_id=$1", [screenId]),
      activity: await rows("SELECT * FROM activity_log WHERE entity_id=$1 ORDER BY id", [screenId]),
    };
  }

  async function verifyRevocation({ route, method = "PUT", body, lock, snapshot }) {
    const cookie = await signIn();
    assert.notEqual(cookie, activeCookie, "queued write uses a different session from the control request");
    await verifyQueuedWriteRevocation({
      pool, label: route, lock, snapshot,
      request: () => request(route, { method, body, cookie }),
      revoke: () => request("/api/auth/sign-out", { method: "POST", body: {}, cookie }),
    });
    const before = await snapshot();
    const active = await request(route, { method, body, cookie: activeCookie });
    assert.equal(active.status, 200, route + " still accepts the same change from another active session");
    assert.notDeepEqual(await snapshot(), before, route + " has valid input for an actual change");
  }

  const inventoryLock = "SELECT pg_advisory_xact_lock(724017,hashtext('sephora'))";
  const screenWrite = { lock: inventoryLock, snapshot: screenSnapshot };
  await verifyRevocation({ ...screenWrite, route: "/api/screen-hardware", body: { screenId, section: "ledDisplay", fields: { manufacturer: "Fixture manufacturer" }, version: null } });
  await verifyRevocation({ ...screenWrite, route: "/api/screen-ppm-inspection", body: { screenId, fields: { findings: "Fixture inspection" }, version: null } });
  await verifyRevocation({ ...screenWrite, route: "/api/screen-gallery", body: { screenId, category: "media_player", action: "remove", expectedKey: photoKey } });
  await verifyRevocation({ ...screenWrite, route: "/api/screen-notes", body: { screenId, note: "Fixture note", version: null } });
  await verifyRevocation({ ...screenWrite, route: "/api/screen-remote-access", body: { screenId, fields: { teamViewerId: "123 456 789", anyDeskId: "123456789" }, version: null } });

  const text = await readFile("tests/fixtures/survey-led.txt", "utf8");
  const survey = { screenId, text };
  const previewResponse = await request("/api/survey-import", { method: "POST", body: survey, cookie: activeCookie });
  assert.equal(previewResponse.status, 200, "survey fixture can be previewed");
  const { preview } = await previewResponse.json();
  await verifyRevocation({
    ...screenWrite, route: "/api/survey-import",
    body: { ...survey, fingerprint: preview.fingerprint, selected: preview.rows.map(row => row.id), confirmScreen: true, confirmType: true, confirmWarnings: true },
  });

  await verifyRevocation({
    route: "/api/controller-client", method: "POST", body: {},
    lock: "SELECT id FROM common_monitor_display WHERE id='main' FOR UPDATE",
    snapshot: () => rows("SELECT * FROM common_monitor_display WHERE id='main'"),
  });
} catch (error) {
  if (logs) console.error(logs.slice(-1600));
  throw error;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exit = once(server, "exit");
    server.kill();
    await exit;
  }
  await closeTestPool(pool);
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
