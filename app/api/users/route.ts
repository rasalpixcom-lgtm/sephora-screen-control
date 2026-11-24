import { validClientId, withWorkspace } from "@/lib/client-workspace";
import { hashPassword } from "@/lib/password";
import { auditUser, lockFullAdmin, sameOrigin, sessionUser, sessionWorkspaceUser } from "@/lib/auth";
import { isFullAdmin, roles, validPassword, type Role } from "@/lib/auth-policy";
import { database, type ServerDatabase } from "@/lib/database";
import { readObject, RequestError, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: noStore });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function managementSession(headers: Headers) {
  const session = await sessionUser(headers);
  if (!session) return null;
  const hasWorkspace = headers.has("x-client-id");
  try {
    const user = await sessionWorkspaceUser(headers, session);
    if (!user && hasWorkspace) return null;
  } catch (error) {
    if (hasWorkspace || !(error instanceof RequestError) || error.status !== 403) throw error;
  }
  // Global Administration remains available when a previous client selection is stale.
  return session;
}

function parseClientIds(value: unknown) {
  if (value === null || value === undefined) return value;
  if (!Array.isArray(value) || value.length > 500
    || !value.every((id): id is string => typeof id === "string" && validClientId(id))
    || new Set(value).size !== value.length) {
    throw new RequestError("Choose a valid list of up to 500 clients.");
  }
  return value;
}

async function checkActiveClients(db: ServerDatabase, clientIds: string[] | null | undefined) {
  if (!clientIds?.length) return;
  const { results } = await db.prepare("SELECT id FROM clients WHERE id = ANY(?::text[]) AND archived_at IS NULL").bind(clientIds).all();
  if (results.length !== clientIds.length) throw new RequestError("Some selected clients are no longer available. Refresh the user list and try again.");
}

async function listUsers(db = database()) {
  return (await db.prepare(
    'SELECT u.id, u.name, u.email, u.role, u.disabled, u.controller_client_ids AS "clientIds", ' +
    'EXTRACT(EPOCH FROM u.updated_at)::text AS "editVersion", ' +
    "(SELECT COUNT(*)::int FROM auth_session s WHERE s.user_id = u.id AND s.expires_at > ?) AS sessions " +
    "FROM auth_user u WHERE u.role IN ('admin', 'controller') ORDER BY u.created_at",
  ).bind(new Date()).all()).results;
}

async function GETHandler(request: Request) {
  try {
    const session = await managementSession(request.headers);
    if (!session) return bad("Sign in again.", 401);
    if (!isFullAdmin(session.user.role, session.clientIds)) return bad("All clients Admin access required.", 403);
    const [users, { results: clients }] = await Promise.all([
      listUsers(),
      database().prepare("SELECT id, name FROM clients WHERE archived_at IS NULL ORDER BY lower(name), id").all(),
    ]);
    return Response.json({ users, clients }, { headers: noStore });
  } catch (error) { return requestFailure(error); }
}

