import { currentUser, sameOrigin } from "@/lib/auth";
import { withWorkspace } from "@/lib/client-workspace";
import { getPool } from "@/lib/database";
import { RequestError, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
// Opening Controller selects the common wall's client; ordinary state reads never do.
export const POST = withWorkspace(async (request: Request) => {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const account = await currentUser(request.headers);
    if (!account) throw new RequestError("Sign in again.", 401);
    if (account.role !== "admin" && account.role !== "controller") throw new RequestError("Controller access required.", 403);
    // Use the authenticated workspace, never an arbitrary client supplied in the body.
    const result = await getPool("sephora").query(
      `UPDATE common_monitor_display SET client_id=c.id, updated_at=now(), updated_by=u.id
       FROM clients c, auth_user u
       WHERE common_monitor_display.id='main' AND c.id=$1 AND c.archived_at IS NULL
         AND u.id=$2 AND NOT u.disabled AND u.role IN ('admin','controller')
       RETURNING common_monitor_display.client_id`, [account.clientId, account.id]);
    if (!result.rowCount) throw new RequestError("This Controller client is unavailable.", 409);
    return Response.json({ clientId: result.rows[0].client_id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return requestFailure(error); }
});
