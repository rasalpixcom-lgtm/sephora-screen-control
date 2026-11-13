import { sessionUser } from "@/lib/auth";
import { validClientId, withWorkspace } from "@/lib/client-workspace";
import { getPool } from "@/lib/database";
import { validLogoVersion } from "@/lib/client-logo";
import { RequestError, requestFailure } from "@/lib/request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withWorkspace(async (request: Request) => {
  try {
    if (!await sessionUser(request.headers)) throw new RequestError("Sign in again.",401);
    const query=new URL(request.url).searchParams,id=query.get("client"),version=query.get("v");
    if (!id || !validClientId(id) || !validLogoVersion(version)) throw new RequestError("Background not found.",404);
    const row=(await getPool("sephora").query<{image:Buffer}>("SELECT l.image FROM client_backgrounds l JOIN clients c ON c.id=l.client_id WHERE c.id=$1 AND c.archived_at IS NULL AND l.version=$2 AND l.image IS NOT NULL",[id,version])).rows[0];
    if (!row) throw new RequestError("Background not found.",404);
    return new Response(new Uint8Array(row.image),{headers:{"Content-Type":"image/webp","Content-Length":String(row.image.length),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Vary":"Cookie"}});
  } catch(error) {return requestFailure(error);}
});
