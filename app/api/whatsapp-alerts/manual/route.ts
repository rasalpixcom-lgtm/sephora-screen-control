import { currentUser, sameOrigin } from "@/lib/auth";
import { readObject, requestFailure } from "@/lib/request";
import { WhatsAppServiceError, previewWhatsAppManual, queueWhatsAppSend } from "@/lib/whatsapp-alert-server";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store",Vary:"Cookie"};
async function admin(request:Request){
  const user=await currentUser(request.headers);
  if(!user)return Response.json({error:"Sign in again."},{status:401,headers});
  if(user.role!=="admin")return Response.json({error:"Admin access required."},{status:403,headers});
  return user;
}
function failure(error:unknown){
  return error instanceof WhatsAppServiceError?Response.json({error:error.message},{status:error.status,headers}):requestFailure(error);
}
export async function GET(request:Request){
  try{const user=await admin(request);if(user instanceof Response)return user;return Response.json(await previewWhatsAppManual(),{headers});}
  catch(error){return failure(error);}
}
export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin."},{status:403,headers});
  try{
    const user=await admin(request);if(user instanceof Response)return user;
    const body=await readObject(request);
    if(Object.keys(body).length!==1||typeof body.confirmationToken!=="string"||!/^[a-f0-9]{64}$/.test(body.confirmationToken))return Response.json({error:"Review the current alerts before sending."},{status:400,headers});
    const result=await queueWhatsAppSend("manual",body.confirmationToken);
    return Response.json(result,{status:202,headers});
  }catch(error){return failure(error);}
}
