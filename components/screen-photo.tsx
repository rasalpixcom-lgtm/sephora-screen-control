"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated local photo endpoints and in-memory file previews must bypass the public image optimizer. */
import { useEffect, useId, useRef, useState } from "react";
import { ImageIcon, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { screenPhotoLimit, screenPhotoTypes, screenPhotoUrl } from "@/lib/screen-photo-shared";
import "./screen-photo.css";

export type PhotoDraft = { file: File | null; remove: boolean };
export function ScreenPhotoInput({ screenId, photoKey, value, onChange, disabled }: { screenId?: string; photoKey?: string | null; value: PhotoDraft; onChange: (value: PhotoDraft) => void; disabled: boolean }) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (!value.file) return;
    const file = value.file, reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setPreview({ file, url: reader.result }); };
    reader.onerror = () => setError("This photo preview could not be read. Try another file.");
    reader.readAsDataURL(file);
    return () => { reader.onload = null; reader.onerror = null; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, [value.file]);
  const source = value.file ? preview?.file === value.file ? preview.url : null : !value.remove && screenId && photoKey ? screenPhotoUrl(screenId, photoKey) : null;
  return <div className={`screen-photo-input${source ? " has-preview" : ""}`}>
    <label htmlFor={id}>Physical screen photo <small>Optional · one JPG, PNG or WebP, up to 5 MB</small></label>
    {source && <img className="screen-photo-preview" src={source} alt="Physical screen photo preview" onError={() => setError("The photo preview is unavailable. Try another image or replace the saved photo.")}/>}
    <div className="screen-photo-controls"><input ref={input} id={id} type="file" accept={screenPhotoTypes.join(",")} disabled={disabled} aria-describedby={`${id}-hint`} onChange={event => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!screenPhotoTypes.includes(file.type) || !file.size || file.size > screenPhotoLimit) { setError("Choose a JPG, PNG or WebP photo up to 5 MB."); return; }
      setError(""); onChange({ file, remove: false });
    }}/>
    <div className="screen-photo-actions">
      {(value.file || (!value.remove && photoKey)) && <button type="button" className="adm-secondary-btn" disabled={disabled} onClick={() => { setError(""); onChange({ file: null, remove: true }); }}>Remove photo</button>}
      {(value.file || value.remove) && <button type="button" className="adm-secondary-btn" disabled={disabled} onClick={() => { setError(""); onChange({ file: null, remove: false }); }}>Undo photo change</button>}
    </div>
    {error && <p className="adm-error" role="alert">{error}</p>}
    <p id={`${id}-hint`} className="screen-photo-hint">{value.remove ? "The photo will be removed when you save." : value.file ? "New photo selected. Save screen to apply it." : "Choose a file to add or replace the photo. Changes apply only when you save."}</p>
    </div>
  </div>;
}

export function ScreenPhotoView({ screenId, photoKey, name }: { screenId: string; photoKey?: string | null; name: string }) {
  const [open, setOpen] = useState(false), [failed, setFailed] = useState(false), [largeFailed, setLargeFailed] = useState(false);
  return <div className="screen-photo-header" role="group" aria-label="Physical screen photo">
    {photoKey ? <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) setLargeFailed(false); }}>
      <DialogTrigger asChild><button type="button" className="screen-photo-thumbnail" aria-label={`View physical photo of ${name}`}>
        {failed ? <ImageIcon size={18}/> : <img src={screenPhotoUrl(screenId, photoKey)} width={44} height={32} alt={`Physical installation of ${name}`} onError={() => setFailed(true)}/>}
        <span>{failed ? "Photo unavailable" : <><ZoomIn size={14}/>View photo</>}</span>
      </button></DialogTrigger>
      <DialogContent className="adm-dialog screen-photo-dialog"><DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>Physical screen photo · saved installation image</DialogDescription></DialogHeader>
        {open && (largeFailed ? <p role="alert">The photo could not be loaded. Close this view and try again.</p> : <img className="screen-photo-full" src={screenPhotoUrl(screenId, photoKey, false)} alt={`Physical installation of ${name}`} onError={() => setLargeFailed(true)}/>)}
      </DialogContent>
    </Dialog> : <div className="screen-photo-empty" title="No physical photo added. Add one in Edit Screen."><ImageIcon size={16}/><span>No photo</span></div>}
  </div>;
}
