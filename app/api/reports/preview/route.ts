import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { fetchPreviewReport, parsePreviewReportQuery, PreviewReportQueryError } from "@/lib/preview-report";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export async function GET(request:NextRequest) {
  const headers = {"Cache-Control":"no-store",Vary:"Cookie"};
  try {
    const user = await currentUser(request.headers);
    if (!user) return NextResponse.json({error:"Sign in again."},{status:401,headers});
    if (user.role !== "admin") return NextResponse.json({error:"Admin access required."},{status:403,headers});
    const filters = parsePreviewReportQuery(request.nextUrl.searchParams);
    return NextResponse.json(await fetchPreviewReport(filters),{headers});
  } catch (error) {
    if (error instanceof PreviewReportQueryError) return NextResponse.json({error:error.message},{status:400,headers});
    return requestFailure(error);
  }
}
