import type { Entity } from "./store";

type Filters = { country: string; region: string; location: string };

// Refreshes can remove or move a selected parent while a Controller is open.
export function validLocationFilters(entities: Pick<Entity, "id" | "type" | "parentId">[], filters: Filters): Filters {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const country = byId.get(filters.country);
  if (filters.country && country?.type !== "country") return { country: "", region: "", location: "" };
  const region = byId.get(filters.region);
  if (filters.region && (region?.type !== "region" || filters.country && region.parentId !== filters.country)) {
    return { country: filters.country, region: "", location: "" };
  }
  const location = byId.get(filters.location);
  const validLocation = location?.type === "store"
    && (!filters.region || location.parentId === filters.region)
    && (!filters.country || byId.get(location.parentId || "")?.parentId === filters.country);
  return { country: filters.country, region: filters.region, location: validLocation ? filters.location : "" };
}

// Count saved locations even when they do not contain any screens.
export function locationCountsByCountry(entities: Pick<Entity, "id" | "type" | "parentId">[]) {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const counts = new Map(entities.filter(entity => entity.type === "country").map(country => [country.id, 0]));
  for (const location of entities) {
    if (location.type !== "store") continue;
    const region = byId.get(location.parentId || "");
    if (region?.type !== "region" || !region.parentId || !counts.has(region.parentId)) continue;
    counts.set(region.parentId, counts.get(region.parentId)! + 1);
  }
  return counts;
}

export function locationCountsByRegion(entities: Pick<Entity, "id" | "type" | "parentId">[]) {
  const counts = new Map(entities.filter(entity => entity.type === "region").map(region => [region.id, 0]));
  for (const location of entities) {
    if (location.type === "store" && location.parentId && counts.has(location.parentId)) {
      counts.set(location.parentId, counts.get(location.parentId)! + 1);
    }
  }
  return counts;
}
