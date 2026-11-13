import { activeClientId } from "./client-workspace";
import { privatePhotoStorage, validPhotoKey } from "./private-photo-storage";
import { normalizePrivatePhoto } from "./screen-photo";
import { screenPhotoLimit } from "./screen-photo-shared";
import { locationPhotoLabelMax, locationPhotoMax } from "./location-photo-shared";
import { readObject, RequestError } from "./request";

const validKey = validPhotoKey;
const storage = () => privatePhotoStorage("location", activeClientId());
export const readLocationPhoto = (key: string, thumbnail: boolean) => storage().read(key, thumbnail);
async function cleanupLocationPhoto(key: string, prepared: boolean) {
  try { await (prepared ? storage().discard(key) : storage().remove(key)); }
  catch (error) { console.error("Location photo cleanup failed", (error as NodeJS.ErrnoException).code || "unavailable"); }
}
export const removeLocationPhoto = (key: string) => cleanupLocationPhoto(key, false);
// A rejected upload owns only its new namespaced files, never legacy files.
export const discardPreparedLocationPhoto = (key: string) => cleanupLocationPhoto(key, true);
export async function prepareLocationPhoto(file: File) {
  const { full, thumbnail } = await normalizePrivatePhoto(file);
  return storage().save(full, thumbnail);
}

export type LocationPhotoInput = { id?: string; uploadIndex?: number; label: string };
export function parseLocationPhotos(value: unknown, files: Map<number, File>) {
  if (!Array.isArray(value) || value.length > locationPhotoMax) throw new RequestError("Choose up to five location photos.");
  const usedIds = new Set<string>(), usedUploads = new Set<number>();
  const entries: LocationPhotoInput[] = value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !["id", "uploadIndex", "label"].includes(key))) throw new RequestError("Invalid location photo details.");
    const entry = item as Record<string, unknown>;
    if (typeof entry.label !== "string" || entry.label.trim().length > locationPhotoLabelMax || /[\u0000-\u001f\u007f]/.test(entry.label)) throw new RequestError("Photo labels must be 80 characters or fewer, without line breaks.");
    const label = entry.label.trim();
    if (typeof entry.id === "string" && validKey(entry.id) && entry.uploadIndex === undefined && !usedIds.has(entry.id)) { usedIds.add(entry.id); return { id: entry.id, label }; }
    if (Number.isInteger(entry.uploadIndex) && Number(entry.uploadIndex) >= 0 && Number(entry.uploadIndex) < locationPhotoMax && entry.id === undefined && files.has(Number(entry.uploadIndex)) && !usedUploads.has(Number(entry.uploadIndex))) { usedUploads.add(Number(entry.uploadIndex)); return { uploadIndex: Number(entry.uploadIndex), label }; }
    throw new RequestError("Invalid or duplicate location photo.");
  });
  if (usedUploads.size !== files.size) throw new RequestError("Every uploaded location photo needs a gallery entry.");
  return entries;
}

export async function readLocationMutation(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) throw new RequestError("Invalid location photo upload.");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Invalid upload.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > locationPhotoMax * screenPhotoLimit + 100000) { await reader.cancel(); throw new RequestError("Location photos are too large. Use up to five images of 5 MB each.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new RequestError("Invalid location photo upload."); }
  const keys = Array.from(form.keys());
  if (keys.some(key => key !== "metadata" && !/^locationPhoto[0-4]$/.test(key)) || form.getAll("metadata").length !== 1) throw new RequestError("Send up to five location photos.");
  const metadata = form.get("metadata");
  if (typeof metadata !== "string") throw new RequestError("Invalid location photo details.");
  const files = new Map<number, File>();
  for (let index = 0; index < locationPhotoMax; index++) {
    const values = form.getAll(`locationPhoto${index}`);
    if (values.length > 1 || values.some(file => !(file instanceof File))) throw new RequestError("Send each location photo once.");
    if (values[0]) files.set(index, values[0] as File);
  }
  if (!files.size) throw new RequestError("Choose a location photo to upload.");
  const body = await readObject(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: metadata }));
  return { body, files };
}
