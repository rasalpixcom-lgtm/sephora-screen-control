import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { database } from "@/lib/database";
import type { Entity } from "@/lib/store";
import { screenInventoryRows, screenReportDay, type ScreenInventoryFilters } from "@/lib/screen-inventory-report";
import { renderScreenInventoryPdf } from "@/lib/screen-inventory-pdf";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store", Vary: "Cookie" };
  try {
    const user = await currentUser(request.headers);
    if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401, headers });
    if (user.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403, headers });
    const params = request.nextUrl.searchParams;
    const filters: ScreenInventoryFilters = { search: params.get("search") || "", countryId: params.get("countryId") || "", regionId: params.get("regionId") || "", storeId: params.get("storeId") || "" };
    if (filters.search.length > 200 || [filters.countryId, filters.regionId, filters.storeId].some(value => value.length > 200)) return NextResponse.json({ error: "Invalid report filters." }, { status: 400, headers });
    const { results: entities } = await database().prepare("SELECT id, type, name, short_name AS \"shortName\", onsign_player_id AS \"onsignPlayerId\", photo_key AS \"photoKey\", parent_id AS \"parentId\", live_url AS \"liveUrl\", is_demo AS \"isDemo\", created_at AS \"createdAt\" FROM entities ORDER BY created_at, name").all<Entity>();
    const rows = screenInventoryRows(entities, filters);
    const name = (id: string) => entities.find(entity => entity.id === id)?.name;
    const generatedAt = new Date();
    const pdf = await renderScreenInventoryPdf(rows, filters, { country: name(filters.countryId), region: name(filters.regionId), location: name(filters.storeId) }, generatedAt);
    const day = screenReportDay(generatedAt);
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="screens-report-${day}.pdf"`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return requestFailure(error); }
}
