import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { fetchPreviewReport, parsePreviewReportQuery, PreviewReportQueryError } from "@/lib/preview-report";
import { renderPreviewReportPdf } from "@/lib/preview-report-pdf";
import { requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export async function GET(request:NextRequest) {
  const noStore = {"Cache-Control":"no-store",Vary:"Cookie"};
  try {
    const user = await currentUser(request.headers);
    if (!user) return NextResponse.json({error:"Sign in again."},{status:401,headers:noStore});
    if (user.role !== "admin") return NextResponse.json({error:"Admin access required."},{status:403,headers:noStore});
    const filters = parsePreviewReportQuery(request.nextUrl.searchParams);
    const report = await fetchPreviewReport(filters,{all:true,limit:5000});
    const pdf = await renderPreviewReportPdf(report,filters);
    const day = new Date(report.generatedAt).toISOString().slice(0,10);
    return new Response(new Uint8Array(pdf),{headers:{...noStore,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="preview-availability-${day}.pdf"`,"X-Content-Type-Options":"nosniff"}});
  } catch (error) {
    if (error instanceof PreviewReportQueryError) return NextResponse.json({error:error.message},{status:400,headers:noStore});
    return requestFailure(error);
  }
}
