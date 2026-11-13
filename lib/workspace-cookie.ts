import { createHmac, timingSafeEqual } from "node:crypto";
import { validClientId } from "./client-workspace";
export const workspaceCookie = "pixcom-workspace";
function signature(clientId: string, userId: string, sessionId: string, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify([clientId, userId, sessionId])).digest("hex");
}
export function signWorkspace(clientId: string, userId: string, sessionId: string, secret: string) {
  if (!validClientId(clientId) || secret.length < 32) throw new Error("Invalid workspace selection.");
  return clientId + "." + signature(clientId, userId, sessionId, secret);
}
export function verifyWorkspace(value: string, userId: string, sessionId: string, secret: string): string | null {
  const [id, mac, extra] = value.split(".");
  if (!id || !validClientId(id) || !/^[a-f0-9]{64}$/.test(mac || "") || extra !== undefined || secret.length < 32) return null;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(id, userId, sessionId, secret), "hex")) ? id : null;
}
