"use client";

import { useMemo, useState } from "react";
import { Check, Monitor, Search, SlidersHorizontal } from "lucide-react";
import type { Entity, Member, Selection } from "@/lib/store";
import { emptyGroupScreenFilters, filteredGroupSelection, groupScreenView } from "./controller-group-filters";

type Props = {
  group: Entity;
  entities: Entity[];
  members: Member[];
  selection: Selection;
  wallScreens: Entity[];
  busy: boolean;
  onDisplayChange: (selection: Selection) => void;
  onSelectScreen: (id: string) => void;
};

export default function ControllerGroupScreens({ group, entities, members, selection, wallScreens, busy, onDisplayChange, onSelectScreen }: Props) {
  const [draft, setDraft] = useState(emptyGroupScreenFilters);
  const view = useMemo(() => groupScreenView(entities, members, group.id, draft), [entities, members, group.id, draft]);
  const { filters, matching, screens } = view;
  const matchingIds = new Set(matching.map(screen => screen.id));
  const outsideFilters = wallScreens.filter(screen => !matchingIds.has(screen.id)).length;
  const allOnWall = !selection.screenIds?.length && !selection.countryId && !selection.regionId && !selection.storeId;
  const applySelection = filteredGroupSelection(group.id, matching);
  const byId = new Map(entities.map(item => [item.id, item]));

  return <>
    <div className="ctrl-panel-head"><div><h2>{group.name}</h2><p>Filter this group by location, or select individual screens.</p></div><span className="ctrl-screen-count">{screens.length}</span></div>
    <div className="ctrl-group-tools">
      <div className="ctrl-group-filters">
        <label>Country<select value={filters.countryId} disabled={busy} onChange={event => setDraft({ ...filters, countryId: event.target.value, regionId: "", storeId: "" })}>
          <option value="">All countries</option>{view.countries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Region / city<select value={filters.regionId} disabled={busy || !filters.countryId} onChange={event => setDraft({ ...filters, regionId: event.target.value, storeId: "" })}>
          <option value="">All regions</option>{view.regions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Location<select value={filters.storeId} disabled={busy || !filters.regionId} onChange={event => setDraft({ ...filters, storeId: event.target.value })}>
          <option value="">All locations</option>{view.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
      </div>
      <div className="ctrl-group-toolbar">
        <label className="ctrl-search"><Search size={18}/><input type="search" value={filters.query} disabled={busy} maxLength={120} onChange={event => setDraft({ ...filters, query: event.target.value })} placeholder="Search these screens" aria-label="Search group screens"/></label>
        <div className="ctrl-group-actions">
          <button type="button" className={`ctrl-all ${allOnWall ? "active" : ""}`} disabled={busy} onClick={() => { setDraft(emptyGroupScreenFilters); onDisplayChange({ groupId: group.id }); }}>Show entire group</button>
          <button type="button" className="ctrl-group-apply" disabled={busy || !view.hasFilters || !applySelection} onClick={() => { if (applySelection && view.hasFilters) onDisplayChange(applySelection); }}>Show filtered screens</button>
        </div>
      </div>
      {view.hasFilters && <div className="ctrl-group-summary"><span role="status" aria-live="polite">{matching.length} matching {matching.length === 1 ? "screen" : "screens"}</span><button type="button" className="ctrl-reset" disabled={busy || !view.hasFilters} onClick={() => setDraft(emptyGroupScreenFilters)}>Clear filters</button></div>}
      {matching.length > 500 && <p className="ctrl-group-hint" role="status">Narrow your filters to show up to 500 screens at a time.</p>}
    </div>
    <div className="ctrl-screen-list ctrl-group-list" role="region" aria-label="Group screen results" tabIndex={0}>
      {matching.map(screen => {
        const location = byId.get(screen.parentId || "");
        const region = byId.get(location?.parentId || "");
        const selected = !!selection.screenIds?.includes(screen.id);
        return <button type="button" key={screen.id} className={`ctrl-screen ${selected ? "selected" : ""}`} aria-pressed={selected} disabled={busy} onClick={() => onSelectScreen(screen.id)}>
          <span className="ctrl-screen-icon"><Monitor size={20}/></span><span className="ctrl-screen-label"><strong>{screen.name}</strong><small>{[location?.name, region?.name].filter(Boolean).join(" · ")}</small></span>
          <span className={`ctrl-source ${screen.liveUrl ? "ready" : ""}`}>{screen.liveUrl ? "Preview link" : "No preview link"}</span><span className="ctrl-check">{selected && <Check size={14}/>}</span>
        </button>;
      })}
      {!matching.length && <div className="ctrl-empty">{view.hasFilters ? "No screens match these filters. Clear filters to see the entire group." : "There are no screens in this group yet."}</div>}
    </div>
    <div className="ctrl-screen-foot"><SlidersHorizontal size={16}/><span>{wallScreens.length} {wallScreens.length === 1 ? "screen" : "screens"} on the wall{view.hasFilters && outsideFilters ? ` · ${outsideFilters} outside current filters` : ""}</span></div>
  </>;
}
