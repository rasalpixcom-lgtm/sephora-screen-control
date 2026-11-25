// Uses only disposable databases; privileged fixtures are never sent to a provider.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import pg from 'pg';
import {migrate} from '../scripts/migrate-postgres.mjs';
import {owned,seed} from './fixtures/client-ownership.mjs';
const name='sephora_scope_test_'+crypto.randomBytes(8).toString('hex');
const url=new URL(process.env.DATABASE_URL),adminUrl=new URL(url);adminUrl.pathname='/postgres';url.pathname='/'+name;
const admin=new pg.Pool({connectionString:adminUrl.href}),pool=new pg.Pool({connectionString:url.href});
let created=false,lib,server,checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)};
const jsonRows=async(db,table)=>(await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t`)).rows.map(r=>JSON.stringify(r.row)).sort();
try{
 await admin.query(`CREATE DATABASE "${name}"`);created=true;
 await pool.query('CREATE TABLE server_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const name of fs.readdirSync('db/postgres-migrations').filter(n=>n.endsWith('.sql')&&n<'0026_sephora_query_isolation.sql').sort()){
  const sql=fs.readFileSync('db/postgres-migrations/'+name,'utf8').replace(/\r\n/g,'\n');await pool.query(sql);
  await pool.query('INSERT INTO server_migrations(name,checksum) VALUES($1,$2)',[name,crypto.createHash('sha256').update(sql).digest('hex')]);
 }
 await pool.query(seed.replaceAll("'cms'", "'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'").replaceAll("'report'", "'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'"));
 const before=new Map();for(const t of owned)before.set(t,await jsonRows(pool,t));
 await migrate(pool);await migrate(pool);
 for(const t of owned)check(JSON.stringify(before.get(t))===JSON.stringify(await jsonRows(pool,t)),t+': migration preserves every original value');
 const runtimeUrl=new URL(url);runtimeUrl.searchParams.set('options','-c role='+encodeURIComponent((await pool.query('SELECT current_user AS name')).rows[0].name));
 process.env.DATABASE_URL=runtimeUrl.href;process.env.ONSIGN_API_TOKEN='';process.env.ALERT_EMAIL_USER='';process.env.ALERT_EMAIL_APP_PASSWORD='';process.env.ULTRAMSG_TOKEN='';
 const bundle=path.resolve('.server-runtime/client-query-isolation.cjs');
 await build({stdin:{contents:'export {getPool,database} from "./lib/database"; export {recordPreviewResult,reconcilePreviewInventory} from "./lib/preview-incidents"; export {processEmailAlerts} from "./lib/email-alert-server"; export {processWhatsAppAlerts} from "./lib/whatsapp-alert-server"; export {hashPassword} from "./lib/password"; export {alertSender} from "./lib/alert-mail"; export {whatsAppSender} from "./lib/whatsapp-message";',resolveDir:process.cwd(),loader:'ts'},outfile:bundle,platform:'node',format:'cjs',bundle:true,external:['pg','nodemailer','pdfkit']});
 lib=createRequire(import.meta.url)(bundle);
 const runtime=lib.getPool();
 check((await runtime.query('SELECT current_user AS name')).rows[0].name==='pixcom_sephora_runtime','all shared application/worker connections use the restricted role');
 for(const t of owned){
  check((await runtime.query(`SELECT * FROM "${t}"`)).rowCount>0,t+': existing Sephora rows remain readable');
  const security=(await pool.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',[t])).rows[0];check(security.relrowsecurity&&security.relforcerowsecurity,t+': forced row security is enabled');
 }
 // Transfer the disposable fixture graph atomically to the other owner. This
 // exercises every application table, including globally keyed singleton rows.
 await pool.query("INSERT INTO clients(id,slug,name) VALUES('other','other','PRIVATE OTHER CLIENT')");
 const c=await pool.connect();try{await c.query('BEGIN');for(const t of owned)await c.query(`UPDATE "${t}" SET client_id='other'`);await c.query('COMMIT');}finally{c.release();}
 await pool.query("INSERT INTO entities(id,type,name,parent_id,created_at,client_id) VALUES('foreign-screen','screen','Foreign screen','store','2026-01-01','other')");
 await pool.query("UPDATE email_alert_delivery SET status='sending'; UPDATE email_alert_queue SET status='sending'; UPDATE whatsapp_alert_delivery SET status='sending'; UPDATE whatsapp_alert_queue SET status='scheduled'");
 const foreign=new Map();for(const t of owned)foreign.set(t,await jsonRows(pool,t));
 for(const t of owned){
  check((await runtime.query(`SELECT * FROM "${t}"`)).rowCount===0,t+': foreign records are invisible');
  check((await runtime.query(`UPDATE "${t}" SET client_id=client_id`)).rowCount===0,t+': foreign records cannot be updated');
  check((await runtime.query(`DELETE FROM "${t}"`)).rowCount===0,t+': foreign records cannot be deleted');
  const row=(await pool.query(`SELECT to_jsonb(t) AS row FROM "${t}" t LIMIT 1`)).rows[0].row;
  await assert.rejects(runtime.query(`INSERT INTO "${t}" SELECT (jsonb_populate_record(NULL::"${t}",$1::jsonb)).*`,[JSON.stringify(row)]),e=>e.code==='42501');checks++;
 }
 // Mix visible inventory with foreign inventory; joined filters and broad
 // worker updates must continue to exclude the other client.
 await runtime.query("INSERT INTO entities(id,type,name,created_at) VALUES('visible-country','country','Visible Sephora country','2026-01-01')");
 check((await runtime.query('SELECT id FROM entities')).rows.map(r=>r.id).join()==='visible-country','mixed-client inventory returns only Sephora');
 await assert.rejects(runtime.query("INSERT INTO entities(id,type,name,parent_id,created_at) VALUES('bad-link','region','Bad link','country','2026-01-01')"),e=>e.code==='23503');checks++;
 await assert.rejects(runtime.query("INSERT INTO screen_notes(screen_id,note,version,updated_at) VALUES('foreign-screen','Cross-owner note','v',now())"),e=>e.code==='23503');checks++;
 await assert.rejects(runtime.query("UPDATE entities SET client_id='other' WHERE id='visible-country'"),e=>e.code==='42501');checks++;
 await assert.rejects(runtime.query('ALTER TABLE entities DISABLE ROW LEVEL SECURITY'),e=>e.code==='42501');checks++;
 const restricted=await runtime.connect();try{
  await restricted.query('SET row_security=off');await assert.rejects(restricted.query('SELECT * FROM entities'),e=>e.code==='42501');checks++;
 }finally{await restricted.query('RESET row_security');restricted.release();}
 const concurrent=await Promise.all(Array.from({length:20},()=>runtime.query('SELECT id FROM entities')));
 check(concurrent.every(r=>r.rows.length===1&&r.rows[0].id==='visible-country'),'pool concurrency never loses the workspace boundary');
 const token='fixture-token';await lib.recordPreviewResult({screenId:'screen',token,received:false,checkedAt:Date.now()});await lib.reconcilePreviewInventory();
 // Real worker entry points with injected senders; no external mail/messages.
 let sent=0;const send=async()=>{sent++;throw new Error('Unexpected foreign-client send')};
 await lib.processEmailAlerts({send}).catch(e=>{if(e.status!==503)throw e;});
 await lib.processWhatsAppAlerts({send}).catch(e=>{if(e.status!==503)throw e;});
 check(sent===0,'preview/email/WhatsApp workers do not act on foreign-only fixtures');
 for(const t of owned)if(t!=='entities')check(JSON.stringify(foreign.get(t))===JSON.stringify(await jsonRows(pool,t)),t+': worker and mutation attempts leave foreign records unchanged');
 // Exercise configured workers with visible Sephora settings and foreign-only
 // pending jobs. Injected senders prevent any external provider requests.
 await pool.query("UPDATE email_alert_settings SET client_id='sephora',enabled=true; UPDATE whatsapp_alert_settings SET client_id='sephora',enabled=true; UPDATE email_alert_queue SET status='pending',queued_at=now()-interval '1 hour'; UPDATE whatsapp_alert_queue SET status='pending'; UPDATE whatsapp_alert_delivery SET status='pending'");
 process.env.ALERT_EMAIL_USER='sender@example.test';process.env.ALERT_EMAIL_APP_PASSWORD='fake-fixture-password';process.env.ULTRAMSG_INSTANCE_ID='instance123';process.env.ULTRAMSG_TOKEN='fake-fixture-token';
 check(lib.alertSender().configured&&lib.whatsAppSender().configured,'configured-worker fixture reaches the active processing paths');
 const foreignOnly=async(t)=>(await pool.query(`SELECT to_jsonb(t) AS row FROM "${t}" t WHERE client_id='other'`)).rows.map(r=>JSON.stringify(r.row)).sort();
 const pendingBefore=new Map();for(const t of owned)pendingBefore.set(t,await foreignOnly(t));
 await lib.processEmailAlerts({send});await lib.processWhatsAppAlerts({send});
 check(sent===0,'configured alert workers never deliver foreign-client pending jobs');
 for(const t of owned)check(JSON.stringify(pendingBefore.get(t))===JSON.stringify(await foreignOnly(t)),t+': configured workers preserve foreign records');
 await pool.query("INSERT INTO client_memberships(client_id,user_id,role) VALUES('sephora','user','admin')");
 const password='Query-scope-fixture-password-2026!';await pool.query("UPDATE auth_account SET password=$1 WHERE user_id='user'",[await lib.hashPassword(password)]);
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[path.resolve('.next/standalone/server.js')],{windowsHide:true,stdio:'ignore',env:{...process.env,COMPLAINT_ALERTS_ENABLED:'false',HOSTNAME:'127.0.0.1',PORT:String(port),AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:'',AUTH_SECRET:crypto.randomBytes(48).toString('hex'),EMAIL_ALERT_WORKER_DISABLED:'true',WHATSAPP_ALERT_WORKER_DISABLED:'true',PREVIEW_WORKER_DISABLED:'true',ALERT_EMAIL_USER:'',ALERT_EMAIL_APP_PASSWORD:'',ULTRAMSG_TOKEN:''}});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}check(ready,'production server health verifies the scoped role and migration');
 const login=await fetch(origin+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.test',password})});check(login.ok,'global authentication still works with the restricted role');const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const routes=['/api/screen-notes?screenId=screen','/api/screen-hardware?screenId=screen','/api/screen-ppm-inspection?screenId=screen','/api/screen-remote-access?screenId=screen','/api/screen-gallery?screenId=screen','/api/screen-photo?screenId=screen','/api/location-photo?id=22222222-2222-4222-8222-222222222222&locationId=store','/api/cms-support?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','/api/cms-support/pdf?reportId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
 for(const route of routes)check((await fetch(origin+route,{headers:{Cookie:cookie}})).status===404,'Sephora Admin cannot fetch foreign record '+route);
 const state=await(await fetch(origin+'/api/state',{headers:{Cookie:cookie}})).json();check(state.entities.length===1&&state.entities[0].id==='visible-country','inventory endpoint excludes foreign client hierarchy');
 console.log(checks+' query/worker isolation checks passed on disposable PostgreSQL.');
}finally{
 if(server&&server.exitCode===null){const exit=once(server,'exit');server.kill();await exit;}
 if(lib)await lib.getPool().end();await pool.end();try {
  // Allow killed standalone connections to close; do not force-terminate a
  // connection while its pg Pool is draining.
  if(created)for(let attempt=0;;attempt++){
   try{await admin.query(`DROP DATABASE "${name}"`);break;}
   catch(error){if(error.code!=='55006'||attempt===25)throw error;await new Promise(r=>setTimeout(r,200));}
  }
 }finally{await admin.end();}
}
