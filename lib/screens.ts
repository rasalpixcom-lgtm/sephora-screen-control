import type { Display, Entity, Member, Selection } from "@/lib/store";

export function screensFor(state: { entities: Entity[]; members: Member[]; display: Display }, selection: Selection) {
  const byId = new Map(state.entities.map((item) => [item.id, item]));
  const groupScreens = selection.groupId ? new Set(state.members.filter((member) => member.groupId === selection.groupId).map((member) => member.screenId)) : null;
  const selectedScreens = selection.screenIds?.length ? new Set(selection.screenIds) : null;
  return state.entities.filter((item) => {
    if (item.type !== "screen") return false;
    const location = byId.get(item.parentId || "");
    const region = byId.get(location?.parentId || "");
    if (selection.countryId && region?.parentId !== selection.countryId) return false;
    if (selection.regionId && region?.id !== selection.regionId) return false;
    if (selection.storeId && location?.id !== selection.storeId) return false;
    if (groupScreens && !groupScreens.has(item.id)) return false;
    if (selectedScreens && !selectedScreens.has(item.id)) return false;
    return true;
  });
}
