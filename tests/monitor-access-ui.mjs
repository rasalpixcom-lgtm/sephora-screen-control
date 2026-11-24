// Exercise the wall's real polling handler and rendered cards with controlled responses.
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const mocks = {
  react: "export const useState=h=>testHooks.state(h),useRef=h=>testHooks.ref(h),useEffect=fn=>testHooks.effect(fn),useCallback=fn=>fn,useMemo=fn=>fn();",
  "react/jsx-runtime": "export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment='fragment';",
  "lucide-react": "export const ChevronLeft='icon',ChevronRight='icon',CircleHelp='icon',Expand='icon',MapPin='icon',Monitor='icon',Pause='icon',Play='icon',Plus='icon',UserRound='icon',Settings2='icon',SlidersHorizontal='icon',Trash2='icon',X='icon';",
  "next/link": "export default 'link';",
  "@/components/ui/dialog": "export const Dialog='dialog',DialogContent='dialog-content',DialogDescription='dialog-description',DialogHeader='dialog-header',DialogTitle='dialog-title';",
  "@/components/theme-toggle": "export const ThemeToggle='theme-toggle';",
  "@/components/client-logo": "export default 'client-logo';",
  "@/components/sign-out": "export default 'sign-out';",
  "@/components/controller-panel": "export default 'controller';",
  "@/components/onsign-preview": "export default 'onsign-preview';",
  "@/components/monitor-preview-summary": "export default 'preview-summary';",
  "@/lib/client-fetch": "export const clientFetch=(...args)=>testFetch(...args);",
};
const bundle = await build({
  entryPoints: ["components/workspace.tsx"], bundle: true, format: "cjs", platform: "node", write: false,
  loader: { ".css": "empty" },
  plugins: [{ name: "monitor-ui-fixture", setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "test" } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});

const tick = () => new Promise(resolve => setImmediate(resolve));
const elements = node => Array.isArray(node) ? node.flatMap(elements) : node?.props ? [node, ...elements(node.props.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" ? node : "";

async function monitor({ commonMonitor = false, monitorKey = "" } = {}) {
  const slots = [], effects = [], requests = [];
  let cursor = 0, poll, reply;
  const testHooks = {
    state(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    ref(initial) { return slots[cursor++] ??= { current: initial }; },
    effect(callback) { effects.push(callback); },
  };
  const testFetch = (...args) => {
    requests.push(args);
    return new Promise(resolve => { reply = resolve; });
  };
  const context = vm.createContext({
    module: { exports: {} }, testHooks, testFetch, queueMicrotask,
    window: { location: { search: "?client=fixture" }, setInterval(callback) { poll = callback; } },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  function render() {
    cursor = 0;
    effects.length = 0;
    return context.module.exports.default({ view: "monitor", commonMonitor, monitorKey });
  }
  render();
  effects.slice().forEach(effect => effect());
  await tick();
  return {
    requests,
    poll: () => poll(),
    async settle(status, body) {
      assert.ok(reply, "An outstanding poll must exist");
      reply({ status, ok: status < 300, async json() {
        if (body === undefined) throw new SyntaxError("No JSON response");
        return body;
      } });
      reply = undefined;
      await tick();
      const nodes = elements(render());
      return {
        screens: nodes.flatMap(node => node.props.screen ? [node.props.screen.name] : []),
        rotating: nodes.some(node => node.props["aria-label"] === "Pause rotation"),
        alert: text(nodes.find(node => node.props.role === "alert")),
      };
    },
  };
}

const wall = {
  clientId: "fixture", clientName: "Fixture brand",
  entities: Array.from({ length: 7 }, (_, i) => ({ id: `screen-${i}`, type: "screen", name: `Preview ${i}`, parentId: null })),
  members: [],
  display: { selection: {}, autoAdvance: true, intervalSeconds: 10, updatedAt: "2026-01-01" },
};
const visible = wall.entities.slice(0, 6).map(screen => screen.name);
const shared = await monitor({ commonMonitor: true });
assert.equal(shared.requests[0][0], "/api/monitor-state?scope=all");
assert.deepEqual(await shared.settle(200, wall), { screens: visible, rotating: true, alert: "" });
shared.poll();
shared.poll();
assert.equal(shared.requests.length, 2, "Only one poll can be in flight");
assert.deepEqual(await shared.settle(503, { error: "Temporary service issue" }), { screens: visible, rotating: true, alert: "Temporary service issue" });
shared.poll();
assert.deepEqual(await shared.settle(403), { screens: [], rotating: false, alert: "This monitor is showing a client outside your assignment." });
shared.poll();
assert.deepEqual(await shared.settle(200, wall), { screens: visible, rotating: true, alert: "" });

const dedicated = await monitor({ monitorKey: "fixture-key" });
assert.equal(dedicated.requests[0][0], "/api/monitor-state?client=fixture");
assert.equal(dedicated.requests[0][1].headers.Authorization, "Bearer fixture-key");
assert.deepEqual(await dedicated.settle(200, wall), { screens: visible, rotating: true, alert: "" });
dedicated.poll();
assert.deepEqual(await dedicated.settle(401), { screens: [], rotating: false, alert: "This monitor link is missing or inactive. Ask an Admin for the current link." });

console.log("10 monitoring wall access UI checks passed.");
