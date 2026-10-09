"use client";
import { useEffect, useRef, useState } from "react";
import { startOnSignStream, type PreviewStatus } from "@/lib/onsign-stream";

export default function OnSignPreview({ token, name }: { token: string; name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<PreviewStatus>("connecting");
  useEffect(() => {
    let disposed = false, sequence = 0;
    const decoding = new Set<() => void>();
    const stream = startOnSignStream(token, {
      onStatus: next => { if (!disposed) setStatus(next); },
      onFrame: (bytes, rotation, isCurrent) => new Promise<void>((resolve, reject) => {
        const frameSequence = ++sequence;
        const image = new Image();
        const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true; clearTimeout(timer); URL.revokeObjectURL(url);
          image.onload = image.onerror = null; decoding.delete(cancel);
          if (error) reject(error); else resolve();
        };
        const cancel = () => { image.src = ""; finish(); };
        const timer = window.setTimeout(() => finish(new Error("Preview image decode timed out")), 15000);
        decoding.add(cancel);
        image.onload = () => {
          if (disposed || !isCurrent() || frameSequence !== sequence) { finish(); return; }
          try {
            const target = canvas.current;
            if (!target) { finish(); return; }
            const quarterTurn = rotation === 90 || rotation === 270;
            target.width = quarterTurn ? image.naturalHeight : image.naturalWidth;
            target.height = quarterTurn ? image.naturalWidth : image.naturalHeight;
            const context = target.getContext("2d");
            if (!context) throw new Error("Preview canvas unavailable");
            context.translate(target.width / 2, target.height / 2);
            context.rotate(rotation * Math.PI / 180);
            context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
            finish();
          } catch { finish(new Error("Preview image could not be drawn")); }
        };
        image.onerror = () => finish(new Error("Preview image could not be decoded"));
        image.src = url;
      }),
    }, { createSocket: url => new WebSocket(url), setTimeout: (callback, delay) => window.setTimeout(callback, delay), clearTimeout: id => window.clearTimeout(id) });
    const visible = () => document.visibilityState !== "hidden";
    const resume = () => { if (visible()) stream.resume(); };
    const visibility = () => { if (visible()) stream.resume(); else stream.pause(); };
    if (!visible()) stream.pause();
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; stream.dispose(); for (const cancel of decoding) cancel(); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", visibility); };
  }, [token]);
  return <div className="onsign-preview" data-preview-status={status}>
    <canvas ref={canvas} aria-label={`${name} live preview`} role="img"/>
    {status !== "live" && <span className="onsign-preview-state" role="status">{status === "connecting" ? "Connecting preview…" : status === "unavailable" ? "Preview unavailable · retrying" : "Reconnecting preview…"}</span>}
  </div>;
}
