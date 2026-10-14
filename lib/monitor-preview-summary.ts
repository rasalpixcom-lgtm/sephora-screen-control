import type { Entity } from "./store";
import type { PreviewHealth } from "./preview-health";
import { onSignToken } from "./onsign-stream";

export type PreviewCounts = { total: number; previewing: number; unavailable: number; checking: number; noLink: number; unsupported: number };
export type MonitorPreviewSummary = {
  counts: PreviewCounts;
  countries: { id: string; name: string; shortName?: string | null; counts: PreviewCounts }[];
};
const emptyCounts = (): PreviewCounts => ({ total: 0, previewing: 0, unavailable: 0, checking: 0, noLink: 0, unsupported: 0 });

// Accept the full selected set, never just the currently visible rotation page.
export function monitorPreviewSummary(screens: Entity[], entities: Entity[], checks: PreviewHealth[], checksUnavailable = false): MonitorPreviewSummary {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const byScreen = new Map(checks.map(check => [check.screenId, check]));
  const counts = emptyCounts();
  const countries = new Map<string, { id: string; name: string; shortName?: string | null; counts: PreviewCounts }>();
  for (const screen of screens) {
    const location = byId.get(screen.parentId || "");
    const region = byId.get(location?.parentId || "");
    const country = byId.get(region?.parentId || "");
    const id = country?.id || "unassigned";
    let countryCounts = countries.get(id);
    if (!countryCounts) {
      countryCounts = { id, name: country?.name || "Unassigned", shortName: country?.shortName || null, counts: emptyCounts() };
      countries.set(id, countryCounts);
    }
    const status = !screen.liveUrl ? "no_link" : !onSignToken(screen.liveUrl) ? "unsupported" : checksUnavailable ? "unknown" : byScreen.get(screen.id)?.status;
    const field = status === "available" ? "previewing" : status === "unavailable" ? "unavailable" : status === "no_link" ? "noLink" : status === "unsupported" ? "unsupported" : "checking";
    counts.total++; counts[field]++;
    countryCounts.counts.total++; countryCounts.counts[field]++;
  }
  return { counts, countries: [...countries.values()].sort((a, b) => a.name.localeCompare(b.name, "en")) };
}
