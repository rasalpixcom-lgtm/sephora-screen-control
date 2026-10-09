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
const databaseName = "sephora_activity_test_" + crypto.randomBytes(8).toString("hex");
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
  check((await request("/api/activity")).status === 401, "anonymous history is blocked");
  check((await request("/api/activate", {token,password})).status === 200, "test Admin activates");
  const admin = await login("admin@example.test");
  check(admin.response.status === 200, "Admin signs in");
  for (const role of ["controller"]) {
    check((await request("/api/users", {action:"create",name:role,email:role+"@example.test",role,password},admin.cookie)).status === 200, role+" fixture created");
    const account = await login(role+"@example.test",password,role === "wall" ? "192.0.2.12" : "192.0.2.11");
    check((await request("/api/activity",undefined,account.cookie)).status === 403, role+" cannot read history");
  }
  for (let index=0;index<80;index++) {
    const action = index<25 ? "created" : index<50 ? "updated" : index<65 ? "deleted" : index<75 ? "changed wall selection" : "assigned";
    await db.prepare("INSERT INTO activity_log (id,action,entity_name,actor,created_at) VALUES (?,?,?,?,?)").bind("fixture-"+String(index).padStart(3,"0"),action,"History fixture "+index,"fixture@example.test","2025-01-01T10:00:00.000Z").run();
  }
  async function history(query="") {
    const response = await request("/api/activity?"+query,undefined,admin.cookie);
    assert.equal(response.status,200);
    check(response.headers.get("cache-control") === "no-store", "history is not cached");
    return response.json();
  }
  const first = await history("q=History%20fixture");
  check(first.total === 80 && first.entries.length === 20 && first.pages === 4 && first.page === 1, "first page has 20 of 80 records");
  check(first.entries[0].id === "fixture-079" && first.entries[19].id === "fixture-060", "equal timestamps use stable descending ID order");
  const second = await history("q=History%20fixture&page=2");
  check(second.entries[0].id === "fixture-059" && !second.entries.some(entry=>first.entries.some(previous=>previous.id===entry.id)), "next page has no duplicate entries");
  const last = await history("q=History%20fixture&page=999");
  check(last.page === 4 && last.entries[19].id === "fixture-000", "old records beyond the previous 60-record limit remain accessible and page clamps");
  for (const [action,count] of [["created",25],["updated",25],["deleted",15],["wall",10],["other",5]]) {
    check((await history("q=History%20fixture&action="+action)).total === count, action+" count is filtered before pagination");
  }
  check((await history("q=FIXTURE%40EXAMPLE.TEST")).total === 80, "actor search is case insensitive");
  const empty = await history("q=NoMatchingFixture&page=99");
  check(empty.total===0 && empty.page===1 && empty.pages===1 && empty.entries.length===0, "empty results reset to page one");
  await db.prepare("INSERT INTO activity_log (id,action,entity_name,actor,created_at) VALUES (?,?,?,?,?)").bind("literal","assigned","Literal 100%_!","fixture@example.test","2025-01-02T10:00:00.000Z").run();
  check((await history("q="+encodeURIComponent("100%_!"))).total === 1, "search treats wildcard characters literally");
  await db.prepare("INSERT INTO activity_log (id,action,entity_name,actor,created_at) VALUES (?,?,?,?,?)").bind("legacy-null","assigned",null,"legacy-null@example.test","2025-01-02T10:00:00.000Z").run();
  check((await history("q=legacy-null&action=other")).total===1, "other actions include old records without item names");
  for (const [index,time] of ["2026-10-08T19:59:59.999Z","2026-10-08T20:00:00.000Z","2026-10-09T19:59:59.999Z","2026-10-09T20:00:00.000Z"].entries()) {
    await db.prepare("INSERT INTO activity_log (id,action,entity_name,actor,created_at) VALUES (?,?,?,?,?)").bind("gst-"+index,"created","GST boundary","fixture@example.test",time).run();
  }
  check((await history("q=GST%20boundary&from=2026-10-09&to=2026-10-09")).total===2, "date filters use inclusive GST calendar days");
  for (const query of ["page=0","page=-1","page=1.5","action=invalid","from=2026-02-30","from=2026-10-10&to=2026-10-09","q="+"x".repeat(121)]) {
    check((await request("/api/activity?"+query,undefined,admin.cookie)).status === 400,"invalid query rejected: "+query.slice(0,50));
  }
  check((await history("q="+encodeURIComponent("' OR 1=1 --"))).total===0,"search text cannot become SQL");
  check((await (await request("/api/state?activity=none",undefined,admin.cookie)).json()).activity.length===0,"Admin inventory can omit the separate history payload");
  check((await request("/api/state",{action:"display",selection:{},autoAdvance:false,intervalSeconds:15},admin.cookie)).status===200,"wall settings update succeeds");
  const wall = await history("q=Rotation%20paused&action=wall");
  check(wall.entries.some(entry=>entry.action==="changed wall settings" && entry.entityName.includes("All locations")),"new wall history describes selection and rotation");
  check((await request("/admin/activity",undefined,admin.cookie)).status===200,"Admin Activity page loads");
  console.log(`\n${checks} Activity integration checks passed on isolated PostgreSQL.`);
  if (process.env.ACTIVITY_BROWSER_CHECK === "true") {
    // Exercise Settings dialogs against disposable monitor access, never the live link.
    assert.equal((await request("/api/monitor-link",{action:"create"},admin.cookie)).status,200);
    // A small hierarchy for exercising cascading screen pickers in the browser.
    const fixtureIds = {};
    for (const [type,name,parentName] of [
      ["country","United Arab Emirates",null],["country","Qatar",null],
      ["region","Dubai","United Arab Emirates"],["region","Abu Dhabi","United Arab Emirates"],["region","Doha","Qatar"],
      ["store","Dubai Mall","Dubai"],["store","Mall of the Emirates","Dubai"],["store","Yas Mall","Abu Dhabi"],["store","Doha Mall","Doha"],
      ["screen","Entrance display","Dubai Mall"],["screen","Cash table","Yas Mall"],["screen","Beauty studio","Doha Mall"],
    ]) {
      const response = await request("/api/state",{action:"create",type,name,parentId:fixtureIds[parentName] || ""},admin.cookie);
      assert.equal(response.status,200);
      const state = await response.json();
      fixtureIds[name] = state.entities.find(entity=>entity.type===type && entity.name===name).id;
    }
    if (process.env.SCREEN_LAYOUT_CHECK === "true") {
      for (let index=1;index<=15;index++) {
        assert.equal((await request("/api/state",{action:"create",type:"screen",name:`Layout fixture ${index}`,parentId:fixtureIds["Dubai Mall"]},admin.cookie)).status,200);
      }
    }
    if (process.env.CONTROLLER_BROWSER_CHECK === "true") {
      const response = await request("/api/state",{action:"create",type:"group",name:"Fixture group"},admin.cookie);
      assert.equal(response.status,200);
      const state = await response.json();
      const groupId = state.entities.find(entity=>entity.type==="group" && entity.name==="Fixture group").id;
      for (const screenName of ["Entrance display","Cash table"]) {
        assert.equal((await request("/api/state",{action:"member",groupId,screenId:fixtureIds[screenName],enabled:true},admin.cookie)).status,200);
      }
    }
    fs.mkdirSync(".server-runtime",{recursive:true});
    fs.rmSync(".server-runtime/activity-resume",{force:true});
    fs.writeFileSync(".server-runtime/activity-fixture.json",JSON.stringify({origin,databaseName,email:"admin@example.test",password}));
    console.log("Disposable browser fixture ready; expires in five minutes.");
    const deadline = Date.now()+300000;
    while (Date.now()<deadline && !fs.existsSync(".server-runtime/activity-resume")) await new Promise(resolve=>setTimeout(resolve,1000));
  }
} catch (error) { console.error(logs.slice(-4000)); throw error; } finally {
  if (process.env.ACTIVITY_BROWSER_CHECK === "true") {
    fs.rmSync(".server-runtime/activity-fixture.json",{force:true});
    fs.rmSync(".server-runtime/activity-resume",{force:true});
  }
  server.kill();
  if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
  await pool.end();
  await adminPool.query('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await adminPool.end();
}
