import { auth, currentUser, sameOrigin } from "@/lib/auth";
export const runtime = "edge";
export async function GET(request: Request) {
  if (new URL(request.url).pathname !== "/api/auth/get-session") return Response.json({ error: "Not found" }, { status: 404 });
  return auth().handler(request);
}
export async function POST(request: Request) {
  const path = new URL(request.url).pathname;
  if (!["/api/auth/sign-in/email", "/api/auth/sign-out", "/api/auth/change-password"].includes(path)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (path === "/api/auth/change-password" && !await currentUser(request.headers)) return Response.json({ error: "Sign in again." }, { status: 401 });
  const response = await auth().handler(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
