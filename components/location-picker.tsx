"use client";

import { useId } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LocationPicker({label, value, options, onChange, placeholder, disabled = false}: {
  label: string; value: string; options: {id: string; name: string}[];
  onChange: (value: string) => void; placeholder: string; disabled?: boolean;
}) {
  const id = useId();
  const allValue = "all-locations-option";
  const hasAll = options.some(option => option.id === "");
  return <div className="adm-location-field"><span id={id}>{label}</span>
    <Select value={value || (hasAll ? allValue : "")} onValueChange={next=>onChange(next === allValue ? "" : next)} disabled={disabled}>
      <SelectTrigger className="adm-location-trigger" aria-labelledby={id}><SelectValue placeholder={placeholder}/></SelectTrigger>
      <SelectContent className="adm-location-options" position="popper" align="start">
        {options.map(option => <SelectItem key={option.id} value={option.id || allValue}>{option.name}</SelectItem>)}
        {!options.length && <p className="adm-picker-hint" style={{padding:"12px"}}>No {label.toLowerCase()} options available.</p>}
      </SelectContent>
    </Select>
  </div>;
}
