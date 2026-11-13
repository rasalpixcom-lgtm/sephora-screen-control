import sharp from "sharp";
import { activeClientId } from "./client-workspace";
import { privatePhotoStorage } from "./private-photo-storage";
import { readObject, RequestError } from "./request";
import { screenPhotoLimit, screenPhotoTypes } from "./screen-photo-shared";

const storage = () => privatePhotoStorage("screen", activeClientId());
async function cleanupScreenPhoto(key: string, prepared: boolean) {
  try { await (prepared ? storage().discard(key) : storage().remove(key)); }
  catch (error) { console.error("Screen photo cleanup failed", (error as NodeJS.ErrnoException).code || "unavailable"); }
}
export const removeScreenPhoto = (key: string) => cleanupScreenPhoto(key, false);
// A rejected upload owns only its new namespaced files, never legacy files.
export const discardPreparedScreenPhoto = (key: string) => cleanupScreenPhoto(key, true);
export const readScreenPhoto = (key: string, thumbnail: boolean) => storage().read(key, thumbnail);

export async function normalizePrivatePhoto(file: File): Promise<{ full: Buffer; thumbnail: Buffer }> {
  if (!file.size || file.size > screenPhotoLimit) throw new RequestError("Choose a photo up to 5 MB.", 413);
  if (!screenPhotoTypes.includes(file.type)) throw new RequestError("Choose a JPG, PNG or WebP photo.", 415);
  const input = Buffer.from(await file.arrayBuffer());
  const raster = input.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    || input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || (input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP");
  if (!raster) throw new RequestError("Choose a valid JPG, PNG or WebP photo.");
  let full: Buffer, thumbnail: Buffer;
  try {
    const image = sharp(input, { limitInputPixels: 50000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error("Unsupported image");
    // Re-encoding strips EXIF/GPS metadata. Auto-rotation preserves phone orientation.
    full = await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    thumbnail = await sharp(full).resize({ width: 320, height: 240, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch { throw new RequestError("This photo could not be read. Use a valid, non-animated JPG, PNG or WebP image up to 50 megapixels."); }
  return { full, thumbnail };
}

export async function prepareScreenPhoto(file: File): Promise<string> {
  const { full, thumbnail } = await normalizePrivatePhoto(file);
  return storage().save(full, thumbnail);
}

export async function readScreenMutation(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) return { body: await readObject(request), file: null as File | null };
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Invalid upload.");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > screenPhotoLimit + 80000) { await reader.cancel(); throw new RequestError("Upload is too large. Choose a photo up to 5 MB.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new RequestError("Invalid photo upload."); }
  if (Array.from(form.keys()).some(key => !["metadata", "photo"].includes(key)) || form.getAll("metadata").length !== 1 || form.getAll("photo").length > 1) throw new RequestError("Send one screen photo.");
  const metadata = form.get("metadata"), file = form.get("photo");
  if (typeof metadata !== "string" || (file !== null && !(file instanceof File))) throw new RequestError("Invalid photo upload.");
  const body = await readObject(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: metadata }));
  return { body, file: file as File | null };
}
