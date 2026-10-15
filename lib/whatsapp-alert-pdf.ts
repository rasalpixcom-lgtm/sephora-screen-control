import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { setImmediate as yieldToServer } from "node:timers/promises";
import type { AlertMailRow } from "./alert-mail";

import { WHATSAPP_REPORT_MAX_SCREENS } from "./whatsapp-alert-shared";
export const WHATSAPP_PDF_MAX_SCREENS = WHATSAPP_REPORT_MAX_SCREENS;
// UltraMsg's base64 field is limited to 10,000,000 characters.
export const WHATSAPP_PDF_MAX_BYTES = 7_000_000;
export type WhatsAppPdfReport = {
  kind: "unavailable" | "manual" | "test";
  rows: AlertMailRow[];
  generatedAt: Date;
  sample?: boolean;
};
const colors = { ink: "#192d27", muted: "#61736b", line: "#dce5df", soft: "#f2f6f3", red: "#b84458", green: "#208366" };
const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const dateText = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const elapsed = (row: AlertMailRow, at: Date) => Math.max(0, Math.floor((at.getTime() - Date.parse(row.startedAt)) / 60000));
const duration = (minutes: number) => [Math.floor(minutes / 1440) ? `${Math.floor(minutes / 1440)}d` : "", Math.floor(minutes % 1440 / 60) ? `${Math.floor(minutes % 1440 / 60)}h` : "", `${minutes % 60}m`].filter(Boolean).join(" ");

