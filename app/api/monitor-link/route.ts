import { randomBytes } from "node:crypto";
import { assertAuthConfig, auditUser, currentUser, sameOrigin } from "@/lib/auth";
import { database } from "@/lib/database";
import { monitorKeyHash, monitorLinkStatus } from "@/lib/monitor-access";
import { readObject, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
export async function GET(request: Request) {
  try {
    const user = await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    return reply(await monitorLinkStatus());
  } catch (error) { return requestFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Invalid request origin." }, 403);
  try {
    const user = await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    const body = await readObject(request);
    if (typeof body.action !== "string" || !["create", "replace", "disable"].includes(body.action)) return reply({ error: "Choose a valid action." }, 400);
    assertAuthConfig();
    return await database().transaction(async db => {
      await db.prepare("SELECT pg_advisory_xact_lock(724018)").run();
      const prior = await db.prepare("SELECT token_hash, generation FROM monitor_access WHERE id = 'main'").first<{ token_hash: string | null; generation: string }>();
      if (body.action === "create" && prior?.token_hash) return reply({ error: "An active link already exists. Replace it to create a new one." }, 409);
      if (body.action !== "create" && (!prior?.token_hash || body.generation !== prior.generation)) return reply({ error: "The monitor link changed. Refresh and try again." }, 409);
      const key = body.action === "disable" ? null : randomBytes(32).toString("hex");
      const generation = crypto.randomUUID();
      const now = new Date();
      await db.prepare("INSERT INTO monitor_access (id, token_hash, generation, updated_at) VALUES ('main', ?, ?, ?) ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, generation = EXCLUDED.generation, updated_at = EXCLUDED.updated_at").bind(key ? monitorKeyHash(key) : null, generation, now).run();
      await auditUser(body.action === "disable" ? "Disabled monitor link" : body.action === "replace" ? "Replaced monitor link" : "Created monitor link", "Monitoring wall", user.email, db);
      // The secret is returned once; only its hash is retained in PostgreSQL.
      return reply({ active: !!key, generation, updatedAt: now.toISOString(), ...(key ? { link: `${new URL(process.env.AUTH_URL!).origin}/monitor#key=${key}` } : {}) });
    });
  } catch (error) { return requestFailure(error); }
}
