export type EmailAlertSettings = {
  enabled: boolean; thresholdMinutes: number; groupingMinutes: number;
  recoveryEmail: boolean; recipients: string[]; revision: string; updatedAt?:string;
};
export type EmailAlertDelivery = { id:string; kind:"unavailable"|"recovery"|"test"|"manual"; status:string; screenCount:number; startedAt:string; finishedAt:string|null; errorCode:string|null };
export type ManualAlertPreview = { screenCount:number; recipientCount:number; confirmationToken:string };
export type EmailAlertSnapshot = { settings:EmailAlertSettings; sender:{configured:boolean; address:string|null}; deliveries:EmailAlertDelivery[] };
export class EmailAlertInputError extends Error {}
export function validEmail(value:unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value) && !value.split("@")[0].includes("..") && !value.startsWith(".") && !value.split("@")[0].endsWith(".");
}
export function parseEmailAlertSettings(body:Record<string,unknown>):EmailAlertSettings {
  if (typeof body.enabled !== "boolean" || typeof body.recoveryEmail !== "boolean") throw new EmailAlertInputError("Choose valid alert options.");
  if (!Number.isInteger(body.thresholdMinutes) || Number(body.thresholdMinutes)<1 || Number(body.thresholdMinutes)>1440) throw new EmailAlertInputError("Alert duration must be between 1 and 1440 minutes.");
  if (!Number.isInteger(body.groupingMinutes) || Number(body.groupingMinutes)<1 || Number(body.groupingMinutes)>60) throw new EmailAlertInputError("Grouping time must be between 1 and 60 minutes.");
  if (!Array.isArray(body.recipients) || body.recipients.length>20) throw new EmailAlertInputError("Add up to 20 recipient email addresses.");
  const recipients:string[]=[];
  for (const item of body.recipients) {
    if (typeof item !== "string" || !validEmail(item.trim())) throw new EmailAlertInputError("Enter valid recipient email addresses.");
    const email=item.trim();
    if (recipients.some(existing=>existing.toLowerCase()===email.toLowerCase())) throw new EmailAlertInputError("Remove duplicate recipient email addresses.");
    recipients.push(email);
  }
  if (body.enabled && !recipients.length) throw new EmailAlertInputError("Add at least one recipient before enabling alerts.");
  if (typeof body.revision!=="string" || !/^[a-f0-9-]{36}$/i.test(body.revision)) throw new EmailAlertInputError("Reload the alert settings and try again.");
  return {enabled:body.enabled,thresholdMinutes:Number(body.thresholdMinutes),groupingMinutes:Number(body.groupingMinutes),recoveryEmail:body.recoveryEmail,recipients,revision:body.revision};
}
export const deliveryErrorMessages:Record<string,string> = {
  authentication:"Gmail authentication failed. Check the server credentials.",
  connection:"Could not connect to the mail server.",
  rejected:"The mail server rejected the message.",
  uncertain:"Delivery could not be confirmed. Check recipients’ inboxes before resending.",
  partial:"Some recipients were rejected. Accepted recipients were sent the message.",
  configuration:"The sender is not configured.",
};
