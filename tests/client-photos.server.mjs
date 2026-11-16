// Disposable database and photo folders only; all external integrations disabled.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {once} from "node:events";
import pg from "pg";
import sharp from "sharp";
import {migrate} from "../scripts/migrate-postgres.mjs";
const name="sephora_photos_test_"+crypto.randomBytes(8).toString("hex");
const url=new URL(process.env.DATABASE_URL),adminUrl=new URL(url);adminUrl.pathname="/postgres";url.pathname="/"+name;
const admin=new pg.Pool({connectionString:adminUrl.href}),pool=new pg.Pool({connectionString:url.href});
const runtime=path.resolve(".server-runtime"),root=path.join(runtime,name);await fs.mkdir(root,{recursive:true});
const screenDir=path.join(root,"screens"),locationDir=path.join(root,"locations");
for(const dir of [screenDir,locationDir]){await fs.mkdir(path.join(dir,"clients/client-other"),{recursive:true});}
let server,created=false,logs="",checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log("PASS "+label);};
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
async function diskSnapshot(){const out={};async function visit(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await visit(file);else out[path.relative(root,file).replaceAll(path.sep,"/")]=hash(await fs.readFile(file));}}await visit(root);return out;}
try{
 await admin.query(`CREATE DATABASE "${name}"`);created=true;await migrate(pool);
 const probe=net.createServer();await new Promise(r=>probe.listen(0,"127.0.0.1",r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin=`http://127.0.0.1:${port}`;
 const token=crypto.randomBytes(32).toString("hex"),password="Photo-Isolation-Test-2026!";
 server=spawn(process.execPath,[path.resolve(".next/standalone/server.js")],{windowsHide:true,env:{...process.env,PORT:String(port),HOSTNAME:"127.0.0.1",DATABASE_URL:url.href,AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:"",AUTH_SECRET:crypto.randomBytes(48).toString("hex"),AUTH_ADMIN_EMAIL:"photo-admin@example.test",AUTH_BOOTSTRAP_HASH:hash(token),AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000),SCREEN_PHOTO_DIR:screenDir,LOCATION_PHOTO_DIR:locationDir,PIXCOM_CLIENT_INTEGRATIONS:'{"sephora":{}}',PREVIEW_WORKER_DISABLED:"true",EMAIL_ALERT_WORKER_DISABLED:"true",WHATSAPP_ALERT_WORKER_DISABLED:"true"},stdio:["ignore","pipe","pipe"]});
 server.stdout.on("data",b=>logs+=b);server.stderr.on("data",b=>logs+=b);
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+"/api/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}check(ready,"production server starts with scoped storage");
 let cookie="";
 const json=(route,body,session=cookie,extra={},method="POST")=>fetch(origin+route,{method,headers:{Cookie:session,Origin:origin,"Content-Type":"application/json",...extra},body:JSON.stringify(body)});
 check((await json("/api/activate",{token,password})).ok,"existing bootstrap grants workspace membership");
 const login=await json("/api/auth/sign-in/email",{email:"photo-admin@example.test",password});check(login.ok,"photo admin signs in");cookie=login.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ");
 await pool.query("INSERT INTO clients(id,slug,name) VALUES('other','other','Foreign client')");
 for(const client of ["sephora","other"]){for(const [id,type,parent] of [["country","country",null],["region","region","country"],["store","store","region"],["screen","screen","store"]])await pool.query("INSERT INTO entities(id,type,name,parent_id,screen_type,client_id,is_demo,created_at) VALUES($1,$2,$3,$4,$5,$6,0,now())",[client+"-"+id,type,client+" "+id,parent?client+"-"+parent:null,type==="screen"?"LED":null,client]);}
 const ownFront=crypto.randomUUID(),ownRef=crypto.randomUUID(),ownLocation=crypto.randomUUID(),foreignKey=crypto.randomUUID(),foreignLocation=crypto.randomUUID(),foreignOnlyKey=crypto.randomUUID();
 const image=await sharp({create:{width:120,height:180,channels:3,background:"#206e57"}}).webp().toBuffer();
 const different=await sharp({create:{width:180,height:120,channels:3,background:"#902050"}}).webp().toBuffer();
 for(const [dir,key,bytes] of [[screenDir,ownFront,image],[screenDir,ownRef,image],[locationDir,ownLocation,image],[path.join(screenDir,"clients/client-other"),ownFront,different],[path.join(screenDir,"clients/client-other"),ownRef,different],[path.join(screenDir,"clients/client-other"),foreignKey,different],[path.join(screenDir,"clients/client-other"),foreignOnlyKey,different],[path.join(locationDir,"clients/client-other"),ownLocation,different],[path.join(locationDir,"clients/client-other"),foreignLocation,different]]){for(const small of [false,true])await fs.writeFile(path.join(dir,key+(small?"-thumb":"")+".webp"),bytes);}
 await pool.query("UPDATE entities SET photo_key=$1 WHERE id='sephora-screen'",[ownFront]);await pool.query("UPDATE entities SET photo_key=$1 WHERE id='other-screen'",[foreignKey]);
 await pool.query("INSERT INTO screen_reference_photos(screen_id,category,photo_key,client_id) VALUES('sephora-screen','media_player',$1,'sephora'),('other-screen','media_player',$2,'other')",[ownRef,foreignKey]);
 await pool.query("INSERT INTO location_photos(id,location_id,position,label,client_id) VALUES($1,'sephora-store',0,'Own location','sephora'),($2,'other-store',0,'Foreign location','other')",[ownLocation,foreignLocation]);
 const foreignRows=async()=>JSON.stringify((await pool.query("SELECT to_jsonb(t) AS row FROM entities t WHERE client_id='other' ORDER BY id")).rows.concat((await pool.query("SELECT to_jsonb(t) AS row FROM screen_reference_photos t WHERE client_id='other'")).rows,(await pool.query("SELECT to_jsonb(t) AS row FROM location_photos t WHERE client_id='other'")).rows));
 const beforeForeign=await foreignRows(),beforeDisk=await diskSnapshot(),foreignFiles=Object.fromEntries(Object.entries(beforeDisk).filter(([file])=>file.includes("client-other")));
 const get=(route,session=cookie,extra={})=>fetch(origin+route,{headers:{Cookie:session,...extra}});
 const front=(id,key,small=false)=>`/api/screen-photo?screenId=${id}&v=${key}&size=${small?"thumbnail":"full"}`;
 const gallery=(id,key,small=false)=>`/api/screen-gallery?screenId=${id}&category=media_player&v=${key}&size=${small?"thumbnail":"full"}`;
 const location=(id,key,small=false)=>`/api/location-photo?locationId=${id}&id=${key}&size=${small?"thumbnail":"full"}`;
 const pdf=id=>`/api/reports/screen-details/pdf?screenId=${id}&locationPhotos=1`;
 for(const route of [front("sephora-screen",ownFront),gallery("sephora-screen",ownRef),location("sephora-store",ownLocation)]){
  check((await get(route,"")).status===401,"anonymous private photo denied");
  const response=await get(route);check(response.ok&&hash(Buffer.from(await response.arrayBuffer()))===hash(image),"existing flat Sephora image served byte-for-byte");
  check(response.headers.get("cache-control")==="private, no-store"&&response.headers.get("x-content-type-options")==="nosniff","private photo response headers retained");
  check((await get(route,cookie,{"x-client-id":"other"})).status===403,"request header cannot switch photo workspace");
 }
 for(const route of [front("sephora-screen",ownFront,true),gallery("sephora-screen",ownRef,true),location("sephora-store",ownLocation,true)])check((await get(route)).ok,"old thumbnail remains accessible");
 for(const route of [front("other-screen",foreignKey),gallery("other-screen",foreignKey),location("other-store",foreignLocation),pdf("other-screen")])check((await get(route)).status===404,"foreign metadata/file/PDF unavailable despite known IDs");
 check((await get(location("sephora-store",foreignLocation))).status===404,"foreign location photo cannot be attached to own location URL");
 check((await get(front("sephora-screen",foreignKey))).status===404,"foreign version key cannot read another file");
 for(const route of ["/uploads/screen-photos/"+ownFront+".webp","/uploads/screen-photos/clients/client-other/"+foreignKey+".webp","/uploads/location-photos/"+ownLocation+".webp"])check((await get(route)).status===404,"private upload folder has no public route");
 const ownPdf=await get(pdf("sephora-screen"));check(ownPdf.ok&&Buffer.from(await ownPdf.arrayBuffer()).subarray(0,4).toString()==="%PDF","screen PDF can embed existing screen, player and location photos");
 // Authorized metadata must still not grant access to another client's namespace.
 await pool.query("UPDATE entities SET photo_key=$1 WHERE id='sephora-screen'",[foreignOnlyKey]);
 check((await get(front("sephora-screen",foreignOnlyKey))).status===404,"foreign-only file not readable even if own row references same key");
 check((await get(pdf("sephora-screen"))).ok,"missing own photo produces valid PDF without foreign file access");
 await pool.query("UPDATE entities SET photo_key=$1 WHERE id='sephora-screen'",[ownFront]);
 const upload=(route,metadata,session=cookie,requestOrigin=origin)=>{const form=new FormData();form.set("metadata",JSON.stringify(metadata));form.set("photo",new Blob([image],{type:"image/webp"}),"photo.webp");return fetch(origin+route,{method:route==="/api/state"?"POST":"PUT",headers:{Cookie:session,Origin:requestOrigin},body:form});};
 const mutation={action:"replace",screenId:"sephora-screen",category:"media_player",expectedKey:ownRef};
 const galleryRowsBefore=JSON.stringify((await pool.query('SELECT to_jsonb(t) AS row FROM screen_reference_photos t ORDER BY screen_id,category')).rows);
 const galleryAuditBefore=(await pool.query('SELECT count(*)::int AS n FROM activity_log')).rows[0].n;
 for(const action of [["remove"],["replace"],{},null,123])check((await json("/api/screen-gallery",{...mutation,action},cookie,{},"PUT")).status===400,"gallery rejects non-string actions");
 check(JSON.stringify((await pool.query('SELECT to_jsonb(t) AS row FROM screen_reference_photos t ORDER BY screen_id,category')).rows)===galleryRowsBefore,"malformed gallery actions preserve photo references");
 check(JSON.stringify(await diskSnapshot())===JSON.stringify(beforeDisk),"malformed gallery actions preserve every existing photo file");
 check((await pool.query('SELECT count(*)::int AS n FROM activity_log')).rows[0].n===galleryAuditBefore,"malformed gallery actions create no audit events");
 check((await upload("/api/screen-gallery",mutation,"",origin)).status===401,"anonymous upload denied");
 check((await upload("/api/screen-gallery",mutation,cookie,"https://attacker.test")).status===403,"cross-origin upload denied");
 check((await upload("/api/screen-gallery",{...mutation,screenId:"other-screen",expectedKey:foreignKey})).status===404,"foreign gallery replacement denied");
 check(JSON.stringify(await diskSnapshot())===JSON.stringify(beforeDisk),"denied foreign replacement removes only its staged upload");
 const changed=await upload("/api/screen-gallery",mutation);const next=(await changed.json()).key;check(changed.ok&&next!==ownRef,"reference photo replaces successfully");
 check((await fs.readFile(path.join(screenDir,"clients/client-sephora",next+".webp"))).length>0,"new reference upload saved under Sephora folder");
 check((await get(gallery("sephora-screen",ownRef))).status===404,"replaced reference URL revoked");
 check(!Object.keys(await diskSnapshot()).some(file=>file==="screens/"+ownRef+".webp"),"authorized replacement removes legacy reference");
 const stagedBefore=await diskSnapshot();check((await upload("/api/screen-gallery",mutation)).status===409,"stale gallery edit rejected");check(JSON.stringify(await diskSnapshot())===JSON.stringify(stagedBefore),"stale upload leaves existing files unchanged");
 const stateBody={action:"update",type:"screen",id:"sephora-screen",name:"sephora screen",parentId:"sephora-store",photoAction:"replace",photoExpectedKey:ownFront};
 const replaced=await upload("/api/state",stateBody);const newFront=(await replaced.json()).entities.find(e=>e.id==="sephora-screen").photoKey;check(replaced.ok&&newFront!==ownFront,"existing screen front replaced");
 check((await get(front("sephora-screen",newFront))).ok&&(await get(front("sephora-screen",newFront,true))).ok,"new screen front full and thumbnail served");
 const locationBody={action:"update",type:"store",id:"sephora-store",name:"sephora store",parentId:"sephora-region",locationPhotos:[{uploadIndex:0,label:"New own location"}],locationPhotoExpected:[{id:ownLocation,label:"Own location"}]};
 const form=new FormData();form.set("metadata",JSON.stringify(locationBody));form.set("locationPhoto0",new Blob([image],{type:"image/webp"}),"location.webp");
 const locationUpdate=await fetch(origin+"/api/state",{method:"POST",headers:{Cookie:cookie,Origin:origin,"x-location-photos":"1"},body:form});const locationState=await locationUpdate.json();check(locationUpdate.ok,"existing location photo replaced");
 const newLocation=locationState.locationPhotos.find(p=>p.locationId==="sephora-store").id;
 check((await fs.stat(path.join(locationDir,"clients/client-sephora",newLocation+".webp"))).isFile(),"new location photo saved under Sephora folder");
 check((await get(location("sephora-store",newLocation))).ok&&(await get(location("sephora-store",newLocation,true))).ok,"new location full and thumbnail served");
 check((await get(pdf("sephora-screen"))).ok,"PDF embeds newly namespaced photos");
 check((await json("/api/screen-gallery",{...mutation,screenId:"other-screen",expectedKey:foreignKey,action:"remove"},cookie,{},"PUT")).status===404,"foreign photo removal denied");
 check((await json("/api/state",{action:"delete",id:"other-country"})).status===404,"foreign parent deletion denied");
 // Permissions are checked before private bytes, independent of valid photo keys.
 check((await json("/api/users",{action:"create",name:"Photo Controller",email:"photo-controller@example.test",role:"controller",password})).ok,"test controller created");
 const limited=await json("/api/auth/sign-in/email",{email:"photo-controller@example.test",password});const controller=limited.headers.getSetCookie().map(x=>x.split(";")[0]).join("; ");
 for(const route of [front("sephora-screen",newFront),gallery("sephora-screen",next),location("sephora-store",newLocation),pdf("sephora-screen")])check((await get(route,controller)).status===403,"controller cannot read admin photos or PDF");
 check((await upload("/api/screen-gallery",{...mutation,expectedKey:next},controller)).status===403,"controller cannot replace photos");
 check((await json("/api/state",{action:"delete",id:"sephora-country"})).ok,"own parent deletion succeeds");
 check((await get(front("sephora-screen",newFront))).status===404,"deleted screen file URL revoked");
 const finalDisk=await diskSnapshot();check(!Object.keys(finalDisk).some(file=>file.includes("client-sephora")||/^screens\/[a-f0-9-]+(?:-thumb)?\.webp$/.test(file)||/^locations\/[a-f0-9-]+(?:-thumb)?\.webp$/.test(file)),"own cascade deletion cleans namespaced and legacy screen/location pairs");
 check(JSON.stringify(Object.fromEntries(Object.entries(finalDisk).filter(([file])=>file.includes("client-other"))))===JSON.stringify(foreignFiles),"foreign same-key full/thumbnail bytes unchanged after all mutations");
 check(await foreignRows()===beforeForeign,"foreign database ownership and photo references unchanged");
 console.log(checks+" client photo HTTP/PDF isolation checks passed.");
} catch(error){console.error(logs.slice(-1200));throw error;}
finally{
 if(server){server.kill();if(server.exitCode===null)await once(server,"exit");}
 await pool.end();if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();
 if(!root.startsWith(runtime+path.sep)||path.basename(root)!==name)throw new Error("Unsafe photo fixture cleanup");await fs.rm(root,{recursive:true,force:true});
}
