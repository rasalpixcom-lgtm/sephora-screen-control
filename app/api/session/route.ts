import { currentUser } from "@/lib/auth";
export const runtime = "edge";
export async function GET(request: Request) { const user = await currentUser(request.headers); return Response.json(user ? { user } : { error: "Sign in again." }, { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } }); }
