import { currentUser } from "@/lib/auth";
import { requestFailure } from "@/lib/request";
export const runtime = "nodejs";
export async function GET(request: Request) { try { const user = await currentUser(request.headers); return Response.json(user ? { user } : { error: "Sign in again." }, { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } }); } catch (error) { return requestFailure(error); } }
