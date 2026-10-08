import { auth, currentUser, sameOrigin } from "@/lib/auth";
import { readObject, requestFailure } from "@/lib/request";
export const runtime = "nodejs";
export async function GET() {
  return Response.json({ error: "Not found" }, { status: 404 });
}
export async function POST(request: Request) {
  const path = new URL(request.url).pathname;
  if (!["/api/auth/sign-in/email", "/api/auth/sign-out", "/api/auth/change-password"].includes(path)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
  if (path === "/api/auth/change-password" && !await currentUser(request.headers)) return Response.json({ error: "Sign in again." }, { status: 401 });
  const body = await readObject(request);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  request = new Request(request.url, { method: "POST", headers, body: JSON.stringify(path === "/api/auth/change-password" ? { ...body, revokeOtherSessions: true } : body) });
  const response = await auth().handler(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
  } catch (error) { return requestFailure(error); }
}
