"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/client-fetch";
import { SURVEY_TEXT_LIMIT, type SurveyPreview } from "@/lib/survey-import";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./screen-survey-import.css";

export default function ScreenSurveyImport({ screenId, beforeOpen, onImported }: { screenId: string; beforeOpen: () => boolean; onImported: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [text, setText] = useState("");
  const [preview, setPreview] = useState<SurveyPreview | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [confirmScreen, setConfirmScreen] = useState(false), [confirmType, setConfirmType] = useState(false), [confirmWarnings, setConfirmWarnings] = useState(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (open && (text || busy)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [open, text, busy]);
  function close() {
    if (busy || (text && !window.confirm("Discard this unsaved survey import?"))) return;
    setOpen(false); setText(""); setPreview(null); setError("");
  }
  async function requestPreview() {
    if (busy) return;
    setBusy(true); setError(""); setPreview(null);
    try {
      const response = await clientFetch("/api/survey-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ screenId, text }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not preview the survey.");
      const next = data.preview as SurveyPreview;
      setPreview(next); setSelected(next.rows.filter(row => row.selected).map(row => row.id));
      setConfirmScreen(false); setConfirmType(false); setConfirmWarnings(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not preview the survey."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview || busy) return;
    setBusy(true); setError("");
    try {
      const response = await clientFetch("/api/survey-import", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ screenId, text, fingerprint: preview.fingerprint, selected, confirmScreen, confirmType, confirmWarnings }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not import the survey.");
      setOpen(false); setText(""); setPreview(null); setSuccess(`Survey imported: ${data.fields} fields saved.`);
      onImported(); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import the survey."); }
    finally { setBusy(false); }
  }
  const typeChange = !!preview && preview.currentType !== preview.screenType;
  const normalizedName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const sourceMatches = !!preview?.source && normalizedName(preview.source.split(/\s+—\s+/)[0]) === normalizedName(preview.screenName);
  // The type change is already shown in the target summary and its confirmation.
  const visibleWarnings = preview?.warnings.filter(warning => !warning.startsWith("Screen type will change from ")) || [];
  return <>
    <div className="survey-import-toolbar"><button type="button" className="adm-secondary-btn" onClick={() => { if (beforeOpen()) { setSuccess(""); setOpen(true); } }}>Import survey details</button></div>
    {success && <p role="status">{success}</p>}
    <Dialog open={open} onOpenChange={value => { if (!value) close(); }}><DialogContent className="adm-dialog survey-import-dialog" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader><DialogTitle>Import survey details</DialogTitle><DialogDescription>{preview ? "Review survey details before importing." : "Paste one screen’s Copy fields text."}</DialogDescription></DialogHeader>
      <div className="survey-import-body">
        {!preview ? <label htmlFor="survey-copy-text">Copied survey fields<textarea id="survey-copy-text" rows={12} maxLength={SURVEY_TEXT_LIMIT} value={text} disabled={busy} onChange={event => setText(event.target.value)} placeholder="Paste the screen name, SCREEN TYPE, hardware sections and PPM INSPECTION here."/></label> : <>
          <div className="survey-import-target"><strong>Import into: {preview.screenName}</strong><p>{preview.location}</p>{!sourceMatches && <p>Copied from: {preview.source || "Name not supplied"}</p>}<p>Screen type: {preview.currentType || "Not specified"}{typeChange ? ` → ${preview.screenType}` : ""}</p></div>
          <p className="onsign-hint">{selected.length} changes selected · {preview.skipped} blank fields skipped.</p>
          {!!visibleWarnings.length && <div className="survey-import-warning" role="note"><ul>{visibleWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
          {preview.rows.length ? <div className="survey-import-table-wrap"><table className="survey-import-table"><thead><tr><th scope="col">Import</th><th scope="col">Field</th><th scope="col">Current value</th><th scope="col">Survey value</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Import ${row.group}: ${row.label}`} checked={selected.includes(row.id)} disabled={busy} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id))}/></td><th scope="row"><small>{row.group}</small>{row.label}</th><td>{row.current || "Not recorded"}</td><td>{row.incoming}</td></tr>)}</tbody></table></div> : <p>No field differences found. Existing values already match.</p>}
          <label className="survey-import-check"><input type="checkbox" checked={confirmScreen} disabled={busy} onChange={event => setConfirmScreen(event.target.checked)}/>Correct screen confirmed</label>
          {typeChange && <label className="survey-import-check"><input type="checkbox" checked={confirmType} disabled={busy} onChange={event => setConfirmType(event.target.checked)}/>Change type to {preview.screenType}</label>}
          <label className="survey-import-check"><input type="checkbox" checked={confirmWarnings} disabled={busy} onChange={event => setConfirmWarnings(event.target.checked)}/>Changes and warnings reviewed</label>
        </>}
        {error && <p className="adm-error" role="alert">{error}</p>}
      </div>
      <div className="survey-import-footer"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={close}>Cancel</button>{preview ? <><button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>Back to text</button><button type="button" className="adm-primary-btn" disabled={busy || !confirmScreen || !confirmWarnings || (typeChange && !confirmType) || (!selected.length && !typeChange)} onClick={() => void save()}>{busy ? "Saving…" : "Import selected changes"}</button></> : <button type="button" className="adm-primary-btn" disabled={busy || !text.trim()} onClick={() => void requestPreview()}>{busy ? "Preparing preview…" : "Preview import"}</button>}</div>
    </DialogContent></Dialog>
  </>;
}
