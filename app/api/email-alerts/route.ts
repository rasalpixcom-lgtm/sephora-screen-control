import { currentUser, sameOrigin } from "@/lib/auth";
import { readObject, requestFailure } from "@/lib/request";
import { EmailAlertInputError, parseEmailAlertSettings } from "@/lib/email-alert-shared";
import { emailAlertSnapshot, EmailAlertServiceError, saveEmailAlertSettings } from "@/lib/email-alert-server";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store",Vary:"Cookie"};
async function admin(request:Request) {
  const user=await currentUser(request.headers);
  if(!user) return Response.json({error:"Sign in again."},{status:401,headers});
  if(user.role!=="admin") return Response.json({error:"Admin access required."},{status:403,headers});
  return user;
}
function failure(error:unknown) {
  if(error instanceof EmailAlertInputError || error instanceof EmailAlertServiceError) return Response.json({error:error.message},{status:error instanceof EmailAlertServiceError?error.status:400,headers});
  return requestFailure(error);
}
export async function GET(request:Request) {
  try {const user=await admin(request);if(user instanceof Response)return user;return Response.json(await emailAlertSnapshot(),{headers});}
  catch(error){return failure(error);}
}
export async function POST(request:Request) {
  if(!sameOrigin(request))return Response.json({error:"Invalid request origin."},{status:403,headers});
  try {
    const user=await admin(request);if(user instanceof Response)return user;
    await saveEmailAlertSettings(parseEmailAlertSettings(await readObject(request)),user.name);
    return Response.json(await emailAlertSnapshot(),{headers});
  } catch(error){return failure(error);}
}
