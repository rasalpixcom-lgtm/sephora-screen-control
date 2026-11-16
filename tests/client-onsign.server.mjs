// Only disposable databases and mocked provider calls. Never modifies the configured database.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import net from "node:net";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";
const name = "sephora_onsign_settings_" + crypto.randomBytes(8).toString("hex");
const envClient = "client-env-" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(process.env.DATABASE_URL); adminUrl.pathname = "/postgres";
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = "/" + name;
const admin = new pg.Pool({ connectionString: adminUrl.href }), pool = new pg.Pool({ connectionString: testUrl.href });
let server, created = false, checks = 0, logs = "";
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log("PASS " + label); };
try {
  await admin.query('CREATE DATABASE "' + name + '"'); created = true;
  await migrate(pool); await migrate(pool);
  check((await pool.query("SELECT count(*)::int AS n FROM client_onsign_settings")).rows[0].n === 0, "migration preserves environment fallback without seeding credentials");
  await pool.query("INSERT INTO clients(id,slug,name) VALUES($1,$1,'Environment client')",[envClient]);
  await pool.query("SELECT pixcom_provision_client($1)",[envClient]);
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0,"127.0.0.1",resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`, token = crypto.randomBytes(32).toString("hex"), password = "OnSign-Settings-Fixture-2026!";
  server = spawn(process.execPath, ["--require", path.resolve("tests/fixtures/client-onsign-preload.cjs"), path.resolve(".next/standalone/server.js")], {
    windowsHide: true, stdio: ["ignore","pipe","pipe"], env: { ...process.env, PORT:String(port), HOSTNAME:"127.0.0.1", DATABASE_URL:testUrl.href,
      AUTH_URL:origin, AUTH_ADDITIONAL_ORIGINS:"", AUTH_SECRET:crypto.randomBytes(48).toString("hex"), AUTH_ADMIN_EMAIL:"settings@example.test",
      AUTH_BOOTSTRAP_HASH:crypto.createHash("sha256").update(token).digest("hex"), AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000),
      PIXCOM_CLIENT_INTEGRATIONS:JSON.stringify({[envClient]:{onsign:{token:"new-secret",organizationId:"other-org"}}}), ONSIGN_API_TOKEN:"legacy-secret", ONSIGN_ORGANIZATION_ID:"sephora-org",
      EMAIL_ALERT_WORKER_DISABLED:"true", WHATSAPP_ALERT_WORKER_DISABLED:"true", ALERT_EMAIL_USER:"", ALERT_EMAIL_APP_PASSWORD:"", ULTRAMSG_TOKEN:""
    }
  });
  server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
  let ready = false; for (let i=0;i<100;i++) { try { if ((await fetch(origin+"/api/health")).ok) { ready=true; break; } } catch {} await new Promise(resolve=>setTimeout(resolve,250)); }
  assert.ok(ready, "Standalone test server did not become ready");
  const request = (route, body, cookie="", extra={}) => fetch(origin+route, { method:body===undefined?"GET":"POST", headers:{Origin:origin,"Content-Type":"application/json",Cookie:cookie,...extra}, ...(body===undefined?{}:{body:JSON.stringify(body)}) });
  check((await request("/api/client-onsign?client=sephora")).status===401,"settings require authentication");
  check((await request("/api/client-onsign",{})).status===401,"writes require authentication");
  assert.ok((await request("/api/activate",{token,password})).ok);
  const login = async email => { const r=await request("/api/auth/sign-in/email",{email,password}); assert.ok(r.ok); return r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; "); };
  const cookie=await login("settings@example.test");
  const status = async id => { const r=await request("/api/client-onsign?client="+id,undefined,cookie); assert.equal(r.status,200); return r.json(); };
  const save = (id,version,action,fields={},session=cookie) => request("/api/client-onsign",{clientId:id,version,action,...fields},session);
  const select = async id => { const r=await request("/api/workspaces",{clientId:id},cookie); assert.ok(r.ok); return cookie+"; "+r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; "); };
  let sephora = await status("sephora");
  check(sephora.mode==="server"&&sephora.hasToken&&sephora.organizationId==="sephora-org"&&sephora.version===null,"Sephora continues using its existing token and organization");
  check(!JSON.stringify(sephora).includes("legacy-secret")&&!Object.hasOwn(sephora,"token"),"GET never returns a saved token");
  check((await (await request("/api/onsign",undefined,cookie)).json()).players[0].id==="player-sephora-org","legacy player list still works");
  const createdClient=await request("/api/clients",{action:"create",name:"New settings client"},cookie);
  const other=(await createdClient.json()).clientId; assert.ok(other);
  const otherCookie=await select(other);
  await pool.query(`INSERT INTO entities(id,type,name,parent_id,created_at) VALUES
    ('review-country','country','Existing country',NULL,'2026-01-01'),
    ('review-region','region','Existing region','review-country','2026-01-01'),
    ('review-store','store','Existing location','review-region','2026-01-01'),
    ('review-screen','screen','Existing screen','review-store','2026-01-01');
    INSERT INTO screen_notes(screen_id,note,version,updated_at) VALUES('review-screen','Preserve these notes','original-notes',now());
    INSERT INTO monitor_access(client_id,id,token_hash,generation,updated_at)
      VALUES('sephora','main',repeat('a',64),'original-monitor',now());
    INSERT INTO display_state(client_id,id,selection,updated_at)
      VALUES('sephora','main','{"countryId":"review-country"}',now()::text)
      ON CONFLICT(client_id,id) DO UPDATE SET selection=excluded.selection;
    UPDATE email_alert_settings SET recipients='["existing@example.test"]' WHERE client_id='sephora';
    UPDATE whatsapp_alert_settings SET recipients='["971500000000"]' WHERE client_id='sephora';`);
  check((await status(envClient)).configured,"existing per-client environment JSON is preserved");
  const envCookie=await select(envClient);
  check((await (await request("/api/onsign",undefined,envCookie)).json()).players[0].id==="player-other-org","existing per-client environment credentials still load players");
  const originalInventory=(await pool.query("SELECT to_jsonb(e) AS row FROM entities e ORDER BY id")).rows;
  const originalEmail=(await pool.query("SELECT to_jsonb(e) AS row FROM email_alert_settings e ORDER BY client_id")).rows;
  const protectedTables=["screen_notes","display_state","monitor_access","common_monitor_access","common_monitor_display","whatsapp_alert_settings","client_logos","client_backgrounds"];
  const preserved=new Map();
  for(const table of protectedTables) preserved.set(table,JSON.stringify((await pool.query('SELECT to_jsonb(t) AS row FROM "'+table+'" t ORDER BY to_jsonb(t)::text')).rows));
  check(!(await status(other)).hasToken,"new client does not inherit Sephora credentials");
  check((await (await request("/api/onsign",undefined,otherCookie)).json()).configured===false,"new client starts unconfigured");
  check((await request("/api/client-onsign",{clientId:other,action:"save",version:null,token:"new-secret",organizationId:"other-org"},cookie,{Origin:"https://evil.test"})).status===403,"foreign-origin writes rejected");
  await request("/api/users",{action:"create",name:"Controller",email:"controller-settings@example.test",role:"controller",password},cookie);
  const controller=await login("controller-settings@example.test");
  check((await request("/api/client-onsign?client="+other,undefined,controller)).status===403,"Controller cannot read settings");
  check((await save(other,null,"save",{token:"new-secret",organizationId:"other-org"},controller)).status===403,"Controller cannot write settings");
  check((await save(other,null,"organizations",{token:"new-secret"},controller)).status===403,"Controller cannot discover organizations");
  for (const fields of [{token:"new-secret",organizationId:""},{token:"bad\nsecret",organizationId:"other-org"},{token:"x".repeat(8193),organizationId:"other-org"},{token:"new-secret",organizationId:"bad org"},{organizationId:"other-org"}]) {
    check((await save(other,null,"save",fields)).status===400,"invalid or incomplete credentials rejected");
  }
  check((await request("/api/client-onsign?client=missing",undefined,cookie)).status===404,"unknown clients rejected");
  check((await save(other,undefined,"disable")).status===400,"version is mandatory");
  for(const action of [["test"],["save"],["organizations"],{},null,123]) {
    check((await save(other,null,action,{token:"new-secret",organizationId:"other-org"})).status===400,"non-string action is rejected without running a save");
  }
  check((await status(other)).version===null,"malformed test actions never save credentials");
  const discovery=await save(other,null,"organizations",{token:"new-secret"}), discovered=await discovery.json();
  check(discovery.ok&&JSON.stringify(discovered.organizations)===JSON.stringify([{id:"second-org",name:"Another Client"},{id:"other-org",name:"Other Client"}]),"organizations load across pages, deduplicate and sort by name without requiring an ID");
  check(discovery.headers.get("cache-control")==="private, no-store"&&!JSON.stringify(discovered).includes("new-secret"),"discovery returns only organization names and IDs with private no-store headers");
  check((await status(other)).version===null&&(await pool.query("SELECT count(*)::int AS n FROM client_management_activity WHERE action='set_onsign'")).rows[0].n===0,"loading organizations never saves credentials or creates a settings audit");
  const savedDiscovery=await save("sephora",null,"organizations");
  check(savedDiscovery.ok&&(await savedDiscovery.json()).organizations[0].id==="sephora-org","organization loading can use existing Sephora server credentials without returning the token");
  check((await save(other,null,"organizations")).status===400,"discovery without any effective token is rejected");
  check((await save(other,null,"organizations",{token:"new-secret",organizationId:"other-org"})).status===400,"discovery rejects mixed organization fields");
  check((await save(other,null,"organizations",{token:"empty-secret"})).ok,"no organizations is a valid empty discovery result");
  const empty=await save(other,null,"organizations",{token:"empty-secret"});
  check((await empty.json()).organizations.length===0,"empty discovery does not select an unrelated organization");
  for(const bad of ["reject-secret","upstream-error","loop-secret"]){
    const r=await save(other,null,"organizations",{token:bad}), text=await r.text();
    check(!r.ok&&!text.includes(bad)&&!text.includes("Sensitive"),"discovery rejects unauthorized, partial or looping provider results without exposing secrets");
  }
  check((await request("/api/client-onsign",{clientId:other,version:null,action:"disable",extra:"unexpected"},cookie)).status===400,"unknown fields rejected");
  check((await save(other,null,"test",{token:"new-secret",organizationId:"other-org"})).ok,"unsaved connection can be tested");
  check((await status(other)).version===null,"connection testing does not save settings");
  for (const rejected of ["reject-secret","upstream-error"]) {
    const r=await save(other,null,"test",{token:rejected,organizationId:"other-org"}), text=await r.text();
    check(!r.ok&&!text.includes(rejected)&&!text.includes("Sensitive"),"provider failure details and tokens never reach browser");
  }
  check((await save(other,null,"save",{token:"new-secret",organizationId:"other-org"})).ok,"new client settings save successfully");
  let current=await status(other);
  const stored=(await pool.query("SELECT encrypted_token FROM client_onsign_settings WHERE client_id=$1",[other])).rows[0].encrypted_token;
  check(stored.startsWith("v1.")&&!stored.includes("new-secret"),"database stores authenticated ciphertext rather than plaintext");
  check((await save(other,null,"organizations")).status===409,"stale discovery is rejected");
  const customDiscovery=await save(other,current.version,"organizations");
  check(customDiscovery.ok&&(await customDiscovery.json()).organizations.length===2,"discovery can use an encrypted saved token without exposing it");
  const runtimeUrl=new URL(testUrl);
  runtimeUrl.searchParams.set("options","-c role=pixcom_client_"+crypto.createHash("md5").update(other).digest("hex"));
  const runtimePool=new pg.Pool({connectionString:runtimeUrl.href});
  try {
    await assert.rejects(runtimePool.query("SELECT encrypted_token FROM client_onsign_settings"),error=>error.code==="42501");
    check(true,"other client database roles cannot read credential storage");
  } finally { await runtimePool.end(); }
  const rootUrl=new URL(testUrl); rootUrl.searchParams.set("options","-c role=pixcom_sephora_runtime");
  const rootPool=new pg.Pool({connectionString:rootUrl.href});
  try {
    await assert.rejects(rootPool.query("UPDATE client_onsign_settings SET mode='disabled'"),error=>error.code==="42501");
    const controllerId=(await pool.query("SELECT id FROM auth_user WHERE email='controller-settings@example.test'")).rows[0].id;
    await assert.rejects(rootPool.query("SELECT pixcom_set_client_onsign($1,$2,$3,'disabled',NULL,NULL)",[controllerId,other,current.version]),error=>error.code==="42501");
    check(true,"database setter enforces Admin access and denies direct runtime writes");
  } finally { await rootPool.end(); }
  check((await (await request("/api/onsign",undefined,otherCookie)).json()).players[0].id==="player-other-org","saved settings immediately reach the player API");
  const beforeFailure=(await pool.query("SELECT to_jsonb(s) AS row FROM client_onsign_settings s WHERE client_id=$1",[other])).rows[0];
  await pool.query(`CREATE FUNCTION reject_onsign_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='set_onsign' THEN RAISE EXCEPTION 'sensitive-internal-fixture'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_onsign_audit BEFORE INSERT ON client_management_activity FOR EACH ROW EXECUTE FUNCTION reject_onsign_audit();`);
  try {
    const failure=await save(other,current.version,"disable"), text=await failure.text();
    check(failure.status===503&&!text.includes("sensitive-internal-fixture"),"database failures expose only a controlled service error");
    check(JSON.stringify((await pool.query("SELECT to_jsonb(s) AS row FROM client_onsign_settings s WHERE client_id=$1",[other])).rows[0])===JSON.stringify(beforeFailure),"failed audit rolls back the settings write atomically");
  } finally { await pool.query("DROP TRIGGER reject_onsign_audit ON client_management_activity; DROP FUNCTION reject_onsign_audit()"); }
  await pool.query("UPDATE client_onsign_settings SET encrypted_token='v1.invalid.invalid.invalid' WHERE client_id=$1",[other]);
  const corrupted=await request("/api/onsign",undefined,otherCookie), corruptedText=await corrupted.text();
  check(corrupted.status===503&&!corruptedText.includes("v1.invalid"),"unreadable credentials fail closed instead of reusing a cached token");
  check((await save(other,current.version,"save",{token:"new-secret",organizationId:"other-org"})).ok,"an Admin can replace an unreadable token without decrypting it");
  current=await status(other);
  check((await save(other,null,"save",{token:"rotated-secret",organizationId:"other-org"})).status===409,"stale save rejected");
  const concurrent=await Promise.all([save(other,current.version,"save",{organizationId:"other-org"}),save(other,current.version,"save",{organizationId:"other-org"})]);
  check(concurrent.filter(r=>r.ok).length===1&&concurrent.filter(r=>r.status===409).length===1,"concurrent saves cannot overwrite one another");
  current=await status(other);
  check((await save(other,current.version,"save",{organizationId:"other-org",token:"rotated-secret"})).ok,"token rotation succeeds");
  check((await (await request("/api/onsign",undefined,otherCookie)).json()).players[0].name==="Rotated player","rotation invalidates old provider cache without restart");
  current=await status(other);
  check((await save(other,current.version,"disable")).ok,"client connection can be disabled");
  check((await (await request("/api/onsign",undefined,otherCookie)).json()).configured===false,"disabled connection cannot keep using cached credentials");
  current=await status(other);
  check((await save(other,current.version,"server")).ok&&!(await status(other)).configured,"restoring server config for a new client still cannot inherit Sephora");
  const sephoraCookie=await select("sephora");
  check((await (await request("/api/onsign",undefined,sephoraCookie)).json()).players[0].id==="player-sephora-org","another client's edits preserve Sephora connection");
  check((await save("sephora",null,"save",{token:"sephora-custom-secret",organizationId:"custom-org"})).ok,"Sephora can explicitly opt into dashboard settings");
  check((await (await request("/api/onsign",undefined,sephoraCookie)).json()).players[0].id==="player-custom-org","explicit Sephora override takes effect");
  sephora=await status("sephora");
  check((await save("sephora",sephora.version,"server")).ok,"Sephora server fallback can be restored");
  check((await (await request("/api/onsign",undefined,sephoraCookie)).json()).players[0].id==="player-sephora-org","restoring fallback restores original Sephora token");
  const audit=JSON.stringify((await pool.query("SELECT details FROM client_management_activity WHERE action='set_onsign'")).rows);
  check(!audit.includes("secret")&&!audit.includes("v1."),"audit events contain neither tokens nor ciphertext");
  check(JSON.stringify((await pool.query("SELECT to_jsonb(e) AS row FROM entities e ORDER BY id")).rows)===JSON.stringify(originalInventory),"settings preserve all existing inventory");
  check(JSON.stringify((await pool.query("SELECT to_jsonb(e) AS row FROM email_alert_settings e ORDER BY client_id")).rows)===JSON.stringify(originalEmail),"OnSign edits preserve email settings");
  for(const table of protectedTables) check(JSON.stringify((await pool.query('SELECT to_jsonb(t) AS row FROM "'+table+'" t ORDER BY to_jsonb(t)::text')).rows)===preserved.get(table),"OnSign edits preserve "+table);
  const actorId=(await pool.query("SELECT id FROM auth_user WHERE email='settings@example.test'")).rows[0].id;
  await pool.query("UPDATE auth_user SET disabled=true WHERE id=$1",[actorId]);
  check((await request("/api/client-onsign?client=sephora",undefined,cookie)).status===401,"disabled Admin cannot read settings");
  check((await save("sephora",(await pool.query("SELECT version FROM client_onsign_settings WHERE client_id='sephora'")).rows[0].version,"disable")).status===401,"disabled Admin cannot change settings");
  await pool.query("UPDATE auth_user SET disabled=false WHERE id=$1",[actorId]);
  check(!logs.includes("new-secret")&&!logs.includes("rotated-secret"),"application logs contain no submitted tokens");
  if (process.env.ONSIGN_SETTINGS_UI === "true") {
    console.log("UI fixture: "+origin+"; sign in settings@example.test / "+password);
    const done=path.resolve(".server-runtime/onsign-settings-ui.done");
    while(!fs.existsSync(done)) await new Promise(resolve=>setTimeout(resolve,500));
    fs.unlinkSync(done);
  }
  console.log(checks+" client OnSign settings integration checks passed.");
} finally {
  if(server&&server.exitCode===null){const exit=once(server,"exit");server.kill();await exit;}
  const roles=created?(await pool.query("SELECT id FROM clients WHERE id LIKE 'client-%'")).rows.map(c=>"pixcom_client_"+crypto.createHash("md5").update(c.id).digest("hex")):[];
  await pool.end(); if(created)await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');
  for(const role of roles)await admin.query('DROP ROLE IF EXISTS "'+role+'"');
  await admin.end();
}
