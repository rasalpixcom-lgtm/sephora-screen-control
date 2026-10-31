import type { Entity, Member } from "./store";

type Item = Pick<Entity, "id" | "name">;
export type CmsInventoryScreen = { screen: Item; location?: Item; region?: Item; country?: Item };
export type CmsScreenFilters = { search: string; country: string; region: string; location: string; group: string };

export function cmsScreenOptions(inventory: CmsInventoryScreen[], members: Member[], filters: CmsScreenFilters) {
  const groupIds = filters.group ? new Set(members.filter(member => member.groupId === filters.group).map(member => member.screenId)) : null;
  const search = filters.search.trim().toLowerCase();
  return inventory.filter(row =>
    (!groupIds || groupIds.has(row.screen.id)) &&
    (!filters.country || row.country?.id === filters.country) &&
    (!filters.region || row.region?.id === filters.region) &&
    (!filters.location || row.location?.id === filters.location) &&
    `${row.screen.name} ${row.location?.name || ""} ${row.region?.name || ""} ${row.country?.name || ""}`.toLowerCase().includes(search),
  );
}

export function cmsAdditionalScreens<T extends CmsInventoryScreen>(inventory: T[], selectedIds: Iterable<string>, requestedIds: Iterable<string>): T[] {
  const selected = new Set(selectedIds), requested = new Set(requestedIds);
  return inventory.filter(row => {
    if (!requested.has(row.screen.id) || selected.has(row.screen.id)) return false;
    selected.add(row.screen.id);
    return true;
  });
}

// Search only the displayed results; retain the complete saved/draft screen list.
export function cmsResultScreens<T extends { screenName: string; location: string; region: string; country: string }>(screens: T[], search: string): T[] {
  const query = search.trim().toLowerCase();
  return query ? screens.filter(row => [row.screenName, row.location, row.region, row.country].some(value => value.toLowerCase().includes(query))) : screens;
}

export function cmsVisibleMarkedIds(screens: { screenId: string }[], marked: string[]): string[] {
  const visible = new Set(screens.map(row => row.screenId));
  return [...new Set(marked)].filter(id => visible.has(id));
}
