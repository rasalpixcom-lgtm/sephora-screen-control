// Adapter for the image protocol used by OnSign's public /embed/ viewer.
// Keep it isolated: OnSign may change this protocol independently of our app.
export const FRAME_TIMEOUT_MS = 30000;
export const HEARTBEAT_MS = 25000;
export type PreviewStatus = "connecting" | "live" | "reconnecting" | "unavailable";
type Socket = Pick<WebSocket, "binaryType" | "readyState" | "send" | "close" | "onopen" | "onclose" | "onerror" | "onmessage">;
type Environment = {
  createSocket: (url: string) => Socket;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (id: number) => void;
};
type Options = {
  onStatus: (status: PreviewStatus) => void;
  onFrame: (bytes: ArrayBuffer, rotation: number, isCurrent: () => boolean) => Promise<void>;
};

export function onSignToken(url: string): string | null {
  try {
    const source = new URL(url);
    if (source.protocol !== "https:" || source.hostname !== "app.onsign.tv" || source.port) return null;
    const match = /^\/embed\/([A-Za-z0-9_-]{1,256})\/?$/.exec(source.pathname);
    return match?.[1] || null;
  } catch { return null; }
}

export function startOnSignStream(token: string, options: Options, environment: Environment) {
  let socket: Socket | null = null, stopped = false, paused = false, attempt = 0, heartbeatId = 1;
  let frameTimer: number | undefined, heartbeatTimer: number | undefined, retryTimer: number | undefined;
  let pending: { id: number; rotation: number } | null = null;
  let status: PreviewStatus | null = null;
  const report = (next: PreviewStatus) => { if (next !== status) { status = next; options.onStatus(next); } };
  const clearTimers = () => {
    for (const id of [frameTimer, heartbeatTimer, retryTimer]) if (id !== undefined) environment.clearTimeout(id);
    frameTimer = heartbeatTimer = retryTimer = undefined;
  };
  const close = () => {
    clearTimers(); pending = null;
    const old = socket; socket = null;
    if (old) { old.onopen = old.onclose = old.onerror = old.onmessage = null; old.close(); }
  };
  const retry = (unavailable = false) => {
    if (stopped || paused) return;
    close(); report(unavailable ? "unavailable" : "reconnecting");
    const delay = unavailable ? 30000 : Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5));
    retryTimer = environment.setTimeout(() => { retryTimer = undefined; connect(); }, delay);
  };
  const deadline = () => {
    if (frameTimer !== undefined) environment.clearTimeout(frameTimer);
    // Only a successfully decoded image resets this timer, not socket activity.
    frameTimer = environment.setTimeout(() => retry(), FRAME_TIMEOUT_MS);
  };
  const connect = () => {
    if (stopped || paused) return;
    let current: Socket;
    try { current = environment.createSocket("wss://app.onsign.tv/livews"); }
    catch { retry(); return; }
    socket = current; pending = null;
    // Reapply on EVERY socket: OnSign's viewer misses this after reconnecting.
    current.binaryType = "arraybuffer";
    const isCurrent = () => !stopped && !paused && socket === current;
    deadline();
    const send = (message: object) => {
      if (!isCurrent() || current.readyState !== 1) return;
      try { current.send(JSON.stringify(message)); } catch { retry(); }
    };
    const heartbeat = () => {
      if (!isCurrent()) return;
      heartbeatId += 2; send({ t: "hb", id: heartbeatId });
      if (isCurrent()) heartbeatTimer = environment.setTimeout(heartbeat, HEARTBEAT_MS);
    };
    current.onopen = () => {
      send({ t: "live-view:subscribe", data: { tokenLiveView: token, originalRes: false } });
      if (isCurrent()) heartbeatTimer = environment.setTimeout(heartbeat, HEARTBEAT_MS);
    };
    current.onclose = current.onerror = () => { if (isCurrent()) retry(); };
    current.onmessage = async event => {
      if (!isCurrent()) return;
      try {
        if (typeof event.data === "string") {
          if (event.data.length > 16384) { retry(); return; }
          const message = JSON.parse(event.data);
          if (!message || typeof message !== "object") { retry(); return; }
          if (message.t === "error") { retry(true); return; }
          if (message.binaryField) {
            if (pending || message.t !== "live-view:image" || message.binaryField !== "buffer" || !Number.isSafeInteger(message.id)) { retry(); return; }
            const rotation = message.data?.rotation;
            pending = { id: message.id, rotation: [0,90,180,270].includes(rotation) ? rotation : 0 };
          }
          return;
        }
        // Some older WebViews can still produce Blobs; normalize them safely.
        const bytes = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data;
        if (!isCurrent()) return;
        const frame = pending; pending = null;
        if (!frame || !(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > 8 * 1024 * 1024) { retry(); return; }
        await options.onFrame(bytes, frame.rotation, isCurrent);
        if (!isCurrent()) return;
        send({ t: "ack", ack: frame.id });
        if (isCurrent()) { attempt = 0; report("live"); deadline(); }
      } catch { if (isCurrent()) retry(); }
    };
  };
  report("connecting"); connect();
  return {
    pause() { if (stopped || paused) return; paused = true; close(); },
    resume() { if (stopped) return; paused = false; close(); report("reconnecting"); connect(); },
    dispose() { stopped = true; close(); },
  };
}
