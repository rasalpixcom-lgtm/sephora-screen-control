import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "./database";
import { onSignToken } from "./onsign-stream";
import { previewSourceFingerprint } from "./preview-incidents";
import { RESULT_MAX_AGE_MS } from "./preview-health";
import { alertSender, AlertMailError, sendAlertMail, type AlertMail, type AlertMailRow, type MailResult } from "./alert-mail";
import type { EmailAlertSettings, EmailAlertSnapshot } from "./email-alert-shared";

export class EmailAlertServiceError extends Error { constructor(message:string,public status=400){super(message);} }
type SettingsRow={enabled:boolean;threshold_minutes:number;grouping_minutes:number;recovery_email:boolean;recipients:string[];revision:string;updated_at:Date};
type IncidentRow=AlertMailRow & {id:string;screenId:string;sourceFingerprint:string;liveUrl:string|null;resolutionReason:string|null;previewStatus:string|null;stateFingerprint:string|null;stateCheckedAt:string|null;recoveryQueuedAt:string|null};
const settingsFrom=(row:SettingsRow):EmailAlertSettings=>({enabled:row.enabled,thresholdMinutes:row.threshold_minutes,groupingMinutes:row.grouping_minutes,recoveryEmail:row.recovery_email,recipients:row.recipients,revision:row.revision,updatedAt:row.updated_at.toISOString()});
async function settingsFor(client:PoolClient) {
  const row=(await client.query<SettingsRow>("SELECT * FROM email_alert_settings WHERE id='main'")).rows[0];
  if (!row) throw new EmailAlertServiceError("Email alert settings are unavailable.",503);
  return settingsFrom(row);
}
export async function emailAlertSnapshot():Promise<EmailAlertSnapshot> {
  const client=await getPool().connect();
  try {
    const settings=await settingsFor(client);
    const deliveries=(await client.query("SELECT id,kind,status,screen_count AS \"screenCount\",started_at AS \"startedAt\",finished_at AS \"finishedAt\",error_code AS \"errorCode\" FROM email_alert_delivery ORDER BY started_at DESC,id DESC LIMIT 10")).rows;
    return {settings,sender:alertSender(),deliveries};
  } finally {client.release();}
}
export async function saveEmailAlertSettings(settings:EmailAlertSettings,actor:string) {
  if (settings.enabled && !alertSender().configured) throw new EmailAlertServiceError("Configure the Gmail sender on the server before enabling alerts.");
  const client=await getPool().connect();
  try {
    await client.query("BEGIN");
    const updated=await client.query("UPDATE email_alert_settings SET enabled=$1,threshold_minutes=$2,grouping_minutes=$3,recovery_email=$4,recipients=$5,revision=$6,updated_at=now() WHERE id='main' AND revision=$7 RETURNING id",[settings.enabled,settings.thresholdMinutes,settings.groupingMinutes,settings.recoveryEmail,JSON.stringify(settings.recipients),crypto.randomUUID(),settings.revision]);
    if (!updated.rowCount) throw new EmailAlertServiceError("Settings changed in another window. Reload and try again.",409);
    await client.query("INSERT INTO activity_log (id,action,entity_type,entity_name,actor,created_at) VALUES ($1,'Updated email alert settings','settings','Email alerts',$2,$3)",[crypto.randomUUID(),actor,new Date().toISOString()]);
    await client.query("COMMIT");
  } catch(error) {await client.query("ROLLBACK");throw error;} finally {client.release();}
}
const incidentSql=`SELECT i.id, i.screen_id AS "screenId", i.source_fingerprint AS "sourceFingerprint", s.live_url AS "liveUrl",
  s.name AS "screenName", l.name AS "locationName", r.name AS "regionName", c.name AS "countryName",
  i.started_at AS "startedAt", i.last_checked_at AS "lastCheckedAt", i.resolved_at AS "resolvedAt", i.resolution_reason AS "resolutionReason",
  ps.status AS "previewStatus", ps.source_fingerprint AS "stateFingerprint", ps.last_checked_at AS "stateCheckedAt", rq.queued_at AS "recoveryQueuedAt"
  FROM preview_incident i JOIN entities s ON s.id=i.screen_id AND s.type='screen'
  JOIN entities l ON l.id=s.parent_id AND l.type='store' JOIN entities r ON r.id=l.parent_id AND r.type='region'
  JOIN entities c ON c.id=r.parent_id AND c.type='country' LEFT JOIN preview_screen_state ps ON ps.screen_id=s.id
  LEFT JOIN email_alert_queue rq ON rq.incident_id=i.id AND rq.kind='recovery'`;
