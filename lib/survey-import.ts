import { hardwareSections, hardwareSectionsForType, parseHardwareFields, type HardwareSection } from "./screen-hardware";
import { parsePpmFields, ppmChecks } from "./screen-ppm-inspection";

export const SURVEY_TEXT_LIMIT = 24000;
export type SurveyType = "LED" | "LCD" | "Video Wall";
export type SurveyFields = Record<string, string>;
export type Survey = { source: string; screenType: SurveyType; hardware: Partial<Record<HardwareSection, SurveyFields>>; ppm: SurveyFields; skipped: number };
export type SurveyRow = { id: string; section: HardwareSection | "ppm"; key: string; group: string; label: string; current: string; incoming: string; selected: boolean };
export type SurveyPreview = { screenId: string; screenName: string; location: string; source: string; currentType: string | null; screenType: SurveyType; fingerprint: string; rows: SurveyRow[]; warnings: string[]; skipped: number };
export const ppmImportLabels = [...ppmChecks, ["ppmDate", "PPM date"], ["clientProject", "Client / project"], ["overallStatus", "Overall status"], ["nextPpmDate", "Next PPM date"], ["findings", "Defects / findings"], ["correctiveAction", "Corrective action"]] as const;
const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const aliases: Partial<Record<HardwareSection, Record<string, string>>> = {
  ledDisplay: { "Screen width (pixels)": "_width", "Screen height (pixels)": "_height", "Screen width (mm)": "width_mm", "Screen height (mm)": "height_mm", "Total sqm": "total_sqm" },
  ledController: { "Sending card serial no.": "sending_card_serial", "RGB colour mixing": "rgb_mixing", "Sending card connected to NovaLCT": "novalct_connected", "Controller IP address": "ipAddress" },
  mediaPlayer: { "Media player model": "model" },
  powerNetwork: { "Power supply quantity": "quantity" },
};

export function parseSurveyText(value: unknown): Survey {
  if (typeof value !== "string" || !value.trim() || value.length > SURVEY_TEXT_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error("Paste one screen’s Copy fields text, up to 24,000 characters.");
  const headers = new Map<string, string>([["screen type", "type"], ["ppm inspection", "ppm"], ...Object.entries(hardwareSections).map(([id, section]) => [normalize(section.title), id] as [string, string])]);
  const groups: Record<string, SurveyFields> = {};
  const seen = new Set<string>(), usedHeaders = new Set<string>();
  let group = "", last = "", source = "";
  for (const raw of value.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim(), header = headers.get(normalize(line));
    if (header) {
      if (usedHeaders.has(header)) throw new Error("Duplicate sections found. Paste only one screen at a time.");
      usedHeaders.add(header); group = header; groups[group] = {}; last = ""; continue;
    }
    if (!group) { if (line) { if (source) throw new Error("Unrecognized text before the survey sections."); source = line; } continue; }
    const definitions = group === "type" ? [["screenType", "Screen type"]] : group === "ppm" ? ppmImportLabels : hardwareSections[group as HardwareSection].fields;
    const labels = new Map<string, string>(definitions.map(([key, label]) => [normalize(label), key]));
    for (const [label, key] of Object.entries(aliases[group as HardwareSection] || {})) labels.set(normalize(label), key);
    const colon = line.indexOf(":"), key = colon < 0 ? undefined : labels.get(normalize(line.slice(0, colon)));
    if (key) {
      if (seen.has(`${group}.${key}`)) throw new Error(`Duplicate field: ${line.slice(0, colon)}.`);
      seen.add(`${group}.${key}`); groups[group][key] = line.slice(colon + 1).trim(); last = key;
    } else if (group === "ppm" && ["findings", "correctiveAction"].includes(last)) {
      groups[group][last] += "\n" + raw;
    } else if (line) throw new Error(`Unrecognized field in ${group}: ${line.slice(0, 100)}. Check the copied text.`);
  }
  const screenType = groups.type?.screenType;
  if (screenType !== "LED" && screenType !== "LCD" && screenType !== "Video Wall") throw new Error("The copied text must contain Screen type: LED, LCD or Video Wall.");
  const allowed = hardwareSectionsForType(screenType), hardware: Survey["hardware"] = {};
  let skipped = 0;
  for (const [id, input] of Object.entries(groups)) {
    if (id === "type") continue;
    skipped += Object.values(input).filter(value => !value.trim()).length;
    if (id === "ppm") continue;
    const section = id as HardwareSection;
    if (!allowed.includes(section)) throw new Error(`The ${hardwareSections[section].title} section does not match the copied screen type.`);
    const fields = Object.fromEntries(Object.entries(input).filter(([, value]) => value.trim()));
    if (section === "ledDisplay") {
      if (fields._width || fields._height) {
        if (!/^[1-9]\d{0,5}$/.test(fields._width || "") || !/^[1-9]\d{0,5}$/.test(fields._height || "")) throw new Error("Both screen width and height in pixels are required to import resolution.");
        if (fields.resolution) throw new Error("Supply either a resolution or separate pixel dimensions, not both.");
        fields.resolution = `${fields._width} × ${fields._height}`;
      }
      delete fields._width; delete fields._height;
    }
    try { hardware[section] = parseHardwareFields(section, fields); }
    catch (error) { throw new Error(`${hardwareSections[section].title}: ${(error as Error).message}`); }
  }
  let ppm: SurveyFields;
  try { ppm = { ...parsePpmFields(groups.ppm || {}) }; }
  catch (error) { throw new Error(`PPM inspection: ${(error as Error).message}`); }
  if (!Object.values(hardware).some(fields => Object.keys(fields).length) && !Object.keys(ppm).length) throw new Error("No filled hardware or PPM fields were found.");
  return { source, screenType, hardware, ppm, skipped };
}

export function surveyWarnings(survey: Survey, screenName: string, currentType: string | null, ppm: SurveyFields): string[] {
  const warnings: string[] = [];
  if (!survey.source) warnings.push("The copied text has no screen name. Confirm the selected target screen carefully.");
  else if (normalize(survey.source.split(/\s+—\s+/)[0]) !== normalize(screenName)) warnings.push("The copied screen name differs from the selected screen. Confirm they refer to the same physical screen.");
  if (currentType !== survey.screenType) warnings.push(`Screen type will change from ${currentType || "Not specified"} to ${survey.screenType}. Existing details and photos will be preserved.`);
  const match = survey.source.match(/(\d+)\s*[xX×]\s*(\d+)/);
  const resolution = survey.hardware.ledDisplay?.resolution;
  if (match && resolution && `${Number(match[1])} × ${Number(match[2])}` !== resolution) warnings.push("The resolution in the copied screen name differs from the entered LED pixel dimensions.");
  if (ppm.overallStatus === "Pass" && ppmChecks.some(([key]) => ppm[key] === "Fail")) warnings.push("PPM overall status is Pass, but at least one inspection check is Fail. Review both answers before saving.");
  return warnings;
}
