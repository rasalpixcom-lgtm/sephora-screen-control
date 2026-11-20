import type { Entity, Member, Selection } from "../lib/store";

export type GroupScreenFilters = { countryId: string; regionId: string; storeId: string; query: string };
export const emptyGroupScreenFilters: GroupScreenFilters = { countryId: "", regionId: "", storeId: "", query: "" };

// The dropdowns describe only places with screens in this group. Draft filters
// never mutate the shared wall selection or the underlying group membership.
export function groupScreenView(entities: Entity[], members: Member[], groupId: string, draft: GroupScreenFilters) {
  const byId = new Map(entities.map(item => [item.id, item]));
  const memberIds = new Set(members.filter(member => member.groupId === groupId).map(member => member.screenId));
  const screens = entities.filter(item => item.type === "screen" && memberIds.has(item.id));
  const places = screens.map(screen => {
    const location = byId.get(screen.parentId || "");
    const region = location?.type === "store" ? byId.get(location.parentId || "") : undefined;
    const country = region?.type === "region" ? byId.get(region.parentId || "") : undefined;
    return { screen, location: location?.type === "store" ? location : undefined, region: region?.type === "region" ? region : undefined, country: country?.type === "country" ? country : undefined };
  });
  const options = (items: (Entity | undefined)[]) => [...new Map(items.filter((item): item is Entity => !!item).map(item => [item.id, item])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id));
  const countries = options(places.map(place => place.country));
  const countryId = countries.some(item => item.id === draft.countryId) ? draft.countryId : "";
  const regions = countryId ? options(places.filter(place => place.country?.id === countryId).map(place => place.region)) : [];
  const regionId = regions.some(item => item.id === draft.regionId) ? draft.regionId : "";
  const locations = regionId ? options(places.filter(place => place.country?.id === countryId && place.region?.id === regionId).map(place => place.location)) : [];
  const storeId = locations.some(item => item.id === draft.storeId) ? draft.storeId : "";
  const query = draft.query.trim().toLowerCase();
  const matching = places.filter(place => (!countryId || place.country?.id === countryId)
    && (!regionId || place.region?.id === regionId) && (!storeId || place.location?.id === storeId)
    && [place.screen.name, place.location?.name, place.region?.name, place.country?.name].filter(Boolean).join(" ").toLowerCase().includes(query)).map(place => place.screen);
  return { screens, matching, countries, regions, locations, filters: { countryId, regionId, storeId, query: draft.query }, hasFilters: !!(countryId || regionId || storeId || query) };
}

export function filteredGroupSelection(groupId: string, screens: Pick<Entity, "id">[]): Selection | null {
  const screenIds = [...new Set(screens.map(screen => screen.id))];
  // An empty screenIds array means "all" in the existing wall API. Never send
  // it for zero matches. Keep the API's existing 500-screen selection limit.
  return screenIds.length && screenIds.length <= 500 ? { groupId, screenIds } : null;
}
