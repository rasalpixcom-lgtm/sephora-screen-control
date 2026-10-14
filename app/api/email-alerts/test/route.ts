import { currentUser, sameOrigin } from "@/lib/auth";
import { readObject, requestFailure } from "@/lib/request";
import { EmailAlertServiceError, sendTestAlert } from "@/lib/email-alert-server";
export const runtime="nodejs";
export async function POST(request:Request) {
  const headers={"Cache-Control":"no-store",Vary:"Cookie"};
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin."},{status:403,headers});
  try {
    const user=await currentUser(request.headers);
    if(!user)return Response.json({error:"Sign in again."},{status:401,headers});
    if(user.role!=="admin")return Response.json({error:"Admin access required."},{status:403,headers});
    const body=await readObject(request);
    if(Object.keys(body).length)return Response.json({error:"Test emails use the saved recipients."},{status:400,headers});
    const result=await sendTestAlert();
    return Response.json({status:result.status},{headers});
  } catch(error) {
    if(error instanceof EmailAlertServiceError)return Response.json({error:error.message},{status:error.status,headers});
    return requestFailure(error);
  }
}
