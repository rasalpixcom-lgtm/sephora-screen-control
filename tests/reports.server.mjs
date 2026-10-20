import assert from "node:assert/strict";
import { mock } from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";

const root=process.cwd(), databaseName="sephora_reports_test_"+crypto.randomBytes(8).toString("hex");
const adminUrl=new URL(process.env.DATABASE_URL); adminUrl.pathname="/postgres";
const adminPool=new pg.Pool({connectionString:adminUrl.toString()});
await adminPool.query('CREATE DATABASE "'+databaseName+'"');
const testUrl=new URL(process.env.DATABASE_URL); testUrl.pathname="/"+databaseName;
const pool=new pg.Pool({connectionString:testUrl.toString()});
await migrate(pool); await migrate(pool);
process.env.DATABASE_URL=testUrl.toString(); process.env.DATABASE_SSL="false";
const bundlePath=new URL("../.server-runtime/reports-test.cjs",import.meta.url);
await fsPromises.mkdir(new URL("../.server-runtime/",import.meta.url),{recursive:true});
await build({stdin:{contents:'export * from "./lib/preview-incidents"; export * from "./lib/preview-report"; export { getPool } from "./lib/database";',resolveDir:root,loader:"ts"},outfile:fileURLToPath(bundlePath),platform:"node",format:"cjs",bundle:true,external:["pg"]});
const reportLib=createRequire(import.meta.url)(fileURLToPath(bundlePath));
let checks=0; const check=(condition,name)=>{assert.ok(condition,name);checks++;console.log("PASS "+name);};
const now=Date.now();
const ids={country:"country",region:"region",location:"location",persist:"persist",old:"old",young:"young",older:"older"};
const tokenFor=id=>"report-token-"+id;
const liveUrl=id=>"https://app.onsign.tv/embed/"+tokenFor(id);
async function addEntity(id,type,name,parentId=null,url=null){await pool.query("INSERT INTO entities (id,type,name,parent_id,live_url,is_demo,created_at) VALUES ($1,$2,$3,$4,$5,0,$6)",[id,type,name,parentId,url,new Date(now).toISOString()]);}
let server,logs="";
try {
  check((await pool.query("SELECT COUNT(*)::integer AS count FROM server_migrations")).rows[0].count===11,"migration is idempotent and records all schemas including OnSign player links and screen photos");
  const shortNameMigration = fs.readFileSync("db/postgres-migrations/0005_country_short_names.sql","utf8").replace(/\r\n/g,"\n");
  const migrationHash = content => crypto.createHash("sha256").update(content).digest("hex");
  await pool.query("UPDATE server_migrations SET checksum=$1 WHERE name='0005_country_short_names.sql'",[migrationHash(shortNameMigration.replace(/\n/g,"\r\n"))]);
  await migrate(pool);
  check(true,"identical migrations remain compatible with recorded Windows line-ending checksums");
  await pool.query("UPDATE server_migrations SET checksum=$1 WHERE name='0005_country_short_names.sql'",["0".repeat(64)]);
  await assert.rejects(migrate(pool),/Applied migration changed/); check(true,"migration checks still reject genuinely changed SQL");
  await pool.query("UPDATE server_migrations SET checksum=$1 WHERE name='0005_country_short_names.sql'",[migrationHash(shortNameMigration)]);
  const parsed=reportLib.parsePreviewReportQuery(new URLSearchParams("threshold=120&page=2&q=mall"));
  check(parsed.threshold===120&&parsed.page===2&&parsed.q==="mall","report query accepts supported filters");
  for(const query of ["threshold=30","duration=30","duration=","page=0","page="+"9".repeat(400),"q="+"x".repeat(121)]) assert.throws(()=>reportLib.parsePreviewReportQuery(new URLSearchParams(query)));
  checks++; console.log("PASS report query rejects invalid values");
  await addEntity(ids.country,"country","United Arab Emirates"); await addEntity(ids.region,"region","Dubai",ids.country); await addEntity(ids.location,"store","Dubai Mall",ids.region);
  await addEntity(ids.persist,"screen","Persistence check",ids.location,liveUrl(ids.persist));
  await reportLib.recordPreviewResult({screenId:ids.persist,token:tokenFor(ids.persist),received:false,checkedAt:now-7200000});
  await reportLib.recordPreviewResult({screenId:ids.persist,token:tokenFor(ids.persist),received:false,checkedAt:now-7100000});
  let incidents=await pool.query("SELECT * FROM preview_incident WHERE screen_id=$1 ORDER BY started_at",[ids.persist]);
  check(incidents.rows.length===1&&incidents.rows[0].started_at.getTime()===now-7200000&&incidents.rows[0].last_checked_at.getTime()===now-7100000,"repeated failures preserve the original incident start");
  await reportLib.recordPreviewResult({screenId:ids.persist,token:tokenFor(ids.persist),received:true,checkedAt:now-7000000});
  incidents=await pool.query("SELECT * FROM preview_incident WHERE screen_id=$1",[ids.persist]);
  check(incidents.rows[0].resolution_reason==="recovered"&&incidents.rows[0].resolved_at,"a successful preview resolves the incident");
  await reportLib.recordPreviewResult({screenId:ids.persist,token:tokenFor(ids.persist),received:false,checkedAt:now-7100000});
  check((await pool.query("SELECT status FROM preview_screen_state WHERE screen_id=$1",[ids.persist])).rows[0].status==="available","a delayed old failure cannot overwrite a newer success");
  await pool.query("UPDATE entities SET live_url=$2 WHERE id=$1",[ids.persist,"https://app.onsign.tv/embed/replacement-token"]);
  await reportLib.recordPreviewResult({screenId:ids.persist,token:tokenFor(ids.persist),received:false,checkedAt:now-6100000});
  check((await pool.query("SELECT COUNT(*)::integer AS count FROM preview_incident WHERE screen_id=$1 AND resolved_at IS NULL",[ids.persist])).rows[0].count===0,"results from an obsolete preview link are ignored");
  await reportLib.recordPreviewResult({screenId:ids.persist,token:"replacement-token",received:false,checkedAt:now-6000000});
  await pool.query("UPDATE entities SET live_url=NULL WHERE id=$1",[ids.persist]);
  await reportLib.reconcilePreviewInventory(new Date(now-5900000));
  check((await pool.query("SELECT COUNT(*)::integer AS count FROM preview_incident WHERE screen_id=$1 AND resolved_at IS NULL",[ids.persist])).rows[0].count===0,"removing or changing a preview source closes its open incident");

  for(const [id,name] of [[ids.old,"Window S-3 - Left"],[ids.young,"Recent interruption"],[ids.older,"Animation table"]]) await addEntity(id,"screen",name,ids.location,liveUrl(id));
  for(const [id,age] of [[ids.old,21],[ids.young,19],[ids.older,130]]) {
    const fingerprint=reportLib.previewSourceFingerprint(tokenFor(id));
    await pool.query("INSERT INTO preview_screen_state (screen_id,source_fingerprint,status,last_success_at,last_checked_at,updated_at) VALUES ($1,$2,'unavailable',$3,$4,$4)",[id,fingerprint,new Date(now-(age+8)*60000),new Date(now-60000)]);
    await pool.query("INSERT INTO preview_incident (id,screen_id,source_fingerprint,started_at,last_checked_at,last_success_at) VALUES ($1,$2,$3,$4,$5,$6)",["incident-"+id,id,fingerprint,new Date(now-age*60000),new Date(now-60000),new Date(now-(age+8)*60000)]);
  }

  const probe=net.createServer(); await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve)); const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
  const origin="http://127.0.0.1:"+port, alias="http://localhost:"+port, bootstrap=crypto.randomBytes(32).toString("hex"), password=process.env.REPORT_BROWSER_CHECK==="true"?"Browser-report-test-2026!":crypto.randomBytes(24).toString("base64url");
  const serverEnv={...process.env,PORT:String(port),HOSTNAME:"127.0.0.1",DATABASE_URL:testUrl.toString(),AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:alias,AUTH_SECRET:crypto.randomBytes(48).toString("hex"),AUTH_ADMIN_EMAIL:"admin@example.test",AUTH_BOOTSTRAP_HASH:crypto.createHash("sha256").update(bootstrap).digest("hex"),AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000)};
  server=spawn(process.execPath,[path.join(root,".next/standalone/server.js")],{cwd:root,env:serverEnv,stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",data=>{logs+=data;}); server.stderr.on("data",data=>{logs+=data;});
  let ready=false; for(let attempt=0;attempt<60;attempt++){try{if((await fetch(origin+"/api/health")).status===200){ready=true;break;}}catch{} if(server.exitCode!==null)break; await new Promise(resolve=>setTimeout(resolve,500));}
  if(!ready)throw new Error("Test server failed to start: "+logs.slice(-2000));
  async function request(route,body,cookie=""){return fetch(origin+route,{method:body===undefined?"GET":"POST",headers:{Origin:origin,"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"manual"});}
  async function login(email){const response=await request("/api/auth/sign-in/email",{email,password});return {response,cookie:response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ")};}
  check((await request("/api/reports/preview?threshold=20")).status===401,"anonymous report access is blocked");
  check((await request("/api/activate",{token:bootstrap,password})).status===200,"test Admin activates");
  const admin=await login("admin@example.test"); check(admin.response.status===200,"Admin signs in");
  check((await request("/api/users",{action:"create",name:"Controller",email:"controller@example.test",role:"controller",password},admin.cookie)).status===200,"Controller fixture is created");
  const controller=await login("controller@example.test");
  check((await request("/api/reports/preview/pdf",undefined,controller.cookie)).status===403&&(await request("/api/reports/preview/pdf")).status===401,"PDF export enforces Admin access");
  check((await request("/api/reports/preview?threshold=20",undefined,controller.cookie)).status===403,"Controller cannot read Admin reports");
  const response=await request("/api/reports/preview?threshold=20",undefined,admin.cookie), report=await response.json();
  check(response.status===200&&response.headers.get("cache-control")==="no-store"&&report.total===2&&report.entries[0].screenId===ids.older,"20 minute report is uncached and sorted longest first");
  check((await (await request("/api/reports/preview?threshold=60",undefined,admin.cookie)).json()).total===1,"duration threshold is applied on the server");
  for(const threshold of [120,180,300,600]){
    const result=await (await request("/api/reports/preview?threshold="+threshold,undefined,admin.cookie)).json();
    check(result.total===(threshold===120?1:0),`${threshold} minute threshold returns the expected incidents`);
  }
  check((await (await request("/api/reports/preview?threshold=20&countryId=missing",undefined,admin.cookie)).json()).total===0,"location filters are applied on the server");
  for(const [duration,total] of [["all",2],["20",1],["60",0],["120",1],["180",0],["300",0],["600",0]]) {
    const result=await (await request("/api/reports/preview?duration="+duration,undefined,admin.cookie)).json();
    check(result.total===total,`duration ${duration} selects only its expected range`);
  }
  const rangePdf=await request("/api/reports/preview/pdf?duration=120",undefined,admin.cookie);
  const rangeBytes=Buffer.from(await rangePdf.arrayBuffer());
  check(rangePdf.status===200&&rangeBytes.subarray(0,5).toString()==="%PDF-","PDF accepts the same duration range as the report");
  fs.writeFileSync(path.join(root,".server-runtime","preview-report-range-sample.pdf"),rangeBytes);
  const boundaryIds=[];
  const ages=[19,20,59,60,119,120,179,180,299,300,599,600,601];
  for(const age of ages) {
    const id="boundary-"+age; boundaryIds.push(id);
    await addEntity(id,"screen",`Boundary ${age}`,ids.location,liveUrl(id));
    await pool.query("INSERT INTO preview_incident (id,screen_id,source_fingerprint,started_at,last_checked_at) VALUES ($1,$2,$3,$4,$5)",[
      "incident-"+id,id,reportLib.previewSourceFingerprint(tokenFor(id)),new Date(now-age*60000),new Date(now)]);
  }
  mock.timers.enable({apis:["Date"],now});
  try {
    for(const [duration,expected] of [["all",ages.filter(age=>age>=20)],["20",[20,59]],["60",[60,119]],["120",[120,179]],["180",[180,299]],["300",[300,599]],["600",[600,601]]]) {
      const result=await reportLib.fetchPreviewReport(reportLib.parsePreviewReportQuery(new URLSearchParams({duration,q:"Boundary"})),{all:true});
      const found=result.entries.map(row=>Number(row.screenName.split(" ")[1])).sort((a,b)=>a-b);
      check(JSON.stringify(found)===JSON.stringify(expected),`exact boundaries for ${duration} include the lower limit and exclude the upper limit`);
    }
  } finally {mock.timers.reset();await pool.query("DELETE FROM entities WHERE id=ANY($1::text[])",[boundaryIds]);}
  check((await (await request("/api/reports/preview?threshold=20&q="+encodeURIComponent("100%_!"),undefined,admin.cookie)).json()).total===0,"report search treats wildcard characters literally");
  check((await request("/api/reports/preview?threshold=30",undefined,admin.cookie)).status===400,"invalid report duration is rejected");
  check((await request("/admin/reports",undefined,admin.cookie)).status===200,"Admin Reports page loads");
  const emptyPdf=await request("/api/reports/preview/pdf?threshold=600",undefined,admin.cookie),emptyBytes=Buffer.from(await emptyPdf.arrayBuffer());
  check(emptyPdf.status===200&&(emptyBytes.toString("latin1").match(/\/Type\s*\/Page\b/g)||[]).length===1,"an empty report exports a single PDF page");
  for(let index=1;index<=35;index++){
    const id="pdf-"+index, token=tokenFor(id), fingerprint=reportLib.previewSourceFingerprint(token);
    await addEntity(id,"screen",`PDF layout screen ${String(index).padStart(2,"0")}`,ids.location,liveUrl(id));
    await pool.query("INSERT INTO preview_incident (id,screen_id,source_fingerprint,started_at,last_checked_at,last_success_at) VALUES ($1,$2,$3,$4,$5,$6)",["incident-"+id,id,fingerprint,new Date(now-(40+index)*60000),new Date(now-60000),new Date(now-(50+index)*60000)]);
  }
  const secondPage=await (await request("/api/reports/preview?threshold=20&page=2",undefined,admin.cookie)).json();
  check(secondPage.page===2&&secondPage.total===37&&secondPage.entries.length===12,"pagination includes all matching screens beyond the first 25");
  const pdfResponse=await request("/api/reports/preview/pdf?threshold=20",undefined,admin.cookie), pdf=Buffer.from(await pdfResponse.arrayBuffer());
  check(pdfResponse.status===200&&pdfResponse.headers.get("content-type")==="application/pdf"&&pdf.subarray(0,5).toString()==="%PDF-","PDF export returns a real PDF download");
  check((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)||[]).length>=3,"PDF export paginates a long report");
  check(!pdf.includes(Buffer.from(tokenFor(ids.old)))&&!pdf.includes(Buffer.from("https://")),"PDF does not expose preview URLs or tokens");
  fs.writeFileSync(path.join(root,".server-runtime","preview-report-sample.pdf"),pdf);
  for(const table of ["preview_screen_state","preview_incident"]) {
    await pool.query(`ALTER TABLE ${table} RENAME TO ${table}_health_fixture`);
    try {check((await request("/api/health")).status===503,`health check detects missing ${table} migration`);}
    finally {await pool.query(`ALTER TABLE ${table}_health_fixture RENAME TO ${table}`);}
  }
  check((await request("/api/health")).status===200,"health check recovers after report tables are restored");
  await pool.query("ALTER TABLE entities RENAME COLUMN short_name TO short_name_health_fixture");
  try { check((await request("/api/health")).status===503,"health check detects a missing country short-name migration"); }
  finally { await pool.query("ALTER TABLE entities RENAME COLUMN short_name_health_fixture TO short_name"); }
  check((await request("/api/health")).status===200,"health check recovers after the short-name column is restored");
  if(process.env.REPORT_BROWSER_CHECK==="true"){
    const fixture=path.join(root,".server-runtime","reports-browser-fixture.json"),resume=path.join(root,".server-runtime","reports-browser-resume");
    fs.rmSync(resume,{force:true}); fs.writeFileSync(fixture,JSON.stringify({origin,email:"admin@example.test",password}));
    console.log("Disposable reports browser fixture ready; expires in five minutes.");
    const deadline=Date.now()+300000; while(Date.now()<deadline&&!fs.existsSync(resume))await new Promise(resolve=>setTimeout(resolve,500));
    check(fs.existsSync(resume),"browser verification completed before the fixture timeout");
    fs.rmSync(fixture,{force:true}); fs.rmSync(resume,{force:true});
  }
  console.log(`\n${checks} preview report integration checks passed on isolated PostgreSQL.`);
} catch(error){console.error(logs.slice(-4000));throw error;} finally {
  fs.rmSync(path.join(root,".server-runtime","reports-browser-fixture.json"),{force:true}); fs.rmSync(path.join(root,".server-runtime","reports-browser-resume"),{force:true});
  if(server){server.kill();if(server.exitCode===null)await new Promise(resolve=>server.once("exit",resolve));}
  await reportLib.getPool?.().end().catch(()=>{}); await fsPromises.unlink(bundlePath).catch(()=>{}); await pool.end();
  await adminPool.query('DROP DATABASE "'+databaseName+'" WITH (FORCE)'); await adminPool.end();
}