export async function renderWhatsAppAlertPdf(report: WhatsAppPdfReport): Promise<Buffer> {
  if (!report.rows.length || report.rows.length > WHATSAPP_PDF_MAX_SCREENS) throw new Error("Invalid PDF report size");
  if (!Number.isFinite(report.generatedAt.getTime())) throw new Error("Invalid report time");
  const rows = [...report.rows].sort((a, b) => elapsed(b, report.generatedAt) - elapsed(a, report.generatedAt) || a.screenName.localeCompare(b.screenName));
  const doc = new PDFDocument({ size: "A4", margins: { top: 36, right: 40, bottom: 32, left: 40 }, bufferPages: true, compress: true,
    info: { Title: report.kind === "test" ? "WhatsApp PDF test - sample data" : "Sephora preview availability report", Author: "Sephora Screen Control" } });
  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  // Handle a stream error even if layout fails before awaiting the finished document.
  void finished.catch(() => {});
  try {
    const font = [path.join(process.cwd(), "report-font.ttf"), path.join(process.cwd(), ".next/standalone/report-font.ttf"), path.join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf")].find(file => fs.existsSync(file));
    if (font) doc.registerFont("Report", font);
    const regular = font ? "Report" : "Helvetica", bold = "Helvetica-Bold";
    const left = 40, width = doc.page.width - 80, bottom = doc.page.height - 88;
    const cols = [26, width - 270, 84, 160], x = [left, left + 26, left + width - 244, left + width - 160];
    const sample = report.kind === "test" || report.sample;
    const accent = sample ? colors.green : colors.red;
    const logo = path.join(process.cwd(), "public/images/pixcom-report-logo.png");
    const brand = () => {
      doc.rect(left, 30, width, 3).fill(accent);
      doc.font(bold).fontSize(12).fillColor(colors.ink).text("SEPHORA", left, 50, { characterSpacing: 2 });
      doc.font(regular).fontSize(8).fillColor(colors.muted).text("SCREEN CONTROL", left, 68, { characterSpacing: 1.1 });
      if (fs.existsSync(logo)) {
        const scale = 96 / 1228;
        doc.save().rect(left + width - 96, 48, 96, 32).clip();
        doc.image(logo, left + width - 96 - 136 * scale, 48 - 560 * scale, { width: 1500 * scale });
        doc.restore();
      } else doc.font(bold).fontSize(15).fillColor(colors.ink).text("PIXCOM", left + width - 96, 52, { width: 96, align: "right" });
    };
    const tableHead = (y: number) => {
      doc.rect(left, y, width, 28).fill(colors.soft);
      ["NO.", "SCREEN / LOCATION", "UNAVAILABLE", "CHECK DETAILS"].forEach((label, index) => {
        doc.font(bold).fontSize(index === 0 ? 7 : 8).fillColor(colors.muted).text(label, x[index] + 6, y + 10, { width: cols[index] - 12, lineBreak: false });
      });
      return y + 28;
    };
    const header = (first: boolean) => {
      brand();
      if (!first) {
        doc.font(bold).fontSize(15).fillColor(colors.ink).text(sample ? "Sample preview report - continued" : "Unavailable previews - continued", left, 103, { width });
        doc.font(regular).fontSize(8.5).fillColor(colors.muted).text(`Generated ${dateText(report.generatedAt.toISOString())} GST (UTC+4)`, left, 127);
        return tableHead(151);
      }
      const title = sample ? "Sample preview report" : "Preview unavailable";
      doc.font(bold).fontSize(25).fillColor(colors.ink).text(title, left, 104, { width });
      const label = sample ? "TEST DOCUMENT / FICTIONAL DATA" : report.kind === "manual" ? "MANUAL REPORT" : "AUTOMATIC ALERT";
      doc.font(bold).fontSize(8).fillColor(accent).text(label, left, 140, { characterSpacing: 0.8 });
      doc.font(regular).fontSize(9).fillColor(colors.muted).text(`Generated ${dateText(report.generatedAt.toISOString())} GST (UTC+4)`, left, 160);
      doc.roundedRect(left, 188, width, 61, 6).fill(colors.soft);
      const values = [String(rows.length), String(new Set(rows.map(row => row.countryName)).size), duration(elapsed(rows[0], report.generatedAt))];
      ["UNAVAILABLE SCREENS", "COUNTRIES", "LONGEST OUTAGE"].forEach((label, index) => {
        const columnX = left + index * width / 3 + 14;
        doc.font(regular).fontSize(7).fillColor(colors.muted).text(label, columnX, 200, { width: width / 3 - 20 });
        doc.font(bold).fontSize(index === 2 ? 16 : 20).fillColor(index === 0 ? accent : colors.ink).text(values[index], columnX, 217, { width: width / 3 - 20 });
      });
      doc.font(regular).fontSize(8).fillColor(colors.muted).text("Longest outages first. All timestamps are in GST (UTC+4).", left, 266);
      return tableHead(286);
    };
    let y = header(true);
    for (const [index, row] of rows.entries()) {
      if (index % 25 === 0) await yieldToServer();
      if (!Number.isFinite(Date.parse(row.startedAt)) || !Number.isFinite(Date.parse(row.lastCheckedAt))) throw new Error("Invalid preview time");
      const name = clean(row.screenName), location = clean(row.locationName), area = clean(`${row.regionName} / ${row.countryName}`);
      const nameHeight = doc.font(regular).fontSize(10.5).heightOfString(name, { width: cols[1] - 16 });
      const locationHeight = doc.font(regular).fontSize(9).heightOfString(location, { width: cols[1] - 16 });
      const areaHeight = doc.font(regular).fontSize(8).heightOfString(area, { width: cols[1] - 16 });
      const height = Math.max(83, nameHeight + locationHeight + areaHeight + 31);
      if (height > bottom - 179) throw new Error("Preview label is too large for a PDF row");
      if (y + height > bottom) { doc.addPage(); y = header(false); }
      if (index % 2 === 1) doc.rect(left, y, width, height).fill("#f8faf8");
      doc.font(regular).fontSize(8).fillColor(colors.muted).text(String(index + 1), x[0] + 6, y + 14, { width: cols[0] - 10 });
      doc.font(regular).fontSize(10.5).fillColor(colors.ink).text(name, x[1] + 6, y + 12, { width: cols[1] - 16 });
      doc.font(regular).fontSize(9).fillColor(colors.ink).text(location, x[1] + 6, y + 17 + nameHeight, { width: cols[1] - 16 });
      doc.font(regular).fontSize(8).fillColor(colors.muted).text(area, x[1] + 6, y + 21 + nameHeight + locationHeight, { width: cols[1] - 16 });
      doc.font(bold).fontSize(10).fillColor(accent).text(duration(elapsed(row, report.generatedAt)), x[2] + 6, y + 14, { width: cols[2] - 12 });
      doc.font(regular).fontSize(7.5).fillColor(colors.muted).text("Unavailable since", x[3] + 7, y + 12);
      doc.font(regular).fontSize(8.5).fillColor(colors.ink).text(dateText(row.startedAt), x[3] + 7, y + 24, { width: cols[3] - 14 });
      doc.font(regular).fontSize(7.5).fillColor(colors.muted).text("Last checked", x[3] + 7, y + 47);
      doc.font(regular).fontSize(8.5).fillColor(colors.ink).text(dateText(row.lastCheckedAt), x[3] + 7, y + 59, { width: cols[3] - 14 });
      doc.strokeColor(colors.line).lineWidth(0.5).moveTo(left, y + height).lineTo(left + width, y + height).stroke();
      y += height;
    }
    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index++) {
      doc.switchToPage(index); doc.page.margins.bottom = 12;
      const footerY = doc.page.height - 61;
      doc.strokeColor(colors.line).moveTo(left, footerY).lineTo(left + width, footerY).stroke();
      doc.font(regular).fontSize(7.3).fillColor(colors.muted).text(sample ? "Sample data only. This test document does not report a real outage." : "Preview availability measures image delivery; it does not confirm physical player connectivity.", left, footerY + 10, { width: width - 82 });
      doc.font(regular).fontSize(7.3).fillColor(colors.muted).text(`Page ${index + 1} of ${range.count}`, left + width - 75, footerY + 10, { width: 75, align: "right" });
    }
    doc.end();
    const bytes = await finished;
    if (bytes.length > WHATSAPP_PDF_MAX_BYTES) throw new Error("PDF exceeds the attachment limit");
    return bytes;
  } catch (error) { doc.destroy(); throw error; }
}
