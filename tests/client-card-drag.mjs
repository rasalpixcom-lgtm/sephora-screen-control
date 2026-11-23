// Exercise the actual component handlers with animation frames deliberately held.
// This catches a release-before-render race without relying on timing in a browser.
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const mocks = {
  react: 'export const useState=(v)=>globalThis.hooks.state(v); export const useRef=(v)=>globalThis.hooks.ref(v); export const useCallback=(v)=>v; export const useEffect=()=>{}; export const useLayoutEffect=(v)=>globalThis.hooks.layout(v);',
  "react/jsx-runtime": 'export const jsx=(type,props,key)=>({type,props:props||{},key}); export const jsxs=jsx; export const Fragment="fragment";',
  "next/link": 'export default "link";',
  "lucide-react": 'export const ArrowLeft="icon",ArrowLeftToLine="icon",ArrowRight="icon",Check="icon",ChevronDown="icon",GripVertical="icon",RotateCcw="icon",ShieldCheck="icon";',
  "@/components/ui/dropdown-menu": 'export const DropdownMenu="menu",DropdownMenuContent="menu-content",DropdownMenuItem="menu-item",DropdownMenuTrigger="menu-trigger";',
  "@/components/sign-out": 'export default "sign-out";',
  "@/components/theme-toggle": 'export const ThemeToggle="theme-toggle";',
  "./client-logo": 'export default "client-logo";',
  "@/lib/client-fetch": 'export const clientFetch=(...args)=>globalThis.networkCalls.push(args);',
};
const bundle = await build({
  entryPoints: ["components/client-selection.tsx"], bundle: true, platform: "node", format: "cjs", write: false,
  loader: { ".css": "empty" },
  plugins: [{ name: "drag-handler-fixture", setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});
let checks = 0;
const text = node => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
function elements(node, predicate, found = []) {
  if (Array.isArray(node)) node.forEach(item => elements(item, predicate, found));
  else if (node?.props) { if (predicate(node)) found.push(node); elements(node.props.children, predicate, found); }
  return found;
}
function fixture(pointerType = "mouse", pointerDrag = true) {
  let cursor = 0, frame = 0, captured = null;
  const slots = [], frames = new Map(), cancelled = [], networkCalls = [], layout = [];
  const focusCalls = [], scrollCalls = [];
  const control = name => ({
    focus(options) { focusCalls.push({ name, preventScroll: options?.preventScroll === true }); },
    scrollIntoView() { scrollCalls.push(name); },
  });
  const hooks = {
    state(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    ref(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    layout(effect) { layout.push(effect); },
  };
  const gridElement = {
    setPointerCapture(id) { captured = id; }, hasPointerCapture(id) { return captured === id; },
    releasePointerCapture() { captured = null; }, contains() { return true; },
  };
  const targets = new Map(["a", "b", "c"].map(id => [id, { dataset: { orderClient: id } }]));
  const context = vm.createContext({
    module: { exports: {} }, hooks, networkCalls, console,
    requestAnimationFrame(callback) { frames.set(++frame, callback); return frame; },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id); },
    document: { elementFromPoint(x) { return { closest() { return targets.get(x < 150 ? "a" : x < 250 ? "b" : "c"); } }; } },
    window: { innerWidth: 600, innerHeight: 600, scrollBy() {} },
  });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const Component = context.module.exports.default;
  const props = { clients: [{ id: "a", name: "Alpha", role: "admin" }, { id: "b", name: "Bravo", role: "admin" }, { id: "c", name: "Charlie", role: "admin" }], email: "fixture@example.test", orderUserId: "fixture-user" };
  function render() {
    cursor = 0;
    const tree = Component(props);
    const grid = elements(tree, node => node.props.className?.startsWith("client-selection-grid"))[0];
    grid.props.ref.current = gridElement;
    layout.splice(0).forEach(effect => effect());
    return { tree, grid };
  }
  let current = render();
  elements(current.tree, node => node.type === "button" && text(node) === "Arrange clients")[0].props.onClick();
  current = render();
  const handle = elements(current.tree, node => node.props["aria-label"] === "Drag Charlie to rearrange")[0];
  const menu = elements(current.tree, node => node.props["aria-label"] === "Move Charlie")[0];
  const dragHandle = control("handle");
  handle.props.ref(dragHandle);
  menu.props.ref(control("menu"));
  const event = (x, pointerId = 7) => ({ pointerId, pointerType, isPrimary: true, button: 0, clientX: x, clientY: 200, preventDefault() {}, currentTarget: dragHandle });
  if (pointerDrag) handle.props.onPointerDown(event(300));
  return {
    move(x) { current.grid.props.onPointerMove(event(x)); },
    release(x, pointerId = 7) { current.grid.props.onPointerUp(event(x, pointerId)); },
    cancel() { current.grid.props.onPointerCancel(event(300)); },
    key(key) {
      const currentHandle = elements(render().tree, node => node.props["aria-label"] === "Drag Charlie to rearrange")[0];
      currentHandle.props.onKeyDown({ key, preventDefault() {} });
    },
    moveToFirst() {
      const card = elements(render().tree, node => node.props["data-order-client"] === "c")[0];
      elements(card, node => node.type === "menu-item" && text(node) === "Move to first")[0].props.onSelect();
    },
    flushFrames() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback());
    },
    result() {
      const next = render();
      return { order: elements(next.tree, node => node.props["data-order-client"]).map(node => node.props["data-order-client"]).join(","), saveDisabled: elements(next.tree, node => node.type === "button" && text(node) === "Save order")[0].props.disabled };
    },
    cancelled, networkCalls, focusCalls, scrollCalls,
  };
}
for (const pointerType of ["mouse", "touch"]) {
  const quick = fixture(pointerType);
  quick.move(100); // No animation callback runs before release.
  quick.release(100);
  assert.equal(quick.result().order, "c,a,b"); checks++;
  assert.equal(quick.result().saveDisabled, false); checks++;
  assert.ok(quick.cancelled.includes(1)); checks++;
  assert.equal(quick.networkCalls.length, 0); checks++;
  quick.flushFrames();
  assert.deepEqual(quick.scrollCalls, []); checks++;
  assert.deepEqual(quick.focusCalls.at(-1), { name: "handle", preventScroll: true }); checks++;

  const finalPoint = fixture(pointerType);
  finalPoint.move(200);
  finalPoint.release(100);
  assert.equal(finalPoint.result().order, "c,a,b"); checks++;

  const coalesced = fixture(pointerType);
  coalesced.release(100); // The release itself can be the first movement sample.
  assert.equal(coalesced.result().order, "c,a,b"); checks++;

  const tap = fixture(pointerType);
  tap.release(298);
  assert.equal(tap.result().order, "a,b,c"); checks++;
  assert.equal(tap.result().saveDisabled, true); checks++;

  const cancelled = fixture(pointerType);
  cancelled.move(100); cancelled.cancel();
  assert.equal(cancelled.result().order, "a,b,c"); checks++;

  const otherPointer = fixture(pointerType);
  otherPointer.release(100, 9);
  assert.equal(otherPointer.result().order, "a,b,c"); checks++;
  otherPointer.release(100);
  assert.equal(otherPointer.result().order, "c,a,b"); checks++;
}
const keyboard = fixture(undefined, false);
keyboard.key("Home");
assert.deepEqual(keyboard.scrollCalls, []); checks++;
assert.equal(keyboard.result().order, "c,a,b"); checks++;
assert.equal(keyboard.focusCalls.at(-1)?.name, "handle"); checks++;
assert.deepEqual(keyboard.scrollCalls, ["handle"]); checks++;
keyboard.key("End");
assert.equal(keyboard.result().order, "a,b,c"); checks++;
assert.deepEqual(keyboard.scrollCalls, ["handle", "handle"]); checks++;

const menu = fixture(undefined, false);
menu.moveToFirst();
assert.equal(menu.result().order, "c,a,b"); checks++;
assert.equal(menu.focusCalls.at(-1)?.name, "menu"); checks++;
assert.deepEqual(menu.scrollCalls, ["menu"]); checks++;
console.log(`${checks} actual component card movement checks passed, including drag release and keyboard and menu scrolling.`);
