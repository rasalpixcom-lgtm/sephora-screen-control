"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import type { Entity } from "@/lib/store";
import { clientFetch } from "@/lib/client-fetch";
import LocationPicker from "@/components/location-picker";
import { validLocationFilters } from "@/lib/location-filters";
import { REPORT_DURATION_OPTIONS, type PreviewReportRow } from "@/lib/preview-report-shared";

type Filters = { duration:string; countryId:string; regionId:string; locationId:string; q:string };
type Page = { entries:PreviewReportRow[]; total:number; page:number; pages:number; pageSize:number; generatedAt:string; truncated:boolean };
const initial:Filters = {duration:"all",countryId:"",regionId:"",locationId:"",q:""};
const GST = {timeZone:"Asia/Dubai",dateStyle:"medium",timeStyle:"short"} as const;

function duration(start:string,end:string) {
  const minutes = Math.max(0,Math.floor((Date.parse(end)-Date.parse(start))/60000));
  const days = Math.floor(minutes/1440), hours = Math.floor((minutes%1440)/60), mins = minutes%60;
  return [days?`${days}d`:"",hours?`${hours}h`:"",`${mins}m`].filter(Boolean).join(" ");
}
function time(value:string | null) { return value ? new Date(value).toLocaleString("en-GB",GST) : "No successful preview recorded"; }
function queryParams(value:Filters,page:number) { return new URLSearchParams({...value,page:String(page)}); }

