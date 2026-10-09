"use client";
import { useEffect, useRef, useState } from "react";
import { Activity as ActivityIcon, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import type { Activity } from "@/lib/store";
type Filters = {q:string; action:string; from:string; to:string};
type Page = {entries:Activity[]; total:number; page:number; pages:number; pageSize:number};
const initial:Filters = {q:"",action:"all",from:"",to:""};
export default function ActivityPanel({refreshKey = 0}:{refreshKey?:number}) {
  const [draft,setDraft] = useState(initial), [filters,setFilters] = useState(initial);
  const [page,setPage] = useState(1), [data,setData] = useState<Page | null>(null);
  const [loading,setLoading] = useState(true), [error,setError] = useState("");
  const [retry,setRetry] = useState(0);
  const sequence = useRef(0), previousRefresh = useRef(refreshKey);
  const panel = useRef<HTMLElement>(null);
  function navigatePage(nextPage:number) {
    setPage(nextPage);
    panel.current?.scrollIntoView({block:"start",behavior:"smooth"});
  }
  useEffect(() => {
    const requestId = ++sequence.current;
    let active = true;
    const refreshed = previousRefresh.current !== refreshKey;
    previousRefresh.current = refreshKey;
    const requestedPage = refreshed ? 1 : page;
    const params = new URLSearchParams({...filters,page:String(requestedPage)});
    void Promise.resolve().then(async () => {
      if (!active) return;
      setLoading(true); setError("");
      try {
        const response = await clientFetch("/api/activity?"+params, {cache:"no-store"});
        if (!active || requestId !== sequence.current) return;
        if (response.status === 401) { window.location.replace("/login?next=/admin/activity"); return; }
        const result = await response.json() as Page & {error?:string};
        if (!active || requestId !== sequence.current) return;
        if (!response.ok) throw new Error(result.error || "Could not load activity.");
        setData(result); setPage(result.page);
      } catch (cause) { if (active && requestId === sequence.current) setError(cause instanceof Error ? cause.message : "Could not load activity."); }
      finally { if (active && requestId === sequence.current) setLoading(false); }
    });
    return () => { active = false; };
  }, [filters,page,refreshKey,retry]);
  const filtered = !!filters.q || filters.action !== "all" || !!filters.from || !!filters.to;
  const invalidDates = !!draft.from && !!draft.to && draft.from > draft.to;
  return <section ref={panel} className="adm-panel adm-activity-panel" aria-label="Activity history">
    <form className="adm-activity-filters" onSubmit={event => {event.preventDefault(); if (!invalidDates) {setFilters({...draft});setPage(1);} }}>
      <label className="adm-activity-search">Search<div className="adm-search"><Search size={17}/><input aria-label="Search activity" placeholder="Search item or user" maxLength={120} value={draft.q} onChange={event=>setDraft({...draft,q:event.target.value})}/></div></label>
      <label>Action<select value={draft.action} onChange={event=>setDraft({...draft,action:event.target.value})}><option value="all">All actions</option><option value="created">Created</option><option value="updated">Updated</option><option value="deleted">Deleted</option><option value="wall">Wall changes</option><option value="other">Other actions</option></select></label>
      <label>From (GST)<input type="date" min="1970-01-01" max="9998-12-31" value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
      <label>To (GST)<input type="date" min="1970-01-01" max="9998-12-31" value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
      <div className="adm-activity-filter-actions"><button className="adm-primary-btn" disabled={loading || invalidDates}>Apply</button><button type="button" className="adm-secondary-btn" disabled={loading} onClick={()=>{setDraft(initial);setFilters(initial);setPage(1);}}>Clear</button></div>
      {invalidDates && <p className="adm-activity-date-error" role="alert">The end date must be on or after the start date.</p>}
    </form>
    <div className="adm-activity-meta"><span>Newest first</span><span>Times shown in GST (UTC+4)</span></div>
    {error && <div className="adm-error" role="alert"><span>{error}</span><button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>}
    <div className="adm-activity-list" aria-busy={loading}>
      {loading ? <div className="adm-empty" role="status">Loading activity…</div> : !error && data?.entries.map(entry=><div key={entry.id}><span className="adm-activity-icon"><ActivityIcon size={17}/></span><div><strong>{entry.action.charAt(0).toUpperCase()+entry.action.slice(1)}</strong>{entry.entityName && <span className="adm-activity-detail">{entry.entityName}</span>}<small>{entry.actor}</small></div><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Dubai"})}</time></div>)}
      {!loading && !error && !data?.entries.length && <div className="adm-empty">{filtered ? "No activity matches these filters." : "Changes will appear here after the first edit."}</div>}
    </div>
    <footer className="adm-activity-pagination"><span aria-live="polite">{loading ? "Loading…" : error ? "Activity unavailable" : data?.total ? `Showing ${(data.page-1)*data.pageSize+1}–${Math.min(data.page*data.pageSize,data.total)} of ${data.total}` : "0 records"}</span><nav aria-label="Activity pages"><button className="adm-secondary-btn" disabled={loading || !!error || !data || data.page<=1} onClick={()=>navigatePage((data?.page || 1)-1)}><ChevronLeft size={16}/> Previous</button><span>{data ? `${data.page} / ${data.pages}` : "1 / 1"}</span><button className="adm-secondary-btn" disabled={loading || !!error || !data || data.page>=data.pages} onClick={()=>navigatePage((data?.page || 1)+1)}>Next <ChevronRight size={16}/></button></nav></footer>
  </section>;
}
