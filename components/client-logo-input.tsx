"use client";
/* eslint-disable @next/next/no-img-element -- Local file previews and authenticated raster endpoint. */
import {useEffect,useRef,useState} from "react";
import {clientLogoUrl} from "./client-logo";
export type ClientLogoDraft={file:File|null;remove:boolean};
export default function ClientLogoInput({clientId,logoKey,draft,onChange,disabled=false,kind="logo"}:{clientId?:string;logoKey?:string|null;draft:ClientLogoDraft;onChange:(draft:ClientLogoDraft)=>void;disabled?:boolean;kind?:"logo"|"background"}) {
  const inputRef=useRef<HTMLInputElement>(null);
  const [preview,setPreview]=useState<{file:File;url:string}|null>(null);
  useEffect(()=>{
    const file=draft.file;
    if(!file || file.size>2*1024*1024 || !["image/png","image/jpeg","image/webp"].includes(file.type)) return;
    const reader=new FileReader();let active=true;
    reader.onload=()=>{if(active && typeof reader.result==="string")setPreview({file,url:reader.result});};
    reader.readAsDataURL(file);
    return()=>{active=false;if(reader.readyState===FileReader.LOADING)reader.abort();};
  },[draft.file]);
  const source=draft.file ? (preview?.file===draft.file?preview.url:null) : (!draft.remove && clientId && logoKey ? (kind === "logo" ? clientLogoUrl(clientId,logoKey) : `/api/client-background?client=${encodeURIComponent(clientId)}&v=${encodeURIComponent(logoKey)}`):null);
  return <div className="clients-logo-editor">
    <label className="clients-field">{kind === "logo" ? "Client logo (optional)" : "Card background (optional)"}<input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={e=>onChange({file:e.target.files?.[0]||null,remove:draft.remove})}/></label>
    <p>PNG, JPG or WebP · Up to 2 MB</p>
    {source && <div className={`clients-logo-preview ${kind === "background" ? "clients-background-preview" : ""}`}><img src={source} alt={`${kind === "logo" ? "Client logo" : "Card background"} preview`}/></div>}
    {(source || draft.file) && <button type="button" className="adm-secondary-btn" disabled={disabled} onClick={()=>{if(inputRef.current)inputRef.current.value="";onChange({file:null,remove:true});}}>Remove {kind}</button>}
  </div>;
}
