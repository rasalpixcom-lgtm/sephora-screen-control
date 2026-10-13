import { database } from "./database";
import { REPORT_DURATION_OPTIONS, REPORT_THRESHOLDS, type PreviewReportRow, type ReportThreshold } from "./preview-report-shared";

export const REPORT_PAGE_SIZE = 25;
export type PreviewReportFilters = { threshold:ReportThreshold; upperThreshold?:number; countryId:string; regionId:string; locationId:string; q:string; page:number };

export class PreviewReportQueryError extends Error {}

export function parsePreviewReportQuery(params:URLSearchParams):PreviewReportFilters {
  const duration = params.get("duration");
  const selected = duration === null ? undefined : REPORT_DURATION_OPTIONS.find(option=>option.id===duration);
  if(duration !== null && !selected) throw new PreviewReportQueryError("Choose a valid unavailable duration.");
  // Retain threshold-only queries for existing links; new UI queries use explicit ranges.
  const threshold = selected?.min ?? Number(params.get("threshold") || "20");
  const upperThreshold = selected && "max" in selected ? selected.max : undefined;
  if (!REPORT_THRESHOLDS.includes(threshold as ReportThreshold)) throw new PreviewReportQueryError("Choose a valid unavailable duration.");
  const pageText = params.get("page") || "1";
  if (!/^\d+$/.test(pageText) || !Number.isSafeInteger(Number(pageText)) || Number(pageText) < 1) throw new PreviewReportQueryError("Choose a valid page.");
  const cleanId = (name:string) => {
    const value = (params.get(name) || "").trim();
    if (value.length > 100) throw new PreviewReportQueryError("Choose a valid location filter.");
    return value;
  };
  const q = (params.get("q") || "").trim();
  if (q.length > 120) throw new PreviewReportQueryError("Search must be 120 characters or fewer.");
  return { threshold:threshold as ReportThreshold, upperThreshold, countryId:cleanId("countryId"), regionId:cleanId("regionId"), locationId:cleanId("locationId"), q, page:Number(pageText) };
}

function reportWhere(filters:PreviewReportFilters, generatedAt:Date) {
  const clauses = ["i.resolved_at IS NULL", "i.started_at <= ?"];
  const values:unknown[] = [new Date(generatedAt.getTime() - filters.threshold * 60000)];
  if(filters.upperThreshold !== undefined) {
    clauses.push("i.started_at > ?");
    values.push(new Date(generatedAt.getTime() - filters.upperThreshold * 60000));
  }
  if (filters.countryId) { clauses.push("country.id = ?"); values.push(filters.countryId); }
  if (filters.regionId) { clauses.push("region.id = ?"); values.push(filters.regionId); }
  if (filters.locationId) { clauses.push("location.id = ?"); values.push(filters.locationId); }
  if (filters.q) {
    const pattern = "%" + filters.q.replace(/[!%_]/g, "!$&") + "%";
    clauses.push("(screen.name ILIKE ? ESCAPE '!' OR location.name ILIKE ? ESCAPE '!' OR region.name ILIKE ? ESCAPE '!' OR country.name ILIKE ? ESCAPE '!')");
    values.push(pattern, pattern, pattern, pattern);
  }
  return { sql:"WHERE " + clauses.join(" AND "), values };
}

const reportFrom = `FROM preview_incident i
  JOIN entities screen ON screen.id = i.screen_id AND screen.type = 'screen'
  JOIN entities location ON location.id = screen.parent_id AND location.type = 'store'
  JOIN entities region ON region.id = location.parent_id AND region.type = 'region'
  JOIN entities country ON country.id = region.parent_id AND country.type = 'country'`;
const reportSelect = `SELECT i.id AS "incidentId", screen.id AS "screenId", screen.name AS "screenName",
  location.id AS "locationId", location.name AS "locationName", region.id AS "regionId", region.name AS "regionName",
  country.id AS "countryId", country.name AS "countryName", i.started_at AS "unavailableSince",
  i.last_success_at AS "lastSuccessAt", i.last_checked_at AS "lastCheckedAt"`;

export async function fetchPreviewReport(filters:PreviewReportFilters, options:{ all?:boolean; limit?:number } = {}) {
  const generatedAt = new Date();
  const where = reportWhere(filters, generatedAt);
  return database().transaction(async db => {
    await db.prepare("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY").run();
    const count = await db.prepare(`SELECT COUNT(*)::integer AS total ${reportFrom} ${where.sql}`).bind(...where.values).first<{total:number}>();
    const total = count?.total || 0;
    const filterNames: string[] = [];
    for (const id of [filters.countryId, filters.regionId, filters.locationId].filter(Boolean)) {
      const entity = await db.prepare("SELECT name FROM entities WHERE id = ?").bind(id).first<{name:string}>();
      filterNames.push(entity?.name || "Unknown location filter");
    }
    const pages = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
    const page = Math.min(filters.page, pages);
    const limit = options.all ? Math.min(options.limit || 5000, 5000) : REPORT_PAGE_SIZE;
    const offset = options.all ? 0 : (page - 1) * REPORT_PAGE_SIZE;
    const rows = await db.prepare(`${reportSelect} ${reportFrom} ${where.sql}
      ORDER BY i.started_at ASC, screen.name ASC, screen.id ASC LIMIT ? OFFSET ?`)
      .bind(...where.values, limit, offset).all<PreviewReportRow>();
    return { entries:rows.results, total, page, pages, pageSize:options.all ? limit : REPORT_PAGE_SIZE, generatedAt:generatedAt.toISOString(), truncated:!!options.all && total > limit, filterNames };
  });
}

