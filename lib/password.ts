import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
// Retain Better Auth's existing hash format so migrated passwords remain valid.
const options = { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password.normalize("NFKC"), salt, 64, options, (error, key) => error ? reject(error) : resolve(key));
});
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) return false;
  const [salt, stored] = hash.split(":");
  return timingSafeEqual(await derive(password, salt), Buffer.from(stored, "hex"));
}
