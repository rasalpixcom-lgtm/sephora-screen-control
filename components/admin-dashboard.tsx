"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity as ActivityIcon, ArrowUpRight, CircleHelp, ClipboardList, ExternalLink, Globe2, LayoutDashboard, Layers3, LogOut, Map, MapPin, Menu, Monitor, Plus, RefreshCw, Search, Settings2, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { Activity, Display, Entity, EntityType, Member } from "@/lib/store";
import { ThemeToggle } from "@/components/theme-toggle";
import "./admin-dashboard.css";

type State = { entities: Entity[]; members: Member[]; display: Display; activity: Activity[] };
export type Section = "dashboard" | "screens" | "countries" | "regions" | "locations" | "groups" | "activity" | "access" | "settings";
const empty: State = { entities: [], members: [], display: { selection: {}, autoAdvance: true, intervalSeconds: 10, updatedAt: "" }, activity: [] };
const sectionNames: Record<Section, string> = { dashboard: "Dashboard", screens: "Screens", countries: "Countries", regions: "Regions", locations: "Locations", groups: "Screen groups", activity: "Activity", access: "Access", settings: "Settings" };
const typeNames: Record<EntityType, string> = { country: "Country", region: "Region", store: "Location", screen: "Screen", group: "Group" };
const metricLabels: Record<EntityType, string> = { country: "Countries", region: "Regions", store: "Locations", screen: "Screens", group: "Groups" };
const metricPaths: Record<EntityType, string> = { country: "/admin/countries", region: "/admin/regions", store: "/admin/locations", screen: "/admin/screens", group: "/admin/groups" };
const navigation = [
  { id: "dashboard", icon: LayoutDashboard }, { id: "screens", icon: Monitor },
  { id: "countries", icon: Globe2 }, { id: "regions", icon: Map },
  { id: "locations", icon: MapPin }, { id: "groups", icon: Layers3 },
  { id: "activity", icon: ClipboardList }, { id: "access", icon: Users },
  { id: "settings", icon: Settings2 },
] as const;

function parentNames(item: Entity, entities: Entity[]) {
  const first = entities.find((candidate) => candidate.id === item.parentId);
  const second = entities.find((candidate) => candidate.id === first?.parentId);
  const third = entities.find((candidate) => candidate.id === second?.parentId);
  return [first?.name, second?.name, third?.name].filter(Boolean).join(" · ");
}

