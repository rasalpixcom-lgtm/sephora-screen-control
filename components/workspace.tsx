"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleHelp, Expand, MapPin, Monitor, Palette, Pause, Play, Plus, UserRound, Settings2, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useTheme } from "next-themes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import SignOut from "@/components/sign-out";
import type { AuthUser } from "@/lib/auth-policy";
import ControllerPanel from "@/components/controller-panel";
import type { Display, Entity, EntityType, Member, Selection } from "@/lib/store";
import { clientFetch } from "@/lib/client-fetch";
import { screensFor as matchingScreens } from "@/lib/screens";

type State = { entities: Entity[]; members: Member[]; display: Display };
type View = "controller" | "admin" | "monitor";
type WallTheme = "dark" | "dim" | "soft";
type WebModelContext = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => Promise<unknown> }, options: { signal: AbortSignal }) => void | Promise<void> };
const empty: State = { entities: [], members: [], display: { selection: {}, autoAdvance: true, intervalSeconds: 10, updatedAt: "" } };
const labels: Record<EntityType, string> = { country: "Country", region: "Region", store: "Store / mall", screen: "Screen", group: "Group" };

function placeName(entity: Entity | undefined, entities: Entity[]) {
  if (!entity) return "";
  const store = entities.find((item) => item.id === entity.parentId);
  const region = entities.find((item) => item.id === store?.parentId);
  return [store?.name, region?.name].filter(Boolean).join(" · ");
}

function isOnSignEmbed(url: string) {
  try {
    const source = new URL(url);
    return source.protocol === "https:" && source.hostname === "app.onsign.tv" && source.pathname.startsWith("/embed/");
  } catch {
    return false;
  }
}

function ScreenCard({ screen, entities }: { screen: Entity; entities: Entity[] }) {
  return <article className="screen-card">
    <div className={`screen-viewport${screen.liveUrl && isOnSignEmbed(screen.liveUrl) ? " screen-viewport-onsign" : ""}`}>
      {screen.liveUrl ? <iframe title={`${screen.name} live preview`} src={screen.liveUrl} loading="lazy" referrerPolicy="no-referrer" allow="autoplay; fullscreen" /> : <div className="screen-placeholder"><Monitor size={30} strokeWidth={1.3} /><span>No preview</span></div>}
    </div>
    <div className="screen-caption"><div><strong>{screen.name}</strong><span>{placeName(screen, entities)}</span></div></div>
  </article>;
}

const wallThemes: { id: WallTheme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "dim", label: "Dim" },
  { id: "soft", label: "Soft light" },
];

function WallAppearance({ theme, onChange }: { theme: WallTheme; onChange: (theme: WallTheme) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);
  return <div className="wall-appearance" ref={menuRef}>
    <button type="button" className="icon-button monitor-icon" onClick={() => setOpen((current) => !current)} aria-label={`Wall appearance: ${wallThemes.find((option) => option.id === theme)?.label}`} aria-expanded={open} aria-controls="wall-theme-menu" title="Wall appearance"><Palette size={18}/></button>
    {open && <div className="wall-theme-menu" id="wall-theme-menu" role="menu" aria-label="Wall appearance">{wallThemes.map((option) => <button key={option.id} type="button" role="menuitemradio" aria-checked={theme === option.id} onClick={() => { onChange(option.id); setOpen(false); }}><span className={`wall-theme-swatch wall-theme-swatch-${option.id}`}/><span>{option.label}</span><span className="wall-theme-check" aria-hidden="true">{theme === option.id ? "✓" : ""}</span></button>)}</div>}
  </div>;
}

