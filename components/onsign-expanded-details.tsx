"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clientFetch } from "@/lib/client-fetch";
import { onSignLoops, type OnSignPlayer, type OnSignValue, type OnSignSection, type OnSignSectionResult, type OnSignLoop } from "@/lib/onsign-api-shared";

import { onSignMediaLinks, safeOnSignDownload } from "@/lib/onsign-content";
import ScreenHardwareInventory from "./screen-hardware-inventory";
import ScreenNotes from "./screen-notes";
import ScreenRemoteAccess from "./screen-remote-access";

type Values = Record<string, OnSignValue>;
const labels: Record<string, string> = {
  name: "Name", lastSeen: "Last contact", lastSync: "Last completed download", isInMaintenance: "Maintenance mode",
  isDetached: "Detached from physical device", syncProgress: "Download progress", errorCount: "Errors (last 24 hours)", warningCount: "Warnings (last 24 hours)",
  osVersion: "Operating system", version: "Player version", signalStrength: "Wi-Fi signal (%)",
  id: "ID", legacyId: "Legacy ID", activeAlertCount: "Active alerts", lastSeenAgo: "Last contact",
  lastSyncAgo: "Download completed", lastUpdate: "Last content or settings change", lastUpdateAgo: "Content or settings changed",
  utcOffset: "UTC offset (reported)", workingHoursStatus: "Working schedule status", estimatedLocalTime: "Estimated player local time",
  attrs: "Custom attributes", associationDate: "Organization association date", isUpdateLocked: "Version updates locked",
  updateRequested: "Version update requested", updateReady: "Applied update SHA", batteryLevel: "Battery (%)", serialNumber: "Serial number",
  webviewVersion: "WebView version", spmVersion: "SPM version", workingHours: "Weekly working hours", workingExceptions: "Schedule exceptions",
  pinnedNote: "Pinned note", createdAt: "Created", authorName: "Author", planName: "License plan", interval: "Billing interval (months)",
  renewsOn: "Renewal date", endsOn: "End date", source: "Location source", mac: "MAC address", inet: "LAN IP address", ssid: "Wi-Fi name",
  rssi: "Wi-Fi signal (dBm)", weekDays: "Days", startTime: "Start", endTime: "End", ranges: "Working periods", lastNotification: "Last notification",
  assignmentPaused: "Assignment paused", capturedAt: "Captured", downloadURL: "Download URL", isPaused: "Paused", __typename: "Content type", node: "Published content",
  duration: "Duration (seconds)", defaultDuration: "Default duration (seconds)", playbackDuration: "Playback duration (seconds)",
  playLink: "Trigger URL (text only)", isEndStrict: "Strict end", parentId: "Parent folder ID", ancestorIds: "Ancestor folder IDs",
};
const dates = new Set(["lastUpdate", "associationDate", "createdAt", "lastNotification", "capturedAt", "lastModified"]);
const elapsedFields = new Set(["lastSeenAgo", "lastSyncAgo", "lastUpdateAgo"]);
export function onSignElapsed(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "Not reported";
  const whole = Math.floor(seconds);
  const units = [{ name: "day", seconds: 86400 }, { name: "hour", seconds: 3600 }, { name: "minute", seconds: 60 }, { name: "second", seconds: 1 }];
  const first = units.findIndex(unit => whole >= unit.seconds);
  if (first === -1) return "0 seconds ago";
  let remaining = whole;
  const parts: string[] = [];
  for (const unit of units.slice(first, first + 2)) {
    const amount = Math.floor(remaining / unit.seconds);
    remaining %= unit.seconds;
    if (amount) parts.push(`${amount} ${unit.name}${amount === 1 ? "" : "s"}`);
  }
  return `${parts.join(", ")} ago`;
}
export function onSignDate(value: string | null) {
  if (!value) return "Not reported";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(parsed) + " GST" : "Not reported";
}
function label(key: string) { return labels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, value => value.toUpperCase()); }
function Value({ value, name = "" }: { value: OnSignValue | undefined; name?: string }) {
  if (value == null || value === "") return <>Not reported</>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "string") {
    if (dates.has(name)) return <>{onSignDate(value)}</>;
    const enums: Record<string, string> = { IN: "Within working hours", OUT: "Outside working hours", NO_SCHEDULE_CONFIGURED: "No schedule configured" };
    // URLs remain text unless explicitly offered as a safe media or capture link below.
    return <>{name === "workingHoursStatus" ? enums[value] || value : value}</>;
  }
  if (typeof value === "number") return <>{elapsedFields.has(name) ? onSignElapsed(value) : value}</>;
  if (Array.isArray(value)) {
    if (!value.length) return <>{name === "ranges" ? "Outside working hours" : "None reported"}</>;
    if (name === "weekDays") return <>{value.map(day => typeof day === "number" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || String(day) : String(day)).join(", ")}</>;
    if (value.every(item => typeof item !== "object" || item === null)) return <>{value.map(item => item === null ? "Not reported" : String(item)).join(", ")}</>;
    return <div className="onsign-value-list">{value.map((item, index) => <div className="onsign-value-item" key={index}><Value value={item}/></div>)}</div>;
  }
  return <DataFields values={value}/>;
}
function DataFields({ values, keys }: { values: Values; keys?: string[] }) {
  const entries = (keys || Object.keys(values)).map(key => [key, values[key]] as const);
  if (!entries.length) return <p className="onsign-hint">None reported.</p>;
  return <dl className="onsign-fields">{entries.map(([key, value]) => <div key={key}><dt>{key === "name" && ["Content", "Campaign", "Playlist"].includes(String(values.__typename)) ? "OnSign library name" : label(key)}</dt><dd><Value value={value} name={key}/></dd></div>)}</dl>;
}
function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return <details className="adm-panel onsign-detail-card onsign-disclosure" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>{title}</summary><div className="onsign-disclosure-body">{children}</div></details>;
}
async function load(screenId: string, section: OnSignSection, signal?: AbortSignal, after?: string | null, loop: OnSignLoop = "PRIMARY", groupId?: string) {
  const params = new URLSearchParams({ screenId, section });
  if (after) params.set("after", after);
  if (section === "content") params.set("loop", loop);
  if (groupId) params.set("groupId", groupId);
  const response = await clientFetch(`/api/onsign?${params}`, { cache: "no-store", signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load this section.");
  return data as OnSignSectionResult;
}
function RelatedList({ screenId, section, loop, groupId }: { screenId: string; section: Exclude<OnSignSection, "extended">; loop?: OnSignLoop; groupId?: string }) {
  const [data, setData] = useState<OnSignSectionResult | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void load(screenId, section, controller.signal, null, loop, groupId).then(result => { if (!controller.signal.aborted) { setData(result); setError(""); } }, reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load this section.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [screenId, section, loop, groupId, attempt]);
  async function more() {
    if (loading || !data?.pageInfo.hasNextPage) return;
    setLoading(true); setError("");
    try {
      const result = await load(screenId, section, undefined, data.pageInfo.endCursor, loop, groupId);
      if (result.pageInfo.hasNextPage && result.pageInfo.endCursor === data.pageInfo.endCursor) throw new Error("OnSign repeated a page. Refresh this section to try again.");
      const nodes = [...data.nodes, ...result.nodes.filter(item => !data.nodes.some(prior => prior.id === item.id))];
      // The upstream total can shrink while paging a changing alert list.
      setData({ ...result, nodes, totalCount: result.totalCount === null ? null : Math.max(result.totalCount, nodes.length) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load more information."); }
    finally { setLoading(false); }
  }
  const noActiveAlerts = section === "alerts" && data && !data.nodes.length && !data.pageInfo.hasNextPage && (data.totalCount === 0 || data.totalCount === null);
  return <div className="onsign-related-list">
    {error && <div className="adm-error" role="alert">{error}{data && " Previously loaded records are shown; they may be out of date."}</div>}
    <div className="onsign-list-toolbar"><p className="onsign-hint" role="status">{data ? `${noActiveAlerts ? "No active alerts." : `${data.nodes.length}${data.totalCount === null ? "" : ` of ${data.totalCount}`} records loaded`} · ${onSignDate(data.fetchedAt)}` : loading ? "Loading…" : "Information unavailable."}</p><button type="button" className="adm-secondary-btn" disabled={loading} onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Refresh section</button></div>
    {data?.values && (section === "content" ? <details className="onsign-content-more"><summary>Loop information</summary><div className="onsign-disclosure-body"><DataFields values={data.values}/></div></details> : <DataFields values={data.values}/>)}
    {data && !data.nodes.length && !noActiveAlerts && <p className="onsign-hint">No records returned for this {section === "content" ? "loop" : "section"}.</p>}
    <div className={section === "content" ? "onsign-content-grid" : "onsign-record-list"}>{data?.nodes.map((item, index) => section === "content" ? <ContentCard item={item} key={typeof item.id === "string" ? item.id : index}/> : <article className="onsign-record" key={typeof item.id === "string" ? item.id : index}>
      <DataFields values={item}/>
      {section === "captures" && safeOnSignDownload(item.downloadURL) && <a className="onsign-download" href={safeOnSignDownload(item.downloadURL)!} target="_blank" rel="noopener noreferrer">Open saved capture</a>}
      {section === "groups" && typeof item.id === "string" && <ContentSection screenId={screenId} groupId={item.id} title="Content published to this group"/>}
    </article>)}</div>
    {data?.pageInfo.hasNextPage && <button type="button" className="adm-secondary-btn" onClick={() => void more()} disabled={loading}>{loading ? "Loading…" : "Load more"}</button>}
  </div>;
}
function ContentCard({ item }: { item: Values }) {
  const node = item.node && typeof item.node === "object" && !Array.isArray(item.node) ? item.node : null;
  const title = typeof node?.name === "string" && node.name ? node.name : typeof item.name === "string" && item.name ? item.name : "Unnamed published item";
  return <article className="onsign-content-card">
    <header><p className="onsign-hint">{Array.isArray(item.actions) ? "Trigger name" : "OnSign library name"}</p><h3>{title}</h3></header>
    <DataFields values={{ __typename: node?.__typename ?? (Array.isArray(item.actions) ? "Trigger" : null), assignmentPaused: item.isPaused ?? null, duration: item.duration ?? null }} keys={["__typename", "assignmentPaused", "duration"]}/>
    <MediaDownloads item={item}/>
    <details className="onsign-content-more"><summary>More details<span className="onsign-sr-only"> for {title}</span></summary><div className="onsign-disclosure-body"><DataFields values={item}/></div></details>
  </article>;
}
function MediaDownloads({ item }: { item: Values }) {
  const links = onSignMediaLinks(item);
  if (!links.length) return null;
  return <div className="onsign-media-downloads"><p className="onsign-hint">OnSign server copies, not files retrieved from this device. Links may expire; refresh this section to request updated information.</p>{links.map(link => <a className="onsign-download" href={link.url} key={link.url} target="_blank" rel="noopener noreferrer">Open OnSign media: {link.name} (server copy)</a>)}</div>;
}
function LazySection({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [expanded, setExpanded] = useState(open);
  const [activated, setActivated] = useState(open);
  return <details className="adm-panel onsign-detail-card onsign-disclosure" open={expanded} onToggle={event => { setExpanded(event.currentTarget.open); if (event.currentTarget.open) setActivated(true); }}><summary>{title}</summary><div className="onsign-disclosure-body">{activated && children}</div></details>;
}
function ContentSection({ screenId, groupId, title = "Published content & playback loops" }: { screenId: string; groupId?: string; title?: string }) {
  const [loop, setLoop] = useState<OnSignLoop>("PRIMARY");
  const loopId = useId();
  return <LazySection title={title}><p className="onsign-hint">Names below are OnSign library names. They may differ from the original uploaded filenames; local filenames on the device are not available here. These are published assignments, not an inventory of files stored on the device. They do not confirm what is playing now. Media links open an OnSign server copy; your browser may display it or download it. Group assignments are listed under Player groups. Trigger URLs are text only and are never executed here.</p>
    <div className="onsign-loop-label"><label htmlFor={loopId}>Playback loop</label><Select value={loop} onValueChange={value => setLoop(value as OnSignLoop)}><SelectTrigger id={loopId} className="adm-location-trigger onsign-loop-trigger"><SelectValue/></SelectTrigger><SelectContent className="adm-location-options" position="popper" align="start" collisionPadding={16}>{onSignLoops.map(value => <SelectItem value={value} key={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent></Select></div>
    <RelatedList key={loop} screenId={screenId} section="content" loop={loop} groupId={groupId}/>
  </LazySection>;
}
const detailTabs = [
  { id: "device", label: "Device & network" },
  { id: "content", label: "Content" },
  { id: "alerts", label: "Alerts & captures" },
  { id: "hardware", label: "Hardware inventory" },
  { id: "notes", label: "Notes" },
  { id: "remote", label: "Remote access" },
  { id: "maintenance", label: "Maintenance" },
] as const;
type DetailTab = typeof detailTabs[number]["id"];

export default function OnSignExpandedDetails({ screenId, player, linked, onsignLoading }: { screenId: string; player: OnSignPlayer | null; linked: boolean; onsignLoading: boolean }) {
  const [extra, setExtra] = useState<Values>({}), [error, setError] = useState(""), [loading, setLoading] = useState(!!player);
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>(linked ? "content" : "hardware");
  const [visitedTabs, setVisitedTabs] = useState<DetailTab[]>([linked ? "content" : "hardware"]);
  const tabId = useId();
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const leaveHardware = useRef<(() => boolean) | null>(null);
  const leaveNotes = useRef<(() => boolean) | null>(null);
  const leaveRemote = useRef<(() => boolean) | null>(null);
  const registerLeaveGuard = useCallback((guard: (() => boolean) | null) => { leaveHardware.current = guard; }, []);
  const registerNotesLeaveGuard = useCallback((guard: (() => boolean) | null) => { leaveNotes.current = guard; }, []);
  const registerRemoteLeaveGuard = useCallback((guard: (() => boolean) | null) => { leaveRemote.current = guard; }, []);
  function selectTab(id: DetailTab) {
    if (id === activeTab) return true;
    if (activeTab === "hardware" && leaveHardware.current && !leaveHardware.current()) return false;
    if (activeTab === "notes" && leaveNotes.current && !leaveNotes.current()) return false;
    if (activeTab === "remote" && leaveRemote.current && !leaveRemote.current()) return false;
    setActiveTab(id);
    setVisitedTabs(previous => previous.includes(id) ? previous : [...previous, id]);
    return true;
  }
  useEffect(() => {
    if (!player) return;
    const controller = new AbortController();
    void load(screenId, "extended", controller.signal).then(data => { if (!controller.signal.aborted) { setExtra(data.values || {}); setError(""); } }, reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Additional details unavailable.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [screenId, player, attempt]);
  const p = player;
  const base: Values = { model: p?.model ?? null, osVersion: p?.osVersion ?? null, version: p?.version ?? null, timezone: p?.timezone ?? null, signalStrength: p?.signalStrength ?? null, ...extra };
  return <>
    {p && <section className="adm-panel onsign-detail-card onsign-overview"><h2>Overview</h2><DataFields values={{ name: p.name, id: p.id, lastSeen: onSignDate(p.lastSeen), isInMaintenance: p.isInMaintenance, isDetached: p.isDetached, activeAlertCount: extra.activeAlertCount ?? null, syncProgress: p.syncProgress === null ? null : `${p.syncProgress}%`, lastSync: onSignDate(p.lastSync), errorCount: p.errorCount, warningCount: p.warningCount }}/></section>}
    {p && (loading || error) && <div className="onsign-hint" role="status">{loading ? "Loading additional device information…" : <><div className="adm-error">{error} Basic information remains available.</div><button type="button" className="adm-secondary-btn" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>Retry additional details</button></>}</div>}
    <div className="onsign-tabs" role="tablist" aria-label="Screen details sections">
      {detailTabs.map((tab, index) => <button key={tab.id} ref={node => { tabButtons.current[index] = node; }}
        type="button" role="tab" id={`${tabId}-${tab.id}-tab`} aria-controls={`${tabId}-${tab.id}-panel`}
        aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1}
        onClick={() => selectTab(tab.id)} onKeyDown={event => {
          const target = event.key === "ArrowRight" ? (index + 1) % detailTabs.length
            : event.key === "ArrowLeft" ? (index + detailTabs.length - 1) % detailTabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? detailTabs.length - 1 : null;
          if (target === null) return;
          event.preventDefault(); if (selectTab(detailTabs[target].id)) tabButtons.current[target]?.focus();
        }}>{tab.label}</button>)}
    </div>
    <div className="onsign-tab-panel" role="tabpanel" id={`${tabId}-device-panel`} aria-labelledby={`${tabId}-device-tab`} hidden={activeTab !== "device"} tabIndex={0}>
      {!p ? <p className="onsign-hint">{linked ? onsignLoading ? "Loading OnSign device information…" : "OnSign device information is unavailable." : "Link an OnSign player to see live device and network information."}</p> : visitedTabs.includes("device") && <div className="onsign-tab-columns">
        <div className="onsign-tab-column">
          <Section title="Device & software" open><DataFields values={base} keys={["model", "serialNumber", "osVersion", "version", "webviewVersion", "spmVersion", "batteryLevel", "isUpdateLocked", "updateRequested", "updateReady"]}/></Section>
          <Section title="Working schedule & time"><p className="onsign-hint">Schedule times use the player’s local time zone. Other timestamps are labelled GST. Elapsed times are measured when fetched.</p><DataFields values={base} keys={["timezone", "utcOffset", "estimatedLocalTime", "workingHoursStatus", "workingHours", "workingExceptions"]}/></Section>
          <Section title="Management & license"><DataFields values={base} keys={["legacyId", "associationDate", "tags", "attrs", "pinnedNote", "subscription"]}/></Section>
        </div>
        <div className="onsign-tab-column">
          <Section title="Network" open><DataFields values={base} keys={["signalStrength"]}/>{Array.isArray(extra.network) ? <Value value={extra.network}/> : p.network.map((network, index) => <div className="onsign-network" key={index}><DataFields values={network}/></div>)}</Section>
          <Section title="Reported location"><Value value={extra.location}/></Section>
        </div>
      </div>}
    </div>
    <div className="onsign-tab-panel" role="tabpanel" id={`${tabId}-content-panel`} aria-labelledby={`${tabId}-content-tab`} hidden={activeTab !== "content"} tabIndex={0}>
      {!p ? <p className="onsign-hint">{linked ? onsignLoading ? "Loading OnSign content information…" : "OnSign content information is unavailable." : "Link an OnSign player to see published content and downloads."}</p> : <div className="onsign-tab-stack">
        <Section title="Content & downloads" open><p className="onsign-hint">{p.isConnected === false ? "This player is disconnected; values reflect its last report. " : ""}A completed download does not confirm current playback or the exact files on the device. Published content shows OnSign library names; local device filenames are not available here.</p><DataFields values={extra} keys={["lastUpdate", "lastUpdateAgo", "lastSyncAgo"]}/></Section>
        <ContentSection screenId={screenId}/>
        <LazySection title="Player groups"><RelatedList screenId={screenId} section="groups"/></LazySection>
      </div>}
    </div>
    <div className="onsign-tab-panel" role="tabpanel" id={`${tabId}-alerts-panel`} aria-labelledby={`${tabId}-alerts-tab`} hidden={activeTab !== "alerts"} tabIndex={0}>
      {!p ? <p className="onsign-hint">{linked ? onsignLoading ? "Loading OnSign alerts…" : "OnSign alerts and captures are unavailable." : "Link an OnSign player to see alerts and captures."}</p> : visitedTabs.includes("alerts") && <div className="onsign-tab-stack">
        <LazySection title="Active alert details" open><RelatedList screenId={screenId} section="alerts"/></LazySection>
        <LazySection title="Saved screen captures"><p className="onsign-hint">Existing captures only. Opening this section does not request a new capture. Download links may expire.</p><RelatedList screenId={screenId} section="captures"/></LazySection>
      </div>}
    </div>
    <div className="onsign-tab-panel" role="tabpanel" id={`${tabId}-hardware-panel`} aria-labelledby={`${tabId}-hardware-tab`} hidden={activeTab !== "hardware"} tabIndex={0}>
      {visitedTabs.includes("hardware") && <ScreenHardwareInventory screenId={screenId} onLeaveGuard={registerLeaveGuard}/>}
    </div>
    <div className="onsign-tab-panel" role="tabpanel" id={`${tabId}-notes-panel`} aria-labelledby={`${tabId}-notes-tab`} hidden={activeTab !== "notes"} tabIndex={0}>
      {visitedTabs.includes("notes") && <ScreenNotes screenId={screenId} onLeaveGuard={registerNotesLeaveGuard}/>}
    </div>
    <div className="onsign-tab-panel" role="tabpanel" id={`${tabId}-remote-panel`} aria-labelledby={`${tabId}-remote-tab`} hidden={activeTab !== "remote"} tabIndex={0}>
      {visitedTabs.includes("remote") && <ScreenRemoteAccess screenId={screenId} onLeaveGuard={registerRemoteLeaveGuard}/>}
    </div>
    <div className="onsign-tab-panel" role="tabpanel" id={`${tabId}-maintenance-panel`} aria-labelledby={`${tabId}-maintenance-tab`} hidden={activeTab !== "maintenance"} tabIndex={0}>
      <section className="adm-panel onsign-detail-card"><h2>Maintenance</h2><p className="onsign-hint">No maintenance information yet.</p></section>
    </div>
  </>;
}
