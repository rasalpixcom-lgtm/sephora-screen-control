import assert from "node:assert/strict";
import { calculateLedDisplay, displayHardwareFields, hardwareSectionIds, hardwareSections, isHardwareSection, parseHardwareFields } from "../lib/screen-hardware.ts";

assert.deepEqual(hardwareSectionIds, ["ledDisplay", "ledController", "mediaPlayer", "powerNetwork"]);
for (const section of hardwareSectionIds) {
  assert.ok(hardwareSections[section].fields.length > 0);
  assert.equal(isHardwareSection(section), true);
  assert.deepEqual(parseHardwareFields(section, {}), {});
  const [key] = hardwareSections[section].fields[0];
  assert.deepEqual(parseHardwareFields(section, { [key]: "  Example  " }), { [key]: "Example" });
  assert.throws(() => parseHardwareFields(section, { unexpected: "value" }));
  assert.throws(() => parseHardwareFields(section, { [key]: 1 }));
  assert.throws(() => parseHardwareFields(section, { [key]: "x".repeat(201) }));
}
assert.equal(isHardwareSection("other"), false);
assert.deepEqual(parseHardwareFields("ledDisplay", { assetId: "", manufacturer: " Brand " }), { manufacturer: "Brand" });
for (const value of ["0", "-1", "1.5", "1000000"]) assert.throws(() => parseHardwareFields("ledDisplay", { cabinetQuantity: value }));
for (const value of ["0", "-1", "abc", "1.1234"]) assert.throws(() => parseHardwareFields("ledDisplay", { pixelPitch: value }));
for (const value of ["2300", "0x800", "2300x0", "2300x800x2", "abc x 800"]) assert.throws(() => parseHardwareFields("ledDisplay", { resolution: value }));
assert.deepEqual(calculateLedDisplay("2300*800", "2.5"), { resolution: "2300 × 800", dimensions: "5.75 × 2", totalSqm: "11.5" });
assert.deepEqual(calculateLedDisplay("2300 x 800", "2.5"), calculateLedDisplay("2300×800", "2.5"));
assert.equal(calculateLedDisplay("2300", "2.5"), null);
assert.deepEqual(parseHardwareFields("ledDisplay", { cabinetQuantity: "12", resolution: "2300*800", pixelPitch: "2.5", dimensions: "300", totalSqm: "999" }), { cabinetQuantity: "12", resolution: "2300 × 800", pixelPitch: "2.5", dimensions: "5.75 × 2", totalSqm: "11.5" });
assert.deepEqual(parseHardwareFields("ledDisplay", { pixelPitch: "2.5", dimensions: "300", totalSqm: "999" }), { pixelPitch: "2.5" });
assert.deepEqual(displayHardwareFields("ledDisplay", { resolution: "2300*800", pixelPitch: "2.5", dimensions: "300", totalSqm: "999" }), { resolution: "2300 × 800", pixelPitch: "2.5", dimensions: "5.75 × 2", totalSqm: "11.5" });
assert.deepEqual(displayHardwareFields("ledDisplay", { dimensions: "300", totalSqm: "999" }), {});
console.log("Screen hardware validation passed.");
