import { hashPassword } from "@/lib/password";
import { auditUser, currentUser, sameOrigin } from "@/lib/auth";
import { roles, validPassword, type Role } from "@/lib/auth-policy";
import { database } from "@/lib/store";
export const runtime = "edge";
const bad = (error: string, status = 400) => Response.json({ error }, { status });
async function list() { return (await database().prepare("SELECT u.id, u.name, u.email, u.role, u.disabled, (SELECT COUNT(*) FROM auth_session s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions FROM auth_user u ORDER BY u.created_at").bind(Date.now()).all()).results; }
export async function GET(request: Request) {
  const user = await currentUser(request.headers);
  if (!user) return bad("Sign in again.", 401);
  if (user.role !== "admin") return bad("Admin access required.", 403);
  return Response.json({ users: await list() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return bad("Invalid request origin.", 403);
  const actor = await currentUser(request.headers);
  if (!actor) return bad("Sign in again.", 401);
  if (actor.role !== "admin") return bad("Admin access required.", 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("Invalid request."); }
  const db = database(); const now = Date.now();
  try {
    if (body.action === "create") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 80 || !roles.includes(body.role as Role)) return bad("Enter a name, email-style login ID, and role.");
      if (!validPassword(body.password)) return bad("Use a password between 12 and 128 characters.");
      if (await db.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first()) return bad("This login ID already has an account.");
      const id = crypto.randomUUID(); const password = await hashPassword(body.password);
      await db.batch([
        db.prepare("INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at, role, disabled) VALUES (?, ?, ?, 0, ?, ?, ?, 0)").bind(id, name, email, now, now, body.role),
        db.prepare("INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)").bind(crypto.randomUUID(), id, id, password, now, now),
      ]);
      await auditUser(`created ${body.role} account`, email, actor.email);
    } else {
      if (typeof body.id !== "string") return bad("Choose an account.");
      const target = await db.prepare("SELECT id, email, role, disabled FROM auth_user WHERE id = ?").bind(body.id).first<{id:string;email:string;role:Role;disabled:number}>();
      if (!target) return bad("Account not found.", 404);
      if (body.action === "revoke") { await db.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.id).run(); }
      else if (body.action === "reset") {
        if (target.id === actor.id) return bad("Change your own password from Settings.");
        if (!validPassword(body.password)) return bad("Use a password between 12 and 128 characters.");
        const password = await hashPassword(body.password);
        await db.batch([
          db.prepare("UPDATE auth_account SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'").bind(password, now, target.id),
          db.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.id),
        ]);
      } else if (body.action === "update") {
        if (!roles.includes(body.role as Role) || typeof body.disabled !== "boolean") return bad("Choose a valid role and status.");
        if (target.id === actor.id && (body.role !== "admin" || body.disabled)) return bad("You cannot remove your own Admin access.");
        const result = await db.prepare("UPDATE auth_user SET role = ?, disabled = ?, updated_at = ? WHERE id = ? AND (role <> 'admin' OR disabled = 1 OR (? = 'admin' AND ? = 0) OR (SELECT COUNT(*) FROM auth_user WHERE role = 'admin' AND disabled = 0) > 1)").bind(body.role, body.disabled ? 1 : 0, now, target.id, body.role, body.disabled ? 1 : 0).run();
        if (!result.meta.changes) return bad("Keep at least one enabled Admin.");
        await db.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.id).run();
      } else return bad("Unknown action.");
      await auditUser(`${body.action} account`, target.email, actor.email);
    }
    return Response.json({ users: await list() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Account operation failed", error instanceof Error ? error.name : "unknown"); return bad("Could not save the account. Try again.", 503); }
}
