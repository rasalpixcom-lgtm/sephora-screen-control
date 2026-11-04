"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { clientFetch } from "@/lib/client-fetch";

export default function ScreenDetailsDownload({ screenId, name }: { screenId: string; name: string }) {
  const [open, setOpen] = useState(false), [includeLocationPhotos, setIncludeLocationPhotos] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await clientFetch(`/api/reports/screen-details/pdf?${new URLSearchParams({ screenId, locationPhotos: includeLocationPhotos ? "1" : "0" })}`);
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Could not download this report."); }
      const url = URL.createObjectURL(await response.blob()), link = document.createElement("a");
      link.href = url; link.download = `${name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-").slice(0, 100) || "screen"} - Screen Details.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not download this report."); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (busy) return; setOpen(value); if (value) { setIncludeLocationPhotos(false); setError(""); } }}>
    <DialogTrigger asChild><button type="button" className="adm-secondary-btn"><Download size={16}/>Download PDF</button></DialogTrigger>
    <DialogContent className="adm-dialog"><DialogHeader><DialogTitle>Download screen PDF</DialogTitle><DialogDescription>Saved hardware, PPM inspection, location details and screen photos.</DialogDescription></DialogHeader>
      {error && <p className="adm-error" role="alert">{error}</p>}
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBlock: 20 }}><input type="checkbox" checked={includeLocationPhotos} disabled={busy} onChange={event => setIncludeLocationPhotos(event.target.checked)}/>Include location photos</label>
      <div className="adm-form-actions"><button type="button" className="adm-secondary-btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button type="button" className="adm-primary-btn" disabled={busy} onClick={() => void download()}>{busy ? "Preparing PDF…" : "Download PDF"}</button></div>
    </DialogContent>
  </Dialog>;
}
