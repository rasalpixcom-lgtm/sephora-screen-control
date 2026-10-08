"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { roleNames, type Role } from "@/lib/auth-policy";
import "./auth.css";
type User = { id: string; name: string; email: string; role: Role; disabled: number; sessions: number };
type Editor = { mode: "create" } | { mode: "edit" | "reset"; user: User };

export default function UsersPanel({ accountEmail, refreshKey = 0 }: { accountEmail: string | null; refreshKey?: number }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState(""); const [formError, setFormError] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const saving = useRef(false); const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("controller");
  const [disabled, setDisabled] = useState(false); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const opener = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/login?next=/admin/users"); return; }
      const data = await response.json() as { error?: string; users: User[] };
      if (!response.ok) throw new Error(data.error || "Could not load users.");
      setUsers(data.users); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load users."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load, refreshKey]);
  function close() { setEditor(null); setPassword(""); setConfirm(""); setFormError(""); }
  function open(next: Editor, button: HTMLButtonElement) {
    opener.current = button; setEditor(next); setFormError(""); setError(""); setMessage(""); setPassword(""); setConfirm("");
    const user = next.mode === "create" ? null : next.user;
    setName(user?.name || ""); setEmail(user?.email || ""); setRole(user?.role || "controller"); setDisabled(!!user?.disabled);
  }
  async function mutate(body: Record<string, unknown>, inDialog = false) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(""); setFormError(""); setMessage("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    } finally { saving.current = false; setBusy(false); }
  }
  const ownAccount = editor?.mode === "edit" && editor.user.email === accountEmail;
  const needsPassword = editor?.mode === "create" || editor?.mode === "reset";
  return <>
    <div className="users-intro"><p>Admin manages the system. Controller chooses what is shown. Wall device views only.</p><button className="adm-primary-btn" disabled={busy} onClick={(event) => open({ mode: "create" }, event.currentTarget)}><Plus size={17}/>Add user</button></div>
    {error && <p className="auth-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="adm-panel users-list">{loading ? <p>Loading users…</p> : !users.length ? <p>No users to display.</p> : users.map((user) => <div className="user-row" key={user.id}>
      <div className="user-identity"><strong>{user.name}{user.email === accountEmail ? " (you)" : ""}</strong><span>{user.email}</span><small>{user.disabled ? "Disabled" : `Active · ${user.sessions} session${user.sessions === 1 ? "" : "s"}`}</small></div>
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
          void mutate(editor.mode === "reset" ? { action: "reset", id: editor.user.id, password } : editor.mode === "edit" ? { action: "update", id: editor.user.id, name, email, role, disabled } : { action: "create", name, email, role, password }, true);
        }}>
          {editor?.mode !== "reset" && <>
            <label>Name<input autoFocus required disabled={busy} maxLength={80} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)}/></label>
            <label>Login ID<input required disabled={busy} type="email" maxLength={254} autoComplete="off" placeholder="staff@pixcom.com" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
            <label>Role<select disabled={busy || ownAccount} value={role} onChange={(event) => setRole(event.target.value as Role)}>{Object.entries(roleNames).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
            {editor?.mode === "edit" && <label>Status<select disabled={busy || ownAccount} value={disabled ? "disabled" : "active"} onChange={(event) => setDisabled(event.target.value === "disabled")}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>}
          </>}
          {needsPassword && <>
            <label>{editor?.mode === "reset" ? "New password" : "Password"}<input autoFocus={editor?.mode === "reset"} type="password" required disabled={busy} minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>
            <label>Confirm password<input type="password" required disabled={busy} minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)}/></label>
            <p className="user-dialog-hint">Use 12–128 characters for the password.</p>
          </>}
          {ownAccount && <p className="user-dialog-hint">Your own Admin role and active status are protected. Change your password in Settings.</p>}
          {formError && <p className="auth-error user-dialog-error" role="alert">{formError}</p>}
          <div className="adm-form-actions user-dialog-actions"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={busy}>{busy ? "Saving…" : editor?.mode === "edit" ? "Save changes" : editor?.mode === "reset" ? "Reset password" : "Create account"}</button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
