"use client";
import { useSyncExternalStore } from "react";
import Workspace from "@/components/workspace";

const subscribe = (callback: () => void) => { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); };
const subscribeReady = () => () => {};
const readKey = () => {
  const key = new URLSearchParams(window.location.hash.slice(1)).get("key");
  return key === null ? "" : /^[a-f0-9]{64}$/.test(key) ? key : "invalid";
};
// Keep the key in the fragment so it is never part of a page request or referrer.
export default function MonitorPage() {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const key = useSyncExternalStore(subscribe, readKey, () => "");
  if (!ready) return <div className="app-shell app-shell-monitor" data-wall-theme="dark"><div className="loading-panel">Starting monitor…</div></div>;
  return <Workspace key={key} view="monitor" monitorKey={key} />;
}
