"use client";

import { useEffect, useId, useRef, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import type { OnSignPlayerOption } from "@/lib/onsign-api-shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OnSignPlayerPicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled: boolean }) {
  const id = useId();
  const [players, setPlayers] = useState<OnSignPlayerOption[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void (async () => {
      try {
        const response = await clientFetch("/api/onsign", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load OnSign players.");
        if (active) { setPlayers(data.players); setConfigured(data.configured); setError(""); }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Could not load OnSign players."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; mounted.current = false; };
  }, [revision]);

  const selected = players.find(player => player.id === value);
  const filtered = players.filter(player => `${player.name} ${player.id}`.toLowerCase().includes(search.trim().toLowerCase()));
  const options = value && !filtered.some(player => player.id === value) ? [{ id: value, name: selected?.name || "Current player" }, ...filtered] : filtered;
  const selectedLabel = value ? `${selected?.name || "Current player"} · ${value}` : "No player linked";
  return <div className="onsign-picker">
    <label htmlFor={id}>OnSign player <small>Optional · links device information to this screen</small></label>
    {configured && !error && <input aria-label="Search OnSign players" placeholder="Search player name or ID" value={search} disabled={disabled || loading} onChange={event => setSearch(event.target.value)}/>}
    <Select value={value ? `player:${value}` : "none"} disabled={disabled || loading} onValueChange={next => onChange(next === "none" ? "" : next.slice(7))}>
      <SelectTrigger id={id} className="adm-location-trigger onsign-player-trigger" title={selectedLabel}><SelectValue>{selectedLabel}</SelectValue></SelectTrigger>
      <SelectContent className="adm-location-options onsign-player-options" position="popper" align="start" collisionPadding={16}>
        <SelectItem value="none">No player linked</SelectItem>
        {options.map(player => <SelectItem key={player.id} value={`player:${player.id}`} textValue={`${player.name} ${player.id}`}><span className="onsign-option-copy"><span>{player.name}</span><small>{player.id}</small></span></SelectItem>)}
      </SelectContent>
    </Select>
    <p className="onsign-hint" role="status">{loading ? "Loading OnSign players…" : error || (!configured ? "OnSign is not configured. Add ONSIGN_API_TOKEN to the server’s .env.local and restart the server." : !players.length ? "No players are available in this OnSign account." : !filtered.length ? "No players match your search." : "Select the matching player. Your preview link works separately.")}</p>
    {error && <button type="button" className="adm-secondary-btn" disabled={disabled || loading} onClick={() => { if (mounted.current) { setLoading(true); setRevision(value => value + 1); } }}>Retry loading players</button>}
  </div>;
}
