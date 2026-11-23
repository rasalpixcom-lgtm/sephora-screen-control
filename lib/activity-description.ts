import type { Entity, Selection } from "./store";
export function wallActivityDescription(selection:Selection, entities:Entity[], autoAdvance:boolean, interval:number) {
  const name = (id:string | undefined) => entities.find(entity=>entity.id===id)?.name;
  const scope = [name(selection.countryId),name(selection.regionId),name(selection.storeId),selection.groupId ? `Group: ${name(selection.groupId)}` : null].filter(Boolean).join(" / ") || "All locations";
  let selected = "";
  if (selection.screenIds === null) selected = " · No screens selected";
  else if (selection.screenIds?.length) {
    const names = selection.screenIds.slice(0, 3).map(name).filter(Boolean).join(", ");
    const more = selection.screenIds.length > 3 ? ` +${selection.screenIds.length - 3} more` : "";
    selected = ` · ${names}${more}`;
  }
  return `${scope}${selected} · ${autoAdvance ? `Rotation every ${interval}s` : "Rotation paused"}`;
}
