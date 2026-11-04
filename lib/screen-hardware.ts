export const ledModuleTypes = ["COB", "SMD", "RGB"] as const;
export const controllerVideoInputs = ["HDMI", "DP", "DVI", "SDI"] as const;
export const controllerYesNoFields = ["rack_cleaning", "novalct_connected", "sending_card_labelled"] as const;
export const mediaPlayerConnectivity = ["LAN", "Wi-Fi", "4G"] as const;
const yesNoOptions = ["Yes", "No"] as const;

export const hardwareSections = {
  ledDisplay: {
    title: "LED display",
    fields: [
      ["assetId", "Asset ID"], ["manufacturer", "Manufacturer"], ["model", "Model"],
      ["serialNumber", "Serial number"],
      ["installation_date", "Installation date"], ["installed_by", "Installed by"],
      ["pixelPitch", "Pixel pitch (mm)"], ["module_type", "Module type"],
      ["module_batch", "Module batch"],
      ["resolution", "Resolution (px)"], ["cabinetQuantity", "Cabinet quantity"],
      ["width_mm", "Width (mm)"], ["height_mm", "Height (mm)"],
      ["total_sqm", "Total area (m²)"],
      ["installationLocation", "Installation location"],
    ],
  },
  ledController: {
    title: "Sending card & controller",
    fields: [
      ["brand", "Controller brand"], ["model", "Controller model"], ["serialNumber", "Controller serial number"],
      ["sendingCard", "Sending card model"], ["sending_card_serial", "Sending card serial number"],
      ["receivingCard", "Receiving card ID"], ["hub_card_model", "Hub card model"],
      ["video_input", "Video signal input"], ["rgb_mixing", "RGB colour mixing test result"],
      ["rack_cleaning", "Rack cleaning done"], ["novalct_connected", "Connected to NovaLCT"],
      ["sending_card_labelled", "Sending card labelled"],
      ["firmware", "Firmware"], ["ipAddress", "IP address"],
    ],
  },
  mediaPlayer: {
    title: "Media player",
    fields: [
      ["assetId", "Asset ID"], ["model", "PC / player model"], ["serialNumber", "Serial number"],
      ["connectivity", "Connectivity type"], ["installation_date", "Installation date"],
      ["installed_by", "Installed by"], ["labelled", "Media player labelled"],
      ["specifications", "CPU / RAM / SSD"], ["macAddress", "MAC address"],
      ["ipAddress", "IP address"], ["cmsSoftware", "CMS software"],
      ["cmsDeviceId", "CMS device ID"],
    ],
  },
  lcd: {
    title: "LCD TV",
    fields: [
      ["tv_model", "LCD TV model"], ["tv_size", "LCD TV size (inches)"],
      ["manufactured_by", "Manufactured by"], ["installed_by", "Installed by"],
    ],
  },
  video_wall: {
    title: "Video Wall",
    fields: [
      ["tv_model", "Video wall TV model"], ["display_qty", "Number of displays"],
      ["layout", "Layout"], ["screen_size", "Screen size per display (inches)"],
      ["resolution", "Resolution per display (px)"],
      ["total_width_mm", "Video wall total width (mm)"], ["total_height_mm", "Video wall total height (mm)"],
      ["manufactured_by", "Manufactured by"], ["installed_by", "Installed by"],
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
export function hardwareSectionsForType(screenType: string | null): HardwareSection[] {
  if (screenType === "LED") return ["ledDisplay", "ledController", "mediaPlayer", "powerNetwork"];
  if (screenType === "LCD") return ["lcd", "mediaPlayer"];
  if (screenType === "Video Wall") return ["video_wall", "mediaPlayer"];
  return [];
}
export function isHardwareSection(value: unknown): value is HardwareSection {
  return typeof value === "string" && Object.hasOwn(hardwareSections, value);
}

export function hardwareFieldOptions(section: HardwareSection, key: string): readonly string[] | null {
  if (section === "ledDisplay" && key === "module_type") return ledModuleTypes;
  if (section === "ledController") {
    if (key === "video_input") return controllerVideoInputs;
    if (controllerYesNoFields.some(field => field === key)) return yesNoOptions;
  }
  if (section === "mediaPlayer") {
    if (key === "connectivity") return mediaPlayerConnectivity;
    if (key === "labelled") return yesNoOptions;
  }
  return null;
}

const resolutionPattern = /^([1-9]\d{0,5})\s*[xX×*]\s*([1-9]\d{0,5})$/;
const pitchPattern = /^\d{1,6}(?:\.\d{1,3})?$/;
export function manualLedSize(widthMm = "", heightMm = "") {
  if (![widthMm, heightMm].every(value => /^\d+(?:\.\d+)?$/.test(value.trim()) && Number.isFinite(Number(value)) && Number(value) > 0)) return null;
  const ratio = Number(widthMm) / Number(heightMm);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return { width: widthMm.trim(), height: heightMm.trim(), ratio };
}

export function displayHardwareFields(section: HardwareSection, fields: HardwareFields): HardwareFields {
  if (section !== "ledDisplay") return fields;
  const result = { ...fields };
  delete result.dimensions;
  delete result.totalSqm;
  const resolution = result.resolution?.match(resolutionPattern);
  if (resolution) result.resolution = `${Number(resolution[1])} × ${Number(resolution[2])}`;
  return result;
}

export function parseHardwareFields(section: HardwareSection, value: unknown): HardwareFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter valid hardware details.");
  const allowed = new Set<string>(hardwareSections[section].fields.map(([key]) => key));
  // Accept older clients' derived fields for compatibility, but never display or use them as measurements.
  if (section === "ledDisplay") { allowed.add("dimensions"); allowed.add("totalSqm"); }
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
  if (section === "video_wall") {
    for (const key of ["display_qty", "screen_size", "total_width_mm", "total_height_mm"]) {
      if (fields[key] && (!/^\d+(?:\.\d+)?$/.test(fields[key]) || !Number.isFinite(Number(fields[key])))) throw new Error("Video wall quantities and measurements must be zero or positive decimal numbers.");
    }
    if (fields.resolution) {
      const match = fields.resolution.match(resolutionPattern);
      if (!match) throw new Error("Enter per-display resolution as width × height in pixels, for example 1920 × 1080.");
      fields.resolution = `${Number(match[1])} × ${Number(match[2])}`;
    }
  }
  if (section === "lcd" && fields.tv_size && (!/^\d+(?:\.\d+)?$/.test(fields.tv_size) || !Number.isFinite(Number(fields.tv_size)))) throw new Error("LCD TV size must be zero or a positive decimal number in inches.");
  if (section === "ledController") {
    if (fields.video_input && !controllerVideoInputs.some(input => input === fields.video_input)) throw new Error("Choose HDMI, DP, DVI or SDI for the video input.");
    for (const key of controllerYesNoFields) {
      if (fields[key] && !yesNoOptions.some(option => option === fields[key])) throw new Error("Choose Yes or No for controller inspection details.");
    }
  }
  if (section === "mediaPlayer") {
    if (fields.connectivity && !mediaPlayerConnectivity.some(option => option === fields.connectivity)) throw new Error("Choose LAN, Wi-Fi or 4G for media player connectivity.");
    if (fields.labelled && !yesNoOptions.some(option => option === fields.labelled)) throw new Error("Choose Yes or No for media player labelling.");
  }
  if (section === "ledDisplay" || section === "mediaPlayer") {
    if (fields.installation_date) {
      const date = fields.installation_date;
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith("0000-") ? new Date(date + "T00:00:00Z") : null;
      if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("Enter a valid installation date as YYYY-MM-DD.");
    }
  }
  if (section === "ledDisplay") {
    if (fields.module_type && !ledModuleTypes.some(type => type === fields.module_type)) throw new Error("Choose COB, SMD or RGB for the module type.");
    for (const key of ["width_mm", "height_mm", "total_sqm"]) {
      if (fields[key] && (!/^\d+(?:\.\d+)?$/.test(fields[key]) || !Number.isFinite(Number(fields[key])))) throw new Error("Measured dimensions and survey-reported area must be zero or positive decimal numbers.");
    }
    if (fields.pixelPitch && (!pitchPattern.test(fields.pixelPitch) || Number(fields.pixelPitch) <= 0)) throw new Error("Pixel pitch must be a positive number in millimeters.");
    if (fields.resolution && !resolutionPattern.test(fields.resolution)) throw new Error("Enter resolution as width × height in pixels, for example 2300 × 800.");
    return displayHardwareFields(section, fields);
  }
  return fields;
}
