"use client";
import { clientFetch } from "@/lib/client-fetch";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import AdministrationShell from "@/components/administration-shell";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { roleNames, type Role } from "@/lib/auth-policy";
import "./auth.css";
type User = { id: string; name: string; email: string; role: Role; disabled: boolean; sessions: number; clientIds: string[] | null; editVersion: string };
type Client = { id: string; name: string };
type Editor = { mode: "create" } | { mode: "edit" | "reset"; user: User };

export default function UsersPanel({ accountEmail }: { accountEmail: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState(""); const [formError, setFormError] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const saving = useRef(false); const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("controller");
  const [clientAccess, setClientAccess] = useState<"all" | "selected">("all");
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [disabled, setDisabled] = useState(false); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const opener = useRef<HTMLButtonElement | null>(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    if (saving.current) return;
    const startedAt = ++revision.current;
    try {
      const response = await clientFetch("/api/users", { cache: "no-store" });
      if (startedAt !== revision.current) return;
      if (response.status === 401) { window.location.replace("/login?next=/admin/users"); return; }
      const data = await response.json() as { error?: string; users: User[]; clients: Client[] };
      if (startedAt !== revision.current) return;
      if (!response.ok) throw new Error(data.error || "Could not load users.");
      setUsers(data.users); setClients(data.clients); setError("");
    } catch (cause) { if (startedAt === revision.current) setError(cause instanceof Error ? cause.message : "Could not load users."); }
    finally { if (startedAt === revision.current) setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  function close() { setEditor(null); setPassword(""); setConfirm(""); setFormError(""); }
  function open(next: Editor, button: HTMLButtonElement) {
    opener.current = button; setEditor(next); setFormError(""); setError(""); setMessage(""); setPassword(""); setConfirm("");
    const user = next.mode === "create" ? null : next.user;
    setName(user?.name || ""); setEmail(user?.email || ""); setRole(user?.role || "controller"); setDisabled(!!user?.disabled);
    setClientAccess(user?.clientIds ? "selected" : "all");
    setSelectedClientIds(user?.clientIds ?? []);
    setClientSearch("");
  }
  async function mutate(body: Record<string, unknown>, inDialog = false) {
    if (saving.current) return;
    revision.current++;
    saving.current = true; setBusy(true); setError(""); setFormError(""); setMessage("");
    try {
      const response = await clientFetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (response.status === 401) { window.location.replace("/login"); return; }
      const data = await response.json() as { error?: string; users: User[] };
      if (!response.ok) throw new Error(data.error || "Could not save.");
      const target = users.find((user) => user.id === body.id);
      setUsers(data.users); close();
      setMessage(body.action === "create" ? "Account created. The user can sign in now." : body.action === "reset" ? "Password updated. Existing sessions have been signed out." : "Account updated.");
      if (target?.email === accountEmail && (body.action === "revoke" || body.action === "update")) window.location.replace("/login");
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "Could not save.";
      if (inDialog) setFormError(text); else setError(text);
    } finally { saving.current = false; setBusy(false); setLoading(false); }
  }
  const ownAccount = editor?.mode === "edit" && editor.user.email === accountEmail;
  const needsPassword = editor?.mode === "create" || editor?.mode === "reset";
  const selectedIds = new Set(selectedClientIds);
  const selectedClients = (clients ?? []).filter(client => selectedIds.has(client.id));
  const selectedCount = selectedClients.length;
  const search = clientSearch.trim().toLowerCase();
  const matchingClients = (clients ?? []).filter(client => client.name.toLowerCase().includes(search));
  return <AdministrationShell section="users" email={accountEmail} actions={
    <button type="button" className="adm-icon-btn" aria-label="Refresh users" disabled={loading || busy || !!editor} onClick={() => {
      setLoading(true);
      void load();
    }}><RefreshCw size={18}/></button>
  }>
    <div className="users-intro"><p>Admins manage client workspaces. Controllers choose what appears on the monitoring wall.</p><button className="adm-primary-btn" disabled={busy || loading} onClick={(event) => open({ mode: "create" }, event.currentTarget)}><Plus size={17}/>Add user</button></div>
    {error && <p className="auth-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="adm-panel users-list">{loading ? <p>Loading users…</p> : !users.length ? <p>No users to display.</p> : users.map((user) => <div className="user-row" key={user.id}>
      <div className="user-identity"><strong>{user.name}{user.email === accountEmail ? " (you)" : ""}</strong><span>{user.email}</span><small>{user.disabled ? "Disabled" : `Active · ${user.sessions} session${user.sessions === 1 ? "" : "s"}`} · {user.clientIds === null ? "All clients" : "Selected clients"}</small></div>
      <span className="user-role-badge">{roleNames[user.role]}</span>
      <div className="user-actions">
        <button className="adm-secondary-btn" disabled={busy} onClick={(event) => open({ mode: "edit", user }, event.currentTarget)}>Edit</button>
        {user.email !== accountEmail && <button className="adm-secondary-btn" disabled={busy} onClick={(event) => open({ mode: "reset", user }, event.currentTarget)}>Reset password</button>}
        <button className="adm-secondary-btn" disabled={busy || !user.sessions} onClick={() => { if (window.confirm("Sign out all sessions for this account?")) void mutate({ action: "revoke", id: user.id }); }}>Sign out sessions</button>
      </div>
    </div>)}</section>
    <Dialog open={!!editor} onOpenChange={(isOpen) => { if (!isOpen && !saving.current) close(); }}>
      <DialogContent className="adm-dialog user-dialog" showCloseButton={false} onCloseAutoFocus={(event) => { event.preventDefault(); opener.current?.focus(); }}>
        <DialogHeader><DialogTitle>{editor?.mode === "edit" ? "Edit user" : editor?.mode === "reset" ? "Reset password" : "Add user"}</DialogTitle><DialogDescription>{editor?.mode === "reset" ? `Set a new password for ${editor.user.name}. Existing sessions will be signed out.` : editor?.mode === "edit" ? "Update account details and access. Saving signs out existing sessions." : "Create credentials for your team. The login ID does not need a real mailbox."}</DialogDescription></DialogHeader>
        <button type="button" className="adm-icon-btn user-dialog-close" disabled={busy} aria-label="Close user form" onClick={close}><X size={18}/></button>
        <form className="adm-form user-dialog-form" onSubmit={(event) => {
          event.preventDefault(); if (!editor || saving.current) return;
          if (needsPassword && password !== confirm) { setFormError("Passwords do not match."); return; }
          if (editor.mode === "reset") {
            void mutate({ action: "reset", id: editor.user.id, password }, true);
            return;
          }
          const clientIds = !ownAccount && clientAccess === "selected" ? selectedClients.map(client => client.id) : null;
          if (editor.mode === "edit") {
            const previous = editor.user.clientIds;
            const scopeChanged = (previous === null) !== (clientIds === null);
            const selectionChanged = previous !== null && clientIds !== null &&
              (previous.length !== selectedIds.size || previous.some(id => !selectedIds.has(id)));
            const access = scopeChanged || selectionChanged ? { clientIds } : {};
            void mutate({ action: "update", id: editor.user.id, expectedVersion: editor.user.editVersion, name, email, role, disabled, ...access }, true);
          } else {
            void mutate({ action: "create", name, email, role, password, clientIds }, true);
          }
        }}>
          {editor?.mode !== "reset" && <>
            <label>Name<input autoFocus required disabled={busy} maxLength={80} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)}/></label>
            <label>Login ID<input required disabled={busy} type="email" maxLength={254} autoComplete="off" placeholder="staff@pixcom.com" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
            <label>Role<select disabled={busy || ownAccount} value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
            {editor?.mode === "edit" && <label>Status<select disabled={busy || ownAccount} value={disabled ? "disabled" : "active"} onChange={(event) => setDisabled(event.target.value === "disabled")}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>}
            <div className="user-client-access">
              <label>Client access<select disabled={busy || ownAccount} value={clientAccess} onChange={(event) => setClientAccess(event.target.value === "selected" ? "selected" : "all")}>
                <option value="all">All clients</option>
                <option value="selected" disabled={clients === null}>Selected clients</option>
              </select></label>
              {clientAccess === "selected" && <>
                <label>Search clients<input type="search" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }} disabled={busy}/></label>
                <fieldset className="adm-assignment-list user-client-list">
                  <legend className="sr-only">Clients this {roleNames[role]} can access</legend>
                  {matchingClients.length === 0 && <p className="user-dialog-hint">{clients?.length ? "No matching clients." : "No active clients available."}</p>}
                  {matchingClients.map(client => <label key={client.id}>
                    <input type="checkbox" checked={selectedIds.has(client.id)} disabled={busy} onChange={(event) => {
                      const checked = event.target.checked;
                      setSelectedClientIds(ids => checked ? [...ids, client.id] : ids.filter(id => id !== client.id));
                    }}/>
                    <span>{client.name}</span>
                  </label>)}
                </fieldset>
                <p className="user-dialog-hint" role="status">{selectedCount === 0 ? `This ${roleNames[role]} will have no client access.` : `${selectedCount} ${selectedCount === 1 ? "client" : "clients"} selected.`}</p>
                {role === "admin" && <p className="user-dialog-hint">Admins with Selected clients can manage those workspaces. Admins with All clients can also manage users and assignments.</p>}
              </>}
            </div>
          </>}
          {needsPassword && <>
            <label>{editor?.mode === "reset" ? "New password" : "Password"}<input autoFocus={editor?.mode === "reset"} type="password" required disabled={busy} minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>
            <label>Confirm password<input type="password" required disabled={busy} minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)}/></label>
            <p className="user-dialog-hint">Use 12–128 characters for the password.</p>
          </>}
          {ownAccount && <p className="user-dialog-hint">Your own Admin role, active status, and All clients access are protected. Change your password in Settings.</p>}
          {formError && <p className="auth-error user-dialog-error" role="alert">{formError}</p>}
          <div className="adm-form-actions user-dialog-actions"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={busy}>{busy ? "Saving…" : editor?.mode === "edit" ? "Save changes" : editor?.mode === "reset" ? "Reset password" : "Create account"}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  </AdministrationShell>;
}
