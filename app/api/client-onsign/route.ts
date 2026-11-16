import { sameOrigin, sessionUser } from "@/lib/auth";
import { validClientId, withWorkspace } from "@/lib/client-workspace";
import { readClientOnSign, onSignStatus, onSignCredentials } from "@/lib/client-onsign";
import { encryptIntegrationToken } from "@/lib/integration-secret";
import { getPool } from "@/lib/database";
import { validOnSignPlayerId } from "@/lib/onsign-api-shared";
import { createOnSignClient, OnSignApiError } from "@/lib/onsign-api";
import { readObject, RequestError, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
async function admin(request: Request) {
  const session = await sessionUser(request.headers);
  if (!session) throw new RequestError("Sign in again.", 401);
  if (session.user.role !== "admin") throw new RequestError("Admin access required.", 403);
  return session.user;
}
function client(value: unknown): string {
  if (typeof value !== "string" || !validClientId(value)) throw new RequestError("Choose a client.");
  return value;
}
export const GET = withWorkspace(async (request: Request) => {
  try {
    await admin(request);
    const id = client(new URL(request.url).searchParams.get("client"));
    return Response.json(onSignStatus(id, await readClientOnSign(id)), { headers });
  } catch (error) { return requestFailure(error); }
});
export const POST = withWorkspace(async (request: Request) => {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const actor = await admin(request), body = await readObject(request), id = client(body.clientId);
    if (Object.keys(body).some(key => !["clientId","action","version","token","organizationId"].includes(key))) throw new RequestError("Unexpected OnSign setting.");
    if (typeof body.action !== "string" || !["save","disable","server","test","organizations"].includes(body.action)) throw new RequestError("Choose a valid OnSign action.");
    if (body.version !== null && (typeof body.version !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.version))) throw new RequestError("Reload the OnSign settings.");
    const row = await readClientOnSign(id);
    if ((row.version || null) !== body.version) throw new RequestError("OnSign settings changed. Reopen the editor.", 409);
    let encrypted: string | null = null, organization: string | null = null;
    const mode = body.action === "disable" ? "disabled" : body.action === "server" ? "server" : "custom";
    if (mode === "custom") {
      const discovering = body.action === "organizations";
      if ((discovering ? body.organizationId !== undefined : typeof body.organizationId !== "string") || (body.token !== undefined && typeof body.token !== "string")) throw new RequestError("Enter valid OnSign settings.");
      organization = typeof body.organizationId === "string" ? body.organizationId.trim() || null : null;
      if (!discovering && (organization !== null && !validOnSignPlayerId(organization) || id !== "sephora" && !organization)) throw new RequestError("Enter the OnSign organization ID for this client.");
      const submitted = typeof body.token === "string" ? body.token.trim() : "";
      if (submitted && !/^[\x21-\x7e]{1,8192}$/.test(submitted)) throw new RequestError("Enter a valid API token without spaces or line breaks.");
      const token = submitted || onSignCredentials(id, row).token;
      if (!token) throw new RequestError("Enter an OnSign API token.");
      if (body.action === "test" || discovering) {
        const api = createOnSignClient({ clientId: () => id, token: () => token, organizationId: () => organization || undefined, fetch: (...args) => fetch(...args), now: Date.now });
        if (discovering) return Response.json(await api.organizations(), { headers });
        const data = await api.list();
        return Response.json({ tested: true, players: data.players.length }, { headers });
      }
      encrypted = encryptIntegrationToken(id, token);
    } else if (body.token !== undefined || body.organizationId !== undefined) throw new RequestError("Unexpected OnSign setting.");
    await getPool("sephora").query("SELECT pixcom_set_client_onsign($1,$2,$3,$4,$5,$6)", [actor.id,id,body.version,mode,organization,encrypted]);
    return Response.json({ saved: true }, { headers });
  } catch (error) {
    if (error instanceof OnSignApiError) return requestFailure(new RequestError(error.message, error.status));
    const messages: Record<string, [number,string]> = { "40001": [409,"OnSign settings changed. Reopen the editor."], "42501": [403,"Admin access required."], "P0002": [404,"Client not found."], "23514": [400,"Enter valid OnSign settings."] };
    const entry = messages[(error as {code?:string})?.code || ""];
    return requestFailure(entry ? new RequestError(entry[1],entry[0]) : error);
  }
});
