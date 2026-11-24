import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import {migrate} from '../scripts/migrate-postgres.mjs';
const name='sephora_management_test_'+crypto.randomBytes(8).toString('hex');
const adminUrl=new URL(process.env.DATABASE_URL); adminUrl.pathname='/postgres';
const testUrl=new URL(process.env.DATABASE_URL); testUrl.pathname='/'+name;
const admin=new pg.Pool({connectionString:adminUrl.href}), pool=new pg.Pool({connectionString:testUrl.href});
const photoDir=await fs.mkdtemp(path.resolve('.server-runtime/client-management-photos-'));
let server,created=false,logs='',checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)};

try {
 await admin.query(`CREATE DATABASE "${name}"`);created=true;await migrate(pool);await migrate(pool);
 check((await pool.query("SELECT client_id FROM common_monitor_display WHERE id='main'")).rows[0].client_id==='sephora','migration initializes common wall to Sephora and is repeatable');
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const origin=`http://127.0.0.1:${port}`,token=crypto.randomBytes(32).toString('hex'),password='CMS-UI-Test-2026!';
 server=spawn(process.execPath,[path.resolve('.next/standalone/server.js')],{env:{...process.env,SCREEN_PHOTO_DIR:path.join(photoDir,'screen'),LOCATION_PHOTO_DIR:path.join(photoDir,'location'),PORT:String(port),HOSTNAME:'127.0.0.1',DATABASE_URL:testUrl.href,AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:'',AUTH_SECRET:crypto.randomBytes(48).toString('hex'),AUTH_ADMIN_EMAIL:'cms-admin@example.test',AUTH_BOOTSTRAP_HASH:crypto.createHash('sha256').update(token).digest('hex'),AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000),ONSIGN_API_TOKEN:'',PIXCOM_CLIENT_INTEGRATIONS:'{"sephora":{},"other":{}}',EMAIL_ALERT_WORKER_DISABLED:'true',WHATSAPP_ALERT_WORKER_DISABLED:'true',ALERT_EMAIL_USER:'',ALERT_EMAIL_APP_PASSWORD:'',ULTRAMSG_TOKEN:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'server health: '+logs.slice(-2000));
 const request=(route,body,cookie='',extra={})=>fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 check((await request('/api/cms-support')).status===401,'list requires a session');
 check((await request('/api/cms-support',{action:'create'})).status===401,'write requires a session');
 assert.ok((await request('/api/activate',{token,password})).ok);
 const login=await request('/api/auth/sign-in/email',{email:'cms-admin@example.test',password});assert.ok(login.ok);const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');


 const adminId=(await pool.query("SELECT id FROM auth_user WHERE email='cms-admin@example.test'")).rows[0].id;
 const getData=async()=>{const r=await request('/api/clients',undefined,cookie);assert.equal(r.status,200,await r.clone().text());return r.json();};
 const signIn=async(email)=>{const r=await request('/api/auth/sign-in/email',{email,password});assert.ok(r.ok);return r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');};
 const select=async(id,session=cookie)=>{const r=await request('/api/workspaces',{clientId:id},session);assert.ok(r.ok,await r.clone().text());return session+'; '+r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');};
 const bearer=(key)=>({Authorization:'Bearer '+key});
 // A real hierarchy makes inventory-preservation and Controller restoration checks meaningful.
 let fixtureParent=null;
 for(const [type,name] of [['country','Fixture country'],['region','Fixture region'],['store','Fixture location'],['screen','Sephora fixture screen']]){
  const response=await request('/api/state',{action:'create',type,name,parentId:fixtureParent},cookie);
  assert.ok(response.ok,await response.clone().text());
  fixtureParent=(await pool.query('SELECT id FROM entities WHERE client_id=$1 AND type=$2 AND name=$3',['sephora',type,name])).rows[0].id;
 }
 const originalInventory=(await pool.query("SELECT to_jsonb(e) AS row FROM entities e ORDER BY id")).rows;
 const originalSettings=(await pool.query("SELECT to_jsonb(e) AS row FROM email_alert_settings e WHERE client_id='sephora'")).rows;
 check((await request('/api/clients')).status===401,'client management requires authentication');
 check((await fetch(origin+'/admin/clients',{redirect:'manual'})).status===307,'management page requires authentication');
 check((await pool.query('SELECT count(*)::int AS n FROM platform_administrators')).rows[0].n===0,'bootstrap creates no separate platform role');
 const page=await (await fetch(origin+'/admin/clients',{headers:{Cookie:cookie}})).text();
 check(page.includes('Manage client workspaces')&&!page.includes('Manage access'),'Admin client management uses shared access');
 check(page.includes('href="/admin/users"')&&page.includes('Based on user access'),'Administration Clients links to Users and reflects account assignments');
 const usersPage=await fetch(origin+'/admin/users',{headers:{Cookie:cookie},redirect:'manual'});
 const usersPageHtml=await usersPage.text();
 check(usersPage.ok&&usersPageHtml.includes('Manage team accounts across all clients.')&&
   usersPageHtml.includes('href="/admin/clients"')&&!usersPageHtml.includes('data-client-workspace='),
   'Users opens in Administration without choosing a client');
 const anonymousUsersPage=await fetch(origin+'/admin/users',{redirect:'manual'});
 check(anonymousUsersPage.status===307&&anonymousUsersPage.headers.get('location')==='/login?next=/admin/users',
   'Users keeps its direct link and requires sign-in');
 check((await (await fetch(origin+'/workspaces',{headers:{Cookie:cookie}})).text()).includes('Administration'),'Admin picker includes management card');
 for(const name of ['', '  ', 'x'.repeat(121), 'line\nname'])check((await request('/api/clients',{action:'create',name},cookie)).status===400,'invalid client name rejected');
 check((await request('/api/clients',{action:'assign',clientId:'sephora',members:[]},cookie)).status===400,'obsolete assignment endpoint is rejected');
 check((await fetch(origin+'/api/clients',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json',Cookie:cookie},body:'{"action":"create","name":"Evil"}'})).status===403,'client changes require same origin');
 const users=[];
 for(const [name,email,role] of [['Controller','controller@example.test','controller'],['Second Admin','second@example.test','admin']]){
  const r=await request('/api/users',{action:'create',name,email,role,password},cookie);assert.ok(r.ok,await r.clone().text());users.push((await pool.query('SELECT id,email FROM auth_user WHERE email=$1',[email])).rows[0]);
 }
 const controllerCookie=await signIn(users[0].email),secondCookie=await signIn(users[1].email);
 check((await pool.query('SELECT 1 FROM client_memberships WHERE user_id=ANY($1::text[])',[users.map(u=>u.id)])).rowCount===0,'new accounts need no individual client assignments');
 check((await request('/api/clients',undefined,controllerCookie)).status===403,'Controller cannot manage clients');
 const controllerUsersPage=await fetch(origin+'/admin/users',{headers:{Cookie:controllerCookie},redirect:'manual'});
 check(controllerUsersPage.status===307&&controllerUsersPage.headers.get('location')==='/workspaces',
   'Controller cannot open Administration Users');
 check((await request('/api/clients',undefined,secondCookie)).status===200,'every global Admin can manage clients');
 check(!(await (await fetch(origin+'/workspaces',{headers:{Cookie:controllerCookie}})).text()).includes('Administration'),'Controller cards omit administration');
 const create=await request('/api/clients',{action:'create',name:'  New Client  '},secondCookie);
 check(create.status===201,'named Admin creates a client without a platform grant');const id=(await create.json()).clientId;
 check(/^client-[a-f0-9-]{36}$/.test(id),'server generates safe opaque client ID');
 check((await getData()).clients.some(c=>c.id===id&&c.name==='New Client'),'new client is listed');
 check(!('users' in await getData())&&!JSON.stringify(await getData()).includes('members'),'client list has no individual assignment model');
 check((await request('/api/clients',{action:'create',name:'new CLIENT'},cookie)).status===409,'duplicate name is rejected ignoring case');
 const parallel=await Promise.all([request('/api/clients',{action:'create',name:'Concurrent Client'},cookie),request('/api/clients',{action:'create',name:'Concurrent Client'},cookie)]);
 check(parallel.map(r=>r.status).sort().join(',')==='201,409','concurrent duplicate client creation cannot duplicate data');
 const role='pixcom_client_'+crypto.createHash('md5').update(id).digest('hex');
 const info=(await pool.query('SELECT * FROM pg_roles WHERE rolname=$1',[role])).rows[0];
 check(!info.rolsuper&&!info.rolcanlogin&&!info.rolbypassrls&&!info.rolcreaterole&&!info.rolinherit,'new client runtime role retains restricted privileges');
 const runtimeUrl=new URL(testUrl);runtimeUrl.searchParams.set('options','-c role='+role);const runtime=new pg.Pool({connectionString:runtimeUrl.href});
 try{
  check((await runtime.query('SELECT count(*)::int AS n FROM entities')).rows[0].n===0,'new client inventory starts empty');
  check((await runtime.query("SELECT client_id FROM display_state WHERE id='main'")).rows[0].client_id===id,'new client wall state stays separate');
  check((await runtime.query('SELECT enabled FROM email_alert_settings')).rows.every(r=>!r.enabled),'new client alerts start disabled');
  for(const sql of ['CREATE ROLE forbidden_client_role',"SELECT pixcom_provision_client('sephora')","SELECT * FROM common_monitor_access","SELECT * FROM common_monitor_display","UPDATE common_monitor_display SET client_id='sephora'",`SELECT pixcom_manage_client('${adminId}','create','client-${crypto.randomUUID()}','Denied',NULL,NULL)`]){
   await assert.rejects(runtime.query(sql),e=>e.code==='42501');checks++;console.log('PASS client runtime cannot bypass bounded management');
  }
 }finally{await runtime.end();}
 const selected=await select(id,controllerCookie),selectedAdmin=await select(id,secondCookie);
 check((await request('/api/state',undefined,selected)).ok,'existing Controller session can open newly created client');
 check((await request('/api/state',{action:'create',type:'country',name:'Denied'},selected)).status===403,'Controller cannot edit inventory');
 check((await request('/api/users',undefined,selected)).status===403,'Controller cannot manage accounts');
 check((await request('/api/users',undefined,selectedAdmin)).status===200,'Admin can manage accounts from another client');
 const previousWorkspace=selectedAdmin.slice(secondCookie.length + 2);
 const staleSelection=(await signIn(users[1].email))+'; '+previousWorkspace;
 check((await request('/api/users',undefined,staleSelection,{ 'x-client-id':id })).status===403,
   'Explicitly scoped account requests still reject stale client selections');
 const globalUsers=await request('/api/users',undefined,staleSelection);
 check(globalUsers.ok&&(await globalUsers.json()).users.some(user=>user.id===adminId),
   'Administration Users loads the shared accounts with a previous session’s client cookie');
 const newAccount={action:'create',name:'Administration fixture account',email:'administration-fixture@example.test',role:'controller',password};
 check((await request('/api/users',newAccount,staleSelection,{Origin:'https://evil.example'})).status===403,
   'Administration account changes still require same origin');
 check((await request('/api/users',newAccount,staleSelection)).ok,
   'Administration can create an account with a previous session’s client cookie');
 const accountAudit=(await pool.query("SELECT actor,client_id FROM activity_log WHERE entity_type='user' AND entity_name=$1",[newAccount.email])).rows[0];
 check(accountAudit?.actor===users[1].email&&accountAudit.client_id==='sephora',
   'Global account changes use the default Activity log when no valid client is selected');
 await pool.query('DELETE FROM client_memberships');
 check((await request('/api/state',undefined,cookie)).ok&&(await request('/api/state',undefined,selected)).ok,'legacy membership removal does not affect either role');
 check((await request('/api/clients',{action:'create',name:'Forbidden'},controllerCookie)).status===403,'Controller cannot create clients');
 const audit=(await pool.query("SELECT actor_id FROM client_management_activity WHERE client_id=$1 AND action='create'",[id])).rows[0];
 check(audit.actor_id===users[1].id,'client creation records the individual Admin');
 // Branding is optional, authenticated and restricted to central Administration.
 const clientRowsBefore=(await pool.query('SELECT to_jsonb(c) AS row FROM clients c ORDER BY id')).rows;
 const logoBytes=await sharp({create:{width:400,height:100,channels:4,background:{r:20,g:90,b:80,alpha:.5}}}).png().toBuffer();
 const logoUpload=(clientId,expectedVersion,session=cookie,bytes=logoBytes,type='image/png',extra={})=>{
  const form=new FormData();form.set('metadata',JSON.stringify({action:'replace',clientId,expectedVersion}));form.set('logo',new File([bytes],'../../client.png',{type}));
  return fetch(origin+'/api/client-logo',{method:'POST',headers:{Origin:origin,Cookie:session,...extra},body:form});
 };
 const logoPath=(id,version)=>'/api/client-logo?client='+id+'&v='+version;
 check((await request(logoPath('sephora',crypto.randomUUID()))).status===401,'client logos require authentication');
 check((await logoUpload('sephora',null,'')).status===401,'logo upload requires login');
 check((await logoUpload('sephora',null,controllerCookie)).status===403,'Controller cannot change logos');
 check((await logoUpload('sephora',null,cookie,logoBytes,'image/png',{Origin:'https://evil.example'})).status===403,'logo changes require same origin');
 check((await logoUpload('sephora',null,cookie,Buffer.from('<svg/>'))).status===400,'spoofed raster upload rejected');
 check((await logoUpload('sephora',null,cookie,logoBytes,'image/svg+xml')).status===415,'unsupported logo type rejected');
 check((await logoUpload('sephora',null,cookie,Buffer.alloc(2*1024*1024+1))).status===413,'oversized logo rejected');
 check((await logoUpload('missing',null)).status===404,'missing client cannot receive logo');
 check((await request('/api/client-logo',{action:'remove',clientId:'sephora'},cookie)).status===400,'missing expected version rejected');
 check((await request('/api/client-logo',{action:'replace',clientId:'sephora',expectedVersion:null},cookie)).status===400,'replacement requires a file');
 check((await pool.query('SELECT 1 FROM client_logos')).rowCount===0,'rejected uploads leave branding unchanged');
 const logoSave=await logoUpload('sephora',null);check(logoSave.ok,'Admin adds Sephora logo');const logoVersion=(await logoSave.json()).version;
 const savedLogo=await request(logoPath('sephora',logoVersion),undefined,controllerCookie);check(savedLogo.ok&&savedLogo.headers.get('content-type')==='image/webp','Controller can view saved client logo');
 const normalized=Buffer.from(await savedLogo.arrayBuffer()),logoMeta=await sharp(normalized).metadata();
 check(logoMeta.width===400&&logoMeta.height===100&&logoMeta.hasAlpha,'stored logo retains dimensions and transparency');
 check(savedLogo.headers.get('cache-control').includes('no-store')&&savedLogo.headers.get('x-content-type-options')==='nosniff','logo response is private and raster-only');
 check((await getData()).clients.find(c=>c.id==='sephora').logoKey===logoVersion,'Clients list returns the current logo reference');
 check(!(await getData()).clients.some(c=>'image' in c),'client catalog never includes image bytes');
 const cards=await (await fetch(origin+'/workspaces',{headers:{Cookie:controllerCookie}})).text();
 check(cards.includes(logoVersion)&&cards.includes('/api/client-logo'),'client cards display saved branding');
 const dashboard=await (await fetch(origin+'/admin',{headers:{Cookie:cookie}})).text();
 check(dashboard.includes(logoVersion)&&!dashboard.includes('href="/admin/clients"')&&
   !dashboard.includes('href="/admin/users"'),'client sidebar shows logo and omits Clients and Users navigation');
 const otherDashboard=await fetch(origin+'/admin',{headers:{Cookie:selectedAdmin},redirect:'manual'});
 check(otherDashboard.ok&&!(await otherDashboard.text()).includes('href="/admin/users"'),
   'Users is absent from the other client’s sidebar');
 check((await (await fetch(origin+'/controller',{headers:{Cookie:controllerCookie}})).text()).includes(logoVersion),'Controller header uses selected client logo');
 check((await logoUpload('sephora',null)).status===409,'stale initial logo save cannot overwrite an existing logo');
 const race=await Promise.all([logoUpload('sephora',logoVersion),logoUpload('sephora',logoVersion)]);
 check(race.map(r=>r.status).sort().join(',')==='200,409','concurrent logo replacements detect stale versions');
 const newVersion=(await race.find(r=>r.status===200).json()).version;
 check((await request(logoPath('sephora',logoVersion),undefined,cookie)).status===404,'replaced logo references stop returning old bytes');
 check((await request(logoPath(id,newVersion),undefined,cookie)).status===404,'logo reference cannot be used for another client');
 check((await request('/api/client-logo',{action:'remove',clientId:'sephora',expectedVersion:logoVersion},cookie)).status===409,'stale removal cannot delete a newer logo');
 const remove=await request('/api/client-logo',{action:'remove',clientId:'sephora',expectedVersion:newVersion},cookie);check(remove.ok,'Admin removes client logo');const removedVersion=(await remove.json()).version;
 check((await request(logoPath('sephora',newVersion),undefined,controllerCookie)).status===404,'removed logo is no longer readable');
 const removedClient=(await getData()).clients.find(c=>c.id==='sephora');
 check(removedClient.logoKey===null&&removedClient.logoVersion===removedVersion,'removal restores fallback and retains concurrency version');
 check((await logoUpload('sephora',null)).status===409,'removed logo cannot be overwritten using pre-upload version');
 check((await logoUpload('sephora',removedVersion)).ok,'logo can be added again after removal');
 const secondary=await logoUpload(id,null,secondCookie);check(secondary.ok,'another Admin adds logo to another client');const secondaryVersion=(await secondary.json()).version;
 check((await request(logoPath(id,secondaryVersion),undefined,controllerCookie)).ok,'all active clients logos available to staff');
 check((await pool.query("SELECT count(*)::int AS n FROM client_management_activity WHERE actor_id=$1 AND action IN ('set_logo','remove_logo')",[adminId])).rows[0].n>=4,'logo edits record individual Admin identity');
 check(JSON.stringify((await pool.query('SELECT to_jsonb(c) AS row FROM clients c ORDER BY id')).rows)===JSON.stringify(clientRowsBefore),'logo changes never modify existing client identity records');
 const runtimeCheck=new pg.Pool({connectionString:runtimeUrl.href});
 try{for(const sql of ["SELECT * FROM client_logos",`SELECT pixcom_set_client_logo('${adminId}','sephora',NULL,NULL)`]){await assert.rejects(runtimeCheck.query(sql),e=>e.code==='42501');checks++;}}
 finally{await runtimeCheck.end();}
 const rootRuntimeUrl=new URL(testUrl);rootRuntimeUrl.searchParams.set('options','-c role=pixcom_sephora_runtime');const rootRuntime=new pg.Pool({connectionString:rootRuntimeUrl.href});
 try{
  await assert.rejects(rootRuntime.query("UPDATE client_logos SET image=NULL"),e=>e.code==='42501');checks++;
  await assert.rejects(rootRuntime.query('SELECT pixcom_set_client_logo($1,$2,NULL,NULL)',[users[0].id,'sephora']),e=>e.code==='42501');checks++;
 }finally{await rootRuntime.end();}

 // Both branding assets must save together, preserving unchanged assets and old client data.
 const currentBrand=async()=>(await getData()).clients.find(c=>c.id==='sephora');
 const brandingSave=async(meta,assets={},session=cookie,originHeader=origin)=>{
  const form=new FormData();form.set('metadata',JSON.stringify(meta));
  for(const [kind,bytes] of Object.entries(assets))form.set(kind,new File([bytes],kind+'.png',{type:'image/png'}));
  return fetch(origin+'/api/client-branding',{method:'POST',headers:{Origin:originHeader,Cookie:session},body:form});
 };
 const brandingMeta=(client,logo='keep',background='replace')=>({clientId:client.id,logo:{action:logo,expectedVersion:client.logoVersion},background:{action:background,expectedVersion:client.backgroundVersion}});
 const backgroundBytes=await sharp({create:{width:1800,height:900,channels:3,background:'#285777'}}).png().toBuffer();
 let brand=await currentBrand();
 const initialBrand=brandingMeta(brand,'replace');
 check((await brandingSave(initialBrand,{logo:logoBytes,background:backgroundBytes},'')).status===401,'branding requires authentication');
 check((await brandingSave(initialBrand,{logo:logoBytes,background:backgroundBytes},controllerCookie)).status===403,'Controller cannot change branding');
 check((await brandingSave(initialBrand,{logo:logoBytes,background:backgroundBytes},cookie,'https://evil.example')).status===403,'branding requires same origin');
 check((await brandingSave(initialBrand,{logo:logoBytes,background:Buffer.from('bad')})).status===400,'invalid background rejects both assets');
 check(JSON.stringify(await currentBrand())===JSON.stringify(brand),'failed dual upload leaves logo and background unchanged');
 check((await brandingSave(initialBrand,{logo:logoBytes,background:backgroundBytes})).ok,'Admin saves both branding assets');
 const firstBrand=await currentBrand();
 check(firstBrand.logoKey!==brand.logoKey&&firstBrand.backgroundKey,'both assets receive versions');
 const brandingRows=async()=>JSON.stringify((await pool.query("SELECT to_jsonb(t) AS row FROM client_logos t WHERE client_id='sephora' UNION ALL SELECT to_jsonb(t) AS row FROM client_backgrounds t WHERE client_id='sephora'")).rows);
 const originalBrandingRows=await brandingRows(),originalBrandingAudit=(await pool.query('SELECT count(*)::int AS n FROM client_management_activity')).rows[0].n;
 for(const kind of ['logo','background'])for(const action of [['keep'],['remove'],['replace'],{},null,123]){
  const malformed=brandingMeta(firstBrand,'keep','keep');malformed[kind].action=action;
  check((await brandingSave(malformed)).status===400,'branding rejects non-string '+kind+' actions');
 }
 for(const action of [['remove'],['replace'],{},null,123])check((await request('/api/client-logo',{clientId:'sephora',expectedVersion:firstBrand.logoVersion,action},cookie)).status===400,'legacy logo endpoint rejects non-string actions');
 check(await brandingRows()===originalBrandingRows,'malformed branding actions preserve both image bytes and versions');
 check((await pool.query('SELECT count(*)::int AS n FROM client_management_activity')).rows[0].n===originalBrandingAudit,'malformed branding actions create no audit events');
 // Exercise database failures after the first asset/provisioning write, not only
 // validation failures before the transaction begins. Disposable database only.
 const brandingAuditBefore=(await pool.query('SELECT count(*)::int AS n FROM client_management_activity')).rows[0].n;
 const rolesBefore=(await pool.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'pixcom_client_%' ORDER BY rolname")).rows;
 await pool.query(`CREATE FUNCTION review_reject_background() RETURNS trigger LANGUAGE plpgsql AS $review$
   BEGIN RAISE EXCEPTION USING ERRCODE='XX000', MESSAGE='private branding database failure'; END $review$;
   CREATE TRIGGER review_reject_background BEFORE INSERT OR UPDATE ON client_backgrounds FOR EACH ROW EXECUTE FUNCTION review_reject_background();`);
 try {
  const failedSave=await brandingSave(brandingMeta(firstBrand,'replace'),{logo:logoBytes,background:backgroundBytes});
  check(failedSave.status===503,'database failure during background write returns a controlled service error');
  check(!(await failedSave.text()).includes('private branding database failure'),'database failure details are not exposed to the browser');
  check(JSON.stringify(await currentBrand())===JSON.stringify(firstBrand),'second-asset database failure rolls back the earlier logo write');
  check((await pool.query('SELECT count(*)::int AS n FROM client_management_activity')).rows[0].n===brandingAuditBefore,'failed branding transaction leaves no partial audit event');
  const failedCreate=new FormData();failedCreate.set('metadata',JSON.stringify({action:'create',name:'Rollback branding client'}));
  failedCreate.set('logo',new File([logoBytes],'logo.png',{type:'image/png'}));failedCreate.set('background',new File([backgroundBytes],'background.png',{type:'image/png'}));
  const failedClient=await fetch(origin+'/api/clients',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:failedCreate});
  check(failedClient.status===503,'database failure during branded client creation returns a controlled error');
  check((await pool.query("SELECT 1 FROM clients WHERE name='Rollback branding client'")).rowCount===0,'failed branded creation rolls back the client identity and settings');
  check(JSON.stringify((await pool.query("SELECT rolname FROM pg_roles WHERE rolname LIKE 'pixcom_client_%' ORDER BY rolname")).rows)===JSON.stringify(rolesBefore),'failed branded creation rolls back runtime-role provisioning');
  check((await pool.query('SELECT count(*)::int AS n FROM client_management_activity')).rows[0].n===brandingAuditBefore,'failed client creation leaves no partial management audit');
 } finally {
  await pool.query('DROP TRIGGER review_reject_background ON client_backgrounds; DROP FUNCTION review_reject_background()');
 }
 const backgroundPath=version=>'/api/client-background?client=sephora&v='+version;
 check((await request(backgroundPath(firstBrand.backgroundKey))).status===401,'background read requires login');
 const backgroundRead=await request(backgroundPath(firstBrand.backgroundKey),undefined,controllerCookie);
 const backgroundMeta=await sharp(Buffer.from(await backgroundRead.arrayBuffer())).metadata();
 check(backgroundRead.ok&&backgroundMeta.width===1600&&backgroundMeta.height===800,'Controller reads normalized background');
 check(backgroundRead.headers.get('cache-control').includes('no-store')&&backgroundRead.headers.get('content-type')==='image/webp','background is private raster content');
 check((await brandingSave(initialBrand,{logo:logoBytes,background:backgroundBytes})).status===409,'stale dual save rejected');
 check(JSON.stringify(await currentBrand())===JSON.stringify(firstBrand),'stale save preserves both assets');
 const backgroundRace=await Promise.all([brandingSave(brandingMeta(firstBrand),{background:backgroundBytes}),brandingSave(brandingMeta(firstBrand),{background:backgroundBytes})]);
 check(backgroundRace.map(r=>r.status).sort().join(',')==='200,409','concurrent background saves detect stale editor');
 brand=await currentBrand();
 check(brand.logoKey===firstBrand.logoKey,'background-only save preserves sidebar logo');
 const brandedCards=await (await fetch(origin+'/workspaces',{headers:{Cookie:cookie}})).text();
 check(brandedCards.includes('aria-label="Open Sephora"')&&!brandedCards.includes('Admin access')&&!brandedCards.includes('Controller access'),'client tiles expose accessible client names without role footers');
 check(brandedCards.includes('/api/client-background')&&brandedCards.includes('client-selection-art'),'picker renders background artwork');
 const brandedDashboard=await (await fetch(origin+'/admin',{headers:{Cookie:cookie}})).text();
 check(!brandedDashboard.includes('/api/client-background'),'sidebar never renders card backgrounds');
 check((await brandingSave(brandingMeta(firstBrand,'replace','keep'),{logo:logoBytes})).status===409,'stale unchanged background also protects dual save');
 check((await brandingSave(brandingMeta(brand,'keep','remove'))).ok,'background can be independently removed');
 const removedBrand=await currentBrand();
 check(!removedBrand.backgroundKey&&removedBrand.logoKey===brand.logoKey&&removedBrand.backgroundVersion,'removal preserves logo and concurrency token');
 check((await request(backgroundPath(brand.backgroundKey),undefined,cookie)).status===404,'removed background cannot be read');
 check((await brandingSave(brandingMeta(removedBrand),{background:backgroundBytes})).ok,'background can be restored after removal');
 check((await pool.query("SELECT 1 FROM client_management_activity WHERE action='set_background' AND actor_id=$1",[adminId])).rowCount>=3,'background changes audit the named Admin');
 const backgroundRuntime=new pg.Pool({connectionString:runtimeUrl.href});
 try {await assert.rejects(backgroundRuntime.query('SELECT * FROM client_backgrounds'),e=>e.code==='42501');await assert.rejects(backgroundRuntime.query('SELECT pixcom_set_client_background($1,$2,NULL,NULL)',[adminId,'sephora']),e=>e.code==='42501');checks+=2;}
 finally {await backgroundRuntime.end();}
 const invalidCreate=new FormData();invalidCreate.set('metadata',JSON.stringify({action:'create',name:'Invalid logo client'}));invalidCreate.set('logo',new File(['bad'],'bad.png',{type:'image/png'}));
 check((await fetch(origin+'/api/clients',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:invalidCreate})).status===400,'invalid logo prevents partial client creation');
 check((await pool.query("SELECT 1 FROM clients WHERE name='Invalid logo client'")).rowCount===0,'failed client/logo creation leaves no workspace');
 const createWithLogo=new FormData();createWithLogo.set('metadata',JSON.stringify({action:'create',name:'Brand new client'}));createWithLogo.set('logo',new File([logoBytes],'logo.png',{type:'image/png'}));createWithLogo.set('background',new File([backgroundBytes],'card.png',{type:'image/png'}));
 const branded=await fetch(origin+'/api/clients',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:createWithLogo});check(branded.status===201,'client and both optional branding assets can be created together');
 check((await getData()).clients.some(c=>c.name==='Brand new client'&&c.logoKey&&c.backgroundKey),'new client retains uploaded logo and background');
 const legacy=await (await request('/api/monitor-link',{action:'create'},cookie)).json();const legacyKey=new URL(legacy.link).hash.slice(5);
 check((await request('/api/monitor-link?scope=all')).status===401,'common monitor settings require login');
 check((await request('/api/monitor-link?scope=all',undefined,controllerCookie)).status===403,'Controller cannot manage common link');
 const common=await request('/api/monitor-link?scope=all',{action:'create'},secondCookie);check(common.ok,'Admin creates common read-only monitoring link');const commonBody=await common.json();
 check(commonBody.link.includes('/monitor?scope=all#key='),'common link keeps secret in fragment');const key=new URL(commonBody.link).hash.slice(5);
 const commonStatus=await (await request('/api/monitor-link?scope=all',undefined,cookie)).json();
 check(commonStatus.active&&!('link' in commonStatus)&&!JSON.stringify(commonStatus).includes(key),'monitor secret is returned only at creation');
 check((await pool.query('SELECT token_hash FROM common_monitor_access')).rows[0].token_hash===crypto.createHash('sha256').update(key).digest('hex'),'only hashed common key is stored');
 check((await request('/api/monitor-link?scope=all',{action:'create'},cookie)).status===409,'existing common link cannot be silently overwritten');
 check((await request('/api/monitor-clients')).status===401,'monitor catalog needs login or common capability');
 for(const session of [cookie,controllerCookie])check((await request('/api/monitor-clients',undefined,session)).ok,'enabled account can list monitor clients');
 const catalog=await request('/api/monitor-clients',undefined,'',bearer(key));check(catalog.ok,'common capability lists monitor clients');const list=(await catalog.json()).clients;
 check(list.some(c=>c.id==='sephora')&&list.some(c=>c.id===id)&&list.every(c=>Object.keys(c).sort().join(',')==='id,name'),'monitor catalog exposes only active client IDs and names');
 // Only opening Controller activates the common wall; ordinary Admin/state reads do not.
 const monitor=async(query='',session='',secret=key)=>{const r=await request('/api/monitor-state?scope=all'+query,undefined,session,bearer(secret));assert.equal(r.status,200,await r.clone().text());return r.json();};
 check((await monitor()).clientId==='sephora','common wall initially shows existing Sephora');
 check((await request('/api/controller-client')).status===405,'Controller activation is POST only');
 check((await request('/api/controller-client',{})).status===401,'anonymous user cannot activate Controller client');
 check((await request('/api/controller-client',{},'',bearer(key))).status===401,'monitor capability cannot activate Controller client');
 check((await request('/api/controller-client',{},controllerCookie,{Origin:'https://evil.example'})).status===403,'activation rejects cross-origin requests');
 check((await request('/api/controller-client',{},selected,{'x-client-id':'sephora'})).status===403,'stale Controller tab cannot activate another workspace');
 await request('/api/state',undefined,selectedAdmin);
 await fetch(origin+'/admin',{headers:{Cookie:selectedAdmin}});
 check((await monitor()).clientId==='sephora','Admin client navigation never switches common wall');
 const controllerPage=await (await fetch(origin+'/controller',{headers:{Cookie:selected}})).text();
 check(controllerPage.includes('/workspaces?next=/controller'),'Controller switch returns to Controller through client cards');
 check((await monitor()).clientId==='sephora','rendering Controller alone does not mutate display state');
 check((await request('/api/controller-client',{clientId:'sephora'},selected)).ok,'Controller activates authenticated workspace ignoring supplied client');
 const activation=(await pool.query("SELECT * FROM common_monitor_display WHERE id='main'")).rows[0];
 check(activation.client_id===id&&activation.updated_by===users[0].id,'activation records client and named Controller');
 for(const query of ['', '&client=sephora','&client=missing','&client=../invalid'])check((await monitor(query,cookie)).clientId===id,'common monitor follows Controller regardless of URL and Admin cookie');
 const otherWallBefore=(await pool.query("SELECT to_jsonb(d) AS row FROM display_state d WHERE client_id='sephora'")).rows;
 check((await request('/api/state',{action:'display',selection:{},autoAdvance:false,intervalSeconds:23},selected)).ok,'Controller can change selected client wall settings');
 check(JSON.stringify((await pool.query("SELECT to_jsonb(d) AS row FROM display_state d WHERE client_id='sephora'")).rows)===JSON.stringify(otherWallBefore),'Controller changes do not alter Sephora wall');
 const ownWall=(await monitor()).display;
 check(ownWall.intervalSeconds===23&&ownWall.autoAdvance===false,'common wall follows Controller rotation settings');
 check((await monitor()).entities.length===0,'new client common wall never includes Sephora inventory');
 const newLegacy=await (await request('/api/monitor-link',{action:'create'},selectedAdmin)).json();const newLegacyKey=new URL(newLegacy.link).hash.slice(5);
 const individualKeysBefore=(await pool.query('SELECT to_jsonb(m) AS row FROM monitor_access m ORDER BY client_id')).rows;
 const individual=async(client,secret)=>{const r=await request('/api/monitor-state?client='+client,undefined,'',bearer(secret));assert.equal(r.status,200,await r.clone().text());return r.json();};
 check((await individual('sephora',legacyKey)).clientId==='sephora','individual Sephora link stays on Sephora while common wall shows another client');
 check((await request('/api/controller-client',{},cookie)).ok,'Admin opening Controller can select Sephora');
 const sephoraWall=await monitor();
 check(sephoraWall.clientId==='sephora'&&sephoraWall.display.intervalSeconds!==23&&sephoraWall.entities.length>0,'switching Controller restores independent Sephora settings and screens');
 check((await individual(id,newLegacyKey)).display.intervalSeconds===23,'individual other-client link remains independent of common Controller');
 await request('/api/state',undefined,selected);
 check((await monitor()).clientId==='sephora','old Controller polling cannot take control back');
 check((await request('/api/controller-client',{},selected)).ok,'opening other client Controller switches common wall again');
 const wallsBefore=(await pool.query('SELECT to_jsonb(d) AS row FROM display_state d ORDER BY client_id')).rows;
 const pointerBefore=(await pool.query('SELECT to_jsonb(d) AS row FROM common_monitor_display d')).rows;
 await monitor('&client=sephora');await monitor();await individual('sephora',legacyKey);
 check(JSON.stringify((await pool.query('SELECT to_jsonb(d) AS row FROM display_state d ORDER BY client_id')).rows)===JSON.stringify(wallsBefore),'monitor reads preserve every client wall control');
 check(JSON.stringify((await pool.query('SELECT to_jsonb(d) AS row FROM common_monitor_display d')).rows)===JSON.stringify(pointerBefore),'monitor refresh cannot change Controller selection');
 check(JSON.stringify((await pool.query('SELECT to_jsonb(m) AS row FROM monitor_access m ORDER BY client_id')).rows)===JSON.stringify(individualKeysBefore),'Controller switching never changes individual link keys');
 check((await request('/api/state',{action:'display',selection:{},intervalSeconds:19},'',bearer(key))).status===401,'common monitor link cannot change wall controls');

 check((await request('/api/monitor-clients',undefined,'',bearer(legacyKey))).status===401,'per-client key cannot access common catalog');
 check((await request('/api/monitor-state?scope=all&client='+id,undefined,'',bearer(legacyKey))).status===401,'per-client key cannot access common wall');
 check((await request('/api/monitor-state',undefined,'',bearer(key))).status===401,'common key cannot impersonate legacy per-client key');
 check((await request('/api/monitor-clients',undefined,cookie,bearer('bad'))).status===401,'invalid supplied key does not fall back to session');
 for(const route of ['/api/state','/api/users','/api/clients','/api/monitor-link?scope=all'])check((await request(route,undefined,'',bearer(key))).status===401,'common capability cannot open '+route);
 check((await monitor('&client=missing')).clientId===id,'common URL cannot override active Controller client');
 const replacement=await request('/api/monitor-link?scope=all',{action:'replace',generation:commonBody.generation},cookie);check(replacement.ok,'Admin replaces common link');const replaced=await replacement.json(),key2=new URL(replaced.link).hash.slice(5);
 check((await request('/api/monitor-clients',undefined,'',bearer(key))).status===401,'replacement invalidates old common key immediately');
 check((await request('/api/monitor-link?scope=all',{action:'disable',generation:commonBody.generation},cookie)).status===409,'stale link action cannot overwrite newer version');
 check((await request('/api/monitor-clients',undefined,'',bearer(key2))).ok,'replacement common key works');
 await pool.query('UPDATE clients SET archived_at=now() WHERE id=$1',[id]);
 check(!(await (await request('/api/monitor-clients',undefined,'',bearer(key2))).json()).clients.some(c=>c.id===id),'archived client disappears from catalog');
 check((await request('/api/monitor-state?scope=all',undefined,'',bearer(key2))).status===401,'archived active Controller client is not exposed');
 check((await request('/api/controller-client',{},controllerCookie)).ok,'Controller can recover by opening active Sephora');
 check((await monitor('', '',key2)).clientId==='sephora','common link resumes on active Controller client');
 check((await request(logoPath(id,secondaryVersion),undefined,cookie)).status===404,'archived client logo cannot be viewed');
 check((await logoUpload(id,secondaryVersion)).status===404,'archived client logo cannot be edited');
 check((await request('/api/monitor-link?scope=all',{action:'disable',generation:replaced.generation},cookie)).ok,'Admin disables common link');
 check((await request('/api/monitor-clients',undefined,'',bearer(key2))).status===401,'disable invalidates current common key');
 check((await request('/api/monitor-state',undefined,'',bearer(legacyKey))).ok,'legacy Sephora monitor key still works');
 check(JSON.stringify((await pool.query('SELECT to_jsonb(m) AS row FROM monitor_access m ORDER BY client_id')).rows)===JSON.stringify(individualKeysBefore),'common link never changes individual monitor hashes or generations');
 await pool.query('UPDATE auth_user SET disabled=true WHERE id=$1',[users[0].id]);
 check((await request('/api/controller-client',{},controllerCookie)).status===401,'disabled Controller cannot activate common wall');
 check((await request('/api/workspaces',{clientId:'sephora'},controllerCookie)).status===401,'disabled Controller cannot select any client');
 check((await request('/api/monitor-clients',undefined,controllerCookie)).status===401,'disabled account cannot read common catalog');
 check(JSON.stringify((await pool.query("SELECT to_jsonb(e) AS row FROM entities e WHERE client_id='sephora' ORDER BY id")).rows)===JSON.stringify(originalInventory),'shared access and monitor changes preserve Sephora inventory');
 check(JSON.stringify((await pool.query("SELECT to_jsonb(e) AS row FROM email_alert_settings e WHERE client_id='sephora'")).rows)===JSON.stringify(originalSettings),'shared access preserves Sephora integration settings');
 console.log(checks+' shared-client and common-monitor integration checks passed.');
} finally {
 if(server && server.exitCode===null){const exit=once(server,'exit');server.kill();await exit;}
 await fs.rm(photoDir,{recursive:true,force:true});
 const rolesToRemove=created?(await pool.query("SELECT id FROM clients WHERE id LIKE 'client-%'")).rows.map(c=>'pixcom_client_'+crypto.createHash('md5').update(c.id).digest('hex')):[];
 await pool.end();if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
 for(const role of rolesToRemove)await admin.query('DROP ROLE IF EXISTS "'+role+'"');
 await admin.end();
}
