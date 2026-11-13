"use client";
import { useState, type ReactNode } from "react";
import { Building2 } from "lucide-react";
import "./client-logo.css";
export function clientLogoUrl(clientId: string, version: string) {
  return `/api/client-logo?client=${encodeURIComponent(clientId)}&v=${encodeURIComponent(version)}`;
}
export default function ClientLogo({clientId,version,className="",fallback}: {clientId:string;version?:string|null;className?:string;fallback?:ReactNode}) {
  const source=version?clientLogoUrl(clientId,version):null;
  const [failedSource,setFailedSource]=useState<string|null>(null);
  return <div className={`client-logo ${source && failedSource!==source?"client-logo-loaded":""} ${className}`}>
    {source && failedSource!==source ? /* Authenticated, versioned raster endpoint. */
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={image=>{if(image?.complete && image.naturalWidth===0)setFailedSource(source);}} src={source} alt="" onError={()=>setFailedSource(source)}/> : fallback || <Building2 size={28} aria-hidden="true"/>}
  </div>;
}
