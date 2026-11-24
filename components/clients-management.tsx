"use client";

import { useMemo, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdministrationShell from "@/components/administration-shell";
import { clientFetch } from "@/lib/client-fetch";
import type { ClientManagementData, ManagedClient } from "@/lib/client-management";
import ClientLogo from "@/components/client-logo";
import ClientLogoInput, {type ClientLogoDraft} from "@/components/client-logo-input";
import MonitorLinkPanel from "@/components/monitor-link-panel";
import ClientOnSignSettings from "@/components/client-onsign-settings";

export default function ClientsManagement({ initialData, email }: { initialData: ClientManagementData; email: string }) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [onsignClient, setOnsignClient] = useState<ManagedClient | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,setEditing]=useState<ManagedClient|null>(null);
  const [logo,setLogo]=useState<ClientLogoDraft>({file:null,remove:false});
  const [background,setBackground]=useState<ClientLogoDraft>({file:null,remove:false});
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const clients = useMemo(() => data.clients.filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase())), [data.clients, search]);
  async function load() {
    const response = await clientFetch("/api/clients");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Clients could not be loaded.");
    setData(body);
  }
  async function refresh() { setPending(true); setError(""); try { await load(); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setPending(false); } }
  async function save() {
    if (pending) return;
    setPending(true); setFormError(""); setError(""); setNotice("");
    try {
      const change = (draft: ClientLogoDraft, version: string | null) => ({action: draft.file ? "replace" : draft.remove ? "remove" : "keep", expectedVersion: version});
      const metadata=editing?{clientId:editing.id,name,expectedName:editing.name,logo:change(logo,editing.logoVersion),background:change(background,editing.backgroundVersion)}:{action:"create",name};
      let requestBody:BodyInit; const headers:Record<string,string>={};
      if(logo.file || background.file){const form=new FormData();form.set("metadata",JSON.stringify(metadata));if(logo.file)form.set("logo",logo.file);if(background.file)form.set("background",background.file);requestBody=form;}
      else{headers["Content-Type"]="application/json";requestBody=JSON.stringify(metadata);}
      const response = await clientFetch(editing?"/api/client-branding":"/api/clients", { method: "POST", headers, body:requestBody });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Changes could not be saved.");
      setNotice(editing?"Client changes saved.":"Client created. Assign it to Controllers with selected access from Users.");
      setDialogOpen(false);
      try { await load(); } catch { setError("Changes were saved. Refresh to load the latest list."); }
    } catch (e) { setFormError(e instanceof Error ? e.message : "Please try again."); }
    finally { setPending(false); }
  }
  return <AdministrationShell section="clients" email={email} actions={<>
    <button className="adm-icon-btn" aria-label="Refresh clients" disabled={pending || dialogOpen || !!onsignClient} onClick={() => void refresh()}><RefreshCw size={18}/></button>
    <button className="adm-primary-btn" disabled={pending} onClick={() => { setEditing(null); setLogo({file:null,remove:false});setBackground({file:null,remove:false}); setDialogOpen(true); setName(""); setFormError(""); setNotice(""); }}><Plus size={18}/>Add client</button>
  </>}>
      {error && <p className="clients-error" role="alert">{error}</p>}{notice && <p className="clients-notice" role="status">{notice}</p>}
      <section className="clients-card" aria-label="Clients list"><div className="clients-list-tools"><label className="clients-search"><Search size={18}/><input aria-label="Search clients" placeholder="Search clients" value={search} onChange={e => setSearch(e.target.value)}/></label><span>{clients.length} of {data.clients.length} {data.clients.length === 1 ? "client" : "clients"}</span></div><div className="clients-table-wrap"><table className="clients-table"><thead><tr><th>Client</th><th>Access</th><th>Actions</th></tr></thead><tbody>{clients.map(client => <tr key={client.id}><td><div className="clients-name"><ClientLogo clientId={client.id} version={client.logoKey}/><strong>{client.name}</strong></div></td><td>Based on user access</td><td><div className="clients-row-actions"><button className="adm-secondary-btn" disabled={pending} onClick={()=>{setEditing(client);setName(client.name);setLogo({file:null,remove:false});setBackground({file:null,remove:false});setFormError("");setNotice("");setDialogOpen(true);}}>Edit client</button><button className="adm-secondary-btn" disabled={pending} onClick={() => setOnsignClient(client)}>OnSign API</button></div></td></tr>)}{!clients.length && <tr><td colSpan={3} className="clients-empty">No clients match your search.</td></tr>}</tbody></table></div></section>
      <MonitorLinkPanel common/>
      {onsignClient && <ClientOnSignSettings key={onsignClient.id} client={onsignClient} onClose={() => setOnsignClient(null)}/>}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!pending) setDialogOpen(open); }}><DialogContent className="clients-dialog" onEscapeKeyDown={e => { if (pending) e.preventDefault(); }} onPointerDownOutside={e => { if (pending) e.preventDefault(); }}><DialogHeader><DialogTitle>{editing?`Edit client · ${editing.name}`:"Add client"}</DialogTitle><DialogDescription>{editing?"The logo appears on client cards and workspace navigation. The background appears only on the client selection card.":"Admins and Controllers with All clients can open this client. Manage selected access from Users."}</DialogDescription></DialogHeader><form className="clients-form" onSubmit={event => { event.preventDefault(); void save(); }}>
        {formError && <p role="alert" className="clients-error">{formError}</p>}
        <label className="clients-field">Client name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required disabled={pending} autoFocus/></label>
        <ClientLogoInput clientId={editing?.id} logoKey={editing?.logoKey} draft={logo} onChange={setLogo} disabled={pending}/>
        <ClientLogoInput kind="background" clientId={editing?.id} logoKey={editing?.backgroundKey} draft={background} onChange={setBackground} disabled={pending}/>
        <div className="clients-form-actions"><button type="button" className="adm-secondary-btn" disabled={pending} onClick={() => setDialogOpen(false)}>Cancel</button><button className="adm-primary-btn" disabled={pending || !name.trim() || (editing ? name.trim() === editing.name && !logo.file && !(logo.remove && editing.logoKey) && !background.file && !(background.remove && editing.backgroundKey) : !name.trim())}>{pending ? "Saving…" : editing?"Save changes":"Create client"}</button></div>
      </form></DialogContent></Dialog>
  </AdministrationShell>;
}
