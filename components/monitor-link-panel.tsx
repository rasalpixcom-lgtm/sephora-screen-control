"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Link2, Monitor } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import type { MonitorLinkStatus } from "@/lib/monitor-access";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function MonitorLinkPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [status, setStatus] = useState<MonitorLinkStatus | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"replace" | "disable" | null>(null);
  const saving = useRef(false);
  const revision = useRef(0);
  const generation = useRef<string | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const load = useCallback(async (force = false) => {
    if (saving.current && !force) return;
    const startedAt = ++revision.current;
    try {
      const response = await clientFetch("/api/monitor-link", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load the monitor link.");
      if (startedAt !== revision.current) return;
      if (generation.current !== result.generation) setLink("");
      generation.current = result.generation;
      setStatus(result); setError("");
    } catch (cause) { if (startedAt === revision.current) setError(cause instanceof Error ? cause.message : "Could not load the monitor link."); }
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load, refreshKey]);
  async function change(action: "create" | "replace" | "disable") {
    if (saving.current) return;
    revision.current++;
    saving.current = true; setBusy(true); setError(""); setNote("");
    try {
      const response = await clientFetch("/api/monitor-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, generation: status?.generation }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setLink(""); await load(true); }
        throw new Error(result.error || "Could not update the monitor link.");
      }
      generation.current = result.generation;
      setStatus(result); setLink(result.link || "");
      setNote(action === "disable" ? "Monitor access disabled. Existing walls will stop at their next refresh." : "Link ready. Copy it into OnSign before leaving this page.");
      setConfirmation(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the monitor link."); }
    finally { saving.current = false; setBusy(false); }
  }
  async function copyLink() {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(link);
      else { linkInput.current?.focus(); linkInput.current?.select(); if (!document.execCommand("copy")) throw new Error("manual"); }
      setNote("Copied. Paste this link into OnSign’s Website Link App.");
    } catch { linkInput.current?.focus(); linkInput.current?.select(); setNote("Copy the selected link, then paste it into OnSign."); }
  }
  return <section className="adm-panel adm-monitor-link" aria-labelledby="monitor-link-heading">
    <div className="adm-panel-head"><div><h2 id="monitor-link-heading"><Monitor size={18}/> Private monitor link</h2><p>Paste this link into OnSign to display the wall without login.</p></div><span className="adm-link-status">{status ? status.active ? "Active" : "Not active" : "Loading…"}</span></div>
    <div className="adm-monitor-link-body">
      <p>One active link. View only. It stays valid until you replace or disable it.</p>
      {error && <div className="adm-error" role="alert">{error}<button className="adm-secondary-btn" onClick={() => void load()} disabled={busy}>Refresh</button></div>}
      {link && <div className="adm-monitor-copy"><label htmlFor="private-monitor-url">OnSign URL</label><div><input id="private-monitor-url" ref={linkInput} readOnly value={link} onFocus={event => event.target.select()}/><button className="adm-primary-btn" onClick={() => void copyLink()}><Copy size={16}/> Copy link</button></div><small>Keep this link private. It is shown once; replace it if you lose the saved copy.</small></div>}
      {note && <p role="status" className="adm-monitor-note">{note}</p>}
      {status && <div className="adm-monitor-link-actions">{status.active ? <><button className="adm-secondary-btn" disabled={busy} onClick={() => setConfirmation("replace")}><Link2 size={16}/> Replace link</button><button className="adm-secondary-btn adm-danger-btn" disabled={busy} onClick={() => setConfirmation("disable")}>Disable link</button></> : <button className="adm-primary-btn" disabled={busy} onClick={() => void change("create")}><Link2 size={16}/> {busy ? "Creating…" : "Create monitor link"}</button>}{status.active && !link && <small>An active link already exists. Your saved OnSign URL continues to work.</small>}</div>}
    </div>
    <AlertDialog open={confirmation !== null} onOpenChange={open => { if (!open && !saving.current) setConfirmation(null); }}><AlertDialogContent className="adm-dialog"><AlertDialogHeader><AlertDialogTitle>{confirmation === "replace" ? "Replace the monitor link?" : "Disable monitor access?"}</AlertDialogTitle><AlertDialogDescription>{confirmation === "replace" ? "The previous link will stop working. Existing monitors will stop at their next refresh until you paste the new URL into OnSign." : "Existing monitors will stop at their next refresh. You can create a new link when you are ready."}</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction className="adm-primary-btn" disabled={busy} onClick={event => { event.preventDefault(); if (confirmation) void change(confirmation); }}>{busy ? "Saving…" : confirmation === "replace" ? "Replace link" : "Disable link"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
