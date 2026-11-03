export const screenTypes = ["LED", "LCD", "Video Wall"] as const;
export type ScreenType = typeof screenTypes[number];
export function isScreenType(value: unknown): value is ScreenType {
  return typeof value === "string" && screenTypes.some(type => type === value);
}
