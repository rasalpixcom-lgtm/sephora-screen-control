import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const output = path.join(process.cwd(), ".server-runtime", "screen-inventory-report-test.cjs");
try {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await build({ stdin: { contents: 'export { screenInventoryRows, screenReportDay } from "./lib/screen-inventory-report"; export { renderScreenInventoryPdf } from "./lib/screen-inventory-pdf";', resolveDir: process.cwd(), loader: "ts" }, outfile: output, bundle: true, platform: "node", format: "cjs", external: ["pdfkit"] });
  const { screenInventoryRows, screenReportDay, renderScreenInventoryPdf } = createRequire(import.meta.url)(output);
  assert.equal(screenReportDay(new Date("2026-10-20T20:30:00Z")), "2026-10-21", "filename date follows Dubai local time");
  assert.equal(screenReportDay(new Date("2026-10-20T19:30:00Z")), "2026-10-20", "filename date changes only at Dubai midnight");
  const entity = (id, type, name, parentId = null, more = {}) => ({ id, type, name, parentId, shortName: null, liveUrl: null, onsignPlayerId: null, photoKey: null, isDemo: 0, createdAt: "2026-01-01", ...more });
  const entities = [entity("uae", "country", "United Arab Emirates"), entity("dubai", "region", "Dubai", "uae"), entity("mall", "store", "Dubai Mall", "dubai"), entity("abu", "region", "Abu Dhabi", "uae"), entity("yas", "store", "Yas Mall", "abu"), entity("first", "screen", "Entrance", "mall", { liveUrl: "https://app.onsign.tv/embed/private-preview-token", onsignPlayerId: "player-1", photoKey: "private-photo-key" }), entity("second", "screen", "Cash desk", "yas")];
  const all = { search: "", countryId: "", regionId: "", storeId: "" };
  assert.deepEqual(screenInventoryRows(entities, all).map(row => row.screen.id), ["first", "second"]);
  assert.deepEqual(screenInventoryRows(entities, { ...all, search: "DUBAI" }).map(row => row.screen.id), ["first"]);
  assert.deepEqual(screenInventoryRows(entities, { ...all, search: "entrance", storeId: "yas" }).map(row => row.screen.id), []);
  assert.deepEqual(screenInventoryRows(entities, { ...all, countryId: "uae", regionId: "abu" }).map(row => row.screen.id), ["second"]);
  const one = await renderScreenInventoryPdf(screenInventoryRows(entities, { ...all, storeId: "mall" }), { ...all, storeId: "mall" }, { location: "Dubai Mall" });
  assert.equal(one.subarray(0, 5).toString(), "%PDF-");
  assert.equal((one.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length, 1);
  assert.ok(!one.includes(Buffer.from("private-preview-token")) && !one.includes(Buffer.from("private-photo-key")));
  const many = [...Array(75)].map((_, index) => entity(`screen-${index}`, "screen", index % 10 === 0 ? `Display ${index} - ${"Long label ".repeat(6)}` : `Display ${index}`, "mall"));
  const pages = await renderScreenInventoryPdf(screenInventoryRows([...entities.slice(0, 3), ...many], all), all);
  assert.ok((pages.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length > 1);
  const names = ["Beauty studio · 01", "Cash table · 01", "Cash table · 01", "Entrance display · 01", "TDM - Screen 1 - Behind Cash - 1920 x 1080", "TDM - Screen 2 - Engraving - 420 x 1008", "TDM - Screen 3 - Above Pop Up Extension - 1680 x 1008", "TDM - Screen 4 - Other Skincare -1920 x 1080", "TDM - Screen 5 - Niche Fragrancee OTHER - 1920 x 1080", "TDM - Screen 6 - Other -External - 1632 x 768", "TDM - Screen 8 - LEDs above Fragrance- Women OTHER-1872 x 780", "TDM - Screen 9&10 - Animation Table - 1920x1080", "Window S-3 -Left", "Animation table", "Animation Table"];
  const fifteen = names.map((name, index) => entity(`filtered-${index}`, "screen", name, "mall"));
  const countryFilter = { ...all, countryId: "uae" };
  const compact = await renderScreenInventoryPdf(screenInventoryRows([...entities.slice(0, 3), ...fifteen], countryFilter), countryFilter, { country: "United Arab Emirates" });
  assert.equal((compact.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length, 1, "15 filtered screens fit on one page");
  const locations = ["Mall of the Emirates", "Mall of the Emirates", "City Centre Mirdif", "Yas Mall", ...Array(8).fill("Dubai Mall"), "Dalama Mall", "Mall of the Emirates", "Al Wahada Mall"];
  const fullRows = fifteen.map((screen, index) => ({ screen, location: locations[index], region: [3, 12, 14].includes(index) ? "Abu Dhabi" : "Dubai", country: "United Arab Emirates" }));
  const full = await renderScreenInventoryPdf(fullRows, all);
  assert.equal((full.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length, 1, "15 unfiltered screens fit on one page");
  if (process.env.SCREEN_REPORT_VISUAL_SAMPLE) await fs.writeFile(process.env.SCREEN_REPORT_VISUAL_SAMPLE, compact);
  if (process.env.SCREEN_REPORT_FULL_VISUAL_SAMPLE) await fs.writeFile(process.env.SCREEN_REPORT_FULL_VISUAL_SAMPLE, full);
  if (process.env.PDF_TEST_PYTHON) {
    const sample = path.join(process.cwd(), ".server-runtime", "screen-inventory-report-sample.pdf");
    const privateSample = path.join(process.cwd(), ".server-runtime", "screen-inventory-report-private-test.pdf");
    const compactSample = path.join(process.cwd(), ".server-runtime", "screen-inventory-report-compact-test.pdf");
    const fullSample = path.join(process.cwd(), ".server-runtime", "screen-inventory-report-full-test.pdf");
    await fs.writeFile(sample, pages);
    await fs.writeFile(privateSample, one);
    await fs.writeFile(compactSample, compact);
    await fs.writeFile(fullSample, full);
    try {
      const script = "import json,sys\nfrom pypdf import PdfReader\nimport pdfplumber\nr=PdfReader(sys.argv[1])\ntext='\\n'.join(p.extract_text() or '' for p in r.pages)\nbad=[]\nwith pdfplumber.open(sys.argv[1]) as pdf:\n for page in pdf.pages:\n  for word in page.extract_words():\n   if word['x0']<34 or word['x1']>page.width-34 or word['top']<30 or word['bottom']>page.height-15: bad.append(word)\nprint(json.dumps({'text':text,'pages':len(r.pages),'bad':bad[:10]}))";
      const inspected = JSON.parse(execFileSync(process.env.PDF_TEST_PYTHON, ["-c", script, sample], { encoding: "utf8" }));
      assert.equal((inspected.text.match(/Display \d+/g) || []).length, 75, "all rows appear in extracted PDF text");
      assert.ok(inspected.pages > 1 && inspected.bad.length === 0, `each page stays within its margins: ${JSON.stringify(inspected.bad)}`);
      const privatePdf = JSON.parse(execFileSync(process.env.PDF_TEST_PYTHON, ["-c", script, privateSample], { encoding: "utf8" }));
      assert.ok(privatePdf.text.includes("Entrance") && !privatePdf.text.includes("private-preview-token") && !privatePdf.text.includes("private-photo-key"));
      const compactPdf = JSON.parse(execFileSync(process.env.PDF_TEST_PYTHON, ["-c", script, compactSample], { encoding: "utf8" }));
      assert.ok(compactPdf.pages === 1 && compactPdf.bad.length === 0 && compactPdf.text.includes("15 screens"), "compact report stays readable within one page");
      assert.equal((compactPdf.text.match(/Country/g) || []).length, 1, "country appears in the filter heading, not as a repeated column");
      assert.ok(compactPdf.text.includes("Window S-3 -Left"), "last rows are present in the compact report");
      const fullPdf = JSON.parse(execFileSync(process.env.PDF_TEST_PYTHON, ["-c", script, fullSample], { encoding: "utf8" }));
      assert.ok(fullPdf.pages === 1 && fullPdf.bad.length === 0 && fullPdf.text.includes("15 screens"), "full report stays within one page and its margins");
      assert.ok(fullPdf.text.includes("Animation Table") && fullPdf.text.includes("Al Wahada Mall"), "last full-report row is present");
    } finally { await fs.rm(sample, { force: true }); await fs.rm(privateSample, { force: true }); await fs.rm(compactSample, { force: true }); await fs.rm(fullSample, { force: true }); }
  }
  console.log("Screens PDF filters, output, privacy, and pagination passed.");
} finally { await fs.rm(output, { force: true }); }
