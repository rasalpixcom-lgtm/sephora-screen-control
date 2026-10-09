import { createHash, timingSafeEqual } from "node:crypto";
import { database } from "@/lib/database";

export type MonitorLinkStatus = { active: boolean; generation: string | null; updatedAt: string | null };
export function monitorKeyHash(key: string) { return createHash("sha256").update(key).digest("hex"); }
export async function monitorLinkStatus(): Promise<MonitorLinkStatus> {
  const row = await database().prepare('SELECT token_hash AS "tokenHash", generation, updated_at AS "updatedAt" FROM monitor_access WHERE id = \'main\'').first<{ tokenHash: string | null; generation: string; updatedAt: Date }>();
  return { active: !!row?.tokenHash, generation: row?.generation ?? null, updatedAt: row?.updatedAt.toISOString() ?? null };
}
export async function validMonitorKey(authorization: string | null) {
  if (!authorization || !/^Bearer [a-f0-9]{64}$/.test(authorization)) return false;
  const row = await database().prepare("SELECT token_hash FROM monitor_access WHERE id = 'main'").first<{ token_hash: string | null }>();
  if (!row?.token_hash || !/^[a-f0-9]{64}$/.test(row.token_hash)) return false;
  return timingSafeEqual(Buffer.from(monitorKeyHash(authorization.slice(7)), "hex"), Buffer.from(row.token_hash, "hex"));
}