function normalized(row:IncidentRow):IncidentRow {
  return {...row,startedAt:new Date(row.startedAt).toISOString(),lastCheckedAt:new Date(row.lastCheckedAt).toISOString(),resolvedAt:row.resolvedAt?new Date(row.resolvedAt).toISOString():null,stateCheckedAt:row.stateCheckedAt?new Date(row.stateCheckedAt).toISOString():null};
}
function currentSource(row:IncidentRow) {
  const token=row.liveUrl?onSignToken(row.liveUrl):null;
  return !!token && previewSourceFingerprint(token)===row.sourceFingerprint;
}
function qualifies(row:IncidentRow,kind:"unavailable"|"recovery",settings:EmailAlertSettings,now:Date) {
  if (!currentSource(row)) return false;
  // Once qualified and queued, ordinary settings edits must not discard a recovery.
  if (kind==="recovery") return settings.recoveryEmail && row.resolutionReason==="recovered" && !!row.resolvedAt && (!settings.updatedAt||!!row.recoveryQueuedAt||Date.parse(row.resolvedAt)>=Date.parse(settings.updatedAt)) && row.previewStatus==="available" && row.stateFingerprint===row.sourceFingerprint && !!row.stateCheckedAt && Date.parse(row.stateCheckedAt)>=now.getTime()-RESULT_MAX_AGE_MS;
  return !row.resolvedAt && Date.parse(row.startedAt)<=now.getTime()-settings.thresholdMinutes*60000 && Date.parse(row.lastCheckedAt)>=now.getTime()-RESULT_MAX_AGE_MS && row.previewStatus==="unavailable" && row.stateFingerprint===row.sourceFingerprint;
}
type Sender=(mail:AlertMail)=>Promise<MailResult>;
async function delivery(client:PoolClient,kind:AlertMail["kind"],recipients:string[],rows:IncidentRow[],queueIds:string[],now:Date,send:Sender) {
  const id=crypto.randomUUID();
  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO email_alert_delivery (id,kind,status,recipients,screen_count,started_at) VALUES ($1,$2,'sending',$3,$4,$5)",[id,kind,JSON.stringify(recipients),rows.length,now]);
    if (queueIds.length) await client.query("UPDATE email_alert_queue SET status='sending',delivery_id=$2,attempts=attempts+1 WHERE id=ANY($1::text[]) AND status='pending'",[queueIds,id]);
    await client.query("COMMIT");
  } catch(error) {await client.query("ROLLBACK");throw error;}
  let status="sent",code:string|null=null;
  const publicRows=rows.map(({screenName,locationName,regionName,countryName,startedAt,lastCheckedAt,resolvedAt})=>({screenName,locationName,regionName,countryName,startedAt,lastCheckedAt,resolvedAt}));
  try {if ((await send({kind,recipients,rows:publicRows,generatedAt:now,messageId:id})).partial){status="partial";code="partial";}}
  catch(error) {const failure=error instanceof AlertMailError?error:new AlertMailError("uncertain",true);status=failure.uncertain?"uncertain":"failed";code=failure.code;}
  await client.query("BEGIN");
  try {
    await client.query("UPDATE email_alert_delivery SET status=$2,error_code=$3,finished_at=$4 WHERE id=$1",[id,status,code,now]);
    if (queueIds.length) {
      if(status==="sent"||status==="partial") await client.query("UPDATE email_alert_queue SET status='sent' WHERE delivery_id=$1",[id]);
      else if(status==="uncertain") await client.query("UPDATE email_alert_queue SET status='uncertain' WHERE delivery_id=$1",[id]);
      else await client.query("UPDATE email_alert_queue SET status='pending',retry_at=$2::timestamptz + make_interval(mins=>LEAST(60,CAST(power(2,LEAST(attempts-1,6)) AS integer))) WHERE delivery_id=$1",[id,now]);
    }
    await client.query("COMMIT");
  } catch(error) {await client.query("ROLLBACK");throw error;}
  return {status,code};
}
async function withDeliveryLock<T>(work:(client:PoolClient)=>Promise<T>):Promise<T|null> {
  const client=await getPool().connect();let locked=false;
  try {
    locked=(await client.query("SELECT pg_try_advisory_lock(724020) AS locked")).rows[0].locked;
    if (!locked) return null;
    // A prior sender crashed after claiming a delivery. Do not risk sending it twice.
    await client.query("UPDATE email_alert_delivery SET status='uncertain',error_code='uncertain',finished_at=now() WHERE status='sending'");
    await client.query("UPDATE email_alert_queue SET status='uncertain' WHERE status='sending'");
    return await work(client);
  } finally {
    try {if(locked) await client.query("SELECT pg_advisory_unlock(724020)");} finally {client.release();}
  }
}
export async function processEmailAlerts(options:{now?:Date;send?:Sender}={}) {
  return withDeliveryLock(async client=>{
    const now=options.now||new Date(),send=options.send||sendAlertMail;
    let settings=await settingsFor(client);
    if (!settings.enabled || !settings.recipients.length || !alertSender().configured) return;
    // Pending incidents that recover before delivery are cancelled, with no recovery email.
    await client.query("UPDATE email_alert_queue q SET status='cancelled' FROM preview_incident i WHERE q.incident_id=i.id AND q.status='pending' AND q.kind='unavailable' AND i.resolved_at IS NOT NULL");
    const candidates=(await client.query<IncidentRow>(`${incidentSql} WHERE i.resolved_at IS NULL OR (i.resolution_reason='recovered' AND EXISTS (SELECT 1 FROM email_alert_queue q WHERE q.incident_id=i.id AND q.kind='unavailable' AND q.status='sent'))`)).rows.map(normalized);
    for (const row of candidates) {
      const kind=row.resolvedAt?"recovery":"unavailable";
      if (qualifies(row,kind,settings,now)) await client.query("INSERT INTO email_alert_queue (id,incident_id,kind,queued_at) VALUES ($1,$2,$3,$4) ON CONFLICT (incident_id,kind) DO NOTHING",[crypto.randomUUID(),row.id,kind,now]);
    }
    const byId=new Map(candidates.map(row=>[row.id,row]));
    for (const kind of ["unavailable","recovery"] as const) {
      // Re-read settings before each delivery so edits apply to the next mail.
      settings=await settingsFor(client);
      if (!settings.enabled||!settings.recipients.length) return;
      const pending=(await client.query<{id:string;incident_id:string;queued_at:Date}>("SELECT id,incident_id,queued_at FROM email_alert_queue WHERE status='pending' AND kind=$1 AND (retry_at IS NULL OR retry_at<=$2) ORDER BY queued_at,id",[kind,now])).rows.filter(item=>{
        const row=byId.get(item.incident_id);return row&&qualifies(row,kind,settings,now);
      });
      if (!pending.length||pending[0].queued_at.getTime()+settings.groupingMinutes*60000>now.getTime()) continue;
      const selected=pending.slice(0,500);
      // Reload incident records immediately before sending to exclude newly recovered previews.
      const fresh=(await client.query<IncidentRow>(`${incidentSql} WHERE i.id=ANY($1::text[])`,[selected.map(item=>item.incident_id)])).rows.map(normalized).filter(row=>qualifies(row,kind,settings,now));
      if (!fresh.length) continue;
      const allowed=new Set(fresh.map(row=>row.id));
      await delivery(client,kind,settings.recipients,fresh,selected.filter(item=>allowed.has(item.incident_id)).map(item=>item.id),now,send);
    }
  });
}
export async function sendTestAlert() {
  if (!alertSender().configured) throw new EmailAlertServiceError("Configure the Gmail sender on the server first.");
  const result=await withDeliveryLock(async client=>{
    const settings=await settingsFor(client);
    if (!settings.recipients.length) throw new EmailAlertServiceError("Save at least one recipient before sending a test.");
    const recent=(await client.query("SELECT id FROM email_alert_delivery WHERE kind='test' AND started_at>now()-interval '60 seconds' LIMIT 1")).rowCount;
    if(recent) throw new EmailAlertServiceError("Wait 60 seconds before sending another test email.",429);
    return delivery(client,"test",settings.recipients,[],[],new Date(),sendAlertMail);
  });
  if (!result) throw new EmailAlertServiceError("An email is being sent. Try again shortly.",409);
  if(result.status==="failed"||result.status==="uncertain") throw new EmailAlertServiceError(result.code==="authentication"?"Gmail authentication failed. Check the server credentials.":result.status==="uncertain"?"Delivery could not be confirmed. Check your inbox before resending.":"The test email could not be sent. Check delivery status.",503);
  return result;
}

const shared=globalThis as typeof globalThis & {sephoraEmailAlerts?:{timer?:ReturnType<typeof setTimeout>;error:boolean}};
export function startEmailAlertWorker() {
  if(shared.sephoraEmailAlerts||process.env.EMAIL_ALERT_WORKER_DISABLED==="true") return;
  const service={error:false,timer:undefined as ReturnType<typeof setTimeout>|undefined};shared.sephoraEmailAlerts=service;
  const tick=async()=>{
    try {await processEmailAlerts();service.error=false;}
    catch {if(!service.error) console.error("Email alert worker unavailable");service.error=true;}
    finally {service.timer=setTimeout(tick,10000);service.timer.unref();}
  };
  void tick();
}
