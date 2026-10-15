"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import "./settings-tabs.css";

const tabs = [
  { id: "email-alerts", label: "Email alerts" },
  { id: "whatsapp-alerts", label: "WhatsApp alerts" },
  { id: "monitoring", label: "Monitoring" },
  { id: "account-security", label: "Account security" },
] as const;
type TabId = typeof tabs[number]["id"];

export default function SettingsTabs({ email, whatsapp, monitoring, account }: { email: ReactNode; whatsapp: ReactNode; monitoring: ReactNode; account: ReactNode }) {
  const [active, setActive] = useState<TabId>("email-alerts");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    const restore = () => {
      const id = window.location.hash.slice(1);
      setActive(tabs.find(tab => tab.id === id)?.id || "email-alerts");
    };
    restore();
    window.addEventListener("hashchange", restore);
    window.addEventListener("popstate", restore);
    return () => { window.removeEventListener("hashchange", restore); window.removeEventListener("popstate", restore); };
  }, []);
  function select(id: TabId) {
    setActive(id);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${id}`);
  }
  const panels = [email, whatsapp, monitoring, account];
  return <div className="adm-settings">
    <div className="adm-settings-tabs" role="tablist" aria-label="Settings sections">
      {tabs.map((tab, index) => <button key={tab.id} ref={node => { buttons.current[index] = node; }}
        type="button" role="tab" id={`settings-tab-${tab.id}`} aria-controls={`settings-panel-${tab.id}`}
        aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
        onClick={() => select(tab.id)} onKeyDown={event => {
          const target = event.key === "ArrowRight" ? (index + 1) % tabs.length
            : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (target === null) return;
          event.preventDefault(); select(tabs[target].id); buttons.current[target]?.focus();
        }}>{tab.label}</button>)}
    </div>
    {tabs.map((tab, index) => <div key={tab.id} role="tabpanel" id={`settings-panel-${tab.id}`}
      aria-labelledby={`settings-tab-${tab.id}`} hidden={active !== tab.id} tabIndex={0}
      className="adm-settings-panel">{panels[index]}</div>)}
  </div>;
}
