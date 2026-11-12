"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import type { OnSignFilterPlayer } from "@/lib/onsign-api-shared";
import { emptyOnSignScreenFilters, onSignFilterLabels, onSignFilterValueLabel, onSignScreenValues, type OnSignScreenFilterKey } from "@/lib/onsign-screen-filters";
import "./onsign-screen-filters.css";

type Screen = { id: string; onsignPlayerId?: string | null };
export function useOnSignScreenFilters(screens: Screen[], refreshKey: number, enabled: boolean) {
  const [filters, setFilters] = useState(emptyOnSignScreenFilters);
  const [field, setField] = useState<OnSignScreenFilterKey | "">("");
  const [snapshot, setSnapshot] = useState<OnSignFilterPlayer[] | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const requested = Boolean(field || Object.values(filters).some(Boolean));
  const links = screens.map(screen => screen.onsignPlayerId || "").sort().join("\n");
  useEffect(() => {
    if (!enabled || !requested) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      void clientFetch("/api/onsign?view=filters", { cache: "no-store", signal: controller.signal }).then(async response => {
        if (response.status === 401) { window.location.replace("/login?next=/admin/screens"); return; }
        const data = await response.json();
        if (!response.ok || !data.configured) throw new Error(data.error || "OnSign is not configured on the server.");
        if (!controller.signal.aborted) setSnapshot(data.players);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load OnSign filters."); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, requested, links, refreshKey, revision]);
  const players = useMemo(() => new Map((snapshot || []).map(player => [player.id, player])), [snapshot]);
  return { filters, setFilters, field, setField, players, loading: requested && loading, error: requested ? error : "", ready: snapshot !== null && !error, retry: () => setRevision(value => value + 1) };
}
export default function OnSignScreenFilters({ screens, state }: { screens: Screen[]; state: ReturnType<typeof useOnSignScreenFilters> }) {
  const { filters, setFilters, field, setField, players, loading, error, ready, retry } = state;
  const keys = Object.keys(onSignFilterLabels) as OnSignScreenFilterKey[];
  const options = field ? [...new Set(screens.flatMap(screen => onSignScreenValues(screen.onsignPlayerId, players.get(screen.onsignPlayerId || ""), field)))].sort((a,b) => onSignFilterValueLabel(a).localeCompare(onSignFilterValueLabel(b))) : [];
  return <div className="screen-onsign-filters" aria-label="OnSign filters">
    <div className="screen-onsign-filter-controls">
      <label><span>Add OnSign filter</span><select value={field} onChange={event => setField(event.target.value as OnSignScreenFilterKey | "")}><option value="">Add OnSign filter</option>{keys.map(key => <option key={key} value={key}>{onSignFilterLabels[key]}</option>)}</select></label>
      {field && <label><span>{onSignFilterLabels[field]}</span><select value={filters[field]} disabled={loading || !ready} onChange={event => { if (event.target.value) { setFilters({ ...filters, [field]: event.target.value }); setField(""); } }}><option value="">{loading ? "Loading values…" : "Select value"}</option>{ready && options.map(value => <option key={value} value={value}>{onSignFilterValueLabel(value)}</option>)}</select></label>}
      {Object.values(filters).some(Boolean) && <button type="button" className="adm-secondary-btn" onClick={() => { setFilters(emptyOnSignScreenFilters()); setField(""); }}>Clear OnSign filters</button>}
      {loading && <span className="screen-onsign-hint" role="status">Loading OnSign information…</span>}
    </div>
    {keys.some(key => filters[key]) && <div className="screen-onsign-filter-chips">{keys.filter(key => filters[key]).map(key => <button type="button" className="screen-onsign-filter-chip" key={key} onClick={() => setFilters({ ...filters, [key]: "" })} aria-label={`Remove ${onSignFilterLabels[key]}: ${onSignFilterValueLabel(filters[key])}`}>{onSignFilterLabels[key]}: {onSignFilterValueLabel(filters[key])}<X size={14}/></button>)}</div>}
    {error && <div className="screen-onsign-filter-error" role="alert">{error}<button type="button" className="adm-secondary-btn" onClick={retry}>Retry</button></div>}
  </div>;
}
