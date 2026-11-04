import { cmsStatuses, type CmsScreen, type CmsStatusKind } from "./cms-support";

export type CmsResultFilters = Record<CmsStatusKind, string> & { search: string };
export const emptyCmsResultFilters = (): CmsResultFilters => ({ search: "", network: "", scheduling: "", playback: "" });

export function parseCmsResultFilters(params: URLSearchParams): CmsResultFilters {
  const filters = emptyCmsResultFilters();
  filters.search = (params.get("search") || "").trim();
  if (filters.search.length > 200 || /[\u0000-\u001f\u007f]/.test(filters.search)) throw new Error("Use a search up to 200 characters without line breaks.");
  for (const kind of Object.keys(cmsStatuses) as CmsStatusKind[]) {
    filters[kind] = params.get(kind) || "";
    if (filters[kind] && !(cmsStatuses[kind] as readonly string[]).includes(filters[kind])) throw new Error(`Invalid ${kind} filter.`);
  }
  return filters;
}

export function filterCmsResults<T extends Pick<CmsScreen, "screenName" | "location" | "region" | "country" | CmsStatusKind>>(screens: T[], filters: CmsResultFilters): T[] {
  const query = filters.search.trim().toLowerCase();
  return screens.filter(row =>
    (!query || [row.screenName, row.location, row.region, row.country].some(value => value.toLowerCase().includes(query))) &&
    (Object.keys(cmsStatuses) as CmsStatusKind[]).every(kind => !filters[kind] || row[kind] === filters[kind]),
  );
}

export function cmsResultFilterDescription(filters: CmsResultFilters): string {
  return [filters.search ? `Search: ${filters.search}` : "", ...(["network", "scheduling", "playback"] as const).map(kind => filters[kind] ? `${kind[0].toUpperCase() + kind.slice(1)}: ${filters[kind]}` : "")].filter(Boolean).join(" | ") || "All screens";
}
