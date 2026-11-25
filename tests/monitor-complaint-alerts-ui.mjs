import assert from "node:assert/strict";
import { basename } from "node:path";
import vm from "node:vm";
import { build } from "esbuild";

const mocks = {
  react: "export const useSyncExternalStore=(_subscribe,read)=>read(),useState=initial=>hooks.state(initial),useEffect=callback=>hooks.effect(callback),useCallback=callback=>callback;",
  "react/jsx-runtime": "export const jsx=(type,props,key)=>({type,props,key}),jsxs=jsx,Fragment='fragment';",
  "lucide-react": "export const Bell='bell';",
  "@/components/workspace": "export default 'workspace';",
  "@/lib/client-fetch": "export const clientFetch=(...args)=>testFetch(...args);",
};
const bundle = await build({
  entryPoints: { entry: "components/monitor-page.tsx", alerts: "components/monitor-complaint-alerts.tsx" },
  outdir: "monitor-test-bundle", bundle: true, platform: "node", format: "cjs", write: false,
  loader: { ".css": "empty" },
  plugins: [{ name: "complaint-alert-ui", setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});

const source = name => bundle.outputFiles.find(file => basename(file.path) === `${name}.js`).text;
const key = "a".repeat(64);
const alertKey = "b".repeat(64);
const mappedTarget = { clientId: "demo", screenId: "display-one" };
const event = (cursor, eventId, priority = "medium") => ({
  cursor, eventId, priority, clientName: "Demo client", storeName: "Demo store",
  screenName: eventId, issueLabel: "Preview unavailable",
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [];

function mountEntry(search, hash) {
  let activeTarget = null;
  const hooks = { state: () => [activeTarget, update => { activeTarget = update(activeTarget); }] };
  const context = vm.createContext({ module: { exports: {} }, window: { location: { search, hash } }, URLSearchParams, hooks });
  vm.runInContext(source("entry"), context);
  return (nextHash = hash) => {
    context.window.location.hash = nextHash;
    const elements = nodes(context.module.exports.default());
    return { workspace: elements.find(item => item.type === "workspace"), overlay: elements.find(item => item.props.alertKey) };
  };
}

const entry = (search, hash) => mountEntry(search, hash)();

const normal = entry("?scope=all", `#key=${key}`);
assert.equal(normal.workspace.props.commonMonitor, true);
assert.equal(normal.workspace.key, key);
assert.equal(normal.overlay, undefined);
const enhanced = entry("?scope=all", `#key=${key}&alerts=${alertKey}`);
assert.equal(enhanced.workspace.key, normal.workspace.key, "Enabling alerts leaves the Workspace identity unchanged");
assert.equal(enhanced.overlay.props.alertKey, alertKey);
const perClient = entry("?client=demo", `#key=${key}&alerts=${alertKey}`);
assert.equal(perClient.workspace.props.commonMonitor, false);
assert.equal(perClient.overlay, undefined);
assert.equal(entry("?scope=all", `#key=invalid&alerts=${alertKey}`).overlay, undefined);
assert.equal(entry("?scope=all", `#key=${key}&alerts=invalid`).overlay, undefined);

const renderTarget = mountEntry("?scope=all", `#key=${key}&alerts=${alertKey}`);
const firstLink = renderTarget().overlay;
firstLink.props.onTargetChange(mappedTarget);
assert.deepEqual(renderTarget().workspace.props.complaintTarget, mappedTarget);
const changedHash = `#key=${key}&alerts=${"c".repeat(64)}`;
const changedLink = renderTarget(changedHash);
assert.equal(changedLink.workspace.key, key, "Changing the alert link preserves the monitor workspace");
assert.equal(changedLink.workspace.props.complaintTarget, undefined, "A changed alert key clears the old target");
changedLink.overlay.props.onTargetChange(mappedTarget);
firstLink.props.onTargetChange(null);
assert.deepEqual(renderTarget(changedHash).workspace.props.complaintTarget, mappedTarget, "Cleaning up a stale link preserves the current target");

function fixture({ enableSpeech = true } = {}) {
  let now = 0, timerId = 0, cursor = 0, cancelCount = 0;
  let target = null;
  const requests = [], replies = [], spoken = [], slots = [], timers = new Map(), effects = [];
  const hooks = {
    state(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = value; }];
    },
    effect(callback) { effects.push(callback); },
  };
  const window = {
    setTimeout(callback, delay) { timers.set(++timerId, { callback, at: now + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    ...(enableSpeech && {
      SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
      speechSynthesis: {
        speak(speech) { spoken.push(speech); },
        cancel() { cancelCount++; },
      },
    }),
  };
  const testFetch = (url, options) => {
    requests.push({ url, options });
    return new Promise(resolve => replies.push(resolve));
  };
  const context = vm.createContext({ module: { exports: {} }, window, hooks, testFetch, AbortController, encodeURIComponent });
  vm.runInContext(source("alerts"), context);
  const onTargetChange = value => { target = value ? [value.clientId, value.screenId] : null; };
  function render() {
    cursor = 0;
    effects.length = 0;
    return nodes(context.module.exports.default({ monitorKey: key, alertKey, onTargetChange }));
  }
  render();
  const cleanup = effects[0]();
  return {
    requests, spoken, cleanup,
    cancels: () => cancelCount,
    button: () => render().find(node => node.type === "button"),
    message: () => render().find(node => node.props.role === "status")?.props.children,
    priority: () => render().find(node => node.props["data-priority"])?.props["data-priority"],
    target: () => target,
    async reply(status, body) {
      const resolve = replies.shift();
      assert.ok(resolve, "The overlay made an alert request");
      resolve({ status, ok: status === 200, async json() { return body; } });
      await tick();
    },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        const [id, job] = [...timers].sort((left, right) => left[1].at - right[1].at)[0] ?? [];
        if (!job || job.at > until) break;
        now = job.at;
        timers.delete(id);
        job.callback();
        await tick();
      }
      now = until;
    },
  };
}

const overlay = fixture();
assert.equal(overlay.requests[0].url, "/api/monitor-complaint-alerts");
assert.equal(overlay.requests[0].options.headers.Authorization, `Bearer ${key}`);
assert.equal(overlay.requests[0].options.headers["X-Monitor-Alert-Key"], alertKey);
assert.equal(overlay.button(), undefined);
await overlay.reply(200, { cursor: "9007199254740993", voiceEnabled: false, alerts: [event("1", "Old complaint")] });
assert.equal(overlay.message(), "", "Opening the link establishes the cursor without replaying complaints");
assert.equal(overlay.button(), undefined, "The wall has no voice control after connecting");
await overlay.advance(3_000);
assert.equal(overlay.requests.at(-1).url, "/api/monitor-complaint-alerts?after=9007199254740993");
await overlay.reply(200, { cursor: "9007199254740996", alerts: [
  { ...event("9007199254740994", "One"), target: mappedTarget },
  { ...event("9007199254740995", "Two", "high"), target: { clientId: "demo", screenId: 2 } },
  event("9007199254740996", "One"),
] });
assert.equal(overlay.message(), "New complaint from Demo client, Demo store, One. Issue: Preview unavailable. Please review.");
assert.deepEqual(overlay.target(), [mappedTarget.clientId, mappedTarget.screenId]);
assert.equal(overlay.spoken.length, 0, "A response without a voice setting keeps speech off");
await overlay.advance(9_999);
assert.equal(overlay.priority(), "medium");
assert.equal(overlay.requests.length, 3, "A stalled poll does not produce overlapping requests");
await overlay.reply(200, { cursor: "9007199254740996", voiceEnabled: true, alerts: [] });
assert.equal(overlay.spoken.length, 0, "Enabling voice does not replay a banner already on screen");
await overlay.advance(1);
assert.equal(overlay.priority(), "high");
assert.equal(overlay.target(), null, "The target clears on dismissal and an invalid optional target leaves the next banner visible");
const highSpeech = overlay.spoken[0];
assert.equal(highSpeech.text, "Alert. High priority complaint from Demo client, Demo store, Two. Issue: Preview unavailable. Please review.");
assert.deepEqual([highSpeech.lang, highSpeech.rate, highSpeech.pitch, highSpeech.volume, highSpeech.voice], ["en-US", 0.85, 1, 1, undefined]);
await overlay.advance(10_000);
assert.equal(overlay.priority(), "high", "Keep the high priority card visible during speech");
highSpeech.onend();
assert.equal(overlay.priority(), undefined, "The earlier event ID is not repeated");
await overlay.reply(200, { cursor: "9007199254740997", voiceEnabled: true, alerts: [event("9007199254740997", "Three")] });
assert.equal(overlay.spoken[1].text, "New complaint from Demo client, Demo store, Three. Issue: Preview unavailable. Please review.");
await overlay.advance(45_000);
assert.equal(overlay.priority(), undefined, "A missing speech end event cannot block the queue forever");
assert.equal(overlay.cancels(), 1, "The timeout cancels only the unfinished utterance");
await overlay.reply(200, { cursor: "9007199254740998", voiceEnabled: true, alerts: [{ ...event("9007199254740998", "Four"), target: mappedTarget }] });
assert.deepEqual(overlay.target(), [mappedTarget.clientId, mappedTarget.screenId]);
await overlay.advance(3_000);
await overlay.reply(403);
assert.equal(overlay.message(), undefined, "Access denial immediately hides the overlay");
assert.equal(overlay.target(), null, "Access denial clears the active target");
assert.equal(overlay.cancels(), 2, "Access denial cancels its active speech");
const requestCount = overlay.requests.length;
await overlay.advance(60_000);
assert.equal(overlay.requests.length, requestCount);
overlay.cleanup();
assert.equal(overlay.cancels(), 2);

const remotelyMuted = fixture();
await remotelyMuted.reply(200, { cursor: "1", voiceEnabled: true, alerts: [event("1", "Previous")] });
assert.equal(remotelyMuted.spoken.length, 0, "Opening a wall with voice saved on does not replay previous complaints");
await remotelyMuted.advance(3_000);
await remotelyMuted.reply(200, { cursor: "3", voiceEnabled: true, alerts: [event("2", "First"), event("3", "Second")] });
assert.equal(remotelyMuted.spoken.length, 1);
await remotelyMuted.advance(3_000);
await remotelyMuted.reply(200, { cursor: "3", voiceEnabled: false, alerts: [] });
assert.equal(remotelyMuted.cancels(), 1, "A saved mute cancels the active utterance");
assert.match(remotelyMuted.message(), /First/, "Muting preserves the current banner until its minimum duration");
await remotelyMuted.advance(7_000);
assert.match(remotelyMuted.message(), /Second/, "The next banner appears on schedule while muted");
assert.equal(remotelyMuted.spoken.length, 1);
await remotelyMuted.reply(200, { cursor: "4", voiceEnabled: true, alerts: [event("4", "Third")] });
assert.equal(remotelyMuted.spoken.length, 1);
await remotelyMuted.advance(10_000);
assert.match(remotelyMuted.spoken[1].text, /Third/, "Remote unmute applies to the next banner");
remotelyMuted.spoken[1].onerror({ error: "not-allowed" });
await remotelyMuted.advance(10_000);
assert.equal(remotelyMuted.priority(), undefined, "A player that blocks speech still clears the banner");
await remotelyMuted.reply(200, { cursor: "5", voiceEnabled: "true", alerts: [event("5", "Invalid setting")] });
assert.match(remotelyMuted.message(), /Invalid setting/);
assert.equal(remotelyMuted.spoken.length, 2, "A malformed voice setting cannot enable speech");
remotelyMuted.cleanup();

const unavailable = fixture();
await unavailable.reply(404);
assert.equal(unavailable.message(), undefined, "A wall opened while alerts are disabled stays hidden");
await unavailable.advance(3_000);
assert.equal(unavailable.requests.length, 2);
assert.equal(unavailable.requests.at(-1).url, "/api/monitor-complaint-alerts");
await unavailable.reply(200, { cursor: "5", voiceEnabled: true, alerts: [event("5", "Previous")] });
assert.equal(unavailable.message(), "", "The first successful response still starts at the live cursor");
await unavailable.advance(3_000);
await unavailable.reply(200, { cursor: "7", voiceEnabled: true, alerts: [
  { ...event("6", "Interrupted"), target: mappedTarget }, event("7", "Previously queued"),
] });
assert.match(unavailable.message(), /Interrupted/);
assert.deepEqual(unavailable.target(), [mappedTarget.clientId, mappedTarget.screenId]);
assert.equal(unavailable.spoken.length, 1);
await unavailable.advance(3_000);
await unavailable.reply(404);
assert.equal(unavailable.message(), undefined, "A temporary 404 hides the active banner");
assert.equal(unavailable.target(), null, "A temporary 404 removes the tile highlight");
assert.equal(unavailable.cancels(), 1, "A temporary 404 cancels active speech");
await unavailable.advance(3_000);
assert.equal(unavailable.requests.at(-1).url, "/api/monitor-complaint-alerts?after=7");
await unavailable.reply(404);
await unavailable.advance(3_000);
assert.equal(unavailable.requests.at(-1).url, "/api/monitor-complaint-alerts?after=7");
await unavailable.reply(200, { cursor: "9", voiceEnabled: true, alerts: [
  event("8", "Previously queued"), event("9", "Recovered"),
] });
assert.match(unavailable.message(), /Recovered/, "Recovery shows new alerts without displaying stale or duplicate ones");
assert.equal(unavailable.spoken.length, 2);
assert.match(unavailable.spoken[1].text, /Recovered/);
unavailable.cleanup();

{
  const silent = fixture({ enableSpeech: false });
  await silent.reply(200, { cursor: "5", voiceEnabled: true, alerts: [] });
  await silent.advance(3_000);
  await silent.reply(503);
  await silent.advance(3_000);
  assert.equal(silent.requests.at(-1).url, "/api/monitor-complaint-alerts?after=5");
  await silent.reply(200, { cursor: "6", voiceEnabled: true, alerts: [event("6", "Visual only", "low")] });
  assert.equal(silent.button(), undefined);
  assert.equal(silent.priority(), "low");
  await silent.advance(3_000);
  await silent.reply(401);
  assert.equal(silent.message(), undefined);
  assert.equal(silent.cancels(), 0);
  const count = silent.requests.length;
  await silent.advance(60_000);
  assert.equal(silent.requests.length, count, "A 401 stops polling until the page is opened with a valid link");
  silent.cleanup();
}

const unmounted = fixture();
unmounted.cleanup();
assert.equal(unmounted.requests[0].options.signal.aborted, true);
await unmounted.reply(200, { cursor: "5", alerts: [] });
assert.equal(unmounted.message(), undefined, "A response after unmount cannot reopen the overlay");

console.log("Complaint alert UI checks passed: fragment isolation, replay, deduplication, queue, shared voice settings, speech fallback, feed recovery, authorization, and optional screen targets.");
