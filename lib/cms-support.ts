// Shared CMS record types and validation. Playback is explicitly confirmed by staff.
export const cmsStatuses = {
  network: ["Not checked", "Online", "Offline", "Unstable"],
  scheduling: ["Pending", "Scheduled", "Failed", "Not required"],
  playback: ["Not verified", "Verified", "Issue", "Not applicable"],
} as const;
export type CmsStatusKind = keyof typeof cmsStatuses;
export type CmsScreen = { screenId: string; screenName: string; location: string; region: string; country: string; network: string; scheduling: string; playback: string; checkedAt: string; remarks: string };
export type CmsDetails = { contentName: string; campaignName: string; category: string; receivedAt: string; missingReceivedAt: string; scheduledAt: string; playbackStart: string; playbackEnd: string; approvedBy: string; resizedBy: string; remarks: string; internalNotes: string; videoUrl: string };
export type CmsPayload = CmsDetails & { screens: CmsScreen[] };
export type CmsRecord = { id: string; version: string; payload: CmsPayload; hasImage: boolean; createdAt: string; updatedAt: string; updatedBy: string; reports: { id: string; revision: number; createdAt: string; createdBy: string }[] };
export const cmsEmptyDetails: CmsDetails = { contentName: "", campaignName: "", category: "", receivedAt: "", missingReceivedAt: "", scheduledAt: "", playbackStart: "", playbackEnd: "", approvedBy: "", resizedBy: "", remarks: "", internalNotes: "", videoUrl: "" };
export const cmsScreenLimit = 500;
export function cmsImageMime(name: string, type: string): string {
  if (["image/jpeg", "image/png", "image/webp"].includes(type)) return type;
  if (type && type !== "application/octet-stream") return "";
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[name.split(".").pop()?.toLowerCase() || ""] || "";
}
export const cmsId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export function cmsText(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value) || (required && !value.trim())) throw new Error(`${label}: ${required ? "enter a value, " : "use "}up to ${max} characters without line breaks.`);
  return value.trim();
}
// Existing records omit this optional field; never fetch remote video on the server.
export function cmsVideoUrl(value: unknown): string {
  const raw = cmsText(value === undefined ? "" : value, "Content video URL", 4096);
  if (!raw) return "";
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Enter a complete HTTP or HTTPS video URL."); }
  if (!/^https?:\/\//i.test(raw) || !["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password || raw.includes("\\")) throw new Error("Use an HTTP or HTTPS video URL without embedded login details.");
  return raw;
}
function timestamp(value: unknown, label: string, required = false): string {
  if (value === "" && !required) return "";
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`Enter a valid ${label} with time zone.`);
  day(value.slice(0, 10));
  return new Date(value).toISOString();
}
function day(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1970-01-01" || value > "9998-12-31" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error("Enter valid playback start and end dates.");
  return value;
}
type Inventory = { id: string; type: string; name: string; parentId: string | null };
export function parseCmsPayload(input: unknown, inventory: Inventory[], previous?: CmsPayload): CmsPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Enter content update details.");
  const v = input as Record<string, unknown>;
  const details: CmsDetails = {
    contentName: cmsText(v.contentName, "Content name", 160, true), campaignName: cmsText(v.campaignName, "Campaign name", 160), category: cmsText(v.category, "Screen category", 100, true),
    receivedAt: timestamp(v.receivedAt, "received date and time", true), missingReceivedAt: timestamp(v.missingReceivedAt, "missing files received time"), scheduledAt: timestamp(v.scheduledAt, "scheduled time"),
    playbackStart: day(v.playbackStart), playbackEnd: day(v.playbackEnd), approvedBy: cmsText(v.approvedBy, "Approved by", 120), resizedBy: cmsText(v.resizedBy, "Resized by", 120), remarks: cmsText(v.remarks, "Client remarks", 600), internalNotes: cmsText(v.internalNotes, "Internal notes", 1000), videoUrl: cmsVideoUrl(v.videoUrl),
  };
  if (details.playbackEnd < details.playbackStart) throw new Error("Playback end must be on or after its start.");
  if (details.missingReceivedAt && details.missingReceivedAt < details.receivedAt) throw new Error("Missing files received time cannot precede the original received time.");
  if (!Array.isArray(v.screens) || !v.screens.length || v.screens.length > cmsScreenLimit) throw new Error(`Select 1 to ${cmsScreenLimit} screens.`);
  const byId = new Map(inventory.map(item => [item.id, item]));
  const prior = new Map(previous?.screens.map(item => [item.screenId, item]));
  const seen = new Set<string>();
  const screens = v.screens.map((value: unknown): CmsScreen => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid screen details.");
    const item = value as Record<string, unknown>;
    if (typeof item.screenId !== "string" || !item.screenId || item.screenId.length > 256 || seen.has(item.screenId)) throw new Error("Choose distinct screens.");
    seen.add(item.screenId);
    const old = prior.get(item.screenId), screen = byId.get(item.screenId), location = byId.get(screen?.parentId || ""), region = byId.get(location?.parentId || ""), country = byId.get(region?.parentId || "");
    if (!old && (screen?.type !== "screen" || location?.type !== "store" || region?.type !== "region" || country?.type !== "country")) throw new Error("A selected screen is no longer available. Refresh the inventory.");
    for (const kind of Object.keys(cmsStatuses) as CmsStatusKind[]) if (!(cmsStatuses[kind] as readonly unknown[]).includes(item[kind])) throw new Error(`Choose a valid ${kind} status.`);
    const checkedAt = timestamp(item.checkedAt, "playback verification time");
    if (item.playback === "Verified" && !checkedAt) throw new Error("Add a verification time for each verified playback result.");
    if (item.scheduling === "Scheduled" && !details.scheduledAt) throw new Error("Add the scheduling completion date and time.");
    return { screenId: item.screenId, screenName: old?.screenName || screen!.name, location: old?.location || location!.name, region: old?.region || region!.name, country: old?.country || country!.name, network: String(item.network), scheduling: String(item.scheduling), playback: String(item.playback), checkedAt, remarks: cmsText(item.remarks, "Screen remarks", 300) };
  });
  screens.sort((a, b) => `${a.country}\0${a.region}\0${a.location}\0${a.screenName}\0${a.screenId}`.localeCompare(`${b.country}\0${b.region}\0${b.location}\0${b.screenName}\0${b.screenId}`, "en"));
  return { ...details, screens };
}
export function cmsTime(value: string) {
  return value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " GST" : "Not recorded";
}
