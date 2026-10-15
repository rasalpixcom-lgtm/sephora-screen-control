import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "./database";
import { onSignToken } from "./onsign-stream";
import { previewSourceFingerprint } from "./preview-incidents";
import { RESULT_MAX_AGE_MS } from "./preview-health";
import type { AlertMailRow } from "./alert-mail";
import { WHATSAPP_REPORT_MAX_SCREENS } from "./whatsapp-alert-shared";
import type { WhatsAppAlertSettings, WhatsAppAlertSnapshot } from "./whatsapp-alert-shared";
import { sendWhatsAppMessage, WhatsAppSendError, whatsAppSender, type WhatsAppMessage } from "./whatsapp-message";
export class WhatsAppServiceError extends Error{constructor(message:string,public status=400){super(message);}}
type SettingsRow={enabled:boolean;threshold_minutes:number;grouping_minutes:number;recovery_email:boolean;recipients:string[];revision:string;updated_at:Date};
type Row=AlertMailRow&{id:string;liveUrl:string|null;fingerprint:string;status:string|null;stateFingerprint:string|null;stateCheckedAt:Date|null;resolutionReason:string|null;newerIncident:boolean};
type Job={id:string;recipient:string;kind:WhatsAppMessage["kind"];incident_ids:string[]};
type Sender=(message:WhatsAppMessage)=>Promise<{providerId:string|null}>;
async function settingsFor(client:PoolClient):Promise<WhatsAppAlertSettings>{
  const row=(await client.query<SettingsRow>("SELECT * FROM whatsapp_alert_settings WHERE id='main'")).rows[0];
  if(!row)throw new WhatsAppServiceError("WhatsApp alert settings are unavailable.",503);
  return {enabled:row.enabled,thresholdMinutes:row.threshold_minutes,groupingMinutes:row.grouping_minutes,recoveryEmail:row.recovery_email,recipients:row.recipients,revision:row.revision,updatedAt:row.updated_at.toISOString()};
}
const sourceSql=`SELECT i.id,s.live_url AS "liveUrl",i.source_fingerprint AS fingerprint,s.name AS "screenName",l.name AS "locationName",r.name AS "regionName",c.name AS "countryName",i.started_at AS "startedAt",i.last_checked_at AS "lastCheckedAt",i.resolved_at AS "resolvedAt",i.resolution_reason AS "resolutionReason",ps.status,ps.source_fingerprint AS "stateFingerprint",ps.last_checked_at AS "stateCheckedAt",EXISTS(SELECT 1 FROM preview_incident newer WHERE newer.screen_id=i.screen_id AND newer.started_at>i.resolved_at) AS "newerIncident"
 FROM preview_incident i JOIN entities s ON s.id=i.screen_id AND s.type='screen'
 JOIN entities l ON l.id=s.parent_id AND l.type='store' JOIN entities r ON r.id=l.parent_id AND r.type='region'
 JOIN entities c ON c.id=r.parent_id AND c.type='country' LEFT JOIN preview_screen_state ps ON ps.screen_id=s.id`;
