// No provider connections: all OnSign requests use local in-memory fixtures.
import assert from "node:assert/strict";
import {build} from "esbuild";
import {createRequire} from "node:module";
import path from "node:path";
import fs from "node:fs";
fs.mkdirSync(".server-runtime",{recursive:true});
const bundle=path.resolve(".server-runtime/client-integrations.cjs");
await build({stdin:{contents:'export {clientIntegrations} from "./lib/client-integrations"; export {createOnSignClient} from "./lib/onsign-api"; export {alertSender,sendAlertMail} from "./lib/alert-mail"; export {whatsAppSender,sendWhatsAppMessage} from "./lib/whatsapp-message";',resolveDir:process.cwd(),loader:"ts"},outfile:bundle,platform:"node",format:"cjs",bundle:true,external:["pg","pdfkit"],plugins:[{name:"local-mail-fixture",setup(b){
 b.onResolve({filter:/^nodemailer$/},()=>({path:"nodemailer",namespace:"mail-fixture"}));
 b.onLoad({filter:/.*/,namespace:"mail-fixture"},()=>({contents:'export default {createTransport(options){globalThis.clientMailOptions=options;return {async sendMail(mail){globalThis.clientMailEnvelope=mail;return {rejected:[]};},close(){}};}}',loader:"js"}));
}}]});
const {clientIntegrations,createOnSignClient,alertSender,sendAlertMail,whatsAppSender,sendWhatsAppMessage}=createRequire(import.meta.url)(bundle);
let checks=0;
const equal=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const legacy={ONSIGN_API_TOKEN:"private-legacy",ONSIGN_ORGANIZATION_ID:"legacy-org",ALERT_EMAIL_USER:"legacy@example.test",ALERT_EMAIL_APP_PASSWORD:"private-legacy-password",ULTRAMSG_INSTANCE_ID:"instance123",ULTRAMSG_TOKEN:"private-legacy-token"};
equal(clientIntegrations("sephora",legacy),{onsign:{token:legacy.ONSIGN_API_TOKEN,organizationId:"legacy-org"},email:{user:legacy.ALERT_EMAIL_USER,appPassword:legacy.ALERT_EMAIL_APP_PASSWORD},whatsapp:{instanceId:"instance123",token:legacy.ULTRAMSG_TOKEN}},"Sephora legacy configuration remains unchanged");
for(const id of ["other","constructor","tostring"])equal(clientIntegrations(id,legacy),{},id+" never inherits legacy credentials");
const explicit={sephora:{onsign:{token:"private-sephora",organizationId:"org-one"},email:{user:"sephora@example.test",appPassword:"private-pass"},whatsapp:{instanceId:"instance456",token:"private-sephora-wa"}},other:{onsign:{token:"private-other",organizationId:"org-two"}}};
const env={...legacy,PIXCOM_CLIENT_INTEGRATIONS:JSON.stringify(explicit)};
equal(clientIntegrations("sephora",env),explicit.sephora,"explicit client configuration replaces legacy credentials");
equal(clientIntegrations("other",env),explicit.other,"foreign credentials are selected only by their exact client ID");
equal(clientIntegrations("absent",env),{},"missing client has no integration fallback");
for(const entry of [{},{email:{}},{onsign:{token:""}}])equal(clientIntegrations("sephora",{...legacy,PIXCOM_CLIENT_INTEGRATIONS:JSON.stringify({sephora:entry})}),entry,"explicit empty/partial entry disables omitted legacy providers");
equal(clientIntegrations("sephora",{...legacy,PIXCOM_CLIENT_INTEGRATIONS:JSON.stringify({other:explicit.other})}).onsign.token,"private-legacy","adding another client does not change Sephora defaults");
for(const raw of ["private-secret", "null", "[]",JSON.stringify({sephora:null}),JSON.stringify({sephora:{unknown:{token:"private-secret"}}}),JSON.stringify({sephora:{email:{unknown:"private-secret"}}}),JSON.stringify({sephora:{email:{user:1}}}),JSON.stringify({sephora:{email:{user:"bad\nprivate-secret"}}}),JSON.stringify({"bad id":{}}),'{"__proto__":{}}',JSON.stringify({sephora:{constructor:{}}}),"{"+" ".repeat(65537)+"}",JSON.stringify({sephora:{onsign:{token:"a".repeat(8193)}}})]){
 assert.throws(()=>clientIntegrations("sephora",{...legacy,PIXCOM_CLIENT_INTEGRATIONS:raw}),e=>e.message==="Check PIXCOM_CLIENT_INTEGRATIONS on the server.");checks++;
}
for(const id of ["","Other","bad id","x".repeat(81)]){assert.throws(()=>clientIntegrations(id,env));checks++;}
const previous=process.env.PIXCOM_CLIENT_INTEGRATIONS;
try{
 process.env.PIXCOM_CLIENT_INTEGRATIONS=JSON.stringify(explicit);
 equal(alertSender(),{configured:true,address:"sephora@example.test"},"email public status uses client sender without exposing its password");
 equal(whatsAppSender(),{configured:true,instance:"instance456"},"WhatsApp public status uses client instance without exposing its token");
 process.env.PIXCOM_CLIENT_INTEGRATIONS='{"sephora":{}}';
 equal(alertSender().configured,false,"explicit client disable takes effect immediately for email");
 equal(whatsAppSender().configured,false,"explicit client disable takes effect immediately for WhatsApp");
}finally{if(previous===undefined)delete process.env.PIXCOM_CLIENT_INTEGRATIONS;else process.env.PIXCOM_CLIENT_INTEGRATIONS=previous;}
let clientId="sephora",organizationId="org-one",token="same-private-token",calls=0;
const seen=[];
const client=createOnSignClient({now:()=>Date.now(),clientId:()=>clientId,organizationId:()=>organizationId,token:()=>token,fetch:async(url,options)=>{
 const body=JSON.parse(options.body);seen.push(body.variables.organizationId);calls++;
 assert.equal(options.headers.Authorization,"token "+token);
 return Response.json({data:{organizations:{nodes:[{id:body.variables.organizationId,players:{nodes:[{id:"player",name:"Client "+clientId}],pageInfo:{hasNextPage:false}}}]}}});
}});
equal((await client.list()).players[0].name,"Client sephora","Sephora response loaded");
await client.list();equal(calls,1,"same-client list reuses its cache");
clientId="other";
equal((await client.list()).players[0].name,"Client other","client switch with identical account and organization cannot reuse the prior cache");
equal(calls,2,"client ID participates in cache identity");
organizationId="org-two";await client.list();equal(seen,["org-one","org-one","org-two"],"every client request targets the selected organization");
token="rotated-private";await client.list();equal(calls,4,"credential rotation invalidates client cache");
clientId="";await assert.rejects(()=>client.list());checks++;
let forbiddenCalls=0;
const foreign=createOnSignClient({now:()=>Date.now(),clientId:()=>"other",token:()=>"private-other",organizationId:()=>"",fetch:async()=>{forbiddenCalls++;throw new Error("Unexpected discovery");}});
await assert.rejects(()=>foreign.list(),e=>e.status===503);checks++;
equal(forbiddenCalls,0,"another client cannot discover or default to the Sephora organization");
// In-flight requests keep their captured client/organization. A newer scope
// cannot be overwritten by a slower response from the previous scope.
let active="sephora",release;
const pending=new Promise(r=>release=r);
const concurrent=createOnSignClient({now:()=>Date.now(),clientId:()=>active,token:()=>"private",organizationId:()=>active==="sephora"?"one":"two",fetch:async(url,options)=>{
 const id=JSON.parse(options.body).variables.organizationId;
 if(id==="one")await pending;
 return Response.json({data:{organizations:{nodes:[{id,players:{nodes:[{id:"player",name:id}],pageInfo:{hasNextPage:false}}}]}}});
}});
const first=concurrent.list();await new Promise(r=>setTimeout(r,0));active="other";
equal((await concurrent.list()).players[0].name,"two","new scope loads independently while old request is pending");
release();equal((await first).players[0].name,"one","pending request retains original scope");
equal((await concurrent.list()).players[0].name,"two","slow previous-client response does not overwrite current cache");

