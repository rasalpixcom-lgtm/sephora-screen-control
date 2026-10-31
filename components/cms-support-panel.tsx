"use client";
/* eslint-disable @next/next/no-img-element -- Private authenticated images and local previews bypass the public optimizer. */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Plus, RefreshCw } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { cmsEmptyDetails, cmsImageMime, cmsScreenLimit, cmsStatuses, cmsTime, type CmsDetails, type CmsPayload, type CmsRecord, type CmsScreen, type CmsStatusKind } from "@/lib/cms-support";
import type { Entity, Member } from "@/lib/store";
import { cmsAdditionalScreens, cmsScreenOptions, cmsResultScreens, cmsVisibleMarkedIds } from "@/lib/cms-screen-selection";
import "./cms-support.css";

type Summary = { id: string; contentName: string; campaignName: string; category: string; playbackStart: string; playbackEnd: string; screens: number; scheduled: number; reports: number };
const blank = (): CmsPayload => ({ ...cmsEmptyDetails, screens: [] });
const blankBulk = () => ({ network: "", scheduling: "", playback: "", checkedAt: "" });
const localTime = (value: string) => value ? new Date(new Date(value).getTime() + 4 * 3600000).toISOString().slice(0, 16) : "";
const isoTime = (value: string) => value ? new Date(value + ":00+04:00").toISOString() : "";
async function json(url: string, options?: RequestInit) {
  const response = await clientFetch(url, options);
  if (response.status === 401) { window.location.replace("/login"); throw new Error("Sign in again."); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}
function ContentVideo({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="cms-video"><video controls playsInline preload="none" src={url} onError={() => setFailed(true)} aria-label="Content video preview"/>{failed && <p className="cms-hint" role="status">Video unavailable. The link may have expired or may not support embedded playback.</p>}<a href={url} target="_blank" rel="noopener noreferrer" className="cms-video-link">Open video</a></div>;
}
function ImagePreview({ file, source }: { file: File | null; source: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setUrl(reader.result); };
    reader.readAsDataURL(file);
    return () => { reader.onload = null; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, [file]);
  return (file ? url : source) ? <img className="cms-image" src={file ? url : source} alt="Content reference"/> : null;
}
export default function CmsSupportPanel({ entities, members, refreshKey }: { entities: Entity[]; members: Member[]; refreshKey: number }) {
  const [updates, setUpdates] = useState<Summary[]>([]), [total, setTotal] = useState(0), [countries, setCountries] = useState<string[]>([]), [locations, setLocations] = useState<string[]>([]);
  const [filters, setFilters] = useState({ search: "", country: "", location: "", status: "", start: "", end: "" }), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [record, setRecord] = useState<CmsRecord | null>(null), [draft, setDraft] = useState<CmsPayload>(blank), [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [image, setImage] = useState<File | null>(null), [imageAction, setImageAction] = useState<"keep" | "remove" | "replace">("keep");
  const [picker, setPicker] = useState({ search: "", country: "", region: "", location: "", group: "" }), [marked, setMarked] = useState<string[]>([]);
  const [bulk, setBulk] = useState(blankBulk);
  const [resultSearch, setResultSearch] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null), detailRequest = useRef<AbortController | null>(null);
  const dirty = editing && (imageAction !== "keep" || JSON.stringify(draft) !== JSON.stringify(record?.payload || blank()));
  const active = Boolean(record || editing);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } };
    const click = (event: MouseEvent) => { if (!(event.target instanceof Element) || !event.target.closest("a[href]") || (!dirty && !busy)) return; if (busy || !window.confirm("Discard unsaved content changes?")) { event.preventDefault(); event.stopPropagation(); } };
    window.addEventListener("beforeunload", before); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", before); document.removeEventListener("click", click, true); };
  }, [dirty, busy]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  useEffect(() => {
    if (active) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      void json(`/api/cms-support?${new URLSearchParams({ ...filters, page: String(page) })}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setUpdates(data.updates); setTotal(data.total); setCountries(data.countries); setLocations(data.locations); } }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, page, revision, refreshKey, active]);
  async function open(id: string) {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller;
    setLoading(true); setError("");
    try { const data = await json(`/api/cms-support?id=${encodeURIComponent(id)}`, { signal: controller.signal }); if (controller.signal.aborted) return; setRecord(data.record); setDraft(data.record.payload); setEditing(false); setImage(null); setImageAction("keep"); setMarked([]); setBulk(blankBulk()); setResultSearch(""); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load this update."); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const inventory = useMemo(() => {
    const byId = new Map(entities.map(item => [item.id, item]));
    return entities.filter(item => item.type === "screen").map(screen => { const location = byId.get(screen.parentId || ""), region = byId.get(location?.parentId || ""), country = byId.get(region?.parentId || ""); return { screen, location, region, country }; });
  }, [entities]);
  const options = cmsScreenOptions(inventory, members, picker);
  const selected = new Set(draft.screens.map(row => row.screenId));
  const available = options.filter(row => !selected.has(row.screen.id));
  const resultRows = cmsResultScreens(editing ? draft.screens : record?.payload.screens || [], resultSearch);
  const markedRows = cmsVisibleMarkedIds(resultRows, marked);
  const resultSearchBar = <div className="cms-result-search"><label>Search results<input type="search" maxLength={200} placeholder="Search screen, location, region or country" value={resultSearch} disabled={busy} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} onChange={event => { setResultSearch(event.target.value); setMarked([]); }}/></label><span className="cms-hint" role="status">{resultRows.length} of {(editing ? draft.screens : record?.payload.screens || []).length} screens</span>{resultSearch && <button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => { setResultSearch(""); setMarked([]); }}>Clear search</button>}</div>;
  function addScreens(ids: string[]) {
    const next = cmsAdditionalScreens(inventory, selected, ids);
    if (draft.screens.length + next.length > cmsScreenLimit) { setError(`Select up to ${cmsScreenLimit} screens per update.`); return; }
    setDraft(value => ({ ...value, screens: [...value.screens, ...next.map(({ screen, location, region, country }): CmsScreen => ({ screenId: screen.id, screenName: screen.name, location: location?.name || "", region: region?.name || "", country: country?.name || "", network: "Not checked", scheduling: "Pending", playback: "Not verified", checkedAt: "", remarks: "" }))] }));
    setError("");
  }
  const field = (key: keyof CmsDetails, value: string) => setDraft(current => ({ ...current, [key]: value }));
  function leave() { if (busy || (dirty && !window.confirm("Discard unsaved content changes?"))) return; detailRequest.current?.abort(); setRecord(null); setEditing(false); setImage(null); setImageAction("keep"); setError(""); setFinalizeOpen(false); setRevision(value => value + 1); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const metadata = { action: record ? "update" : "create", id: record?.id, version: record?.version, payload: { ...draft, screens: draft.screens.map(({ screenId, network, scheduling, playback, checkedAt, remarks }) => ({ screenId, network, scheduling, playback, checkedAt, remarks })) }, imageAction };
      let body: BodyInit = JSON.stringify(metadata); let headers: HeadersInit | undefined = { "Content-Type": "application/json" };
      if (image) { const form = new FormData(); form.set("metadata", JSON.stringify(metadata)); form.set("image", image); body = form; headers = undefined; }
      const result = await json("/api/cms-support", { method: "POST", headers, body }); await open(result.id);
    } catch (cause) { setResultSearch(""); setError(cause instanceof Error ? cause.message : "Could not save this update."); }
    finally { setBusy(false); }
  }
  async function finalize() {
    if (!record || busy) return; setBusy(true); setError("");
    try { await json("/api/cms-support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finalize", id: record.id, version: record.version }) }); setFinalizeOpen(false); await open(record.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finalize the report."); }
    finally { setBusy(false); }
  }
  const inputs: { key: keyof CmsDetails; label: string; type?: string; required?: boolean; max?: number }[] = [
    { key: "contentName", label: "Content name", required: true, max: 160 }, { key: "campaignName", label: "Campaign name (optional)", max: 160 }, { key: "category", label: "Screen category", required: true, max: 100 },
    { key: "receivedAt", label: "Received date and time (GST)", type: "datetime-local", required: true }, { key: "missingReceivedAt", label: "Missing files received (GST, optional)", type: "datetime-local" }, { key: "scheduledAt", label: "Scheduling completed (GST, optional)", type: "datetime-local" },
    { key: "playbackStart", label: "Playback start", type: "date", required: true }, { key: "playbackEnd", label: "Playback end", type: "date", required: true }, { key: "approvedBy", label: "Approved by (optional)", max: 120 }, { key: "resizedBy", label: "Resized by (optional)", max: 120 },
  ];
  function statusSelect(kind: CmsStatusKind, value: string, onChange: (value: string) => void, label: string, optional = false) { return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={busy}>{optional && <option value="">No change</option>}{cmsStatuses[kind].map(item => <option key={item}>{item}</option>)}</select>; }
  return <div className="cms-support">
    {error && <div className="adm-error" role="alert">{error}</div>}
    {!active ? <section className="adm-panel cms-list-card" aria-label="Content updates">
      <div className="cms-toolbar"><div className="cms-list-heading"><h2>Content updates</h2><span className="cms-loading-status" role="status" aria-live="polite" data-loading={loading}>{loading ? "Loading updates…" : ""}</span></div><button className="adm-primary-btn" disabled={loading} onClick={() => { setRecord(null); setDraft(blank()); setEditing(true); setImage(null); setImageAction("keep"); setPicker({ search: "", country: "", region: "", location: "", group: "" }); setMarked([]); setBulk(blankBulk()); setError(""); }}><Plus size={16}/>Add update</button></div>
      <div className="cms-filters"><label>Search<input maxLength={160} placeholder="Content, campaign or category" value={filters.search} onChange={e => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}/></label><label>Country<select value={filters.country} onChange={e => { setFilters({ ...filters, country: e.target.value, location: "" }); setPage(1); }}><option value="">All countries</option>{countries.map(name => <option key={name}>{name}</option>)}</select></label><label>Location<select value={filters.location} onChange={e => { setFilters({ ...filters, location: e.target.value }); setPage(1); }}><option value="">All locations</option>{locations.map(name => <option key={name}>{name}</option>)}</select></label><label>Scheduling<select value={filters.status} onChange={e => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}><option value="">All statuses</option>{["Scheduled", "Pending", "Failed", "Not required"].map(value => <option key={value}>{value}</option>)}</select></label><label>Playback from<input type="date" value={filters.start} onChange={e => { setFilters({ ...filters, start: e.target.value }); setPage(1); }}/></label><label>Playback to<input type="date" value={filters.end} onChange={e => { setFilters({ ...filters, end: e.target.value }); setPage(1); }}/></label><button type="button" className="adm-secondary-btn cms-clear-filters" onClick={() => { setFilters({ search: "", country: "", location: "", status: "", start: "", end: "" }); setPage(1); }}>Clear filters</button></div>
      <div className="cms-table cms-update-table" aria-busy={loading}><table><thead><tr><th>Content / campaign</th><th>Category</th><th>Playback period</th><th>Scheduling</th><th>Reports</th><th>Actions</th></tr></thead><tbody>{updates.map(row => <tr key={row.id}><td><strong>{row.contentName}</strong>{row.campaignName && <small>{row.campaignName}</small>}</td><td>{row.category}</td><td>{row.playbackStart} to {row.playbackEnd}</td><td>{row.scheduled} / {row.screens} scheduled</td><td>{row.reports}</td><td><button className="adm-secondary-btn" disabled={busy || loading} onClick={() => void open(row.id)}>View</button></td></tr>)}{!updates.length && <tr><td colSpan={6} className="cms-list-empty">{loading ? "Loading content updates…" : "No content updates match these filters."}</td></tr>}</tbody></table></div>
      <div className="cms-toolbar cms-pagination"><span>{total} {total === 1 ? "update" : "updates"}</span><div className="cms-actions"><button className="adm-secondary-btn" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button> <span>Page {page}</span> <button className="adm-secondary-btn" disabled={page * 25 >= total || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section> : <>
      <div className="cms-toolbar"><button className="adm-secondary-btn" disabled={busy} onClick={leave}><ArrowLeft size={16}/>Content updates</button><div className="cms-actions"><span className="cms-loading-status" role="status" aria-live="polite" data-loading={loading}>{loading ? "Loading update…" : ""}</span>{!editing && record && <><button className="adm-secondary-btn" disabled={busy} onClick={() => void open(record.id)} aria-label="Refresh content update"><RefreshCw size={16}/></button><button className="adm-secondary-btn" disabled={busy} onClick={() => { setDraft(record.payload); setEditing(true); setMarked([]); setBulk(blankBulk()); }}>Edit</button><a className="adm-secondary-btn" href={`/api/cms-support/pdf?id=${record.id}`} target="_blank" rel="noopener">Preview PDF</a><button className="adm-primary-btn" disabled={busy} onClick={() => setFinalizeOpen(true)}>Finalize report</button></>}</div></div>
      {finalizeOpen && <section className="adm-panel cms-confirm" aria-label="Confirm report"><h2>Finalize client report?</h2><p>This saves a fixed PDF of the current details and statuses. Later edits create a new revision. Nothing is sent automatically.</p><div className="cms-actions"><button className="adm-secondary-btn" disabled={busy} onClick={() => setFinalizeOpen(false)}>Cancel</button><button className="adm-primary-btn" disabled={busy} onClick={() => void finalize()}>{busy ? "Preparing…" : "Finalize report"}</button></div></section>}
      {editing ? <form onSubmit={event => void save(event)}>
        <fieldset disabled={busy} className="adm-panel cms-fieldset"><h2>{record ? "Edit content update" : "Add content update"}</h2><div className="cms-fields">{inputs.map(input => <label key={input.key}>{input.label}<input type={input.type || "text"} maxLength={input.max} required={input.required || input.key === "scheduledAt" && draft.screens.some(row => row.scheduling === "Scheduled")} value={input.type === "datetime-local" ? localTime(draft[input.key]) : draft[input.key] || ""} onChange={event => field(input.key, input.type === "datetime-local" ? isoTime(event.target.value) : event.target.value)} min={input.key === "playbackEnd" ? draft.playbackStart : undefined}/></label>)}</div>
          <div className="cms-fields"><label>Client remarks (optional)<input maxLength={600} value={draft.remarks} onChange={event => field("remarks", event.target.value)}/></label><label>Internal notes (excluded from PDF)<input maxLength={1000} value={draft.internalNotes} onChange={event => field("internalNotes", event.target.value)}/></label></div>
          <div className="cms-fields"><label>Content image (optional)<input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (!file.size) { setError("This image is empty. Choose another file."); return; } if (file.size > 5 * 1024 * 1024) { setError("Choose an image up to 5 MB."); return; } const mime = cmsImageMime(file.name, file.type); if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) { setError("Choose a JPG, PNG or WebP image."); return; } setImage(file.type === mime ? file : new File([file], file.name, { type: mime })); setImageAction("replace"); setError(""); }}/></label><label>Content video URL (optional)<input type="url" maxLength={4096} value={draft.videoUrl || ""} placeholder="https://example.com/content.mp4" onChange={event => field("videoUrl", event.target.value)}/></label></div>
          <ImagePreview file={image} source={record?.hasImage && imageAction === "keep" ? `/api/cms-support?id=${record.id}&image=1&v=${record.version}` : ""}/>{(image || record?.hasImage && imageAction !== "remove") && <button type="button" className="adm-secondary-btn" onClick={() => { setImage(null); setImageAction("remove"); }}>Remove image</button>}{imageAction !== "keep" && record && <button type="button" className="adm-secondary-btn" onClick={() => { setImage(null); setImageAction("keep"); }}>Undo image change</button>}
        </fieldset>
        <section className="adm-panel"><h2>Select screens</h2><div className="cms-filters"><label>Group<select disabled={busy} value={picker.group} onChange={event => setPicker({ ...picker, group: event.target.value })}><option value="">All groups</option>{entities.filter(item => item.type === "group").sort((a, b) => a.name.localeCompare(b.name)).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>Find screens<input value={picker.search} onChange={e => setPicker({ ...picker, search: e.target.value })} placeholder="Screen or location"/></label>{(["country", "region", "location"] as const).map(kind => <label key={kind}>{kind === "location" ? "Location" : kind === "region" ? "Region" : "Country"}<select disabled={busy} value={picker[kind]} onChange={e => setPicker({ ...picker, [kind]: e.target.value, ...(kind === "country" ? { region: "", location: "" } : kind === "region" ? { location: "" } : {}) })}><option value="">All</option>{entities.filter(item => item.type === (kind === "location" ? "store" : kind) && (kind === "region" ? !picker.country || item.parentId === picker.country : kind === "location" ? (!picker.region || item.parentId === picker.region) && (!picker.country || entities.find(region => region.id === item.parentId)?.parentId === picker.country) : true)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}</div>
          <button type="button" className="adm-secondary-btn" disabled={busy || !available.length} onClick={() => addScreens(options.map(row => row.screen.id))}>{!options.length ? "No matching screens" : !available.length ? "All matching screens added" : `Add matching screens (${available.length})`}</button>
          <div className="cms-picker"><div className="cms-picker-grid">{!options.length && <p className="cms-hint cms-picker-empty">No screens match this group and the selected filters.</p>}{options.map(({ screen, location, country }) => <label key={screen.id}><input type="checkbox" disabled={busy} checked={selected.has(screen.id)} onChange={event => event.target.checked ? addScreens([screen.id]) : setDraft(value => ({ ...value, screens: value.screens.filter(row => row.screenId !== screen.id) }))}/><span><strong>{screen.name}</strong><small>{location?.name} · {country?.name}</small></span></label>)}</div></div>
        </section>
        <section className="adm-panel"><h2>Screen results ({draft.screens.length})</h2>{!draft.screens.length ? <p className="cms-hint">Select screens above to add their results.</p> : <>{resultSearchBar}
          <div className="cms-bulk">{(Object.keys(cmsStatuses) as CmsStatusKind[]).map(kind => <label key={kind}>{kind === "network" ? "Network" : kind === "scheduling" ? "Scheduling" : "Playback"}{statusSelect(kind, bulk[kind], value => setBulk({ ...bulk, [kind]: value }), `Bulk ${kind}`, true)}</label>)}<label>Playback checked (GST)<input type="datetime-local" disabled={busy} value={localTime(bulk.checkedAt)} onChange={e => setBulk({ ...bulk, checkedAt: isoTime(e.target.value) })}/></label><button type="button" className="adm-secondary-btn" disabled={busy || !markedRows.length} onClick={() => { if (bulk.playback === "Verified" && !bulk.checkedAt && draft.screens.some(row => markedRows.includes(row.screenId) && !row.checkedAt)) { setError("Choose a check time for selected screens that have no verification time."); return; } setDraft(value => ({ ...value, screens: value.screens.map(row => markedRows.includes(row.screenId) ? { ...row, ...(bulk.network ? { network: bulk.network } : {}), ...(bulk.scheduling ? { scheduling: bulk.scheduling } : {}), ...(bulk.playback ? { playback: bulk.playback } : {}), ...(bulk.checkedAt ? { checkedAt: bulk.checkedAt } : {}) } : row) })); setError(""); }}>Apply to {markedRows.length} {markedRows.length === 1 ? "row" : "rows"}</button></div>
          <div className="cms-table cms-results"><table><thead><tr><th><label className="cms-select-all"><input type="checkbox" disabled={busy || !resultRows.length} aria-label="Select all matching result rows" ref={element => { if (element) element.indeterminate = markedRows.length > 0 && markedRows.length < resultRows.length; }} checked={resultRows.length > 0 && markedRows.length === resultRows.length} onChange={e => setMarked(e.target.checked ? resultRows.map(row => row.screenId) : [])}/>All matching</label></th><th>Screen / location</th><th>Network</th><th>Scheduling</th><th>Playback</th><th>Playback checked (GST)</th><th>Client remarks</th><th/></tr></thead><tbody>{!resultRows.length && <tr><td colSpan={8} className="cms-results-empty">No screens match your search.</td></tr>}{resultRows.map(row => <tr key={row.screenId}><td><input type="checkbox" disabled={busy} aria-label={`Select ${row.screenName}`} checked={markedRows.includes(row.screenId)} onChange={e => setMarked(value => e.target.checked ? [...value, row.screenId] : value.filter(id => id !== row.screenId))}/></td><td><strong>{row.screenName}</strong><small>{row.location} · {row.region} · {row.country}</small></td>{(Object.keys(cmsStatuses) as CmsStatusKind[]).map(kind => <td key={kind}>{statusSelect(kind, row[kind], value => setDraft(current => ({ ...current, screens: current.screens.map(item => item.screenId === row.screenId ? { ...item, [kind]: value } : item) })), `${kind} for ${row.screenName}`)}</td>)}<td><input type="datetime-local" aria-label={`Playback checked for ${row.screenName}`} required={row.playback === "Verified"} disabled={busy} value={localTime(row.checkedAt)} onChange={e => setDraft(current => ({ ...current, screens: current.screens.map(item => item.screenId === row.screenId ? { ...item, checkedAt: isoTime(e.target.value) } : item) }))}/></td><td><input aria-label={`Remarks for ${row.screenName}`} maxLength={300} disabled={busy} value={row.remarks} onChange={e => setDraft(current => ({ ...current, screens: current.screens.map(item => item.screenId === row.screenId ? { ...item, remarks: e.target.value } : item) }))}/></td><td><button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => setDraft(current => ({ ...current, screens: current.screens.filter(item => item.screenId !== row.screenId) }))}>Remove</button></td></tr>)}</tbody></table></div></>}
        </section>
        <div className="cms-save"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => { if (!record) { leave(); return; } if (dirty && !window.confirm("Discard unsaved content changes?")) return; else { setDraft(record.payload); setEditing(false); setImage(null); setImageAction("keep"); setError(""); } }}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={busy || !dirty || !draft.screens.length}>{busy ? "Saving…" : "Save update"}</button></div>
      </form> : record && <>
        <section className="adm-panel"><h2>{record.payload.contentName}</h2><div className="cms-view-fields">{inputs.filter(input => input.key !== "videoUrl" && (input.required || input.key === "scheduledAt" || record.payload[input.key])).map(input => <div key={input.key}><span>{input.label.replace(" (optional)", "").replace("(GST, optional)", "(GST)")}</span><strong>{input.type === "datetime-local" ? cmsTime(record.payload[input.key]) : record.payload[input.key] || "Not recorded"}</strong></div>)}</div>{(record.hasImage || record.payload.videoUrl) && <div className="cms-content-media" data-pair={Boolean(record.hasImage && record.payload.videoUrl)}><ImagePreview file={null} source={record.hasImage ? `/api/cms-support?id=${record.id}&image=1&v=${record.version}` : ""}/>{record.payload.videoUrl && <ContentVideo key={record.payload.videoUrl} url={record.payload.videoUrl}/>}</div>}{record.payload.remarks && <p>Client remarks: {record.payload.remarks}</p>}{record.payload.internalNotes && <p>Internal notes: {record.payload.internalNotes}</p>}<p className="cms-hint">Last edited {cmsTime(record.updatedAt)} by {record.updatedBy}</p></section>
        <section className="adm-panel"><h2>Screen results ({record.payload.screens.length})</h2>{resultSearchBar}<div className="cms-table"><table><thead><tr><th>Country / region</th><th>Location</th><th>Screen</th><th>Network</th><th>Scheduling</th><th>Playback</th><th>Checked</th><th>Remarks</th></tr></thead><tbody>{!resultRows.length && <tr><td colSpan={8} className="cms-results-empty">No screens match your search.</td></tr>}{resultRows.map(row => <tr key={row.screenId}><td>{row.country}<small>{row.region}</small></td><td>{row.location}</td><td>{row.screenName}</td>{(["network", "scheduling", "playback"] as const).map(kind => <td key={kind}><span className="cms-status" data-status={row[kind]}>{row[kind]}</span></td>)}<td>{row.checkedAt ? cmsTime(row.checkedAt) : "—"}</td><td>{row.remarks || "—"}</td></tr>)}</tbody></table></div></section>
        <section className="adm-panel"><h2>Finalized reports</h2><p className="cms-hint">Each revision is a fixed client PDF. Editing the update does not change an existing report.</p>{!record.reports.length && <p>No report finalized yet.</p>}{record.reports.map(report => <div className="cms-toolbar" key={report.id}><span>Revision {report.revision} · {cmsTime(report.createdAt)}</span><a className="adm-secondary-btn" href={`/api/cms-support/pdf?reportId=${report.id}`} download={`cms-report-r${report.revision}.pdf`}><Download size={16}/>Download PDF</a></div>)}</section>
      </>}
    </>}
  </div>;
}
