import { sameOrigin } from "@/lib/auth";
import { withWorkspace } from "@/lib/client-workspace";
import { sessionUser } from "@/lib/auth";
import { clientManagementInput, listManagedClients } from "@/lib/client-management";
import { getPool } from "@/lib/database";
import { RequestError, requestFailure } from "@/lib/request";
import { normalizeClientLogo, readClientLogoMutation } from "@/lib/client-logo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function adminUser(headers: Headers) {
  const session = await sessionUser(headers);
  if (!session) throw new RequestError("Sign in again.", 401);
  if (session.user.role !== "admin") throw new RequestError("Admin access required.", 403);
  return session.user;
}
export const GET = withWorkspace(async (request: Request) => {
  try { await adminUser(request.headers); return Response.json(await listManagedClients(), { headers }); }
  catch (error) { return requestFailure(error); }
});
export const POST = withWorkspace(async (request: Request) => {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const actor = await adminUser(request.headers);
    const {body,file,background} = await readClientLogoMutation(request,true);
    const input = clientManagementInput(body);
    const image = file ? await normalizeClientLogo(file) : null;
    const backgroundImage = background ? await normalizeClientLogo(background,"background") : null;
    const connection=await getPool("sephora").connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pixcom_manage_client($1,$2,$3,$4,$5::jsonb,$6)",[actor.id,"create",input.clientId,input.name,null,null]);
      if(image) await connection.query("SELECT pixcom_set_client_logo($1,$2,NULL,$3::bytea)",[actor.id,input.clientId,image]);
      if(backgroundImage) await connection.query("SELECT pixcom_set_client_background($1,$2,NULL,$3::bytea)",[actor.id,input.clientId,backgroundImage]);
      await connection.query("COMMIT");
    } catch(error) {await connection.query("ROLLBACK");throw error;}
    finally {connection.release();}
    return Response.json({ clientId: input.clientId }, { headers, status: 201 });
  } catch (error) {
    // Map only known database errors to fixed, non-sensitive messages.
    const code = (error as { code?: string })?.code;
    const messages: Record<string, [number, string]> = {
      "23505": [409, "A client with this name already exists."],
      "42501": [403, "Admin access required."],
      "22023": [400, "Enter a valid client name."],
    };
    if (code && messages[code]) { const [status, message] = messages[code]; return requestFailure(new RequestError(message, status)); }
    return requestFailure(error);
  }
});
