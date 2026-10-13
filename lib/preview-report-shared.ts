export const REPORT_THRESHOLDS = [20, 60, 120, 180, 300, 600] as const;
export type ReportThreshold = typeof REPORT_THRESHOLDS[number];
export const REPORT_DURATION_OPTIONS = [
  {id:"all",label:"All (20+ minutes)",min:20},
  {id:"20",label:"20–59 minutes",min:20,max:60},
  {id:"60",label:"1–2 hours",min:60,max:120},
  {id:"120",label:"2–3 hours",min:120,max:180},
  {id:"180",label:"3–5 hours",min:180,max:300},
  {id:"300",label:"5–10 hours",min:300,max:600},
  {id:"600",label:"10+ hours",min:600},
] as const;
export type PreviewReportRow = {
  incidentId:string; screenId:string; screenName:string; locationId:string; locationName:string;
  regionId:string; regionName:string; countryId:string; countryName:string;
  unavailableSince:string; lastSuccessAt:string | null; lastCheckedAt:string;
};
export function thresholdLabel(minutes:number) {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}
