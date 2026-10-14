"use client";
import { useEffect, useRef, useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { deliveryErrorMessages, type EmailAlertSettings, type EmailAlertSnapshot } from "@/lib/email-alert-shared";
import "./email-alert-panel.css";
const thresholds=[10,20,30,60,120,180,300,600,1440];
const time=(value:string)=>new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Dubai",dateStyle:"medium",timeStyle:"short"})+" GST";
export default function EmailAlertPanel() {
  const [data,setData]=useState<EmailAlertSnapshot|null>(null),[draft,setDraft]=useState<EmailAlertSettings|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [custom,setCustom]=useState(false);
  const [historyExpanded,setHistoryExpanded]=useState(false);
  const initialized=useRef(false),mounted=useRef(true),writing=useRef(false),requestVersion=useRef(0);
  useEffect(()=>{
    mounted.current=true;let disposed=false,timer:ReturnType<typeof setTimeout>;
    const load=async()=>{
      const version=requestVersion.current;
      try {
        const response=await clientFetch("/api/email-alerts",{cache:"no-store"});const result=await response.json();
        if(!response.ok)throw new Error(result.error||"Could not load email alert settings.");
        if(!disposed&&mounted.current&&!writing.current&&version===requestVersion.current){setData(result);if(!initialized.current){setError("");setDraft(result.settings);setCustom(!thresholds.includes(result.settings.thresholdMinutes));initialized.current=true;}}
      }catch(cause){if(!disposed&&mounted.current&&!initialized.current)setError(cause instanceof Error?cause.message:"Could not load email alert settings.");}
      finally {if(!disposed&&mounted.current)timer=setTimeout(load,15000);}
    };
    void load();return()=>{disposed=true;mounted.current=false;clearTimeout(timer);};
  },[]);
  const dirty=!!draft&&!!data&&JSON.stringify(draft)!==JSON.stringify(data.settings);
  async function action(test=false) {
    if(!draft||busy)return;
    requestVersion.current++;writing.current=true;setBusy(true);setError("");setMessage("");
    try {
      const response=await clientFetch(test?"/api/email-alerts/test":"/api/email-alerts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(test?{}:draft)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not update email alerts.");
      if(!mounted.current)return;
      if(test){setMessage(result.status==="partial"?"Test sent, but some recipients were rejected. Check delivery status.":"Test email accepted by the mail server. Check your inbox.");}
      else {setData(result);setDraft(result.settings);setCustom(!thresholds.includes(result.settings.thresholdMinutes));setMessage("Email alert settings saved.");}
    }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"Email alert request failed.");}
    finally {writing.current=false;if(mounted.current)setBusy(false);}
  }
  const update=(value:Partial<EmailAlertSettings>)=>{if(draft){setDraft({...draft,...value});setMessage("");}};
  return <section className="adm-panel adm-email-alerts" aria-labelledby="email-alert-title">
    <div className="adm-panel-head"><div><h2 id="email-alert-title"><Mail size={19}/> Email alerts</h2><p>Group previews that remain unavailable into one email.</p></div><span className={`adm-email-sender ${data?.sender.configured?"ready":""}`}>{data?.sender.configured?"Sender configured":"Sender not configured"}</span></div>
    <div className="adm-email-body">
      {error&&<div className="adm-error" role="alert">{error}</div>}{message&&<p className="adm-email-success" role="status">{message}</p>}
      {!draft?<p>Loading email alert settings…</p>:<form className="adm-form" onSubmit={event=>{event.preventDefault();void action();}}>
        <p className="adm-email-from">From: {data?.sender.address||"Configure Gmail on the server"}</p>
        <label className="adm-email-check"><input type="checkbox" checked={draft.enabled} disabled={busy||(!data?.sender.configured&&!draft.enabled)} onChange={event=>update({enabled:event.target.checked})}/> Enable email alerts</label>
        <div className="adm-email-timing">
          <label>Alert after<select aria-label="Alert after" disabled={busy} value={custom?"custom":draft.thresholdMinutes} onChange={event=>{if(event.target.value==="custom")setCustom(true);else{setCustom(false);update({thresholdMinutes:Number(event.target.value)});}}}>{thresholds.map(minutes=><option value={minutes} key={minutes}>{minutes<60?`${minutes} minutes`:`${minutes/60} ${minutes===60?"hour":"hours"}`}</option>)}<option value="custom">Custom duration</option></select>{custom&&<input aria-label="Custom alert duration in minutes" type="number" min={1} max={1440} required disabled={busy} value={Number.isFinite(draft.thresholdMinutes)?draft.thresholdMinutes:""} onChange={event=>update({thresholdMinutes:event.target.valueAsNumber})}/>}</label>
          <label>Combine alerts for<select disabled={busy} value={draft.groupingMinutes} onChange={event=>update({groupingMinutes:Number(event.target.value)})}>{[1,5,10,15,30,60].map(minutes=><option value={minutes} key={minutes}>{minutes} {minutes===1?"minute":"minutes"}</option>)}{![1,5,10,15,30,60].includes(draft.groupingMinutes)&&<option value={draft.groupingMinutes}>{draft.groupingMinutes} minutes</option>}</select></label>
        </div>
        <small className="adm-email-note">Each preview must pass the alert duration first. Grouping adds up to {draft.groupingMinutes} minutes before sending.</small>
        <fieldset className="adm-email-recipients"><legend>Recipients</legend>{draft.recipients.map((email,index)=><div className="adm-email-recipient" key={index}><input type="email" required maxLength={254} aria-label={`Recipient ${index+1}`} placeholder="name@example.com" value={email} disabled={busy} onChange={event=>update({recipients:draft.recipients.map((item,itemIndex)=>itemIndex===index?event.target.value:item)})}/><button type="button" className="adm-secondary-btn" aria-label={`Remove recipient ${index+1}`} disabled={busy} onClick={()=>update({recipients:draft.recipients.filter((_,itemIndex)=>itemIndex!==index)})}><Trash2 size={16}/></button></div>)}<button type="button" className="adm-secondary-btn" disabled={busy||draft.recipients.length>=20} onClick={()=>update({recipients:[...draft.recipients,""]})}><Plus size={16}/> Add recipient</button></fieldset>
        <label className="adm-email-check"><input type="checkbox" checked={draft.recoveryEmail} disabled={busy} onChange={event=>update({recoveryEmail:event.target.checked})}/> Send recovery emails</label>
        <div className="adm-form-actions"><button className="adm-secondary-btn" type="button" disabled={busy||dirty||!data?.sender.configured||!data?.settings.recipients.length} title={dirty?"Save changes before sending a test":"Send to saved recipients"} onClick={()=>void action(true)}>Send test email</button><button className="adm-primary-btn" disabled={busy||!dirty} type="submit">{busy?"Working…":"Save settings"}</button></div>
      </form>}
      {!!data?.deliveries.length&&<div className="adm-email-history"><div className="adm-email-history-heading"><h3>Recent deliveries</h3>{data.deliveries.length>3&&<button type="button" className="adm-secondary-btn" aria-expanded={historyExpanded} aria-controls="email-delivery-list" onClick={()=>setHistoryExpanded(value=>!value)}>{historyExpanded?"Show fewer":"Show recent deliveries"}</button>}</div><div id="email-delivery-list">{data.deliveries.slice(0,historyExpanded?10:3).map(delivery=><div key={delivery.id} className="adm-email-delivery"><div><strong>{delivery.kind==="test"?"Test email":`${delivery.kind==="recovery"?"Recovery":"Unavailable previews"} · ${delivery.screenCount} ${delivery.screenCount===1?"screen":"screens"}`}</strong><small>{time(delivery.startedAt)}</small>{delivery.errorCode&&["failed","uncertain","partial"].includes(delivery.status)&&<details><summary>Delivery details</summary><small>{deliveryErrorMessages[delivery.errorCode]||"Delivery failed. Check the sender configuration."}</small></details>}</div><span data-status={delivery.status}>{delivery.status==="sent"?"Accepted":delivery.status==="uncertain"?"Unconfirmed":delivery.status}</span></div>)}</div></div>}
    </div>
  </section>;
}
