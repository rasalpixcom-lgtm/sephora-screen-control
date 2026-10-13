import sharp from "sharp";
import { startOnSignStream, FRAME_TIMEOUT_MS } from "./onsign-stream";

export async function validatePreviewImage(bytes: ArrayBuffer) {
  // Decode a bounded image; malformed or oversized payloads are not availability.
  const header = new Uint8Array(bytes);
  if (bytes.byteLength > 8 * 1024 * 1024 || header[0] !== 255 || header[1] !== 216) throw new Error("Invalid preview JPEG");
  await sharp(Buffer.from(bytes), { limitInputPixels: 16777216, failOn: "warning" })
    .timeout({ seconds: 3 }).resize(1, 1).raw().toBuffer();
}

export function probePreview(token: string, options: { createSocket?: Parameters<typeof startOnSignStream>[2]["createSocket"]; timeoutMs?: number } = {}) {
  let finish!: (result: { received: boolean; at: number }) => void;
  let settled = false;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let timerId = 0;
  const result = new Promise<{ received: boolean; at: number }>(resolve => { finish = resolve; });
  const complete = (received: boolean) => {
    if (settled) return;
    settled = true; clearTimeout(deadline); stream?.dispose();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear(); finish({ received, at: Date.now() });
  };
  const deadline = setTimeout(() => complete(false), options.timeoutMs ?? FRAME_TIMEOUT_MS);
  deadline.unref();
  const stream = startOnSignStream(token, {
    onStatus: status => { if (status === "live") queueMicrotask(() => complete(true)); },
    onFrame: async (bytes, _rotation, isCurrent) => { if (isCurrent()) await validatePreviewImage(bytes); },
  }, {
    createSocket: options.createSocket || (url => new WebSocket(url)),
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      const timer = setTimeout(() => { timers.delete(id); callback(); }, delay);
      timer.unref(); timers.set(id, timer); return id;
    },
    clearTimeout: id => { const timer = timers.get(id); if (timer) clearTimeout(timer); timers.delete(id); },
  });
  return { result, cancel: () => complete(false) };
}
