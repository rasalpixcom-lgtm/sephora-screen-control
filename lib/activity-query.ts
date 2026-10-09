export const ACTIVITY_PAGE_SIZE = 20;
export const activityActions = ["all", "created", "updated", "deleted", "wall", "other"] as const;
export type ActivityAction = typeof activityActions[number];
export class ActivityQueryError extends Error {}

export function parseActivityQuery(params: URLSearchParams) {
  const rawPage = params.get("page") || "1";
  if (!/^[1-9]\d{0,5}$/.test(rawPage)) throw new ActivityQueryError("Choose a valid page.");
  const q = (params.get("q") || "").trim();
  if (q.length > 120) throw new ActivityQueryError("Search must be 120 characters or fewer.");
  const action = params.get("action") || "all";
  if (!activityActions.includes(action as ActivityAction)) throw new ActivityQueryError("Choose a valid action filter.");
  const from = params.get("from") || "", to = params.get("to") || "";
  function day(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1970-01-01" || value > "9998-12-31") throw new ActivityQueryError("Choose a valid date.");
    const midnight = Date.parse(value + "T00:00:00Z");
    if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0,10) !== value) throw new ActivityQueryError("Choose a valid date.");
    return midnight - 4 * 60 * 60 * 1000;
  }
  const fromTime = from ? day(from) : null, toTime = to ? day(to) : null;
  if (from && to && from > to) throw new ActivityQueryError("The end date must be on or after the start date.");
  const clauses: string[] = [], values: string[] = [];
  if (q) {
    // Treat %, _ and the escape character as literal search text.
    const pattern = "%" + q.replace(/[!%_]/g, "!$&") + "%";
    clauses.push("(actor ILIKE ? ESCAPE '!' OR COALESCE(entity_name, '') ILIKE ? ESCAPE '!' OR action ILIKE ? ESCAPE '!')");
    values.push(pattern, pattern, pattern);
  }
  const categories = {
    created: "lower(action) LIKE 'created%'",
    updated: "(lower(action) LIKE 'updated%' OR lower(action) LIKE 'update %')",
    deleted: "lower(action) LIKE 'deleted%'",
    wall: "(lower(action) IN ('changed wall selection', 'changed wall settings') OR COALESCE(entity_name, '') = 'Monitoring wall')",
  };
  if (action === "other") clauses.push("NOT (" + Object.values(categories).join(" OR ") + ")");
  else if (action !== "all") clauses.push(categories[action as keyof typeof categories]);
  if (fromTime !== null) { clauses.push("created_at >= ?"); values.push(new Date(fromTime).toISOString()); }
  if (toTime !== null) { clauses.push("created_at < ?"); values.push(new Date(toTime + 86400000).toISOString()); }
  return { page: Number(rawPage), where: clauses.length ? "WHERE " + clauses.join(" AND ") : "", values };
}
