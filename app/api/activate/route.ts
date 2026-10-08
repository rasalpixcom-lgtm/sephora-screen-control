const env = process.env;
import { hashPassword } from "@/lib/password";
import { sameOrigin, tokenHash } from "@/lib/auth";
import { validPassword } from "@/lib/auth-policy";
import { database } from "@/lib/store";
import { readObject, requestFailure } from "@/lib/request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
  const db = database(); const now = Date.now();
  const key = `setup:${env.TRUST_PROXY === "true" ? request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown" : "direct"}`;
  const limit = await db.prepare("INSERT INTO auth_rate_limit (id, key, count, last_request) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN auth_rate_limit.last_request < ? THEN 1 ELSE auth_rate_limit.count + 1 END, last_request = CASE WHEN auth_rate_limit.last_request < ? THEN excluded.last_request ELSE auth_rate_limit.last_request END RETURNING count").bind(key, key, now, now - 60000, now - 60000).first<{count:number}>();
  if (limit && limit.count > 5) return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  const body = await readObject(request);
  if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token) || env.AUTH_BOOTSTRAP_HASH !== await tokenHash(body.token) || !(Number(env.AUTH_BOOTSTRAP_EXPIRES) > now) || !env.AUTH_ADMIN_EMAIL || await db.prepare("SELECT id FROM auth_bootstrap WHERE id = 'main'").first()) return Response.json({ error: "This setup link is invalid or expired." }, { status: 400 });
  if (!validPassword(body.password)) return Response.json({ error: "Use a password between 12 and 128 characters." }, { status: 400 });
  const password = await hashPassword(body.password); const id = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO auth_bootstrap (id) VALUES ('main')"),
      db.prepare("INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at, role, disabled) SELECT ?, 'Administrator', ?, false, ?, ?, 'admin', false WHERE NOT EXISTS (SELECT 1 FROM auth_user)").bind(id, env.AUTH_ADMIN_EMAIL.toLowerCase(), new Date(now), new Date(now)),
      db.prepare("INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)").bind(crypto.randomUUID(), id, id, password, new Date(now), new Date(now)),
      db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, 'created first Admin', 'user', NULL, ?, ?, ?)").bind(crypto.randomUUID(), env.AUTH_ADMIN_EMAIL, env.AUTH_ADMIN_EMAIL, new Date(now).toISOString()),
    ]);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return Response.json({ error: "An Admin account is already configured." }, { status: 409 });
    console.error("First Admin setup failed", code || "unknown database error");
    return Response.json({ error: "Could not create the Admin. Try again." }, { status: 503 });
  }
  return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestFailure(error); }
}
