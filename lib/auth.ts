import { selectWorkspace } from "@/lib/client-workspace";
import { workspaceCookie, verifyWorkspace } from "@/lib/workspace-cookie";
const env = process.env;
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { parseCookies } from "better-auth/cookies";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import * as schema from "@/db/postgres-schema";
import { database } from "@/lib/store";
import { getPool } from "@/lib/database";
import type { ServerDatabase } from "@/lib/database";
import { canAccessClient, canOpen, isFullAdmin, roleHome, roles, type AuthUser, type Role } from "@/lib/auth-policy";
import { configuredAuthOrigins, matchesAuthOrigin } from "@/lib/network-origin";
import { RequestError } from "@/lib/request";
import { authLog } from "@/lib/auth-log";
import { hashPassword, verifyPassword } from "@/lib/password";

// The database requires a date; this sentinel represents a session without an app deadline.
const persistentSessionEnd = "9999-12-31T23:59:59.000Z";
// Browsers cap persistent cookies. Renew the same signed cookie on authenticated API use.
const sessionCookieSeconds = 400 * 24 * 3600;

export function assertAuthConfig() {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || !env.AUTH_URL) throw new Error("Authentication environment is not configured.");
  configuredAuthOrigins(env.AUTH_URL, env.AUTH_ADDITIONAL_ORIGINS, env.ALLOW_LAN_HTTP === "true");
}
export function auth() {
  assertAuthConfig();
  const origins = configuredAuthOrigins(env.AUTH_URL!, env.AUTH_ADDITIONAL_ORIGINS, env.ALLOW_LAN_HTTP === "true");
  return betterAuth({
    appName: "Sephora Screen Control", secret: env.AUTH_SECRET!, baseURL: origins.length === 1 ? origins[0] : { allowedHosts: origins.map(origin => new URL(origin).host), fallback: origins[0], protocol: origins[0].startsWith("https:") ? "https" : "http" },
    logger: { log: authLog },
    database: drizzleAdapter(drizzle(getPool("sephora"), { schema }), { provider: "pg", schema, transaction: true }),
    trustedOrigins: origins,
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128, password: { hash: hashPassword, verify: verifyPassword } },
    user: { additionalFields: { role: { type: "string", defaultValue: "controller", input: false }, disabled: { type: "boolean", defaultValue: true, input: false } } },
    session: { expiresIn: sessionCookieSeconds, disableSessionRefresh: true, freshAge: 0, cookieCache: { enabled: false } },
    advanced: { trustedProxyHeaders: env.TRUST_PROXY === "true", useSecureCookies: env.AUTH_URL!.startsWith("https:"), ipAddress: { ipAddressHeaders: env.TRUST_PROXY === "true" ? ["x-forwarded-for"] : [] } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60, customRules: { "/sign-in/email": { window: 60, max: 5 }, "/change-password": { window: 60, max: 5 } } },
    databaseHooks: { session: { create: { before: async (session) => {
      const user = await database().prepare("SELECT role, disabled FROM auth_user WHERE id = ?").bind(session.userId).first<{role:string;disabled:boolean}>();
      if (!user || user.disabled || !roles.includes(user.role as AuthUser["role"])) throw new APIError("UNAUTHORIZED", { message: "Invalid email or password" });
      return { data: { ...session, expiresAt: new Date(persistentSessionEnd) } };
    } } } },
  });
}

