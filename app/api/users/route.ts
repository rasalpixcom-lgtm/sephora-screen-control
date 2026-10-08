import { hashPassword } from "@/lib/password";
import { auditUser, currentUser, sameOrigin } from "@/lib/auth";
import { roles, validPassword, type Role } from "@/lib/auth-policy";
import { database } from "@/lib/store";
import { readObject, requestFailure } from "@/lib/request";
export const runtime = "nodejs";
const bad = (error: string, status = 400) => Response.json({ error }, { status });
async function list() { return (await database().prepare("SELECT u.id, u.name, u.email, u.role, u.disabled, (SELECT COUNT(*)::int FROM auth_session s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions FROM auth_user u ORDER BY u.created_at").bind(new Date()).all()).results; }
export async function GET(request: Request) {
  try {
  const user = await currentUser(request.headers);
  if (!user) return bad("Sign in again.", 401);
  if (user.role !== "admin") return bad("Admin access required.", 403);
  return Response.json({ users: await list() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestFailure(error); }
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return bad("Invalid request origin.", 403);
  try {
  const actor = await currentUser(request.headers);
  if (!actor) return bad("Sign in again.", 401);
  if (actor.role !== "admin") return bad("Admin access required.", 403);
  const body = await readObject(request);
  const db = database(); const now = new Date();
    if (body.action === "create") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 80 || !roles.includes(body.role as Role)) return bad("Enter a name, email-style login ID, and role.");
      if (!validPassword(body.password)) return bad("Use a password between 12 and 128 characters.");
      if (await db.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first()) return bad("This login ID already has an account.");
      const id = crypto.randomUUID(); const password = await hashPassword(body.password);
      await db.transaction(async (transaction) => {
        await transaction.prepare("INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at, role, disabled) VALUES (?, ?, ?, false, ?, ?, ?, false)").bind(id, name, email, now, now, body.role).run();
        await transaction.prepare("INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)").bind(crypto.randomUUID(), id, id, password, now, now).run();
        await auditUser(`created ${body.role} account`, email, actor.email, transaction);
      });
    } else {
      if (typeof body.id !== "string") return bad("Choose an account.");
      const target = await db.prepare("SELECT id, email, role, disabled FROM auth_user WHERE id = ?").bind(body.id).first<{id:string;email:string;role:Role;disabled:boolean}>();
      if (!target) return bad("Account not found.", 404);
      if (body.action === "revoke") { await db.transaction(async (transaction) => {
        await transaction.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.id).run();
        await auditUser("revoke account", target.email, actor.email, transaction);
      }); }
      else if (body.action === "reset") {
        if (target.id === actor.id) return bad("Change your own password from Settings.");
        if (!validPassword(body.password)) return bad("Use a password between 12 and 128 characters.");
        const password = await hashPassword(body.password);
        await db.transaction(async (transaction) => {
          await transaction.prepare("UPDATE auth_account SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'").bind(password, now, target.id).run();
          await transaction.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.id).run();
          await auditUser("reset account", target.email, actor.email, transaction);
        });
      } else if (body.action === "update") {
        if (!roles.includes(body.role as Role) || typeof body.disabled !== "boolean") return bad("Choose a valid role and status.");
        if (target.id === actor.id && (body.role !== "admin" || body.disabled)) return bad("You cannot remove your own Admin access.");
        const email = body.email === undefined ? target.email : typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const name = body.name === undefined ? null : typeof body.name === "string" ? body.name.trim() : "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || name !== null && (!name || name.length > 80)) return bad("Enter a name and email-style login ID.");
        if (await db.prepare("SELECT id FROM auth_user WHERE email = ? AND id <> ?").bind(email, target.id).first()) return bad("This login ID already has an account.");
        const result = await db.transaction(async (transaction) => {
          // Serialize Admin changes across processes so concurrent demotions cannot remove every Admin.
          await transaction.prepare("SELECT pg_advisory_xact_lock(724016)").run();
          const updated = await transaction.prepare("UPDATE auth_user SET name = COALESCE(?, name), email = ?, role = ?, disabled = ?, updated_at = ? WHERE id = ? AND (role <> 'admin' OR disabled = true OR (? = 'admin' AND ?::boolean = false) OR (SELECT COUNT(*) FROM auth_user WHERE role = 'admin' AND disabled = false) > 1)").bind(name, email, body.role, body.disabled, now, target.id, body.role, body.disabled).run();
          if (updated.meta.changes) {
            await transaction.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.id).run();
            await auditUser("update account", target.email, actor.email, transaction);
          }
          return updated;
        });
        if (!result.meta.changes) return bad("Keep at least one enabled Admin.");
      } else return bad("Unknown action.");
    }
    return Response.json({ users: await list() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return bad("This login ID already has an account.");
    return requestFailure(error);
  }
}
