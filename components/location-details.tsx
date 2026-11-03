"use client";
import { locationDetailFields, type LocationDetailFields } from "@/lib/location-details";
import "./location-details.css";

export function LocationDetailsInput({ value, onChange, disabled }: { value: LocationDetailFields; onChange: (value: LocationDetailFields) => void; disabled: boolean }) {
  return <section className="adm-location-details"><h3>Location details <small>(optional)</small></h3><div className="adm-location-details-grid">{locationDetailFields.map(([key, label, limit]) => <label key={key} className={key === "address" || key === "access_notes" ? "adm-location-detail-wide" : undefined}>{label}{key === "access_notes" ? <textarea maxLength={limit} rows={3} disabled={disabled} value={value[key] || ""} onChange={event => onChange({ ...value, [key]: event.target.value })}/> : <input type={key === "contact_email" ? "email" : key === "contact_phone" ? "tel" : "text"} inputMode={key === "gps_lat" || key === "gps_lng" ? "decimal" : undefined} maxLength={limit} disabled={disabled} value={value[key] || ""} onChange={event => onChange({ ...value, [key]: event.target.value })}/>}</label>)}</div></section>;
}
export function LocationDetailsView({ fields }: { fields: LocationDetailFields }) {
  return <dl className="adm-location-details-grid adm-location-details-view">{locationDetailFields.map(([key, label]) => <div key={key} className={key === "address" || key === "access_notes" ? "adm-location-detail-wide" : undefined}><dt>{label}</dt><dd>{fields[key] || "Not recorded"}</dd></div>)}</dl>;
}
