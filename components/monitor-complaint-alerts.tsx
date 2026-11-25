"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import "./monitor-complaint-alerts.css";

export type ComplaintAlertTarget = { clientId: string; screenId: string };

type Alert = {
  cursor: string;
  eventId: string;
  priority: "low" | "medium" | "high";
  clientName: string;
  storeName: string;
  screenName: string;
  issueLabel: string;
  target?: unknown;
};

type Presentation = {
  alert: Alert;
  minimumElapsed: boolean;
  speech: SpeechSynthesisUtterance | null;
};

const pollInterval = 3_000;
const minimumDisplayTime = 10_000;
const maximumSpeechTime = 45_000;
const highestCursor = "9223372036854775807";
const priorityLabel = { low: "Low priority", medium: "Medium priority", high: "High priority" };

function compareCursors(first: string, second: string) {
  return first.length - second.length || (first < second ? -1 : first > second ? 1 : 0);
}

function validCursor(value: unknown): value is string {
  return typeof value === "string" && /^(?:0|[1-9]\d{0,18})$/.test(value)
    && compareCursors(value, highestCursor) <= 0;
}

function validAlert(value: unknown): value is Alert {
  if (!value || typeof value !== "object") return false;
  const alert = value as Record<string, unknown>;
  return validCursor(alert.cursor) && (alert.priority === "low" || alert.priority === "medium" || alert.priority === "high")
    && [alert.eventId, alert.clientName, alert.storeName, alert.screenName, alert.issueLabel]
      .every(field => typeof field === "string" && field.trim().length > 0);
}

function readBatch(value: unknown, after: string | null) {
  if (!value || typeof value !== "object") return null;
  const { alerts, cursor, voiceEnabled } = value as Record<string, unknown>;
  if (!validCursor(cursor) || !Array.isArray(alerts)) return null;
  const status = { cursor, voiceEnabled: voiceEnabled === true };
  // The first request establishes the live position. Never present its contents.
  if (after === null) return { ...status, alerts: [] };
  if (compareCursors(cursor, after) < 0 || !alerts.every(validAlert)) return null;
  if (alerts.some(alert => compareCursors(alert.cursor, cursor) > 0)) return null;
  return { ...status, alerts: alerts.filter(alert => compareCursors(alert.cursor, after) > 0)
    .sort((first, second) => compareCursors(first.cursor, second.cursor)) };
}

function announcement(alert: Alert) {
  const intro = alert.priority === "high" ? "Alert. High priority complaint from" : "New complaint from";
  return `${intro} ${alert.clientName}, ${alert.storeName}, ${alert.screenName}. Issue: ${alert.issueLabel}. Please review.`;
}

function alertTarget(value: unknown): ComplaintAlertTarget | null {
  if (!value || typeof value !== "object") return null;
  const { clientId, screenId } = value as Record<string, unknown>;
  if (typeof clientId !== "string" || !clientId.trim() || typeof screenId !== "string" || !screenId.trim()) return null;
  return { clientId, screenId };
}

