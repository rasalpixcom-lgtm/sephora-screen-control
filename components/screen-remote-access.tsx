"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { parseScreenRemoteAccess, REMOTE_ID_MAX_LENGTH, type ScreenRemoteFields } from "@/lib/screen-remote-access";
import "./screen-notes.css";
import "./screen-remote-access.css";

type RemoteRecord = ScreenRemoteFields & { version: string | null; updatedAt: string | null };
const emptyFields: ScreenRemoteFields = { teamViewerId: "", anyDeskId: "" };
const fields = [{ key: "teamViewerId", label: "TeamViewer ID", placeholder: "e.g. 123 456 789" }, { key: "anyDeskId", label: "AnyDesk ID or alias", placeholder: "e.g. 123 456 789 or store-screen@ad" }] as const;

export default function ScreenRemoteAccess({ screenId, onLeaveGuard }: { screenId: string; onLeaveGuard: (guard: (() => boolean) | null) => void }) {
  const [record, setRecord] = useState<RemoteRecord>({ ...emptyFields, version: null, updatedAt: null });
  const [draft, setDraft] = useState<ScreenRemoteFields>(emptyFields);
  const [editing, setEditing] = useState(false), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [loadError, setLoadError] = useState(""), [copyStatus, setCopyStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const dirty = editing && fields.some(({ key }) => draft[key].trim() !== record[key]);
  const leave = useCallback(() => {
    if (saving) return false;
    if (dirty && !window.confirm("Discard unsaved remote access changes?")) return false;
    setEditing(false); setDraft(emptyFields); setError("");
    return true;
  }, [dirty, saving]);
  useEffect(() => { onLeaveGuard(leave); return () => onLeaveGuard(null); }, [leave, onLeaveGuard]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        const response = await clientFetch(`/api/screen-remote-access?screenId=${encodeURIComponent(screenId)}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { window.location.replace("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load remote access details.");
        if (!controller.signal.aborted) { setRecord(data.record); setLoadError(""); }
      } catch (cause) { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Could not load remote access details."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [screenId, revision]);

  async function save() {
    if (saving || !dirty) return;
    setError("");
    let normalized: ScreenRemoteFields;
    try { normalized = parseScreenRemoteAccess(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Enter valid remote access details."); return; }
    setSaving(true);
    try {
      const response = await clientFetch("/api/screen-remote-access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ screenId, fields: normalized, version: record.version }) });
      if (response.status === 401) { window.location.replace("/login"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save remote access details.");
      setRecord(data.record); setEditing(false); setDraft(emptyFields); setCopyStatus("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save remote access details."); }
    finally { setSaving(false); }
  }
  async function copy(key: keyof ScreenRemoteFields, label: string) {
    try { await navigator.clipboard.writeText(record[key]); setCopyStatus(`${label} copied.`); }
    catch { setCopyStatus("Could not copy. Select the ID and copy it manually."); }
  }
  const editedDate = record.updatedAt ? new Date(record.updatedAt) : null;
  const lastEdited = editedDate && Number.isFinite(editedDate.getTime()) ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(editedDate) + " GST" : null;
  return <section className="adm-panel screen-notes-card screen-remote-card" aria-labelledby="screen-remote-title">
    <div className="screen-notes-head"><h2 id="screen-remote-title">Remote access</h2>
      {!editing && !loading && !loadError && <button type="button" className="adm-secondary-btn" onClick={() => { setDraft({ teamViewerId: record.teamViewerId, anyDeskId: record.anyDeskId }); setEditing(true); setError(""); setCopyStatus(""); }}>Edit</button>}
    </div>
    {loading && <p className="onsign-hint" role="status">Loading remote access details…</p>}
    {loadError && <div className="adm-error" role="alert">{loadError}<button type="button" className="adm-secondary-btn" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
    {!loading && !loadError && (editing ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="screen-remote-fields">{fields.map(({ key, label, placeholder }, index) => <label key={key} htmlFor={`screen-remote-${key}`}>{label}<input id={`screen-remote-${key}`} autoFocus={index === 0} value={draft[key]} maxLength={REMOTE_ID_MAX_LENGTH} autoComplete="off" spellCheck={false} disabled={saving} placeholder={placeholder} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))}/></label>)}</div>
      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="screen-notes-actions"><button type="button" className="adm-secondary-btn" disabled={saving} onClick={() => { setEditing(false); setDraft(emptyFields); setError(""); }}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button></div>
    </form> : <>
      <dl className="screen-remote-fields">{fields.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd><span>{record[key] || "Not added"}</span>{record[key] && <button type="button" className="adm-secondary-btn" aria-label={`Copy ${label}`} onClick={() => void copy(key, label)}><Copy size={15} aria-hidden="true"/>Copy</button>}</dd></div>)}</dl>
      {copyStatus && <p className="onsign-hint" role="status">{copyStatus}</p>}
      {lastEdited && <p className="onsign-hint">Last edited {lastEdited}</p>}
    </>)}
  </section>;
}
