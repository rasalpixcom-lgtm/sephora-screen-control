export const locationDetailFields = [
  ["address", "Address / unit number", 500],
  ["gps_lat", "Latitude", 30], ["gps_lng", "Longitude", 30],
  ["contact_name", "Store contact name", 120],
  ["contact_phone", "Store contact phone", 50],
  ["contact_email", "Store contact email", 254],
  ["working_hours", "Store working hours", 300],
  ["access_notes", "Access notes", 2000],
] as const;
export type LocationDetailKey = typeof locationDetailFields[number][0];
export type LocationDetailFields = Partial<Record<LocationDetailKey, string>>;
export type LocationDetails = { fields: LocationDetailFields; version: string };

export function parseLocationDetails(value: unknown): LocationDetailFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter valid location details.");
  const input = value as Record<string, unknown>, fields: LocationDetailFields = {};
  if (Object.keys(input).some(key => !locationDetailFields.some(([known]) => key === known))) throw new Error("Unknown location detail.");
  for (const [key, label, limit] of locationDetailFields) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string") throw new Error(`${label} must be text.`);
    const text = (input[key] as string).trim();
    if (text.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) || (key !== "access_notes" && /[\r\n\t]/.test(text))) throw new Error(`Enter a valid ${label.toLowerCase()} (up to ${limit} characters).`);
    if (text) fields[key] = text;
  }
  for (const [key, limit] of [["gps_lat", 90], ["gps_lng", 180]] as const) {
    const text = fields[key];
    if (text && (!/^-?\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text)) || Math.abs(Number(text)) > limit)) throw new Error(`${key === "gps_lat" ? "Latitude" : "Longitude"} must be between -${limit} and ${limit}.`);
  }
  if (!!fields.gps_lat !== !!fields.gps_lng) throw new Error("Enter both latitude and longitude, or leave both empty.");
  if (fields.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.contact_email)) throw new Error("Enter a valid store contact email.");
  return fields;
}
