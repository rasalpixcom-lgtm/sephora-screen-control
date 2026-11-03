"use client";

/* eslint-disable @next/next/no-img-element -- Private authenticated photos and local file previews bypass the image optimizer. */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/client-fetch";
import { screenPhotoLimit, screenPhotoTypes } from "@/lib/screen-photo-shared";
import { galleryPhotoUrl, photoCategoriesForScreen, type ScreenPhotoCategory } from "@/lib/screen-gallery-shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./screen-photo.css";
import "./screen-gallery.css";

type Photos = Partial<Record<ScreenPhotoCategory, string | null>>;
export default function ScreenGallery({ screenId, onLeaveGuard }: { screenId: string; onLeaveGuard: (guard: (() => boolean) | null) => void }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photos>({ front: null, serial: null, issues: null });
  const [screenType, setScreenType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [editing, setEditing] = useState<ScreenPhotoCategory | null>(null);
  const [file, setFile] = useState<File | null>(null), [remove, setRemove] = useState(false), [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(""), [viewing, setViewing] = useState<ScreenPhotoCategory | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const dirty = !!file || remove;
  const leave = useCallback(() => {
    if (saving || (dirty && !window.confirm("Discard unsaved photo changes?"))) return false;
    setEditing(null); setFile(null); setRemove(false); setError(""); return true;
  }, [dirty, saving]);
  useEffect(() => { onLeaveGuard(leave); return () => onLeaveGuard(null); }, [leave, onLeaveGuard]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await clientFetch(`/api/screen-gallery?screenId=${encodeURIComponent(screenId)}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load photos.");
        if (active) { setPhotos(data.photos); setScreenType(data.screenType); setLoadError(""); setImageErrors({}); }
      } catch (cause) { if (active) setLoadError(cause instanceof Error ? cause.message : "Could not load photos."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [screenId, revision]);
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setPreview(reader.result); };
    reader.onerror = () => setError("Could not preview this photo. Choose another file.");
    reader.readAsDataURL(file);
    return () => { reader.onload = null; reader.onerror = null; if (reader.readyState === FileReader.LOADING) reader.abort(); };
  }, [file]);
  async function save() {
    if (!editing || !dirty || saving) return;
    const category = editing;
    setSaving(true); setError("");
    try {
      const form = new FormData();
      form.set("metadata", JSON.stringify({ screenId, category, expectedKey: photos[category] ?? null, action: file ? "replace" : "remove" }));
      if (file) form.set("photo", file);
      const response = await clientFetch("/api/screen-gallery", { method: "PUT", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save this photo.");
      setPhotos(previous => ({ ...previous, [category]: data.key }));
      setImageErrors({}); setEditing(null); setFile(null); setRemove(false);
      if (category === "front") router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this photo."); }
    finally { setSaving(false); }
  }
  return <section aria-labelledby="screen-gallery-title">
    <div className="screen-gallery-head"><h2 id="screen-gallery-title">Screen photos</h2><button type="button" className="adm-secondary-btn" disabled={saving} onClick={() => { if (leave()) { setLoading(true); setRevision(value => value + 1); } }}>Refresh photos</button></div>
    {loading ? <p role="status">Loading photos…</p> : loadError ? <div className="adm-error" role="alert">{loadError}<button type="button" className="adm-secondary-btn" onClick={() => { setLoading(true); setRevision(value => value + 1); }}>Retry</button></div> : <div className="screen-gallery-grid">
      {photoCategoriesForScreen(screenType).map(category => {
        const edit = editing === category.id, key = photos[category.id];
        const source = edit && remove ? null : edit && file ? preview : key ? galleryPhotoUrl(screenId, category.id, key) : null;
        return <article className="adm-panel screen-gallery-card" key={category.id}>
          <div className="screen-gallery-head"><h3>{category.label}</h3>{!edit && <button type="button" className="adm-secondary-btn" disabled={!!editing || saving} onClick={() => { setEditing(category.id); setError(""); }}>{key ? "Edit" : "Add photo"}</button>}</div>
          {source ? edit ? <img className="screen-gallery-image" src={source} alt={`${category.label} preview`}/> : imageErrors[category.id] ? <p className="screen-gallery-empty" role="alert">Photo unavailable. Edit to replace it.</p> : <button type="button" className="screen-gallery-view" aria-label={`View ${category.label} photo`} onClick={() => { setImageErrors(previous => ({ ...previous, full: false })); setViewing(category.id); }}><img className="screen-gallery-image" src={source} alt={category.label} onError={() => setImageErrors(previous => ({ ...previous, [category.id]: true }))}/></button> : <p className="onsign-hint screen-gallery-empty">{edit && file ? "Preparing preview…" : remove && edit ? "Photo will be removed when saved." : "No photo added."}</p>}
          {edit && <form onSubmit={event => { event.preventDefault(); void save(); }}>
            <label htmlFor={`photo-${category.id}`}>Choose {category.label.toLowerCase()} photo</label>
            <input id={`photo-${category.id}`} type="file" accept={screenPhotoTypes.join(",")} disabled={saving} onChange={event => {
              const selected = event.target.files?.[0]; event.target.value = "";
              if (!selected) return;
              if (!screenPhotoTypes.includes(selected.type) || !selected.size || selected.size > screenPhotoLimit) { setError("Choose a JPG, PNG or WebP photo up to 5 MB."); return; }
              setError(""); setPreview(""); setFile(selected); setRemove(false);
            }}/>
            <p className="onsign-hint">One JPG, PNG or WebP, up to 5 MB.</p>
            {(key || file) && !remove && <button type="button" className="adm-secondary-btn" disabled={saving} onClick={() => { setFile(null); setRemove(!!key); setError(""); }}>Remove photo</button>}
            {error && <p className="adm-error" role="alert">{error}</p>}
            <div className="screen-gallery-actions"><button type="button" className="adm-secondary-btn" disabled={saving} onClick={leave}>Cancel</button><button type="submit" className="adm-primary-btn" disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button></div>
          </form>}
        </article>;
      })}
    </div>}
    <Dialog open={!!viewing} onOpenChange={open => { if (!open) setViewing(null); }}><DialogContent className="adm-dialog screen-photo-dialog"><DialogHeader><DialogTitle>{photoCategoriesForScreen(screenType).find(category => category.id === viewing)?.label}</DialogTitle><DialogDescription>Screen photo</DialogDescription></DialogHeader>{viewing && photos[viewing] && (imageErrors.full ? <p role="alert">Photo unavailable. Close and refresh photos to try again.</p> : <img className="screen-photo-full" src={galleryPhotoUrl(screenId, viewing, photos[viewing]!, true)} alt={photoCategoriesForScreen(screenType).find(category => category.id === viewing)?.label} onError={() => setImageErrors(previous => ({ ...previous, full: true }))}/>)}</DialogContent></Dialog>
  </section>;
}
