import { auth, currentUser, sameOrigin } from "@/lib/auth";
export const runtime = "edge";
export async function GET() {
  return Response.json({ error: "Not found" }, { status: 404 });
}
export async function POST(request: Request) {
  const path = new URL(request.url).pathname;
  if (!["/api/auth/sign-in/email", "/api/auth/sign-out", "/api/auth/change-password"].includes(path)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (path === "/api/auth/change-password" && !await currentUser(request.headers)) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (path === "/api/auth/change-password") {
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
    request = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, revokeOtherSessions: true }) });
  }
  const response = await auth().handler(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
