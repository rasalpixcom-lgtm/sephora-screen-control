// Only disposable databases. No external email, WhatsApp or OnSign requests.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {createRequire} from "node:module";
import {build} from "esbuild";
import pg from "pg";
import {migrate} from "../scripts/migrate-postgres.mjs";
import {owned,seed} from "./fixtures/client-ownership.mjs";
const name="sephora_settings_test_"+crypto.randomBytes(8).toString("hex");
const url=new URL(process.env.DATABASE_URL),adminUrl=new URL(url);adminUrl.pathname="/postgres";url.pathname="/"+name;
const admin=new pg.Pool({connectionString:adminUrl.href}),pool=new pg.Pool({connectionString:url.href});
let created=false,lib,server,checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log("PASS "+label);};
const singletons=["display_state","monitor_access","email_alert_settings","whatsapp_alert_settings"];
const key="a".repeat(64),foreignKey="b".repeat(64);
const hash=s=>crypto.createHash("sha256").update(s).digest("hex");
const rows=async(t,where="",previousSchema=false)=>{
 const row=previousSchema&&t==="auth_user"?"to_jsonb(t) - 'controller_client_ids'":"to_jsonb(t)";
 return (await pool.query(`SELECT ${row} AS row FROM "${t}" t ${where}`)).rows.map(r=>JSON.stringify(r.row)).sort();
};
try{
 await admin.query(`CREATE DATABASE "${name}"`);created=true;
 await pool.query("CREATE TABLE server_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
 for(const file of fs.readdirSync("db/postgres-migrations").filter(n=>n.endsWith(".sql")&&n<"0027_client_settings.sql").sort()){
  const sql=fs.readFileSync("db/postgres-migrations/"+file,"utf8").replace(/\r\n/g,"\n");await pool.query(sql);
  await pool.query("INSERT INTO server_migrations(name,checksum) VALUES($1,$2)",[file,hash(sql)]);
 }
 await pool.query(seed);await pool.query("UPDATE monitor_access SET token_hash=$1",[hash(key)]);
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r=>r.tablename);
 const before=new Map();for(const t of tables)before.set(t,await rows(t));
 await migrate(pool);await migrate(pool);
 for(const t of tables)check(JSON.stringify(before.get(t))===JSON.stringify(await rows(t,t==="server_migrations"?"WHERE name < '0027_client_settings.sql'":"",true)),t+": all original values preserved after migration and rerun");
 for(const t of singletons){
  const definition=(await pool.query("SELECT pg_get_constraintdef(oid) AS value FROM pg_constraint WHERE conrelid=$1::regclass AND contype='p'",[t])).rows[0].value;
  check(definition==="PRIMARY KEY (client_id, id)",t+": singleton key belongs to its client");
 }
 for(const t of owned){const security=(await pool.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",[t])).rows[0];check(security.relrowsecurity&&security.relforcerowsecurity,t+": forced row security retained");}
 await pool.query("INSERT INTO clients(id,slug,name) VALUES('other','other','Other private client')");
 for(const t of singletons)await pool.query(`INSERT INTO "${t}" SELECT (jsonb_populate_record(NULL::"${t}",to_jsonb(t)||'{"client_id":"other"}'::jsonb)).* FROM "${t}" t WHERE client_id='sephora'`);
 await pool.query("UPDATE monitor_access SET token_hash=$1,generation='other-generation' WHERE client_id='other'",[hash(foreignKey)]);
 await pool.query(`UPDATE display_state SET interval_seconds=59 WHERE client_id='other'; UPDATE email_alert_settings SET recipients='["private@example.test"]',enabled=true WHERE client_id='other'; UPDATE whatsapp_alert_settings SET recipients='["+971500009999"]',enabled=true WHERE client_id='other'`);
 const foreign=new Map();for(const t of singletons){foreign.set(t,await rows(t,"WHERE client_id='other'"));check((await pool.query(`SELECT * FROM "${t}" WHERE id='main'`)).rowCount===2,t+": both clients can retain main settings simultaneously");}
 process.env.DATABASE_URL=url.href;process.env.PIXCOM_CLIENT_INTEGRATIONS='{"sephora":{}}';
 const bundle=path.resolve(".server-runtime/client-settings.cjs");
 await build({stdin:{contents:'export {getPool} from "./lib/database"; export {readState} from "./lib/store"; export {validMonitorKey,monitorLinkStatus} from "./lib/monitor-access"; export {emailAlertSnapshot,saveEmailAlertSettings,processEmailAlerts} from "./lib/email-alert-server"; export {whatsappSnapshot,saveWhatsAppSettings,processWhatsAppAlerts} from "./lib/whatsapp-alert-server"; export {hashPassword} from "./lib/password"; export {recordPreviewResult,reconcilePreviewInventory} from "./lib/preview-incidents";',resolveDir:process.cwd(),loader:"ts"},outfile:bundle,platform:"node",format:"cjs",bundle:true,external:["pg","nodemailer","pdfkit"]});
 lib=createRequire(import.meta.url)(bundle);
 for(const t of singletons)check((await lib.getPool().query(`SELECT * FROM "${t}" WHERE id='main'`)).rowCount===1,t+": application reads only its own singleton");
 // The old display fixture predates the current selection format; retain it
 // byte-for-byte through the migration, then use the API to save current format.
 check((await lib.readState()).display.intervalSeconds!==59,"display read does not use other-client settings");
 check(await lib.validMonitorKey("Bearer "+key),"existing Sephora monitor link remains valid after migration");
 check(!await lib.validMonitorKey("Bearer "+foreignKey),"another client's valid monitor key cannot open Sephora");
 for(const [get,save,label,recipients] of [[lib.emailAlertSnapshot,lib.saveEmailAlertSettings,"email",["new@example.test"]],[lib.whatsappSnapshot,lib.saveWhatsAppSettings,"WhatsApp",["+971500001111"]]]){
  const initial=await get();check(!JSON.stringify(initial).includes("private@example.test")&&!JSON.stringify(initial).includes("009999"),label+": snapshot excludes foreign recipients");
  const next={...initial.settings,enabled:false,recipients,thresholdMinutes:7};await save(next,"Settings fixture");
  check((await get()).settings.thresholdMinutes===7,label+": own settings saved");
  await assert.rejects(()=>save(next,"Settings fixture"),e=>e.status===409);checks++;
 }
 let sent=0;const send=async()=>{sent++;throw new Error("No external delivery allowed");};
 await lib.processEmailAlerts({send});await lib.processWhatsAppAlerts({send});check(sent===0,"workers ignore foreign enabled settings");
 // Same-client processing is serialized, whereas a foreign-client lock cannot
 // block Sephora. Change a visible crash marker to observe lock acquisition.
 const locker=await pool.connect();
 try{
  for(const [operation,work,table] of [[724020,lib.processEmailAlerts,"email_alert_delivery"],[724022,lib.processWhatsAppAlerts,"whatsapp_alert_delivery"]]){
   await pool.query(`UPDATE "${table}" SET status='sending'`);
   await locker.query("SELECT pg_advisory_lock($1,hashtext('sephora'))",[operation]);
   await work({send});check((await pool.query(`SELECT status FROM "${table}"`)).rows[0].status==="sending","same-client worker lock prevents concurrent "+table+" processing");
   await locker.query("SELECT pg_advisory_unlock($1,hashtext('sephora'))",[operation]);
   await locker.query("SELECT pg_advisory_lock($1,hashtext('other'))",[operation]);
   await work({send});check((await pool.query(`SELECT status FROM "${table}"`)).rows[0].status==="uncertain","other-client worker lock does not block "+table);
   await locker.query("SELECT pg_advisory_unlock($1,hashtext('other'))",[operation]);
  }
 }finally{await locker.query("SELECT pg_advisory_unlock_all()");locker.release();}
 await pool.query("INSERT INTO client_memberships(client_id,user_id,role) VALUES('sephora','user','admin')");
 const password="Settings-fixture-password-2026!";await pool.query("UPDATE auth_account SET password=$1 WHERE user_id='user'",[await lib.hashPassword(password)]);
 const probe=net.createServer();await new Promise(r=>probe.listen(0,"127.0.0.1",r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[path.resolve(".next/standalone/server.js")],{windowsHide:true,stdio:"ignore",env:{...process.env,HOSTNAME:"127.0.0.1",PORT:String(port),AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:"",AUTH_SECRET:crypto.randomBytes(48).toString("hex"),EMAIL_ALERT_WORKER_DISABLED:"true",WHATSAPP_ALERT_WORKER_DISABLED:"true",PREVIEW_WORKER_DISABLED:"true"}});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+"/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}check(ready,"production server recognizes client settings migration");
 const login=await fetch(origin+"/api/auth/sign-in/email",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({email:"admin@example.test",password})});check(login.ok,"existing admin can sign in");const cookie=login.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ");
 const request=(route,body,headers={})=>fetch(origin+route,{method:body?"POST":"GET",headers:{Cookie:cookie,Origin:origin,...(body?{"Content-Type":"application/json"}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
 check((await request("/api/monitor-state",null,{Authorization:"Bearer "+foreignKey})).status===401,"foreign monitor key rejected over HTTP");
 check((await request("/api/monitor-state",null,{Authorization:"Bearer "+key})).ok,"unchanged monitor key works over HTTP");
 check((await request("/api/state",null,{"x-client-id":"other"})).status===403,"request headers cannot select another client's settings");
 check((await request("/api/state",{action:"display",selection:{screenIds:["screen"]},autoAdvance:true,intervalSeconds:15})).ok,"display upsert updates only Sephora with both client settings present");
 check((await lib.readState()).display.intervalSeconds===15,"saved display settings read back correctly");
 const initial=await(await request("/api/monitor-link")).json();
 const replaced=await request("/api/monitor-link",{action:"replace",generation:initial.generation});check(replaced.ok,"monitor replacement targets client-specific key");const fresh=await replaced.json();
 check(!await lib.validMonitorKey("Bearer "+key),"replacement revokes only Sephora's old monitor key");
 check(await lib.validMonitorKey("Bearer "+fresh.link.split("#key=")[1]),"replacement key works");
 check((await request("/api/monitor-link",{action:"replace",generation:initial.generation})).status===409,"stale monitor replacement rejected");
 check((await request("/api/monitor-link",{action:"disable",generation:fresh.generation})).ok,"monitor can be disabled");
 check((await request("/api/monitor-link",{action:"create"})).ok,"monitor create uses composite client key after disabling");
 for(const route of ["/api/email-alerts","/api/whatsapp-alerts"]){
  const snapshot=await(await request(route)).json();
  check((await request(route,{...snapshot.settings,thresholdMinutes:8})).ok,route+": authenticated settings update succeeds");
  check((await request(route,{...snapshot.settings,thresholdMinutes:9})).status===409,route+": stale settings save rejected");
 }
 // Six mutation routes must wait for the same client inventory lock. Missing
 // targets return 404 after lock acquisition, so this check writes no inventory.
 const inventoryLocker=await pool.connect();
 const waitForBlocked=async(operation,expected)=>{
  for(let i=0;i<100;i++){
   const count=(await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1",["SELECT pg_advisory_xact_lock("+operation+"%"])).rows[0].n;
   if(count===expected)return count;
   await new Promise(r=>setTimeout(r,30));
  }
  return 0;
 };
 try{
  await inventoryLocker.query("SELECT pg_advisory_lock(724017,hashtext('sephora'))");
  const mutations=[
   ["/api/state","POST",{action:"delete",id:"missing"}],
   ["/api/screen-hardware","PUT",{screenId:"missing",section:"mediaPlayer",version:null,fields:{}}],
   ["/api/screen-ppm-inspection","PUT",{screenId:"missing",version:null,fields:{}}],
   ["/api/screen-gallery","PUT",{screenId:"missing",category:"front",action:"remove",expectedKey:null}],
   ["/api/survey-import","POST",{screenId:"missing",text:""}],
   ["/api/cms-support","POST",{action:"update",id:crypto.randomUUID(),version:crypto.randomUUID()}],
  ];
  const requests=mutations.map(([route,method,body])=>fetch(origin+route,{method,headers:{Cookie:cookie,Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(body)}));
  try{check(await waitForBlocked(724017,6)===6,"inventory, hardware, PPM, photos, survey and CMS share the same client lock");}
  finally{await inventoryLocker.query("SELECT pg_advisory_unlock_all()");const responses=await Promise.all(requests);responses.forEach((r,i)=>check(r.status===404,mutations[i][0]+": lock releases normally without changing validation"));}
  await inventoryLocker.query("SELECT pg_advisory_lock(724017,hashtext('other'))");
  const response=await fetch(origin+"/api/state",{method:"POST",headers:{Cookie:cookie,Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({action:"delete",id:"missing"}),signal:AbortSignal.timeout(5000)});
  check(response.status===404,"another client's inventory lock does not block Sephora");
  await inventoryLocker.query("SELECT pg_advisory_unlock_all()");
  await pool.query("UPDATE entities SET live_url='https://app.onsign.tv/embed/fixture-token' WHERE id='screen'");
  await pool.query("UPDATE preview_incident SET resolved_at=NULL,resolution_reason=NULL,source_fingerprint=$1 WHERE id='incident'",[hash("fixture-token")]);
  await inventoryLocker.query("SELECT pg_advisory_lock(724019,hashtext('sephora:screen'))");
  const tasks=[lib.recordPreviewResult({screenId:"screen",token:"fixture-token",received:true,checkedAt:Date.now()}),lib.reconcilePreviewInventory()];
  try{check(await waitForBlocked(724019,2)===2,"preview result and reconciliation workers share the same client/screen lock");}
  finally{await inventoryLocker.query("SELECT pg_advisory_unlock_all()");await Promise.all(tasks);}
  await inventoryLocker.query("SELECT pg_advisory_lock(724019,hashtext('other:screen'))");
  await lib.recordPreviewResult({screenId:"screen",token:"fixture-token",received:true,checkedAt:Date.now()+1});
  check(true,"another client's preview lock does not block Sephora");
 }finally{await inventoryLocker.query("SELECT pg_advisory_unlock_all()");inventoryLocker.release();}
 for(const t of singletons)check(JSON.stringify(foreign.get(t))===JSON.stringify(await rows(t,"WHERE client_id='other'")),t+": all foreign values unchanged after API and worker operations");
 console.log(checks+" client settings checks passed on disposable PostgreSQL.");
}finally{
 if(server&&server.exitCode===null){const exit=once(server,"exit");server.kill();await exit;}
 if(lib)await lib.getPool().end();await pool.end();
 try{if(created)for(let attempt=0;;attempt++){try{await admin.query(`DROP DATABASE "${name}"`);break;}catch(e){if(e.code!=="55006"||attempt===25)throw e;await new Promise(r=>setTimeout(r,200));}}}finally{await admin.end();}
}
