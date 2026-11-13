import { sessionUser } from "@/lib/auth";
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
    const allowed = authorization !== null ? await validCommonMonitorKey(authorization) : !!await sessionUser(request.headers);
    if (!allowed) return Response.json({ error: "This monitor link is missing or inactive. Ask an Admin for the current link." }, { status: 401, headers });
    const clients = await getPool("sephora").query<{ id: string; name: string }>("SELECT id,name FROM clients WHERE archived_at IS NULL ORDER BY lower(name),id");
    return Response.json({ clients: clients.rows }, { headers });
  } catch (error) { return requestFailure(error); }
});
