import { cookies } from "next/headers";
import { sessionUser, sameOrigin } from "@/lib/auth";
import { database } from "@/lib/database";
import { clientDatabaseRole, validClientId, withWorkspace } from "@/lib/client-workspace";
import { canAccessClient, safeReturnTo } from "@/lib/auth-policy";
import { signWorkspace, workspaceCookie } from "@/lib/workspace-cookie";
import { readObject, requestFailure, RequestError } from "@/lib/request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withWorkspace(async (request: Request) => {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const session = await sessionUser(request.headers);
    if (!session) throw new RequestError("Sign in again.", 401);
    const body = await readObject(request);
    if (typeof body.clientId !== "string" || !validClientId(body.clientId)) throw new RequestError("Choose a client.");
    if (!canAccessClient(session.clientIds, body.clientId)) throw new RequestError("This client is not available to your account.", 403);
    const client = await database().prepare("SELECT id, name FROM clients WHERE id=? AND archived_at IS NULL").bind(body.clientId).first<{ id: string; name: string }>();
    if (!client) throw new RequestError("This client is not available to your account.", 403);
    const ready = await database().prepare("SELECT rolname FROM pg_roles WHERE rolname=? AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcanlogin AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolinherit AND NOT rolreplication").bind(clientDatabaseRole(client.id)).first();
    if (!ready) throw new RequestError("This client needs server setup before it can be opened.", 409);
    (await cookies()).set(workspaceCookie, signWorkspace(client.id, session.user.id, session.sessionId, process.env.AUTH_SECRET!), { httpOnly: true, sameSite: "lax", secure: process.env.AUTH_URL!.startsWith("https:"), path: "/", maxAge: 400 * 24 * 3600 });
    const role = session.user.role;
    return Response.json({ next: safeReturnTo(typeof body.next === "string" ? body.next : null, role) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestFailure(error); }
});
