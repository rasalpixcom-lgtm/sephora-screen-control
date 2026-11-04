import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import pg from 'pg';
import sharp from 'sharp';
import {migrate} from '../scripts/migrate-postgres.mjs';
const name='sephora_screen_pdf_'+crypto.randomBytes(8).toString('hex');
const adminUrl=new URL(process.env.DATABASE_URL);adminUrl.pathname='/postgres';
const testUrl=new URL(process.env.DATABASE_URL);testUrl.pathname='/'+name;
const admin=new pg.Pool({connectionString:adminUrl.href}),pool=new pg.Pool({connectionString:testUrl.href});
const root=path.resolve('.server-runtime/screen-details-server');fs.mkdirSync(root,{recursive:true});
const screenDir=path.join(root,'screens'),locationDir=path.join(root,'locations');for(const dir of [screenDir,locationDir])fs.mkdirSync(dir,{recursive:true});
let server,created=false,logs='',checks=0;
const check=(ok,message)=>{assert.ok(ok,message);checks++;console.log('PASS '+message)};
try{
 await admin.query(`CREATE DATABASE "${name}"`);created=true;await migrate(pool);
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const origin=`http://127.0.0.1:${port}`,token=crypto.randomBytes(32).toString('hex'),password='Screen-PDF-Test-2026!';
 server=spawn(process.execPath,[path.resolve('.next/standalone/server.js')],{env:{...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',DATABASE_URL:testUrl.href,AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:'',AUTH_SECRET:crypto.randomBytes(48).toString('hex'),AUTH_ADMIN_EMAIL:'pdf-admin@example.test',AUTH_BOOTSTRAP_HASH:crypto.createHash('sha256').update(token).digest('hex'),AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000),SCREEN_PHOTO_DIR:screenDir,LOCATION_PHOTO_DIR:locationDir,ONSIGN_API_TOKEN:'',ALERT_EMAIL_USER:'',ALERT_EMAIL_APP_PASSWORD:'',ULTRAMSG_TOKEN:''},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,logs.slice(-2000));
 const post=(route,body,cookie='')=>fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 assert.ok((await post('/api/activate',{token,password})).ok);
 const login=await post('/api/auth/sign-in/email',{email:'pdf-admin@example.test',password});assert.ok(login.ok);const cookie=login.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const route='/api/reports/screen-details/pdf';const get=(query='',session=cookie)=>fetch(origin+route+query,{headers:{Cookie:session}});
 check((await get('', '')).status===401,'anonymous download denied');
 check((await get()).status===400,'screen ID required');
 check((await get('?screenId=missing')).status===404,'unknown screen rejected');
 check((await post(route,{},cookie)).status===405,'unsupported mutation method rejected');
 const ids={};for(const [key,type,parent] of [['country','country',null],['region','region','country'],['location','store','region'],['LED','screen','location'],['LCD','screen','location'],['Video Wall','screen','location'],['unknown','screen',null]]){
  ids[key]=crypto.randomUUID();await pool.query('INSERT INTO entities(id,type,name,parent_id,screen_type,is_demo,created_at) VALUES($1,$2,$3,$4,$5,0,now())',[ids[key],type,key==='LCD'?'LCD / Example "Display"':key+' example',parent?ids[parent]:null,['LED','LCD','Video Wall'].includes(key)?key:null]);
 }
 const front=crypto.randomUUID(),serial=crypto.randomUUID(),missing=crypto.randomUUID(),locPhoto=crypto.randomUUID();
 const photo=await sharp({create:{width:300,height:700,channels:3,background:'#9abccc'}}).webp().toBuffer();
 fs.writeFileSync(path.join(screenDir,front+'.webp'),photo);fs.writeFileSync(path.join(screenDir,serial+'.webp'),photo);fs.writeFileSync(path.join(locationDir,locPhoto+'.webp'),photo);
 await pool.query('UPDATE entities SET photo_key=$1 WHERE id=$2',[front,ids.LED]);
 for(const [category,key] of [['serial',serial],['back_cabling',missing]])await pool.query('INSERT INTO screen_reference_photos(screen_id,category,photo_key) VALUES($1,$2,$3)',[ids.LED,category,key]);
 await pool.query('INSERT INTO location_photos(id,location_id,position,label) VALUES($1,$2,0,$3)',[locPhoto,ids.location,'Store entrance reference']);
 await pool.query('INSERT INTO location_details(location_id,fields,version) VALUES($1,$2,$3)',[ids.location,{address:'Unit 42',contact_name:'Example contact',access_notes:'Use the service entrance.'},crypto.randomUUID()]);
 for(const [key,section,fields] of [['LED','ledDisplay',{manufacturer:'LEDManufacturer',resolution:'2000 x 800',width_mm:'5100',height_mm:'2100'}],['LED','lcd',{tv_model:'INACTIVE-HARDWARE-DO-NOT-EXPORT'}],['LCD','lcd',{tv_model:'LCDModel32',tv_size:'32'}],['Video Wall','video_wall',{display_qty:'25',total_width_mm:'6500'}]])await pool.query('INSERT INTO screen_hardware_sections(screen_id,section,fields,version,updated_at) VALUES($1,$2,$3,$4,now())',[ids[key],section,fields,crypto.randomUUID()]);
 await pool.query('INSERT INTO screen_ppm_inspections(screen_id,fields,version,updated_at) VALUES($1,$2,$3,now())',[ids.LED,{ppmDate:'2026-11-03',overallStatus:'Follow-up',network_cables:'Fail',findings:'Network requires attention.',correctiveAction:'Inspect cable.'},crypto.randomUUID()]);
 check((await get('?screenId='+ids.location)).status===404,'location cannot be exported as a screen');
 check((await get('?screenId='+ids.LED+'&locationPhotos=yes')).status===400,'invalid photo option rejected');
 const before=(await pool.query('SELECT fields,version FROM screen_ppm_inspections WHERE screen_id=$1',[ids.LED])).rows[0];
 for(const [key,extra,file] of [['LED','','led'],['LED','&locationPhotos=1','with-location'],['LCD','','lcd'],['Video Wall','','wall'],['unknown','','unknown']]){
  const response=await get('?screenId='+ids[key]+extra);const bytes=Buffer.from(await response.arrayBuffer());check(response.ok&&bytes.subarray(0,4).toString()==='%PDF',key+' PDF downloads '+file);fs.writeFileSync(path.join(root,file+'.pdf'),bytes);
  check(response.headers.get('cache-control')==='private, no-store'&&response.headers.get('vary').toLowerCase().split(/,\s*/).includes('cookie')&&response.headers.get('x-content-type-options')==='nosniff','private report response headers '+file);
  check(response.headers.get('content-disposition').startsWith('attachment;')&&response.headers.get('content-disposition').includes("filename*=UTF-8''"),'safe download filename '+file);
 }
 check(JSON.stringify((await pool.query('SELECT fields,version FROM screen_ppm_inspections WHERE screen_id=$1',[ids.LED])).rows[0])===JSON.stringify(before),'export does not modify saved inspection');
 assert.ok((await post('/api/users',{action:'create',name:'PDF Controller',email:'pdf-controller@example.test',role:'controller',password},cookie)).ok);
 const restrictedLogin=await post('/api/auth/sign-in/email',{email:'pdf-controller@example.test',password});const restricted=restrictedLogin.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 check((await get('?screenId='+ids.LED,restricted)).status===403,'non-admin download denied');
 execFileSync(process.env.PDF_TEST_PYTHON||'python',['-c',String.raw`import sys
from pathlib import Path
from pypdf import PdfReader
root=Path(sys.argv[1])
def text(name): return '\n'.join(p.extract_text() or '' for p in PdfReader(root/(name+'.pdf')).pages)
a=text('led'); b=text('with-location'); c=text('lcd'); d=text('wall'); e=text('unknown')
for expected in ['LEDManufacturer','5100','2100','Network requires attention.','Unit 42','Screen front','Serial number labels','Back & cabling','Photo unavailable.']: assert expected in a,expected
assert 'Store entrance reference' not in a and 'Store entrance reference' in b
assert 'INACTIVE-HARDWARE-DO-NOT-EXPORT' not in a
assert 'LCDModel32' in c and 'LED display' not in c
assert '6500' in d and 'LCD TV' not in d
assert 'Not specified' in e and 'Location not recorded' in e
print('PASS exported saved hardware, PPM, location, photo categories and optional location photos match the database')
`,root],{stdio:'inherit'});
 console.log(checks+' screen details server checks passed.');
}catch(error){console.error(logs.slice(-1500));throw error}finally{
 if(server){server.kill();if(server.exitCode===null)await new Promise(r=>server.once('exit',r));}
 await pool.end();if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.end();
}