async function POSTHandler(request: Request) {
  if (!sameOrigin(request)) return bad("Invalid request origin.", 403);
  try {
    const session = await managementSession(request.headers);
    if (!session) return bad("Sign in again.", 401);
    const { user: actor, sessionId } = session;
    if (!isFullAdmin(actor.role, session.clientIds)) return bad("All clients Admin access required.", 403);
    const body = await readObject(request);
    const users = await database().transaction(async transaction => {
      await lockFullAdmin(transaction, actor.id, sessionId);
      const now = new Date();

      if (body.action === "create") {
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!emailPattern.test(email) || email.length > 254 || !name || name.length > 80 || !roles.includes(body.role as Role)) {
          throw new RequestError("Enter a name, email-style login ID, and role.");
        }
        if (!validPassword(body.password)) throw new RequestError("Use a password between 12 and 128 characters.");
        const clientIds = parseClientIds(body.clientIds) ?? null;
        if (await transaction.prepare("SELECT id FROM auth_user WHERE email = ?").bind(email).first()) {
          throw new RequestError("This login ID already has an account.");
        }
        await checkActiveClients(transaction, clientIds);
        const id = crypto.randomUUID();
        const password = await hashPassword(body.password);
        await transaction.prepare("INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at, role, disabled, controller_client_ids) VALUES (?, ?, ?, false, ?, ?, ?, false, ?::text[])").bind(id, name, email, now, now, body.role, clientIds).run();
        await transaction.prepare("INSERT INTO auth_account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, 'credential', ?, ?, ?, ?)").bind(crypto.randomUUID(), id, id, password, now, now).run();
        await auditUser("created " + body.role + " account", email, actor.email, transaction);
        return listUsers(transaction);
      }

      if (typeof body.id !== "string") throw new RequestError("Choose an account.");
      const target = await transaction.prepare(
        'SELECT id, email, role, disabled, controller_client_ids AS "clientIds", EXTRACT(EPOCH FROM updated_at)::text AS "editVersion" ' +
        'FROM auth_user WHERE id = ? FOR UPDATE',
      ).bind(body.id).first<{ id: string; email: string; role: Role; disabled: boolean; clientIds: string[] | null; editVersion: string }>();
      if (!target || !roles.includes(target.role)) throw new RequestError("Account not found.", 404);

      let auditAction: string;
      if (body.action === "revoke") {
        auditAction = "revoke account";
      } else if (body.action === "reset") {
        if (target.id === actor.id) throw new RequestError("Change your own password from Settings.");
        if (!validPassword(body.password)) throw new RequestError("Use a password between 12 and 128 characters.");
        const password = await hashPassword(body.password);
        await transaction.prepare("UPDATE auth_account SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'").bind(password, now, target.id).run();
        auditAction = "reset account";
      } else if (body.action === "update") {
        if (body.expectedVersion !== target.editVersion) {
          throw new RequestError("This account changed. Close this form, refresh Users, and open the account again.", 409);
        }
        const role = body.role as Role;
        const disabled = body.disabled;
        if (!roles.includes(role) || typeof disabled !== "boolean") throw new RequestError("Choose a valid role and status.");
        const requestedClientIds = parseClientIds(body.clientIds);
        const clientIds = requestedClientIds === undefined ? target.clientIds : requestedClientIds;
        const remainsFullAdmin = !disabled && isFullAdmin(role, clientIds);
        if (target.id === actor.id && !remainsFullAdmin) throw new RequestError("You cannot remove your own All clients Admin access.");
        if (!target.disabled && isFullAdmin(target.role, target.clientIds) && !remainsFullAdmin) {
          const other = await transaction.prepare("SELECT 1 FROM auth_user WHERE id <> ? AND role = 'admin' AND NOT disabled AND controller_client_ids IS NULL LIMIT 1").bind(target.id).first();
          if (!other) throw new RequestError("Keep at least one enabled All clients Admin.");
        }
        const email = body.email === undefined ? target.email : typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const name = body.name === undefined ? null : typeof body.name === "string" ? body.name.trim() : "";
        if (!emailPattern.test(email) || email.length > 254 || (name !== null && (!name || name.length > 80))) {
          throw new RequestError("Enter a valid name and email-style login ID.");
        }
        if (await transaction.prepare("SELECT id FROM auth_user WHERE email = ? AND id <> ?").bind(email, target.id).first()) {
          throw new RequestError("This login ID already has an account.");
        }
        await checkActiveClients(transaction, requestedClientIds);
        await transaction.prepare(
          "UPDATE auth_user SET name = COALESCE(?, name), email = ?, role = ?, disabled = ?, " +
          "updated_at = GREATEST(clock_timestamp(), updated_at + INTERVAL '1 microsecond'), " +
          "controller_client_ids = ?::text[] WHERE id = ?",
        ).bind(name, email, role, disabled, clientIds, target.id).run();
        auditAction = "update account";
      } else {
        throw new RequestError("Unknown action.");
      }

      await transaction.prepare("DELETE FROM auth_session WHERE user_id = ?").bind(target.id).run();
      await auditUser(auditAction, target.email, actor.email, transaction);
      return listUsers(transaction);
    });
    return Response.json({ users }, { headers: noStore });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") return bad("This login ID already has an account.");
    return requestFailure(error);
  }
}

export const GET = withWorkspace(GETHandler);
export const POST = withWorkspace(POSTHandler);
