import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';
import {migrate} from '../scripts/migrate-postgres.mjs';
const name='sephora_permission_test_'+crypto.randomBytes(8).toString('hex');
const adminUrl=new URL(process.env.DATABASE_URL); adminUrl.pathname='/postgres';
const testUrl=new URL(process.env.DATABASE_URL); testUrl.pathname='/'+name;
const admin=new pg.Pool({connectionString:adminUrl.href}), pool=new pg.Pool({connectionString:testUrl.href});
let server,created=false,logs='',checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label)};

try {
 await admin.query(`CREATE DATABASE "${name}"`);created=true;await migrate(pool);await migrate(pool);
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const origin=`http://127.0.0.1:${port}`,token=crypto.randomBytes(32).toString('hex'),password='CMS-UI-Test-2026!';
 server=spawn(process.execPath,[path.resolve('.next/standalone/server.js')],{env:{...process.env,COMPLAINT_ALERTS_ENABLED:'false',PORT:String(port),HOSTNAME:'127.0.0.1',DATABASE_URL:testUrl.href,AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:'',AUTH_SECRET:crypto.randomBytes(48).toString('hex'),AUTH_ADMIN_EMAIL:'cms-admin@example.test',AUTH_BOOTSTRAP_HASH:crypto.createHash('sha256').update(token).digest('hex'),AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000),ONSIGN_API_TOKEN:'',ALERT_EMAIL_USER:'',ALERT_EMAIL_APP_PASSWORD:'',ULTRAMSG_TOKEN:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,'server health: '+logs.slice(-2000));
 const request=(route,body,cookie='',extra={})=>fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 check((await request('/api/cms-support')).status===401,'list requires a session');
 check((await request('/api/cms-support',{action:'create'})).status===401,'write requires a session');
 assert.ok((await request('/api/activate',{token,password})).ok);
 const login=await request('/api/auth/sign-in/email',{email:'cms-admin@example.test',password});assert.ok(login.ok);const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');

 const makeUser=async(email,role)=>{
   const r=await request('/api/users',{action:'create',name:email,email,role,password},cookie);assert.ok(r.ok,await r.clone().text());
   return (await pool.query('SELECT id FROM auth_user WHERE email=$1',[email])).rows[0].id;
 };
 const signIn=async(email)=>{const r=await request('/api/auth/sign-in/email',{email,password});assert.ok(r.ok);return r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')};
 const id=await makeUser('member@example.test','admin');const memberCookie=await signIn('member@example.test');
 check((await request('/api/state',undefined,memberCookie)).ok,'existing Sephora membership permits inventory access');
 const original=(await pool.query('SELECT * FROM auth_user WHERE id=$1',[id])).rows[0];
 await pool.query("INSERT INTO clients(id,slug,name) VALUES('other','other','Other client')");
 await pool.query("INSERT INTO client_memberships(client_id,user_id,role) VALUES('other',$1,'admin')",[id]);
 check((await request('/api/state',undefined,memberCookie,{'x-client-id':'other'})).status===403,'caller cannot select an unimplemented other workspace');
 await pool.query("DELETE FROM client_memberships WHERE client_id='sephora' AND user_id=$1",[id]);
 const listed=await (await request('/api/users',undefined,cookie)).json();
 check(listed.users.some(u=>u.id===id),'global user administration includes users without legacy memberships');
 check((await request('/api/state',undefined,memberCookie)).ok,'global Admin retains access without membership');
 await pool.query('UPDATE auth_user SET disabled=true WHERE id=$1',[id]);
 const paths=['/api/state','/api/onsign','/api/activity','/api/users','/api/cms-support','/api/screen-photo?id=unknown','/api/location-photo?id=unknown','/api/screen-gallery?screenId=unknown','/api/screen-hardware?screenId=unknown','/api/screen-ppm-inspection?screenId=unknown','/api/screen-notes?screenId=unknown','/api/screen-remote-access?screenId=unknown','/api/reports/screens/pdf','/api/reports/screen-details/pdf?screenId=unknown','/api/cms-support/pdf?id=unknown','/api/email-alerts','/api/whatsapp-alerts','/api/monitor-state','/api/monitor-link','/api/preview-health'];
 for(const route of paths)check((await request(route,undefined,memberCookie)).status===401,'disabled account denied '+route);
 const mutations=['/api/state','/api/users','/api/cms-support','/api/screen-gallery','/api/screen-hardware','/api/screen-ppm-inspection','/api/screen-notes','/api/screen-remote-access','/api/survey-import','/api/email-alerts','/api/whatsapp-alerts','/api/monitor-link'];
 for(const route of mutations)check((await fetch(origin+route,{method:route.startsWith('/api/screen-')?'PUT':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:memberCookie},body:'{}'})).status===401,'disabled account blocks mutation '+route);
 await pool.query('UPDATE auth_user SET disabled=false WHERE id=$1',[id]);
 check(JSON.stringify(original)===JSON.stringify((await pool.query('SELECT * FROM auth_user WHERE id=$1',[id])).rows[0]),'revocation leaves account fields unchanged');
 check((await pool.query('SELECT 1 FROM auth_session WHERE user_id=$1',[id])).rowCount>0,'membership revocation works without deleting login sessions');
 await pool.query("INSERT INTO client_memberships(client_id,user_id,role) VALUES('sephora',$1,'controller')",[id]);
 check((await request('/api/state',undefined,memberCookie)).ok,'restored controller membership permits read access');
 check((await request('/api/users',undefined,memberCookie)).status===200,'legacy Controller membership does not reduce global Admin role');
 await pool.query("UPDATE auth_user SET role='controller' WHERE id=$1",[id]);
 check((await request('/api/state',{action:'create',type:'country',name:'Denied'},memberCookie)).status===403,'controller membership cannot mutate inventory');
 await pool.query("UPDATE client_memberships SET role='admin' WHERE client_id='sephora' AND user_id=$1",[id]);
 await pool.query("UPDATE auth_user SET role='admin' WHERE id=$1",[id]);
 check((await request('/api/state',{action:'create',type:'country',name:'Allowed'},memberCookie)).ok,'restored admin membership permits client inventory changes');
 check((await request('/api/users',undefined,memberCookie)).status===200,'global Admin can manage all accounts');
 const controller=await makeUser('controller@example.test','controller');const controllerCookie=await signIn('controller@example.test');
 await pool.query("UPDATE client_memberships SET role='admin' WHERE user_id=$1",[controller]);
 check((await request('/api/users',undefined,controllerCookie)).status===403,'membership cannot elevate a global controller account');
 await pool.query("UPDATE clients SET archived_at=now() WHERE id='sephora'");
 check((await request('/api/state',undefined,memberCookie)).status===401,'archived workspace denies access');
 await pool.query("UPDATE clients SET archived_at=NULL WHERE id='sephora'");
 check((await request('/api/state',undefined,memberCookie)).ok,'unarchiving restores existing access');
 console.log(checks+' global role permission integration checks passed.');
} finally {
 if(server && server.exitCode===null){const exit=once(server,'exit');server.kill();await exit;}
 await pool.end();if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();
}
