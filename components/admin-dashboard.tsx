"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";

import Link from "next/link";

import { Activity as ActivityIcon, ArrowUpRight, CircleHelp, ClipboardList, Globe2, LayoutDashboard, Layers3, Map, MapPin, Menu, Monitor, Plus, RefreshCw, Search, Settings2, ShieldCheck, Users, Trash2, X } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import type { Activity, Display, Entity, EntityType, Member } from "@/lib/store";

import { ThemeToggle } from "@/components/theme-toggle";

import "./admin-dashboard.css";
import SignOut from "@/components/sign-out";
import UsersPanel from "@/components/users-panel";
import ChangePassword from "@/components/change-password";



type State = { entities: Entity[]; members: Member[]; display: Display; activity: Activity[] };

export type Section = "dashboard" | "screens" | "countries" | "regions" | "locations" | "groups" | "activity" | "settings" | "users";

const empty: State = { entities: [], members: [], display: { selection: {}, autoAdvance: true, intervalSeconds: 10, updatedAt: "" }, activity: [] };

const sectionNames: Record<Section, string> = { dashboard: "Dashboard", screens: "Screens", countries: "Countries", regions: "Regions", locations: "Locations", groups: "Groups", activity: "Activity", settings: "Settings", users: "Users" };

const typeNames: Record<EntityType, string> = { country: "Country", region: "Region", store: "Location", screen: "Screen", group: "Group" };

const metricLabels: Record<EntityType, string> = { country: "Countries", region: "Regions", store: "Locations", screen: "Screens", group: "Groups" };

const metricPaths: Record<EntityType, string> = { country: "/admin/countries", region: "/admin/regions", store: "/admin/locations", screen: "/admin/screens", group: "/admin/groups" };