// Capture provider requests locally. Rotate config during asynchronous PDF/logo
// preparation to prove an old account is never paired with a new account token.
const previousConfig=process.env.PIXCOM_CLIENT_INTEGRATIONS,previousFetch=globalThis.fetch;
try{
 process.env.PIXCOM_CLIENT_INTEGRATIONS=JSON.stringify(explicit);
 const email=sendAlertMail({kind:"test",recipients:["client@example.test"],rows:[],generatedAt:new Date(),messageId:"fixture"});
 process.env.PIXCOM_CLIENT_INTEGRATIONS=JSON.stringify({sephora:{email:{user:"rotated@example.test",appPassword:"rotated-private"}}});
 await email;
 equal(globalThis.clientMailOptions.auth,{user:"sephora@example.test",pass:"private-pass"},"email retains one client/account credential snapshot across asynchronous work");
 equal(globalThis.clientMailEnvelope.envelope,{from:"sephora@example.test",to:["client@example.test"]},"email transport and envelope use the same client sender");
 let captured;
 globalThis.fetch=async(url,options)=>{captured={url,body:new URLSearchParams(options.body)};return Response.json({sent:true,id:"mock-provider"});};
 process.env.PIXCOM_CLIENT_INTEGRATIONS=JSON.stringify(explicit);
 const whatsapp=sendWhatsAppMessage({kind:"test",recipient:"+971500000000",rows:[],generatedAt:new Date(),referenceId:"fixture"});
 process.env.PIXCOM_CLIENT_INTEGRATIONS=JSON.stringify({sephora:{whatsapp:{instanceId:"instance999",token:"rotated-private"}}});
 await whatsapp;
 equal(captured.url,"https://api.ultramsg.com/instance456/messages/document","PDF preparation keeps the selected client instance");
 equal(captured.body.get("token"),"private-sephora-wa","PDF preparation keeps that same client's token after config rotation");
 equal(Buffer.from(captured.body.get("document"),"base64").subarray(0,5).toString(),"%PDF-","mock provider receives a valid PDF header");
}finally{
 globalThis.fetch=previousFetch;
 delete globalThis.clientMailOptions;delete globalThis.clientMailEnvelope;
 if(previousConfig===undefined)delete process.env.PIXCOM_CLIENT_INTEGRATIONS;else process.env.PIXCOM_CLIENT_INTEGRATIONS=previousConfig;
}
console.log(checks+" client integration/transport checks passed.");
