"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, Search } from "lucide-react";
import type { Entity, Selection } from "@/lib/store";
import type { PreviewHealth, PreviewHealthStatus } from "@/lib/preview-health";
import { validLocationFilters } from "@/lib/location-filters";

export type HealthSnapshot = { checks: PreviewHealth[]; inventoryAt: string | null; inventoryError: boolean; checkedAt: string };
const labels: Record<PreviewHealthStatus, string> = { available: "Preview received", unavailable: "Preview unavailable", no_link: "No preview link", unsupported: "Automatic check unavailable", checking: "Checking preview…", unknown: "Not checked recently" };
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " GST" : "None received by server yet";
const checkedAgo = (value: string | null, now: string | undefined) => {
  if (!value || !now) return "Not checked yet";
  const seconds = Math.max(0, Math.floor((Date.parse(now) - Date.parse(value)) / 1000));
  if (!Number.isFinite(seconds)) return "Check time unavailable";
  if (seconds < 60) return "Checked just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Checked ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  return `Checked ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
};

export default function PreviewIssues({ entities, health, error, busy, onDisplayChange }: { entities: Entity[]; health: HealthSnapshot | null; error: string; busy: boolean; onDisplayChange: (selection: Selection) => void }) {
  const [filters, setFilters] = useState({ country: "", region: "", location: "", status: "unavailable", query: "", page: 1 });
  const [moreFilters, setMoreFilters] = useState(false);
  const valid = validLocationFilters(entities, filters);
  if (valid.country !== filters.country || valid.region !== filters.region || valid.location !== filters.location) {
    setFilters({ ...filters, ...valid, page: 1 });
  }
  const byId = new Map(entities.map(item => [item.id, item]));
  const checks = new Map(health?.checks.map(item => [item.screenId, item]) || []);
  const countries = entities.filter(item => item.type === "country");
  const regions = entities.filter(item => item.type === "region" && (!filters.country || item.parentId === filters.country));
  const locations = entities.filter(item => item.type === "store" && (!filters.region || item.parentId === filters.region) && (!filters.country || byId.get(item.parentId || "")?.parentId === filters.country));
  const rows = entities.filter(item => item.type === "screen").map(screen => {
    const location = byId.get(screen.parentId || ""), region = byId.get(location?.parentId || ""), country = byId.get(region?.parentId || "");
    const check = checks.get(screen.id) || { screenId: screen.id, status: "unknown" as const, lastImageAt: null, checkedAt: null };
    return { screen, location, region, country, check };
  });
  const filtered = rows.filter(row => (!filters.country || row.country?.id === filters.country) && (!filters.region || row.region?.id === filters.region) && (!filters.location || row.location?.id === filters.location)
    && (filters.status === "all" || filters.status === "unchecked" && ["unknown", "checking"].includes(row.check.status) || row.check.status === filters.status)
    && [row.screen.name, row.location?.name, row.region?.name, row.country?.name].join(" ").toLowerCase().includes(filters.query.trim().toLowerCase()));
  const issueIds = filtered.filter(row => row.check.status === "unavailable").map(row => row.screen.id);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const page = Math.min(filters.page, pages);
  const update = (change: Partial<typeof filters>) => setFilters(old => ({ ...old, ...change, page: 1 }));
  const initialChecks = rows.filter(row => ["checking", "unknown"].includes(row.check.status) && !row.check.checkedAt).length;
  const awaiting = rows.filter(row => ["checking", "unknown"].includes(row.check.status)).length;
  const hasFilters = !!(filters.country || filters.region || filters.location || filters.query || filters.status !== "unavailable");
  const otherStatus = !["unavailable", "no_link", "unchecked"].includes(filters.status);

  return <section className="ctrl-panel ctrl-issues" aria-label="Preview issues">
    <div className="ctrl-panel-head"><div><h2>Preview issues</h2><p>Screens with unavailable previews.</p></div><button className="ctrl-open-wall" disabled={busy || !!error || !!health?.inventoryError || !issueIds.length} onClick={() => onDisplayChange({ screenIds: issueIds.slice(0, 500) })}><AlertTriangle size={17}/> Show issues on wall <ArrowRight size={16}/></button></div>
    <div className="ctrl-issue-summary">
      <div className="ctrl-issue-status-filters" role="group" aria-label="Filter by preview status">
        <button className={`ctrl-all ${filters.status === "unavailable" ? "active" : ""}`} aria-pressed={filters.status === "unavailable"} onClick={() => update({ status: "unavailable" })}>Unavailable · {rows.filter(row => row.check.status === "unavailable").length}</button>
        <button className={`ctrl-all ${filters.status === "no_link" ? "active" : ""}`} aria-pressed={filters.status === "no_link"} onClick={() => update({ status: "no_link" })}>No link · {rows.filter(row => row.check.status === "no_link").length}</button>
        {(awaiting > 0 || filters.status === "unchecked") && <button className={`ctrl-all ${filters.status === "unchecked" ? "active" : ""}`} aria-pressed={filters.status === "unchecked"} onClick={() => update({ status: "unchecked" })}>Awaiting checks · {awaiting}</button>}
      </div>
      <button className={`ctrl-all ${otherStatus ? "active" : ""}`} aria-expanded={moreFilters} aria-controls="preview-more-filters" onClick={() => setMoreFilters(old => !old)}>{otherStatus ? `More filters · ${filters.status === "all" ? "All screens" : filters.status === "available" ? "Preview received" : "Other links"}` : "More filters"}</button>
    </div>
    {(error || health?.inventoryError) && <p className="ctrl-issue-notice" role="alert">{error || "The checker cannot refresh the screen inventory. Results may be out of date."}</p>}
    {!health && !error && <p className="ctrl-issue-notice" role="status">Loading preview checks…</p>}
    {health && !health.inventoryAt && <p className="ctrl-issue-notice">The checker is starting. Screens are not yet confirmed available.</p>}
    {initialChecks > 0 && <p className="ctrl-issue-notice">Checking {initialChecks} {initialChecks === 1 ? "screen" : "screens"} for the first time…</p>}
    <div className="ctrl-issue-filters">
      <label>Country<select aria-label="Country" value={filters.country} onChange={event => update({ country: event.target.value, region: "", location: "" })}><option value="">All countries</option>{countries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Region<select aria-label="Region" value={filters.region} onChange={event => update({ region: event.target.value, location: "" })}><option value="">All regions</option>{regions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Location<select aria-label="Location" value={filters.location} onChange={event => update({ location: event.target.value })}><option value="">All locations</option>{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </div>
    <div id="preview-more-filters" hidden={!moreFilters} className="ctrl-issue-more"><label>Preview status<select aria-label="Preview status" value={filters.status} onChange={event => update({ status: event.target.value })}><option value="unavailable">Preview unavailable</option><option value="no_link">No preview link</option><option value="unchecked">Awaiting checks</option><option value="unsupported">Other preview links</option><option value="available">Preview received</option><option value="all">All screens</option></select></label></div>
    <div className="ctrl-screen-tools"><label className="ctrl-search"><Search size={18}/><input aria-label="Search preview issues" placeholder="Search screens or locations" value={filters.query} onChange={event => update({ query: event.target.value })}/></label>{hasFilters && <button className="ctrl-all" onClick={() => update({ country: "", region: "", location: "", query: "", status: "unavailable" })}>Clear filters</button>}</div>
    <div className="ctrl-issue-list">
      {filtered.slice((page - 1) * 20, page * 20).map(({ screen, location, region, country, check }) => <article className="ctrl-issue-row" key={screen.id}>
        <div className="ctrl-issue-copy"><strong>{screen.name}</strong><span>{[location?.name, region?.name, country?.name].filter(Boolean).join(" · ")}</span><small>{checkedAgo(check.checkedAt, health?.checkedAt)}</small><details className="ctrl-issue-details"><summary aria-label={`Details for ${screen.name}`}>Details</summary><small>Last image: {date(check.lastImageAt)}<br/>Last check: {check.checkedAt ? date(check.checkedAt) : "Not completed yet"}</small></details></div>
        <span className={`ctrl-issue-status ${check.status}`}>{check.status === "unknown" && !check.checkedAt ? "Not checked yet" : labels[check.status]}</span>
        <button className="ctrl-all" disabled={busy || !!error || !!health?.inventoryError} onClick={() => onDisplayChange({ screenIds: [screen.id] })}>Show on wall</button>
      </article>)}
      {!filtered.length && <div className="ctrl-empty">{!health ? "Waiting for preview check results." : "No screens match these filters."}</div>}
    </div>
    <div className="ctrl-issue-footer"><span>{filtered.length ? `${(page - 1) * 20 + 1}–${Math.min(page * 20, filtered.length)} of ${filtered.length}` : "0 screens"}{issueIds.length > 500 ? " · Show issues displays the first 500 matches" : ""}</span>{pages > 1 && <nav aria-label="Preview issues pagination"><button className="ctrl-all" disabled={page <= 1} onClick={() => setFilters(old => ({ ...old, page: page - 1 }))}>Previous</button><span>{page} / {pages}</span><button className="ctrl-all" disabled={page >= pages} onClick={() => setFilters(old => ({ ...old, page: page + 1 }))}>Next</button></nav>}<details className="ctrl-issue-help"><summary>How checks work</summary><p>Each check waits up to 30 seconds for a preview image. Completed checks are queued again after 60 seconds; larger lists may take longer. Preview issues do not confirm that a player is offline.</p></details></div>
  </section>;
}
