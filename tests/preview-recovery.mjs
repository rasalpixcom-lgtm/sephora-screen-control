import assert from "node:assert/strict";
import { isOnSignEmbed, previewStagger, startPreviewRecovery, PREVIEW_RENEWAL_MS } from "../lib/preview-recovery.ts";

function fixture(stagger = 1000) {
  let time = 0, sequence = 0, renewals = 0;
  const timers = new Map(), listeners = new Map();
  const target = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  const document = { ...target, visibilityState: "visible" };
  const browser = { ...target,
    setTimeout: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  const stop = startPreviewRecovery(() => renewals++, browser, document, stagger, () => time);
  const advance = delay => {
    const end = time + delay;
    while (true) {
      const next = [...timers].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].callback();
    }
    time = end;
  };
  return { stop, advance, timers, listeners, get renewals() { return renewals; },
    emit: name => listeners.get(name)?.(),
    visibility: value => { document.visibilityState = value; listeners.get("visibilitychange")?.(); },
  };
}

assert.ok(isOnSignEmbed("https://app.onsign.tv/embed/example"));
for (const url of ["http://app.onsign.tv/embed/example", "https://app.onsign.tv.attacker.test/embed/example", "https://app.onsign.tv/players", "bad url"]) assert.equal(isOnSignEmbed(url), false);
assert.equal(previewStagger("screen-a"), previewStagger("screen-a"));
assert.ok(previewStagger("screen-a") >= 0 && previewStagger("screen-a") < 30000);

const periodic = fixture();
periodic.advance(PREVIEW_RENEWAL_MS); assert.equal(periodic.renewals, 0);
periodic.advance(1000); assert.equal(periodic.renewals, 1);
periodic.advance(PREVIEW_RENEWAL_MS + 1000); assert.equal(periodic.renewals, 2);
periodic.stop(); periodic.advance(PREVIEW_RENEWAL_MS * 2); assert.equal(periodic.renewals, 2);
assert.equal(periodic.timers.size, 0); assert.equal(periodic.listeners.size, 0);

const network = fixture();
network.emit("online"); network.emit("online");
network.advance(99); assert.equal(network.renewals, 0);
network.advance(1); assert.equal(network.renewals, 1);
network.advance(PREVIEW_RENEWAL_MS + 1000); assert.equal(network.renewals, 2);
network.emit("online"); network.stop(); network.advance(200); assert.equal(network.renewals, 2);

const hidden = fixture();
hidden.visibility("hidden"); hidden.emit("online");
hidden.advance(PREVIEW_RENEWAL_MS + 1000); assert.equal(hidden.renewals, 0);
hidden.visibility("visible"); hidden.advance(100); assert.equal(hidden.renewals, 1);
hidden.visibility("hidden"); hidden.advance(1000); hidden.visibility("visible");
hidden.advance(100); assert.equal(hidden.renewals, 1);
hidden.visibility("hidden"); hidden.advance(15000); hidden.visibility("visible"); hidden.visibility("hidden");
hidden.advance(100); assert.equal(hidden.renewals, 1);
hidden.stop(); network.stop();
console.log("PASS: preview URL boundaries, staggered renewal, network recovery, tab resume, hidden-tab suppression, and cleanup.");
