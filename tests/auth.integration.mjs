// Runs the built Worker against a fresh, isolated local D1 database. No real
// accounts or inventory are read or changed. Requires npm run build first.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const root = process.cwd(); const run = crypto.randomUUID(); const origin = "http://127.0.0.1:5175";
const token = crypto.randomBytes(32).toString("hex"); const password = crypto.randomBytes(24).toString("base64url");
const mf = new Miniflare({ modules: [{type: "ESModule", path: path.join(root,"dist/server/index.js")}, ...fs.readdirSync("dist/server",{recursive:true}).filter(p=>p.endsWith(".js") && p!=="index.js").map(p=>({type:"ESModule",path:path.join(root,"dist/server",p)}))], compatibilityDate:"2026-05-15", compatibilityFlags:["nodejs_compat"], d1Databases:{DB:run}, bindings:{AUTH_SECRET:crypto.randomBytes(48).toString("hex"), AUTH_URL:origin, AUTH_BOOTSTRAP_HASH:crypto.createHash("sha256").update(token).digest("hex"),AUTH_BOOTSTRAP_EXPIRES:String(Date.now()+600000),AUTH_ADMIN_EMAIL:"admin@example.test"} });
const db=await mf.getD1Database("DB");
for(const migration of fs.readdirSync("drizzle").filter(p=>p.endsWith(".sql")).sort()) { const sql=fs.readFileSync(path.join("drizzle",migration),"utf8").replaceAll("--> statement-breakpoint",""); await db.exec(sql.replaceAll("\n"," ").replaceAll("\r"," ")); }

