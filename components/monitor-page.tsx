"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import Workspace from "@/components/workspace";
import MonitorComplaintAlerts, { type ComplaintAlertTarget } from "@/components/monitor-complaint-alerts";

const subscribe = (callback: () => void) => { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); };
const subscribeReady = () => () => {};
const readFragment = () => window.location.hash.slice(1);
const validKey = (key: string | null): key is string => key !== null && /^[a-f0-9]{64}$/.test(key);

// Keep both keys in the fragment so neither is part of a page request or referrer.
export default function MonitorPage() {
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const fragment = useSyncExternalStore(subscribe, readFragment, () => "");
  const [activeTarget, setActiveTarget] = useState<{ key: string; target: ComplaintAlertTarget } | null>(null);
  const params = new URLSearchParams(fragment);
  const monitorKey = params.get("key");
  const alertKey = params.get("alerts");
  const key = monitorKey === null ? "" : validKey(monitorKey) ? monitorKey : "invalid";
  const commonMonitor = ready && new URLSearchParams(window.location.search).get("scope") === "all";
  const alertLink = commonMonitor && validKey(monitorKey) && validKey(alertKey)
    ? { monitorKey, alertKey, key: `${monitorKey}:${alertKey}` } : null;
  const alertLinkKey = alertLink?.key;
  const onTargetChange = useCallback((target: ComplaintAlertTarget | null) => {
    setActiveTarget(current => {
      if (target && alertLinkKey) return { key: alertLinkKey, target };
      return current?.key === alertLinkKey ? null : current;
    });
  }, [alertLinkKey]);
  if (!ready) return <div className="app-shell app-shell-monitor" data-wall-theme="dark"><div className="loading-panel">Starting monitor…</div></div>;
  return <>
    <Workspace key={key} view="monitor" monitorKey={key} commonMonitor={commonMonitor}
      complaintTarget={activeTarget?.key === alertLinkKey ? activeTarget?.target : undefined}/>
    {alertLink && (
      <MonitorComplaintAlerts key={alertLink.key} monitorKey={alertLink.monitorKey} alertKey={alertLink.alertKey} onTargetChange={onTargetChange}/>
    )}
  </>;
}
