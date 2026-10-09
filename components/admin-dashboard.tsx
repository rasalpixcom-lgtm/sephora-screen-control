"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";

import Link from "next/link";

import { Activity as ActivityIcon, ArrowUpRight, ClipboardList, Globe2, LayoutDashboard, Layers3, Map, MapPin, Menu, Monitor, Plus, RefreshCw, Search, Settings2, Users, Trash2, X } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import type { Activity, Display, Entity, EntityType, Member } from "@/lib/store";

import { ThemeToggle } from "@/components/theme-toggle";

import "./admin-dashboard.css";
import SignOut from "@/components/sign-out";
import UsersPanel from "@/components/users-panel";
import ChangePassword from "@/components/change-password";
import MonitorLinkPanel from "@/components/monitor-link-panel";
import ActivityPanel from "@/components/activity-panel";
import LocationPicker from "@/components/location-picker";



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
  const [screenFilters, setScreenFilters] = useState({countryId: "", regionId: "", storeId: ""});
  const [screenPath, setScreenPath] = useState({countryId: "", regionId: ""});

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

      const response = await clientFetch("/api/state?activity=none", { cache: "no-store" });

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

    const store = entities.find(entity => entity.id === item?.parentId && entity.type === "store");
    const region = entities.find(entity => entity.id === store?.parentId && entity.type === "region");
    setScreenPath({countryId: region?.parentId || "", regionId: region?.id || ""});
    setEditor({ type, item });

  }

  async function saveEditor(event: React.FormEvent) {

    event.preventDefault();

    if (!editor || busy) return;
    if (editor.type === "screen" && !entities.some(entity => entity.type === "store" && entity.id === draft.parentId && entity.parentId === screenPath.regionId) ) {
      setError("Choose a country, region, and location for this screen."); return;
    }

    if (await mutate({ action: editor.item ? "update" : "create", type: editor.type, id: editor.item?.id, ...draft })) setEditor(null);

  }

  const searchable = useMemo(() => entities.filter((item) => `${item.name} ${parentNames(item, entities)}`.toLowerCase().includes(search.trim().toLowerCase())), [entities, search]);

  function matchesScreenFilters(item: Entity) {
    const store = entities.find(entity => entity.id === item.parentId);
    const region = entities.find(entity => entity.id === store?.parentId);
    return (!screenFilters.storeId || item.parentId === screenFilters.storeId)
      && (!screenFilters.regionId || store?.parentId === screenFilters.regionId)
      && (!screenFilters.countryId || region?.parentId === screenFilters.countryId);
  }
  const hasScreenFilters = Object.values(screenFilters).some(Boolean);
  const visibleScreens = searchable.filter(item => item.type === "screen" && matchesScreenFilters(item));
  const sortedOptions = (type: EntityType, parentId?: string) => byType(type).filter(item => parentId === undefined || item.parentId === parentId).sort((a,b)=>a.name.localeCompare(b.name));
  const missingLinks = byType("screen").filter((item) => !item.liveUrl);

  const assignmentScreens = byType("screen").filter((item) => `${item.name} ${parentNames(item, entities)}`.toLowerCase().includes(assignmentSearch.trim().toLowerCase()));

  function openGroup(id: string) { setError(""); setAssignmentSearch(""); setGroupId(id); }

  function openDelete(item: Entity) { setError(""); setDeleteTarget(item); }

  const dialogError = error ? <div className="adm-error" role="alert">{error}</div> : null;



  function entityTable(type: EntityType) {

    const list = type === "screen" ? visibleScreens : searchable.filter((item) => item.type === type);

    return <div className="adm-table-wrap"><table className={`adm-table${type === "country" ? " adm-country-table" : (type === "region" || type === "store") ? " adm-region-table" : type === "screen" ? " adm-screen-table" : ""}`}><thead><tr><th>Name</th><th>{type === "country" ? "Regions" : type === "region" ? "Country" : type === "store" ? "Region / country" : "Location / region"}</th><th>{type === "screen" ? "Preview link" : "Screens"}</th><th>Actions</th></tr></thead><tbody>{list.map((item) => <tr key={item.id}><td><div className="adm-name-cell"><span className="adm-list-icon">{type === "screen" ? <Monitor size={17}/> : type === "country" ? <Globe2 size={17}/> : <MapPin size={17}/>}</span><div><strong>{item.name}</strong>{item.isDemo ? <small>Sample data</small> : null}</div></div></td><td>{type === "country" ? byType("region").filter((child) => child.parentId === item.id).length : parentNames(item, entities)}</td><td>{type === "screen" ? item.liveUrl ? <span className="adm-source-ready">Link saved</span> : <span className="adm-source-missing">No link</span> : entities.filter((screen) => screen.type === "screen" && (type === "store" ? screen.parentId === item.id : type === "region" ? entities.find((store) => store.id === screen.parentId)?.parentId === item.id : entities.find((region) => region.id === entities.find((store) => store.id === screen.parentId)?.parentId)?.parentId === item.id)).length}</td><td><div className="adm-row-actions"><button aria-label={`Edit ${item.name}`} onClick={() => openEditor(type, item)}>Edit</button><button className="adm-delete" onClick={() => openDelete(item)} aria-label={`Delete ${item.name}`}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table>{!list.length && <div className="adm-empty">{(search.trim() || (type === "screen" && hasScreenFilters)) ? `No ${metricLabels[type].toLowerCase()} match your filters.` : `No ${metricLabels[type].toLowerCase()} yet. Add your first ${typeNames[type].toLowerCase()} to get started.`}</div>}</div>;

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

        {currentType && <section className="adm-panel adm-list-panel"><div className="adm-list-toolbar"><div className="adm-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${sectionNames[section].toLowerCase()}`} aria-label={`Search ${sectionNames[section].toLowerCase()}`}/></div><span aria-live="polite">{search.trim() || (currentType === "screen" && hasScreenFilters) ? `${currentType === "screen" ? visibleScreens.length : searchable.filter((item) => item.type === currentType).length} of ${byType(currentType).length}` : `${byType(currentType).length} total`}</span></div>{currentType === "screen" && <div className="adm-screen-filters">
          <LocationPicker label="Country" value={screenFilters.countryId} placeholder="All countries" options={[{id:"",name:"All countries"},...sortedOptions("country")]} onChange={countryId=>setScreenFilters({countryId,regionId:"",storeId:""})}/>
          <LocationPicker label="Region" value={screenFilters.regionId} placeholder="All regions" disabled={!screenFilters.countryId} options={[{id:"",name:"All regions"},...sortedOptions("region",screenFilters.countryId)]} onChange={regionId=>setScreenFilters({...screenFilters,regionId,storeId:""})}/>
          <LocationPicker label="Location" value={screenFilters.storeId} placeholder="All locations" disabled={!screenFilters.regionId} options={[{id:"",name:"All locations"},...sortedOptions("store",screenFilters.regionId)]} onChange={storeId=>setScreenFilters({...screenFilters,storeId})}/>
          <button className="adm-secondary-btn" disabled={!hasScreenFilters && !search} onClick={()=>{setScreenFilters({countryId:"",regionId:"",storeId:""});setSearch("");}}>Clear filters</button>
        </div>}{entityTable(currentType)}</section>}

        {section === "groups" && <div className="adm-group-grid">{byType("group").map((group) => <article className="adm-group-card" key={group.id}><div className="adm-group-card-heading"><div><h2>{group.name}</h2><p>{state.members.filter((member) => member.groupId === group.id).length} assigned {state.members.filter((member) => member.groupId === group.id).length === 1 ? "screen" : "screens"}</p></div><button className="adm-delete" onClick={() => openDelete(group)} aria-label={`Delete ${group.name}`}><Trash2 size={17}/></button></div><div className="adm-group-screen-list">{state.members.filter((member) => member.groupId === group.id).slice(0,3).map((member) => { const screen = entities.find((item) => item.id === member.screenId); return screen ? <span key={member.screenId}><Monitor size={16}/><span className="adm-group-screen-copy"><strong>{screen.name}</strong><small>{parentNames(screen, entities)}</small></span></span> : null; })}{state.members.filter((member) => member.groupId === group.id).length > 3 && <span>+{state.members.filter((member) => member.groupId === group.id).length - 3} more screens</span>}{!state.members.some((member) => member.groupId === group.id) && <span>No screens assigned</span>}</div><div className="adm-group-actions"><button className="adm-secondary-btn" onClick={() => openEditor("group", group)}>Rename</button><button className="adm-primary-btn" onClick={() => openGroup(group.id)}>Manage screens</button></div></article>)}{!byType("group").length && <div className="adm-empty adm-panel">No groups yet. Add one to collect screens across stores.</div>}</div>}

        {section === "activity" && <ActivityPanel refreshKey={usersRefreshKey}/>}


        {section === "users" && <UsersPanel accountEmail={accountEmail} refreshKey={usersRefreshKey}/>}
        {section === "settings" && <><MonitorLinkPanel refreshKey={usersRefreshKey}/><section className="adm-panel adm-monitor-overview"><div className="adm-overview-heading"><Monitor size={20}/><div><h2>Monitor overview</h2><p>The wall follows your Controller selection and rotates through additional screens.</p></div></div><div className="adm-monitor-stats"><div><span>Preview links</span><strong>{byType("screen").filter(item => !!item.liveUrl).length} of {byType("screen").length} configured</strong></div><div><span>Page rotation</span><strong>{state.display.autoAdvance ? `Every ${state.display.intervalSeconds} seconds` : "Paused"}</strong></div></div><p className="adm-overview-note">Manage preview links in <Link href="/admin/screens">Screens</Link> and rotation in <Link href="/controller">Controller</Link>. Preview links do not confirm whether a physical screen is online.</p></section><ChangePassword modal/></>}

      </>}

      </div></SidebarInset>



    <Dialog open={!!editor} onOpenChange={(open) => !open && !busy && setEditor(null)}><DialogContent className="adm-dialog"><DialogHeader><DialogTitle>{editor?.item ? `Edit ${typeNames[editor.type]}` : editor ? `Add ${typeNames[editor.type]}` : "Edit"}</DialogTitle><DialogDescription>{editor?.type === "screen" ? "Add the screen to a location and save its OnSign preview URL." : "Keep the name clear for everyone using the network."}</DialogDescription></DialogHeader>{dialogError}<form onSubmit={saveEditor} className="adm-form"><label>Name<input autoFocus required maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>{editor && ["region","store"].includes(editor.type) && <label>{editor.type === "region" ? "Country" : editor.type === "store" ? "Region" : "Location"}<select required value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">Select {editor.type === "region" ? "country" : editor.type === "store" ? "region" : "location"}</option>{byType(editor.type === "region" ? "country" : editor.type === "store" ? "region" : "store").map((item) => <option key={item.id} value={item.id}>{item.name}{item.parentId ? ` · ${parentNames(item, entities)}` : ""}</option>)}</select></label>}{editor?.type === "screen" && <>
      <LocationPicker label="Country" value={screenPath.countryId} placeholder="Select country" disabled={busy} options={sortedOptions("country")} onChange={countryId=>{setScreenPath({countryId,regionId:""});setDraft({...draft,parentId:""});}}/>
      <LocationPicker label="Region" value={screenPath.regionId} placeholder="Select region" disabled={busy || !screenPath.countryId} options={sortedOptions("region",screenPath.countryId)} onChange={regionId=>{setScreenPath({...screenPath,regionId});setDraft({...draft,parentId:""});}}/>
      <LocationPicker label="Location" value={draft.parentId} placeholder="Select location" disabled={busy || !screenPath.regionId} options={sortedOptions("store",screenPath.regionId)} onChange={parentId=>setDraft({...draft,parentId})}/>
      {!byType("store").length && <p className="adm-picker-hint">Add a country, region, and location before creating a screen.</p>}
      </>}{editor?.type === "screen" && <label>OnSign live URL <small>Optional until the link is ready</small><input type="url" value={draft.liveUrl} onChange={(event) => setDraft({ ...draft, liveUrl: event.target.value })} placeholder="https://…"/></label>}<div className="adm-form-actions"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={busy || (editor?.type === "screen" && !draft.parentId)}>{busy ? "Saving..." : `Save ${editor ? typeNames[editor.type].toLowerCase() : ""}`}</button></div></form></DialogContent></Dialog>

    <Dialog open={!!groupId} onOpenChange={(open) => !open && !busy && setGroupId(null)}><DialogContent className="adm-dialog"><DialogHeader><DialogTitle>{entities.find((item) => item.id === groupId)?.name}</DialogTitle><DialogDescription>Choose screens from any location. Changes save automatically.</DialogDescription></DialogHeader>{dialogError}<div className="adm-search"><Search size={17}/><input aria-label="Search group screens" placeholder="Search screens or locations" value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)}/></div><span className="adm-assignment-count">{state.members.filter((member) => member.groupId === groupId).length} {state.members.filter((member) => member.groupId === groupId).length === 1 ? "screen" : "screens"} assigned{busy ? " - Saving..." : ""}</span><div className="adm-assignment-list">{assignmentScreens.map((screen) => { const checked = state.members.some((member) => member.groupId === groupId && member.screenId === screen.id); return <label key={screen.id}><input type="checkbox" checked={checked} disabled={busy} onChange={(event) => void mutate({ action: "member", groupId, screenId: screen.id, enabled: event.target.checked })}/><span><strong>{screen.name}</strong><small>{parentNames(screen, entities)}</small></span></label>; })}{!assignmentScreens.length && <div className="adm-empty">{byType("screen").length ? "No screens match your search." : "Add screens before assigning them to a group."}</div>}</div><button className="adm-primary-btn" disabled={busy} onClick={() => setGroupId(null)}>Done</button></DialogContent></Dialog>

    <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !busy && setDeleteTarget(null)}><AlertDialogContent className="adm-dialog"><AlertDialogHeader><AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle><AlertDialogDescription>{deleteTarget?.type === "group" ? "This removes the group. Its screens remain in your network." : deleteTarget?.type === "screen" ? "This removes the screen and its group assignments." : deleteTarget?.type === "region" ? "This also removes all locations and screens in this region. Its country remains in your network." : deleteTarget?.type === "store" ? "This also removes all screens in this location. Its region and country remain in your network." : "This also removes all regions, locations, and screens in this country."} This cannot be undone.</AlertDialogDescription></AlertDialogHeader>{dialogError}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={async (event) => { event.preventDefault(); if (deleteTarget && !busy && await mutate({ action: "delete", id: deleteTarget.id })) setDeleteTarget(null); }}>{busy ? "Deleting..." : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

  </SidebarProvider>;

}



