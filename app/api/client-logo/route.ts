import { lockFullAdmin, requireFullAdminSession, sameOrigin, sessionUser } from "@/lib/auth";
import { canAccessClient } from "@/lib/auth-policy";
import { validClientId, withWorkspace } from "@/lib/client-workspace";
import { getPool, ServerDatabase } from "@/lib/database";
import { normalizeClientLogo, readClientLogoMutation, validLogoVersion } from "@/lib/client-logo";
import { RequestError, requestFailure } from "@/lib/request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withWorkspace(async (request: Request) => {
  try {
    const session = await sessionUser(request.headers);
    if (!session) throw new RequestError("Sign in again.",401);
    const query=new URL(request.url).searchParams,id=query.get("client"),version=query.get("v");
    if (!id || !validClientId(id) || !validLogoVersion(version) || !canAccessClient(session.clientIds, id)) throw new RequestError("Logo not found.",404);
    const row=(await getPool("sephora").query<{image:Buffer}>("SELECT l.image FROM client_logos l JOIN clients c ON c.id=l.client_id WHERE c.id=$1 AND c.archived_at IS NULL AND l.version=$2 AND l.image IS NOT NULL",[id,version])).rows[0];
    if (!row) throw new RequestError("Logo not found.",404);
    return new Response(new Uint8Array(row.image),{headers:{"Content-Type":"image/webp","Content-Length":String(row.image.length),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Vary":"Cookie"}});
  } catch(error) {return requestFailure(error);}
});
export const POST = withWorkspace(async(request:Request)=>{
  try {
    if(!sameOrigin(request)) throw new RequestError("Invalid request origin.",403);
    const session=await requireFullAdminSession(request.headers);
    const {body,file}=await readClientLogoMutation(request);
    if(typeof body.clientId!=="string" || !validClientId(body.clientId)) throw new RequestError("Choose a client.");
    if(body.expectedVersion!==null && !validLogoVersion(body.expectedVersion)) throw new RequestError("Reload the client logo before saving.");
    if(typeof body.action!=="string" || !["replace","remove"].includes(body.action) || (body.action==="replace")!==!!file) throw new RequestError("Choose a valid logo change.");
    const image=file?await normalizeClientLogo(file):null;
    const result=await new ServerDatabase(getPool("sephora")).transaction(async db=>{
      await lockFullAdmin(db, session.user.id, session.sessionId);
      return db.prepare("SELECT pixcom_set_client_logo(?,?,?,?::bytea) AS version")
        .bind(session.user.id,body.clientId,body.expectedVersion,image).first<{version:string}>();
    });
    if (!result) throw new Error("Client logo update did not return a version.");
    return Response.json({ version: result.version },{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const messages:Record<string,[number,string]>={"40001":[409,"This logo changed. Close the editor, refresh the list and try again."],"42501":[403,"Admin access required."],"P0002":[404,"Client not found."],"22023":[400,"Choose a valid logo."]};
    const entry=messages[(error as {code?:string})?.code||""];
    return requestFailure(entry?new RequestError(entry[1],entry[0]):error);
  }
});
