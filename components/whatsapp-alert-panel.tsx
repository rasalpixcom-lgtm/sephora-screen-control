"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Plus, Trash2 } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { whatsappErrorMessages, WHATSAPP_REPORT_MAX_SCREENS, type WhatsAppAlertSettings, type WhatsAppAlertSnapshot, type WhatsAppAlertPreview } from "@/lib/whatsapp-alert-shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./email-alert-panel.css";
const thresholds=[10,20,30,60,120,180,300,600,1440];
const time=(value:string)=>new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Dubai",dateStyle:"medium",timeStyle:"short"})+" GST";
export default function WhatsAppAlertPanel() {
  const [data,setData]=useState<WhatsAppAlertSnapshot|null>(null),[draft,setDraft]=useState<WhatsAppAlertSettings|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [custom,setCustom]=useState(false);
  const [historyExpanded,setHistoryExpanded]=useState(false);
  const [manual,setManual]=useState<WhatsAppAlertPreview|null>(null);
  const initialized=useRef(false),mounted=useRef(true),writing=useRef(false),requestVersion=useRef(0);
  useEffect(()=>{
    mounted.current=true;let disposed=false,timer:ReturnType<typeof setTimeout>;
    const load=async()=>{
      const version=requestVersion.current;
      try {
        const response=await clientFetch("/api/whatsapp-alerts",{cache:"no-store"});const result=await response.json();
        if(!response.ok)throw new Error(result.error||"Could not load WhatsApp alert settings.");
        if(!disposed&&mounted.current&&!writing.current&&version===requestVersion.current){setData(result);if(!initialized.current){setError("");setDraft(result.settings);setCustom(!thresholds.includes(result.settings.thresholdMinutes));initialized.current=true;}}
      }catch(cause){if(!disposed&&mounted.current&&!initialized.current)setError(cause instanceof Error?cause.message:"Could not load WhatsApp alert settings.");}
      finally {if(!disposed&&mounted.current)timer=setTimeout(load,15000);}
    };
    void load();return()=>{disposed=true;mounted.current=false;clearTimeout(timer);};
  },[]);
  const dirty=!!draft&&!!data&&JSON.stringify(draft)!==JSON.stringify(data.settings);
  async function action(test=false) {
    if(!draft||busy||writing.current)return;
    requestVersion.current++;writing.current=true;setBusy(true);setError("");setMessage("");
    try {
      const response=await clientFetch(test?"/api/whatsapp-alerts/test":"/api/whatsapp-alerts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(test?{}:draft)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not update WhatsApp alerts.");
      if(!mounted.current)return;
      if(test){setMessage(`Test PDF queued for ${result.recipientCount} saved ${result.recipientCount===1?"number":"numbers"}. Check delivery status and WhatsApp.`);
        try{const snapshot=await clientFetch("/api/whatsapp-alerts",{cache:"no-store"});if(snapshot.ok&&mounted.current)setData(await snapshot.json());}catch{/* Polling refreshes delivery status. */}
      }
      else {setData(result);setDraft(result.settings);setCustom(!thresholds.includes(result.settings.thresholdMinutes));setMessage("WhatsApp alert settings saved.");}
    }catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:"WhatsApp alert request failed.");}
    finally {writing.current=false;if(mounted.current)setBusy(false);}
  }
  const update=(value:Partial<WhatsAppAlertSettings>)=>{if(draft){setDraft({...draft,...value});setMessage("");}};
  async function manualAction(send=false){
    if(writing.current||busy||dirty)return;
    if(send&&!manual)return;
    writing.current=true;requestVersion.current++;setBusy(true);setError("");setMessage("");
    try{
      const response=await clientFetch("/api/whatsapp-alerts/manual",send?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirmationToken:manual!.confirmationToken})}:{cache:"no-store"});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not send current alerts.");
      if(!mounted.current)return;
      if(!send)setManual(result);
      else{
        setManual(null);setMessage(`Manual PDF report for ${result.screenCount} ${result.screenCount===1?"screen":"screens"} queued for ${result.recipientCount} saved ${result.recipientCount===1?"number":"numbers"}. Check delivery status and WhatsApp.`);
        try{const snapshot=await clientFetch("/api/whatsapp-alerts",{cache:"no-store"});if(snapshot.ok&&mounted.current)setData(await snapshot.json());}catch{/* The normal poll refreshes delivery history if this refresh fails. */}
      }
    }catch(cause){if(mounted.current){setManual(null);setError(cause instanceof Error?cause.message:"Manual report request failed.");}}
    finally{writing.current=false;if(mounted.current)setBusy(false);}
  }
  return <section className="adm-panel adm-email-alerts adm-whatsapp-alerts" aria-labelledby="whatsapp-alert-title">
    <div className="adm-panel-head"><div><h2 id="whatsapp-alert-title"><MessageCircle size={19}/> WhatsApp alerts</h2><p>Receive grouped PDF reports for unavailable previews.</p></div><span className={`adm-email-sender ${data?.sender.configured?"ready":""}`}>{data?.sender.configured?"API configured":"API not configured"}</span></div>
    <div className="adm-email-body">
      {error&&<div className="adm-error" role="alert">{error}</div>}{message&&<p className="adm-email-success" role="status">{message}</p>}
      {!draft?<p>Loading WhatsApp alert settings…</p>:<form className="adm-form" onSubmit={event=>{event.preventDefault();void action();}}>
        <p className="adm-email-from">UltraMsg instance: {data?.sender.instance||"Configure UltraMsg on the server"}</p>
        <label className="adm-email-check"><input type="checkbox" checked={draft.enabled} disabled={busy||(!data?.sender.configured&&!draft.enabled)} onChange={event=>update({enabled:event.target.checked})}/> Enable WhatsApp alerts</label>
        <div className="adm-email-timing">
          <label>Alert after<select aria-label="Alert after" disabled={busy} value={custom?"custom":draft.thresholdMinutes} onChange={event=>{if(event.target.value==="custom")setCustom(true);else{setCustom(false);update({thresholdMinutes:Number(event.target.value)});}}}>{thresholds.map(minutes=><option value={minutes} key={minutes}>{minutes<60?`${minutes} minutes`:`${minutes/60} ${minutes===60?"hour":"hours"}`}</option>)}<option value="custom">Custom duration</option></select>{custom&&<input aria-label="Custom alert duration in minutes" type="number" min={1} max={1440} required disabled={busy} value={Number.isFinite(draft.thresholdMinutes)?draft.thresholdMinutes:""} onChange={event=>update({thresholdMinutes:event.target.valueAsNumber})}/>}</label>
          <label>Combine alerts for<select disabled={busy} value={draft.groupingMinutes} onChange={event=>update({groupingMinutes:Number(event.target.value)})}>{[1,5,10,15,30,60].map(minutes=><option value={minutes} key={minutes}>{minutes} {minutes===1?"minute":"minutes"}</option>)}{![1,5,10,15,30,60].includes(draft.groupingMinutes)&&<option value={draft.groupingMinutes}>{draft.groupingMinutes} minutes</option>}</select></label>
        </div>
        <small className="adm-email-note">Each preview must pass the alert duration first. Grouping adds up to {draft.groupingMinutes} {draft.groupingMinutes===1?"minute":"minutes"} before sending.</small>
        <fieldset className="adm-email-recipients"><legend>WhatsApp numbers</legend>{draft.recipients.map((number,index)=><div className="adm-email-recipient" key={index}><input type="tel" required maxLength={40} aria-label={`Recipient ${index+1}`} placeholder="+971501234567" value={number} autoComplete="tel" disabled={busy} onChange={event=>update({recipients:draft.recipients.map((item,itemIndex)=>itemIndex===index?event.target.value:item)})}/><button type="button" className="adm-secondary-btn" aria-label={`Remove recipient ${index+1}`} disabled={busy} onClick={()=>update({recipients:draft.recipients.filter((_,itemIndex)=>itemIndex!==index)})}><Trash2 size={16}/></button></div>)}<button type="button" className="adm-secondary-btn" disabled={busy||draft.recipients.length>=20} onClick={()=>update({recipients:[...draft.recipients,""]})}><Plus size={16}/> Add recipient</button></fieldset>
        <small className="adm-email-note">Use individual numbers with a country code, such as +971501234567. Accepted / queued means UltraMsg accepted the message; confirm receipt in WhatsApp.</small>
        <label className="adm-email-check"><input type="checkbox" checked={draft.recoveryEmail} disabled={busy} onChange={event=>update({recoveryEmail:event.target.checked})}/> Send recovery messages</label><small className="adm-email-note">Unavailable-preview alerts and manual reports include a PDF. Recovery updates are sent as text.</small>
        <div className="adm-form-actions"><button className="adm-secondary-btn" type="button" disabled={busy||dirty||!data?.sender.configured||!data?.settings.recipients.length} title={dirty?"Save changes before sending":"Review current issues and send to saved recipients"} onClick={()=>void manualAction()}>Send current alerts now</button><button className="adm-secondary-btn" type="button" disabled={busy||dirty||!data?.sender.configured||!data?.settings.recipients.length} title={dirty?"Save changes before sending a test":"Send to saved recipients"} onClick={()=>void action(true)}>Send test PDF</button><button className="adm-primary-btn" disabled={busy||!dirty} type="submit">{busy?"Working…":"Save settings"}</button></div>
      </form>}
      {!!data?.deliveries.length&&<div className="adm-email-history"><div className="adm-email-history-heading"><h3>Recent deliveries</h3>{data.deliveries.length>3&&<button type="button" className="adm-secondary-btn" aria-expanded={historyExpanded} aria-controls="whatsapp-delivery-list" onClick={()=>setHistoryExpanded(value=>!value)}>{historyExpanded?"Show fewer":"Show recent deliveries"}</button>}</div><div id="whatsapp-delivery-list">{data.deliveries.slice(0,historyExpanded?10:3).map(delivery=><div key={delivery.id} className="adm-email-delivery"><div><strong>{delivery.kind==="test"?"Test PDF":`${delivery.kind==="recovery"?"Recovery":delivery.kind==="manual"?"Manual report":"Unavailable previews"} · ${delivery.screenCount} ${delivery.screenCount===1?"screen":"screens"}`}</strong><small>{time(delivery.startedAt)} · {delivery.recipient}</small>{delivery.errorCode&&["failed","uncertain"].includes(delivery.status)&&<details><summary>Delivery details</summary><small>{whatsappErrorMessages[delivery.errorCode]||"Delivery failed. Check the sender configuration."}</small></details>}</div><span data-status={delivery.status}>{({accepted:"Accepted / queued",pending:"Waiting to send",sending:"Sending",failed:"Failed",uncertain:"Unconfirmed",cancelled:"Cancelled"} as Record<string,string>)[delivery.status]||delivery.status}</span></div>)}</div></div>}
    </div>
    <Dialog open={!!manual} onOpenChange={open=>{if(!open&&!busy)setManual(null);}}><DialogContent className="adm-dialog" showCloseButton={!busy}><DialogHeader><DialogTitle>Send current alerts now?</DialogTitle><DialogDescription>{manual?.screenCount?`Send ${manual.screenCount} currently unavailable ${manual.screenCount===1?"screen":"screens"} to ${manual.recipientCount} saved ${manual.recipientCount===1?"recipient":"recipients"}? This queues a PDF report now without waiting for the alert duration or changing automatic alerts.`:"There are no current confirmed unavailable previews to send."}</DialogDescription></DialogHeader><p className="adm-email-note">Missing links, unsupported previews and stale checks are excluded. Manual PDF reports can be sent once per minute, with up to 5,000 screens per report.</p><div className="adm-form-actions"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={()=>setManual(null)}>Cancel</button><button type="button" className="adm-primary-btn" disabled={busy||!manual?.screenCount||manual.screenCount>WHATSAPP_REPORT_MAX_SCREENS} onClick={()=>void manualAction(true)}>{busy?"Sending…":"Send now"}</button></div>{!!manual&&manual.screenCount>WHATSAPP_REPORT_MAX_SCREENS&&<p role="alert">This report exceeds 5,000 screens. Narrow the report in Reports instead.</p>}</DialogContent></Dialog>
  </section>;
}
