import { withWorkspace } from "@/lib/client-workspace";
import { sessionUser } from "@/lib/auth";
import { requestFailure } from "@/lib/request";
export const runtime = "nodejs";
async function GETHandler(request: Request) { try { const session = await sessionUser(request.headers);
  const user = session?.user || null; return Response.json(user ? { user } : { error: "Sign in again." }, { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } }); } catch (error) { return requestFailure(error); } }

export const GET = withWorkspace(GETHandler);
