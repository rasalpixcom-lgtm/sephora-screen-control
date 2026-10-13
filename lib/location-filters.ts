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