export default function MonitorComplaintAlerts({ monitorKey, alertKey, onTargetChange }: {
  monitorKey: string;
  alertKey: string;
  onTargetChange: (target: ComplaintAlertTarget | null) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [alert, setAlert] = useState<Alert | null>(null);

  useEffect(() => {
    const lifecycle = new AbortController();
    const queue: Alert[] = [];
    const seen = new Set<string>();
    const synthesis = window.speechSynthesis;
    const supportsSpeech = typeof synthesis?.speak === "function" && typeof synthesis?.cancel === "function"
      && typeof window.SpeechSynthesisUtterance === "function";
    let cursor: string | null = null;
    let active: Presentation | null = null;
    let voiceEnabled = false;
    let pollTimer: number | undefined;
    let displayTimer: number | undefined;
    let speechTimer: number | undefined;

    function endSpeech(item: Presentation, cancel: boolean) {
      const speech = item.speech;
      if (!speech) return;
      item.speech = null;
      speech.onend = null;
      speech.onerror = null;
      window.clearTimeout(speechTimer);
      if (cancel) {
        try {
          synthesis.cancel();
        } catch {
          // A player that cannot cancel speech must still dismiss the banner.
        }
      }
    }

    function finish(item: Presentation) {
      if (active !== item || !item.minimumElapsed || item.speech) return;
      active = null;
      setAlert(null);
      onTargetChange(null);
      showNext();
    }

    function speak(item: Presentation) {
      if (!voiceEnabled || !supportsSpeech) return;
      try {
        const speech = new window.SpeechSynthesisUtterance(announcement(item.alert));
        speech.lang = "en-US";
        speech.rate = 0.85;
        speech.pitch = 1;
        speech.volume = 1;
        item.speech = speech;
        speech.onend = () => {
          if (item.speech !== speech) return;
          endSpeech(item, false);
          finish(item);
        };
        speech.onerror = () => {
          if (item.speech !== speech) return;
          endSpeech(item, false);
          finish(item);
        };
        speechTimer = window.setTimeout(() => {
          endSpeech(item, true);
          finish(item);
        }, maximumSpeechTime);
        synthesis.speak(speech);
      } catch {
        endSpeech(item, false);
      }
    }

    function showNext() {
      if (active || lifecycle.signal.aborted) return;
      const next = queue.shift();
      if (!next) return;
      const item: Presentation = { alert: next, minimumElapsed: false, speech: null };
      active = item;
      setAlert(next);
      onTargetChange(alertTarget(next.target));
      displayTimer = window.setTimeout(() => {
        item.minimumElapsed = true;
        finish(item);
      }, minimumDisplayTime);
      speak(item);
    }

    function clearPresentation() {
      window.clearTimeout(displayTimer);
      if (active) endSpeech(active, true);
      active = null;
      queue.length = 0;
      onTargetChange(null);
    }

    function stop() {
      lifecycle.abort();
      window.clearTimeout(pollTimer);
      clearPresentation();
    }

    async function poll() {
      try {
        const query = cursor === null ? "" : `?after=${encodeURIComponent(cursor)}`;
        const response = await clientFetch(`/api/monitor-complaint-alerts${query}`, {
          cache: "no-store",
          signal: lifecycle.signal,
          headers: { Authorization: `Bearer ${monitorKey}`, "X-Monitor-Alert-Key": alertKey },
        });
        if (lifecycle.signal.aborted) return;
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          // A disabled or redeploying feed can return without a new monitor link.
          if (response.status === 404) clearPresentation();
          else stop();
          setVisible(false);
          setAlert(null);
          return;
        }
        if (!response.ok) return;
        const batch = readBatch(await response.json(), cursor);
        if (!batch || lifecycle.signal.aborted) return;
        cursor = batch.cursor;
        setVisible(true);
        voiceEnabled = batch.voiceEnabled;
        if (!voiceEnabled && active?.speech) {
          const item = active;
          endSpeech(item, true);
          finish(item);
        }
        for (const item of batch.alerts) {
          if (seen.has(item.eventId)) continue;
          seen.add(item.eventId);
          queue.push(item);
        }
        showNext();
      } catch {
        // Keep the last cursor and retry ordinary transient errors.
      } finally {
        if (!lifecycle.signal.aborted) pollTimer = window.setTimeout(() => void poll(), pollInterval);
      }
    }

    void poll();
    return stop;
  }, [monitorKey, alertKey, onTargetChange]);

  if (!visible) return null;
  return <div className="monitor-complaint-alerts">
    <span className="sr-only" role="status" aria-atomic="true">{alert ? announcement(alert) : ""}</span>
    {alert && <section className="monitor-complaint-card" data-priority={alert.priority} aria-label="New complaint">
      <div className="monitor-complaint-art" aria-hidden="true">
        <div className="monitor-complaint-portrait"/>
      </div>
      <div className="monitor-complaint-content">
        <header>
          <span className="monitor-complaint-label"><Bell size={18} aria-hidden="true"/> New complaint</span>
          <span className="monitor-complaint-priority">{priorityLabel[alert.priority]}</span>
        </header>
        <h2 className="monitor-complaint-issue">{alert.issueLabel}</h2>
        <dl className="monitor-complaint-details">
          <div><dt>Client</dt><dd>{alert.clientName}</dd></div>
          <div><dt>Location</dt><dd>{alert.storeName}</dd></div>
          <div className="monitor-complaint-screen"><dt>Screen</dt><dd>{alert.screenName}</dd></div>
        </dl>
      </div>
    </section>}
  </div>;
}
