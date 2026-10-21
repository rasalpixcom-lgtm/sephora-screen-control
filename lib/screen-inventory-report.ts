import type { Entity } from "@/lib/store";

export type ScreenInventoryFilters = { countryId: string; regionId: string; storeId: string; search: string };

export function screenReportDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function screenInventoryRows(entities: Entity[], filters: ScreenInventoryFilters) {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const query = filters.search.trim().toLowerCase();
  return entities.filter(screen => {
    if (screen.type !== "screen") return false;
    const location = byId.get(screen.parentId || "");
    const region = byId.get(location?.parentId || "");
    const country = byId.get(region?.parentId || "");
    if (filters.storeId && screen.parentId !== filters.storeId) return false;
    if (filters.regionId && location?.parentId !== filters.regionId) return false;
    if (filters.countryId && region?.parentId !== filters.countryId) return false;
    return `${screen.name} ${screen.shortName || ""} ${[location?.name, region?.name, country?.name].filter(Boolean).join(" · ")}`.toLowerCase().includes(query);
  }).map(screen => {
    const location = byId.get(screen.parentId || "");
    const region = byId.get(location?.parentId || "");
    const country = byId.get(region?.parentId || "");
    return { screen, location: location?.name || "—", region: region?.name || "—", country: country?.name || "—" };
  });
}
