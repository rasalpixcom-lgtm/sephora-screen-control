import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const mocks = {
  react: "export const useState=hooks.state,useRef=value=>hooks.state(()=>({current:value}))[0],useMemo=compute=>compute(),useEffect=hooks.effect;",
  "react/jsx-runtime": "export const jsx=(type,props)=>({type,props}),jsxs=jsx,Fragment='fragment';",
  "lucide-react": "export const ArrowLeft='arrow-left',Download='download',Plus='plus',RefreshCw='refresh';",
  "@/lib/client-fetch": "export const clientFetch=testFetch;",
};
const { outputFiles } = await build({
  entryPoints: ["components/cms-support-panel.tsx"], bundle: true, format: "cjs", platform: "node",
  write: false, loader: { ".css": "empty" },
  plugins: [{ name: "cms-save-test", setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});
const children = item => Array.isArray(item) ? item.flatMap(children) : item?.props ? [item, ...children(item.props.children)] : [];
const text = item => Array.isArray(item) ? item.map(text).join("") : item?.props ? text(item.props.children) : typeof item === "string" || typeof item === "number" ? String(item) : "";

const slots = [], mountEffects = [], writes = [];
const created = new Map();
let cursor, mounted = false, detailReads = 0;
let currentRecord, pendingRefresh;
const hooks = {
  state(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  effect(callback) { if (!mounted) mountEffects.push(callback); },
};
async function testFetch(path, request = {}) {
  const url = new URL(path, "http://127.0.0.1");
  assert.equal(url.pathname, "/api/cms-support");
  if (request.method === "POST") {
    const body = JSON.parse(request.body);
    writes.push(body);
    const existing = body.action === "create" ? created.get(body.createKey) : undefined;
    if (existing) return Response.json({ id: existing.id, version: existing.version, record: existing });
    currentRecord = {
      id: body.id ?? "saved-update-" + (created.size + 1), version: "version-" + writes.length, hasImage: false, reports: [],
      createdAt: "2026-11-26T08:00:00Z", updatedAt: "2026-11-26T08:00:00Z", updatedBy: "fixture@example.test",
      payload: { ...body.payload, screens: body.payload.screens.map(row => ({ ...row, screenName: "Fixture screen", location: "Fixture store", region: "Fixture region", country: "Fixture country" })) },
    };
    if (body.action === "create") created.set(body.createKey, currentRecord);
    if (writes.length === 1) throw new Error("Connection closed after saving the record.");
    return Response.json({ id: currentRecord.id, version: currentRecord.version, record: currentRecord });
  }
  if (url.searchParams.has("id")) {
    detailReads++;
    const snapshot = currentRecord;
    return new Promise(resolve => {
      pendingRefresh = { signal: request.signal, finish: () => resolve(Response.json({ record: snapshot })) };
    });
  }
  return Response.json({ updates: [], total: 0, countries: [], locations: [] });
}
const ignore = () => {};
const context = vm.createContext({
  module: { exports: {} }, hooks, testFetch, AbortController, URLSearchParams, clearTimeout, crypto,
  window: { addEventListener: ignore, removeEventListener: ignore, setInterval: ignore, setTimeout: callback => callback() },
  document: { addEventListener: ignore, removeEventListener: ignore },
});
vm.runInContext(outputFiles[0].text, context);

const entities = [
  { id: "country", type: "country", name: "Fixture country", parentId: null },
  { id: "region", type: "region", name: "Fixture region", parentId: "country" },
  { id: "store", type: "store", name: "Fixture store", parentId: "region" },
  { id: "screen", type: "screen", name: "Fixture screen", parentId: "store" },
];
function render() {
  cursor = 0;
  return children(context.module.exports.default({ entities, members: [], refreshKey: 0 }));
}
function find(type, match) {
  const node = render().find(item => item.type === type && match(item));
  assert.ok(node, "Expected to find " + type);
  return node;
}
const button = name => find("button", item => text(item) === name);
const setName = value => children(find("label", item => text(item).trim() === "Content name"))
  .find(node => node.type === "input").props.onChange({ target: { value } });
const settle = () => new Promise(resolve => setImmediate(resolve));
async function save() {
  find("form", item => typeof item.props.onSubmit === "function").props.onSubmit({ preventDefault: ignore });
  await settle();
}

render();
mounted = true;
for (const effect of mountEffects) effect();
await settle();

assert.equal(button("Add update").props.disabled, false);
button("Add update").props.onClick();
setName("First fixture update");
button("Add matching screens (1)").props.onClick();
await save();
assert.equal(writes.length, 1);
assert.match(writes[0].createKey, /^[a-f0-9]{32}$/);
assert.ok(render().some(item => item.type === "form"), "the user can retry after a response is lost");
await save();
const savedView = render();
assert.equal(writes.length, 2);
assert.equal(writes[0].createKey, writes[1].createKey);
assert.equal(created.size, 1);
assert.equal(savedView.some(item => item.type === "form"), false, "a successful retry leaves the form");
assert.equal(detailReads, 0, "save opens the returned record without another network request");

find("button", item => item.props["aria-label"] === "Refresh content update").props.onClick();
assert.equal(detailReads, 1);
button("Edit").props.onClick();
assert.equal(pendingRefresh.signal.aborted, true, "beginning an edit cancels the earlier refresh");
setName("Revised fixture update");
await save();
assert.equal(writes.length, 3);
assert.equal(writes[2].action, "update");
assert.equal(writes[2].id, "saved-update-1");
assert.equal(writes[2].version, "version-1");
pendingRefresh.finish();
await settle();
assert.ok(render().some(item => item.type === "h2" && text(item).includes("Revised fixture update")));
assert.equal(render().some(item => item.type === "form"), false);
assert.equal(detailReads, 1);

button("Content updates").props.onClick();
button("Add update").props.onClick();
setName("Separate fixture update");
button("Add matching screens (1)").props.onClick();
await save();
assert.equal(writes.length, 4);
assert.notEqual(writes[3].createKey, writes[0].createKey);
assert.equal(created.size, 2);
console.log("CMS retries a lost response with one create key, ignores an older refresh, and gives a new draft its own key.");
