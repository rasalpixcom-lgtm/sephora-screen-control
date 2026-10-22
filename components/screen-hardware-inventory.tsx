"use client";

import { useCallback, useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";
import { displayHardwareFields, hardwareSectionIds, hardwareSections, type HardwareFields, type HardwareRecord, type HardwareSection } from "@/lib/screen-hardware";
import LedSizeDiagram from "./led-size-diagram";
import "./screen-hardware-inventory.css";

type Records = Record<HardwareSection, HardwareRecord>;
const emptyRecords = () => Object.fromEntries(hardwareSectionIds.map(id => [id, { fields: {}, version: null, updatedAt: null }])) as Records;
const comparableFields = (fields: HardwareFields) => JSON.stringify(Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)));

export default function ScreenHardwareInventory({ screenId, onLeaveGuard }: { screenId: string; onLeaveGuard: (guard: (() => boolean) | null) => void }) {
  const [records, setRecords] = useState<Records>(emptyRecords);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<HardwareSection | null>(null);
  const [draft, setDraft] = useState<HardwareFields>({});
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const dirty = editing !== null && comparableFields(draft) !== comparableFields(records[editing].fields);

  const leave = useCallback(() => {
    if (saving) return false;
    if (dirty && !window.confirm("Discard unsaved hardware details?")) return false;
    setEditing(null); setDraft({}); setError("");
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
        const response = await clientFetch(`/api/screen-hardware?screenId=${encodeURIComponent(screenId)}`, { cache: "no-store" });
        if (response.status === 401) { window.location.replace("/login"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load hardware details.");
        if (active) { setRecords(data.sections); setLoadError(""); }
      } catch (cause) { if (active) setLoadError(cause instanceof Error ? cause.message : "Could not load hardware details."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [screenId, revision]);

  function begin(section: HardwareSection) {
    if (editing && !leave()) return;
    setDraft({ ...records[section].fields }); setEditing(section); setError("");
  }
  async function save(section: HardwareSection) {
    if (saving || !dirty) return;
    setSaving(true); setError("");
    try {
      const response = await clientFetch("/api/screen-hardware", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenId, section, fields: draft, version: records[section].version }),
      });
      if (response.status === 401) { window.location.replace("/login"); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save hardware details.");
      setRecords(previous => ({ ...previous, [section]: data.record }));
      setEditing(null); setDraft({});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save hardware details."); }
    finally { setSaving(false); }
  }

  return <div className="hardware-inventory">
    {loading && <p className="onsign-hint" role="status">Loading hardware details…</p>}
    {loadError && <div className="adm-error" role="alert">{loadError} <button type="button" className="adm-secondary-btn" onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
    {!loading && !loadError && hardwareSectionIds.map(section => {
      const definition = hardwareSections[section], record = records[section];
      const shownFields = displayHardwareFields(section, record.fields);
      const values = definition.fields.filter(([key]) => !!shownFields[key]);
      const isEditing = editing === section;
      const draftFields = displayHardwareFields(section, draft);
      return <section className="adm-panel hardware-card" key={section} aria-labelledby={`hardware-${section}`}>
        <div className="hardware-card-head"><h2 id={`hardware-${section}`}>{definition.title}</h2>
          {!isEditing && <button type="button" className="adm-secondary-btn" disabled={saving} onClick={() => begin(section)}>{values.length ? "Edit" : "Add details"}</button>}
        </div>
        {section === "ledDisplay" && isEditing && <p className="onsign-hint hardware-section-hint">Size and area are calculated from resolution and pixel pitch.</p>}
        {section === "mediaPlayer" && <p className="onsign-hint hardware-section-hint">CMS device ID is a manual inventory field; the linked OnSign player remains separate.</p>}
        {isEditing ? <form onSubmit={event => { event.preventDefault(); void save(section); }}>
          <div className="hardware-form-fields">{definition.fields.map(([key, label]) => {
            const calculated = section === "ledDisplay" && (key === "dimensions" || key === "totalSqm");
            return <label key={key} htmlFor={`hardware-${section}-${key}`}>
              <span>{label}</span>{calculated
                ? <output id={`hardware-${section}-${key}`} className="hardware-calculated-value" aria-live="polite">{draftFields[key] || "Enter resolution and pixel pitch"}</output>
                : <input id={`hardware-${section}-${key}`} value={draft[key] || ""} maxLength={200} disabled={saving} inputMode={key === "pixelPitch" ? "decimal" : undefined} placeholder={key === "resolution" ? "Width × height" : undefined} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))}/>}
            </label>;
          })}</div>
          {error && <p className="adm-error" role="alert">{error}</p>}
          <div className="hardware-form-actions"><button type="button" className="adm-secondary-btn" disabled={saving} onClick={() => { setEditing(null); setDraft({}); setError(""); }}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button></div>
        </form> : values.length ? <div className={section === "ledDisplay" && shownFields.dimensions ? "hardware-led-summary" : undefined}>
          <dl className="onsign-fields hardware-fields">{values.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{shownFields[key]}</dd></div>)}</dl>
          {section === "ledDisplay" && shownFields.dimensions && <LedSizeDiagram resolution={shownFields.resolution} pixelPitch={shownFields.pixelPitch} />}
        </div>
          : <p className="onsign-hint">No details added.</p>}
      </section>;
    })}
  </div>;
}