export default function PreviewReportsPanel({entities,refreshKey=0}:{entities:Entity[];refreshKey?:number}) {
  const [draft,setDraft] = useState(initial), [filters,setFilters] = useState(initial);
  const [page,setPage] = useState(1), [data,setData] = useState<Page|null>(null);
  const [dataQuery,setDataQuery] = useState("");
  const [loading,setLoading] = useState(true), [downloading,setDownloading] = useState(false), [error,setError] = useState("");
  const [downloadError,setDownloadError] = useState("");
  const [retry,setRetry] = useState(0), [clock,setClock] = useState(0);
  const sequence = useRef(0), panel = useRef<HTMLElement>(null);
  useEffect(()=>{
    let active=true;
    const reconcile=(value:Filters) => {
      const valid=validLocationFilters(entities,{country:value.countryId,region:value.regionId,location:value.locationId});
      return valid.country===value.countryId&&valid.region===value.regionId&&valid.location===value.locationId?value:{...value,countryId:valid.country,regionId:valid.region,locationId:valid.location};
    };
    void Promise.resolve().then(()=>{if(active){setDraft(reconcile);setFilters(reconcile);}});
    return()=>{active=false;};
  },[entities]);
  useEffect(() => { const timer=setInterval(()=>setClock(value=>value+1),60000); return ()=>clearInterval(timer); },[]);
  useEffect(()=>{
    if(draft.q===filters.q) return;
    const timer=setTimeout(()=>{
      setFilters(value=>value.q===draft.q?value:{...value,q:draft.q});
      setPage(1);
    },300);
    return()=>clearTimeout(timer);
  },[draft.q,filters.q]);
  function changeDropdown(patch:Partial<Filters>) {
    setDraft(value=>({...value,...patch}));
    setFilters(value=>({...value,...patch}));
    setPage(1);
  }
  const countries = useMemo(()=>entities.filter(item=>item.type==="country").sort((a,b)=>a.name.localeCompare(b.name)),[entities]);
  const regions = useMemo(()=>entities.filter(item=>item.type==="region"&&(!draft.countryId||item.parentId===draft.countryId)).sort((a,b)=>a.name.localeCompare(b.name)),[entities,draft.countryId]);
  const locations = useMemo(()=>entities.filter(item=>item.type==="store"&&(!draft.regionId||item.parentId===draft.regionId)).sort((a,b)=>a.name.localeCompare(b.name)),[entities,draft.regionId]);
  useEffect(()=>{
    const id=++sequence.current; let active=true;
    void Promise.resolve().then(async()=>{
      if(!active||id!==sequence.current) return;
      setLoading(true); setError("");
      try {
        const response=await clientFetch("/api/reports/preview?"+queryParams(filters,page),{cache:"no-store"});
        if (!active||id!==sequence.current) return;
        if (response.status===401) { window.location.replace("/login?next=/admin/reports"); return; }
        const result=await response.json() as Page&{error?:string};
        if (!active||id!==sequence.current) return;
        if (!response.ok) throw new Error(result.error||"Could not load the report.");
        setData(result); setDataQuery(queryParams(filters,result.page).toString()); setPage(result.page);
      } catch(cause) { if(active&&id===sequence.current) setError(cause instanceof Error?cause.message:"Could not load the report."); }
      finally { if(active&&id===sequence.current) setLoading(false); }
    });
    return()=>{active=false;};
  // clock deliberately refreshes current incidents once per minute.
  },[filters,page,refreshKey,retry,clock]);
  function navigate(next:number) { setPage(next); panel.current?.scrollIntoView({block:"start",behavior:"smooth"}); }
  async function download() {
    setDownloading(true); setDownloadError("");
    try {
      const response=await fetch("/api/reports/preview/pdf?"+queryParams(filters,1),{cache:"no-store",signal:AbortSignal.timeout(60000)});
      if(response.status===401){window.location.replace("/login?next=/admin/reports");return;}
      if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||"Could not create the PDF.");}
      const url=URL.createObjectURL(await response.blob());
      const link=document.createElement("a"); link.href=url; link.download=response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]||"preview-availability.pdf";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(cause) { setDownloadError(cause instanceof Error?cause.message:"Could not create the PDF."); }
    finally { setDownloading(false); }
  }
  const filtered=filters.duration!==initial.duration||!!filters.countryId||!!filters.regionId||!!filters.locationId||!!filters.q;
  const busy=loading||draft.q!==filters.q||dataQuery!==queryParams(filters,page).toString();
  return <section ref={panel} className="adm-panel adm-report-panel" aria-label="Preview availability report">
    <div className="adm-report-intro"><div><h2>Unavailable previews</h2></div><button className="adm-primary-btn" disabled={busy||downloading||!!error||!data} onClick={()=>void download()}><Download size={16}/>{downloading?"Creating PDF...":"Download PDF"}</button></div>
    <form className="adm-report-filters" onSubmit={event=>event.preventDefault()}>
      <label className="adm-report-duration">Unavailable for<select value={draft.duration} onChange={event=>changeDropdown({duration:event.target.value})}>{REPORT_DURATION_OPTIONS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <LocationPicker label="Country" value={draft.countryId} placeholder="All countries" options={[{id:"",name:"All countries"},...countries]} onChange={countryId=>changeDropdown({countryId,regionId:"",locationId:""})}/>
      <LocationPicker label="Region" value={draft.regionId} placeholder="All regions" disabled={!draft.countryId} options={[{id:"",name:"All regions"},...regions]} onChange={regionId=>changeDropdown({regionId,locationId:""})}/>
      <LocationPicker label="Location" value={draft.locationId} placeholder="All locations" disabled={!draft.regionId} options={[{id:"",name:"All locations"},...locations]} onChange={locationId=>changeDropdown({locationId})}/>
      <label className="adm-report-search">Search<div className="adm-search"><Search size={17}/><input maxLength={120} value={draft.q} onChange={event=>setDraft({...draft,q:event.target.value})} placeholder="Screen or location"/></div></label>
      <div className="adm-report-filter-actions"><button type="button" className="adm-secondary-btn" onClick={()=>{setDraft(initial);setFilters(initial);setPage(1);}}>Clear filters</button></div>
    </form>
    {error&&<div className="adm-error" role="alert"><span>{error}</span><button onClick={()=>setRetry(value=>value+1)}>Retry</button></div>}
    {downloadError&&<div className="adm-error" role="alert">{downloadError}</div>}
    <div className="adm-report-meta"><strong>{error?"Report unavailable":busy?"Checking...":`${data?.total||0} ${data?.total===1?"screen":"screens"}`}</strong><span>Longest unavailable first · Times shown in GST (UTC+4)</span></div>
    <div className="adm-table-wrap" aria-busy={busy}><table className="adm-table adm-report-table"><thead><tr><th>Screen</th><th>Location</th><th>Unavailable duration</th><th>Last check</th></tr></thead><tbody>{!error&&data?.entries.map(row=>{
      const delayed=Date.parse(data.generatedAt)-Date.parse(row.lastCheckedAt)>5*60000;
      return <tr key={row.incidentId}><td><strong>{row.screenName}</strong>{delayed&&<small className="adm-report-delayed">Verification delayed</small>}</td><td>{row.locationName}<small>{row.regionName} · {row.countryName}</small></td><td><strong className="adm-report-duration-value">{duration(row.unavailableSince,data.generatedAt)}</strong><small>Since {time(row.unavailableSince)}</small></td><td>{time(row.lastCheckedAt)}</td></tr>;
    })}</tbody></table>{busy&&!data&&<div className="adm-empty" role="status">Loading report...</div>}{!error&&data&&!data.entries.length&&<div className="adm-empty">{busy?"Updating report...":filtered?"No screens match these filters.":"No previews have been unavailable for 20 minutes."}</div>}</div>
    <footer className="adm-activity-pagination"><span aria-live="polite">{!busy&&!error&&data?.total?`Showing ${(data.page-1)*data.pageSize+1}-${Math.min(data.page*data.pageSize,data.total)} of ${data.total}`:""}</span><nav aria-label="Report pages"><button className="adm-secondary-btn" disabled={busy||!!error||!data||data.page<=1} onClick={()=>navigate((data?.page||1)-1)}><ChevronLeft size={16}/> Previous</button><span>{data?`${data.page} / ${data.pages}`:"1 / 1"}</span><button className="adm-secondary-btn" disabled={busy||!!error||!data||data.page>=data.pages} onClick={()=>navigate((data?.page||1)+1)}>Next <ChevronRight size={16}/></button></nav></footer>
  </section>;
}
