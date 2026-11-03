import assert from "node:assert/strict";
import { PPM_TEXT_MAX_LENGTH, parsePpmFields } from "../lib/screen-ppm-inspection.ts";

const valid = parsePpmFields({
  ppmDate: "2026-11-03", nextPpmDate: "2026-12-03", clientProject: "  Sephora  ", overallStatus: "Follow-up",
  led_modules: "Pass", cabinet_alignment: "Fail", final_playback: "N/A",
  findings: "Loose cable\r\nDust found", correctiveAction: "Secure cable",
});
assert.deepEqual(valid, {
  ppmDate: "2026-11-03", nextPpmDate: "2026-12-03", clientProject: "Sephora", overallStatus: "Follow-up",
  led_modules: "Pass", cabinet_alignment: "Fail", final_playback: "N/A",
  findings: "Loose cable\nDust found", correctiveAction: "Secure cable",
});
assert.deepEqual(parsePpmFields({ clientProject: "", findings: "", correctiveAction: "" }), {});
assert.throws(() => parsePpmFields({ extra: "no" }), /valid PPM inspection/i);
assert.throws(() => parsePpmFields({ ppmDate: "2026-02-30" }), /real date/i);
assert.throws(() => parsePpmFields({ ppmDate: "2026-11-03", nextPpmDate: "2026-11-02" }), /cannot be before/i);
assert.throws(() => parsePpmFields({ led_modules: "Unknown" }), /Pass, Fail or N\/A/i);
assert.throws(() => parsePpmFields({ overallStatus: "Unknown" }), /Overall status/i);
assert.throws(() => parsePpmFields({ findings: "x".repeat(PPM_TEXT_MAX_LENGTH + 1) }), /too long/i);
console.log("PPM inspection validation passed.");
