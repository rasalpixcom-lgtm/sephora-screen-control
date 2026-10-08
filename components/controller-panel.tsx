"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Globe2, Layers3, LayoutGrid, MapPin, Monitor, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Display, Entity, Member, Selection } from "@/lib/store";
import "./controller-panel.css";

type State = { entities: Entity[]; members: Member[]; display: Display };
type Props = {
  state: State;
  busy: boolean;
  onDisplayChange: (selection: Selection, options?: { autoAdvance?: boolean; intervalSeconds?: number }) => void;
};

function screensFor(state: State, selection: Selection) {
  const byId = new Map(state.entities.map((item) => [item.id, item]));
  const groupScreens = selection.groupId ? new Set(state.members.filter((member) => member.groupId === selection.groupId).map((member) => member.screenId)) : null;
  const selectedScreens = selection.screenIds?.length ? new Set(selection.screenIds) : null;
  return state.entities.filter((item) => {
    if (item.type !== "screen") return false;
    const location = byId.get(item.parentId || "");
    const region = byId.get(location?.parentId || "");
    if (selection.countryId && region?.parentId !== selection.countryId) return false;
    if (selection.regionId && region?.id !== selection.regionId) return false;
    if (selection.storeId && location?.id !== selection.storeId) return false;
    if (groupScreens && !groupScreens.has(item.id)) return false;
    if (selectedScreens && !selectedScreens.has(item.id)) return false;
    return true;
  });
}

function screenPlace(screen: Entity, entities: Entity[]) {
  const location = entities.find((item) => item.id === screen.parentId);
  const region = entities.find((item) => item.id === location?.parentId);
  return [location?.name, region?.name].filter(Boolean).join(" · ");
}

