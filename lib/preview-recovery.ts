// OnSign owns the cross-origin preview and does not expose frame freshness.
// Renew its connection periodically, rather than claiming we can detect a stall.
export const PREVIEW_RENEWAL_MS = 5 * 60 * 1000;
const RESUME_AFTER_MS = 15 * 1000;

export function isOnSignEmbed(url: string) {
  try {
    const source = new URL(url);
    return source.protocol === "https:" && source.hostname === "app.onsign.tv" && source.pathname.startsWith("/embed/");
  } catch { return false; }
}

export function previewStagger(id: string) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 30000;
}

type RecoveryWindow = Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout">;
type RecoveryDocument = Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
export function startPreviewRecovery(reconnect: () => void, browser: RecoveryWindow, document: RecoveryDocument, staggerMs: number, now = Date.now) {
  let stopped = false;
  let renewalTimer: number;
  let recoveryTimer: number | undefined;
  let hiddenAt: number | null = document.visibilityState === "hidden" ? now() : null;
  const renewLater = () => {
    browser.clearTimeout(renewalTimer);
    renewalTimer = browser.setTimeout(() => {
      if (stopped) return;
      if (document.visibilityState === "visible") reconnect();
      renewLater();
    }, PREVIEW_RENEWAL_MS + staggerMs);
  };
  const recover = () => {
    if (stopped || document.visibilityState !== "visible" || recoveryTimer !== undefined) return;
    // Spread recovery requests across visible cards after a network interruption.
    recoveryTimer = browser.setTimeout(() => {
      recoveryTimer = undefined;
      if (stopped || document.visibilityState !== "visible") return;
      reconnect();
      renewLater();
    }, staggerMs / 10);
  };
  const visibility = () => {
    if (document.visibilityState === "hidden") hiddenAt = now();
    else {
      if (hiddenAt !== null && now() - hiddenAt >= RESUME_AFTER_MS) recover();
      hiddenAt = null;
    }
  };
  renewLater();
  browser.addEventListener("online", recover);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    stopped = true;
    browser.clearTimeout(renewalTimer);
    if (recoveryTimer !== undefined) browser.clearTimeout(recoveryTimer);
    browser.removeEventListener("online", recover);
    document.removeEventListener("visibilitychange", visibility);
  };
}
