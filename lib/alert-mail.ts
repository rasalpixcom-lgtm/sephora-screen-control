import nodemailer from "nodemailer";
import fs from "node:fs/promises";
import path from "node:path";
import { validEmail } from "./email-alert-shared";
export type AlertMailRow = { screenName:string; locationName:string; regionName:string; countryName:string; startedAt:string; lastCheckedAt:string; resolvedAt:string|null };
export type AlertMail = {kind:"unavailable"|"recovery"|"test"|"manual"; recipients:string[]; rows:AlertMailRow[]; generatedAt:Date; messageId:string};
export type MailResult = {partial:boolean};
export class AlertMailError extends Error { constructor(public code:string,public uncertain=false){super(code);} }
export function alertSender() {
  const address=process.env.ALERT_EMAIL_USER?.trim() || "";
  const password=process.env.ALERT_EMAIL_APP_PASSWORD?.replace(/\s/g,"") || "";
  return {configured:validEmail(address)&&!!password,address:validEmail(address)?address:null};
}
const escapeHtml = (value:string) => value.replace(/[&<>"']/g, character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
const time = (value:string) => new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Dubai",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});
export function alertMailContent(mail:AlertMail, includeLogo=true) {
  const title=mail.kind==="test" ? "Email alerts test" : mail.kind==="recovery" ? "Preview recovered" : mail.kind==="manual" ? "Current unavailable previews — Manual report" : "Preview unavailable";
  const subject=`Sephora Screen Control — ${title}${mail.kind==="test" ? "" : ` (${mail.rows.length} ${mail.rows.length===1?"screen":"screens"})`}`;
  const detail=mail.kind==="test" ? "Your email alert connection is working. This is a test message." : "Preview status reports image delivery; it does not confirm physical player connectivity.";
  const heading=mail.kind==="test"?title:`${title} · ${mail.rows.length} ${mail.rows.length===1?"screen":"screens"}`;
  const accent=mail.kind==="unavailable"||mail.kind==="manual"?"#b44759":"#208766";
  const rows=[...mail.rows].sort((a,b)=>{
    const duration=(row:AlertMailRow)=>(row.resolvedAt?Date.parse(row.resolvedAt):mail.generatedAt.getTime())-Date.parse(row.startedAt);
    return duration(b)-duration(a)||a.screenName.localeCompare(b.screenName);
  });
  const cells=rows.map(row=>{
    const end=row.resolvedAt ? Date.parse(row.resolvedAt) : mail.generatedAt.getTime();
    const minutes=Math.max(0,Math.floor((end-Date.parse(row.startedAt))/60000));
    return [row.screenName,[row.locationName,row.regionName,row.countryName].join(" / "),minutes<60?`${minutes}m`:`${Math.floor(minutes/60)}h ${minutes%60}m`,time(row.startedAt),time(row.lastCheckedAt),...(mail.kind==="recovery"&&row.resolvedAt?[time(row.resolvedAt)]:[])];
  });
  const text=[heading,`Generated ${time(mail.generatedAt.toISOString())}`,"All times GST (UTC+4)",...(mail.kind==="test"?[detail]:[]),...cells.map(row=>`${row[0]}\n${row[1]}\n${mail.kind==="recovery"?"Outage lasted":"Unavailable for"}: ${row[2]}\nSince: ${row[3]}\nLast check: ${row[4]}${row[5]?`\nRecovered: ${row[5]}`:""}`),...(mail.kind!=="test"?[detail]:[])].join("\n\n");
  const cellStyle="padding:16px 12px;border-bottom:1px solid #e1e8e4;vertical-align:top;overflow-wrap:anywhere;word-break:break-word";
  const table=cells.length?`<table class="alert-table" role="table" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:14px;line-height:1.5"><thead><tr><th scope="col" style="padding:12px;text-align:left;background:#edf4f0;width:40%">Screen / location</th><th scope="col" style="padding:12px;text-align:left;background:#edf4f0;width:20%">${mail.kind==="recovery"?"Outage duration":"Unavailable for"}</th><th scope="col" style="padding:12px;text-align:left;background:#edf4f0;width:40%">Details</th></tr></thead><tbody>${cells.map(row=>`<tr><td style="${cellStyle}"><strong>${escapeHtml(row[0])}</strong><div style="margin-top:5px;color:#65776d;font-size:12px">${escapeHtml(row[1])}</div></td><td style="${cellStyle};font-weight:bold;color:${accent}"><span class="mobile-duration-label" style="display:none">${mail.kind==="recovery"?"Outage lasted: ":"Unavailable for: "}</span>${escapeHtml(row[2])}</td><td style="${cellStyle};font-size:12px;color:#65776d"><div><strong>Since</strong><br>${escapeHtml(row[3])}</div><div style="margin-top:7px"><strong>Last check</strong><br>${escapeHtml(row[4])}</div>${row[5]?`<div style="margin-top:7px;color:#208766"><strong>Recovered</strong><br>${escapeHtml(row[5])}</div>`:""}</td></tr>`).join("")}</tbody></table>`:"";
  return {subject,text,html:`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>@media(max-width:480px){.alert-table thead{display:none!important}.alert-table tbody tr{display:block!important;border-bottom:1px solid #e1e8e4}.alert-table tbody td{display:block!important;width:auto!important;border-bottom:0!important;padding:8px 12px!important}.alert-table tbody td:first-child{padding-top:16px!important}.alert-table tbody td:last-child{padding-bottom:16px!important}.mobile-duration-label{display:inline!important}}</style></head><body style="margin:0;padding:16px;background:#f4f7f5"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:720px;margin:auto;border-collapse:collapse;font-family:Arial,sans-serif;color:#1d3028;background:#ffffff"><tr><td style="padding:16px 20px;border-top:4px solid ${accent}"><table role="presentation" style="width:100%;border-collapse:collapse"><tr><td style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#65776d">SEPHORA SCREEN CONTROL</td>${includeLogo?'<td style="width:96px;text-align:right"><img src="cid:pixcom-alert-logo" width="96" height="96" alt="PIXCOM" style="display:block;border:0"></td>':""}</tr></table><h1 style="font-size:23px;line-height:1.35;margin:8px 0 12px;color:${accent}">${heading}</h1><p style="font-size:12px;line-height:1.6;color:#65776d;margin:0">Generated ${time(mail.generatedAt.toISOString())}<br>All times GST (UTC+4)</p>${mail.kind==="test"?`<p style="font-size:14px;line-height:1.6;margin:20px 0 0">${escapeHtml(detail)}</p>`:""}</td></tr>${table?`<tr><td style="padding:0 8px 16px">${table}</td></tr>`:""}${mail.kind!=="test"?`<tr><td style="padding:16px 20px;font-size:11px;line-height:1.6;color:#65776d;border-top:1px solid #e1e8e4">${escapeHtml(detail)}</td></tr>`:""}</table></body></html>`};
}
export async function sendAlertMail(mail:AlertMail):Promise<MailResult> {
  const sender=alertSender();
  if (!sender.configured || !sender.address) throw new AlertMailError("configuration");
  // Embed the existing brand asset as bytes; no external image request or file URL.
  const logo=await fs.readFile(path.join(process.cwd(),"public","images","pixcom-report-logo.png")).catch(()=>null);
  // Plain SMTP is permitted only for the explicitly configured loopback test receiver.
  const testHost=process.env.ALERT_SMTP_TEST_HOST;
  const localTest=testHost==="127.0.0.1" && process.env.ALERT_SMTP_TEST_PORT;
  const port=localTest?Number(process.env.ALERT_SMTP_TEST_PORT):465;
  if (!Number.isInteger(port)||port<1||port>65535) throw new AlertMailError("configuration");
  const transport=nodemailer.createTransport({host:localTest?"127.0.0.1":"smtp.gmail.com",port,secure:!localTest,
    auth:localTest?undefined:{user:sender.address,pass:process.env.ALERT_EMAIL_APP_PASSWORD!.replace(/\s/g,"")},
    connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
  try {
    const result=await transport.sendMail({from:{name:"Sephora Screen Control",address:sender.address},to:sender.address,bcc:mail.recipients,
      envelope:{from:sender.address,to:mail.recipients},messageId:`<${mail.messageId}@sephora-alerts.local>`,...alertMailContent(mail,!!logo),
      ...(logo?{attachments:[{filename:"pixcom.png",content:logo,contentType:"image/png",cid:"pixcom-alert-logo",contentDisposition:"inline" as const}]}:{})});
    return {partial:!!result.rejected?.length};
  } catch (cause) {
    const error=cause as {code?:string;command?:string;responseCode?:number;syscall?:string};
    const knownFailure=!!error.responseCode||error.code==="EAUTH"||error.code==="EDNS"||error.syscall==="connect";
    const uncertain=!knownFailure;
    throw new AlertMailError(uncertain?"uncertain":error.code==="EAUTH"?"authentication":error.responseCode?"rejected":"connection",uncertain);
  } finally {transport.close();}
}
