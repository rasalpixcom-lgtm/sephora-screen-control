import { env } from "cloudflare:workers";
import { hashPassword } from "@/lib/password";
import { auditUser, sameOrigin, tokenHash } from "@/lib/auth";
import { validPassword } from "@/lib/auth-policy";
import { database } from "@/lib/store";
export const runtime = "edge";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const db = database(); const now = Date.now();
  const key = `setup:${request.headers.get("cf-connecting-ip") || "local"}`;
  const limit = await db.prepare("INSERT INTO auth_rate_limit (id, key, count, last_request) VALUES (?, ?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN last_request < ? THEN 1 ELSE count + 1 END, last_request = CASE WHEN last_request < ? THEN excluded.last_request ELSE last_request END RETURNING count").bind(key, key, now, now - 60000, now - 60000).first<{count:number}>();
  if (limit && limit.count > 5) return Response.json({ error: "Too many attempts. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  let body: { token?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token) || env.AUTH_BOOTSTRAP_HASH !== await tokenHash(body.token) || !(Number(env.AUTH_BOOTSTRAP_EXPIRES) > now) || !env.AUTH_ADMIN_EMAIL || await db.prepare("SELECT id FROM auth_bootstrap WHERE id = 'main'").first()) return Response.json({ error: "This setup link is invalid or expired." }, { status: 400 });
  if (!validPassword(body.password)) return Response.json({ error: "Use a password between 12 and 128 characters." }, { status: 400 });
  const password = await hashPassword(body.password); const id = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO auth_bootstrap (id) VALUES ('main')"),
      db.prepare("INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at, role, disabled) SELECT ?, 'Administrator', ?, 0, ?, ?, 'admin', 0 WHERE NOT EXISTS (SELECT 1 FROM auth_user)").bind(id, env.AUTH_ADMIN_EMAIL.toLowerCase(), now, now),
      db.prepare("INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)").bind(crypto.randomUUID(), id, id, password, now, now),
    ]);
  } catch { return Response.json({ error: "An Admin account is already configured." }, { status: 409 }); }
  await auditUser("created first Admin", env.AUTH_ADMIN_EMAIL, env.AUTH_ADMIN_EMAIL);
  return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
}
