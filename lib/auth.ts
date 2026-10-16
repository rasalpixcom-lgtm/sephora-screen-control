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
import { canOpen, roleHome, roles, type AuthUser } from "@/lib/auth-policy";
import { configuredAuthOrigins, matchesAuthOrigin } from "@/lib/network-origin";
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
    database: drizzleAdapter(drizzle(getPool(), { schema }), { provider: "pg", schema, transaction: true }),
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

export async function currentUser(requestHeaders: Headers, renewCookie = true): Promise<AuthUser | null> {
  const instance = auth();
  const result = await instance.api.getSession({ headers: requestHeaders });
  if (!result) return null;
  const user = await database().prepare("SELECT id, name, email, role, disabled FROM auth_user WHERE id = ?").bind(result.user.id).first<AuthUser & {disabled:boolean}>();
  if (!user || user.disabled || !roles.includes(user.role)) return null;
  // Upgrade only a still-valid session. Never revive an expired or revoked login.
  if (result.session.expiresAt.toISOString() !== persistentSessionEnd) {
    const updated = await database().prepare("UPDATE auth_session SET expires_at = ? WHERE id = ? AND expires_at > ?").bind(new Date(persistentSessionEnd), result.session.id, new Date()).run();
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
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
export async function requirePage(page: "admin" | "controller" | "monitor") {
  const user = await currentUser(new Headers(await headers()));
  if (!user) redirect(`/login?next=/${page}`);
  if (!canOpen(user.role, page)) redirect(roleHome(user.role));
  return user;
}
export function sameOrigin(request: Request) { return !!env.AUTH_URL && matchesAuthOrigin(request, configuredAuthOrigins(env.AUTH_URL, env.AUTH_ADDITIONAL_ORIGINS, env.ALLOW_LAN_HTTP === "true"), env.TRUST_PROXY === "true"); }
export async function tokenHash(token: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((n) => n.toString(16).padStart(2, "0")).join(""); }
export async function auditUser(action: string, target: string, actor: string, db: ServerDatabase = database()) { await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, 'user', NULL, ?, ?, ?)").bind(crypto.randomUUID(), action, target, actor, new Date().toISOString()).run(); }
