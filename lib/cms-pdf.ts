import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { cmsTime, type CmsPayload } from "./cms-support";

export async function renderCmsPdf(payload: CmsPayload, image: Buffer | null, reference: string, generatedAt: string, draft = false): Promise<Buffer> {
  const jpeg = image ? await sharp(image).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer() : null;
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margins: { top: 36, right: 36, bottom: 42, left: 36 }, bufferPages: true, info: { Title: `CMS Upload Report - ${payload.contentName}`, Author: "Sephora Screen Control" } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const font = [path.join(process.cwd(), "report-font.ttf"), path.join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"), path.join(process.cwd(), ".next/standalone/report-font.ttf")].find(file => fs.existsSync(file));
  if (font) doc.registerFont("Report", font);
  const regular = font ? "Report" : "Helvetica";
  const left = 36, width = doc.page.width - 72;
  const ink = "#222222", muted = "#606660", line = "#dce0dc";
  const bottom = doc.page.height - 54;
  // Measure wrapped lines explicitly so long names cannot escape their cells.
  function lines(value: string, available: number, size: number, face = regular) {
    doc.font(face).fontSize(size);
    const output: string[] = [];
    for (const paragraph of value.split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        if (current && doc.widthOfString(current + " " + word) > available) { output.push(current); current = ""; }
        for (const char of (current ? " " : "") + word) {
          if (current && doc.widthOfString(current + char) > available) { output.push(current); current = ""; }
          current += char;
        }
      }
      output.push(current);
    }
    return output;
  }
  const height = (value: string, w: number, size: number) => lines(value, w, size).length * size * 1.4;
  function text(value: string, x: number, y: number, w: number, size = 9, color = ink, face = regular) {
    const wrapped = lines(value, w, size, face);
    wrapped.forEach((item, i) => doc.font(face).fontSize(size).fillColor(color).text(item, x, y + i * size * 1.4, { width: w, lineBreak: false, characterSpacing: 0, wordSpacing: 0 }));
    return y + wrapped.length * size * 1.4;
  }
  const date = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z"));
  function pageHead(continued = false) {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#f3f4f3");
    doc.rect(0, 0, doc.page.width, 60).fill("#111111");
    text("SEPHORA", left, 23, 105, 12, "#ffffff");
    doc.moveTo(left + 110, 19).lineTo(left + 110, 41).strokeColor("#79807b").lineWidth(.6).stroke();
    text("CMS UPLOAD REPORT", left + 127, 20, width - 127, 18, "#ffffff", "Helvetica-Bold");
    const label = `${draft ? "DRAFT PREVIEW | " : ""}${reference} | ${cmsTime(generatedAt)}`;
    const end = text(label, left, 74, width, 8, muted);
    return (continued ? text(payload.contentName, left, end + 7, width, 10) : end) + 16;
  }
  function card(x: number, at: number, w: number, h: number, radius: number) {
    doc.save().fillOpacity(.045).roundedRect(x - 2, at + 3, w + 4, h + 3, radius + 2).fill("#111111").restore();
    doc.save().fillOpacity(.035).roundedRect(x, at + 2, w, h + 1, radius).fill("#111111").restore();
    doc.roundedRect(x, at, w, h, radius).fill("#ffffff");
  }
  // Vector icons stay sharp in print and do not depend on symbol fonts.
  function detailIcon(label: string, x: number, at: number) {
    doc.save().lineWidth(.8).strokeColor("#444b46").fillColor("#444b46");
    if (label === "Screen category") {
      for (const dx of [0, 5]) for (const dy of [0, 5]) doc.rect(x + dx, at + dy, 3, 3).stroke();
    } else if (label === "Playback period") {
      doc.circle(x + 4, at + 4, 4.5).stroke();
      doc.moveTo(x + 3, at + 2).lineTo(x + 6, at + 4).lineTo(x + 3, at + 6).closePath().fill();
    } else if (label === "Campaign") {
      doc.moveTo(x + 1, at + 9).lineTo(x + 1, at).lineTo(x + 8, at + 1).lineTo(x + 8, at + 5).lineTo(x + 1, at + 4).stroke();
    } else {
      doc.roundedRect(x, at + 1, 9, 8, 1).stroke();
      doc.moveTo(x, at + 4).lineTo(x + 9, at + 4).moveTo(x + 2, at).lineTo(x + 2, at + 2).moveTo(x + 7, at).lineTo(x + 7, at + 2).stroke();
    }
    doc.restore();
  }
  let y = pageHead();
  const approvalWidth = (width - 20) / 2;
  const approvals = [["Approved by", payload.approvedBy || "Not recorded"], ["Resized by", payload.resizedBy || "Not recorded"]];
  const approvalLabelWidth = 68;
  const approvalHeight = Math.max(...approvals.map(([, value]) => height(value, approvalWidth - approvalLabelWidth - 12, 8.5))) + 14;
  approvals.forEach(([label, value], i) => {
    const x = left + i * (approvalWidth + 20);
    text(label, x, y + 7, approvalLabelWidth - 6, 8, muted);
    doc.roundedRect(x + approvalLabelWidth, y, approvalWidth - approvalLabelWidth, approvalHeight, 4).fill("#f0f2f0");
    text(value, x + approvalLabelWidth + 6, y + 7, approvalWidth - approvalLabelWidth - 12, 8.5);
  });
  y += approvalHeight + 18;
  const padding = 16, imageWidth = jpeg ? 190 : 0, imageHeight = 140;
  const detailWidth = width - padding * 2 - (jpeg ? imageWidth + 18 : 0);
  const iconWidth = 16, labelWidth = jpeg ? 93 : 122, valueWidth = detailWidth - iconWidth - labelWidth - 8;
  const fields = [
    ["Campaign", payload.campaignName], ["Screen category", payload.category],
    ["Received", cmsTime(payload.receivedAt)],
    ["Missing files received", payload.missingReceivedAt ? cmsTime(payload.missingReceivedAt) : ""],
    ["Scheduling completed", payload.scheduledAt ? cmsTime(payload.scheduledAt) : "Not recorded"],
    ["Playback period", `${date(payload.playbackStart)} to ${date(payload.playbackEnd)}`],
  ].filter(([, value]) => value);
  const titleHeight = height(payload.contentName, detailWidth - 10, 16);
  const fieldHeights = fields.map(([label, value]) => Math.max(height(label, labelWidth, 8), height(value, valueWidth, 9)) + 8);
  const cardHeight = padding * 2 + Math.max(titleHeight + 15 + fieldHeights.reduce((a, b) => a + b, 0), jpeg ? imageHeight : 0);
  card(left, y, width, cardHeight, 10);
  doc.roundedRect(left, y, width, cardHeight, 10).strokeColor(line).lineWidth(.6).stroke();
  doc.rect(left + padding, y + padding + 1, 3, 17).fill("#d72e47");
  text(payload.contentName, left + padding + 10, y + padding, detailWidth - 10, 16);
  let detailY = y + padding + height(payload.contentName, detailWidth - 10, 16) + 15;
  fields.forEach(([label, value], i) => {
    detailIcon(label, left + padding, detailY + 1);
    text(label, left + padding + iconWidth, detailY, labelWidth, 8, muted);
    text(value, left + padding + iconWidth + labelWidth + 8, detailY, valueWidth, 9);
    detailY += fieldHeights[i];
    if (i < fields.length - 1) doc.moveTo(left + padding + iconWidth, detailY - 4).lineTo(left + padding + detailWidth, detailY - 4).strokeColor(line).lineWidth(.4).stroke();
  });
  if (jpeg) {
    const imageX = left + width - padding - imageWidth, imageY = y + padding;
    doc.roundedRect(imageX, imageY, imageWidth, imageHeight, 7).fillAndStroke("#ffffff", line);
    doc.image(jpeg, imageX + 5, imageY + 5, { fit: [imageWidth - 10, imageHeight - 10], align: "center", valign: "center" });
  }
  y += cardHeight + 16;
  const scheduled = payload.screens.filter(row => row.scheduling === "Scheduled").length;
  const verified = payload.screens.filter(row => row.playback === "Verified").length;
  y = text(`${payload.screens.length} ${payload.screens.length === 1 ? "screen" : "screens"} | ${scheduled} scheduled | ${verified} playback verified`, left, y, width, 9, muted) + 14;
  if (payload.remarks) {
    for (const item of lines(`Remarks: ${payload.remarks}`, width, 9)) {
      if (y + 13 > bottom) { doc.addPage(); y = pageHead(true); }
      y = text(item, left, y, width, 9);
    }
    y += 14;
  }
  // Keep the core client columns readable in portrait. Row remarks use the full
  // table width below their screen instead of squeezing every column smaller.
  const columns = [76, 112, 96, 69, 78, width - 431];
  const headings = ["Country / region", "Store", "Screen", "Network", "Scheduling", "Playback"];
  function tableHead(at: number) {
    doc.rect(left, at, width, 30).fill("#ecefec");
    let x = left;
    headings.forEach((label, i) => { text(label, x + 6, at + 8, columns[i] - 12, 8, ink, "Helvetica-Bold"); x += columns[i]; if (i < columns.length - 1) doc.moveTo(x, at).lineTo(x, at + 30).strokeColor(line).lineWidth(.4).stroke(); });
    return at + 30;
  }
  const good = new Set(["Online", "Scheduled", "Verified"]), bad = new Set(["Offline", "Failed", "Issue"]);
  function badge(value: string, x: number, at: number, w: number) {
    const color = good.has(value) ? "#216d46" : bad.has(value) ? "#a42f2f" : value === "Unstable" ? "#8a590d" : muted;
    const background = good.has(value) ? "#e4f3e9" : bad.has(value) ? "#fbe7e7" : value === "Unstable" ? "#fff0d9" : "#eef1ef";
    const h = height(value, w - 10, 8) + 8;
    doc.roundedRect(x, at, w, h, 5).fill(background);
    text(value, x + 5, at + 4, w - 10, 8, color);
    return at + h;
  }
  // Use familiar short labels only in the PDF; stored inventory names stay intact.
  const countryLabels: Record<string, string> = { "united arab emirates": "UAE", "saudi arabia": "KSA" };
  const rows = payload.screens.map(row => {
    const country = countryLabels[row.country.trim().toLowerCase()] || row.country;
    const values = [[country, row.region].filter(Boolean).join("\n"), row.location, row.screenName];
    const statusHeights = [row.network, row.scheduling, row.playback].map((value, j) => height(value, columns[j + 3] - 22, 8) + 8);
    const mainHeight = Math.max(38, ...values.map((value, j) => height(value, columns[j] - 12, 8.5) + 16), ...statusHeights.map(h => h + 16));
    const remarkHeight = row.remarks ? height(`Remarks: ${row.remarks}`, width - 16, 8) + 12 : 0;
    return { row, values, mainHeight, rowHeight: mainHeight + remarkHeight };
  });
  let index = 0;
  while (index < rows.length) {
    if (y + 30 + rows[index].rowHeight > bottom) { doc.addPage(); y = pageHead(true); }
    const first = index;
    let tableHeight = 30;
    while (index < rows.length && y + tableHeight + rows[index].rowHeight <= bottom) { tableHeight += rows[index].rowHeight; index++; }
    if (index === first) throw new Error("A screen row is too long to fit on the report page.");
    const tableTop = y;
    card(left, tableTop, width, tableHeight, 7);
    doc.save().roundedRect(left, tableTop, width, tableHeight, 7).clip();
    y = tableHead(tableTop);
    for (let i = first; i < index; i++) {
      const { row, values, mainHeight, rowHeight } = rows[i];
      doc.rect(left, y, width, rowHeight).fill(i % 2 ? "#f7f8f7" : "#ffffff");
      let x = left;
      values.forEach((value, j) => { text(value, x + 6, y + 8, columns[j] - 12, 8.5); x += columns[j]; });
      [row.network, row.scheduling, row.playback].forEach((value, j) => {
        badge(value, x + 6, y + 8, columns[j + 3] - 12);
        x += columns[j + 3];
      });
      x = left;
      columns.slice(0, -1).forEach(w => { x += w; doc.moveTo(x, y).lineTo(x, y + mainHeight).strokeColor(line).lineWidth(.4).stroke(); });
      if (row.remarks) text(`Remarks: ${row.remarks}`, left + 8, y + mainHeight, width - 16, 8, muted);
      y += rowHeight;
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor(line).lineWidth(.5).stroke();
    }
    doc.restore();
    doc.roundedRect(left, tableTop, width, tableHeight, 7).strokeColor(line).lineWidth(.6).stroke();
  }
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 10;
    doc.moveTo(left, doc.page.height - 40).lineTo(left + width, doc.page.height - 40).strokeColor(line).lineWidth(.5).stroke();
    text("Statuses recorded by the CMS support team. Times are in GST.", left, doc.page.height - 29, width - 65, 7, muted);
    text(`${i + 1} / ${pages.count}`, left + width - 40, doc.page.height - 29, 40, 8, muted);
  }
  doc.end();
  return done;
}