async function sources(client:PoolClient,ids?:string[]):Promise<Row[]>{
  const rows=(await client.query<Row>(sourceSql+(ids?" WHERE i.id=ANY($1::text[])":" WHERE i.resolved_at IS NULL OR (i.resolution_reason='recovered' AND EXISTS(SELECT 1 FROM whatsapp_alert_queue q WHERE q.incident_id=i.id AND q.kind='unavailable' AND q.status='accepted' AND NOT EXISTS(SELECT 1 FROM whatsapp_alert_queue recovery WHERE recovery.incident_id=i.id AND recovery.recipient=q.recipient AND recovery.kind='recovery' AND recovery.status IN ('accepted','cancelled','uncertain'))))"),ids?[ids]:[])).rows;
  return rows.map(row=>({...row,startedAt:new Date(row.startedAt).toISOString(),lastCheckedAt:new Date(row.lastCheckedAt).toISOString(),resolvedAt:row.resolvedAt?new Date(row.resolvedAt).toISOString():null}));
}
function fresh(row:Row,now:Date,recovery=false){
  const token=row.liveUrl?onSignToken(row.liveUrl):null;
  const checked=row.stateCheckedAt?.getTime();
  return !!token&&previewSourceFingerprint(token)===row.fingerprint&&row.stateFingerprint===row.fingerprint
    && checked!==undefined&&checked<=now.getTime()&&checked>=now.getTime()-RESULT_MAX_AGE_MS
    && Date.parse(row.startedAt)<=now.getTime()
    && (recovery?!row.newerIncident&&row.resolutionReason==="recovered"&&!!row.resolvedAt&&Date.parse(row.resolvedAt)<=now.getTime()&&row.status==="available":!row.resolvedAt&&row.status==="unavailable");
}
function preview(settings:WhatsAppAlertSettings,rows:Row[]){
  return {screenCount:rows.length,recipientCount:settings.recipients.length,confirmationToken:crypto.createHash("sha256").update(JSON.stringify({revision:settings.revision,ids:rows.map(row=>row.id).sort()})).digest("hex")};
}
export async function whatsappSnapshot():Promise<WhatsAppAlertSnapshot>{
  const client=await getPool().connect();try{return {settings:await settingsFor(client),sender:whatsAppSender(),deliveries:(await client.query('SELECT id,recipient,kind,status,screen_count AS "screenCount",queued_at AS "startedAt",error_code AS "errorCode",provider_id AS "providerId" FROM whatsapp_alert_delivery ORDER BY queued_at DESC,id DESC LIMIT 10')).rows};}finally{client.release();}
}
export async function saveWhatsAppSettings(settings:WhatsAppAlertSettings,actor:string){
  if(settings.enabled&&!whatsAppSender().configured)throw new WhatsAppServiceError("Configure UltraMsg on the server before enabling WhatsApp alerts.");
  const client=await getPool().connect();try{
    await client.query("BEGIN");
    const result=await client.query("UPDATE whatsapp_alert_settings SET enabled=$1,threshold_minutes=$2,grouping_minutes=$3,recovery_email=$4,recipients=$5,revision=$6,updated_at=now() WHERE id='main' AND revision=$7 RETURNING id",[settings.enabled,settings.thresholdMinutes,settings.groupingMinutes,settings.recoveryEmail,JSON.stringify(settings.recipients),crypto.randomUUID(),settings.revision]);
    if(!result.rowCount)throw new WhatsAppServiceError("Settings changed in another window. Reload and try again.",409);
    await client.query("INSERT INTO activity_log(id,action,entity_type,entity_name,actor,created_at) VALUES($1,'Updated WhatsApp alert settings','settings','WhatsApp alerts',$2,$3)",[crypto.randomUUID(),actor,new Date().toISOString()]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function previewWhatsAppManual(options:{now?:Date}={}){
  const client=await getPool().connect();try{
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const settings=await settingsFor(client),now=options.now||new Date();
    const result=preview(settings,(await sources(client)).filter(row=>fresh(row,now)));
    await client.query("COMMIT");return result;
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
async function insertJob(client:PoolClient,kind:Job["kind"],recipient:string,ids:string[],batchId:string,now:Date){
  const id=crypto.randomUUID();
  await client.query("INSERT INTO whatsapp_alert_delivery(id,batch_id,recipient,kind,incident_ids,screen_count,queued_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,batchId,recipient,kind,JSON.stringify(ids),ids.length,now]);return id;
}
export async function queueWhatsAppSend(kind:"test"|"manual",confirmationToken?:string,options:{now?:Date}={}){
  if(!whatsAppSender().configured)throw new WhatsAppServiceError("Configure the UltraMsg instance and token on the server first.");
  const client=await getPool().connect();try{
    await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(724021)");
    const settings=await settingsFor(client),now=options.now||new Date();
    if(!settings.recipients.length)throw new WhatsAppServiceError("Save at least one WhatsApp number first.");
    if((await client.query("SELECT id FROM whatsapp_alert_delivery WHERE kind=$1 AND queued_at>$2::timestamptz-interval '60 seconds' LIMIT 1",[kind,now])).rowCount)throw new WhatsAppServiceError("Wait 60 seconds before sending this message again.",429);
    const rows=kind==="manual"?(await sources(client)).filter(row=>fresh(row,now)):[];
    if(kind==="manual"&&preview(settings,rows).confirmationToken!==confirmationToken)throw new WhatsAppServiceError("Screens or recipients changed. Review the counts and try again.",409);
    if(kind==="manual"&&!rows.length)throw new WhatsAppServiceError("No current confirmed unavailable previews to send.");
    if(kind==="manual"&&rows.length>WHATSAPP_REPORT_MAX_SCREENS)throw new WhatsAppServiceError("PDF reports support up to 5,000 screens. Narrow the report in Reports instead.");
    const batchId=crypto.randomUUID();
    for(const number of settings.recipients)await insertJob(client,kind,number,rows.map(row=>row.id),batchId,now);
    await client.query("COMMIT");return {status:"queued",screenCount:rows.length,recipientCount:settings.recipients.length};
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
async function scheduleAutomatic(client:PoolClient,settings:WhatsAppAlertSettings,now:Date){
  if(!settings.enabled||!settings.recipients.length)return;
  await client.query("UPDATE whatsapp_alert_queue q SET status='cancelled' FROM preview_incident i WHERE q.incident_id=i.id AND q.status='pending' AND (q.recipient<>ALL($1::text[]) OR (q.kind='unavailable' AND i.resolved_at IS NOT NULL))",[settings.recipients]);
  const rows=await sources(client),byId=new Map(rows.map(row=>[row.id,row]));
  const existing=(await client.query<{incident_id:string;recipient:string;kind:string;status:string}>("SELECT incident_id,recipient,kind,status FROM whatsapp_alert_queue WHERE incident_id=ANY($1::text[])",[rows.map(row=>row.id)])).rows;
  const prior=new Map(existing.map(item=>[`${item.incident_id}:${item.recipient}:${item.kind}`,item.status]));
  const additions:Array<{id:string;incident_id:string;recipient:string;kind:string}>=[];
  for(const row of rows)for(const number of settings.recipients){
    const kind=row.resolvedAt?"recovery":"unavailable";
    const previous=prior.get(`${row.id}:${number}:${kind}`);
    if((previous&&!(kind==="unavailable"&&previous==="cancelled"))||!fresh(row,now,kind==="recovery"))continue;
    if(kind==="unavailable"&&Date.parse(row.startedAt)>now.getTime()-settings.thresholdMinutes*60000)continue;
    if(kind==="recovery"){
      if(!settings.recoveryEmail)continue;
      const accepted=prior.get(`${row.id}:${number}:unavailable`)==="accepted";
      if(!accepted||Date.parse(row.resolvedAt!)<Date.parse(settings.updatedAt!))continue;
    }
    additions.push({id:crypto.randomUUID(),incident_id:row.id,recipient:number,kind});
  }
  if(additions.length)await client.query("INSERT INTO whatsapp_alert_queue AS queue(id,incident_id,recipient,kind,queued_at) SELECT id,incident_id,recipient,kind,$2 FROM jsonb_to_recordset($1::jsonb) AS candidates(id text,incident_id text,recipient text,kind text) ON CONFLICT(incident_id,kind,recipient) DO UPDATE SET status='pending',queued_at=EXCLUDED.queued_at,retry_at=NULL,attempts=0,delivery_id=NULL WHERE queue.status='cancelled' AND EXCLUDED.kind='unavailable'",[JSON.stringify(additions),now]);
  const due=(await client.query<{id:string;incident_id:string;queued_at:Date;recipient:string;kind:string}>("SELECT id,incident_id,queued_at,recipient,kind FROM whatsapp_alert_queue WHERE recipient=ANY($1::text[]) AND incident_id=ANY($2::text[]) AND status='pending' AND (retry_at IS NULL OR retry_at<=$3) ORDER BY queued_at,id",[settings.recipients,rows.map(row=>row.id),now])).rows;
  const grouped=new Map<string,typeof due>();
  for(const item of due){
    const row=byId.get(item.incident_id);if(!row||!fresh(row,now,item.kind==="recovery")||(item.kind==="unavailable"&&Date.parse(row.startedAt)>now.getTime()-settings.thresholdMinutes*60000))continue;
    const key=`${item.recipient}:${item.kind}`,items=grouped.get(key)||[];items.push(item);grouped.set(key,items);
  }
  for(const number of settings.recipients)for(const kind of ["unavailable","recovery"] as const){
    if(kind==="recovery"&&!settings.recoveryEmail)continue;
    const pending=(grouped.get(`${number}:${kind}`)||[]).slice(0,WHATSAPP_REPORT_MAX_SCREENS);
    if(!pending.length||pending[0].queued_at.getTime()+settings.groupingMinutes*60000>now.getTime())continue;
    await client.query("BEGIN");try{
      const id=await insertJob(client,kind,number,pending.map(item=>item.incident_id),crypto.randomUUID(),now);
      await client.query("UPDATE whatsapp_alert_queue SET status='scheduled',delivery_id=$2,attempts=attempts+1 WHERE id=ANY($1::text[])",[pending.map(item=>item.id),id]);await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK");throw error;}
  }
}
async function deliverJob(client:PoolClient,job:Job,now:Date,send:Sender){
  const settings=await settingsFor(client),automatic=job.kind==="unavailable"||job.kind==="recovery";
  const rows=job.kind==="test"?[]:(await sources(client,job.incident_ids)).filter(row=>fresh(row,now,job.kind==="recovery")&&(!automatic||job.kind==="recovery"||Date.parse(row.startedAt)<=now.getTime()-settings.thresholdMinutes*60000));
  if(!settings.recipients.includes(job.recipient)||(automatic&&(!settings.enabled||(job.kind==="recovery"&&!settings.recoveryEmail)))||(job.kind!=="test"&&!rows.length)){
    await client.query("BEGIN");try{
      await client.query("UPDATE whatsapp_alert_delivery SET status='cancelled',finished_at=$2 WHERE id=$1",[job.id,now]);
      await client.query("UPDATE whatsapp_alert_queue SET status='pending',delivery_id=NULL WHERE delivery_id=$1 AND status='scheduled'",[job.id]);
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK");throw error;}return;
  }
  // Do not serialize private links/fingerprints into the provider request.
  await client.query("UPDATE whatsapp_alert_delivery SET status='sending',screen_count=$2 WHERE id=$1",[job.id,rows.length]);
  let status="accepted",errorCode:string|null=null,providerId:string|null=null;
  try{const publicRows=rows.map(({screenName,locationName,regionName,countryName,startedAt,lastCheckedAt,resolvedAt})=>({screenName,locationName,regionName,countryName,startedAt,lastCheckedAt,resolvedAt}));providerId=(await send({kind:job.kind,recipient:job.recipient,rows:publicRows,generatedAt:now,referenceId:job.id})).providerId;}
  catch(error){const failure=error instanceof WhatsAppSendError?error:new WhatsAppSendError("uncertain",true);status=failure.uncertain?"uncertain":"failed";errorCode=failure.code;}
  await client.query("BEGIN");try{
    await client.query("UPDATE whatsapp_alert_delivery SET status=$2,error_code=$3,provider_id=$4,finished_at=$5 WHERE id=$1",[job.id,status,errorCode,providerId,now]);
    if(status==="accepted"){
      await client.query("UPDATE whatsapp_alert_queue SET status='accepted' WHERE delivery_id=$1 AND incident_id=ANY($2::text[])",[job.id,rows.map(row=>row.id)]);
      await client.query("UPDATE whatsapp_alert_queue SET status='cancelled' WHERE delivery_id=$1 AND status='scheduled'",[job.id]);
    }else if(status==="uncertain")await client.query("UPDATE whatsapp_alert_queue SET status='uncertain' WHERE delivery_id=$1",[job.id]);
    else await client.query("UPDATE whatsapp_alert_queue SET status='pending',retry_at=$2::timestamptz+make_interval(mins=>LEAST(60,CAST(power(2,LEAST(attempts-1,6)) AS integer))) WHERE delivery_id=$1",[job.id,now]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}
}
export async function processWhatsAppAlerts(options:{now?:Date;send?:Sender}={}){
  const client=await getPool().connect();let locked=false;
  try{
    locked=(await client.query("SELECT pg_try_advisory_lock(724022) AS locked")).rows[0].locked;if(!locked)return;
    await client.query("UPDATE whatsapp_alert_delivery SET status='uncertain',error_code='uncertain',finished_at=now() WHERE status='sending'");
    await client.query("UPDATE whatsapp_alert_queue q SET status='uncertain' FROM whatsapp_alert_delivery d WHERE q.delivery_id=d.id AND q.status='scheduled' AND d.status='uncertain'");
    if(!whatsAppSender().configured)return;
    const now=options.now||new Date();await scheduleAutomatic(client,await settingsFor(client),now);
    const jobs=(await client.query<Job>("SELECT id,recipient,kind,incident_ids FROM whatsapp_alert_delivery WHERE status='pending' ORDER BY queued_at,id LIMIT 3")).rows;
    // Three independent recipients per tick; each DB transaction stays sequential.
    for(const job of jobs)await deliverJob(client,job,options.now||new Date(),options.send||sendWhatsAppMessage);
  }finally{try{if(locked)await client.query("SELECT pg_advisory_unlock(724022)");}finally{client.release();}}
}
const shared=globalThis as typeof globalThis&{sephoraWhatsAppWorker?:boolean};
export function startWhatsAppAlertWorker(){
  if(shared.sephoraWhatsAppWorker||process.env.WHATSAPP_ALERT_WORKER_DISABLED==="true")return;
  shared.sephoraWhatsAppWorker=true;let reported=false;
  const tick=async()=>{try{await processWhatsAppAlerts();reported=false;}catch{if(!reported)console.error("WhatsApp alert worker unavailable");reported=true;}finally{const timer=setTimeout(tick,10000);timer.unref();}};void tick();
}
