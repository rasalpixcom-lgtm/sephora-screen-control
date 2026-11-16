"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import type { OnSignSettings } from "@/lib/client-onsign";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ClientOnSignSettings({ client, onClose }: { client: { id: string; name: string }; onClose: () => void }) {
  const [settings, setSettings] = useState<OnSignSettings | null>(null);
  const [organization, setOrganization] = useState("");
  const [token, setToken] = useState("");
  const [organizations, setOrganizations] = useState<{id: string; name: string}[] | null>(null);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await clientFetch(`/api/client-onsign?client=${encodeURIComponent(client.id)}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load OnSign settings.");
        if (active) { setSettings(body); setOrganization(body.organizationId); setError(""); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not load OnSign settings."); }
    })();
    return () => { active = false; };
  }, [client.id, retry]);
  async function submit(action: "save" | "test" | "disable" | "server" | "organizations") {
    if (busy || !settings) return;
    setBusy(true); setError(""); setNotice("");
    if (action === "organizations") { setLoadingOrganizations(true); setOrganizations(null); }
    try {
      const response = await clientFetch("/api/client-onsign", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id, version: settings.version, action,
          ...(["save", "test"].includes(action) ? { organizationId: organization } : {}),
          ...(["save", "test", "organizations"].includes(action) && token ? { token } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update OnSign settings.");
      if (action === "organizations") {
        setOrganizations(body.organizations);
        setNotice(body.organizations.length ? "Organizations loaded. Select the correct organization, test the connection, then save." : "No organizations are available to this token. Check its organization access or contact your OnSign administrator.");
      } else if (action === "test") setNotice(`Connection successful. ${body.players} ${body.players === 1 ? "player is" : "players are"} available. This test did not save changes.`);
      else {
        setToken("");
        setOrganizations(null);
        setNotice(action === "disable" ? "OnSign disabled for this client." : action === "server" ? "Server configuration restored." : "OnSign settings saved. Changes apply immediately.");
        setRetry(value => value + 1);
        // Keep writes locked until the new version has been fetched.
        setSettings(null);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); setLoadingOrganizations(false); }
  }
  const source = settings?.mode === "custom" ? "Saved in Administration" : settings?.mode === "disabled" ? "Disabled" : settings?.configured ? "Using server configuration" : "Not configured";
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="clients-dialog" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>OnSign API · {client.name}</DialogTitle><DialogDescription>Connect this client to its OnSign organization. Other clients keep their own settings.</DialogDescription></DialogHeader>
      <form className="clients-form" onSubmit={event => { event.preventDefault(); void submit("save"); }}>
        {error && <p className="clients-error" role="alert">{error}</p>}
        {notice && <p className="clients-notice" role="status">{notice}</p>}
        {!settings ? <p role="status">{error ? <button type="button" className="adm-secondary-btn" onClick={() => setRetry(value => value + 1)}>Reload settings</button> : "Loading OnSign settings…"}</p> : <>
          <p className="clients-connection-source">{source}</p>
          <label className="clients-field">API token<input type="password" value={token} maxLength={8192} disabled={busy} autoComplete="new-password" spellCheck={false} placeholder={settings.hasToken ? "Token configured — leave blank to keep it" : "Enter a read-only OnSign API token"} onChange={event => { setToken(event.target.value); setOrganizations(null); setNotice(""); }}/></label>
          <p className="clients-field-hint">Saved tokens are never displayed. Use a token with player read access; published-content details also need content read access.</p>
          <div><button type="button" className="adm-secondary-btn" disabled={busy || !(token.trim() || settings.hasToken)} onClick={() => void submit("organizations")}>{loadingOrganizations ? "Loading organizations…" : "Load organizations"}</button></div>
          {organizations !== null && <label className="clients-field">OnSign organization<select disabled={busy || !organizations.length} value={organization} onChange={event => { setOrganization(event.target.value); setNotice(""); }}>
            <option value="">Select an organization</option>
            {organization && !organizations.some(item => item.id === organization) && <option value={organization}>Current organization: {organization} (not in this list)</option>}
            {organizations.map(item => <option key={item.id} value={item.id}>{item.name} — {item.id}</option>)}
          </select></label>}
          {organizations !== null && !organizations.length && <p className="clients-field-hint">You can reload using another token or enter the ID manually below.</p>}
          <label className="clients-field">OnSign organization ID<input value={organization} maxLength={256} disabled={busy} autoComplete="off" spellCheck={false} onChange={event => { setOrganization(event.target.value); setNotice(""); }}/></label>
          <p className="clients-field-hint">{client.id === "sephora" ? "Selecting an organization fills its ID. Leave blank to keep automatic Sephora discovery." : "Select an organization above to fill its ID, or enter the ID manually."}</p>
          <div className="clients-connection-tools"><button type="button" className="adm-secondary-btn" disabled={busy || !(token.trim() || settings.hasToken)} onClick={() => void submit("test")}>Test connection</button>
            {settings.configured && <button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => void submit("disable")}>Disable connection</button>}
            {settings.mode !== "server" && <button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => void submit("server")}>Use server settings</button>}
          </div>
        </>}
        <div className="clients-form-actions"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={onClose}>Close</button><button type="submit" className="adm-primary-btn" disabled={busy || !settings || !(token.trim() || settings.hasToken) || client.id !== "sephora" && !organization.trim()}>{busy ? "Working…" : "Save connection"}</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
