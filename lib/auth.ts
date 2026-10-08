const env = process.env;
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as schema from "@/db/postgres-schema";
import { database } from "@/lib/store";
import { getPool } from "@/lib/database";
import type { ServerDatabase } from "@/lib/database";
import { canOpen, roleHome, roles, type AuthUser } from "@/lib/auth-policy";
import { validAuthOrigin } from "@/lib/network-origin";
import { hashPassword, verifyPassword } from "@/lib/password";

export function assertAuthConfig() {
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32 || !env.AUTH_URL) throw new Error("Authentication environment is not configured.");
  if (!validAuthOrigin(env.AUTH_URL, env.ALLOW_LAN_HTTP === "true")) throw new Error("Public authentication requires HTTPS. Private IP HTTP testing requires ALLOW_LAN_HTTP=true.");
}
export function auth() {
  assertAuthConfig();
  return betterAuth({
    appName: "Sephora Screen Control", secret: env.AUTH_SECRET!, baseURL: env.AUTH_URL!,
    database: drizzleAdapter(drizzle(getPool(), { schema }), { provider: "pg", schema, transaction: true }),
    trustedOrigins: [env.AUTH_URL!],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128, password: { hash: hashPassword, verify: verifyPassword } },
    user: { additionalFields: { role: { type: "string", defaultValue: "wall", input: false }, disabled: { type: "boolean", defaultValue: true, input: false } } },
    session: { expiresIn: 30 * 86400, disableSessionRefresh: true, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: env.AUTH_URL!.startsWith("https:"), ipAddress: { ipAddressHeaders: env.TRUST_PROXY === "true" ? ["x-forwarded-for"] : [] } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60, customRules: { "/sign-in/email": { window: 60, max: 5 }, "/change-password": { window: 60, max: 5 } } },
    databaseHooks: { session: { create: { before: async (session) => {
      const user = await database().prepare("SELECT role, disabled FROM auth_user WHERE id = ?").bind(session.userId).first<{role:string;disabled:boolean}>();
      if (!user || user.disabled || !roles.includes(user.role as AuthUser["role"])) throw new APIError("UNAUTHORIZED", { message: "Invalid email or password" });
      return { data: { ...session, expiresAt: new Date(Date.now() + (user.role === "wall" ? 30 * 86400 : 8 * 3600) * 1000) } };
    } } } },
  });
}

export async function currentUser(requestHeaders: Headers): Promise<AuthUser | null> {
  const result = await auth().api.getSession({ headers: requestHeaders });
  if (!result) return null;
  const user = await database().prepare("SELECT id, name, email, role, disabled FROM auth_user WHERE id = ?").bind(result.user.id).first<AuthUser & {disabled:boolean}>();
  if (!user || user.disabled || !roles.includes(user.role)) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
export async function requirePage(page: "admin" | "controller" | "monitor") {
  const user = await currentUser(new Headers(await headers()));
  if (!user) redirect(`/login?next=/${page}`);
  if (!canOpen(user.role, page)) redirect(roleHome(user.role));
  return user;
}
export function sameOrigin(request: Request) { return !!env.AUTH_URL && request.headers.get("origin") === new URL(env.AUTH_URL).origin; }
export async function tokenHash(token: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((n) => n.toString(16).padStart(2, "0")).join(""); }
export async function auditUser(action: string, target: string, actor: string, db: ServerDatabase = database()) { await db.prepare("INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at) VALUES (?, ?, 'user', NULL, ?, ?, ?)").bind(crypto.randomUUID(), action, target, actor, new Date().toISOString()).run(); }
