export const cmsPlaybackStatuses = ["Upcoming", "Active", "Expired"] as const;
export type CmsPlaybackStatus = typeof cmsPlaybackStatuses[number];

// GST is UTC+4 throughout the year. Compare calendar dates, including the whole end date.
export function cmsPlaybackDay(now = new Date()): string {
  return new Date(now.getTime() + 4 * 3600000).toISOString().slice(0, 10);
}
