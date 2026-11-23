import type { Entity } from "@/lib/store";

export function groupAssignmentRows(entities: readonly Entity[], query: string) {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const search = query.trim().toLowerCase();
  return entities.filter(entity => entity.type === "screen").map(screen => {
    const store = screen.parentId ? byId.get(screen.parentId) : undefined;
    const region = store?.parentId ? byId.get(store.parentId) : undefined;
    const country = region?.parentId ? byId.get(region.parentId) : undefined;
    const location = [store?.name, region?.name, country?.name].filter(Boolean).join(" · ");
    return { screen, location };
  }).filter(({ screen, location }) => `${screen.name} ${location}`.toLowerCase().includes(search));
}

export function setMatchingGroupScreens(selected: ReadonlySet<string>, screenIds: readonly string[], enabled: boolean) {
  const next = new Set(selected);
  for (const id of screenIds) {
    if (enabled) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function sameGroupScreenSelection(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every(id => right.has(id));
}
