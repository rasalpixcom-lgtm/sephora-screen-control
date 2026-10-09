import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { database, type Activity } from "@/lib/store";
import { ACTIVITY_PAGE_SIZE, ActivityQueryError, parseActivityQuery } from "@/lib/activity-query";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser(request.headers);
    if (!user) return NextResponse.json({ error: "Sign in again." }, { status:401, headers:{"Cache-Control":"no-store"} });
    if (user.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status:403, headers:{"Cache-Control":"no-store"} });
    const query = parseActivityQuery(request.nextUrl.searchParams);
    const result = await database().transaction(async db => {
      // Count and page must describe the same snapshot when new events arrive.
      await db.prepare("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY").run();
      const count = await db.prepare(`SELECT COUNT(*)::integer AS total FROM activity_log ${query.where}`).bind(...query.values).first<{total:number}>();
      const total = count?.total || 0;
      const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
      const page = Math.min(query.page, pages);
      const rows = await db.prepare(`SELECT id, action, entity_type AS "entityType", entity_id AS "entityId", entity_name AS "entityName", actor, created_at AS "createdAt" FROM activity_log ${query.where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...query.values, ACTIVITY_PAGE_SIZE, (page - 1) * ACTIVITY_PAGE_SIZE).all<Activity>();
      return { entries:rows.results, total, page, pages, pageSize:ACTIVITY_PAGE_SIZE };
    });
    return NextResponse.json(result, { headers:{"Cache-Control":"no-store"} });
  } catch (error) {
    if (error instanceof ActivityQueryError) return NextResponse.json({error:error.message}, {status:400, headers:{"Cache-Control":"no-store"}});
    return requestFailure(error);
  }
}
