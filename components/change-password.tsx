"use client";
import { clientFetch } from "@/lib/client-fetch";
import { useRef, useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./auth.css";

export default function ChangePassword({modal = false}:{modal?:boolean}) {
  const [open,setOpen] = useState(false);
  const [current,setCurrent] = useState(""), [password,setPassword] = useState(""), [confirm,setConfirm] = useState("");
  const [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const saving = useRef(false), opener = useRef<HTMLButtonElement>(null);
  function close() {
    if (saving.current) return;
    setOpen(false); setCurrent(""); setPassword(""); setConfirm(""); setError("");
  }
  const form = <form className={modal ? "adm-form user-dialog-form password-dialog-form" : undefined} onSubmit={async event=>{
    event.preventDefault(); if (saving.current) return;
    setError("");
    if (password !== confirm) {setError("Passwords do not match.");return;}
    saving.current = true; setBusy(true);
    try {
      const response = await clientFetch("/api/auth/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword:current,newPassword:password,revokeOtherSessions:true})});
      if (response.status === 401) {window.location.replace("/login");return;}
      if (!response.ok) throw new Error("Could not change password. Check your current password.");
      await clientFetch("/api/auth/sign-out",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
      window.location.replace("/login");
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Try again.");}
    finally {saving.current=false;setBusy(false);}
  }}>
    <label>Current password<input autoFocus={modal} type="password" required disabled={busy} autoComplete="current-password" value={current} onChange={event=>setCurrent(event.target.value)}/></label>
    <label>New password<input type="password" required disabled={busy} minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)}/></label>
    <label>Confirm password<input type="password" required disabled={busy} minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)}/></label>
    {modal && <p className="user-dialog-hint">Use 12–128 characters. Saving signs you out on all devices.</p>}
    {error && <p className="auth-error user-dialog-error" role="alert">{error}</p>}
    <div className={modal ? "adm-form-actions user-dialog-actions" : undefined}>{modal && <button type="button" className="adm-secondary-btn" disabled={busy} onClick={close}>Cancel</button>}<button type="submit" className="adm-primary-btn" disabled={busy}>{busy ? "Saving…" : "Save and sign out"}</button></div>
  </form>;
  if (!modal) return <section className="adm-panel user-form"><h2>Change your password</h2>{form}</section>;
  return <>
    <section className="adm-panel adm-account-security"><LockKeyhole size={20}/><div><h2>Account security</h2><p>Update the password for your account.</p></div><button ref={opener} className="adm-secondary-btn" onClick={()=>setOpen(true)}>Change password</button></section>
    <Dialog open={open} onOpenChange={value=>{if (!value) close();}}><DialogContent className="adm-dialog user-dialog" showCloseButton={false} onCloseAutoFocus={event=>{event.preventDefault();opener.current?.focus();}}>
      <DialogHeader><DialogTitle>Change your password</DialogTitle><DialogDescription>Enter your current password and choose a new one.</DialogDescription></DialogHeader>
      <button type="button" className="adm-icon-btn user-dialog-close" disabled={busy} aria-label="Close password form" onClick={close}><X size={18}/></button>
      {form}
    </DialogContent></Dialog>
  </>;
}
