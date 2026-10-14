import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";

const root=process.cwd(),databaseName="sephora_email_test_"+crypto.randomBytes(8).toString("hex");
const adminUrl=new URL(process.env.DATABASE_URL);adminUrl.pathname="/postgres";
const testUrl=new URL(process.env.DATABASE_URL);testUrl.pathname="/"+databaseName;
const adminPool=new pg.Pool({connectionString:adminUrl.toString()}),pool=new pg.Pool({connectionString:testUrl.toString()});
await adminPool.query('CREATE DATABASE "'+databaseName+'"');
await migrate(pool);await migrate(pool);
process.env.DATABASE_URL=testUrl.toString();process.env.ALERT_EMAIL_USER="alerts@example.test";process.env.ALERT_EMAIL_APP_PASSWORD="fake-test-secret";
const output=new URL("../.server-runtime/email-alert-test.cjs",import.meta.url);
await fs.mkdir(new URL("../.server-runtime/",import.meta.url),{recursive:true});
await build({stdin:{contents:'export * from "./lib/email-alert-server"; export * from "./lib/email-alert-shared"; export * from "./lib/alert-mail"; export * from "./lib/preview-incidents"; export {getPool} from "./lib/database";',resolveDir:root,loader:"ts"},outfile:fileURLToPath(output),platform:"node",format:"cjs",bundle:true,external:["pg","nodemailer"]});
const lib=createRequire(import.meta.url)(fileURLToPath(output));
let checks=0,server,logs="";
const check=(value,message)=>{assert.ok(value,message);checks++;console.log("PASS "+message);};
const base=Date.now(),at=minutes=>new Date(base+minutes*60000);
const sent=[];const send=async mail=>{sent.push(mail);return {partial:false};};
const smtpMessages=[],connections=new Set();let smtpMode="accept";
const smtp=net.createServer(socket=>{
  connections.add(socket);socket.on("close",()=>connections.delete(socket));socket.on("error",()=>{});
  let buffer="",data=false,message=[],recipients=[];
  socket.write("220 localhost test SMTP\r\n");
  socket.on("data",chunk=>{
    buffer+=chunk.toString();let split;
    while((split=buffer.indexOf("\r\n"))>=0){
      const line=buffer.slice(0,split);buffer=buffer.slice(split+2);
      if(data){
        if(line!=="."){message.push(line);continue;}
        data=false;smtpMessages.push({data:message.join("\r\n"),recipients:[...recipients]});message=[];
        if(smtpMode==="uncertain"){socket.destroy();return;}
        socket.write(smtpMode==="reject"?"450 temporarily rejected\r\n":"250 accepted\r\n");continue;
      }
      if(/^EHLO/i.test(line))socket.write("250-localhost\r\n250 8BITMIME\r\n");
      else if(/^MAIL FROM:/i.test(line)){recipients=[];socket.write("250 sender accepted\r\n");}
      else if(/^RCPT TO:/i.test(line)){recipients.push(line);socket.write("250 recipient accepted\r\n");}
      else if(/^DATA/i.test(line)){data=true;socket.write("354 send data\r\n");}
      else if(/^QUIT/i.test(line))socket.end("221 bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
await new Promise(resolve=>smtp.listen(0,"127.0.0.1",resolve));
process.env.ALERT_SMTP_TEST_HOST="127.0.0.1";process.env.ALERT_SMTP_TEST_PORT=String(smtp.address().port);
async function entity(id,type,parentId=null,url=null){await pool.query("INSERT INTO entities (id,type,name,parent_id,live_url,is_demo,created_at) VALUES ($1,$2,$3,$4,$5,0,$6)",[id,type,id==="a"?"Screen <script>":id,parentId,url,at(0).toISOString()]);}
const token=id=>"email-test-"+id;
async function screen(id){await entity(id,"screen","mall","https://app.onsign.tv/embed/"+token(id));}
async function observe(id,minutes,received=false){await lib.recordPreviewResult({screenId:id,token:token(id),checkedAt:at(minutes).getTime(),received});}
async function refresh(ids,minutes){for(const id of ids)await observe(id,minutes);}
async function settings(change){await pool.query("UPDATE email_alert_settings SET enabled=$1,threshold_minutes=$2,grouping_minutes=$3,recovery_email=$4,recipients=$5,updated_at=$6,revision=$7 WHERE id='main'",[change.enabled??true,change.thresholdMinutes??20,change.groupingMinutes??5,change.recoveryEmail??true,JSON.stringify(change.recipients??["one@example.test","two@example.test"]),at(-1),crypto.randomUUID()]);}
try {
  const defaults=await lib.emailAlertSnapshot();
  check(!defaults.settings.enabled&&defaults.settings.thresholdMinutes===20&&defaults.settings.groupingMinutes===5,"alerts default disabled with 20-minute qualification and 5-minute grouping");
  check(!JSON.stringify(defaults).includes("fake-test-secret"),"sender password is never returned by the settings snapshot");
  const valid={...defaults.settings,enabled:true,recipients:["one@example.test"]};
  check(lib.parseEmailAlertSettings(valid).recipients[0]==="one@example.test","valid saved recipients and settings are accepted");
  for(const patch of [{thresholdMinutes:0},{thresholdMinutes:1441},{groupingMinutes:0},{groupingMinutes:61},{enabled:"true"},{recipients:[]},{recipients:["invalid"]},{recipients:["one@example.test","ONE@example.test"]},{recipients:["victim@example.test\r\nBcc:other@example.test"]},{recipients:Array(21).fill("one@example.test")}]){
    assert.throws(()=>lib.parseEmailAlertSettings({...valid,...patch}));checks++;
  }
  await entity("country","country");await entity("region","region","country");await entity("mall","store","region");
  for(const id of ["a","b","c","early"])await screen(id);
  await entity("missing","screen","mall");await entity("unsupported","screen","mall","https://example.test/preview");
  await observe("a",0);await observe("b",0);await observe("early",0);await observe("c",3);
  await settings({});
  await refresh(["a","b","early"],19);await lib.processEmailAlerts({now:at(19),send});
  check((await pool.query("SELECT COUNT(*)::int AS count FROM email_alert_queue")).rows[0].count===0,"no notification qualifies before the selected outage threshold");
  await refresh(["a","b","early"],20);await lib.processEmailAlerts({now:at(20),send});
  check(sent.length===0&&(await pool.query("SELECT COUNT(*)::int AS count FROM email_alert_queue")).rows[0].count===3,"qualified issues are queued without sending before the grouping window");
  await refresh(["a","b","c"],23);await lib.processEmailAlerts({now:at(23),send});
  await observe("early",24,true);await refresh(["a","b","c"],24.99);await lib.processEmailAlerts({now:at(24.99),send});
  check(sent.length===0,"grouping does not send early");
  await refresh(["a","b","c"],25);await lib.processEmailAlerts({now:at(25),send});
  check(sent.length===1&&sent[0].rows.length===3,"one email combines issues qualifying at different times within the window");
  check(!sent[0].rows.some(row=>row.screenName==="early"),"a preview recovered before send is excluded");
  check(!JSON.stringify(sent[0]).includes("liveUrl")&&!JSON.stringify(sent[0]).includes("email-test-"),"email payloads do not contain preview links or tokens");
  await refresh(["a","b","c"],26);await lib.processEmailAlerts({now:at(26),send});
  check(sent.length===1,"subsequent checks do not repeat the same outage alert");
  await observe("a",27,true);await refresh(["b","c"],27);await lib.processEmailAlerts({now:at(27),send});
  await pool.query("UPDATE email_alert_settings SET updated_at=$1,recipients=$2 WHERE id='main'",[at(28),JSON.stringify(["edited@example.test"])]);
  await observe("a",32,true);await refresh(["b","c"],32);await lib.processEmailAlerts({now:at(32),send});
  check(sent.length===2&&sent[1].kind==="recovery"&&sent[1].rows.length===1,"recovery emails are grouped only for previously notified incidents");
  check(sent[1].recipients[0]==="edited@example.test","settings edits preserve a queued recovery and use the latest recipients");
  await observe("a",33);await observe("a",53);await lib.processEmailAlerts({now:at(53),send});
  await observe("a",58);await lib.processEmailAlerts({now:at(58),send});
  check(sent.length===3,"a separate later outage can send a new alert");
  const content=lib.alertMailContent(sent[0]);
  check(content.html.includes("&lt;script&gt;")&&!content.html.includes("Screen <script>"),"screen and location text is escaped in HTML email");
  check(content.text.includes("GST")&&content.text.includes("Preview unavailable")&&content.subject.includes("3 screens"),"email includes grouped screen counts and GST timestamps");
  const templateRows=[
    {screenName:"Short outage",locationName:"Dalma Mall",regionName:"Abu Dhabi",countryName:"United Arab Emirates",startedAt:at(10).toISOString(),lastCheckedAt:at(25).toISOString(),resolvedAt:null},
    {screenName:"Long outage with a very long screen name & <special> characters",locationName:"Mall of the Emirates with a long location name",regionName:"Dubai",countryName:"United Arab Emirates",startedAt:at(0).toISOString(),lastCheckedAt:at(25).toISOString(),resolvedAt:null},
  ];
  const sample={...sent[0],rows:templateRows,generatedAt:at(25)};
  const outageTemplate=lib.alertMailContent(sample);
  check(outageTemplate.html.indexOf("Long outage")<outageTemplate.html.indexOf("Short outage")&&outageTemplate.text.indexOf("Long outage")<outageTemplate.text.indexOf("Short outage"),"HTML and plain text list longest outages first");
  check(outageTemplate.html.includes("Screen / location")&&!outageTemplate.html.includes('<th scope="col" style="padding:12px;text-align:left;background:#edf4f0;width:40%">Location</th>'),"email combines screen and location in a narrower three-column table");
  check((outageTemplate.html.match(/All times GST/g)||[]).length===1&&outageTemplate.html.includes("UTC+4"),"email states the timezone once");
  check(lib.alertMailContent({...sample,rows:[templateRows[0]]}).text.startsWith("Preview unavailable · 1 screen\n"),"single-screen headings use singular wording");
  const recoveryTemplate=lib.alertMailContent({...sample,kind:"recovery",rows:templateRows.map(row=>({...row,resolvedAt:at(20).toISOString()}))});
  check(recoveryTemplate.html.includes("Outage duration")&&recoveryTemplate.html.includes("<strong>Recovered</strong>")&&recoveryTemplate.html.includes("#208766"),"recovery template includes green status and recovery timestamps");
  check(!lib.alertMailContent(sample,false).html.includes("cid:"),"missing logo falls back to readable text branding");
  const logoData="data:image/png;base64,"+(await fs.readFile(path.join(root,"public/images/pixcom-report-logo.png"))).toString("base64");
  for(const [name,template] of [["outage",outageTemplate],["recovery",recoveryTemplate],["test",lib.alertMailContent({...sample,kind:"test",rows:[]})]])await fs.writeFile(path.join(root,".server-runtime","email-template-"+name+".html"),template.html.replace("cid:pixcom-alert-logo",logoData));
  await lib.sendAlertMail(sent[0]);
  check(smtpMessages.length===1&&smtpMessages[0].recipients.length===2,"actual SMTP delivery targets all saved recipients in one message");
  check(!smtpMessages[0].data.includes("two@example.test")&&!/\r\nBcc:/i.test(smtpMessages[0].data),"recipient addresses remain private in delivered message headers");
  check(smtpMessages[0].data.includes("Content-ID: <pixcom-alert-logo>")&&smtpMessages[0].data.includes("Content-Type: image/png"),"SMTP includes the brand logo as an inline attachment");
  smtpMode="reject";await assert.rejects(lib.sendAlertMail(sent[0]),error=>error.code==="rejected"&&!error.uncertain);checks++;
  smtpMode="uncertain";await assert.rejects(lib.sendAlertMail(sent[0]),error=>error.uncertain);checks++;smtpMode="accept";
  // Separate fresh incident for bounded retry and ambiguous-delivery behavior.
  await screen("retry");await observe("retry",60);await observe("retry",80);await lib.processEmailAlerts({now:at(80),send});
  await observe("retry",85);let failures=0;
  await lib.processEmailAlerts({now:at(85),send:async()=>{failures++;throw new lib.AlertMailError("connection");}});
  await observe("retry",85.5);await lib.processEmailAlerts({now:at(85.5),send});
  check(failures===1&&sent.length===3,"failed delivery is deferred until its retry time");
  await observe("retry",86);await lib.processEmailAlerts({now:at(86),send});
  check(sent.length===4,"a definite delivery failure retries without losing the incident");
  await screen("uncertain");await observe("uncertain",90);await observe("uncertain",110);await lib.processEmailAlerts({now:at(110),send});
  await observe("uncertain",115);await lib.processEmailAlerts({now:at(115),send:async()=>{throw new lib.AlertMailError("uncertain",true);}});
  await observe("uncertain",116);await lib.processEmailAlerts({now:at(116),send});
  check(sent.length===4&&(await pool.query("SELECT count(*)::int AS count FROM email_alert_queue WHERE status='uncertain'")).rows[0].count===1,"ambiguous sends are not automatically repeated");
  await screen("changed");await observe("changed",120);await observe("changed",140);await lib.processEmailAlerts({now:at(140),send});
  await pool.query("UPDATE entities SET live_url='https://app.onsign.tv/embed/replaced' WHERE id='changed'");
  await lib.processEmailAlerts({now:at(145),send});
  check(sent.length===4,"changed preview links cannot send an obsolete incident alert");
  await screen("stale");await observe("stale",150);await lib.processEmailAlerts({now:at(180),send});
  check(!(await pool.query("SELECT q.id FROM email_alert_queue q JOIN preview_incident i ON i.id=q.incident_id WHERE i.screen_id='stale'")).rowCount,"stale observations do not create an alert");
  await screen("concurrent");await observe("concurrent",190);await observe("concurrent",210);await lib.processEmailAlerts({now:at(210),send});
  await observe("concurrent",215);await Promise.all([lib.processEmailAlerts({now:at(215),send}),lib.processEmailAlerts({now:at(215),send})]);
  check(sent.length===5,"concurrent workers cannot send the same queued outage twice");
  await settings({enabled:false});
  await screen("disabled");await observe("disabled",220);await observe("disabled",240);await lib.processEmailAlerts({now:at(240),send});
  check(sent.length===5,"disabled settings stop background alerts");
  const before=await lib.emailAlertSnapshot();
  await lib.saveEmailAlertSettings({...before.settings,recipients:["new@example.test"]},"Test Admin");
  await assert.rejects(lib.saveEmailAlertSettings(before.settings,"Test Admin"),error=>error.status===409);checks++;
  check((await lib.emailAlertSnapshot()).settings.recipients[0]==="new@example.test","Admins can edit the saved recipient list with concurrent-edit protection");
  await settings({recipients:["old@example.test"]});
  await screen("recipient-edit");await observe("recipient-edit",250);await observe("recipient-edit",270);await lib.processEmailAlerts({now:at(270),send});
  await settings({recipients:["latest@example.test"]});await observe("recipient-edit",275);await lib.processEmailAlerts({now:at(275),send});
  check(sent.at(-1).recipients[0]==="latest@example.test","recipient edits apply to a queued batch before delivery");
  await screen("restart");await observe("restart",280);await observe("restart",300);await lib.processEmailAlerts({now:at(300),send});
  const orphanId=crypto.randomUUID();
  await pool.query("INSERT INTO email_alert_delivery (id,kind,status,recipients,screen_count,started_at) VALUES ($1,'unavailable','sending','[]',1,$2)",[orphanId,at(305)]);
  await pool.query("UPDATE email_alert_queue q SET status='sending',delivery_id=$1 FROM preview_incident i WHERE q.incident_id=i.id AND i.screen_id='restart'",[orphanId]);
  const countBeforeRestart=sent.length;await observe("restart",305);await lib.processEmailAlerts({now:at(305),send});
  check(sent.length===countBeforeRestart&&(await pool.query("SELECT status FROM email_alert_delivery WHERE id=$1",[orphanId])).rows[0].status==="uncertain","a sender restart records an interrupted send without repeating it");
  const fakePassword=process.env.ALERT_EMAIL_APP_PASSWORD;delete process.env.ALERT_EMAIL_APP_PASSWORD;
  check(!lib.alertSender().configured,"missing Gmail credentials are reported as unconfigured");
  const missingConfig=await lib.emailAlertSnapshot();
  await assert.rejects(lib.saveEmailAlertSettings(missingConfig.settings,"Test Admin"),error=>error.status===400);checks++;
  await assert.rejects(lib.sendTestAlert(),error=>error.status===400);checks++;
  process.env.ALERT_EMAIL_APP_PASSWORD=fakePassword;
  await settings({enabled:false});

  // Exercise real API permissions and test-mail endpoint against the compiled application.
  const portProbe=net.createServer();await new Promise(resolve=>portProbe.listen(0,"127.0.0.1",resolve));const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
  const origin="http://127.0.0.1:"+port,password=crypto.randomBytes(24).toString("base64url"),bootstrap=crypto.randomBytes(32).toString("hex");
  const serverEnv={...process.env,PORT:String(port),HOSTNAME:"127.0.0.1",DATABASE_URL:testUrl.toString(),AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:"",ALLOW_LAN_HTTP:"false",AUTH_SECRET:crypto.randomBytes(48).toString("hex"),AUTH_ADMIN_EMAIL:"admin@example.test",AUTH_BOOTSTRAP_HASH:crypto.createHash("sha256").update(bootstrap).digest("hex"),AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000),EMAIL_ALERT_WORKER_DISABLED:"true"};
  server=spawn(process.execPath,[path.join(root,".next/standalone/server.js")],{cwd:root,env:serverEnv,stdio:["ignore","pipe","pipe"]});server.stdout.on("data",chunk=>logs+=chunk);server.stderr.on("data",chunk=>logs+=chunk);
  let ready=false;for(let attempt=0;attempt<60;attempt++){try{if((await fetch(origin+"/api/health")).status===200){ready=true;break;}}catch{}if(server.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,500));}
  assert.ok(ready,"compiled test server starts: "+logs.slice(-1000));
  const request=(route,body,cookie="",extra={})=>fetch(origin+route,{method:body===undefined?"GET":"POST",headers:{Origin:origin,"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
  check((await request("/api/email-alerts")).status===401,"anonymous settings reads are blocked");
  check((await request("/api/email-alerts/test",{})).status===401,"anonymous test sends are blocked");
  assert.equal((await request("/api/activate",{token:bootstrap,password})).status,200);
  const login=await request("/api/auth/sign-in/email",{email:"admin@example.test",password});const cookie=login.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  check((await request("/api/users",{action:"create",name:"Controller",email:"controller@example.test",role:"controller",password},cookie)).status===200,"Controller fixture is created");
  const controllerLogin=await request("/api/auth/sign-in/email",{email:"controller@example.test",password});const controllerCookie=controllerLogin.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  check((await request("/api/email-alerts",undefined,controllerCookie)).status===403&&(await request("/api/email-alerts/test",{},controllerCookie)).status===403,"Controller cannot read recipients or send test emails");
  const snapshotResponse=await request("/api/email-alerts",undefined,cookie);const snapshot=await snapshotResponse.json();
  check(snapshotResponse.status===200&&snapshotResponse.headers.get("cache-control")==="no-store"&&!JSON.stringify(snapshot).includes("fake-test-secret"),"Admin snapshot is uncached and excludes mail credentials");
  check((await request("/api/email-alerts",snapshot.settings,cookie,{Origin:"https://attacker.test"})).status===403,"cross-origin settings writes are rejected");
  check((await request("/api/email-alerts/test",{},cookie,{Origin:"https://attacker.test"})).status===403,"cross-origin email sends are rejected");
  check((await request("/api/email-alerts",{...snapshot.settings,thresholdMinutes:0},cookie)).status===400,"API validates alert duration bounds");
  const saved=await request("/api/email-alerts",{...snapshot.settings,enabled:false,recipients:["one@example.test","two@example.test"]},cookie);check(saved.status===200,"Admin can save multiple recipients while alerts are disabled");
  check((await request("/api/email-alerts",snapshot.settings,cookie)).status===409,"API rejects a stale settings revision");
  check((await request("/api/email-alerts/test",{recipient:"outside@example.test"},cookie)).status===400,"test sends cannot override the saved recipients");
  const smtpBefore=smtpMessages.length;
  check((await request("/api/email-alerts/test",{},cookie)).status===200&&smtpMessages.length===smtpBefore+1,"test endpoint sends one real message to the local SMTP fixture");
  check((await request("/api/email-alerts/test",{},cookie)).status===429,"test sends are rate limited across requests");
  check((await request("/admin/settings",undefined,cookie)).status===200,"Admin Settings page includes the alert panel route");
  for(const table of ["email_alert_settings","email_alert_queue","email_alert_delivery"]){
    await pool.query(`ALTER TABLE ${table} RENAME TO ${table}_health_test`);
    try{check((await request("/api/health")).status===503,"health detects missing "+table);}
    finally{await pool.query(`ALTER TABLE ${table}_health_test RENAME TO ${table}`);}
  }
  check((await request("/api/health")).status===200,"health recovers after alert tables are restored");
  if(process.env.TEST_EMAIL_ALERT_UI==="true"){
    const fixture=path.join(root,".server-runtime","email-alert-ui.json"),resume=path.join(root,".server-runtime","email-alert-ui-resume");
    await fs.unlink(resume).catch(()=>{});
    await fs.writeFile(fixture,JSON.stringify({origin,email:"admin@example.test",password}));
    console.log("Email alert UI fixture ready");
    try {
      const deadline=Date.now()+600000;
      while(Date.now()<deadline){if(await fs.stat(resume).then(()=>true).catch(()=>false))break;await new Promise(resolve=>setTimeout(resolve,500));}
      check(await fs.stat(resume).then(()=>true).catch(()=>false),"browser verification completed before the fixture timeout");
    }finally{await fs.unlink(fixture).catch(()=>{});await fs.unlink(resume).catch(()=>{});}
  }
  console.log(`${checks} email alert checks passed on isolated PostgreSQL and local SMTP.`);
} finally {
  if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once("exit",resolve));}
  for(const socket of connections)socket.destroy();await new Promise(resolve=>smtp.close(resolve));
  await lib.getPool().end();await pool.end();await adminPool.query('DROP DATABASE "'+databaseName+'" WITH (FORCE)');await adminPool.end();await fs.unlink(output).catch(()=>{});
}
