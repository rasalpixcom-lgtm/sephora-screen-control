import { sameOrigin, sessionUser, sessionWorkspaceUser } from "@/lib/auth";
import { canMutate } from "@/lib/auth-policy";
import { withWorkspace } from "@/lib/client-workspace";
import { complaintAlertSettings } from "@/lib/complaint-alerts-settings";
import { getPool, ServerDatabase } from "@/lib/database";
import { readObject, RequestError, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type WallVoice = { voiceEnabled: boolean };

async function voiceController(request: Request) {
  if (!complaintAlertSettings()) throw new RequestError("Complaint alerts are unavailable.", 404);
  const session = await sessionUser(request.headers);
  const account = session ? await sessionWorkspaceUser(request.headers, session) : null;
  if (!session || !account) throw new RequestError("Sign in again.", 401);
  if (!canMutate(account.role, "display")) throw new RequestError("Controller access required.", 403);
  return { account, sessionId: session.sessionId };
}

export const GET = withWorkspace(async (request: Request) => {
  try {
    await voiceController(request);
    const { rows: [wall] } = await getPool("sephora").query<WallVoice>(
      `SELECT complaint_voice_enabled AS "voiceEnabled" FROM common_monitor_display WHERE id='main'`,
    );
    if (!wall) throw new RequestError("The shared wall is unavailable.", 409);
    return Response.json(wall, { headers });
  } catch (error) { return requestFailure(error); }
});

export const POST = withWorkspace(async (request: Request) => {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const { account, sessionId } = await voiceController(request);
    const body = await readObject(request, 1024);
    if (typeof body.voiceEnabled !== "boolean" || Object.keys(body).length !== 1) {
      throw new RequestError("Choose whether complaint voice alerts are on or off.");
    }
    const wall = await new ServerDatabase(getPool("sephora")).transaction(async db => {
      // The common wall selector also locks this row before it checks the session.
      await db.prepare("SELECT id FROM common_monitor_display WHERE id='main' FOR UPDATE").first();
      return db.prepare(
        `UPDATE common_monitor_display SET complaint_voice_enabled=?
         FROM clients c, auth_user u
         WHERE common_monitor_display.id='main' AND c.id=? AND c.archived_at IS NULL
           AND u.id=? AND NOT u.disabled AND u.role IN ('admin','controller')
           AND (u.controller_client_ids IS NULL OR c.id=ANY(u.controller_client_ids))
           AND EXISTS (
             SELECT 1 FROM auth_session s
             WHERE s.id=? AND s.user_id=u.id AND s.expires_at > clock_timestamp()
             FOR KEY SHARE OF s
           )
         RETURNING complaint_voice_enabled AS "voiceEnabled"`,
      ).bind(body.voiceEnabled, account.clientId, account.id, sessionId).first<WallVoice>();
    });
    if (!wall) throw new RequestError("The shared wall or your Controller access is unavailable.", 409);
    return Response.json(wall, { headers });
  } catch (error) { return requestFailure(error); }
});
