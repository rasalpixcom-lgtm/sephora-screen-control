import { EmailAlertInputError, parseEmailAlertSettings, type EmailAlertSettings, type ManualAlertPreview } from "./email-alert-shared";
export const WHATSAPP_REPORT_MAX_SCREENS=5000;
export type WhatsAppAlertSettings=EmailAlertSettings;
export type WhatsAppAlertPreview=ManualAlertPreview;
export type WhatsAppDelivery={id:string;recipient:string;kind:"unavailable"|"recovery"|"test"|"manual";status:string;screenCount:number;startedAt:string;errorCode:string|null;providerId:string|null};
export type WhatsAppAlertSnapshot={settings:WhatsAppAlertSettings;sender:{configured:boolean;instance:string|null};deliveries:WhatsAppDelivery[]};
export function normalizePhone(value:unknown):string|null {
  if(typeof value!=="string"||value.length>40)return null;
  const phone=value.trim().replace(/[\s()-]/g,"");
  return /^\+[1-9]\d{7,14}$/.test(phone)?phone:null;
}
export function parseWhatsAppSettings(body:Record<string,unknown>):WhatsAppAlertSettings {
  if(!Array.isArray(body.recipients)||body.recipients.length>20)throw new EmailAlertInputError("Add up to 20 WhatsApp numbers.");
  const recipients=body.recipients.map(normalizePhone);
  if(recipients.some(number=>!number))throw new EmailAlertInputError("Enter individual numbers with country codes, such as +971501234567.");
  if(new Set(recipients).size!==recipients.length)throw new EmailAlertInputError("Remove duplicate WhatsApp numbers.");
  if(body.enabled&&!recipients.length)throw new EmailAlertInputError("Add at least one WhatsApp recipient before enabling alerts.");
  // Share timing/revision validation, substituting synthetic addresses only during validation.
  const validated=parseEmailAlertSettings({...body,recipients:recipients.map((_,index)=>`${index}@example.test`)});
  return {...validated,recipients:recipients as string[]};
}
export const whatsappErrorMessages:Record<string,string>={pdf:"The PDF report could not be created or is too large. Check the server assets and report size.",configuration:"Configure the UltraMsg instance and token on the server.",rejected:"UltraMsg rejected the request. Check the instance, token and recipient.",connection:"Could not connect to UltraMsg.",uncertain:"Acceptance could not be confirmed. Check UltraMsg before retrying to avoid duplicates."};
