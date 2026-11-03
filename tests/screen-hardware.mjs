import assert from "node:assert/strict";
import { manualLedSize, displayHardwareFields, hardwareFieldOptions, hardwareSectionIds, hardwareSectionsForType, hardwareSections, isHardwareSection, parseHardwareFields } from "../lib/screen-hardware.ts";

assert.deepEqual(hardwareSectionIds, ["ledDisplay", "ledController", "mediaPlayer", "lcd", "video_wall", "powerNetwork"]);
assert.deepEqual(hardwareSectionsForType("LED"), ["ledDisplay", "ledController", "mediaPlayer", "powerNetwork"]);
assert.deepEqual(hardwareSectionsForType("LCD"), ["lcd"]);
assert.deepEqual(hardwareSectionsForType("Video Wall"), ["video_wall"]);
assert.deepEqual(hardwareSectionsForType(null), []);
assert.deepEqual(hardwareSectionsForType("unknown"), []);
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
assert.deepEqual(manualLedSize("5000", "2000"), { width: "5000", height: "2000", ratio: 2.5 });
assert.deepEqual(manualLedSize("2000", "5000"), { width: "2000", height: "5000", ratio: 0.4 });
for (const [width, height] of [["", "2000"], ["5000", ""], ["0", "2000"], ["-1", "2000"], ["bad", "2"], ["Infinity", "1"]]) assert.equal(manualLedSize(width, height), null);
assert.deepEqual(parseHardwareFields("ledDisplay", { cabinetQuantity: "12", resolution: "2300*800", pixelPitch: "2.5", dimensions: "300", totalSqm: "999" }), { cabinetQuantity: "12", resolution: "2300 × 800", pixelPitch: "2.5" });
assert.deepEqual(parseHardwareFields("ledDisplay", { pixelPitch: "2.5", dimensions: "300", totalSqm: "999" }), { pixelPitch: "2.5" });
assert.deepEqual(displayHardwareFields("ledDisplay", { resolution: "2300*800", pixelPitch: "2.5", dimensions: "300", totalSqm: "999" }), { resolution: "2300 × 800", pixelPitch: "2.5" });
assert.deepEqual(displayHardwareFields("ledDisplay", { dimensions: "300", totalSqm: "999" }), {});
const surveyFields = { installation_date: "2024-02-29", installed_by: "Rasal", module_type: "COB", module_batch: "Batch-001", width_mm: "5750.25", height_mm: "2000", total_sqm: "11.6" };
assert.deepEqual(parseHardwareFields("ledDisplay", surveyFields), surveyFields);
for (const module_type of ["COB", "SMD", "RGB"]) assert.equal(parseHardwareFields("ledDisplay", { module_type }).module_type, module_type);
for (const module_type of ["cob", "Other", "<script>"]) assert.throws(() => parseHardwareFields("ledDisplay", { module_type }));
for (const installation_date of ["2023-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-01-00", "0000-01-01", "2026-1-01", "2026-11-02T00:00:00Z", "not-a-date"]) assert.throws(() => parseHardwareFields("ledDisplay", { installation_date }));
for (const installation_date of ["0001-01-01", "2000-02-29", "2026-11-02", "9999-12-31"]) assert.equal(parseHardwareFields("ledDisplay", { installation_date }).installation_date, installation_date);
for (const key of ["width_mm", "height_mm", "total_sqm"]) {
  for (const value of ["0", "0.00", "5750", "0.125", "1234567.890123"]) assert.equal(parseHardwareFields("ledDisplay", { [key]: value })[key], value);
  for (const value of ["-1", "NaN", "Infinity", "1e3", "1,234", "1.2.3", "abc"]) assert.throws(() => parseHardwareFields("ledDisplay", { [key]: value }));
}
assert.deepEqual(parseHardwareFields("ledDisplay", { installation_date: "", module_type: "", width_mm: "", total_sqm: "", installed_by: "  Installer  " }), { installed_by: "Installer" });
const measuredAndCalculated = parseHardwareFields("ledDisplay", { ...surveyFields, resolution: "2300x800", pixelPitch: "2.5", totalSqm: "999", dimensions: "999" });
assert.equal(measuredAndCalculated.total_sqm, "11.6");
assert.equal(measuredAndCalculated.totalSqm, undefined);
assert.equal(measuredAndCalculated.dimensions, undefined);
assert.equal(measuredAndCalculated.width_mm, "5750.25");
const changedCalculation = displayHardwareFields("ledDisplay", { ...measuredAndCalculated, pixelPitch: "3" });
assert.equal(changedCalculation.total_sqm, "11.6");
assert.equal(changedCalculation.totalSqm, undefined);
assert.equal(changedCalculation.width_mm, "5750.25");
assert.equal(changedCalculation.height_mm, "2000");
assert.equal(manualLedSize(changedCalculation.width_mm, changedCalculation.height_mm).ratio, 5750.25 / 2000);
assert.deepEqual(displayHardwareFields("ledDisplay", surveyFields), surveyFields);
for (const section of ["ledController", "mediaPlayer", "powerNetwork"]) assert.throws(() => parseHardwareFields(section, surveyFields));
const controllerFields = { brand: "NovaStar", model: "Controller", serialNumber: "CTRL-001", sendingCard: "MCTRL", receivingCard: "RC-001", firmware: "1.0", ipAddress: "192.168.1.20", sending_card_serial: "SEND-001", hub_card_model: "HUB75", video_input: "HDMI", rgb_mixing: "Red, green and blue tested", rack_cleaning: "Yes", novalct_connected: "No", sending_card_labelled: "Yes" };
assert.deepEqual(parseHardwareFields("ledController", controllerFields), controllerFields);
assert.deepEqual(parseHardwareFields("ledController", { brand: "Legacy", sendingCard: "Old model", receivingCard: "Old ID" }), { brand: "Legacy", sendingCard: "Old model", receivingCard: "Old ID" });
for (const video_input of ["HDMI", "DP", "DVI", "SDI"]) assert.equal(parseHardwareFields("ledController", { video_input }).video_input, video_input);
for (const video_input of ["hdmi", "VGA", "DisplayPort", true, 1]) assert.throws(() => parseHardwareFields("ledController", { video_input }));
for (const key of ["rack_cleaning", "novalct_connected", "sending_card_labelled"]) {
  for (const value of ["Yes", "No"]) assert.equal(parseHardwareFields("ledController", { [key]: value })[key], value);
  for (const value of ["yes", "NO", "N/A", "true", true, 0, null]) assert.throws(() => parseHardwareFields("ledController", { [key]: value }));
  assert.deepEqual(parseHardwareFields("ledController", { [key]: "" }), {});
  assert.deepEqual(hardwareFieldOptions("ledController", key), ["Yes", "No"]);
}
assert.deepEqual(parseHardwareFields("ledController", { video_input: "", rack_cleaning: "", novalct_connected: "", sending_card_labelled: "", rgb_mixing: "", sending_card_serial: "", hub_card_model: "" }), {});
assert.deepEqual(parseHardwareFields("ledController", { rgb_mixing: "  Colours match  ", video_input: " DP " }), { rgb_mixing: "Colours match", video_input: "DP" });
for (const key of ["sending_card_serial", "hub_card_model", "rgb_mixing"]) {
  assert.throws(() => parseHardwareFields("ledController", { [key]: "x".repeat(201) }));
  assert.throws(() => parseHardwareFields("ledController", { [key]: "A\nB" }));
}
assert.deepEqual(hardwareFieldOptions("ledController", "video_input"), ["HDMI", "DP", "DVI", "SDI"]);
assert.deepEqual(hardwareFieldOptions("ledDisplay", "module_type"), ["COB", "SMD", "RGB"]);
assert.equal(hardwareFieldOptions("ledController", "brand"), null);
assert.equal(hardwareFieldOptions("mediaPlayer", "rack_cleaning"), null);
for (const section of ["ledDisplay", "mediaPlayer", "powerNetwork"]) assert.throws(() => parseHardwareFields(section, { video_input: "HDMI" }));
const playerFields = { assetId: "PLAYER-001", model: "Existing PC", serialNumber: "SERIAL-001", specifications: "i5 / 16 GB / 256 GB", macAddress: "AA:BB:CC:DD:EE:FF", ipAddress: "192.168.1.30", cmsSoftware: "OnSign", cmsDeviceId: "manual-player-id", connectivity: "LAN", installation_date: "2024-02-29", installed_by: "Installer", labelled: "No" };
assert.deepEqual(parseHardwareFields("mediaPlayer", playerFields), playerFields);
for (const connectivity of ["LAN", "Wi-Fi", "4G"]) assert.equal(parseHardwareFields("mediaPlayer", { connectivity }).connectivity, connectivity);
for (const connectivity of ["Wifi", "WiFi", "lan", "5G", true, 0]) assert.throws(() => parseHardwareFields("mediaPlayer", { connectivity }));
for (const labelled of ["Yes", "No"]) assert.equal(parseHardwareFields("mediaPlayer", { labelled }).labelled, labelled);
for (const labelled of ["yes", "NO", "N/A", true, null]) assert.throws(() => parseHardwareFields("mediaPlayer", { labelled }));
for (const installation_date of ["2023-02-29", "1900-02-29", "2026-04-31", "0000-01-01", "2026-1-01", "2026-11-02T00:00:00Z"]) assert.throws(() => parseHardwareFields("mediaPlayer", { installation_date }));
for (const installation_date of ["0001-01-01", "2000-02-29", "2026-11-02", "9999-12-31"]) assert.equal(parseHardwareFields("mediaPlayer", { installation_date }).installation_date, installation_date);
assert.deepEqual(parseHardwareFields("mediaPlayer", { connectivity: "", installation_date: "", installed_by: "", labelled: "" }), {});
assert.deepEqual(parseHardwareFields("mediaPlayer", { installed_by: "  Installer  ", labelled: " No " }), { installed_by: "Installer", labelled: "No" });
assert.throws(() => parseHardwareFields("mediaPlayer", { installed_by: "x".repeat(201) }));
assert.throws(() => parseHardwareFields("mediaPlayer", { installed_by: "A\nB" }));
assert.deepEqual(hardwareFieldOptions("mediaPlayer", "connectivity"), ["LAN", "Wi-Fi", "4G"]);
assert.deepEqual(hardwareFieldOptions("mediaPlayer", "labelled"), ["Yes", "No"]);
for (const section of ["ledDisplay", "ledController", "powerNetwork"]) assert.throws(() => parseHardwareFields(section, { connectivity: "LAN" }));
const lcdFields = { tv_model: "LCD-55", tv_size: "55.5", manufactured_by: "Manufacturer", installed_by: "Installer" };
assert.deepEqual(parseHardwareFields("lcd", lcdFields), lcdFields);
for (const tv_size of ["0", "0.5", "55", "55.5"]) assert.equal(parseHardwareFields("lcd", { tv_size }).tv_size, tv_size);
for (const tv_size of ["-1", "NaN", "Infinity", "1e3", "55 inches", "1,5", true, 55]) assert.throws(() => parseHardwareFields("lcd", { tv_size }));
assert.deepEqual(parseHardwareFields("lcd", { tv_model: "  LCD-55  ", tv_size: "", manufactured_by: "", installed_by: "" }), { tv_model: "LCD-55" });
assert.deepEqual(displayHardwareFields("lcd", lcdFields), lcdFields);
for (const key of ["tv_model", "manufactured_by", "installed_by"]) {
  assert.throws(() => parseHardwareFields("lcd", { [key]: "x".repeat(201) }));
  assert.throws(() => parseHardwareFields("lcd", { [key]: "A\nB" }));
}
assert.throws(() => parseHardwareFields("lcd", { resolution: "1920x1080" }));
assert.throws(() => parseHardwareFields("ledDisplay", { tv_size: "55" }));
const wallFields = { tv_model: "VW-55", display_qty: "6", layout: "3 columns x 2 rows", screen_size: "55.5", resolution: "1920 × 1080", total_width_mm: "3650.25", total_height_mm: "1370", manufactured_by: "Manufacturer", installed_by: "Installer" };
assert.deepEqual(parseHardwareFields("video_wall", wallFields), wallFields);
assert.deepEqual(displayHardwareFields("video_wall", wallFields), wallFields);
for (const key of ["display_qty", "screen_size", "total_width_mm", "total_height_mm"]) {
  for (const value of ["0", "0.5", "6", "3650.25"]) assert.equal(parseHardwareFields("video_wall", { [key]: value })[key], value);
  for (const value of ["-1", "NaN", "Infinity", "1e3", "1,5", true, 6]) assert.throws(() => parseHardwareFields("video_wall", { [key]: value }));
}
for (const resolution of ["1920x1080", "1920 X 1080", "1920*1080", "1920 × 1080"]) assert.equal(parseHardwareFields("video_wall", { resolution }).resolution, "1920 × 1080");
for (const resolution of ["1920", "0x1080", "1920x0", "1920.5x1080", "1920x1080x2", "1000000x1080"]) assert.throws(() => parseHardwareFields("video_wall", { resolution }));
assert.deepEqual(parseHardwareFields("video_wall", { tv_model: "", display_qty: "", layout: "", screen_size: "", resolution: "", total_width_mm: "", total_height_mm: "", manufactured_by: "", installed_by: "" }), {});
assert.deepEqual(parseHardwareFields("video_wall", { layout: "  Custom layout  " }), { layout: "Custom layout" });
for (const key of ["tv_model", "layout", "manufactured_by", "installed_by"]) {
  assert.throws(() => parseHardwareFields("video_wall", { [key]: "x".repeat(201) }));
  assert.throws(() => parseHardwareFields("video_wall", { [key]: "A\nB" }));
}
assert.throws(() => parseHardwareFields("video_wall", { pixelPitch: "2.5" }));
assert.throws(() => parseHardwareFields("lcd", { display_qty: "6" }));
console.log("Screen hardware validation passed.");
