import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Entity } from "@/lib/store";
import type { ScreenInventoryFilters } from "@/lib/screen-inventory-report";

type Row = { screen: Entity; location: string; region: string; country: string };

export async function renderScreenInventoryPdf(rows: Row[], filters: ScreenInventoryFilters, filterNames: { country?: string; region?: string; location?: string } = {}, generatedAt = new Date()) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margins: { top: 36, right: 36, bottom: 40, left: 36 }, bufferPages: true, info: { Title: "Screens report", Author: "Sephora Screen Control" } });
  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const font = [path.join(process.cwd(), "report-font.ttf"), path.join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "Geist-Regular.ttf"), path.join(process.cwd(), ".next", "standalone", "report-font.ttf")].find(candidate => fs.existsSync(candidate));
  if (font) doc.registerFont("Report", font);
  const regular = font ? "Report" : "Helvetica";
  const bold = font ? "Report" : "Helvetica-Bold";
  const left = 36;
  const singleCountry = Boolean(filters.countryId);
  const columns = singleCountry ? [34, 236, 147, 104, 77, 108, 64] : [34, 207, 121, 78, 99, 74, 92, 65];
  const cellPaddingX = 7;
  const cellPaddingY = 5;
  const headings = singleCountry ? ["#", "Screen", "Location", "Region", "Preview", "OnSign player", "Photo"] : ["#", "Screen", "Location", "Region", "Country", "Preview", "OnSign player", "Photo"];
  const width = columns.reduce((sum, value) => sum + value, 0);
  const active = [`Search: ${filters.search.trim()}`, `Country: ${filterNames.country || filters.countryId}`, `Region: ${filterNames.region || filters.regionId}`, `Location: ${filterNames.location || filters.storeId}`];
  const labels = [filters.search.trim() ? active[0] : "", filters.countryId ? active[1] : "", filters.regionId ? active[2] : "", filters.storeId ? active[3] : ""].filter(Boolean);
  const filterSummary = labels.length ? labels.join("  |  ") : "All screens";
  const generated = generatedAt.toLocaleString("en-GB", { timeZone: "Asia/Dubai", dateStyle: "medium", timeStyle: "short" });
  function header() {
    doc.fillColor("#238767").rect(left, 34, 4, 29).fill();
    doc.font(bold).fontSize(19).fillColor("#14201d").text("Screens report", left + 14, 34);
    doc.font(regular).fontSize(9).fillColor("#66736e").text(filterSummary, left + 14, 62, { width: width - 14 });
    const metaY = Math.max(82, doc.y + 8);
    doc.text(`Generated ${generated} GST`, left + 14, metaY);
    doc.font(bold).fillColor("#14201d").text(`${rows.length} ${rows.length === 1 ? "screen" : "screens"}`, left + 14, metaY + 15);
    const tableY = metaY + 39;
    doc.fillColor("#f0f5f2").rect(left, tableY, width, 26).fill();
    let x = left;
    headings.forEach((heading, index) => { doc.font(bold).fontSize(8).fillColor("#14201d").text(heading, x + cellPaddingX, tableY + 8, { width: columns[index] - cellPaddingX * 2, lineBreak: false, ellipsis: true }); x += columns[index]; });
    return tableY + 26;
  }
  let y = header();
  for (const [index, row] of rows.entries()) {
    const values = [String(index + 1), row.screen.name, row.location, row.region, ...(singleCountry ? [] : [row.country]), row.screen.liveUrl ? "Saved" : "No link", row.screen.onsignPlayerId || "Not linked", row.screen.photoKey ? "Yes" : "No"];
    const rowHeight = Math.max(25, ...values.map((value, column) => doc.font(column === 1 ? bold : regular).fontSize(8).heightOfString(value, { width: columns[column] - cellPaddingX * 2 }) + cellPaddingY * 2));
    if (y + rowHeight > doc.page.height - 43) { doc.addPage(); y = header(); }
    let x = left;
    doc.strokeColor("#d9e1dd").moveTo(left, y + rowHeight - 1).lineTo(left + width, y + rowHeight - 1).stroke();
    values.forEach((value, column) => { doc.font(column === 1 ? bold : regular).fontSize(8).fillColor("#14201d").text(value, x + cellPaddingX, y + cellPaddingY, { width: columns[column] - cellPaddingX * 2 }); x += columns[column]; });
    y += rowHeight;
  }
  if (!rows.length) doc.font(regular).fontSize(11).fillColor("#66736e").text("No screens match these filters.", left, y + 25, { width, align: "center" });
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(index);
    doc.page.margins.bottom = 12;
    doc.font(regular).fontSize(7.5).fillColor("#66736e").text("Saved screen inventory · OnSign player IDs and preview status are recorded assignments, not device playback.", left, doc.page.height - 27, { width: width - 90, lineBreak: false, ellipsis: true });
    doc.text(`Page ${index + 1} of ${pages.count}`, left + width - 90, doc.page.height - 27, { width: 90, align: "right", lineBreak: false });
  }
  doc.end();
  return finished;
}
