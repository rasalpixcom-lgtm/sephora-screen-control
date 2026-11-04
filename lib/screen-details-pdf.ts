import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { hardwareSections, hardwareSectionsForType, displayHardwareFields, type HardwareFields, type HardwareSection } from "./screen-hardware";
import { ppmChecks, type PpmFields } from "./screen-ppm-inspection";
import { locationDetailFields, type LocationDetailFields } from "./location-details";

export type ScreenReportPhoto = { label: string; bytes: Buffer | null };
export type ScreenDetailsReport = {
  id: string; name: string; screenType: string | null; location: string; region: string; country: string;
  hardware: Partial<Record<HardwareSection, HardwareFields>>; ppm: PpmFields; locationDetails: LocationDetailFields;
  screenPhotos: ScreenReportPhoto[]; locationPhotos: ScreenReportPhoto[]; includeLocationPhotos: boolean;
};

const day = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z")) : value;

export async function renderScreenDetailsPdf(report: ScreenDetailsReport, generatedAt = new Date()): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 42, bottom: 42, left: 42, right: 42 }, bufferPages: true,
    info: { Title: `${report.name} - Screen Details Report`, Author: "PIXCOM | Sephora Screen Control" } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const fontPairs = [
    [path.resolve("public/fonts/outfit/Outfit-Regular.ttf"), path.resolve("public/fonts/outfit/Outfit-SemiBold.ttf")],
    ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
  ];
  const pair = fontPairs.find(files => files.every(file => fs.existsSync(file)));
  const bundled = ["report-font.ttf", "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"].map(file => path.resolve(file)).find(file => fs.existsSync(file));
  if (pair || bundled) doc.registerFont("Body", pair?.[0] || bundled!);
  if (pair) doc.registerFont("Bold", pair[1]);
  const regular = pair || bundled ? "Body" : "Helvetica", bold = pair ? "Bold" : "Helvetica-Bold";
  const left = 42, width = doc.page.width - 84, bottom = doc.page.height - 66;
  const ink = "#17231f", muted = "#66766f", accent = "#218268", border = "#dce5e0", soft = "#f2f6f4";
  let y = 42;
  function wrap(value: string, w: number, size: number, face = regular) {
    doc.font(face).fontSize(size);
    const lines: string[] = [];
    for (const paragraph of value.replace(/\r\n?/g, "\n").split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if (line && doc.widthOfString(`${line} ${word}`) > w) { lines.push(line); line = ""; }
        for (const char of (line ? " " : "") + word) {
          if (line && doc.widthOfString(line + char) > w) { lines.push(line); line = ""; }
          line += char;
        }
      }
      lines.push(line);
    }
    return lines;
  }
  function draw(value: string, x: number, at: number, w: number, size = 9, color = ink, face = regular) {
    const rows = wrap(value, w, size, face);
    rows.forEach((line, i) => doc.font(face).fontSize(size).fillColor(color).text(line, x, at + i * size * 1.4, { width: w, lineBreak: false, characterSpacing: 0, wordSpacing: 0 }));
    return rows.length * size * 1.4;
  }
  function newPage() { doc.addPage(); y = 42; }
  function sectionTitle(title: string) {
    doc.rect(left, y, 3, 16).fill(accent);
    y += draw(title, left + 12, y, width - 12, 12, ink, bold) + 12;
  }
  function table(title: string, rows: [string, string][]) {
    const labelWidth = 205, valueWidth = width - labelWidth - 24;
    const heights = rows.map(([label, value]) => Math.max(wrap(label, labelWidth - 16, 9).length, wrap(value || "Not recorded", valueWidth, 9).length) * 12.6 + 12);
    const total = 40 + heights.reduce((a, b) => a + b, 0);
    if (y + Math.min(total, 160) > bottom) newPage();
    sectionTitle(title);
    rows.forEach(([label, raw], index) => {
      const value = raw || "Not recorded", labels = wrap(label, labelWidth - 16, 9), values = wrap(value, valueWidth, 9);
      const color = ["Pass", "Yes"].includes(value) ? "#1d7a58" : ["Fail", "No"].includes(value) ? "#b63830" : value === "Follow-up" ? "#9b640c" : raw ? ink : muted;
      // Long findings can span pages without dropping lines or overflowing the footer.
      let offset = 0;
      const count = Math.max(labels.length, values.length);
      while (offset < count) {
        if (y + 25 > bottom) { newPage(); sectionTitle(`${title} (continued)`); }
        const take = Math.min(count - offset, Math.floor((bottom - y - 12) / 12.6));
        const h = take * 12.6 + 12;
        doc.rect(left, y, width, h).fill(index % 2 ? "#ffffff" : soft);
        for (let i = 0; i < take; i++) {
          if (labels[offset + i]) draw(labels[offset + i], left + 8, y + 6 + i * 12.6, labelWidth - 16, 9, muted);
          if (values[offset + i]) draw(values[offset + i], left + labelWidth + 8, y + 6 + i * 12.6, valueWidth, 9, color);
        }
        y += h;
        doc.moveTo(left, y).lineTo(left + width, y).strokeColor(border).lineWidth(.4).stroke();
        offset += take;
      }
    });
    y += 22;
  }
  async function photos(title: string, items: ScreenReportPhoto[]) {
    if (!items.length) return;
    for (let i = 0; i < items.length; i++) {
      if (i % 2 === 0) { newPage(); sectionTitle(`${title} (${items.length})`); }
      const top = i % 2 === 0 ? 80 : 431, boxY = top + 28, boxH = 302;
      draw(items[i].label, left, top, width, 10, ink, bold);
      doc.roundedRect(left, boxY, width, boxH, 5).fill(soft);
      let jpeg: Buffer | null = null;
      if (items[i].bytes) {
        try { jpeg = await sharp(items[i].bytes!, { limitInputPixels: 50000000 }).rotate().flatten({ background: "#ffffff" }).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer(); }
        catch { /* One unavailable photo must not prevent exporting the saved details. */ }
      }
      if (jpeg) doc.image(jpeg, left + 8, boxY + 8, { fit: [width - 16, boxH - 16], align: "center", valign: "center" });
      else draw("Photo unavailable.", left + 16, boxY + boxH / 2, width - 32, 9, muted);
      y = boxY + boxH + 22;
    }
  }
  try {
    const logoFile = path.resolve("public/images/pixcom-report-logo.png");
    if (fs.existsSync(logoFile)) {
      const logo = await sharp(logoFile).flatten({ background: "#ffffff" }).trim().png().toBuffer();
      doc.image(logo, left, y - 6, { fit: [150, 40] });
    } else draw("PIXCOM", left, y, 150, 18, ink, bold);
    draw("SCREEN DETAILS REPORT", left + 240, y + 6, width - 240, 10, muted, bold);
    y += 48;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(accent).lineWidth(1.4).stroke();
    y += 18;
    y += draw(report.name, left, y, width, 18, ink, bold) + 8;
    y += draw([report.location, report.region, report.country].filter(Boolean).join(" · ") || "Location not recorded", left, y, width, 10, muted) + 18;
    const resolution = report.screenType === "LED" ? report.hardware.ledDisplay?.resolution || "" : "";
    const summary = [["Screen ID", report.id], ["Screen type", report.screenType || "Not specified"], ["Screen resolution (px)", resolution || "Not recorded"]];
    const padding = 14, gap = 20, cellWidth = (width - padding * 2 - gap) / 2;
    const rowHeights = [0, 1].map(row => Math.max(...summary.slice(row * 2, row * 2 + 2).map(([, value]) => 16 + wrap(value, cellWidth, 9, bold).length * 12.6)));
    const summaryHeight = padding * 2 + rowHeights.reduce((sum, height) => sum + height, 0) + 12;
    if (y + summaryHeight > bottom) newPage();
    doc.roundedRect(left, y, width, summaryHeight, 6).fillAndStroke(soft, border);
    let rowY = y + padding;
    summary.forEach(([label, value], index) => {
      if (index === 2) rowY += rowHeights[0] + 12;
      const x = left + padding + (index % 2) * (cellWidth + gap);
      draw(label, x, rowY, cellWidth, 7.5, muted);
      draw(value, x, rowY + 16, cellWidth, 9, value === "Not recorded" ? muted : ink, bold);
    });
    y += summaryHeight + 22;
    for (const section of hardwareSectionsForType(report.screenType)) {
      const fields = displayHardwareFields(section, report.hardware[section] || {});
      table(hardwareSections[section].title, hardwareSections[section].fields.filter(([key]) => section !== "ledDisplay" || key !== "resolution").map(([key, label]) => [label, key === "installation_date" ? day(fields[key] || "") : fields[key] || ""]));
    }
    if (!report.screenType) table("Hardware inventory", [["Details", "Choose a screen type to record the relevant hardware details."]]);
    const ppm = report.ppm;
    table("PPM inspection", [
      ["Overall status", ppm.overallStatus || ""], ["PPM date", day(ppm.ppmDate || "")], ["Next PPM date", day(ppm.nextPpmDate || "")], ["Client / project", ppm.clientProject || ""],
      ...ppmChecks.map(([key, label]): [string, string] => [label, ppm[key] || "Not checked"]),
      ["Defects / findings", ppm.findings || ""], ["Corrective action", ppm.correctiveAction || ""],
    ]);
    table("Location details", [["Location", report.location], ["Region", report.region], ["Country", report.country], ...locationDetailFields.map(([key, label]): [string, string] => [label, report.locationDetails[key] || ""])]);
    if (!report.screenPhotos.length) table("Screen photos", [["Photos", "No screen photos added."]]);
    await photos("Screen photos", report.screenPhotos);
    if (report.includeLocationPhotos) {
      if (!report.locationPhotos.length) table("Location photos", [["Photos", "No location photos added."]]);
      await photos("Location photos", report.locationPhotos);
    }
    const generated = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" }).format(generatedAt) + " GST";
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i); doc.page.margins.bottom = 10;
      doc.moveTo(left, doc.page.height - 42).lineTo(left + width, doc.page.height - 42).strokeColor(border).lineWidth(.5).stroke();
      draw(`Sephora Screen Control | Generated ${generated}`, left, doc.page.height - 30, width - 80, 7, muted);
      draw(`Page ${i + 1} of ${pages.count}`, left + width - 65, doc.page.height - 30, 65, 7, muted);
    }
    doc.end();
  } catch (error) { doc.destroy(error instanceof Error ? error : new Error("Could not generate screen report.")); }
  return done;
}