let checks = 0;
function check(condition, name) { assert.ok(condition, name); checks++; console.log(`PASS ${name}`); }
async function request(route, body, cookie = "", extra = {}) { return mf.dispatchFetch(origin + route, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual" }); }
async function login(email, pw = password, ip = "192.0.2.10") { const response = await request("/api/auth/sign-in/email", { email, password: pw }, "", { "cf-connecting-ip": ip }); const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "); return { response, cookie }; }
try {
  check((await request("/api/state")).status === 401, "anonymous inventory is blocked");
  check((await request("/admin")).status === 307, "anonymous Admin redirects to login");
  check((await request("/api/auth/sign-up/email", { email: "intruder@example.test", password, name: "Intruder", role: "admin" })).status === 404, "public registration is unavailable");
  check((await request("/api/auth/get-session")).status === 404, "unused raw session endpoint is unavailable");
  check((await request("/activate")).status === 200 && (await (await request("/activate")).text()).includes("admin@example.test"), "first Admin form shows the configured login ID");
  check((await request("/api/activate", { token, password }, "", { Origin: "https://attacker.test" })).status === 403, "cross-origin setup is rejected");
  check((await request("/api/activate", { token: "0".repeat(64), password })).status === 400, "incorrect setup tokens are rejected");
  check((await request("/api/activate", { token, password: "short" })).status === 400, "first Admin setup rejects weak passwords");
  const competingSetups = await Promise.all([request("/api/activate", { token, password }), request("/api/activate", { token, password })]);
  const setup = competingSetups.find((response) => response.status === 200);
  check(competingSetups.filter((response) => response.status === 200).length === 1 && (await db.prepare("SELECT COUNT(*) AS count FROM auth_user").first()).count === 1, "concurrent setup creates exactly one first Admin");
  check(setup?.status === 200, "first Admin setup succeeds");
  check((await request("/api/activate", { token, password })).status === 400, "setup token cannot be reused");
  const admin = await login("admin@example.test"); check(admin.response.status === 200 && admin.cookie.includes("session_token"), "Admin receives a session cookie");
  check(admin.response.headers.getSetCookie().some((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)), "session cookies are HttpOnly and SameSite");
  check((await request("/api/users", undefined, admin.cookie)).status === 200, "Admin can list accounts");
  for (const role of ["controller", "wall", "admin"]) {
    const response = await request("/api/users", { action: "create", name: `Test ${role}`, email: `${role}2@example.test`, role, password }, admin.cookie);
    check(response.status === 200, `Admin can create ${role} with direct credentials`);
  }
  check((await request("/api/users", { action: "create", name: "Duplicate", email: "controller2@example.test", role: "wall", password }, admin.cookie)).status === 400, "duplicate login IDs are rejected");
  check((await request("/api/users", { action: "create", name: "Weak", email: "weak@example.test", role: "wall", password: "short" }, admin.cookie)).status === 400, "short passwords are rejected");
  const controller = await login("controller2@example.test", password, "192.0.2.11"); const wall = await login("wall2@example.test", password, "192.0.2.12");
  check(controller.response.status === 200 && wall.response.status === 200, "staff and wall credentials work without email verification");
  const durations = (await db.prepare("SELECT u.role, s.expires_at - s.created_at AS duration FROM auth_session s JOIN auth_user u ON s.user_id = u.id").all()).results;
  check(durations.every((s) => Math.abs(s.duration - (s.role === "wall" ? 30 * 86400 : 8 * 3600) * 1000) < 5000), "staff and wall sessions have the intended lifetimes");
  check((await request("/account", undefined, controller.cookie)).status === 200, "Controller can manage own password");
  check((await request("/admin/screens", undefined, controller.cookie)).status === 307, "Controller cannot open Admin pages");
  check((await request("/controller", undefined, wall.cookie)).status === 307, "Wall device cannot open Controller");
  check((await request("/monitor", undefined, wall.cookie)).status === 200, "Wall device can open Monitor");
  check((await request("/api/users", undefined, controller.cookie)).status === 403, "Controller cannot read user accounts");
  check((await request("/api/users", { action: "create", name: "Forbidden", email: "forbidden@example.test", role: "admin", password }, wall.cookie)).status === 403, "Wall device cannot create accounts");
  check((await request("/api/state", { action: "create", type: "country", name: "Forbidden" }, controller.cookie)).status === 403, "Controller cannot modify inventory");
  check((await request("/api/state", { action: "display", selection: {}, autoAdvance: true, intervalSeconds: 10 }, wall.cookie)).status === 403, "Wall device cannot control selection");
  check((await request("/api/state", { action: "display", selection: {}, autoAdvance: true, intervalSeconds: 10 }, controller.cookie)).status === 200, "Controller can change wall selection");
  const state = await (await request("/api/state", undefined, wall.cookie)).json(); check(state.activity.length === 0, "non-admin state excludes audit history");
  check((await request("/api/state", { action: "create", type: "country", name: "Spoof" }, controller.cookie, { "oai-authenticated-user-email": "admin@example.test", "x-role": "admin" })).status === 403, "client headers cannot elevate roles");
  check((await request("/api/users", { action: "create", name: "CSRF", email: "csrf@example.test", role: "admin", password }, admin.cookie, { Origin: "https://attacker.test" })).status === 403, "cross-origin Admin mutations are rejected");
  const users = (await (await request("/api/users", undefined, admin.cookie)).json()).users;
  const c = users.find((u) => u.role === "controller"); const w = users.find((u) => u.role === "wall"); const self = users.find((u) => u.email === "admin@example.test");
  check((await request("/api/users", { action: "update", id: self.id, role: "wall", disabled: false }, admin.cookie)).status === 400, "Admin cannot remove own Admin access");
  check((await request("/api/users", { action: "update", id: c.id, role: "controller", disabled: true }, admin.cookie)).status === 200, "Admin can disable staff");
  check((await request("/api/state", undefined, controller.cookie)).status === 401, "disabling revokes existing sessions immediately");
  check((await login(c.email, password, "192.0.2.13")).response.status === 401, "disabled credentials receive a normal login rejection");
  const replacement = crypto.randomBytes(24).toString("base64url");
  check((await request("/api/users", { action: "reset", id: w.id, password: replacement }, admin.cookie)).status === 200, "Admin can set a new password without email");
  check((await request("/api/state", undefined, wall.cookie)).status === 401, "password reset revokes existing sessions");
  check((await login(w.email, password, "192.0.2.14")).response.status === 401, "old password stops working");
  const newWall = await login(w.email, replacement, "192.0.2.15"); check(newWall.response.status === 200, "new password works");
  check((await request("/api/auth/sign-out", {}, newWall.cookie)).status === 200 && (await request("/api/state", undefined, newWall.cookie)).status === 401, "sign-out invalidates the server session");
  const passwordChange = await login(w.email, replacement, "192.0.2.16"); const nextPassword = crypto.randomBytes(24).toString("base64url");
  const otherWallSession = await login(w.email, replacement, "192.0.2.22");
  check((await request("/api/auth/change-password", { currentPassword: "wrong-password", newPassword: nextPassword, revokeOtherSessions: true }, passwordChange.cookie)).status === 400, "self password changes require the current password");
  check((await request("/api/auth/change-password", { currentPassword: replacement, newPassword: nextPassword, revokeOtherSessions: false }, passwordChange.cookie)).status === 200, "Wall device can change its own password");
  check((await request("/api/state", undefined, otherWallSession.cookie)).status === 401, "password changes revoke other sessions even if a client requests otherwise");
  check((await login(w.email, replacement, "192.0.2.17")).response.status === 401 && (await login(w.email, nextPassword, "192.0.2.18")).response.status === 200, "self password change replaces credentials");
  await db.prepare("UPDATE auth_session SET expires_at = 0 WHERE user_id = ?").bind(w.id).run();
  check((await request("/api/state", undefined, passwordChange.cookie)).status === 401, "expired sessions cannot access inventory");
  check((await request("/api/users", { action: "update", id: c.id, role: "controller", disabled: false }, admin.cookie)).status === 200, "Admin can re-enable staff");
  const enabled = await login(c.email, password, "192.0.2.19");
  check((await request("/api/users", { action: "update", id: c.id, role: "wall", disabled: false }, admin.cookie)).status === 200 && (await request("/api/state", undefined, enabled.cookie)).status === 401, "changing roles revokes the old session");
  const changed = await login(c.email, password, "192.0.2.20");
  check((await request("/controller", undefined, changed.cookie)).status === 307, "new sessions enforce the changed role");
  const hashes=JSON.stringify((await db.prepare("SELECT password FROM auth_account").all()).results);
  check(!hashes.includes(password) && !hashes.includes(replacement) && hashes.includes(":"), "database stores hashes, not plaintext passwords");
  for (let i = 0; i < 6; i++) { const attempt = await login("unknown@example.test", password, "192.0.2.50"); if (i === 5) check(attempt.response.status === 429, "repeated login attempts are rate limited"); }
  const second = users.find((u) => u.email === "admin2@example.test"); const secondLogin = await login(second.email, password, "192.0.2.21");
  await Promise.all([request("/api/users", { action: "update", id: second.id, role: "wall", disabled: false }, admin.cookie), request("/api/users", { action: "update", id: self.id, role: "wall", disabled: false }, secondLogin.cookie)]);
  check((await db.prepare("SELECT COUNT(*) AS count FROM auth_user WHERE role = 'admin' AND disabled = 0").first()).count >= 1, "concurrent changes cannot remove the last Admin");
  console.log(`\n${checks} integration checks passed on isolated D1.`);
} finally { await mf.dispose(); }