export default function ControllerPanel({ state, busy, onDisplayChange }: Props) {
  const { entities, members, display } = state;
  const selection = display.selection;
  const [mode, setMode] = useState<"locations" | "groups">("locations");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (selection.groupId) setMode("groups");
    else if (selection.countryId || selection.regionId || selection.storeId) setMode("locations");
  }, [selection.groupId, selection.countryId, selection.regionId, selection.storeId]);

  const countries = entities.filter((item) => item.type === "country");
  const regions = selection.countryId ? entities.filter((item) => item.type === "region" && item.parentId === selection.countryId) : [];
  const locations = selection.regionId ? entities.filter((item) => item.type === "store" && item.parentId === selection.regionId) : [];
  const groups = entities.filter((item) => item.type === "group");
  const screenCounts = useMemo(() => {
    const byId = new Map(entities.map((item) => [item.id, item]));
    const counts = new Map<string, number>();
    for (const screen of entities) {
      if (screen.type !== "screen") continue;
      const location = byId.get(screen.parentId || "");
      const region = byId.get(location?.parentId || "");
      for (const id of [location?.id, region?.id, region?.parentId]) {
        if (id) counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return counts;
  }, [entities]);
  const country = countries.find((item) => item.id === selection.countryId);
  const region = regions.find((item) => item.id === selection.regionId);
  const location = locations.find((item) => item.id === selection.storeId);
  const group = groups.find((item) => item.id === selection.groupId);
  const scopeReady = mode === "groups" ? !!selection.groupId : !!selection.storeId && !selection.groupId;
  const availableScreens = useMemo(() => screensFor(state, { ...selection, screenIds: undefined }), [state, selection]);
  const wallScreens = useMemo(() => screensFor(state, selection), [state, selection]);
  const visibleScreens = availableScreens.filter((screen) => `${screen.name} ${screenPlace(screen, entities)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const wallLabel = group?.name || [country?.name, region?.name, location?.name].filter(Boolean).join(" / ") || "All locations";

  function selectScreen(id: string) {
    const ids = selection.screenIds?.includes(id)
      ? selection.screenIds.filter((screenId) => screenId !== id)
      : [...(selection.screenIds || []), id];
    onDisplayChange({ ...selection, screenIds: ids.length ? ids : undefined });
  }

  function countScreens(scope: Selection) {
    return screenCounts.get(scope.storeId || scope.regionId || scope.countryId || "") || 0;
  }

  return <div className="ctrl">
    <section className="ctrl-live" aria-label="Current wall display">
      <div className="ctrl-live-copy">

        <span className="ctrl-live-kicker"><span className="ctrl-live-dot"/> Current wall view {entities.some((item) => item.isDemo) && <span className="ctrl-demo">SAMPLE DATA</span>}</span>
        <strong>{wallLabel}</strong>
        <span>{wallScreens.length} {wallScreens.length === 1 ? "screen" : "screens"} in this view{selection.screenIds?.length ? ` · ${selection.screenIds.length} individually selected` : ""}</span>
      </div>
      <div className="ctrl-live-actions">

        <div className="ctrl-rotation"><span>Rotate pages</span><Switch checked={display.autoAdvance} disabled={busy} onCheckedChange={(checked) => onDisplayChange(selection, { autoAdvance: checked })} aria-label="Auto-rotate wall"/></div>
        <label className="ctrl-interval">Every <select aria-label="Rotation interval" disabled={busy || !display.autoAdvance} value={display.intervalSeconds} onChange={(event) => onDisplayChange(selection, { intervalSeconds: Number(event.target.value) })}>{[5, 10, 15, 20, 30, 60].map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}</select></label>
        <Link href="/monitor" className="ctrl-open-wall"><LayoutGrid size={17}/> View monitor <ArrowRight size={16}/></Link>
      </div>
    </section>

    <div className="ctrl-mode" role="tablist" aria-label="Choose how to browse screens">
      <button role="tab" aria-selected={mode === "locations"} className={mode === "locations" ? "active" : ""} onClick={() => { setMode("locations"); setQuery(""); }}><MapPin size={19}/><span><strong>By location</strong><small>Country → region → location</small></span></button>
      <button role="tab" aria-selected={mode === "groups"} className={mode === "groups" ? "active" : ""} onClick={() => { setMode("groups"); setQuery(""); }}><Layers3 size={19}/><span><strong>Groups</strong><small>Screens across locations</small></span><span className="ctrl-mode-count">{groups.length}</span></button>
    </div>

    <div className="ctrl-grid">
      <section className="ctrl-panel ctrl-browse" aria-label={mode === "locations" ? "Browse by location" : "Browse groups"}>
        <div className="ctrl-panel-head"><div><span className="ctrl-overline">{mode === "locations" ? "Choose a location" : "Choose a group"}</span><h2>{mode === "locations" ? "Browse locations" : "Choose a group"}</h2><p>{mode === "locations" ? "Select a country, then a region and location." : "Show matching screens from multiple locations together."}</p></div><button className="ctrl-reset" disabled={busy} onClick={() => onDisplayChange({})}><RotateCcw size={15}/> Show all</button></div>
        {mode === "locations" ? <><nav className="ctrl-path" aria-label="Location path"><button disabled={busy} onClick={() => { setQuery(""); onDisplayChange({}); }}>Countries</button>{country && <><ChevronRight size={14}/><button disabled={busy} onClick={() => { setQuery(""); onDisplayChange({ countryId: country.id }); }}>{country.name}</button></>}{region && <><ChevronRight size={14}/><button disabled={busy} onClick={() => { setQuery(""); onDisplayChange({ countryId: selection.countryId, regionId: region.id }); }}>{region.name}</button></>}</nav><div className="ctrl-steps">
          {!country && <div className="ctrl-step"><div className="ctrl-step-head"><span className="ctrl-step-number">01</span><div><h3>Country</h3><p>Start with a country.</p></div><span className="ctrl-step-total">{countries.length}</span></div><div className="ctrl-options">{countries.map((item) => { const count = countScreens({ countryId: item.id }); return <button key={item.id} className={`ctrl-option ${selection.countryId === item.id ? "selected" : ""}`} aria-pressed={selection.countryId === item.id} disabled={busy} onClick={() => { setQuery(""); onDisplayChange({ countryId: item.id }); }}><span className="ctrl-option-icon"><Globe2 size={18}/></span><span className="ctrl-option-name">{item.name}<small>{count} {count === 1 ? "screen" : "screens"}</small></span>{selection.countryId === item.id ? <Check size={17}/> : <ChevronRight size={17}/>}</button>; })}{!countries.length && <div className="ctrl-empty">No countries yet. <Link href="/admin/countries">Add a country</Link> in Admin.</div>}</div></div>}
          {country && !region && <div className="ctrl-step"><div className="ctrl-step-head"><span className="ctrl-step-number">02</span><div><h3>Region</h3><p>Only regions in {country.name} appear here.</p></div><span className="ctrl-step-total">{regions.length}</span></div><div className="ctrl-options">{regions.map((item) => { const count = countScreens({ regionId: item.id }); return <button key={item.id} className={`ctrl-option ${selection.regionId === item.id ? "selected" : ""}`} aria-pressed={selection.regionId === item.id} disabled={busy} onClick={() => { setQuery(""); onDisplayChange({ countryId: country.id, regionId: item.id }); }}><span className="ctrl-option-icon"><MapPin size={18}/></span><span className="ctrl-option-name">{item.name}<small>{count} {count === 1 ? "screen" : "screens"}</small></span>{selection.regionId === item.id ? <Check size={17}/> : <ChevronRight size={17}/>}</button>; })}{!regions.length && <div className="ctrl-empty">No regions in {country.name}. <Link href="/admin/regions">Add one</Link> in Admin.</div>}</div></div>}
          {region && <div className="ctrl-step"><div className="ctrl-step-head"><span className="ctrl-step-number">03</span><div><h3>Location or mall</h3><p>Choose where the screens are installed.</p></div><span className="ctrl-step-total">{locations.length}</span></div><div className="ctrl-options">{locations.map((item) => { const count = countScreens({ storeId: item.id }); return <button key={item.id} className={`ctrl-option ${location?.id === item.id ? "selected" : ""}`} aria-pressed={location?.id === item.id} disabled={busy} onClick={() => { setQuery(""); onDisplayChange({ countryId: selection.countryId, regionId: region.id, storeId: item.id }); }}><span className="ctrl-option-icon"><MapPin size={18}/></span><span className="ctrl-option-name">{item.name}<small>{count} {count === 1 ? "screen" : "screens"}</small></span>{location?.id === item.id ? <Check size={17}/> : <ChevronRight size={17}/>}</button>; })}{!locations.length && <div className="ctrl-empty">No locations in {region.name}. <Link href="/admin/locations">Add one</Link> in Admin.</div>}</div></div>}
        </div></> : <div className="ctrl-steps"><div className="ctrl-step"><div className="ctrl-step-head"><span className="ctrl-step-number"><Layers3 size={18}/></span><div><h3>Available groups</h3><p>Select one to show its screens on the wall.</p></div><span className="ctrl-step-total">{groups.length}</span></div><div className="ctrl-options">{groups.map((item) => { const count = members.filter((member) => member.groupId === item.id).length; return <button key={item.id} className={`ctrl-option ${group?.id === item.id ? "selected" : ""}`} aria-pressed={group?.id === item.id} disabled={busy} onClick={() => { setQuery(""); onDisplayChange({ groupId: item.id }); }}><span className="ctrl-option-icon"><Layers3 size={18}/></span><span className="ctrl-option-name">{item.name}<small>{count} {count === 1 ? "screen" : "screens"} across locations</small></span>{group?.id === item.id ? <Check size={17}/> : <ChevronRight size={17}/>}</button>; })}{!groups.length && <div className="ctrl-empty">No groups yet. <Link href="/admin/groups">Create a group</Link> in Admin.</div>}</div></div></div>}
      </section>

      <section className="ctrl-panel ctrl-screens" aria-label="Screens in selected location or group">
        <div className="ctrl-panel-head"><div><span className="ctrl-overline">{mode === "groups" ? "GROUP SCREENS" : "Choose screens"}</span><h2>{scopeReady ? group?.name || location?.name || "Screens" : "Screens appear here"}</h2><p>{scopeReady ? "All screens are shown by default. Click a screen to show a smaller set." : mode === "groups" ? "Choose a group to see the screens assigned to it." : "Choose a country, region, and location to see its screens."}</p></div>{scopeReady && <span className="ctrl-screen-count">{availableScreens.length}</span>}</div>
        {scopeReady ? <><div className="ctrl-screen-tools"><label className="ctrl-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search these screens" aria-label="Search these screens"/></label><button className={`ctrl-all ${!selection.screenIds?.length ? "active" : ""}`} disabled={busy} onClick={() => onDisplayChange({ ...selection, screenIds: undefined })}>All screens</button></div><div className="ctrl-screen-list">{visibleScreens.map((screen) => <button key={screen.id} className={`ctrl-screen ${selection.screenIds?.includes(screen.id) ? "selected" : ""}`} aria-pressed={!!selection.screenIds?.includes(screen.id)} disabled={busy} onClick={() => selectScreen(screen.id)}><span className="ctrl-screen-icon"><Monitor size={20}/></span><span className="ctrl-screen-label"><strong>{screen.name}</strong><small>{screenPlace(screen, entities)}</small></span><span className={`ctrl-source ${screen.liveUrl ? "ready" : ""}`}>{screen.liveUrl ? "Preview link" : "No preview link"}</span><span className="ctrl-check">{selection.screenIds?.includes(screen.id) && <Check size={14}/>}</span></button>)}{!visibleScreens.length && <div className="ctrl-empty">{query ? "No screens match this search." : "There are no screens here yet."}</div>}</div><div className="ctrl-screen-foot"><SlidersHorizontal size={16}/>{selection.screenIds?.length ? `${selection.screenIds.length} selected for the wall` : `All ${availableScreens.length} screens in this ${group ? "group" : "location"} are on the wall`}</div></> : <div className="ctrl-screen-wait"><div className="ctrl-screen-wait-icon"><Monitor size={30}/></div><strong>{mode === "groups" ? "Pick a screen group" : "Choose a location first"}</strong><p>{mode === "groups" ? "The group's screens will appear here." : "Screens appear after you select a location or mall."}</p>{mode === "locations" && <div className="ctrl-wait-steps"><span className={country ? "done" : ""}>Country</span><ChevronRight size={14}/><span className={region ? "done" : ""}>Region</span><ChevronRight size={14}/><span className={location ? "done" : ""}>Location</span><ChevronRight size={14}/><span>Screens</span></div>}</div>}
      </section>
    </div>
  </div>;
}
