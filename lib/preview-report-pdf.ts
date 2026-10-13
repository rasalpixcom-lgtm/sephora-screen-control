import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { PreviewReportFilters } from "./preview-report";
import { thresholdLabel, type PreviewReportRow } from "./preview-report-shared";

type Report = { entries:PreviewReportRow[]; total:number; generatedAt:string; truncated:boolean; filterNames?:string[] };
const GST = { timeZone:"Asia/Dubai", dateStyle:"medium", timeStyle:"short" } as const;
const colors = { ink:"#14201d", muted:"#66736e", line:"#d9e1dd", soft:"#f0f5f2", accent:"#238767", warning:"#a43f4c" };

function reportFont() {
  const candidates = [
    path.join(process.cwd(), "report-font.ttf"),
    path.join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf"),
    path.join(process.cwd(), ".next", "standalone", "report-font.ttf"),
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}
function durationText(start:string, end:string) {
  const minutes = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${mins}m`].filter(Boolean).join(" ");
}
function dateText(value:string | null) { return value ? new Date(value).toLocaleString("en-GB", GST) : "No successful preview recorded"; }

export async function renderPreviewReportPdf(report:Report, filters:PreviewReportFilters) {
  const doc = new PDFDocument({ size:"A4", layout:"landscape", margins:{top:36,right:36,bottom:42,left:36}, bufferPages:true, info:{Title:"Preview availability report", Author:"Sephora Screen Control"} });
  const chunks:Buffer[] = [];
  doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<Buffer>((resolve,reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const font = reportFont();
  if (font) { doc.registerFont("Report", font); doc.font("Report"); }
  const regular = font ? "Report" : "Helvetica";
  const bold = "Helvetica-Bold";
  const left = 36, width = doc.page.width - 72;
  const cols = [38, 175, 190, 100, 130, width - 633];
  const headers = ["S.No.", "Screen", "Location", "Unavailable duration", "Unavailable since", "Last check"];
  const logo = path.join(process.cwd(), "public", "images", "pixcom-report-logo.png");
  const filterParts = [
    filters.upperThreshold !== undefined
      ? `Unavailable for ${thresholdLabel(filters.threshold)} to under ${thresholdLabel(filters.upperThreshold)}`
      : `Unavailable for at least ${thresholdLabel(filters.threshold)}`,
    filters.q ? `Search: ${filters.q}` : "",
    ...(report.filterNames || []),
  ].filter(Boolean);

  const header = () => {
    // Clip the supplied square artwork's white margins without altering the logo asset.
    const logoWidth = 150, logoScale = logoWidth / 1228;
    doc.save().rect(left + width - logoWidth, 34, logoWidth, 48).clip();
    doc.image(logo, left + width - logoWidth - 136 * logoScale, 34 - 560 * logoScale, {width:1500 * logoScale});
    doc.restore();
    doc.fillColor(colors.accent).rect(left, 34, 4, 28).fill();
    doc.font(bold).fontSize(19).fillColor(colors.ink).text("Preview availability report", left + 14, 34, {width:width-184});
    doc.font(regular).fontSize(9).fillColor(colors.muted).text(filterParts.join("  |  "), left + 14, 58, {width:width-184});
    const metaY = Math.max(82, doc.y + 8);
    doc.text(`Generated ${dateText(report.generatedAt)} GST`, left + 14, metaY);
    doc.font(bold).fillColor(colors.ink).text(`${report.total} ${report.total === 1 ? "screen" : "screens"}`, left + 14, metaY+15);
    const tableY = metaY + 36;
    let x = left;
    doc.fillColor(colors.soft).rect(left, tableY, width, 34).fill();
    headers.forEach((label,index) => { doc.font(bold).fontSize(8).fillColor(colors.ink).text(label, x + 7, tableY+8, {width:cols[index]-14, lineGap:1, align:index === 3 ? "center" : "left"}); x += cols[index]; });
    return tableY+34;
  };
  let y = header();
  for (const [rowIndex, row] of report.entries.entries()) {
    const location = `${row.locationName} / ${row.regionName} / ${row.countryName}`;
    const delayed = Date.parse(report.generatedAt) - Date.parse(row.lastCheckedAt) > 300000;
    const values = [String(rowIndex+1), row.screenName, location, durationText(row.unavailableSince, report.generatedAt), dateText(row.unavailableSince), dateText(row.lastCheckedAt)+(delayed?"\nVerification delayed":"")];
    const rowHeight = Math.max(40,...values.map((value,index)=>doc.font(index === 1 ? bold : regular).fontSize(8.2).heightOfString(value,{width:cols[index]-14,lineGap:1})+16));
    if (y + rowHeight > doc.page.height - 70) { doc.addPage(); y = header(); }
    let x = left;
    doc.strokeColor(colors.line).moveTo(left,y+rowHeight-1).lineTo(left+width,y+rowHeight-1).stroke();
    values.forEach((value,index) => {
      doc.font(index === 1 ? bold : regular).fontSize(8.2).fillColor(index === 3 ? colors.warning : colors.ink)
        .text(value, x+7, y+8, {width:cols[index]-14,lineGap:1,align:index === 3 ? "center" : "left"});
      x += cols[index];
    });
    y += rowHeight;
  }
  if (!report.entries.length) {
    doc.font(regular).fontSize(11).fillColor(colors.muted).text("No screens match this report.", left, y+26, {width,align:"center"});
  }
  if (report.truncated) doc.font(regular).fontSize(8).fillColor(colors.warning).text("The PDF is limited to the first 5,000 matching screens.", left, doc.page.height-62);
  const range = doc.bufferedPageRange();
  for (let index=0; index<range.count; index++) {
    doc.switchToPage(index);
    doc.page.margins.bottom = 12;
    const footerY = doc.page.height - 27;
    doc.font(regular).fontSize(7.5).fillColor(colors.muted)
      .text("A preview issue means no image was received by Screen Control. It does not by itself confirm that the physical player is offline.", left, footerY, {width:width-90,lineBreak:false,ellipsis:true})
      .text(`Page ${index+1} of ${range.count}`, left+width-80, footerY, {width:80,align:"right",lineBreak:false});
  }
  doc.end();
  return finished;
}
