import { lockWorkspaceWriter, sameOrigin, sessionUser, sessionWorkspaceUser } from "@/lib/auth";
import { activeClientId, withWorkspace } from "@/lib/client-workspace";
import { getPool, ServerDatabase } from "@/lib/database";
import { RequestError, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
// Opening Controller selects the common wall's client; ordinary state reads never do.
export const POST = withWorkspace(async (request: Request) => {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const session = await sessionUser(request.headers);
    const account = session ? await sessionWorkspaceUser(request.headers, session) : null;
    if (!session || !account) throw new RequestError("Sign in again.", 401);
    if (account.role !== "admin" && account.role !== "controller") throw new RequestError("Controller access required.", 403);
    // Use the authenticated workspace, never an arbitrary client supplied in the body.
    const clientId = activeClientId();
    await new ServerDatabase(getPool("sephora")).transaction(async db => {
      if (!await db.prepare("SELECT id FROM common_monitor_display WHERE id='main' FOR UPDATE").first()) {
        throw new RequestError("This Controller client is unavailable.", 409);
      }
      await lockWorkspaceWriter(db, session, clientId, "controller");
      await db.prepare("UPDATE common_monitor_display SET client_id=?, updated_at=clock_timestamp(), updated_by=? WHERE id='main'")
        .bind(clientId, account.id).run();
    });
    return Response.json({ clientId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestFailure(error); }
});
