"use client";

/* eslint-disable @next/next/no-img-element -- Private image endpoints and local previews bypass the public image optimizer. */
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImageIcon, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { LocationPhoto } from "@/lib/store";
import { locationPhotoLabelMax, locationPhotoMax } from "@/lib/location-photo-shared";
import { screenPhotoLimit, screenPhotoTypes } from "@/lib/screen-photo-shared";
import "./location-photos.css";

export type LocationPhotoDraft = { id?: string; clientId?: string; file?: File; label: string };

export function locationPhotoUrl(locationId: string, id: string, full = false) {
  return `/api/location-photo?${new URLSearchParams({ locationId, id, size: full ? "full" : "thumbnail" })}`;
}

function DraftThumbnail({ photo, locationId }: { photo: LocationPhotoDraft; locationId?: string }) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!photo.file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setPreview(reader.result); };
    reader.readAsDataURL(photo.file);
    return () => { reader.onload = null; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, [photo.file]);
  const src = photo.file ? preview : photo.id && locationId ? locationPhotoUrl(locationId, photo.id) : "";
  return src ? <img src={src} alt="Location photo preview" /> : <ImageIcon aria-hidden="true" />;
}

export function LocationPhotosInput({ locationId, value, onChange, disabled }: { locationId?: string; value: LocationPhotoDraft[]; onChange: (value: LocationPhotoDraft[]) => void; disabled: boolean }) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const nextDraftId = useRef(0);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const selectedIndex = Math.max(0, value.findIndex(photo => (photo.id || photo.clientId) === selectedId));
  const selectedPhoto = value[selectedIndex];
  const move = (index: number, offset: number) => {
    const next = [...value], target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setSelectedId(next[target].id || next[target].clientId || "");
  };
  return <section className="location-photo-input" aria-label="Location photos">
    <div className="location-photo-heading"><div><strong>Location photos</strong><small>Up to five JPG, PNG or WebP images, 5 MB each. Add an optional label to explain each view.</small></div><span>{value.length}/{locationPhotoMax}</span></div>
    {value.length > 0 && <>
      <div className="location-photo-drafts" role="group" aria-label="Choose a photo to edit">{value.map((photo, index) => <button type="button" className="location-photo-draft" key={photo.id || photo.clientId || index} aria-label={`Edit photo ${index + 1}${photo.label ? `: ${photo.label}` : ""}`} aria-pressed={index === selectedIndex} onClick={() => setSelectedId(photo.id || photo.clientId || "")}>
        <span className="location-photo-draft-preview"><DraftThumbnail photo={photo} locationId={locationId}/></span><span>Photo {index + 1}</span>
      </button>)}</div>
      <div className="location-photo-selected">
        <label htmlFor={`${id}-label`}>Photo {selectedIndex + 1} label<input id={`${id}-label`} maxLength={locationPhotoLabelMax} value={selectedPhoto.label} disabled={disabled} placeholder="e.g. Building exterior" onChange={event => onChange(value.map((item, position) => position === selectedIndex ? { ...item, label: event.target.value } : item))}/></label>
        <div className="location-photo-draft-actions"><button type="button" className="adm-secondary-btn" disabled={disabled || selectedIndex === 0} onClick={() => move(selectedIndex, -1)} aria-label={`Move photo ${selectedIndex + 1} left`}><ArrowLeft size={16}/></button><button type="button" className="adm-secondary-btn" disabled={disabled || selectedIndex === value.length - 1} onClick={() => move(selectedIndex, 1)} aria-label={`Move photo ${selectedIndex + 1} right`}><ArrowRight size={16}/></button><button type="button" className="adm-secondary-btn" disabled={disabled} onClick={() => { onChange(value.filter((_, position) => position !== selectedIndex)); setSelectedId(value[selectedIndex + 1]?.id || value[selectedIndex + 1]?.clientId || value[selectedIndex - 1]?.id || value[selectedIndex - 1]?.clientId || ""); }} aria-label={`Remove photo ${selectedIndex + 1}`}><Trash2 size={16}/></button></div>
      </div>
    </>}
    {value.length < locationPhotoMax && <><input ref={input} id={`${id}-files`} className="location-photo-file" type="file" multiple accept={screenPhotoTypes.join(",")} disabled={disabled} onChange={event => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (!files.length) return;
      if (files.length > locationPhotoMax - value.length) { setError(`Choose no more than ${locationPhotoMax - value.length} additional photo${locationPhotoMax - value.length === 1 ? "" : "s"}.`); return; }
      if (files.some(file => !screenPhotoTypes.includes(file.type) || !file.size || file.size > screenPhotoLimit)) { setError("Choose JPG, PNG or WebP images up to 5 MB each."); return; }
      // Draft keys stay in this editor; secure-context-only UUIDs break HTTP LAN use.
      const added = files.map(file => ({ clientId: `${id}-draft-${++nextDraftId.current}`, file, label: "" }));
      setError(""); onChange([...value, ...added]); setSelectedId(added[0].clientId);
    }}/><button type="button" className="adm-secondary-btn" disabled={disabled} onClick={() => input.current?.click()}><Plus size={16}/> Add photos</button></>}
    {error && <p className="adm-error" role="alert">{error}</p>}
    <small>Photo changes apply when you save the location.</small>
  </section>;
}

export function LocationPhotosView({ locationId, name, photos }: { locationId: string; name: string; photos: LocationPhoto[] }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(0), [failed, setFailed] = useState(false);
  if (!photos.length) return <span className="location-photo-empty" aria-label="No photos">—</span>;
  const active = photos[Math.min(selected, photos.length - 1)];
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (value) { setSelected(0); setFailed(false); } }}>
    <DialogTrigger asChild><button type="button" className="location-photo-view" aria-label={`View ${photos.length} photos of ${name}`}><img src={locationPhotoUrl(locationId, photos[0].id)} alt=""/><span>View <small>({photos.length})</small></span></button></DialogTrigger>
    <DialogContent className="adm-dialog location-photo-gallery"><DialogHeader><DialogTitle>{name}</DialogTitle><DialogDescription>Location photos · {photos.length} of {locationPhotoMax}</DialogDescription></DialogHeader>
      {open && <><div className="location-photo-large">{failed ? <p role="alert">This photo is unavailable.</p> : <img key={active.id} src={locationPhotoUrl(locationId, active.id, true)} alt={active.label || `Location photo ${selected + 1}`} onError={() => setFailed(true)}/>}</div>
        <p className="location-photo-caption">{active.label || `Photo ${selected + 1}`}</p>
        {photos.length > 1 && <div className="location-photo-thumbs" aria-label="Choose a location photo">{photos.map((photo, index) => <button key={photo.id} type="button" aria-label={`View photo ${index + 1}${photo.label ? `: ${photo.label}` : ""}`} aria-current={index === selected ? "true" : undefined} onClick={() => { setSelected(index); setFailed(false); }}><img src={locationPhotoUrl(locationId, photo.id)} alt=""/></button>)}</div>}
      </>}
    </DialogContent>
  </Dialog>;
}
