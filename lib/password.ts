import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
// Better Auth's scrypt parameters and hash format. Native synchronous scrypt
// avoids the async callback lifecycle issue in the current workerd runtime.
const options = { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, options);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) return false;
  const [salt, stored] = hash.split(":");
  return timingSafeEqual(scryptSync(password.normalize("NFKC"), salt, 64, options), Buffer.from(stored, "hex"));
}