export default function AdminDashboard({ section, accountEmail }: { section: Section; accountEmail: string | null }) {
  const [state, setState] = useState<State>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ type: EntityType; item?: Entity } | null>(null);
  const [draft, setDraft] = useState({ name: "", parentId: "", liveUrl: "" });
  const [groupId, setGroupId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entity | null>(null);
  const entities = state.entities;
  const byType = useCallback((type: EntityType) => entities.filter((item) => item.type === type), [entities]);
  const currentWall = [state.display.selection.countryId, state.display.selection.regionId, state.display.selection.storeId, state.display.selection.groupId]
    .map((id) => entities.find((item) => item.id === id)?.name).filter(Boolean).join(" / ") || "All locations";

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const next = await response.json() as State & { error?: string };
      if (!response.ok) throw new Error(next.error || "Could not load inventory.");
      setState(next); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load inventory."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const next = await response.json() as State & { error?: string };
      if (!response.ok) throw new Error(next.error || "Could not save.");
      setState(next); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }
  function openEditor(type: EntityType, item?: Entity) {
    setDraft({ name: item?.name || "", parentId: item?.parentId || "", liveUrl: item?.liveUrl || "" });
    setEditor({ type, item });
  }
  async function saveEditor(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (await mutate({ action: editor.item ? "update" : "create", type: editor.type, id: editor.item?.id, ...draft })) setEditor(null);
  }
  const searchable = useMemo(() => entities.filter((item) => `${item.name} ${parentNames(item, entities)}`.toLowerCase().includes(search.toLowerCase())), [entities, search]);

  function entityTable(type: EntityType) {
    const list = searchable.filter((item) => item.type === type);
    return <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Name</th><th>{type === "country" ? "Regions" : type === "region" ? "Country" : type === "store" ? "Region / country" : "Location / region"}</th><th>{type === "screen" ? "Preview source" : "Screens"}</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{list.map((item) => <tr key={item.id}><td><div className="adm-name-cell"><span className="adm-list-icon">{type === "screen" ? <Monitor size={17}/> : type === "country" ? <Globe2 size={17}/> : <MapPin size={17}/>}</span><div><strong>{item.name}</strong>{item.isDemo ? <small>Sample data</small> : null}</div></div></td><td>{type === "country" ? byType("region").filter((child) => child.parentId === item.id).length : parentNames(item, entities)}</td><td>{type === "screen" ? item.liveUrl ? <span className="adm-source-ready">Link saved</span> : <span className="adm-source-missing">No link</span> : entities.filter((screen) => screen.type === "screen" && (type === "store" ? screen.parentId === item.id : type === "region" ? entities.find((store) => store.id === screen.parentId)?.parentId === item.id : entities.find((region) => region.id === entities.find((store) => store.id === screen.parentId)?.parentId)?.parentId === item.id)).length}</td><td><div className="adm-row-actions"><button onClick={() => openEditor(type, item)}>Edit</button><button className="adm-delete" onClick={() => setDeleteTarget(item)} aria-label={`Delete ${item.name}`}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{!list.length && <div className="adm-empty">No {typeNames[type].toLowerCase()}s match this view.</div>}</div>;
  }

  const sections: Partial<Record<Section, EntityType>> = { screens: "screen", countries: "country", regions: "region", locations: "store" };
  const currentType = sections[section];
  const sectionDescription: Record<Section, string> = {
    dashboard: "A clear view of the network and what needs setup.", screens: "Manage live preview links and screen placement.",
    countries: "The top level of the store hierarchy.", regions: "Organize cities and regions under countries.",
    locations: "Stores and malls where screens are installed.", groups: "Combine similar screens across locations.",
    activity: "Recent changes to the network and wall selection.", access: "Current access and the planned staff roles.",
    settings: "How the monitoring system is connected and updated.",
  };

  return <SidebarProvider className="adm-shell" style={{ "--sidebar-width": "18rem" } as React.CSSProperties}>
    <Sidebar collapsible="offcanvas" className="adm-sidebar"><SidebarHeader className="adm-sidebar-header"><Link href="/admin" className="adm-brand"><span className="adm-brand-icon"><Monitor size={23}/></span><span><strong>SEPHORA</strong><small>SCREEN CONTROL</small></span></Link></SidebarHeader><SidebarContent className="adm-sidebar-content"><SidebarGroup><SidebarGroupContent><SidebarMenu>{navigation.map(({ id, icon: Icon }) => <SidebarMenuItem key={id}><SidebarMenuButton asChild isActive={section === id} size="lg" className="adm-nav-button"><Link href={id === "dashboard" ? "/admin" : `/admin/${id}`}><Icon size={19}/><span>{sectionNames[id]}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup><div className="adm-sidebar-divider"/><div className="adm-sidebar-label">WORKSPACES</div><SidebarGroup><SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" className="adm-nav-button"><Link href="/controller"><ActivityIcon size={19}/><span>Wall controller</span><ArrowUpRight size={14} className="adm-nav-trailing"/></Link></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton asChild size="lg" className="adm-nav-button"><Link href="/monitor"><Monitor size={19}/><span>Monitoring wall</span><ArrowUpRight size={14} className="adm-nav-trailing"/></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter className="adm-sidebar-footer"><div className="adm-account"><span className="adm-account-avatar">S</span><div><strong>Workspace owner</strong><small>{accountEmail || "Private site account"}</small></div><a href="/signout-with-chatgpt?return_to=%2Fadmin" className="adm-signout"><LogOut size={17}/> Sign out</a></div></SidebarFooter></Sidebar>
    <SidebarInset className="adm-inset"><header className="adm-topbar"><SidebarTrigger className="adm-menu-trigger" aria-label="Toggle menu"><Menu size={19}/></SidebarTrigger><span className="adm-breadcrumb">SEPHORA / ADMINISTRATION <span>/</span> {sectionNames[section].toUpperCase()}</span><div className="adm-topbar-right"><ThemeToggle/><span className="adm-private-pill"><ShieldCheck size={15}/> PRIVATE WORKSPACE</span></div></header>
      <div className="adm-content"><div className="adm-page-head"><div><div className="adm-kicker">SCREEN NETWORK</div><h1>{sectionNames[section]}</h1><p>{sectionDescription[section]}</p></div><div className="adm-head-actions"><button className="adm-icon-btn" onClick={() => void load()} aria-label="Refresh data"><RefreshCw size={17}/></button>{currentType && <button className="adm-primary-btn" onClick={() => openEditor(currentType)}><Plus size={17}/> Add {typeNames[currentType].toLowerCase()}</button>}{section === "groups" && <button className="adm-primary-btn" onClick={() => openEditor("group")}><Plus size={17}/> Add group</button>}</div></div>
      {error && <div role="alert" className="adm-error"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16}/></button></div>}
      {loading ? <div className="adm-loading">Loading network…</div> : <>
        {section === "dashboard" && <><div className="adm-metrics">{(["country","region","store","screen","group"] as EntityType[]).map((type) => <Link href={metricPaths[type]} className="adm-metric" key={type}><span>{type === "screen" ? <Monitor size={21}/> : type === "country" ? <Globe2 size={21}/> : <Layers3 size={21}/>}</span><strong>{byType(type).length}</strong><small>{metricLabels[type]}</small></Link>)}</div><div className="adm-dashboard-grid"><section className="adm-panel"><div className="adm-panel-head"><div><h2>Needs a live link</h2><p>{byType("screen").filter((item) => !item.liveUrl).length} screens cannot show a preview yet</p></div><Link href="/admin/screens">View screens <ArrowUpRight size={15}/></Link></div><div className="adm-compact-list">{byType("screen").filter((item) => !item.liveUrl).slice(0,6).map((item) => <button key={item.id} onClick={() => openEditor("screen", item)}><span className="adm-list-icon"><Monitor size={16}/></span><span><strong>{item.name}</strong><small>{parentNames(item, entities)}</small></span><Plus size={16}/></button>)}{!byType("screen").some((item) => !item.liveUrl) && <div className="adm-empty">Every screen has a preview link.</div>}</div></section><section className="adm-panel"><div className="adm-panel-head"><div><h2>Monitoring wall</h2><p>Current shared selection</p></div></div><div className="adm-wall-summary"><div className="adm-wall-icon"><Monitor size={30}/></div><strong>{currentWall}</strong><span>{state.display.autoAdvance ? `Rotates every ${state.display.intervalSeconds} seconds` : "Rotation paused"}</span><div><Link href="/controller" className="adm-secondary-btn">Open controller</Link><Link href="/monitor" className="adm-primary-btn">Open wall <ArrowUpRight size={16}/></Link></div></div></section></div></>}
        {currentType && <section className="adm-panel adm-list-panel"><div className="adm-list-toolbar"><div className="adm-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${sectionNames[section].toLowerCase()}`} aria-label={`Search ${sectionNames[section].toLowerCase()}`}/></div><span>{byType(currentType).length} total</span></div>{entityTable(currentType)}</section>}
        {section === "groups" && <div className="adm-group-grid">{byType("group").map((group) => <article className="adm-group-card" key={group.id}><div className="adm-group-card-icon"><Layers3 size={23}/></div><div className="adm-group-card-heading"><div><h2>{group.name}</h2><p>{state.members.filter((member) => member.groupId === group.id).length} assigned screens</p></div><button className="adm-delete" onClick={() => setDeleteTarget(group)} aria-label={`Delete ${group.name}`}><Trash2 size={17}/></button></div><div className="adm-group-screen-list">{state.members.filter((member) => member.groupId === group.id).slice(0,3).map((member) => { const screen = entities.find((item) => item.id === member.screenId); return screen ? <span key={member.screenId}><Monitor size={14}/>{screen.name}<small>{parentNames(screen, entities).split(" · ")[0]}</small></span> : null; })}{!state.members.some((member) => member.groupId === group.id) && <span>No screens assigned</span>}</div><div className="adm-group-actions"><button className="adm-secondary-btn" onClick={() => openEditor("group", group)}>Rename</button><button className="adm-primary-btn" onClick={() => setGroupId(group.id)}>Manage screens</button></div></article>)}{!byType("group").length && <div className="adm-empty adm-panel">No groups yet. Add one to collect screens across stores.</div>}</div>}
        {section === "activity" && <section className="adm-panel"><div className="adm-panel-head"><div><h2>Recent activity</h2><p>Changes to inventory, groups, and wall selection</p></div></div><div className="adm-activity-list">{state.activity.map((entry) => <div key={entry.id}><span className="adm-activity-icon"><ActivityIcon size={17}/></span><div><strong>{entry.action} {entry.entityName || ""}</strong><small>{entry.actor}</small></div><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })}</time></div>)}{!state.activity.length && <div className="adm-empty">Changes will appear here after the first edit.</div>}</div></section>}
        {section === "access" && <div className="adm-info-grid"><section className="adm-panel adm-info-card"><ShieldCheck size={28}/><h2>Current access</h2><p>This site is private to its owner. Staff accounts and a dedicated view-only wall account will be activated with managed email/password sign-in before team rollout.</p><div className="adm-info-line"><span>Current session</span><strong>{accountEmail || "Private owner"}</strong></div><div className="adm-info-line"><span>Staff roles</span><strong>Pending login setup</strong></div></section><section className="adm-panel adm-info-card"><Users size={28}/><h2>Planned roles</h2><ul><li><strong>Admin</strong> — inventory, groups, accounts, audit</li><li><strong>Controller</strong> — wall selection and rotation</li><li><strong>Wall device</strong> — monitoring view only</li></ul></section></div>}
        {section === "settings" && <div className="adm-info-grid"><section className="adm-panel adm-info-card"><Monitor size={28}/><h2>OnSign previews</h2><p>Each screen stores its own HTTPS live preview URL. Embedding depends on OnSign allowing that URL in an iframe.</p><div className="adm-info-line"><span>Configured links</span><strong>{byType("screen").filter((item) => !!item.liveUrl).length} of {byType("screen").length}</strong></div><div className="adm-info-line"><span>Online/offline status</span><strong>Unavailable with preview URLs only</strong></div></section><section className="adm-panel adm-info-card"><CircleHelp size={28}/><h2>How the views connect</h2><p>Admin saves locations and links. Controller saves one shared selection. The wall reads the same database every three seconds and shows up to six previews per page.</p><div className="adm-info-line"><span>Wall rotation</span><strong>{state.display.autoAdvance ? `${state.display.intervalSeconds} seconds` : "Paused"}</strong></div><div className="adm-info-line"><span>Deployment</span><strong>Private</strong></div></section></div>}
      </>}
      </div></SidebarInset>

    <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}><DialogContent className="adm-dialog"><DialogHeader><DialogTitle>{editor?.item ? `Edit ${typeNames[editor.type]}` : editor ? `Add ${typeNames[editor.type]}` : "Edit"}</DialogTitle><DialogDescription>{editor?.type === "screen" ? "Add the screen to a location and save its OnSign preview URL." : "Keep the name clear for everyone using the network."}</DialogDescription></DialogHeader><form onSubmit={saveEditor} className="adm-form"><label>Name<input autoFocus required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>{editor && ["region","store","screen"].includes(editor.type) && <label>{editor.type === "region" ? "Country" : editor.type === "store" ? "Region" : "Location"}<select required value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">Select {editor.type === "region" ? "country" : editor.type === "store" ? "region" : "location"}</option>{byType(editor.type === "region" ? "country" : editor.type === "store" ? "region" : "store").map((item) => <option key={item.id} value={item.id}>{item.name}{item.parentId ? ` · ${parentNames(item, entities)}` : ""}</option>)}</select></label>}{editor?.type === "screen" && <label>OnSign live URL <small>Optional until the link is ready</small><input type="url" value={draft.liveUrl} onChange={(event) => setDraft({ ...draft, liveUrl: event.target.value })} placeholder="https://…"/></label>}<div className="adm-form-actions"><button type="button" className="adm-secondary-btn" onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={busy}>Save {editor ? typeNames[editor.type].toLowerCase() : ""}</button></div></form></DialogContent></Dialog>
    <Dialog open={!!groupId} onOpenChange={(open) => !open && setGroupId(null)}><DialogContent className="adm-dialog"><DialogHeader><DialogTitle>{entities.find((item) => item.id === groupId)?.name}</DialogTitle><DialogDescription>Choose screens from any location.</DialogDescription></DialogHeader><div className="adm-assignment-list">{byType("screen").map((screen) => { const checked = state.members.some((member) => member.groupId === groupId && member.screenId === screen.id); return <label key={screen.id}><input type="checkbox" checked={checked} disabled={busy} onChange={(event) => void mutate({ action: "member", groupId, screenId: screen.id, enabled: event.target.checked })}/><span><strong>{screen.name}</strong><small>{parentNames(screen, entities)}</small></span></label>; })}</div><button className="adm-primary-btn" onClick={() => setGroupId(null)}>Done</button></DialogContent></Dialog>
    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle><AlertDialogDescription>Deleting this item also deletes everything below it in the location hierarchy. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { if (deleteTarget) void mutate({ action: "delete", id: deleteTarget.id }); setDeleteTarget(null); }}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </SidebarProvider>;
}