const navigation = [

  { id: "dashboard", icon: LayoutDashboard }, { id: "screens", icon: Monitor },

  { id: "countries", icon: Globe2 }, { id: "regions", icon: Map },

  { id: "locations", icon: MapPin }, { id: "groups", icon: Layers3 },

  { id: "activity", icon: ClipboardList },

  { id: "users", icon: Users },
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
  const [usersRefreshKey, setUsersRefreshKey] = useState(0);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const reading = useRef(false);
  const revision = useRef(0);

  const [search, setSearch] = useState("");

  const [editor, setEditor] = useState<{ type: EntityType; item?: Entity } | null>(null);

  const [draft, setDraft] = useState({ name: "", parentId: "", liveUrl: "" });

  const [groupId, setGroupId] = useState<string | null>(null);

  const [assignmentSearch, setAssignmentSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Entity | null>(null);

  const entities = state.entities;

  const byType = useCallback((type: EntityType) => entities.filter((item) => item.type === type), [entities]);

  const currentWall = [state.display.selection.countryId, state.display.selection.regionId, state.display.selection.storeId, state.display.selection.groupId]

    .map((id) => entities.find((item) => item.id === id)?.name).filter(Boolean).join(" / ") || "All locations";



  const load = useCallback(async () => {
    if (reading.current || saving.current) return;
    reading.current = true;
    const startedAt = revision.current;

    try {

      const response = await clientFetch("/api/state", { cache: "no-store" });

      if (response.status === 401) { window.location.replace("/login?next=/admin"); return; }
      const next = await response.json() as State & { error?: string };

      if (!response.ok) throw new Error(next.error || "Could not load inventory.");

      if (startedAt === revision.current) { setState(next); setError(""); setUsersRefreshKey((value) => value + 1); }

    } catch (cause) { if (startedAt === revision.current) setError(cause instanceof Error ? cause.message : "Could not load inventory."); }

    finally { reading.current = false; setLoading(false); }

  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);



  async function mutate(body: Record<string, unknown>) {
    if (saving.current) return false;
    saving.current = true;
    revision.current++;

    setBusy(true); setError("");

    try {

      const response = await clientFetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

      if (response.status === 401) { window.location.replace("/login?next=/admin"); return; }
      const next = await response.json() as State & { error?: string };

      if (!response.ok) throw new Error(next.error || "Could not save.");

      setState(next); return true;

    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save."); return false; }

    finally { saving.current = false; setBusy(false); }

  }

  function openEditor(type: EntityType, item?: Entity) {

    setError("");

    setDraft({ name: item?.name || "", parentId: item?.parentId || "", liveUrl: item?.liveUrl || "" });

    setEditor({ type, item });

  }

  async function saveEditor(event: React.FormEvent) {

    event.preventDefault();

    if (!editor || busy) return;

    if (await mutate({ action: editor.item ? "update" : "create", type: editor.type, id: editor.item?.id, ...draft })) setEditor(null);

  }

  const searchable = useMemo(() => entities.filter((item) => `${item.name} ${parentNames(item, entities)}`.toLowerCase().includes(search.trim().toLowerCase())), [entities, search]);

  const missingLinks = byType("screen").filter((item) => !item.liveUrl);

  const assignmentScreens = byType("screen").filter((item) => `${item.name} ${parentNames(item, entities)}`.toLowerCase().includes(assignmentSearch.trim().toLowerCase()));

  function openGroup(id: string) { setError(""); setAssignmentSearch(""); setGroupId(id); }

  function openDelete(item: Entity) { setError(""); setDeleteTarget(item); }

  const dialogError = error ? <div className="adm-error" role="alert">{error}</div> : null;



  function entityTable(type: EntityType) {

    const list = searchable.filter((item) => item.type === type);

    return <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Name</th><th>{type === "country" ? "Regions" : type === "region" ? "Country" : type === "store" ? "Region / country" : "Location / region"}</th><th>{type === "screen" ? "Preview source" : "Screens"}</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{list.map((item) => <tr key={item.id}><td><div className="adm-name-cell"><span className="adm-list-icon">{type === "screen" ? <Monitor size={17}/> : type === "country" ? <Globe2 size={17}/> : <MapPin size={17}/>}</span><div><strong>{item.name}</strong>{item.isDemo ? <small>Sample data</small> : null}</div></div></td><td>{type === "country" ? byType("region").filter((child) => child.parentId === item.id).length : parentNames(item, entities)}</td><td>{type === "screen" ? item.liveUrl ? <span className="adm-source-ready">Link saved</span> : <span className="adm-source-missing">No link</span> : entities.filter((screen) => screen.type === "screen" && (type === "store" ? screen.parentId === item.id : type === "region" ? entities.find((store) => store.id === screen.parentId)?.parentId === item.id : entities.find((region) => region.id === entities.find((store) => store.id === screen.parentId)?.parentId)?.parentId === item.id)).length}</td><td><div className="adm-row-actions"><button aria-label={`Edit ${item.name}`} onClick={() => openEditor(type, item)}>Edit</button><button className="adm-delete" onClick={() => openDelete(item)} aria-label={`Delete ${item.name}`}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{!list.length && <div className="adm-empty">{search.trim() ? `No ${metricLabels[type].toLowerCase()} match your search.` : `No ${metricLabels[type].toLowerCase()} yet. Add your first ${typeNames[type].toLowerCase()} to get started.`}</div>}</div>;

  }



  const sections: Partial<Record<Section, EntityType>> = { screens: "screen", countries: "country", regions: "region", locations: "store" };

  const currentType = sections[section];

  const sectionDescription: Record<Section, string> = {

    dashboard: "Your locations, screens, and preview links.", screens: "Manage screens and their OnSign preview links.",

    countries: "Manage the countries in your network.", regions: "Manage regions within each country.",

    locations: "Stores and malls where screens are installed.", groups: "Combine similar screens across locations.",

    activity: "Recent changes to screens, groups, and the monitoring wall.",

    settings: "Preview links and monitoring wall behavior.",
    users: "Accounts and permissions for your team.",

  };



  return <SidebarProvider className="adm-shell" style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>

    <Sidebar collapsible="offcanvas" className="adm-sidebar"><SidebarHeader className="adm-sidebar-header"><Link href="/admin" className="adm-brand"><span className="adm-brand-icon"><Monitor size={23}/></span><span><strong>SEPHORA</strong><small>SCREEN CONTROL</small></span></Link></SidebarHeader><SidebarContent className="adm-sidebar-content"><SidebarGroup><SidebarGroupContent><SidebarMenu>{navigation.map(({ id, icon: Icon }) => <SidebarMenuItem key={id}><SidebarMenuButton asChild isActive={section === id} size="lg" className="adm-nav-button"><Link href={id === "dashboard" ? "/admin" : `/admin/${id}`}><Icon size={19}/><span>{sectionNames[id]}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup><div className="adm-sidebar-divider"/><div className="adm-sidebar-label">WORKSPACES</div><SidebarGroup><SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild size="lg" className="adm-nav-button"><Link href="/controller"><ActivityIcon size={19}/><span>Wall controller</span><ArrowUpRight size={14} className="adm-nav-trailing"/></Link></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton asChild size="lg" className="adm-nav-button"><Link href="/monitor"><Monitor size={19}/><span>Monitoring wall</span><ArrowUpRight size={14} className="adm-nav-trailing"/></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter className="adm-sidebar-footer"><div className="adm-account"><span className="adm-account-avatar">S</span><div><strong>Administrator</strong><small>{accountEmail || "Admin account"}</small></div><SignOut className="adm-signout"/></div></SidebarFooter></Sidebar>

    <SidebarInset className="adm-inset">

      <div className="adm-content"><header className="adm-page-head"><div className="adm-page-heading"><div className="adm-title-row"><SidebarTrigger className="adm-menu-trigger" aria-label="Toggle menu"><Menu size={19}/></SidebarTrigger><h1>{sectionNames[section]}</h1></div><p>{sectionDescription[section]}</p></div><div className="adm-head-actions"><ThemeToggle/><button className="adm-icon-btn" onClick={() => void load()} aria-label="Refresh data"><RefreshCw size={17}/></button>{currentType && <button className="adm-primary-btn" onClick={() => openEditor(currentType)}><Plus size={17}/> Add {typeNames[currentType].toLowerCase()}</button>}{section === "groups" && <button className="adm-primary-btn" onClick={() => openEditor("group")}><Plus size={17}/> Add group</button>}</div></header>

      {error && !editor && !groupId && !deleteTarget && <div role="alert" className="adm-error"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16}/></button></div>}

      {loading ? <div className="adm-loading">Loading network…</div> : <>

        {section === "dashboard" && <>

          <section className="adm-wall-status" aria-label="Current monitoring wall selection"><Monitor size={20}/><div><span>Currently showing</span><strong>{currentWall}</strong></div><span className="adm-wall-rotation">{state.display.autoAdvance ? `Automatic rotation · ${state.display.intervalSeconds}s` : "Rotation paused"}</span></section>

          <div className="adm-inventory-heading"><h2>Your network</h2><span>Countries · locations · displays</span></div>

          <div className="adm-metrics">{(["country","region","store","screen","group"] as EntityType[]).map((type) => <Link href={metricPaths[type]} className="adm-metric" key={type}><span>{type === "screen" ? <Monitor size={20}/> : type === "country" ? <Globe2 size={20}/> : <Layers3 size={20}/>}</span><strong>{byType(type).length}</strong><small>{metricLabels[type]}</small>{type === "screen" && <em className="adm-metric-detail">{byType("screen").filter((item) => !!item.liveUrl).length} of {byType("screen").length} preview links added</em>}<ArrowUpRight className="adm-metric-arrow" size={14}/></Link>)}</div>

          <section className="adm-panel adm-attention"><div className="adm-panel-head"><div><h2>Screens missing a preview link</h2><p>{missingLinks.length} {missingLinks.length === 1 ? "screen needs" : "screens need"} a preview link</p></div><Link href="/admin/screens">All screens <ArrowUpRight size={15}/></Link></div><div className="adm-compact-list">{missingLinks.slice(0,6).map((item) => <button key={item.id} onClick={() => openEditor("screen", item)}><span className="adm-list-icon"><Monitor size={16}/></span><span><strong>{item.name}</strong><small>{parentNames(item, entities)}</small></span><span className="adm-setup-action">Add link <Plus size={14}/></span></button>)}{!byType("screen").some((item) => !item.liveUrl) && <div className="adm-empty">{byType("screen").length ? "Every screen has a preview link." : "No screens yet. Add a location and its screens to get started."}</div>}</div></section>

        </>}

        {currentType && <section className="adm-panel adm-list-panel"><div className="adm-list-toolbar"><div className="adm-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${sectionNames[section].toLowerCase()}`} aria-label={`Search ${sectionNames[section].toLowerCase()}`}/></div><span>{search.trim() ? `${searchable.filter((item) => item.type === currentType).length} of ${byType(currentType).length}` : `${byType(currentType).length} total`}</span></div>{entityTable(currentType)}</section>}

        {section === "groups" && <div className="adm-group-grid">{byType("group").map((group) => <article className="adm-group-card" key={group.id}><div className="adm-group-card-heading"><div><h2>{group.name}</h2><p>{state.members.filter((member) => member.groupId === group.id).length} assigned screens</p></div><button className="adm-delete" onClick={() => openDelete(group)} aria-label={`Delete ${group.name}`}><Trash2 size={17}/></button></div><div className="adm-group-screen-list">{state.members.filter((member) => member.groupId === group.id).slice(0,3).map((member) => { const screen = entities.find((item) => item.id === member.screenId); return screen ? <span key={member.screenId}><Monitor size={14}/>{screen.name}<small>{parentNames(screen, entities).split(" · ")[0]}</small></span> : null; })}{state.members.filter((member) => member.groupId === group.id).length > 3 && <span>+{state.members.filter((member) => member.groupId === group.id).length - 3} more screens</span>}{!state.members.some((member) => member.groupId === group.id) && <span>No screens assigned</span>}</div><div className="adm-group-actions"><button className="adm-secondary-btn" onClick={() => openEditor("group", group)}>Rename</button><button className="adm-primary-btn" onClick={() => openGroup(group.id)}>Manage screens</button></div></article>)}{!byType("group").length && <div className="adm-empty adm-panel">No groups yet. Add one to collect screens across stores.</div>}</div>}

        {section === "activity" && <section className="adm-panel"><div className="adm-activity-list">{state.activity.map((entry) => <div key={entry.id}><span className="adm-activity-icon"><ActivityIcon size={17}/></span><div><strong>{entry.action.charAt(0).toUpperCase() + entry.action.slice(1)} {entry.entityName || ""}</strong><small>{entry.actor}</small></div><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" })}</time></div>)}{!state.activity.length && <div className="adm-empty">Changes will appear here after the first edit.</div>}</div></section>}


        {section === "users" && <UsersPanel accountEmail={accountEmail} refreshKey={usersRefreshKey}/>}
        {section === "settings" && <><div className="adm-info-grid"><section className="adm-panel adm-info-card"><Monitor size={28}/><h2>OnSign previews</h2><p>Add an HTTPS OnSign preview link when creating or editing a screen. OnSign must allow the preview to be embedded.</p><div className="adm-info-line"><span>Configured links</span><strong>{byType("screen").filter((item) => !!item.liveUrl).length} of {byType("screen").length}</strong></div><div className="adm-info-line"><span>Online/offline status</span><strong>Unavailable with preview URLs only</strong></div></section><section className="adm-panel adm-info-card"><CircleHelp size={28}/><h2>Monitoring wall</h2><p>The wall follows the Controller selection. Cards fit the display size, with additional screens shown on the next page.</p><div className="adm-info-line"><span>Wall rotation</span><strong>{state.display.autoAdvance ? `${state.display.intervalSeconds} seconds` : "Paused"}</strong></div><div className="adm-info-line"><span>Selection refresh</span><strong>Every 3 seconds</strong></div></section></div><section className="adm-panel adm-signin-status" aria-label="Sign-in status"><ShieldCheck size={20}/><div><h2>Login ID and password sign-in</h2><p>Manage Admin, Controller, and Wall device accounts in <Link href="/admin/users">Users</Link>. Staff sessions last 8 hours; wall device sessions last 30 days.</p></div></section><ChangePassword/></>}

      </>}

      </div></SidebarInset>



    <Dialog open={!!editor} onOpenChange={(open) => !open && !busy && setEditor(null)}><DialogContent className="adm-dialog"><DialogHeader><DialogTitle>{editor?.item ? `Edit ${typeNames[editor.type]}` : editor ? `Add ${typeNames[editor.type]}` : "Edit"}</DialogTitle><DialogDescription>{editor?.type === "screen" ? "Add the screen to a location and save its OnSign preview URL." : "Keep the name clear for everyone using the network."}</DialogDescription></DialogHeader>{dialogError}<form onSubmit={saveEditor} className="adm-form"><label>Name<input autoFocus required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>{editor && ["region","store","screen"].includes(editor.type) && <label>{editor.type === "region" ? "Country" : editor.type === "store" ? "Region" : "Location"}<select required value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">Select {editor.type === "region" ? "country" : editor.type === "store" ? "region" : "location"}</option>{byType(editor.type === "region" ? "country" : editor.type === "store" ? "region" : "store").map((item) => <option key={item.id} value={item.id}>{item.name}{item.parentId ? ` · ${parentNames(item, entities)}` : ""}</option>)}</select></label>}{editor?.type === "screen" && <label>OnSign live URL <small>Optional until the link is ready</small><input type="url" value={draft.liveUrl} onChange={(event) => setDraft({ ...draft, liveUrl: event.target.value })} placeholder="https://…"/></label>}<div className="adm-form-actions"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={busy}>{busy ? "Saving..." : `Save ${editor ? typeNames[editor.type].toLowerCase() : ""}`}</button></div></form></DialogContent></Dialog>

    <Dialog open={!!groupId} onOpenChange={(open) => !open && !busy && setGroupId(null)}><DialogContent className="adm-dialog"><DialogHeader><DialogTitle>{entities.find((item) => item.id === groupId)?.name}</DialogTitle><DialogDescription>Choose screens from any location. Changes save automatically.</DialogDescription></DialogHeader>{dialogError}<div className="adm-search"><Search size={17}/><input aria-label="Search group screens" placeholder="Search screens or locations" value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)}/></div><span className="adm-assignment-count">{state.members.filter((member) => member.groupId === groupId).length} screens assigned{busy ? " - Saving..." : ""}</span><div className="adm-assignment-list">{assignmentScreens.map((screen) => { const checked = state.members.some((member) => member.groupId === groupId && member.screenId === screen.id); return <label key={screen.id}><input type="checkbox" checked={checked} disabled={busy} onChange={(event) => void mutate({ action: "member", groupId, screenId: screen.id, enabled: event.target.checked })}/><span><strong>{screen.name}</strong><small>{parentNames(screen, entities)}</small></span></label>; })}{!assignmentScreens.length && <div className="adm-empty">{byType("screen").length ? "No screens match your search." : "Add screens before assigning them to a group."}</div>}</div><button className="adm-primary-btn" disabled={busy} onClick={() => setGroupId(null)}>Done</button></DialogContent></Dialog>

    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !busy && setDeleteTarget(null)}><AlertDialogContent className="adm-dialog"><AlertDialogHeader><AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle><AlertDialogDescription>{deleteTarget?.type === "group" ? "This removes the group. Its screens remain in your network." : deleteTarget?.type === "screen" ? "This removes the screen and its group assignments." : "This also removes all regions, locations, and screens inside this item."} This cannot be undone.</AlertDialogDescription></AlertDialogHeader>{dialogError}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async (event) => { event.preventDefault(); if (deleteTarget && !busy && await mutate({ action: "delete", id: deleteTarget.id })) setDeleteTarget(null); }}>{busy ? "Deleting..." : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

  </SidebarProvider>;

}