export default function Workspace({ view, account }: { view: View; account: AuthUser }) {
  const { resolvedTheme } = useTheme();
  const [state, setState] = useState<State>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(6);
  const [localPause, setLocalPause] = useState(false);
  const [wallTheme, setWallTheme] = useState<WallTheme>("dark");
  const [dialog, setDialog] = useState<{ type: EntityType; item?: Entity } | null>(null);
  const [draft, setDraft] = useState({ name: "", parentId: "", liveUrl: "" });
  const [assignGroup, setAssignGroup] = useState<string | null>(null);
  const pending = useRef(false);
  const reading = useRef(false);
  const revision = useRef(0);
  const wallGridRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const mutateRef = useRef<(body: Record<string, unknown>) => Promise<boolean>>(async () => false);
  const display = state.display;
  const selection = display.selection;
  const allScreens = useMemo(() => matchingScreens(state, selection), [state, selection]);
  const pages = Math.max(1, Math.ceil(allScreens.length / pageSize));

  const load = useCallback(async (showLoading = false) => {
    if (reading.current || pending.current) return;
    reading.current = true;
    const startedAt = revision.current;
    if (showLoading) setLoading(true);
    try {
      const response = await clientFetch("/api/state", { cache: "no-store" });
      if (response.status === 401) { window.location.replace(`/login?next=/${view === "monitor" ? "monitor" : "controller"}`); return; }
      const result = await response.json() as State & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load screen data.");
      if (startedAt === revision.current) { setState(result); setError(""); }
    } catch (cause) { if (startedAt === revision.current) setError(cause instanceof Error ? cause.message : "Could not load screen data."); }
    finally { reading.current = false; setLoading(false); }
  }, [view]);

  useEffect(() => { void Promise.resolve().then(() => load(true)); const timer = window.setInterval(() => void load(), 3000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    if (view !== "monitor") return;
    const saved = window.localStorage.getItem("sephora-wall-theme");
    queueMicrotask(() => setWallTheme(saved === "dark" || saved === "dim" || saved === "soft" ? saved : resolvedTheme === "light" ? "soft" : "dark"));
  }, [view, resolvedTheme]);
  useEffect(() => {
    if (view !== "monitor" || loading || !allScreens.length) return;
    const grid = wallGridRef.current;
    if (!grid) return;
    const updatePageSize = () => {
      const gap = 14;
      const targetWidth = Math.min(560, Math.max(370, window.innerWidth * .2));
      const columns = window.innerWidth <= 600 ? 1 : Math.max(1, Math.floor((grid.clientWidth + gap) / (targetWidth + gap)));
      const cardWidth = window.innerWidth <= 600 ? grid.clientWidth : targetWidth;
      const captionHeight = window.innerWidth <= 600 ? 55 : 64;
      const cardHeight = cardWidth * 9 / 16 + captionHeight + 2;
      // Leave room for the pager, even on a page where it is currently hidden.
      const availableHeight = window.innerHeight - grid.getBoundingClientRect().top - 55 - (window.innerWidth <= 600 ? 12 : Math.max(16, Math.min(window.innerWidth * .015, 30)));
      const rows = Math.max(1, Math.floor((availableHeight + gap) / (cardHeight + gap)));
      setPageSize((current) => current === columns * rows ? current : columns * rows);
    };
    updatePageSize();
    const observer = new ResizeObserver(updatePageSize);
    observer.observe(grid);
    window.addEventListener("resize", updatePageSize);
    return () => { observer.disconnect(); window.removeEventListener("resize", updatePageSize); };
  }, [view, loading, allScreens.length]);
  useEffect(() => { queueMicrotask(() => setPage((current) => Math.min(current, pages - 1))); }, [pages]);
  useEffect(() => {
    if (view !== "monitor" || !display.autoAdvance || localPause || pages < 2) return;
    const timer = window.setInterval(() => setPage((current) => (current + 1) % pages), display.intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [view, display.autoAdvance, display.intervalSeconds, localPause, pages]);

  const mutate = useCallback(async (body: Record<string, unknown>) => {
    if (pending.current) return false;
    revision.current++;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await clientFetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 401) { window.location.replace("/login?next=/controller"); return false; }
      const result = await response.json() as State & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save changes.");
      setState(result);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); return false; }
    finally { pending.current = false; setBusy(false); }
  }, []);
  useEffect(() => { mutateRef.current = mutate; }, [mutate]);

  useEffect(() => {
    if (view !== "controller") return;
    const context = (document as Document & { modelContext?: WebModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "set_wall_selection",
      title: "Set monitoring wall selection",
      description: "Choose countries, regions, stores, groups, or screens for the shared monitoring wall.",
      inputSchema: { type: "object", properties: { countryId: { type: "string" }, regionId: { type: "string" }, storeId: { type: "string" }, groupId: { type: "string" }, screenIds: { type: "array", items: { type: "string" } } }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const selection = input as Selection;
        if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw new Error("Invalid selection.");
        const current = stateRef.current;
        const valid = [[selection.countryId, "country"], [selection.regionId, "region"], [selection.storeId, "store"], [selection.groupId, "group"]].every(([id, type]) => !id || current.entities.some((item) => item.id === id && item.type === type));
        if (!valid || (selection.screenIds && (!Array.isArray(selection.screenIds) || selection.screenIds.some((id) => !current.entities.some((item) => item.id === id && item.type === "screen"))))) throw new Error("A selected item does not exist.");
        if (!await mutateRef.current({ action: "display", selection, autoAdvance: current.display.autoAdvance, intervalSeconds: current.display.intervalSeconds })) throw new Error("Could not save wall selection.");
        return { selection, screenCount: matchingScreens(stateRef.current, selection).length };
      },
    }, { signal: lifecycle.signal })).catch(() => {});
    return () => lifecycle.abort();
  }, [view]);

  const setDisplay = (next: Selection, options?: { autoAdvance?: boolean; intervalSeconds?: number }) => {
    if (pending.current) return;
    void mutate({ action: "display", selection: next, autoAdvance: options?.autoAdvance ?? display.autoAdvance, intervalSeconds: options?.intervalSeconds ?? display.intervalSeconds });
  };
  const changeWallTheme = (theme: WallTheme) => { window.localStorage.setItem("sephora-wall-theme", theme); setWallTheme(theme); };
  const byType = (type: EntityType, parentId?: string) => state.entities.filter((item) => item.type === type && (parentId === undefined || item.parentId === parentId));
  const country = state.entities.find((item) => item.id === selection.countryId);
  const region = state.entities.find((item) => item.id === selection.regionId);
  const store = state.entities.find((item) => item.id === selection.storeId);
  const group = state.entities.find((item) => item.id === selection.groupId);
  const viewTitle = view === "monitor" ? "Monitoring wall" : view === "admin" ? "Locations & screens" : "Wall controller";

  function openDialog(type: EntityType, item?: Entity) {
    setDraft({ name: item?.name || "", parentId: item?.parentId || "", liveUrl: item?.liveUrl || "" });
    setDialog({ type, item });
  }
  async function saveDialog(event: React.FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    const saved = await mutate({ action: dialog.item ? "update" : "create", id: dialog.item?.id, type: dialog.type, ...draft });
    if (saved) setDialog(null);
  }
  async function remove(item: Entity) {
    if (!window.confirm(`Delete ${item.name} and everything below it? This cannot be undone.`)) return;
    await mutate({ action: "delete", id: item.id });
  }

  return <div className={`app-shell ${view === "monitor" ? "app-shell-monitor" : ""}`} data-wall-theme={view === "monitor" ? wallTheme : undefined}>
    {view !== "monitor" && <header className="topbar"><Link href="/controller" className="brand" aria-label="Sephora Screen Control home"><span className="brand-mark">S</span><span className="brand-name">SEPHORA <span>CONTROL</span></span></Link><div className="topbar-divider"/><nav className="topnav" aria-label="Main navigation"><Link className={view === "controller" ? "active" : ""} href="/controller"><SlidersHorizontal size={16}/> Controller</Link>{account.role === "admin" && <Link className={view === "admin" ? "active" : ""} href="/admin"><Settings2 size={16}/> Admin</Link>}</nav><Link href="/account" className="icon-button" aria-label="Your account" title="Your account"><UserRound size={17}/></Link><SignOut compact className="icon-button"/><ThemeToggle className="workspace-theme-toggle"/><div className="topbar-right"><span className="workspace-dot"/> CENTRAL WORKSPACE <span className="topbar-time">{new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" }).format(new Date())} GST</span></div></header>}
    {error && <div role="alert" className="error-bar"><span>{error}</span><button onClick={() => void load()} aria-label="Retry"><X size={16}/></button></div>}
    {view === "monitor" ? <main className="monitor-main">
      <div className="monitor-heading"><div className="monitor-identity"><span className="monitor-wordmark">SEPHORA</span><span className="monitor-separator" aria-hidden="true"/><h1>{[country?.name, region?.name, store?.name, group?.name].filter(Boolean).join(" / ") || "All locations"}</h1><span className="monitor-count">{allScreens.length} {allScreens.length === 1 ? "screen" : "screens"}</span></div><div className="monitor-actions"><Link href="/account" className="icon-button monitor-icon" aria-label="Your account" title="Your account"><UserRound size={17}/></Link><SignOut compact className="icon-button monitor-icon"/><WallAppearance theme={wallTheme} onChange={changeWallTheme}/>{pages > 1 && display.autoAdvance && <button className="icon-button monitor-icon" onClick={() => setLocalPause(!localPause)} title={localPause ? "Resume rotation" : "Pause rotation"} aria-label={localPause ? "Resume rotation" : "Pause rotation"}>{localPause ? <Play size={18}/> : <Pause size={18}/>}</button>}<button className="icon-button monitor-icon" onClick={() => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.()} title="Toggle fullscreen" aria-label="Toggle fullscreen"><Expand size={18}/></button></div></div>
      {loading ? <div className="loading-panel">Loading screens…</div> : allScreens.length ? <><div className="wall-grid" ref={wallGridRef}>{allScreens.slice(page * pageSize, (page + 1) * pageSize).map((screen) => <ScreenCard key={screen.id} screen={screen} entities={state.entities}/>)}</div>{pages > 1 && <div className="wall-footer"><span className="wall-page-count">{page + 1} / {pages}</span><div className="wall-pager"><button onClick={() => setPage((page - 1 + pages) % pages)} aria-label="Previous set"><ChevronLeft size={20}/></button><button onClick={() => setPage((page + 1) % pages)} aria-label="Next set"><ChevronRight size={20}/></button></div></div>}</> : <div className="wall-empty"><Monitor size={32}/><h2>No screens selected</h2>{account.role !== "wall" && <Link href="/controller">Open controller</Link>}</div>}
    </main> : <main className="main-content">
      <div className="page-heading"><div><div className="eyebrow">OPERATIONS / {view === "admin" ? "CONFIGURATION" : "LIVE SELECTION"}</div><h1>{viewTitle}</h1><p>{view === "controller" ? "Choose a location or a screen group. The monitoring wall follows your selection." : "Organize locations, screen links, and cross-store groups."}</p></div>{view === "admin" && <div className="page-heading-actions"><button className="primary-button" onClick={() => openDialog("screen")}><Plus size={17}/> Add screen</button></div>}</div>
      {view !== "controller" && state.entities.some((item) => item.isDemo) && <div className="sample-note"><span className="sample-badge">SAMPLE SETUP</span><span>Example locations and screens are ready to explore. Add your OnSign links in Admin to show previews.</span></div>}
      {view === "controller" ? <ControllerPanel state={state} busy={busy} onDisplayChange={setDisplay}/> : <div className="admin-layout"><section className="admin-main"><div className="admin-intro"><div><span className="eyebrow">NETWORK INVENTORY</span><h2>Location hierarchy</h2></div><span>{state.entities.filter((item) => item.type === "screen").length} total screens</span></div><div className="admin-columns">{(["country", "region", "store", "screen"] as EntityType[]).map((type) => <div className="admin-column" key={type}><div className="admin-column-head"><h3>{labels[type]}s</h3><button onClick={() => openDialog(type)} aria-label={`Add ${labels[type]}`}><Plus size={17}/></button></div><div className="admin-items">{byType(type).map((item) => <div className="admin-item" key={item.id}><div className="admin-item-top"><span className="admin-item-icon">{type === "screen" ? <Monitor size={16}/> : <MapPin size={16}/>}</span><button className="admin-item-name" onClick={() => openDialog(type, item)}><strong>{item.name}</strong><small>{item.isDemo ? "Sample · " : ""}{type === "screen" ? item.liveUrl ? "Live link added" : "Add live link" : item.parentId ? state.entities.find((e) => e.id === item.parentId)?.name : "Top level"}</small></button><button className="delete-icon" onClick={() => remove(item)} aria-label={`Delete ${item.name}`}><Trash2 size={15}/></button></div></div>)}{!byType(type).length && <div className="admin-empty">Nothing added yet</div>}</div></div>)}</div></section><aside className="admin-side"><div className="side-card"><span className="eyebrow">CROSS-STORE COLLECTIONS</span><h2>Groups</h2><p>Bring matching placements together across any store.</p><div className="group-list">{byType("group").map((item) => <div className="group-row" key={item.id}><div><button className="group-name" onClick={() => openDialog("group", item)} title="Rename group">{item.name}</button><small>{state.members.filter((m) => m.groupId === item.id).length} screens</small></div><button onClick={() => setAssignGroup(item.id)}>Manage</button><button className="delete-icon" onClick={() => remove(item)} aria-label={`Delete ${item.name}`}><Trash2 size={15}/></button></div>)}</div><button className="outline-button full" onClick={() => openDialog("group")}><Plus size={16}/> New group</button></div><div className="side-hint"><CircleHelp size={18}/><span>Open a screen to add its OnSign live URL. The wall loads that URL as a preview when the provider permits embedding.</span></div></aside></div>}
    </main>}
    <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}><DialogContent className="edit-dialog"><DialogHeader><DialogTitle>{dialog?.item ? `Edit ${labels[dialog.type]}` : `Add ${dialog ? labels[dialog.type] : "item"}`}</DialogTitle><DialogDescription>{dialog?.type === "screen" ? "Give this screen a name and its OnSign live link." : "Keep names clear so teams can find the right display."}</DialogDescription></DialogHeader><form onSubmit={saveDialog} className="edit-form"><label>Name<input autoFocus required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder={dialog?.type === "screen" ? "Cash table · 01" : "Name"}/></label>{dialog && ["region","store","screen"].includes(dialog.type) && <label>{dialog.type === "region" ? "Country" : dialog.type === "store" ? "Region" : "Store / mall"}<select required value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">Select parent</option>{byType(dialog.type === "region" ? "country" : dialog.type === "store" ? "region" : "store").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{dialog?.type === "screen" && <label>OnSign live URL <span className="optional">optional</span><input type="url" value={draft.liveUrl} onChange={(event) => setDraft({ ...draft, liveUrl: event.target.value })} placeholder="https://…"/><small>The URL must support embedding to appear in the wall preview.</small></label>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={() => setDialog(null)}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>Save {dialog?.type && labels[dialog.type].toLowerCase()}</button></div></form></DialogContent></Dialog>
    <Dialog open={!!assignGroup} onOpenChange={(open) => !open && setAssignGroup(null)}><DialogContent className="edit-dialog assign-dialog"><DialogHeader><DialogTitle>{state.entities.find((e) => e.id === assignGroup)?.name}</DialogTitle><DialogDescription>Select screens to include in this group.</DialogDescription></DialogHeader><div className="assignment-list">{byType("screen").map((screen) => { const checked = state.members.some((member) => member.groupId === assignGroup && member.screenId === screen.id); return <label key={screen.id} className="assignment-row"><input type="checkbox" checked={checked} disabled={busy} onChange={(event) => void mutate({ action: "member", groupId: assignGroup, screenId: screen.id, enabled: event.target.checked })}/><span><strong>{screen.name}</strong><small>{placeName(screen, state.entities)}</small></span></label>; })}</div><button className="primary-button full" onClick={() => setAssignGroup(null)}>Done</button></DialogContent></Dialog>
  </div>;
}
