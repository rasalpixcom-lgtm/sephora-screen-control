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
    PIXCOM_CLIENT_INTEGRATIONS: '{"sephora":{}}', PREVIEW_WORKER_DISABLED: "true", EMAIL_ALERT_WORKER_DISABLED: "true", WHATSAPP_ALERT_WORKER_DISABLED: "true",
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
  const setDisplay = selection => request("/api/state", { action: "display", selection, autoAdvance: false, intervalSeconds: 20 });
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
