export const ppmChecks = [
  ["led_modules", "LED modules / dead pixels"],
  ["cabinet_alignment", "Cabinet alignment and mounting"],
  ["brightness_colour", "Brightness and colour uniformity"],
  ["power_wiring", "Power supply and wiring"],
  ["receiving_card", "Receiving card communication"],
  ["sending_card", "Sending card configuration"],
  ["ventilation_dust", "Ventilation and dust condition"],
  ["media_player_cms", "Media player playback and CMS sync"],
  ["network_cables", "Network connection and cables"],
  ["final_playback", "Final screen playback verification"],
] as const;

export const ppmCheckStatuses = ["Pass", "Fail", "N/A"] as const;
export const ppmOverallStatuses = ["Pass", "Fail", "Follow-up"] as const;
export const PPM_TEXT_MAX_LENGTH = 4000;
export type PpmCheckKey = typeof ppmChecks[number][0];
export type PpmCheckStatus = typeof ppmCheckStatuses[number];
export type PpmOverallStatus = typeof ppmOverallStatuses[number];
export type PpmFields = Partial<Record<PpmCheckKey, PpmCheckStatus>> & {
  ppmDate?: string; clientProject?: string; overallStatus?: PpmOverallStatus; nextPpmDate?: string; findings?: string; correctiveAction?: string;
};
export type PpmRecord = { fields: PpmFields; version: string | null; updatedAt: string | null };

const checkKeys = new Set<string>(ppmChecks.map(([key]) => key));
const permittedKeys = new Set(["ppmDate", "clientProject", "overallStatus", "nextPpmDate", "findings", "correctiveAction", ...checkKeys]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, label: string) {
  if (!datePattern.test(value) || value.startsWith("0000-")) throw new Error(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a real date.`);
  return value;
}

function parseText(value: unknown, label: string, maxLength: number, multiline = false) {
  if (typeof value !== "string") throw new Error(`Enter a valid ${label}.`);
  const text = (multiline ? value.replace(/\r\n?/g, "\n") : value).trim();
  if (text.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) || (!multiline && /[\r\n]/.test(text))) throw new Error(`${label} is too long or contains invalid characters.`);
  return text;
}

export function parsePpmFields(value: unknown): PpmFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter valid PPM inspection details.");
  const input = value as Record<string, unknown>;
  const fields: PpmFields = {};
  for (const key of Object.keys(input)) if (!permittedKeys.has(key)) throw new Error("Enter valid PPM inspection details.");
  for (const [key] of ppmChecks) {
    const raw = input[key];
    if (raw === undefined || raw === "") continue;
    if (typeof raw !== "string" || !ppmCheckStatuses.includes(raw as PpmCheckStatus)) throw new Error("Each PPM check must be Pass, Fail or N/A.");
    fields[key] = raw as PpmCheckStatus;
  }
  if (input.ppmDate !== undefined && input.ppmDate !== "") fields.ppmDate = parseDate(parseText(input.ppmDate, "PPM date", 10), "PPM date");
  if (input.nextPpmDate !== undefined && input.nextPpmDate !== "") fields.nextPpmDate = parseDate(parseText(input.nextPpmDate, "Next PPM date", 10), "Next PPM date");
  if (fields.ppmDate && fields.nextPpmDate && fields.nextPpmDate < fields.ppmDate) throw new Error("Next PPM date cannot be before the PPM date.");
  if (input.clientProject !== undefined) { const text = parseText(input.clientProject, "Client / project", 200); if (text) fields.clientProject = text; }
  if (input.overallStatus !== undefined && input.overallStatus !== "") {
    if (typeof input.overallStatus !== "string" || !ppmOverallStatuses.includes(input.overallStatus as PpmOverallStatus)) throw new Error("Overall status must be Pass, Fail or Follow-up.");
    fields.overallStatus = input.overallStatus as PpmOverallStatus;
  }
  if (input.findings !== undefined) { const text = parseText(input.findings, "Defects / findings", PPM_TEXT_MAX_LENGTH, true); if (text) fields.findings = text; }
  if (input.correctiveAction !== undefined) { const text = parseText(input.correctiveAction, "Corrective action", PPM_TEXT_MAX_LENGTH, true); if (text) fields.correctiveAction = text; }
  return fields;
}
