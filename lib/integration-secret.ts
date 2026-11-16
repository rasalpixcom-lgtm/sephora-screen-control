import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(secret: string) {
  if (secret.length < 32) throw new Error("Integration encryption is unavailable.");
  return createHash("sha256").update("pixcom-onsign-v1\0" + secret).digest();
}
export function encryptIntegrationToken(clientId: string, token: string, secret = process.env.AUTH_SECRET || "") {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(clientId));
  const bytes = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), bytes.toString("base64url")].join(".");
}
export function decryptIntegrationToken(clientId: string, encrypted: string, secret = process.env.AUTH_SECRET || "") {
  try {
    const parts = encrypted.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error();
    const iv = Buffer.from(parts[1], "base64url"), tag = Buffer.from(parts[2], "base64url");
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key(secret), iv);
    cipher.setAAD(Buffer.from(clientId)); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(Buffer.from(parts[3], "base64url")), cipher.final()]).toString("utf8");
  } catch { throw new Error("Saved OnSign credentials could not be read. Restore the original AUTH_SECRET or replace the token in Administration."); }
}
