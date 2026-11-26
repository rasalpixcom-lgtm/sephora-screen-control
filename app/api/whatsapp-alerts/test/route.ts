import { withWorkspace } from "@/lib/client-workspace";
import { requireWorkspaceAdminWriter, sameOrigin } from "@/lib/auth";
import { readObject, RequestError, requestFailure } from "@/lib/request";
import { WhatsAppServiceError, queueWhatsAppSend } from "@/lib/whatsapp-alert-server";
export const runtime="nodejs";
async function POSTHandler(request:Request) {
  const headers={"Cache-Control":"no-store",Vary:"Cookie"};
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin."},{status:403,headers});
  try {
    const {lock}=await requireWorkspaceAdminWriter(request.headers);
    const body=await readObject(request);
    if(Object.keys(body).length)return Response.json({error:"Test messages use the saved recipients."},{status:400,headers});
    const result=await queueWhatsAppSend("test",undefined,{lock});
    return Response.json(result,{status:202,headers});
  } catch(error) {
    if(error instanceof WhatsAppServiceError || error instanceof RequestError)return Response.json({error:error.message},{status:error.status,headers});
    return requestFailure(error);
  }
}

export const POST = withWorkspace(POSTHandler);
