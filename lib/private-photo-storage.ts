import path from "node:path";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { RequestError } from "./request";

export const validPhotoKey = (key: string) => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(key);
type PhotoKind = "screen" | "location";
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
const unsafe = () => new Error("Unsafe private photo storage entry.");

// Server-only context: callers must supply a trusted workspace, never request data.
// HTTP/PDF callers must also authorize the database record before reading a key.
export function privatePhotoStorage(kind: PhotoKind, clientId: string) {
  if (kind !== "screen" && kind !== "location") throw new Error("Invalid photo storage kind.");
  if (typeof clientId !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(clientId)) throw new Error("Invalid photo workspace.");
  const setting = kind === "screen" ? "SCREEN_PHOTO_DIR" : "LOCATION_PHOTO_DIR";
  function basePath() {
    const configured = process.env[setting]?.trim();
    if (configured && !path.isAbsolute(configured)) throw new Error(`${setting} must be absolute.`);
    const cwd = process.cwd();
    // Next standalone changes cwd; never save uploads inside the build folder.
    const root = path.basename(cwd) === "standalone" && path.basename(path.dirname(cwd)) === ".next" ? path.resolve(cwd, "../..") : cwd;
    return configured || path.join(root, `uploads/${kind}-photos`);
  }
  function filename(key: string, thumbnail: boolean) {
    if (!validPhotoKey(key)) throw new RequestError("Invalid photo reference.");
    return `${key}${thumbnail ? "-thumb" : ""}.webp`;
  }
  async function base(create: boolean) {
    const folder = basePath();
    if (create) await mkdir(folder, { recursive: true, mode: 0o700 });
    // The configured base is trusted; resolve it once before checking children.
    return realpath(folder);
  }
  async function clientFolder(root: string, create: boolean) {
    let folder = root;
    for (const segment of ["clients", `client-${clientId}`]) {
      folder = path.join(folder, segment);
      if (create) {
        try { await mkdir(folder, { mode: 0o700 }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      }
      const entry = await lstat(folder);
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw unsafe();
    }
    return folder;
  }
  async function readFile(file: string) {
    const entry = await lstat(file);
    if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) throw unsafe();
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== entry.dev || opened.ino !== entry.ino) throw unsafe();
      return await handle.readFile();
    } finally { await handle.close(); }
  }
  async function removeFile(file: string) {
    const entry = await lstat(file);
    if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) throw unsafe();
    await unlink(file);
  }
  async function remove(key: string, includeLegacy: boolean) {
    filename(key, false);
    let root: string;
    try { root = await base(false); } catch (error) { if (missing(error)) return; throw error; }
    let folder: string | null = null;
    try { folder = await clientFolder(root, false); } catch (error) { if (!missing(error)) throw error; }
    // Removing an authorized old Sephora key also cleans its old thumbnail.
    // Other clients can never read or delete anything from the flat folder.
    for (const directory of [folder, includeLegacy && clientId === "sephora" ? root : null]) {
      if (!directory) continue;
      for (const small of [false, true]) {
        try { await removeFile(path.join(directory, filename(key, small))); }
        catch (error) { if (!missing(error)) throw error; }
      }
    }
  }

  return {
    async read(key: string, thumbnail: boolean) {
      const name = filename(key, thumbnail), root = await base(false);
      try { return await readFile(path.join(await clientFolder(root, false), name)); }
      catch (error) {
        // Only pre-isolation Sephora files may use the old flat layout. Errors
        // other than a missing file (including unsafe links) never fall back.
        if (!missing(error) || clientId !== "sephora") throw error;
        return readFile(path.join(root, name));
      }
    },
    async save(full: Buffer, thumbnail: Buffer) {
      const key = randomUUID(), root = await base(true), folder = await clientFolder(root, true);
      const created: string[] = [];
      try {
        for (const [small, bytes] of [[false, full], [true, thumbnail]] as const) {
          const file = path.join(folder, filename(key, small));
          const handle = await open(file, "wx", 0o600);
          created.push(file);
          try { await handle.writeFile(bytes); } finally { await handle.close(); }
        }
      } catch (error) {
        // Only remove files this upload created, never a pre-existing collision.
        for (const file of created) { try { await removeFile(file); } catch { /* best effort after failed upload */ } }
        throw error;
      }
      return key;
    },
    remove: (key: string) => remove(key, true),
    discard: (key: string) => remove(key, false),
  };
}
