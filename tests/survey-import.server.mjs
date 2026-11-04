import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";

const name = "sephora_survey_test_" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(process.env.DATABASE_URL); adminUrl.pathname = "/postgres";
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = "/" + name;
const adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
const pool = new pg.Pool({ connectionString: testUrl.toString() });
let created = false, server, logs = "", checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; console.log("PASS " + message); };
try {
  await adminPool.query(`CREATE DATABASE "${name}"`); created = true; await migrate(pool);
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex"), password = "Survey-Test-2026!";
  server = spawn(process.execPath, [path.resolve(".next/standalone/server.js")], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", DATABASE_URL: testUrl.toString(), DATABASE_SSL: "false", AUTH_URL: origin, AUTH_ADDITIONAL_ORIGINS: "", AUTH_SECRET: crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL: "survey@example.test", AUTH_BOOTSTRAP_HASH: crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES: String(Date.now() + 600000), ONSIGN_API_TOKEN: "", ALERT_EMAIL_USER: "", ALERT_EMAIL_APP_PASSWORD: "", ULTRAMSG_TOKEN: "" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", data => { logs += data; }); server.stderr.on("data", data => { logs += data; });
  let ready = false;
  for (let i = 0; i < 70; i++) { try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {} if (server.exitCode !== null) break; await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, logs.slice(-2000));
  const call = (route, body, cookie = "", method = "POST", requestOrigin = origin) => fetch(origin + route, { method, headers: { Origin: requestOrigin, "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) });
  check((await call("/api/activate", { token, password })).ok, "isolated admin activates");
  const login = await call("/api/auth/sign-in/email", { email: "survey@example.test", password });
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  check(login.ok, "admin signs in");
  await call("/api/users", { action: "create", name: "Controller", email: "controller@example.test", role: "controller", password }, cookie);
  const controllerLogin = await call("/api/auth/sign-in/email", { email: "controller@example.test", password });
  const controller = controllerLogin.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const text = await fs.readFile("tests/fixtures/survey-led.txt", "utf8");
  const lcd = await fs.readFile("tests/fixtures/survey-lcd.txt", "utf8");
  const wall = await fs.readFile("tests/fixtures/survey-video-wall.txt", "utf8");
  const screenId = crypto.randomUUID();
  await pool.query("INSERT INTO entities (id,type,name,is_demo,created_at) VALUES ($1,'screen','Olaya Towers Cash Counter 1999 x 800',0,$2)", [screenId, new Date().toISOString()]);
  const route = "/api/survey-import", base = { screenId, text };
  const getPreview = async (copy = text) => { const response = await call(route, { screenId, text: copy }, cookie); const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data.preview; };
  const saveBody = (preview, copy = text, selected = preview.rows.map(row => row.id)) => ({ screenId, text: copy, fingerprint: preview.fingerprint, selected, confirmScreen: true, confirmType: true, confirmWarnings: true });
  const record = async section => (await pool.query("SELECT fields FROM screen_hardware_sections WHERE screen_id=$1 AND section=$2", [screenId, section])).rows[0]?.fields;
  check((await call(route, base)).status === 401 && (await call(route, base, controller)).status === 403, "preview requires Admin access");
  check((await call(route, base, cookie, "POST", "https://attacker.test")).status === 403, "cross-origin preview blocked");
  check((await call(route, { ...base, screenId: "missing" }, cookie)).status === 404, "unknown target screen rejected");
  check((await call(route, { ...base, text: text.replace("Pixel pitch (mm): 2.5", "Unexpected field: 2.5") }, cookie)).status === 400, "unrecognized fields block import preview");
  const preview = await getPreview();
  check(preview.screenName.startsWith("Olaya") && preview.screenType === "LED" && preview.currentType === null && preview.warnings.length >= 3, "preview identifies target, screen type, resolution discrepancy and PPM inconsistency");
  check(!await record("ledDisplay") && (await pool.query("SELECT screen_type FROM entities WHERE id=$1", [screenId])).rows[0].screen_type === null, "preview makes no database changes");
  check((await call(route, saveBody(preview), "", "PUT")).status === 401 && (await call(route, saveBody(preview), controller, "PUT")).status === 403, "saving requires Admin access");
  check((await call(route, saveBody(preview), cookie, "PUT", "https://attacker.test")).status === 403, "cross-origin save blocked");
  for (const key of ["confirmScreen", "confirmType", "confirmWarnings"]) check((await call(route, { ...saveBody(preview), [key]: false }, cookie, "PUT")).status === 400, `${key} is required`);
  check((await call(route, { ...saveBody(preview), selected: ["ledDisplay.fake"] }, cookie, "PUT")).status === 400, "forged fields rejected");
  check((await call(route, { ...saveBody(preview), text: text.replace("2.5", "3.5") }, cookie, "PUT")).status === 409, "changing copied text invalidates the preview");
  const saved = await call(route, saveBody(preview), cookie, "PUT");
  check(saved.ok && (await record("ledDisplay")).width_mm === "5000" && (await record("ledDisplay")).height_mm === "2000" && (await record("ledDisplay")).total_sqm === "10" && !(await record("ledDisplay")).dimensions && !(await record("ledDisplay")).totalSqm, "LED import preserves entered physical dimensions and area without calculating size");
  check((await record("ledController")).novalct_connected === "Yes" && (await record("mediaPlayer")).model === "P388" && (await record("powerNetwork")).quantity === "40", "all LED hardware aliases map to correct sections");
  check((await pool.query("SELECT fields FROM screen_ppm_inspections WHERE screen_id=$1", [screenId])).rows[0].fields.network_cables === "Fail", "PPM results are saved without rewriting conflicting technician answers");
  check((await call(route, saveBody(preview), cookie, "PUT")).status === 409, "a used preview cannot be replayed");
  check((await getPreview()).rows.length === 0, "reimporting identical fields produces no differences");
  const replacement = text.replace("Pixel pitch (mm): 2.5", "Pixel pitch (mm): 3").replace("Installed by: Pixcom", "Installed by: New installer");
  let replacePreview = await getPreview(replacement);
  check(replacePreview.rows.filter(row => row.current).every(row => !row.selected), "existing different values are not selected by default");
  const onlyInstaller = replacePreview.rows.filter(row => row.key === "installed_by").map(row => row.id);
  check((await call(route, saveBody(replacePreview, replacement, onlyInstaller), cookie, "PUT")).ok && (await record("ledDisplay")).pixelPitch === "2.5" && (await record("ledDisplay")).installed_by === "New installer", "only selected replacements save; unselected values remain unchanged");
  replacePreview = await getPreview(replacement);
  await pool.query("UPDATE screen_ppm_inspections SET version=$2 WHERE screen_id=$1", [screenId, crypto.randomUUID()]);
  check((await call(route, saveBody(replacePreview, replacement), cookie, "PUT")).status === 409, "concurrent PPM change invalidates preview without overwriting hardware");
  const blankCopy = text.replace("Installed by: Pixcom", "Installed by:").replace("Manufacturer:", "Manufacturer: New manufacturer");
  const blankPreview = await getPreview(blankCopy);
  check((await call(route, saveBody(blankPreview, blankCopy, blankPreview.rows.filter(row => row.key === "manufacturer").map(row => row.id)), cookie, "PUT")).ok && (await record("ledDisplay")).installed_by === "New installer", "blank pasted fields preserve saved values");
  const lcdPreview = await getPreview(lcd);
  check((await call(route, saveBody(lcdPreview, lcd, lcdPreview.rows.filter(row => row.section === "lcd").map(row => row.id)), cookie, "PUT")).ok && (await record("lcd")).tv_model === "QM32R" && (await record("ledDisplay")).manufacturer === "New manufacturer", "LCD import changes type and preserves hidden LED records");
  const wallPreview = await getPreview(wall);
  check((await call(route, saveBody(wallPreview, wall), cookie, "PUT")).ok && (await record("video_wall")).display_qty === "25" && (await record("lcd")).tv_model === "QM32R", "Video Wall import maps measurements and preserves LCD records");
  const multiline = wall.replace("Corrective action:", "Corrective action: First line\nSecond line: details\n\nLast paragraph");
  const multilinePreview = await getPreview(multiline);
  check((await call(route, saveBody(multilinePreview, multiline), cookie, "PUT")).ok && (await pool.query("SELECT fields FROM screen_ppm_inspections WHERE screen_id=$1", [screenId])).rows[0].fields.correctiveAction === "First line\nSecond line: details\n\nLast paragraph", "multiline findings/actions survive the API and database");
  const rollbackCopy = wall.replace("Number of displays: 25", "Number of displays: 30").replace("Client / project: Sephora", "Client / project: Changed");
  const rollbackPreview = await getPreview(rollbackCopy);
  await pool.query("CREATE FUNCTION survey_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$");
  await pool.query("CREATE TRIGGER survey_test_fail BEFORE INSERT OR UPDATE ON screen_ppm_inspections FOR EACH ROW EXECUTE FUNCTION survey_test_fail()");
  try {
    check((await call(route, saveBody(rollbackPreview, rollbackCopy), cookie, "PUT")).status === 503 && (await record("video_wall")).display_qty === "25", "database failure rolls back earlier hardware writes in the same import");
    const typeCopy = lcd.replace("LCD TV model: QM32R", "LCD TV model: Rollback model").replace("PPM date: 2026-11-01", "PPM date: 2026-11-03");
    const typePreview = await getPreview(typeCopy);
    check((await call(route, saveBody(typePreview, typeCopy), cookie, "PUT")).status === 503 && (await record("lcd")).tv_model === "QM32R" && (await pool.query("SELECT screen_type FROM entities WHERE id=$1", [screenId])).rows[0].screen_type === "Video Wall", "a failed import also rolls back screen type and hidden hardware changes");
  } finally { await pool.query("DROP TRIGGER survey_test_fail ON screen_ppm_inspections"); await pool.query("DROP FUNCTION survey_test_fail()"); }
  const commonPlayer = 'MEDIA PLAYER\nMedia player model: Shared player\nConnectivity type: Wi-Fi\nInstallation date: 2026-11-01\nInstalled by: Pixcom\nMedia player labelled: No\nAsset ID: PLAYER-42\nSerial number: SERIAL-42\nCPU / RAM / SSD: i5 / 16 GB / 256 GB\nMAC address: C8-21-58-C5-02-51\nIP address: 192.168.0.113\nCMS software: Onsign\nCMS device ID: DEVICE-42\n\n';
  for (const [copy, section, type] of [[lcd, "lcd", "LCD"], [wall, "video_wall", "Video Wall"]]) {
    const playerCopy = copy.replace("PPM INSPECTION", commonPlayer.replace("Shared player", type + " player") + "PPM INSPECTION");
    const playerPreview = await getPreview(playerCopy);
    const selected = playerPreview.rows.filter(row => row.section === "mediaPlayer").map(row => row.id);
    check(selected.length > 0 && (await call(route, saveBody(playerPreview, playerCopy, selected), cookie, "PUT")).ok, type + " accepts media player text import");
    const fields = await record("mediaPlayer");
    check(Object.keys(fields).length === 12 && fields.model === type + " player" && fields.cmsDeviceId === "DEVICE-42" && fields.labelled === "No", type + " persists all twelve media player fields");
    check((await record("ledDisplay")).manufacturer === "New manufacturer" && (await record(section)) !== undefined, type + " player import preserves other hardware");
    const oldPreview = await getPreview(copy);
    check((await call(route, saveBody(oldPreview, copy), cookie, "PUT")).ok && (await record("mediaPlayer")).model === type + " player", type + " older surveys without media player preserve saved player data");
  }
  const missing = await getPreview(rollbackCopy);
  await pool.query("DELETE FROM entities WHERE id=$1", [screenId]);
  check((await call(route, saveBody(missing, rollbackCopy), cookie, "PUT")).status === 404, "deleted screen cannot receive a stale import");
  check((await pool.query("SELECT COUNT(*)::int AS count FROM activity_log WHERE action LIKE 'imported survey details%' AND actor='survey@example.test'")).rows[0].count >= 5, "successful imports are attributed in Activity");
  console.log(`${checks} survey import integration checks passed on isolated PostgreSQL.`);
} catch (error) { console.error(logs.slice(-2000)); throw error; }
finally {
  if (server) { server.kill(); if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve)); }
  await pool.end();
  if (created) await adminPool.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await adminPool.end();
}
