export const screenPhotoLimit = 5 * 1024 * 1024;
export const screenPhotoTypes = ["image/jpeg", "image/png", "image/webp"];
export function screenPhotoUrl(screenId: string, key: string, thumbnail = true) {
  return `/api/screen-photo?${new URLSearchParams({ screenId, v: key, size: thumbnail ? "thumbnail" : "full" })}`;
}
