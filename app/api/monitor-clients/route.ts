import { sessionUser } from "@/lib/auth";
import { canAccessClient } from "@/lib/auth-policy";
import { getPool } from "@/lib/database";
import { withWorkspace } from "@/lib/client-workspace";
import { validCommonMonitorKey } from "@/lib/monitor-access";
import { requestFailure } from "@/lib/request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withWorkspace(async (request: Request) => {
  const headers = { "Cache-Control": "no-store", Vary: "Authorization, Cookie" };
  try {
    const authorization = request.headers.get("authorization");
    const session = authorization === null ? await sessionUser(request.headers) : null;
    const allowed = authorization !== null ? await validCommonMonitorKey(authorization) : !!session;
    if (!allowed) return Response.json({ error: "This monitor link is missing or inactive. Ask an Admin for the current link." }, { status: 401, headers });
    const clients = await getPool("sephora").query<{ id: string; name: string }>("SELECT id,name FROM clients WHERE archived_at IS NULL ORDER BY lower(name),id");
    return Response.json({ clients: clients.rows.filter(client => canAccessClient(session?.clientIds ?? null, client.id)) }, { headers });
  } catch (error) { return requestFailure(error); }
});
