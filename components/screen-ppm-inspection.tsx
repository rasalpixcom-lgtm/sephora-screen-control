"use client";

import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import {
  ppmChecks,
  ppmCheckStatuses,
  ppmOverallStatuses,
  type PpmFields,
  type PpmRecord,
} from "@/lib/screen-ppm-inspection";
import "./screen-ppm-inspection.css";

type Props = { screenId: string; onLeaveGuard?: (guard: (() => boolean) | null) => void };
type ApiRecord = PpmRecord & { updatedAt: string | null };
const emptyRecord: ApiRecord = { fields: {}, version: null, updatedAt: null };

function dateLabel(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function updatedLabel(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(date) + " GST";
}

function hasValues(fields: PpmFields) { return Object.values(fields).some(Boolean); }
function fieldsKey(fields: PpmFields) { return JSON.stringify(Object.fromEntries(Object.entries(fields).sort(([left], [right]) => left.localeCompare(right)))); }

export default function ScreenPpmInspection({ screenId, onLeaveGuard }: Props) {
  const [record, setRecord] = useState<ApiRecord>(emptyRecord);
  const [draft, setDraft] = useState<PpmFields>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const dirty = editing && fieldsKey(draft) !== fieldsKey(record.fields);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true); setLoadError("");
      try {
        const response = await clientFetch(`/api/screen-ppm-inspection?screenId=${encodeURIComponent(screenId)}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load the PPM inspection.");
        if (active) {
          const next = body.record as ApiRecord;
          setRecord(next); setDraft(next.fields || {});
        }
      } catch (cause) { if (active) setLoadError(cause instanceof Error ? cause.message : "Could not load the PPM inspection."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [screenId, revision]);
  useEffect(() => {
    const guard = () => {
      if (saving) return false;
      if (dirty && !window.confirm("Discard unsaved PPM inspection changes?")) return false;
      setEditing(false); setDraft({ ...record.fields }); setError("");
      return true;
    };
    onLeaveGuard?.(guard);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { onLeaveGuard?.(null); window.removeEventListener("beforeunload", beforeUnload); };
  }, [dirty, onLeaveGuard, record.fields, saving]);

  function setField(key: keyof PpmFields, value: string) {
    setDraft(current => {
      const next = { ...current };
      if (value) (next as Record<string, string>)[key] = value; else delete next[key];
      return next;
    });
  }
  function beginEdit() {
    setDraft({ ...record.fields }); setError(""); setEditing(true);
  }
  function cancel() {
    if (dirty && !window.confirm("Discard unsaved PPM inspection changes?")) return;
    setDraft({ ...record.fields }); setError(""); setEditing(false);
  }
  async function save() {
    if (saving || !dirty) return;
    setSaving(true); setError("");
    try {
      const response = await clientFetch("/api/screen-ppm-inspection", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ screenId, fields: draft, version: record.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save the PPM inspection.");
      const next = body.record as ApiRecord;
      setRecord(next); setDraft(next.fields || {}); setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the PPM inspection."); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="adm-panel screen-ppm-card"><p className="onsign-hint">Loading PPM inspection…</p></section>;
  if (loadError) return <section className="adm-panel screen-ppm-card"><p className="adm-error" role="alert">{loadError}</p><button type="button" className="adm-secondary-btn" onClick={() => setRevision(current => current + 1)}>Retry</button></section>;
  const fields = editing ? draft : record.fields;
  return <section className="adm-panel screen-ppm-card" aria-label="PPM inspection">
    <div className="screen-ppm-head"><div><h2>PPM inspection</h2><p className="onsign-hint">Preventive maintenance inspection record.</p></div>{!editing && <button type="button" className="adm-secondary-btn" onClick={beginEdit}>{record.version ? "Edit inspection" : "Add inspection"}</button>}</div>
    {error && <p className="adm-error" role="alert">{error}</p>}
    {editing ? <form className="screen-ppm-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className="screen-ppm-edit-grid">
        <label className="screen-ppm-field">PPM date<input type="date" value={draft.ppmDate || ""} onChange={event => setField("ppmDate", event.target.value)} /></label>
        <label className="screen-ppm-field">Next PPM date<input type="date" value={draft.nextPpmDate || ""} onChange={event => setField("nextPpmDate", event.target.value)} /></label>
        <label className="screen-ppm-field">Client / project<input value={draft.clientProject || ""} maxLength={200} onChange={event => setField("clientProject", event.target.value)} /></label>
        <label className="screen-ppm-field">Overall status<select value={draft.overallStatus || ""} onChange={event => setField("overallStatus", event.target.value)}><option value="">Not recorded</option>{ppmOverallStatuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
      </div>
      <fieldset className="screen-ppm-check-fieldset"><legend>Inspection checks</legend><div className="screen-ppm-checks">{ppmChecks.map(([key, label]) => <label className="screen-ppm-field" key={key}>{label}<select value={draft[key] || ""} onChange={event => setField(key, event.target.value)}><option value="">Not checked</option>{ppmCheckStatuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>)}</div></fieldset>
      <div className="screen-ppm-edit-grid"><label className="screen-ppm-field">Defects / findings<textarea value={draft.findings || ""} maxLength={4000} onChange={event => setField("findings", event.target.value)} /></label><label className="screen-ppm-field">Corrective action<textarea value={draft.correctiveAction || ""} maxLength={4000} onChange={event => setField("correctiveAction", event.target.value)} /></label></div>
      <div className="screen-ppm-actions"><button type="button" className="adm-secondary-btn" onClick={cancel} disabled={saving}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={saving}>{saving ? "Saving…" : "Save inspection"}</button></div>
    </form> : !hasValues(fields) ? <p className="onsign-hint">No PPM inspection recorded.</p> : <>
      <dl className="screen-ppm-summary"><div><dt>Overall status</dt><dd data-status={fields.overallStatus || ""}>{fields.overallStatus || "Not recorded"}</dd></div><div><dt>PPM date</dt><dd>{dateLabel(fields.ppmDate)}</dd></div><div><dt>Next PPM date</dt><dd>{dateLabel(fields.nextPpmDate)}</dd></div><div><dt>Client / project</dt><dd>{fields.clientProject || "Not recorded"}</dd></div></dl>
      <h3 className="screen-ppm-section-title">Inspection checks</h3><dl className="screen-ppm-check-view">{ppmChecks.map(([key, label]) => <div key={key}><dt>{label}</dt><dd data-status={fields[key] || ""}>{fields[key] || "Not recorded"}</dd></div>)}</dl>
      {(fields.findings || fields.correctiveAction) && <div className="screen-ppm-notes">{fields.findings && <div><h3>Defects / findings</h3><p>{fields.findings}</p></div>}{fields.correctiveAction && <div><h3>Corrective action</h3><p>{fields.correctiveAction}</p></div>}</div>}
      {record.updatedAt && <p className="onsign-hint screen-ppm-updated">Last edited {updatedLabel(record.updatedAt)}</p>}
    </>}
  </section>;
}