export async function sessionUser(requestHeaders: Headers, renewCookie = true) {
  const instance = auth();
  const result = await instance.api.getSession({ headers: requestHeaders });
  if (!result) return null;
  // Recheck the session and permissions in one snapshot after Better Auth validates the cookie.
  const db = database();
  const user = await db.prepare(
    'SELECT u.id, u.name, u.email, u.role, u.disabled, u.controller_client_ids AS "clientIds" ' +
    'FROM auth_session s JOIN auth_user u ON u.id = s.user_id ' +
    'WHERE s.id = ? AND s.user_id = ? AND s.expires_at > clock_timestamp()',
  ).bind(result.session.id, result.user.id).first<AuthUser & { disabled: boolean; clientIds: string[] | null }>();
  if (!user || user.disabled || !roles.includes(user.role)) return null;
  // Upgrade only a still-valid session. Never revive an expired or revoked login.
  if (result.session.expiresAt.toISOString() !== persistentSessionEnd) {
    const updated = await db.prepare("UPDATE auth_session SET expires_at = ? WHERE id = ? AND user_id = ? AND expires_at > clock_timestamp()").bind(new Date(persistentSessionEnd), result.session.id, user.id).run();
    if (!updated.meta.changes) return null;
  }
  if (renewCookie) {
    const cookie = (await instance.$context).authCookies.sessionToken;
    const value = parseCookies(requestHeaders.get("cookie") || "").get(cookie.name);
    if (value) {
      try { (await cookies()).set(cookie.name, value, { httpOnly: true, sameSite: "lax", secure: cookie.attributes.secure, path: "/", maxAge: sessionCookieSeconds }); }
      catch (error) {
        // Server Components cannot set cookies; their authenticated API requests renew it.
        if (!(error instanceof Error) || !error.message.includes("Cookies can only be modified")) throw error;
      }
    }
  }
  return { user: { id: user.id, name: user.name, email: user.email, role: user.role }, sessionId: result.session.id, clientIds: user.clientIds };
}
export async function requireFullAdminSession(requestHeaders: Headers) {
  const session = await sessionUser(requestHeaders);
  if (!session) throw new RequestError("Sign in again.", 401);
  if (!isFullAdmin(session.user.role, session.clientIds)) throw new RequestError("All clients Admin access required.", 403);
  return session;
}
// Acquire the account-management lock before global writes, then check current access.
export async function lockFullAdmin(db: ServerDatabase, userId: string, sessionId: string) {
  await db.prepare("SELECT pg_advisory_xact_lock(724016)").run();
  const account = await db.prepare(
    'SELECT u.role, u.controller_client_ids AS "clientIds" FROM auth_session s JOIN auth_user u ON u.id = s.user_id ' +
    'WHERE s.id = ? AND s.user_id = ? AND s.expires_at > clock_timestamp() AND NOT u.disabled FOR KEY SHARE OF s',
  ).bind(sessionId, userId).first<{ role: Role; clientIds: string[] | null }>();
  if (!account) throw new RequestError("Sign in again.", 401);
  if (!isFullAdmin(account.role, account.clientIds)) throw new RequestError("All clients Admin access required.", 403);
}
export async function currentUser(requestHeaders: Headers, renewCookie = true) {
  const session = await sessionUser(requestHeaders, renewCookie);
  return session ? sessionWorkspaceUser(requestHeaders, session) : null;
}
export async function sessionWorkspaceUser(
  requestHeaders: Headers,
  session: NonNullable<Awaited<ReturnType<typeof sessionUser>>>,
): Promise<(AuthUser & { clientIds: string[] | null }) | null> {
  const value = parseCookies(requestHeaders.get("cookie") || "").get(workspaceCookie);
  const clientId = value ? verifyWorkspace(value, session.user.id, session.sessionId, env.AUTH_SECRET!) : "sephora";
  if (!clientId) throw new RequestError("Choose your client again.", 403);
  if (!canAccessClient(session.clientIds, clientId)) throw new RequestError("This client is not available to your account. Choose another client.", 403);
  // This header is a stale-tab guard, never a workspace selector.
  if (requestHeaders.has("x-client-id") && requestHeaders.get("x-client-id") !== clientId) throw new RequestError("The client changed in another tab. Reload this page before continuing.", 403);
  const client = await database().prepare(`SELECT c.id,c.name,CASE WHEN l.image IS NOT NULL THEN l.version END AS "logoKey" FROM clients c LEFT JOIN client_logos l ON l.client_id=c.id WHERE c.id=? AND c.archived_at IS NULL`).bind(clientId).first<{ id: string; name: string; logoKey: string | null }>();
  if (!client) return null;
  selectWorkspace(client);
  return { ...session.user, clientIds: session.clientIds, clientId, clientName: client.name, clientLogoKey: client.logoKey };
}
export async function requirePage(page: "admin" | "controller" | "monitor") {
  let user: Awaited<ReturnType<typeof currentUser>>;
  try { user = await currentUser(new Headers(await headers())); }
  catch (error) { if (error instanceof RequestError && error.status === 403) redirect("/workspaces"); throw error; }
  if (!user) redirect("/workspaces");
  if (!canOpen(user.role, page)) redirect(roleHome(user.role));
  return user;
}
export function sameOrigin(request: Request) { return !!env.AUTH_URL && matchesAuthOrigin(request, configuredAuthOrigins(env.AUTH_URL, env.AUTH_ADDITIONAL_ORIGINS, env.ALLOW_LAN_HTTP === "true"), env.TRUST_PROXY === "true"); }
export async function tokenHash(token: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((n) => n.toString(16).padStart(2, "0")).join(""); }
export async function auditUser(action: string, target: string, actor: string, db: ServerDatabase = database()) { await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, 'user', NULL, ?, ?, ?)").bind(crypto.randomUUID(), action, target, actor, new Date().toISOString()).run(); }
