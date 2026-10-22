"use client";

import { useCallback, useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { SCREEN_NOTE_MAX_LENGTH } from "@/lib/screen-notes";
import "./screen-notes.css";

type NoteRecord = { text: string; version: string | null; updatedAt: string | null };
const emptyNote: NoteRecord = { text: "", version: null, updatedAt: null };

function editedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(date) + " GST";
}

export default function ScreenNotes({ screenId, onLeaveGuard }: { screenId: string; onLeaveGuard: (guard: (() => boolean) | null) => void }) {
  const [note, setNote] = useState<NoteRecord>(emptyNote);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const dirty = editing && draft.trim() !== note.text;
  const lastEdited = note.updatedAt ? editedAt(note.updatedAt) : null;

  const leave = useCallback(() => {
    if (saving) return false;
    if (dirty && !window.confirm("Discard unsaved note changes?")) return false;
    setEditing(false); setDraft(""); setError("");
    return true;
  }, [dirty, saving]);
  useEffect(() => { onLeaveGuard(leave); return () => onLeaveGuard(null); }, [leave, onLeaveGuard]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, saving]);
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const response = await clientFetch(`/api/screen-notes?screenId=${encodeURIComponent(screenId)}`, { cache: "no-store" });
        if (response.status === 401) { window.location.replace("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load this note.");
        if (active) { setNote(data.note); setLoadError(""); }
      } catch (cause) { if (active) setLoadError(cause instanceof Error ? cause.message : "Could not load this note."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [screenId, revision]);

  async function save() {
    if (saving || !dirty) return;
    setSaving(true); setError("");
    try {
      const response = await clientFetch("/api/screen-notes", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenId, note: draft, version: note.version }),
      });
      if (response.status === 401) { window.location.replace("/login"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this note.");
      setNote(data.note); setEditing(false); setDraft("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this note."); }
    finally { setSaving(false); }
  }

  return <section className="adm-panel screen-notes-card" aria-labelledby="screen-notes-title">
    <div className="screen-notes-head"><h2 id="screen-notes-title">Notes</h2>
      {!editing && !loading && !loadError && <button type="button" className="adm-secondary-btn" onClick={() => { setDraft(note.text); setEditing(true); setError(""); }}>{note.text ? "Edit" : "Add note"}</button>}
    </div>
    {loading && <p className="onsign-hint" role="status">Loading note…</p>}
    {loadError && <div className="adm-error" role="alert">{loadError} <button type="button" className="adm-secondary-btn" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
    {!loading && !loadError && (editing ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label htmlFor="screen-notes-text">Screen note</label>
      <textarea id="screen-notes-text" value={draft} maxLength={SCREEN_NOTE_MAX_LENGTH} rows={3} disabled={saving} onChange={event => setDraft(event.target.value)} />
      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="screen-notes-actions"><button type="button" className="adm-secondary-btn" disabled={saving} onClick={() => { setEditing(false); setDraft(""); setError(""); }}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button></div>
    </form> : note.text ? <><p className="screen-notes-text">{note.text}</p>{lastEdited && <p className="onsign-hint">Last edited {lastEdited}</p>}</> : <p className="onsign-hint">No notes added.</p>)}
  </section>;
}
