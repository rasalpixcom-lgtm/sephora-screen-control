import { renderWhatsAppAlertPdf } from "./whatsapp-alert-pdf";
import type { AlertMailRow } from "./alert-mail";
export type WhatsAppMessage={kind:"unavailable"|"recovery"|"test"|"manual";recipient:string;rows:AlertMailRow[];generatedAt:Date;referenceId:string};
export class WhatsAppSendError extends Error{constructor(public code:string,public uncertain=false){super(code);}}
export function whatsAppSender(){
  const instance=process.env.ULTRAMSG_INSTANCE_ID?.trim()||"";
  return {configured:/^instance\d{1,20}$/.test(instance)&&!!process.env.ULTRAMSG_TOKEN?.trim(),instance:/^instance\d{1,20}$/.test(instance)?instance:null};
}
const clean=(value:string)=>value.replace(/[\u0000-\u001f\u007f*_~`]/g," ").replace(/\s+/g," ").trim();
const time=(value:string)=>new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Dubai",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});
export function whatsAppMessageText(message:WhatsAppMessage){
  const title=message.kind==="test"?"WhatsApp alerts test":message.kind==="recovery"?"Previews recovered":message.kind==="manual"?"Current unavailable previews · Manual report":"Previews unavailable";
  const header=`*Sephora Screen Control*\n${title}${message.kind==="test"?"":` · ${message.rows.length} ${message.rows.length===1?"screen":"screens"}`}\nUpdated ${time(message.generatedAt.toISOString())} GST (UTC+4)\n`;
  if(message.kind==="test")return header+"\nYour WhatsApp alert connection is working. This is a test message.";
  const duration=(row:AlertMailRow)=>Math.max(0,Math.floor(((row.resolvedAt?Date.parse(row.resolvedAt):message.generatedAt.getTime())-Date.parse(row.startedAt))/60000));
  const rows=[...message.rows].sort((a,b)=>duration(b)-duration(a)||a.screenName.localeCompare(b.screenName));
  let text=header,shown=0;
  for(const row of rows){
    const minutes=duration(row),elapsed=minutes<60?`${minutes}m`:`${Math.floor(minutes/60)}h ${minutes%60}m`;
    const entry=`\n*${clean(row.screenName)}*\n${clean([row.locationName,row.regionName,row.countryName].join(" / "))}\n${message.kind==="recovery"?"Outage lasted":"Unavailable for"}: ${elapsed}\nSince ${time(row.startedAt)}${row.resolvedAt&&message.kind==="recovery"?` · Recovered ${time(row.resolvedAt)}`:""}\n`;
    if(text.length+entry.length>3700)break;
    text+=entry;shown++;
  }
  if(shown<rows.length)text+=`\n${rows.length-shown} more screens. View the full list in Controller → Preview issues.\n`;
  return text+"\nPreview status measures image delivery, not physical player connectivity.";
}
export function whatsAppDocumentCaption(message:WhatsAppMessage){
  const title=message.kind==="test"?"WhatsApp PDF test":message.kind==="manual"?"Current unavailable previews - manual report":"Preview unavailable";
  const count=message.kind==="test"?"":` - ${message.rows.length} ${message.rows.length===1?"screen":"screens"}`;
  return `*Sephora Screen Control*\n${title}${count}\nGenerated ${time(message.generatedAt.toISOString())} GST (UTC+4)\n${message.kind==="test"?"Sample PDF attached. No real outage is reported.":"Full screen details are in the attached PDF."}`;
}
export async function sendWhatsAppMessage(message:WhatsAppMessage):Promise<{providerId:string|null}>{
  const sender=whatsAppSender();if(!sender.configured||!sender.instance)throw new WhatsAppSendError("configuration");
  const override=process.env.ULTRAMSG_TEST_ORIGIN;
  const origin=override&&/^http:\/\/127\.0\.0\.1:\d+$/.test(override)?override:"https://api.ultramsg.com";
  let endpoint="chat",fields:Record<string,string>={};
  if(message.kind==="recovery")fields.body=whatsAppMessageText(message);
  if(message.kind!=="recovery"){
    let bytes:Buffer;
    const test=message.kind==="test";
    const sample:AlertMailRow={screenName:"Sample preview - test only",locationName:"Example location",regionName:"Example region",countryName:"Example country",startedAt:new Date(message.generatedAt.getTime()-20*60000).toISOString(),lastCheckedAt:message.generatedAt.toISOString(),resolvedAt:null};
    try{bytes=await renderWhatsAppAlertPdf({kind:message.kind,rows:test?[sample]:message.rows,generatedAt:message.generatedAt});}
    catch{throw new WhatsAppSendError("pdf");}
    const stamp=new Date(message.generatedAt.getTime()+4*60*60000).toISOString().slice(0,16).replace("T","-").replace(":","");
    const label=test?"whatsapp-test":message.kind==="manual"?"preview-manual":"preview-alert";
    const reference=message.referenceId.replace(/[^a-zA-Z0-9]/g,"").slice(0,8)||"report";
    endpoint="document";
    fields={filename:`sephora-${label}-${stamp}-${reference}-GST.pdf`,document:bytes.toString("base64"),caption:whatsAppDocumentCaption(message)};
  }
  const body=new URLSearchParams({token:process.env.ULTRAMSG_TOKEN!.trim(),to:message.recipient,...fields,priority:"1",referenceId:message.referenceId});
  let response:Response;
  try{response=await fetch(`${origin}/${sender.instance}/messages/${endpoint}`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,redirect:"error",signal:AbortSignal.timeout(endpoint==="document"?30000:10000)});}
  catch(cause){const code=(cause as {cause?:{code?:string}})?.cause?.code;throw new WhatsAppSendError(["ECONNREFUSED","ENOTFOUND","EAI_AGAIN"].includes(code||"")?"connection":"uncertain",!["ECONNREFUSED","ENOTFOUND","EAI_AGAIN"].includes(code||""));}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new WhatsAppSendError(response.status>=500?"uncertain":"rejected",response.status>=500);}
  let result:{sent?:unknown;id?:unknown;error?:unknown};
  try{
    if(!response.body)throw new Error();
    const reader=response.body.getReader(),decoder=new TextDecoder();let content="",bytes=0;
    try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>65536){await reader.cancel();throw new Error();}content+=decoder.decode(chunk.value,{stream:true});}content+=decoder.decode();}
    finally{reader.releaseLock();}
    result=JSON.parse(content);if(!result||typeof result!=="object"||Array.isArray(result))throw new Error();
  }catch{throw new WhatsAppSendError("uncertain",true);}
  if(result.error||result.sent===false||result.sent==="false")throw new WhatsAppSendError("rejected");
  if(result.sent!==true&&result.sent!=="true")throw new WhatsAppSendError("uncertain",true);
  return {providerId:typeof result.id==="string"||typeof result.id==="number"?String(result.id).slice(0,100):null};
}
