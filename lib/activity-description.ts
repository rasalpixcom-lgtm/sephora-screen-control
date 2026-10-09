import type { Entity, Selection } from "./store";
export function wallActivityDescription(selection:Selection, entities:Entity[], autoAdvance:boolean, interval:number) {
  const name = (id:string | undefined) => entities.find(entity=>entity.id===id)?.name;
  const scope = [name(selection.countryId),name(selection.regionId),name(selection.storeId),selection.groupId ? `Group: ${name(selection.groupId)}` : null].filter(Boolean).join(" / ") || "All locations";
  const selected = selection.screenIds?.length ? ` · ${selection.screenIds.slice(0,3).map(id=>name(id)).filter(Boolean).join(", ")}${selection.screenIds.length>3 ? ` +${selection.screenIds.length-3} more` : ""}` : "";
  return `${scope}${selected} · ${autoAdvance ? `Rotation every ${interval}s` : "Rotation paused"}`;
}
