import type { OnSignValue } from "./onsign-api-shared";

export function safeOnSignDownload(value: OnSignValue | undefined): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

// Only media returned in the documented playable positions can become links.
// In particular, trigger playLink URLs must never become download actions.
export function onSignMediaLinks(item: Record<string, OnSignValue>) {
  const candidates: OnSignValue[] = [item.node];
  if (Array.isArray(item.actions)) for (const action of item.actions) {
    if (action && typeof action === "object" && !Array.isArray(action)) candidates.push(action.content);
  }
  const links: { name: string; url: string }[] = [];
  for (const content of candidates) {
    if (!content || typeof content !== "object" || Array.isArray(content) || content.__typename !== "Content") continue;
    const url = safeOnSignDownload(content.downloadURL);
    if (url && !links.some(link => link.url === url)) links.push({ name: typeof content.name === "string" && content.name ? content.name : "Media file", url });
  }
  return links;
}
