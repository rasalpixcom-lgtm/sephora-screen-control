import sharp from "sharp";
import { readObject, RequestError } from "./request";

export const clientLogoLimit = 2 * 1024 * 1024;
export const validLogoVersion = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export async function normalizeClientLogo(file: File, kind: "logo" | "background" = "logo"): Promise<Buffer> {
  const label = kind === "logo" ? "logo" : "background";
  if (!file.size || file.size > clientLogoLimit) throw new RequestError(`Choose a ${label} up to 2 MB.`, 413);
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new RequestError(`Choose a PNG, JPG or WebP ${label}.`, 415);
  const input = Buffer.from(await file.arrayBuffer());
  const raster = input.subarray(0, 3).equals(Buffer.from([255,216,255])) || input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || (input.toString("ascii",0,4)==="RIFF" && input.toString("ascii",8,12)==="WEBP");
  if (!raster) throw new RequestError(`Choose a valid PNG, JPG or WebP ${label}.`);
  try {
    const image = sharp(input, { limitInputPixels: 16000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg","png","webp"].includes(metadata.format) || (metadata.pages || 1) !== 1) throw new Error("Unsupported image");
    // Preserve transparency/aspect ratio, apply phone orientation and strip metadata.
    const bytes = await image.rotate().resize({width:kind === "logo" ? 640 : 1600,height:kind === "logo" ? 640 : 1000,fit:"inside",withoutEnlargement:true}).webp({quality:90}).toBuffer();
    if (bytes.length > (kind === "logo" ? 524288 : 2097152)) throw new Error("Logo too large");
    return bytes;
  } catch { throw new RequestError(`This ${label} could not be read. Use a non-animated PNG, JPG or WebP up to 16 megapixels.`); }
}
export async function readClientLogoMutation(request: Request, branding = false) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) return {body: await readObject(request), file:null as File | null, background:null as File | null};
  const reader=request.body?.getReader();
  if (!reader) throw new RequestError("Invalid logo upload.");
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true) { const {value,done}=await reader.read(); if(done) break; size+=value.byteLength;
      if(size>clientLogoLimit*(branding ? 2 : 1)+80000) {await reader.cancel();throw new RequestError("Choose a logo up to 2 MB.",413);} chunks.push(value);
    }
  } finally {reader.releaseLock();}
  let form:FormData;
  try {form=await new Response(Buffer.concat(chunks),{headers:{"Content-Type":request.headers.get("content-type")!}}).formData();}
  catch {throw new RequestError("Invalid logo upload.");}
  const allowedFields = branding ? ["metadata", "logo", "background"] : ["metadata", "logo"];
  if (Array.from(form.keys()).some(key => !allowedFields.includes(key))) throw new RequestError("Unexpected upload field. Reload the page and choose the images again.");
  if (form.getAll("metadata").length !== 1) throw new RequestError("Send one set of branding details.");
  if (form.getAll("logo").length > 1) throw new RequestError("Choose only one client logo.");
  if (form.getAll("background").length > 1) throw new RequestError("Choose only one card background.");
  const metadata=form.get("metadata"),file=form.get("logo"),background=form.get("background");
  if(typeof metadata!=="string" || file!==null && !(file instanceof File) || background!==null && !(background instanceof File)) throw new RequestError("Invalid logo upload.");
  return {body:await readObject(new Request("http://localhost",{method:"POST",headers:{"Content-Type":"application/json"},body:metadata})),file:file as File | null,background:background as File | null};
}
