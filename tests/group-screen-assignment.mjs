// Exercise the real dialog handlers, including saving before React rerenders.
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const mocks = {
  react: "export const useState=v=>globalThis.hooks.state(v);export const useRef=v=>globalThis.hooks.ref(v);export const useMemo=f=>f();",
  "react/jsx-runtime": "export const jsx=(type,props,key)=>({type,props:props||{},key});export const jsxs=jsx;",
  "lucide-react": "export const Search='icon';",
  "@/components/ui/dialog": "export const Dialog='dialog',DialogContent='content',DialogHeader='header',DialogTitle='title',DialogDescription='description';",
};
const bundle = await build({ entryPoints: ["components/group-screen-assignment.tsx"], bundle: true, platform: "node", format: "cjs", write: false,
  plugins: [{ name: "dialog-handlers", setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: "fixture" } : undefined);
    plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
  } }],
});
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : text(node?.props?.children ?? "");
function find(node, predicate, result = []) {
  if (Array.isArray(node)) node.forEach(child => find(child, predicate, result));
  else if (node?.props) { if (predicate(node)) result.push(node); find(node.props.children, predicate, result); }
  return result;
}
function fixture() {
  let cursor = 0, closed = 0;
  const slots = [], calls = [];
  let resolveSave;
  const hooks = {
    state(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    ref(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
  };
  const context = vm.createContext({ module: { exports: {} }, hooks });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const entity = (id, type, name, parentId = null) => ({ id, type, name, parentId });
  const props = {
    group: entity("g", "group", "Cash"), busy: false, error: "",
    entities: [entity("mall", "store", "Dubai Mall"), entity("other", "store", "Other Mall"), ...Array.from({ length: 60 }, (_, i) => entity("s" + i, "screen", "Screen " + i, i < 40 ? "mall" : "other"))],
    members: [{ groupId: "g", screenId: "s50" }],
    onClose() { closed++; },
    onSave(body) { calls.push(body); return new Promise(resolve => { resolveSave = resolve; }); },
  };
  function render() { cursor = 0; return context.module.exports.default(props); }
  const tree = () => render();
  const button = label => find(tree(), node => node.type === "button" && text(node) === label)[0];
  const query = value => find(tree(), node => node.props["aria-label"] === "Search group screens")[0].props.onChange({ target: { value } });
  const count = () => text(find(tree(), node => node.props.role === "status")[0]);
  const inputs = () => find(tree(), node => node.type === "input" && node.props.type === "checkbox");
  return { props, tree, button, query, count, inputs, calls, closed: () => closed, settle: async result => { resolveSave(result); await Promise.resolve(); await Promise.resolve(); } };
}

const edit = fixture();
check(edit.button("Save changes").props.disabled, "Save starts disabled until a choice changes");
edit.query("Dubai Mall");
check(!!edit.button("Select all matching (40)"), "Search exposes the exact bulk scope");
edit.button("Select all matching (40)").props.onClick();
check(edit.count() === "41 screens selected", "Select matching preserves the hidden selected screen");
check(edit.inputs().every(node => node.props.checked), "All matching rows are checked, including offscreen rows");
check(edit.button("Select all matching (40)").props.disabled, "Selecting an already selected matching set is disabled");
edit.inputs()[3].props.onChange({ target: { checked: false } });
check(edit.count() === "40 screens selected", "An individual untick updates the draft count");
check(edit.calls.length === 0, "Search, bulk changes and exceptions do not write to the server");
edit.button("Clear matching").props.onClick();
check(edit.count() === "1 screen selected" && edit.button("Save changes").props.disabled, "Clearing the filtered additions restores the saved draft");
edit.query("does not exist");
check(edit.button("Select all matching (0)").props.disabled && edit.button("Clear matching").props.disabled, "Zero-result bulk controls cannot change hidden selections");
edit.query("");
edit.button("Select all").props.onClick();
check(edit.count() === "60 screens selected", "Unfiltered bulk select covers the complete list");
edit.inputs()[0].props.onChange({ target: { checked: false } });
const save = edit.button("Save changes");
save.props.onClick(); save.props.onClick();
check(edit.calls.length === 1 && edit.calls[0].action === "group-members", "A rapid double click sends one atomic save");
check(edit.calls[0].screenIds.length === 59 && !edit.calls[0].screenIds.includes("s0"), "Save submits the full final selection with exceptions");
check(JSON.stringify(edit.calls[0].expectedScreenIds) === '["s50"]', "Save includes the original membership snapshot");
check(edit.button("Saving...").props.disabled && edit.button("Cancel").props.disabled, "The dialog locks while saving");
const lockedTree = edit.tree();
find(lockedTree, node => node.type === "dialog")[0].props.onOpenChange(false);
let prevented = false;
find(lockedTree, node => node.type === "content")[0].props.onEscapeKeyDown({ preventDefault() { prevented = true; } });
check(edit.closed() === 0 && prevented, "Closing and Escape cannot interrupt an in-flight save");
await edit.settle(false);
check(edit.closed() === 0 && !edit.button("Save changes").props.disabled && edit.count() === "59 screens selected", "A failed save leaves the draft open and retryable");
edit.props.error = "Please reopen to review the latest selection.";
check(text(find(edit.tree(), node => node.props.role === "alert")[0]).includes("Please reopen"), "The server error is visible inside the dialog");
edit.button("Save changes").props.onClick();
await edit.settle(true);
check(edit.closed() === 1, "A successful save closes the dialog");

for (const mode of ["Cancel", "dismiss"]) {
  const cancel = fixture();
  cancel.button("Select all").props.onClick();
  if (mode === "Cancel") cancel.button("Cancel").props.onClick();
  else find(cancel.tree(), node => node.type === "dialog")[0].props.onOpenChange(false);
  check(cancel.closed() === 1 && cancel.calls.length === 0, `${mode} discards draft edits without a server write`);
}
const refreshed = fixture();
refreshed.props.members = [{ groupId: "g", screenId: "s2" }];
refreshed.tree();
refreshed.props.members = [{ groupId: "g", screenId: "s3" }];
refreshed.button("Select all").props.onClick();
refreshed.button("Save changes").props.onClick();
check(JSON.stringify(refreshed.calls[0].expectedScreenIds) === '["s2"]', "A refresh cannot silently replace the opening snapshot during editing");
await refreshed.settle(false);
console.log(`${checks} group assignment dialog handler checks passed.`);
