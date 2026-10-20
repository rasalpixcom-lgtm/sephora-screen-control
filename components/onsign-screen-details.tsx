"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import type { Entity } from "@/lib/store";
import type { OnSignDetails } from "@/lib/onsign-api-shared";
import OnSignExpandedDetails from "./onsign-expanded-details";
import "./onsign-details.css";

function date(value: string | null) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(parsed) + " GST" : "Not available";
}
export default function OnSignScreenDetails({ screen, header }: { screen: Entity; header: (connection: ReactNode) => ReactNode }) {
  const [snapshot, setSnapshot] = useState<OnSignDetails | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!screen.onsignPlayerId);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!screen.onsignPlayerId) return;
    let active = true;
    void (async () => {
      try {
        const response = await clientFetch(`/api/onsign?screenId=${encodeURIComponent(screen.id)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load device details.");
        if (active) { setSnapshot(data); setError(""); }
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Could not load device details."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [screen.id, screen.onsignPlayerId, revision]);
  const player = snapshot?.player;
  const status = error ? "Unavailable" : !player ? "Unknown" : player.isDetached ? "No device associated" : player.isConnected === true ? "Connected" : player.isConnected === false ? "Disconnected" : "Unknown";
  const connected = !error && !loading && player?.isConnected === true && !player.isDetached;
  const disconnected = !error && !loading && player?.isConnected === false && !player.isDetached;
  const connection = screen.onsignPlayerId ? <div className="onsign-header-connection" role="group" aria-label="OnSign connection">
    <div className="onsign-header-status">
      <strong className={connected ? "onsign-header-connected" : disconnected ? "onsign-header-disconnected" : ""} role="status"><span className="onsign-status-dot" aria-hidden="true"/>{loading ? "Checking…" : status}</strong>
      <small>{snapshot ? `Updated ${date(snapshot.fetchedAt)}` : loading ? "Loading device information…" : "Device information unavailable"}</small>
    </div>
    <button type="button" className="adm-icon-btn onsign-header-refresh" aria-label="Refresh OnSign details" title="Refresh OnSign details · results may be cached for up to 1 minute" disabled={loading} onClick={() => { setLoading(true); setRevision(value => value + 1); }}><RefreshCw size={17} className={loading ? "animate-spin" : ""}/></button>
  </div> : null;
  return <>{header(connection)}<div className="onsign-details-page">
    {!screen.onsignPlayerId ? <section className="adm-panel onsign-detail-card"><h2>No OnSign player linked</h2><p className="onsign-hint">Return to Screens and select Edit to link the matching OnSign player.</p></section> : <>
      {error && <div className="adm-error" role="alert">{error}{snapshot && " Previous information is shown below; it may be out of date."}</div>}
      {player && <OnSignExpandedDetails key={`${screen.id}:${revision}`} screenId={screen.id} player={player}/>}
      <p className="onsign-note">Connection shows communication with OnSign. It does not confirm that the physical screen is powered on or displaying correctly. Preview availability is measured separately.</p>
    </>}
  </div></>;
}
