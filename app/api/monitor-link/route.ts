import { withWorkspace } from "@/lib/client-workspace";
import { activeClientId } from "@/lib/client-workspace";
import { randomBytes } from "node:crypto";
import { assertAuthConfig, auditUser, currentUser, sessionUser, sameOrigin } from "@/lib/auth";
import { database, getPool, ServerDatabase } from "@/lib/database";
import { monitorKeyHash, monitorLinkStatus } from "@/lib/monitor-access";
import { readObject, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
async function GETHandler(request: Request) {
  try {
    const common = new URL(request.url).searchParams.get("scope") === "all";
    const user = common ? (await sessionUser(request.headers))?.user : await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    if (common) {
      const row = (await getPool("sephora").query<{ token_hash: string | null; generation: string; updated_at: Date }>("SELECT token_hash,generation,updated_at FROM common_monitor_access WHERE id='main'")).rows[0];
      return reply({ active: !!row?.token_hash, generation: row?.generation ?? null, updatedAt: row?.updated_at.toISOString() ?? null });
    }
    return reply(await monitorLinkStatus());
  } catch (error) { return requestFailure(error); }
}
async function POSTHandler(request: Request) {
  if (!sameOrigin(request)) return reply({ error: "Invalid request origin." }, 403);
  try {
    const common = new URL(request.url).searchParams.get("scope") === "all";
    const user = common ? (await sessionUser(request.headers))?.user : await currentUser(request.headers);
    if (!user) return reply({ error: "Sign in again." }, 401);
    if (user.role !== "admin") return reply({ error: "Admin access required." }, 403);
    const body = await readObject(request);
    if (typeof body.action !== "string" || !["create", "replace", "disable"].includes(body.action)) return reply({ error: "Choose a valid action." }, 400);
    assertAuthConfig();
    if (common) return await new ServerDatabase(getPool("sephora")).transaction(async db => {
      await db.prepare("SELECT pg_advisory_xact_lock(724018,hashtext('common-monitor'))").run();
      const prior = await db.prepare("SELECT token_hash, generation FROM common_monitor_access WHERE id='main'").first<{ token_hash: string | null; generation: string }>();
      if (body.action === "create" && prior?.token_hash) return reply({ error: "An active link already exists. Replace it to create a new one." }, 409);
      if (body.action !== "create" && (!prior?.token_hash || body.generation !== prior.generation)) return reply({ error: "The monitor link changed. Refresh and try again." }, 409);
      const key = body.action === "disable" ? null : randomBytes(32).toString("hex");
      const generation = crypto.randomUUID(), now = new Date();
      await db.prepare("INSERT INTO common_monitor_access(id,token_hash,generation,updated_at,updated_by) VALUES ('main',?,?,?,?) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,generation=excluded.generation,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(key ? monitorKeyHash(key) : null,generation,now,user.email).run();
      await auditUser(body.action === "disable" ? "Disabled common monitor link" : body.action === "replace" ? "Replaced common monitor link" : "Created common monitor link", "All clients monitoring wall",user.email,db);
      return reply({ active: !!key,generation,updatedAt: now.toISOString(),...(key ? { link: `${new URL(process.env.AUTH_URL!).origin}/monitor?scope=all#key=${key}` } : {}) });
    });
    return await database().transaction(async db => {
      await db.prepare(`SELECT pg_advisory_xact_lock(724018,hashtext('${activeClientId()}'))`).run();
      const prior = await db.prepare(`SELECT token_hash, generation FROM monitor_access WHERE client_id='${activeClientId()}' AND id = 'main'`).first<{ token_hash: string | null; generation: string }>();
      if (body.action === "create" && prior?.token_hash) return reply({ error: "An active link already exists. Replace it to create a new one." }, 409);
      if (body.action !== "create" && (!prior?.token_hash || body.generation !== prior.generation)) return reply({ error: "The monitor link changed. Refresh and try again." }, 409);
      const key = body.action === "disable" ? null : randomBytes(32).toString("hex");
      const generation = crypto.randomUUID();
      const now = new Date();
      await db.prepare(`INSERT INTO monitor_access (client_id, id, token_hash, generation, updated_at) VALUES ('${activeClientId()}', 'main', ?, ?, ?) ON CONFLICT (client_id,id) DO UPDATE SET token_hash = EXCLUDED.token_hash, generation = EXCLUDED.generation, updated_at = EXCLUDED.updated_at`).bind(key ? monitorKeyHash(key) : null, generation, now).run();
      await auditUser(body.action === "disable" ? "Disabled monitor link" : body.action === "replace" ? "Replaced monitor link" : "Created monitor link", "Monitoring wall", user.email, db);
      // The secret is returned once; only its hash is retained in PostgreSQL.
      return reply({ active: !!key, generation, updatedAt: now.toISOString(), ...(key ? { link: `${new URL(process.env.AUTH_URL!).origin}/monitor${activeClientId() === "sephora" ? "" : "?client=" + encodeURIComponent(activeClientId())}#key=${key}` } : {}) });
    });
  } catch (error) { return requestFailure(error); }
}

export const GET = withWorkspace(GETHandler);

export const POST = withWorkspace(POSTHandler);
