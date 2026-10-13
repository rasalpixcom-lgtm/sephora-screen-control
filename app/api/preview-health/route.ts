import { currentUser } from "@/lib/auth";
import { previewHealthSnapshot } from "@/lib/preview-health-server";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", Vary: "Cookie" };
  try {
    if (!await currentUser(request.headers)) return Response.json({ error: "Sign in again." }, { status: 401, headers });
    return Response.json(previewHealthSnapshot(), { headers });
  } catch (error) { return requestFailure(error); }
}
