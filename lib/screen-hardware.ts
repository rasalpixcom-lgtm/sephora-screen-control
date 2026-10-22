export const hardwareSections = {
  ledDisplay: {
    title: "LED display",
    fields: [
      ["assetId", "Asset ID"], ["manufacturer", "Manufacturer"], ["model", "Model"],
      ["serialNumber", "Serial number"], ["pixelPitch", "Pixel pitch (mm)"],
      ["resolution", "Resolution (px)"], ["dimensions", "Width × height (m)"],
      ["totalSqm", "Total sqm"], ["cabinetQuantity", "Cabinet quantity"],
      ["installationLocation", "Installation location"],
    ],
  },
  ledController: {
    title: "LED controller",
    fields: [
      ["brand", "Controller brand"], ["model", "Model"], ["serialNumber", "Serial number"],
      ["sendingCard", "Sending card"], ["receivingCard", "Receiving card"],
      ["firmware", "Firmware"], ["ipAddress", "IP address"],
    ],
  },
  mediaPlayer: {
    title: "Media player",
    fields: [
      ["assetId", "Asset ID"], ["model", "PC / player model"], ["serialNumber", "Serial number"],
      ["specifications", "CPU / RAM / SSD"], ["macAddress", "MAC address"],
      ["ipAddress", "IP address"], ["cmsSoftware", "CMS software"],
      ["cmsDeviceId", "CMS device ID"],
    ],
  },
  powerNetwork: {
    title: "Power & network",
    fields: [
      ["powerSupplyModel", "Power supply model"], ["quantity", "Quantity"],
      ["networkSwitch", "Switch"], ["switchPort", "Switch port"],
      ["networkIp", "Network IP"], ["ups", "UPS"], ["pdu", "PDU"],
    ],
  },
} as const;

export type HardwareSection = keyof typeof hardwareSections;
export type HardwareFields = Record<string, string>;
export type HardwareRecord = { fields: HardwareFields; version: string | null; updatedAt: string | null };
export const hardwareSectionIds = Object.keys(hardwareSections) as HardwareSection[];
export function isHardwareSection(value: unknown): value is HardwareSection {
  return typeof value === "string" && Object.hasOwn(hardwareSections, value);
}

const resolutionPattern = /^([1-9]\d{0,5})\s*[xX×*]\s*([1-9]\d{0,5})$/;
const pitchPattern = /^\d{1,6}(?:\.\d{1,3})?$/;
const formatMeasurement = (value: number) => Number(value.toFixed(6)).toString();

export function calculateLedDisplay(resolution: string, pixelPitch: string) {
  const match = resolution.trim().match(resolutionPattern);
  const pitch = Number(pixelPitch.trim());
  if (!match || !pitchPattern.test(pixelPitch.trim()) || !Number.isFinite(pitch) || pitch <= 0) return null;
  const width = Number(match[1]) * pitch / 1000;
  const height = Number(match[2]) * pitch / 1000;
  return {
    resolution: `${Number(match[1])} × ${Number(match[2])}`,
    dimensions: `${formatMeasurement(width)} × ${formatMeasurement(height)}`,
    totalSqm: formatMeasurement(width * height),
  };
}

export function displayHardwareFields(section: HardwareSection, fields: HardwareFields): HardwareFields {
  if (section !== "ledDisplay") return fields;
  const result = { ...fields };
  delete result.dimensions;
  delete result.totalSqm;
  const calculated = calculateLedDisplay(result.resolution || "", result.pixelPitch || "");
  if (calculated) Object.assign(result, calculated);
  return result;
}

export function parseHardwareFields(section: HardwareSection, value: unknown): HardwareFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter valid hardware details.");
  const allowed = new Set<string>(hardwareSections[section].fields.map(([key]) => key));
  const fields: HardwareFields = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!allowed.has(key) || typeof raw !== "string") throw new Error("Enter valid hardware details.");
    const trimmed = raw.trim();
    if (trimmed.length > 200 || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error("Each detail must be 200 characters or fewer, without line breaks.");
    if (trimmed) fields[key] = trimmed;
  }
  for (const key of ["cabinetQuantity", "quantity"]) {
    if (fields[key] && (!/^[1-9]\d{0,5}$/.test(fields[key]))) throw new Error("Quantities must be positive whole numbers.");
  }
  if (section === "ledDisplay") {
    if (fields.pixelPitch && (!pitchPattern.test(fields.pixelPitch) || Number(fields.pixelPitch) <= 0)) throw new Error("Pixel pitch must be a positive number in millimeters.");
    if (fields.resolution && !resolutionPattern.test(fields.resolution)) throw new Error("Enter resolution as width × height in pixels, for example 2300 × 800.");
    return displayHardwareFields(section, fields);
  }
  return fields;
}
