export const screenPhotoCategories = [
  { id: "front", label: "Screen front" },
  { id: "serial", label: "Serial number labels" },
  { id: "issues", label: "Issues / damage" },
  { id: "back_cabling", label: "Back & cabling" },
  { id: "looping_diagram", label: "Looping diagram" },
  { id: "sending_card", label: "Sending card" },
  { id: "media_player", label: "Media player" },
  { id: "power_network", label: "Power & network" },
  { id: "connection_diagram", label: "Connection diagram" },
] as const;
export type ScreenPhotoCategory = typeof screenPhotoCategories[number]["id"];
export const validPhotoCategory = (value: unknown): value is ScreenPhotoCategory => screenPhotoCategories.some(category => category.id === value);
export function photoCategoryApplies(category: ScreenPhotoCategory, screenType: string | null) {
  if (["front", "serial", "issues"].includes(category)) return true;
  if (category === "connection_diagram") return screenType === "LCD";
  if (category === "back_cabling" || category === "looping_diagram") return screenType === "LED" || screenType === "Video Wall";
  return screenType === "LED";
}
export const photoCategoriesForScreen = (screenType: string | null) => screenPhotoCategories
  .filter(category => photoCategoryApplies(category.id, screenType))
  .map(category => ({ ...category, label: screenType === "Video Wall" && category.id === "looping_diagram" ? "Loop diagram" : category.label }));
export const galleryPhotoUrl = (screenId: string, category: ScreenPhotoCategory, key: string, full = false) => `/api/screen-gallery?${new URLSearchParams({ screenId, category, v: key, size: full ? "full" : "thumbnail" })}`;
