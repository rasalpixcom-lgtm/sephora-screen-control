import { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { database } from "@/lib/database";
import { cmsId, type CmsPayload } from "@/lib/cms-support";
import { renderCmsPdf } from "@/lib/cms-pdf";
import { RequestError, requestFailure } from "@/lib/request";
import { cmsResultFilterDescription, filterCmsResults, parseCmsResultFilters } from "@/lib/cms-result-filters";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request.headers);
    if (!user) throw new RequestError("Sign in again.", 401);
    if (user.role !== "admin") throw new RequestError("Admin access required.", 403);
    const reportId = request.nextUrl.searchParams.get("reportId"), id = request.nextUrl.searchParams.get("id");
    const params = request.nextUrl.searchParams;
    const filtered = params.get("filtered") === "1";
    const hasSelection = ["filtered", "search", "network", "scheduling", "playback", "version"].some(key => params.has(key));
    if (hasSelection && (!filtered || reportId)) throw new RequestError("Use a saved content update for a filtered export.");
    let pdf: Buffer, filename: string;
    if (reportId) {
      if (!cmsId(reportId)) throw new RequestError("Invalid report reference.");
      const report = await database().prepare("SELECT pdf, revision, update_id FROM cms_reports WHERE id = ?").bind(reportId).first<{ pdf: Buffer; revision: number; update_id: string }>();
      if (!report) throw new RequestError("Report not found.", 404);
      pdf = report.pdf; filename = `cms-${report.update_id.slice(0, 8)}-r${report.revision}.pdf`;
    } else {
      if (!cmsId(id)) throw new RequestError("Choose a content update.");
      const row = await database().prepare("SELECT payload, image, version FROM cms_updates WHERE id = ?").bind(id).first<{ payload: CmsPayload; image: Buffer | null; version: string }>();
      if (!row) throw new RequestError("Content update not found.", 404);
      let payload = row.payload, selection;
      if (filtered) {
        if (params.get("version") !== row.version) throw new RequestError("This update has changed. Refresh it before exporting.", 409);
        let filters;
        try { filters = parseCmsResultFilters(params); } catch (error) { throw new RequestError(error instanceof Error ? error.message : "Invalid filters."); }
        const screens = filterCmsResults(payload.screens, filters);
        if (!screens.length) throw new RequestError("No screens match these filters.");
        selection = { description: cmsResultFilterDescription(filters), total: payload.screens.length };
        payload = { ...payload, screens };
      }
      pdf = await renderCmsPdf(payload, row.image, `CMS-${id.slice(0, 8).toUpperCase()}`, new Date().toISOString(), true, selection);
      filename = `cms-${id.slice(0, 8)}-${filtered ? "filtered" : "draft"}.pdf`;
    }
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${reportId ? "attachment" : "inline"}; filename="${filename}"`, "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return requestFailure(error); }
}
