// Every migration and write below targets a disposable local test database.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { build } from "esbuild";
import pg from "pg";
import sharp from "sharp";
import { migrate } from "../scripts/migrate-postgres.mjs";
import { closeTestPool } from "./fixtures/postgres-pool.mjs";

const base = new URL(process.env.DATABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(base.hostname) && base.port === "55432", "Use the separate local development PostgreSQL service");
const name = "sephora_rename_test_" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(base); adminUrl.pathname = "/postgres";
const testUrl = new URL(base); testUrl.pathname = "/" + name;
const admin = new pg.Pool({ connectionString: adminUrl.href }), pool = new pg.Pool({ connectionString: testUrl.href });
let created = false, server, worker, logs = "", checks = 0;
const workerBundle = path.resolve(".server-runtime", name + "-worker.cjs");
const check = (value, label) => { assert.ok(value, label); checks++; console.log("PASS " + label); };
const rows = async (table, previousSchema = false) => {
  let row = "to_jsonb(t)";
  if (previousSchema && table === "auth_user") row += " - 'controller_client_ids'";
  if (previousSchema && table === "common_monitor_display") row += " - 'complaint_voice_enabled'";
  return JSON.stringify((await pool.query(`SELECT ${row} AS row FROM "${table}" t ORDER BY (${row})::text`)).rows);
};
const snapshot = async (excluded, previousSchema = false) => {
  const tables = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const result = {};
  for (const { tablename } of tables) if (!excluded.includes(tablename)) result[tablename] = await rows(tablename, previousSchema);
  return result;
};
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  // Rehearse the new migration against an established 0034 database containing
  // inventory, photos, branding, integration settings and an immutable PDF.
  await pool.query("CREATE TABLE server_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
  for (const file of (await fs.readdir("db/postgres-migrations")).filter(file => file.endsWith(".sql") && file < "0035_client_rename.sql").sort()) {
    const sql = (await fs.readFile(path.join("db/postgres-migrations", file), "utf8")).replace(/\r\n/g, "\n");
    await pool.query(sql);
    await pool.query("INSERT INTO server_migrations(name,checksum) VALUES($1,$2)", [file, crypto.createHash("sha256").update(sql).digest("hex")]);
  }
  const png = await sharp({ create: { width: 240, height: 80, channels: 4, background: { r: 30, g: 120, b: 90, alpha: 0.5 } } }).png().toBuffer();
  const webp = await sharp(png).webp().toBuffer();
  const logoVersion = crypto.randomUUID(), backgroundVersion = crypto.randomUUID();
  await pool.query(`INSERT INTO entities(id,type,name,parent_id,created_at) VALUES
    ('country','country','United Arab Emirates',NULL,'2026-01-01'),('region','region','Dubai','country','2026-01-01'),
    ('store','store','Dubai Mall','region','2026-01-01'),('screen','screen','Existing Sephora screen','store','2026-01-01'),('group','group','Cash table',NULL,'2026-01-01');
    INSERT INTO group_members(group_id,screen_id) VALUES('group','screen');
    UPDATE entities SET onsign_player_id='existing-player',photo_key='11111111-1111-4111-8111-111111111111' WHERE id='screen';
    INSERT INTO screen_notes(screen_id,note,version,updated_at) VALUES('screen','Preserve existing notes','original',now());
    INSERT INTO screen_ppm_inspections(screen_id,fields,version) VALUES('screen','{"overallStatus":"Pass"}','ppm-original');
    INSERT INTO location_photos(id,location_id,position,label) VALUES('22222222-2222-4222-8222-222222222222','store',0,'Rack room');
    INSERT INTO screen_reference_photos(screen_id,category,photo_key) VALUES('screen','media_player','33333333-3333-4333-8333-333333333333');
    INSERT INTO cms_updates(id,version,payload,updated_by) VALUES('cms','cms-original','{"contentName":"Existing campaign"}','fixture');
    INSERT INTO cms_reports(id,update_id,revision,source_version,pdf,created_by) VALUES('report','cms',1,'cms-original',decode('255044462d00ff','hex'),'fixture');
    UPDATE email_alert_settings SET recipients='["existing@example.test"]' WHERE client_id='sephora';
    UPDATE whatsapp_alert_settings SET recipients='["971500000000"]' WHERE client_id='sephora';
    UPDATE display_state SET selection='{"groupId":"group"}',interval_seconds=23 WHERE client_id='sephora';
    INSERT INTO client_onsign_settings(client_id,version,mode,organization_id,encrypted_token,updated_by)
      VALUES('sephora','44444444-4444-4444-8444-444444444444','custom','existing-org','v1.preserve-encrypted-fixture','fixture');`);
  await pool.query("INSERT INTO client_logos(client_id,version,image,updated_by) VALUES('sephora',$1,$2,'fixture')", [logoVersion, webp]);
  await pool.query("INSERT INTO client_backgrounds(client_id,version,image,updated_by) VALUES('sephora',$1,$2,'fixture')", [backgroundVersion, webp]);
  const beforeMigration = await snapshot(["server_migrations"]);
  await migrate(pool); await migrate(pool);
  const afterMigration = await snapshot(["server_migrations"], true);
  check(Object.entries(beforeMigration).every(([table, rows]) => afterMigration[table] === rows), "migration 0035 and later additive migrations preserve every existing table row");
  const { rows: [sharedWall] } = await pool.query("SELECT complaint_voice_enabled FROM common_monitor_display WHERE id='main'");
  check(sharedWall?.complaint_voice_enabled === false, "upgrading an existing shared wall defaults complaint voice to off");

  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex"), password = "Client-Rename-Fixture-2026!";
  server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: testUrl.href, AUTH_URL: origin, AUTH_ADDITIONAL_ORIGINS: "",
    AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL: "rename@example.test", AUTH_BOOTSTRAP_HASH: crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600000),
    PIXCOM_CLIENT_INTEGRATIONS: '{"sephora":{}}', PREVIEW_WORKER_DISABLED: "true", EMAIL_ALERT_WORKER_DISABLED: "true", WHATSAPP_ALERT_WORKER_DISABLED: "true",
  } });
  server.stdout.on("data", chunk => logs += chunk); server.stderr.on("data", chunk => logs += chunk);
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 200)); }
  check(ready, "production server starts for rename fixtures");
  const migration = (await pool.query("DELETE FROM server_migrations WHERE name='0035_client_rename.sql' RETURNING *")).rows[0];
  check((await fetch(origin + "/api/health")).status === 503, "health refuses an unapplied rename migration");
  await pool.query("INSERT INTO server_migrations(name,checksum,applied_at) VALUES($1,$2,$3)", [migration.name, migration.checksum, migration.applied_at]);
  check((await fetch(origin + "/api/health")).status === 200, "health recovers after restoring rename readiness");
  const request = (route, body, cookie = "", extra = {}) => fetch(origin + route, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.ok((await request("/api/activate", { token, password })).ok);
  const login = async email => { const response = await request("/api/auth/sign-in/email", { email, password }); assert.ok(response.ok); return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); };
  const cookie = await login("rename@example.test");
  const actor = (await pool.query("SELECT id FROM auth_user WHERE email='rename@example.test'")).rows[0].id;
  const managed = async id => { const response = await request("/api/clients", undefined, cookie); assert.equal(response.status, 200); return (await response.json()).clients.find(client => client.id === id); };
  const metadata = (client, nextName = client.name) => ({ clientId: client.id, name: nextName, expectedName: client.name, logo: { action: "keep", expectedVersion: client.logoVersion }, background: { action: "keep", expectedVersion: client.backgroundVersion } });
  const save = (meta, session = cookie, headers = {}) => request("/api/client-branding", meta, session, headers);
  const upload = (meta, assets) => { const form = new FormData(); form.set("metadata", JSON.stringify(meta)); for (const [kind, bytes] of Object.entries(assets)) form.set(kind, new File([bytes], kind + ".png", { type: "image/png" })); return fetch(origin + "/api/client-branding", { method: "POST", headers: { Origin: origin, Cookie: cookie }, body: form }); };
  const createClient = async label => { const response = await request("/api/clients", { action: "create", name: label }, cookie); assert.equal(response.status, 201); return (await response.json()).clientId; };
  const other = await createClient("DHAM"), third = await createClient("Third client");
  assert.ok((await request("/api/users", { action: "create", name: "Controller", email: "rename-controller@example.test", role: "controller", password }, cookie)).ok);
  const controller = await login("rename-controller@example.test");
  const controllerId = (await pool.query("SELECT id FROM auth_user WHERE email='rename-controller@example.test'")).rows[0].id;
  const legacy = await (await request("/api/monitor-link", { action: "create" }, cookie)).json();
  const legacyKey = new URL(legacy.link).hash.slice(5);
  const common = await (await request("/api/monitor-link?scope=all", { action: "create" }, cookie)).json();
  const commonKey = new URL(common.link).hash.slice(5);
  const mutableTables = ["clients", "client_management_activity", "auth_session", "auth_rate_limit", "server_migrations"];
  const preserved = await snapshot(mutableTables);
  const sephoraBefore = (await pool.query("SELECT * FROM clients WHERE id='sephora'")).rows[0];
  let client = await managed("sephora"), meta = metadata(client, "  Sephora Gulf  ");
  check((await save(meta, "")).status === 401, "renaming requires authentication");
  check((await save(meta, controller)).status === 403, "Controller cannot rename a client");
  check((await save(meta, cookie, { Origin: "https://evil.example" })).status === 403, "renaming requires same origin");
  for (const value of ["", "   ", "x".repeat(121), "line\nname", null, 42, [], {}]) check((await save({ ...meta, name: value })).status === 400, "invalid client name rejected");
  check((await save({ ...meta, expectedName: undefined })).status === 400, "rename requires the original name");
  check((await save({ ...meta, clientId: "../sephora" })).status === 400, "invalid client ID rejected");
  check((await save({ ...meta, clientId: "missing" })).status === 404, "missing client cannot be renamed");
  check((await save(metadata(client, "dham"))).status === 409, "duplicate name rejected ignoring case");
  check((await save({ ...meta, slug: "replace-id", id: "replace-id" })).ok, "Admin renames an existing client and trims its display name");
  const sephoraAfter = (await pool.query("SELECT * FROM clients WHERE id='sephora'")).rows[0];
  check(sephoraAfter.name === "Sephora Gulf" && JSON.stringify({ ...sephoraAfter, name: sephoraBefore.name }) === JSON.stringify(sephoraBefore), "rename changes only the client name, preserving ID, slug, creation and archive fields");
  check(JSON.stringify(await snapshot(mutableTables)) === JSON.stringify(preserved), "rename preserves all inventory, photos, PDF bytes, encrypted OnSign settings, alerts and monitor state");
  const audit = (await pool.query("SELECT actor_id,details FROM client_management_activity WHERE client_id='sephora' AND action='rename'")).rows;
  check(audit.length === 1 && audit[0].actor_id === actor && audit[0].details.before === "Sephora" && audit[0].details.after === "Sephora Gulf", "rename audits the acting Admin and old/new names");
  const cards = await (await fetch(origin + "/workspaces", { headers: { Cookie: cookie } })).text();
  check(cards.includes('aria-label="Open Sephora Gulf"') && cards.includes(logoVersion) && cards.includes(backgroundVersion), "client cards display the new name with unchanged branding references");
  const controllerPage = await (await fetch(origin + "/controller", { headers: { Cookie: cookie } })).text();
  check(controllerPage.includes("Sephora Gulf") && controllerPage.includes(logoVersion), "existing workspace session uses the new name and existing logo");
  await build({ stdin: { contents: 'export {withCurrentWorkerWorkspace} from "./lib/client-worker-scope"; export {runWithWorkspace,activeClientName} from "./lib/client-workspace"; export {getPool} from "./lib/database"; export {alertMailContent} from "./lib/alert-mail"; export {whatsAppMessageText} from "./lib/whatsapp-message";', resolveDir: process.cwd(), loader: "ts" }, outfile: workerBundle, platform: "node", format: "cjs", bundle: true, external: ["pg", "nodemailer", "pdfkit"] });
  worker = createRequire(import.meta.url)(workerBundle);
  const originalDatabase = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = testUrl.href;
    const staleWorkspace = { id: "sephora", name: "Sephora" };
    const message = { kind: "test", rows: [], generatedAt: new Date(), recipients: ["fixture@example.test"], recipient: "971500000000", referenceId: "fixture", messageId: "fixture" };
    const branded = await worker.runWithWorkspace(staleWorkspace, () => worker.withCurrentWorkerWorkspace(async () => ({ name: worker.activeClientName(), email: worker.alertMailContent(message).subject, whatsapp: worker.whatsAppMessageText(message) })));
    check(branded.name === "Sephora Gulf" && branded.email.startsWith("Sephora Gulf Screen Control") && branded.whatsapp.startsWith("*Sephora Gulf Screen Control*"), "existing background worker context refreshes renamed email and WhatsApp branding without restart");
    check(worker.runWithWorkspace(staleWorkspace, worker.activeClientName) === "Sephora", "worker name refresh does not mutate another request's workspace context");
    await pool.query("UPDATE clients SET archived_at=now() WHERE id='sephora'");
    let called = false;
    await worker.runWithWorkspace(staleWorkspace, () => worker.withCurrentWorkerWorkspace(async () => { called = true; }));
    check(!called, "archived clients cannot run an alert worker callback");
    await pool.query("UPDATE clients SET archived_at=NULL WHERE id='sephora'");
  } finally { process.env.DATABASE_URL = originalDatabase; }
  for (const [query, key] of [["?client=sephora", legacyKey], ["?scope=all", commonKey]]) {
    const response = await request("/api/monitor-state" + query, undefined, "", { Authorization: "Bearer " + key });
    const body = await response.json(); check(response.ok && body.clientId === "sephora" && body.entities.some(entity => entity.id === "screen"), "existing monitoring link still opens the same client's screens after rename");
  }
  client = await managed("sephora");
  const auditCount = async () => (await pool.query("SELECT count(*)::int AS n FROM client_management_activity")).rows[0].n;
  const noOpAudit = await auditCount();
  check((await save(metadata(client))).ok && await auditCount() === noOpAudit, "unchanged name creates no update or duplicate audit");
  const unicodeName = "L'Équipe الشرق " + "é".repeat(105);
  check([...unicodeName].length === 120 && (await save(metadata(client, unicodeName))).ok, "120-character Unicode names and apostrophes save safely");
  client = await managed("sephora");
  check((await save(metadata(client, "Sephora Gulf"))).ok, "Unicode rename preserves the same workspace and can be renamed back");
  client = await managed("sephora");
  check((await save(metadata(client, "SEPHORA GULF"))).ok, "case-only name correction is supported");
  check((await save(metadata(client, "Stale replacement"))).status === 409, "stale name cannot overwrite another Admin's rename");
  client = await managed("sephora");
  const race = await Promise.all([save(metadata(client, "Sephora A")), save(metadata(client, "Sephora B"))]);
  check(race.map(response => response.status).sort().join(",") === "200,409", "concurrent renames accept exactly one editor");
  const duplicates = await Promise.all([save(metadata(await managed(other), "Same name")), save(metadata(await managed(third), "Same name"))]);
  check(duplicates.map(response => response.status).sort().join(",") === "200,409", "concurrent edits cannot give two clients the same name");
  const createRace = await Promise.all([save(metadata(await managed(other), "Create race name")), request("/api/clients", { action: "create", name: "Create race name" }, cookie)]);
  check(createRace.map(response => response.status).sort().join(",") === "200,409" || createRace.map(response => response.status).sort().join(",") === "201,409", "client creation and renaming share duplicate-name protection");
  client = await managed("sephora");
  const beforeFailure = await rows("clients"), beforeAssets = await rows("client_logos") + await rows("client_backgrounds"), beforeAudit = await auditCount();
  await pool.query(`CREATE FUNCTION reject_rename_background() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='private rename fixture failure'; END $$;
    CREATE TRIGGER reject_rename_background BEFORE INSERT OR UPDATE ON client_backgrounds FOR EACH ROW EXECUTE FUNCTION reject_rename_background();`);
  try {
    const mixed = metadata(client, "Must roll back"); mixed.logo.action = "replace"; mixed.background.action = "replace";
    const response = await upload(mixed, { logo: png, background: png });
    check(response.status === 503 && !(await response.text()).includes("private rename fixture failure"), "database failure returns a controlled error without private details");
    check(await rows("clients") === beforeFailure && await rows("client_logos") + await rows("client_backgrounds") === beforeAssets && await auditCount() === beforeAudit, "failed background save rolls back the name, logo and every audit event together");
  } finally { await pool.query("DROP TRIGGER reject_rename_background ON client_backgrounds; DROP FUNCTION reject_rename_background()"); }
  const mixed = metadata(client, "Sephora Updated"); mixed.logo.action = "replace"; mixed.background.action = "replace";
  check((await upload(mixed, { logo: png, background: png })).ok, "name, logo and background can be saved in one atomic edit");
  check((await managed("sephora")).name === "Sephora Updated", "combined save retains the new name");
  check((await save(metadata(client, "Stale assets"))).status === 409, "stale branding versions also protect rename-only edits");
  const current = await managed("sephora");
  const legacyBranding = metadata(current); delete legacyBranding.name; delete legacyBranding.expectedName; legacyBranding.logo.action = "replace";
  check((await upload(legacyBranding, { logo: png })).ok && (await managed("sephora")).name === current.name, "existing branding-only requests remain compatible and preserve the name");
  const runtimeUrl = new URL(testUrl); runtimeUrl.searchParams.set("options", "-c role=pixcom_sephora_runtime");
  const runtime = new pg.Pool({ connectionString: runtimeUrl.href });
  try {
    await assert.rejects(runtime.query("UPDATE clients SET name='Bypass' WHERE id='sephora'"), error => error.code === "42501"); checks++;
    await assert.rejects(runtime.query("SELECT pixcom_rename_client($1,'sephora','Sephora Updated','Bypass')", [controllerId]), error => error.code === "42501"); checks++;
    for (const invalid of [null, "", " bad ", "x".repeat(121), "line\nname"]) { await assert.rejects(runtime.query("SELECT pixcom_rename_client($1,'sephora','Sephora Updated',$2)", [actor, invalid]), error => error.code === "22023"); checks++; }
  } finally { await runtime.end(); }
  const clientRuntimeUrl = new URL(testUrl); clientRuntimeUrl.searchParams.set("options", "-c role=pixcom_client_" + crypto.createHash("md5").update(other).digest("hex"));
  const clientRuntime = new pg.Pool({ connectionString: clientRuntimeUrl.href });
  try { await assert.rejects(clientRuntime.query("SELECT pixcom_rename_client($1,'sephora','Sephora Updated','Bypass')", [actor]), error => error.code === "42501"); checks++; }
  finally { await clientRuntime.end(); }
  check(!(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='pixcom_rename_client(text,text,text,text)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS allowed")).rows[0].allowed, "PUBLIC has no permission to execute the bounded rename function");
  await pool.query("UPDATE clients SET archived_at=now() WHERE id=$1", [third]);
  const archived = { id: third, name: "Third client", logoVersion: null, backgroundVersion: null };
  check((await save(metadata(archived, "Archived edit"))).status === 404, "archived client cannot be renamed");
  const otherBeforeDisable = await managed(other);
  await pool.query("UPDATE auth_user SET disabled=true WHERE id=$1", [actor]);
  check((await save(metadata(otherBeforeDisable, "Disabled edit"))).status === 401, "disabled Admin session cannot rename clients");
  await assert.rejects(pool.query("SELECT pixcom_rename_client($1,'sephora','Sephora Updated','Disabled edit')", [actor]), error => error.code === "42501"); checks++;
  await pool.query("UPDATE auth_user SET disabled=false WHERE id=$1", [actor]);
  check((await save(metadata(await managed("sephora"), "Sephora"))).ok, "fixture restores Sephora's displayed name after rename checks");
  check((await save(metadata(await managed(other), "DHAM"))).ok, "fixture leaves a separate client for browser verification");
  if (process.env.CLIENT_RENAME_UI === "true") {
    const done = path.resolve(".server-runtime/client-rename-ui.done"); await fs.rm(done, { force: true });
    await fs.writeFile(".server-runtime/client-rename-ui.json", JSON.stringify({ origin, email: "rename@example.test", password, clientId: other }));
    console.log(`UI fixture: ${origin}; sign in rename@example.test / ${password}`);
    while (!await fs.stat(done).then(() => true, () => false)) await new Promise(resolve => setTimeout(resolve, 500));
    await fs.rm(done, { force: true });
  }
  console.log(`${checks} client rename integration checks passed.`);
} catch (error) { console.error(logs.slice(-1200)); throw error; }
finally {
  if (server && server.exitCode === null) { const exit = once(server, "exit"); server.kill(); await exit; }
  if (worker) {
    await closeTestPool(worker.getPool("sephora"));
  }
  await fs.rm(workerBundle, { force: true });
  const roles = created ? (await pool.query("SELECT id FROM clients WHERE id LIKE 'client-%'")).rows.map(row => "pixcom_client_" + crypto.createHash("md5").update(row.id).digest("hex")) : [];
  await closeTestPool(pool); if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  for (const role of roles) await admin.query(`DROP ROLE IF EXISTS "${role}"`);
  await admin.end();
}
