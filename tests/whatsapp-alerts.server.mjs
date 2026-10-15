import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import pg from "pg";
import {migrate} from "../scripts/migrate-postgres.mjs";
const root=process.cwd(),databaseName="sephora_whatsapp_test_"+crypto.randomBytes(8).toString("hex");
const adminUrl=new URL(process.env.DATABASE_URL);adminUrl.pathname="/postgres";
const testUrl=new URL(process.env.DATABASE_URL);testUrl.pathname="/"+databaseName;
const adminPool=new pg.Pool({connectionString:adminUrl.toString()}),pool=new pg.Pool({connectionString:testUrl.toString()});
const output=new URL("../.server-runtime/whatsapp-alert-test.cjs",import.meta.url);
let lib,server,provider,checks=0,logs="",mode="accept";const requests=[];
const check=(value,message)=>{assert.ok(value,message);checks++;console.log("PASS "+message);};
const rejects=async(fn,status,message)=>{await assert.rejects(fn,error=>error.status===status);check(true,message);};
const one="+971501234567",two="+966501234567",three="+97450123456";
const base=Date.now(),at=minutes=>new Date(base+minutes*60000),sent=[];
const send=async message=>{sent.push(message);return {providerId:"mock-"+sent.length};};
const token=id=>"whatsapp-test-"+id;
async function entity(id,type,parentId=null,url=null){await pool.query("INSERT INTO entities(id,type,name,parent_id,live_url,is_demo,created_at) VALUES($1,$2,$1,$3,$4,0,$5)",[id,type,parentId,url,at(0).toISOString()]);}
async function screen(id){await entity(id,"screen","mall","https://app.onsign.tv/embed/"+token(id));}
async function observe(id,minute,received=false){await lib.recordPreviewResult({screenId:id,token:token(id),checkedAt:at(minute).getTime(),received});}
async function refresh(ids,minute){for(const id of ids)await observe(id,minute);}
async function settings(change={}){await pool.query("UPDATE whatsapp_alert_settings SET enabled=$1,threshold_minutes=$2,grouping_minutes=$3,recovery_email=$4,recipients=$5,updated_at=$6,revision=$7 WHERE id='main'",[change.enabled??true,change.thresholdMinutes??20,change.groupingMinutes??5,change.recoveryEmail??true,JSON.stringify(change.recipients??[one,two]),at(change.updatedMinute??-1),crypto.randomUUID()]);}
async function reset(){await pool.query("TRUNCATE whatsapp_alert_queue,whatsapp_alert_delivery,email_alert_queue,preview_incident,preview_screen_state");sent.length=0;await settings();}
async function processAt(minute,sender=send){await lib.processWhatsAppAlerts({now:at(minute),send:sender});}
try{
 await adminPool.query('CREATE DATABASE "'+databaseName+'"');await migrate(pool);await migrate(pool);
 process.env.DATABASE_URL=testUrl.toString();process.env.ULTRAMSG_INSTANCE_ID="instance8591";process.env.ULTRAMSG_TOKEN="fake-whatsapp-test-token";
 await fs.mkdir(new URL("../.server-runtime/",import.meta.url),{recursive:true});
 await build({stdin:{contents:'export * from "./lib/whatsapp-alert-server";export * from "./lib/whatsapp-alert-shared";export * from "./lib/whatsapp-message";export * from "./lib/preview-incidents";export {getPool} from "./lib/database";',resolveDir:root,loader:"ts"},outfile:fileURLToPath(output),platform:"node",format:"cjs",bundle:true,external:["pg","pdfkit"]});
 lib=createRequire(import.meta.url)(fileURLToPath(output));
 const defaults=await lib.whatsappSnapshot();
 check(!defaults.settings.enabled&&defaults.settings.thresholdMinutes===20&&defaults.settings.groupingMinutes===5,"WhatsApp alerts default disabled with independent timing");
 check(defaults.sender.configured&&defaults.sender.instance==="instance8591"&&!JSON.stringify(defaults).includes("fake-whatsapp-test-token"),"snapshot exposes configuration status without the API token");
 const valid={...defaults.settings,enabled:true,recipients:[one]};
 check(lib.parseWhatsAppSettings({...valid,recipients:[" +971 (50) 123-4567 "]}).recipients[0]===one,"phone formatting is normalized to an international number");
 for(const number of ["0501234567","971501234567","+0012345678","+123","+1234567890123456","123@g.us","123@c.us","+971abc123","+971501234567&body=attack",null,{}]){check(lib.normalizePhone(number)===null,"invalid recipient format rejected: "+String(number));}
 for(const patch of [{thresholdMinutes:0},{thresholdMinutes:1441},{thresholdMinutes:1.5},{groupingMinutes:0},{groupingMinutes:61},{enabled:"true"},{recoveryEmail:1},{recipients:[]},{recipients:[one,"+971 50 123 4567"]},{recipients:Array(21).fill(one)},{revision:"invalid"}]){assert.throws(()=>lib.parseWhatsAppSettings({...valid,...patch}));check(true,"invalid settings rejected: "+Object.keys(patch)[0]);}
 process.env.ULTRAMSG_TOKEN="";await rejects(()=>lib.saveWhatsAppSettings(valid,"Test admin"),400,"enabling requires server credentials");await rejects(()=>lib.queueWhatsAppSend("test"),400,"test send requires server credentials");process.env.ULTRAMSG_TOKEN="fake-whatsapp-test-token";
 await lib.saveWhatsAppSettings(valid,"Test admin");await rejects(()=>lib.saveWhatsAppSettings(valid,"Test admin"),409,"stale settings revisions cannot overwrite a newer save");
 check(!(await pool.query("SELECT enabled FROM email_alert_settings")).rows[0].enabled,"saving WhatsApp settings leaves email settings unchanged");
 await entity("country","country");await entity("region","region","country");await entity("mall","store","region");for(const id of ["a","b","early","stale","changed","future","manual","recovery"])await screen(id);
 await entity("missing","screen","mall");await entity("unsupported","screen","mall","https://example.test/preview");
 await reset();await refresh(["a","b","early"],0);await refresh(["a","b","early"],19);await processAt(19);
 check((await pool.query("SELECT id FROM whatsapp_alert_queue")).rowCount===0,"outages do not qualify before the configured threshold");
 await refresh(["a","early"],20);await processAt(20);check(sent.length===0,"qualification starts the grouping window without sending immediately");
 await observe("b",23);await processAt(23);await observe("early",24,true);await refresh(["a","b"],24.99);await processAt(24.99);check(sent.length===0,"grouping window does not send early");
 await refresh(["a","b"],25);await processAt(25);
 check(sent.length===2&&sent.every(item=>item.rows.length===2),"qualified screens are grouped into one message per saved number");
 check(sent.every(item=>!item.rows.some(row=>row.screenName==="early")),"previews recovered during grouping are excluded");
 check(!JSON.stringify(sent).includes("whatsapp-test-")&&!JSON.stringify(sent).includes("liveUrl"),"provider payloads exclude private preview links and fingerprints");
 await refresh(["a","b"],26);await processAt(26);check(sent.length===2,"accepted recipients are not sent the same outage twice");
 check((await pool.query("SELECT id FROM email_alert_queue")).rowCount===0,"WhatsApp sends do not consume the automatic email queue");
 await observe("a",27,true);await observe("b",27);await processAt(27);await observe("a",32,true);await observe("b",32);await processAt(32);
 check(sent.length===4&&sent.slice(2).every(item=>item.kind==="recovery"&&item.rows.length===1),"recovery is sent only for previously accepted outages");
 await observe("a",33,true);await observe("b",33);await processAt(33);check(sent.length===4,"recovery messages are deduplicated per recipient");
 await settings({recipients:[one,two,three]});await refresh(["b"],34);await processAt(34);await refresh(["b"],39);await processAt(39);
 check(sent.length===5&&sent[4].recipient===three&&sent[4].rows[0].screenName==="b","a new recipient receives their own grouped notification for a current qualifying outage");
 await reset();await observe("a",0);await observe("a",20);await processAt(20);await observe("a",25);
 let attempts=0;const partial=async message=>{attempts++;if(message.recipient===two)throw new lib.WhatsAppSendError("rejected");return send(message);};
 await processAt(25,partial);check(attempts===2&&sent.length===1,"one recipient rejection does not erase another recipient acceptance");
 await observe("a",25.5);await processAt(25.5,partial);check(attempts===2,"a rejected request waits before retrying");
 await observe("a",26);await processAt(26,partial);check(attempts===3&&sent.length===1,"retry targets only the failed recipient");
 await observe("a",28);await processAt(28);check(sent.length===2&&sent[1].recipient===two,"later successful retry leaves the accepted number untouched");
 await reset();await observe("a",0);await observe("a",20);await processAt(20);await observe("a",25);await processAt(25,async()=>{throw new lib.WhatsAppSendError("uncertain",true);});
 await observe("a",30);await processAt(30);check(sent.length===0&&(await pool.query("SELECT id FROM whatsapp_alert_queue WHERE status='uncertain'")).rowCount===2,"ambiguous provider responses stop automatic retries to avoid duplicates");
 await reset();await observe("a",0);await observe("a",20);await processAt(20);await observe("a",25);await processAt(25,partial);await observe("a",26,true);await processAt(26);await observe("a",31,true);await processAt(31);
 check(sent.length===2&&sent[1].kind==="recovery"&&sent[1].recipient===one,"recovery is not sent to a recipient whose outage request was rejected");
 await reset();await observe("a",0);await observe("a",20);await processAt(20);await observe("a",25);await processAt(25);await observe("a",26,true);await processAt(26);await settings({updatedMinute:27});await observe("a",31,true);await processAt(31);
 check(sent.length===4&&sent.slice(2).every(item=>item.kind==="recovery"),"saving settings does not strand an already queued recovery");
 await reset();await observe("a",0);await observe("a",20);await processAt(20);await settings({recipients:[one]});await observe("a",21);await processAt(21);await settings({recipients:[one,two]});await observe("a",22);await processAt(22);
 const reinstated=(await pool.query("SELECT status,queued_at FROM whatsapp_alert_queue WHERE recipient=$1",[two])).rows[0];
 check(reinstated.status==="pending"&&reinstated.queued_at.getTime()===at(22).getTime(),"re-added recipients get a fresh grouping window for unsent current outages");
 await observe("a",25);await processAt(25);check(sent.length===1&&sent[0].recipient===one,"re-added numbers respect their own grouping window");await observe("a",27);await processAt(27);check(sent.length===2&&sent[1].recipient===two,"re-added recipient is notified without resending to the accepted number");
 await reset();await settings({recipients:[one]});await observe("a",0);await observe("a",20);await processAt(20);
 const cancelQueue=(await pool.query("SELECT id,incident_id FROM whatsapp_alert_queue")).rows[0],cancelJob=crypto.randomUUID();
 await pool.query("INSERT INTO whatsapp_alert_delivery(id,batch_id,recipient,kind,incident_ids,screen_count,queued_at) VALUES($1,$1,$2,'unavailable',$3,1,$4)",[cancelJob,one,JSON.stringify([cancelQueue.incident_id]),at(20)]);
 await pool.query("UPDATE whatsapp_alert_queue SET status='scheduled',delivery_id=$1 WHERE id=$2",[cancelJob,cancelQueue.id]);await settings({recipients:[two]});
 await pool.query("CREATE FUNCTION fixture_cancel_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='scheduled' AND NEW.status='pending' THEN RAISE EXCEPTION 'fixture_cancel_failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_cancel_failure BEFORE UPDATE ON whatsapp_alert_queue FOR EACH ROW EXECUTE FUNCTION fixture_cancel_failure()");
 await assert.rejects(()=>processAt(21),/fixture_cancel_failure/);check(true,"database cancellation failure is injected before queue release");
 check((await pool.query("SELECT status FROM whatsapp_alert_delivery WHERE id=$1",[cancelJob])).rows[0].status==="pending"&&(await pool.query("SELECT status FROM whatsapp_alert_queue WHERE id=$1",[cancelQueue.id])).rows[0].status==="scheduled","delivery cancellation and queue release roll back together on database failure");
 await pool.query("DROP TRIGGER fixture_cancel_failure ON whatsapp_alert_queue; DROP FUNCTION fixture_cancel_failure()");await observe("a",22);await processAt(22);
 check((await pool.query("SELECT status FROM whatsapp_alert_delivery WHERE id=$1",[cancelJob])).rows[0].status==="cancelled"&&(await pool.query("SELECT status FROM whatsapp_alert_queue WHERE id=$1",[cancelQueue.id])).rows[0].status==="pending","cancelled jobs release queue records together after retry");
 await reset();await refresh(["stale","changed","future"],0);await observe("changed",20);await observe("future",30);await pool.query("UPDATE entities SET live_url='https://app.onsign.tv/embed/replaced' WHERE id='changed'");await processAt(25);
 check((await pool.query("SELECT id FROM whatsapp_alert_queue")).rowCount===0,"stale checks, replaced sources and future checks are excluded");
 check((await lib.previewWhatsAppManual({now:at(25)})).screenCount===0,"manual report also excludes stale, unsupported and unconfirmed previews");
 await reset();await settings({enabled:false,thresholdMinutes:1440,recipients:[one,two]});await observe("manual",40);
 let preview=await lib.previewWhatsAppManual({now:at(40)});check(preview.screenCount===1&&preview.recipientCount===2,"manual preview counts use saved recipients regardless of automatic enablement");
 const queued=await lib.queueWhatsAppSend("manual",preview.confirmationToken,{now:at(40)});check(queued.status==="queued"&&sent.length===0,"manual report is durably queued without blocking on the provider");
 await processAt(40);check(sent.length===2&&sent.every(item=>item.kind==="manual"),"manual sends bypass threshold and grouping while automatic alerts are disabled");
 check((await pool.query("SELECT id FROM whatsapp_alert_queue")).rowCount===0,"manual report leaves automatic deduplication untouched");
 await rejects(()=>lib.queueWhatsAppSend("manual",preview.confirmationToken,{now:at(40.1)}),429,"manual send cooldown is persisted in PostgreSQL");
 await settings({enabled:false,recipients:[one]});await rejects(()=>lib.queueWhatsAppSend("manual",preview.confirmationToken,{now:at(41)}),409,"confirmation is rejected when saved recipients change");
 preview=await lib.previewWhatsAppManual({now:at(41)});await observe("manual",41,true);await rejects(()=>lib.queueWhatsAppSend("manual",preview.confirmationToken,{now:at(41)}),409,"confirmation is rejected when a preview recovers");
 preview=await lib.previewWhatsAppManual({now:at(41)});await rejects(()=>lib.queueWhatsAppSend("manual",preview.confirmationToken,{now:at(41)}),400,"empty manual reports are not queued");
 await reset();await settings({enabled:false});await observe("a",50);preview=await lib.previewWhatsAppManual({now:at(50)});await lib.queueWhatsAppSend("manual",preview.confirmationToken,{now:at(50)});await observe("a",50.5,true);await processAt(50.5);
 check(sent.length===0&&(await pool.query("SELECT id FROM whatsapp_alert_delivery WHERE status='cancelled'")).rowCount===2,"recovery before dispatch cancels pending manual reports");
 await reset();await settings({enabled:false});await lib.queueWhatsAppSend("test",undefined,{now:at(60)});await settings({enabled:false,recipients:[one]});await processAt(60);
 check(sent.length===1&&sent[0].recipient===one,"removing a recipient cancels their pending test job");
 await reset();await settings({enabled:false,recipients:[one]});await observe("a",65);preview=await lib.previewWhatsAppManual({now:at(65)});await lib.queueWhatsAppSend("manual",preview.confirmationToken,{now:at(65)});await pool.query("UPDATE entities SET live_url='https://app.onsign.tv/embed/replaced-a' WHERE id='a'");await processAt(65);
 check(sent.length===0,"pending manual reports revalidate the live preview source before sending");await pool.query("UPDATE entities SET live_url=$1 WHERE id='a'",["https://app.onsign.tv/embed/"+token("a")]);
 await reset();await settings({enabled:false});const concurrent=await Promise.allSettled([lib.queueWhatsAppSend("test",undefined,{now:at(70)}),lib.queueWhatsAppSend("test",undefined,{now:at(70)})]);
 check(concurrent.filter(result=>result.status==="fulfilled").length===1,"concurrent test clicks create only one batch");
 await pool.query("UPDATE whatsapp_alert_delivery SET status='sending'");await processAt(70);check(sent.length===0&&(await pool.query("SELECT id FROM whatsapp_alert_delivery WHERE status='uncertain'")).rowCount===2,"restart does not resend a job interrupted during provider acceptance");
 await reset();await observe("a",0);await observe("a",20);await processAt(20);await observe("a",25);await settings({enabled:false});await processAt(25);check(sent.length===0,"disabling automatic alerts prevents sending pending outages");
 await reset();await observe("recovery",0);await observe("recovery",20);await processAt(20);await observe("recovery",25);await processAt(25);await observe("recovery",26,true);await processAt(26);await observe("recovery",27);await observe("recovery",32,true);await processAt(32);
 check(sent.length===2,"a queued recovery from an older outage is excluded after a newer outage starts");
 await reset();await settings({recoveryEmail:false});await observe("a",0);await observe("a",20);await processAt(20);await observe("a",25);await processAt(25);await observe("a",26,true);await processAt(26);await observe("a",31,true);await processAt(31);
 check(sent.length===2,"recovery messages remain disabled unless selected in settings");
 await reset();await settings({enabled:false,recipients:[one]});await lib.queueWhatsAppSend("test",undefined,{now:at(80)});let concurrentCalls=0;const slow=async message=>{concurrentCalls++;await new Promise(resolve=>setTimeout(resolve,30));return send(message);};await Promise.all([processAt(80,slow),processAt(80,slow)]);
 check(concurrentCalls===1,"concurrent workers share a database lock and cannot send the same job twice");
 await reset();await settings({enabled:false,recipients:[one,two,three,"+97350123456"]});await lib.queueWhatsAppSend("test",undefined,{now:at(90)});await processAt(90);
 check(sent.length===3&&(await pool.query("SELECT id FROM whatsapp_alert_delivery WHERE status='pending'")).rowCount===1,"worker limits each pass to three recipient jobs");await processAt(90);
 check(sent.length===4&&(await pool.query("SELECT id FROM whatsapp_alert_delivery WHERE status='pending'")).rowCount===0,"remaining recipient jobs resume without resending accepted jobs");
 for(const sql of ["UPDATE whatsapp_alert_settings SET threshold_minutes=0", "UPDATE whatsapp_alert_settings SET grouping_minutes=61", "UPDATE whatsapp_alert_settings SET recipients='{}'::jsonb"]){await assert.rejects(()=>pool.query(sql),error=>error.code==="23514");check(true,"database enforces settings constraint: "+sql.split(" SET ")[1].split("=")[0]);}
 await reset();await settings({recipients:[one],thresholdMinutes:1,groupingMinutes:1});
 const capacityUrl="https://app.onsign.tv/embed/capacity-shared",capacityFingerprint=lib.previewSourceFingerprint("capacity-shared");
 await pool.query("INSERT INTO entities(id,type,name,parent_id,live_url,is_demo,created_at) SELECT 'capacity-'||g,'screen','Capacity screen '||g,'mall',$1,0,$2 FROM generate_series(1,5001) g",[capacityUrl,at(0).toISOString()]);
 await pool.query("INSERT INTO preview_incident(id,screen_id,source_fingerprint,started_at,last_checked_at) SELECT 'capacity-incident-'||g,'capacity-'||g,$1,$2,$3 FROM generate_series(1,5001) g",[capacityFingerprint,at(0),at(20)]);
 await pool.query("INSERT INTO preview_screen_state(screen_id,source_fingerprint,status,last_checked_at,updated_at) SELECT 'capacity-'||g,$1,'unavailable',$2,$2 FROM generate_series(1,5001) g",[capacityFingerprint,at(20)]);
 const capacityPreview=await lib.previewWhatsAppManual({now:at(20)});await rejects(()=>lib.queueWhatsAppSend("manual",capacityPreview.confirmationToken,{now:at(20)}),400,"manual PDF requests above 5,000 screens fail before creating any jobs");
 await processAt(20);await processAt(21);check(sent.length===1&&sent[0].rows.length===5000,"automatic PDF batches cap at 5,000 complete rows");await processAt(21);check(sent.length===2&&sent[1].rows.length===1,"remaining automatic rows are sent in the next batch without truncation");
 await reset();await pool.query("DELETE FROM entities WHERE id LIKE 'capacity-%'");
 const row={screenName:"Screen *_Name_",locationName:"Mall",regionName:"Dubai",countryName:"United Arab Emirates",startedAt:at(0).toISOString(),lastCheckedAt:at(20).toISOString(),resolvedAt:null};
 const message={kind:"unavailable",recipient:one,rows:[row,{...row,screenName:"Older",startedAt:at(-120).toISOString()}],generatedAt:at(20),referenceId:crypto.randomUUID()};
 const text=lib.whatsAppMessageText(message);check(text.indexOf("Older")<text.indexOf("Screen Name")&&text.includes("GST (UTC+4)")&&text.includes("2 screens"),"message text is ordered by outage duration and identifies time zone and count");
 const long=lib.whatsAppMessageText({...message,rows:Array.from({length:100},(_,i)=>({...row,screenName:"Screen "+i+" "+"X".repeat(300)}))});check(long.length<=4096&&long.includes("more screens")&&long.includes("100 screens"),"large reports stay within UltraMsg limits with an explicit remaining count");
 check(lib.whatsAppMessageText({...message,kind:"recovery",rows:[{...row,resolvedAt:at(10).toISOString()}]}).includes("Outage lasted: 10m"),"recovery duration ends when the preview recovers");
 provider=http.createServer(async(req,res)=>{let content="";for await(const chunk of req)content+=chunk;requests.push({url:req.url,method:req.method,type:req.headers["content-type"],form:Object.fromEntries(new URLSearchParams(content))});res.setHeader("Content-Type","application/json");if(mode==="http500"){res.statusCode=500;res.end("{}");}else if(mode==="http401"){res.statusCode=401;res.end("{}");}else if(mode==="disconnect")res.destroy();else if(mode==="invalid")res.end("invalid-json");else if(mode==="large")res.end("X".repeat(70000));else if(mode==="reject")res.end(JSON.stringify({sent:"false",error:"private test token fake-whatsapp-test-token"}));else res.end(JSON.stringify({sent:mode==="boolean"?true:"true",message:"ok",id:12345}));});
 await new Promise(resolve=>provider.listen(0,"127.0.0.1",resolve));process.env.ULTRAMSG_TEST_ORIGIN="http://127.0.0.1:"+provider.address().port;
 check((await lib.sendWhatsAppMessage(message)).providerId==="12345","transport accepts UltraMsg string success response and records provider id");
 const wire=requests.at(-1);check(wire.method==="POST"&&wire.url==="/instance8591/messages/document"&&wire.type==="application/x-www-form-urlencoded","provider request uses POST form data without token in the URL");
 check(wire.form.to===one&&wire.form.token==="fake-whatsapp-test-token"&&wire.form.priority==="1"&&wire.form.referenceId===message.referenceId&&wire.form.caption===lib.whatsAppDocumentCaption(message)&&Buffer.from(wire.form.document,"base64").subarray(0,5).toString()==="%PDF-","phone plus sign, token, PDF bytes and caption survive form encoding");
 check(wire.form.filename.endsWith("-GST.pdf")&&!wire.form.filename.includes(":"),"attachment filename is readable, timestamped and safe");
 check(wire.form.caption.length<1024&&wire.form.caption.includes("2 screens")&&!Object.hasOwn(wire.form,"body"),"document caption contains a short screen-count summary without a separate chat send");
 const recoveryWireMessage={...message,kind:"recovery",rows:message.rows.map(row=>({...row,resolvedAt:at(20).toISOString()}))};await lib.sendWhatsAppMessage(recoveryWireMessage);
 check(requests.at(-1).url==="/instance8591/messages/chat"&&requests.at(-1).form.body.includes("Previews recovered")&&!Object.hasOwn(requests.at(-1).form,"document"),"recovery updates remain concise text messages");
 await lib.sendWhatsAppMessage({...message,kind:"test",rows:[]});check(requests.at(-1).url==="/instance8591/messages/document"&&requests.at(-1).form.caption.includes("Sample PDF")&&Buffer.from(requests.at(-1).form.document,"base64").subarray(0,5).toString()==="%PDF-","test sends a sample PDF through the real document transport");
 const beforePdfFailure=requests.length;await assert.rejects(()=>lib.sendWhatsAppMessage({...message,rows:[]}),error=>error.code==="pdf"&&!error.uncertain);
 check(requests.length===beforePdfFailure,"PDF generation errors fail before any provider request or text fallback");
 mode="boolean";check((await lib.sendWhatsAppMessage(message)).providerId==="12345","transport also accepts boolean success response");
 for(const [failureMode,code,uncertain] of [["disconnect","uncertain",true],["http500","uncertain",true],["http401","rejected",false],["invalid","uncertain",true],["large","uncertain",true],["reject","rejected",false]]){mode=failureMode;await assert.rejects(()=>lib.sendWhatsAppMessage(message),error=>error.code===code&&error.uncertain===uncertain&&!error.message.includes("fake-whatsapp-test-token"));check(true,"provider "+failureMode+" is safely classified without leaking credentials");}mode="accept";
 const closedProbe=net.createServer();await new Promise(resolve=>closedProbe.listen(0,"127.0.0.1",resolve));const closedPort=closedProbe.address().port;await new Promise(resolve=>closedProbe.close(resolve));const savedOrigin=process.env.ULTRAMSG_TEST_ORIGIN;process.env.ULTRAMSG_TEST_ORIGIN="http://127.0.0.1:"+closedPort;
 await assert.rejects(()=>lib.sendWhatsAppMessage(message),error=>error.code==="connection"&&!error.uncertain);check(true,"refused connections are definite failures eligible for automatic retry");process.env.ULTRAMSG_TEST_ORIGIN=savedOrigin;
 const portProbe=net.createServer();await new Promise(resolve=>portProbe.listen(0,"127.0.0.1",resolve));const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
 const origin="http://127.0.0.1:"+port,password=crypto.randomBytes(24).toString("base64url"),bootstrap=crypto.randomBytes(32).toString("hex");
 await reset();await settings({enabled:false,recipients:[one,two]});
 const serverEnv={...process.env,PORT:String(port),HOSTNAME:"127.0.0.1",AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:"",ALLOW_LAN_HTTP:"false",AUTH_SECRET:crypto.randomBytes(48).toString("hex"),AUTH_ADMIN_EMAIL:"admin@example.test",AUTH_BOOTSTRAP_HASH:crypto.createHash("sha256").update(bootstrap).digest("hex"),AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000),EMAIL_ALERT_WORKER_DISABLED:"true",WHATSAPP_ALERT_WORKER_DISABLED:"true",PREVIEW_HEALTH_DISABLED:"true"};
 server=spawn(process.execPath,[path.join(root,".next/standalone/server.js")],{cwd:root,env:serverEnv,stdio:["ignore","pipe","pipe"]});server.stdout.on("data",chunk=>logs+=chunk);server.stderr.on("data",chunk=>logs+=chunk);
 let ready=false;for(let attempt=0;attempt<60;attempt++){try{if((await fetch(origin+"/api/health")).status===200){ready=true;break;}}catch{}if(server.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready,"compiled test server starts: "+logs.slice(-1000));
 const request=(route,body,cookie="",extra={})=>fetch(origin+route,{method:body===undefined?"GET":"POST",headers:{Origin:origin,"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 for(const [route,body] of [["/api/whatsapp-alerts",undefined],["/api/whatsapp-alerts",valid],["/api/whatsapp-alerts/test",{}],["/api/whatsapp-alerts/manual",undefined],["/api/whatsapp-alerts/manual",{confirmationToken:"0".repeat(64)}]])check((await request(route,body)).status===401,"anonymous access blocked: "+route+(body?" POST":" GET"));
 assert.equal((await request("/api/activate",{token:bootstrap,password})).status,200);const login=await request("/api/auth/sign-in/email",{email:"admin@example.test",password});const cookie=login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
 assert.equal((await request("/api/users",{action:"create",name:"Controller",email:"controller@example.test",role:"controller",password},cookie)).status,200);const ctl=await request("/api/auth/sign-in/email",{email:"controller@example.test",password});const ctlCookie=ctl.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
 for(const [route,body] of [["/api/whatsapp-alerts",undefined],["/api/whatsapp-alerts",valid],["/api/whatsapp-alerts/test",{}],["/api/whatsapp-alerts/manual",undefined],["/api/whatsapp-alerts/manual",{confirmationToken:"0".repeat(64)}]])check((await request(route,body,ctlCookie)).status===403,"Controller access blocked: "+route+(body?" POST":" GET"));
 const snapshotResponse=await request("/api/whatsapp-alerts",undefined,cookie),snapshot=await snapshotResponse.json();check(snapshotResponse.status===200&&snapshotResponse.headers.get("cache-control")==="no-store"&&!JSON.stringify(snapshot).includes("fake-whatsapp-test-token"),"Admin API snapshot is uncached and excludes token");
 for(const [route,body] of [["/api/whatsapp-alerts",snapshot.settings],["/api/whatsapp-alerts/test",{}],["/api/whatsapp-alerts/manual",{confirmationToken:"0".repeat(64)}]])check((await request(route,body,cookie,{Origin:"https://attacker.test"})).status===403,"cross-origin write rejected: "+route);
 check((await request("/api/whatsapp-alerts",{...snapshot.settings,recipients:["123@g.us"]},cookie)).status===400,"API rejects group identifiers");
 check((await request("/api/whatsapp-alerts",{...snapshot.settings,thresholdMinutes:0},cookie)).status===400,"API validates timing bounds");
 check((await request("/api/whatsapp-alerts",snapshot.settings,cookie)).status===200,"Admin can save individual recipients with automatic alerts disabled");
 check((await request("/api/whatsapp-alerts",snapshot.settings,cookie)).status===409,"API rejects stale settings revision");
 check((await request("/api/whatsapp-alerts/test",{recipient:three},cookie)).status===400,"test request cannot override saved numbers");
 check((await request("/api/whatsapp-alerts/manual",{confirmationToken:"invalid"},cookie)).status===400,"manual request requires the reviewed confirmation token");
 for(const [body,status,label,type] of [["{",400,"malformed JSON","application/json"],["[]",400,"JSON arrays","application/json"],["null",400,"null JSON","application/json"],["{}",415,"non-JSON content types","text/plain"],["X".repeat(65537),413,"oversized JSON bodies","application/json"]]){
  const response=await fetch(origin+"/api/whatsapp-alerts",{method:"POST",headers:{Origin:origin,Cookie:cookie,"Content-Type":type},body});check(response.status===status,"API rejects "+label);
 }
 const before=requests.length;check((await request("/api/whatsapp-alerts/test",{},cookie)).status===202&&requests.length===before,"API queues tests durably without contacting the provider during the request");
 await lib.processWhatsAppAlerts();check(requests.length===before+2,"worker sends queued API tests through the local HTTP provider fixture");
 check((await request("/api/whatsapp-alerts/test",{},cookie)).status===429,"API test cooldown persists across requests");
 await lib.recordPreviewResult({screenId:"manual",token:token("manual"),checkedAt:Date.now()-30000,received:false});const manualRes=await request("/api/whatsapp-alerts/manual",undefined,cookie),apiPreview=await manualRes.json();
 check(manualRes.headers.get("cache-control")==="no-store"&&apiPreview.screenCount===1&&apiPreview.recipientCount===2&&!JSON.stringify(apiPreview).includes("whatsapp-test-"),"API confirmation contains counts without source tokens");
 check((await request("/api/whatsapp-alerts/manual",{confirmationToken:apiPreview.confirmationToken,recipient:three},cookie)).status===400,"manual request cannot override saved recipients");
 check((await request("/api/whatsapp-alerts/manual",{confirmationToken:apiPreview.confirmationToken},cookie)).status===202,"Admin manual API queues a current report");await lib.processWhatsAppAlerts();
 check((await pool.query("SELECT id FROM whatsapp_alert_delivery WHERE kind='manual' AND status='accepted'")).rowCount===2,"manual delivery outcomes are recorded separately for both numbers");
 check((await request("/api/whatsapp-alerts/manual",{confirmationToken:apiPreview.confirmationToken},cookie)).status===429,"API manual cooldown persists across requests");
 for(const table of ["whatsapp_alert_settings","whatsapp_alert_queue","whatsapp_alert_delivery"]){await pool.query(`ALTER TABLE ${table} RENAME TO ${table}_health_test`);try{check((await request("/api/health")).status===503,"health detects missing "+table);}finally{await pool.query(`ALTER TABLE ${table}_health_test RENAME TO ${table}`);}}
 await pool.query("UPDATE server_migrations SET name='whatsapp_health_fixture' WHERE name='0008_whatsapp_alerts.sql'");try{check((await request("/api/health")).status===503,"health detects missing WhatsApp migration");}finally{await pool.query("UPDATE server_migrations SET name='0008_whatsapp_alerts.sql' WHERE name='whatsapp_health_fixture'");}
 check((await request("/api/health")).status===200,"health returns healthy after schema restoration");
 check((await request("/admin/settings",undefined,cookie)).status===200,"Settings page renders the integrated WhatsApp panel");
 // Restart the compiled application with its own worker enabled and verify packaged PDF delivery.
 await pool.query("UPDATE whatsapp_alert_delivery SET queued_at=now()-interval '2 minutes' WHERE kind='test'");
 server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));
 server=spawn(process.execPath,[path.join(root,".next/standalone/server.js")],{cwd:root,env:{...serverEnv,WHATSAPP_ALERT_WORKER_DISABLED:"false"},stdio:["ignore","pipe","pipe"]});server.stdout.on("data",chunk=>logs+=chunk);server.stderr.on("data",chunk=>logs+=chunk);
 let workerReady=false;for(let attempt=0;attempt<60;attempt++){try{if((await fetch(origin+"/api/health")).status===200){workerReady=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert.ok(workerReady,"compiled background-worker fixture starts");
 const packagedBefore=requests.length;check((await request("/api/whatsapp-alerts/test",{},cookie)).status===202,"compiled server queues the PDF smoke test");
 const deliveryDeadline=Date.now()+20000;while(Date.now()<deliveryDeadline&&requests.length<packagedBefore+2)await new Promise(resolve=>setTimeout(resolve,250));
 check(requests.length===packagedBefore+2&&requests.slice(packagedBefore).every(item=>item.url.endsWith("/messages/document")&&Buffer.from(item.form.document,"base64").subarray(0,5).toString()==="%PDF-"),"compiled background worker sends valid PDFs using packaged font/logo assets");
 if(process.env.TEST_WHATSAPP_UI==="true"){
  const fixture=path.join(root,".server-runtime/whatsapp-ui.json"),resume=path.join(root,".server-runtime/whatsapp-ui-resume");await fs.unlink(resume).catch(()=>{});await fs.writeFile(fixture,JSON.stringify({origin,email:"admin@example.test",password,databaseName}));console.log("WhatsApp UI fixture ready");
  try{const deadline=Date.now()+600000;while(Date.now()<deadline){if(await fs.stat(resume).then(()=>true).catch(()=>false))break;await new Promise(resolve=>setTimeout(resolve,500));}check(await fs.stat(resume).then(()=>true).catch(()=>false),"browser verification completed before timeout");}finally{await fs.unlink(fixture).catch(()=>{});await fs.unlink(resume).catch(()=>{});}
 }
 console.log(`${checks} WhatsApp alert checks passed on isolated PostgreSQL and local HTTP provider.`);
}finally{
 if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once("exit",resolve));}
 if(provider){provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));}
 if(lib)await lib.getPool().end();await pool.end();await adminPool.query('DROP DATABASE IF EXISTS "'+databaseName+'" WITH (FORCE)');await adminPool.end();await fs.unlink(output).catch(()=>{});
}
