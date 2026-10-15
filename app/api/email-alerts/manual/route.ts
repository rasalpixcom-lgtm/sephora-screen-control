import { currentUser, sameOrigin } from "@/lib/auth";
import { readObject, requestFailure } from "@/lib/request";
import { EmailAlertServiceError, previewManualAlert, sendManualAlert } from "@/lib/email-alert-server";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store",Vary:"Cookie"};
async function admin(request:Request){
  const user=await currentUser(request.headers);
  if(!user)return Response.json({error:"Sign in again."},{status:401,headers});
  if(user.role!=="admin")return Response.json({error:"Admin access required."},{status:403,headers});
  return user;
}
function failure(error:unknown){
  return error instanceof EmailAlertServiceError?Response.json({error:error.message},{status:error.status,headers}):requestFailure(error);
}
export async function GET(request:Request){
  try{const user=await admin(request);if(user instanceof Response)return user;return Response.json(await previewManualAlert(),{headers});}
  catch(error){return failure(error);}
}
export async function POST(request:Request){
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin."},{status:403,headers});
  try{
    const user=await admin(request);if(user instanceof Response)return user;
    const body=await readObject(request);
    if(Object.keys(body).length!==1||typeof body.confirmationToken!=="string"||!/^[a-f0-9]{64}$/.test(body.confirmationToken))return Response.json({error:"Review the current alerts before sending."},{status:400,headers});
    const result=await sendManualAlert(body.confirmationToken);
    return Response.json({status:result.status,screenCount:result.screenCount},{headers});
  }catch(error){return failure(error);}
}
