import assert from "node:assert/strict";
import { screensFor } from "../lib/screens.ts";
const entity = (id, type, parentId = null) => ({ id, type, parentId, name: id, liveUrl: null, isDemo: 0, createdAt: "" });
const state = {
  entities: [entity("uae", "country"), entity("ksa", "country"), entity("dubai", "region", "uae"), entity("riyadh", "region", "ksa"), entity("mall1", "store", "dubai"), entity("mall2", "store", "dubai"), entity("mall3", "store", "riyadh"), entity("a", "screen", "mall1"), entity("b", "screen", "mall2"), entity("c", "screen", "mall3"), entity("cash", "group")],
  members: [{ groupId: "cash", screenId: "a" }, { groupId: "cash", screenId: "c" }],
  display: { selection: {}, autoAdvance: true, intervalSeconds: 10, updatedAt: "" },
};
for (const [selection, expected] of [
  [{}, ["a", "b", "c"]],
  [{ countryId: "uae" }, ["a", "b"]],
  [{ regionId: "dubai" }, ["a", "b"]],
  [{ storeId: "mall1" }, ["a"]],
  [{ groupId: "cash" }, ["a", "c"]],
  [{ screenIds: ["b", "c"] }, ["b", "c"]],
  [{ countryId: "uae", screenIds: ["a", "c"] }, ["a"]],
  [{ groupId: "cash", screenIds: ["c"] }, ["c"]],
  [{ storeId: "mall1", screenIds: [] }, ["a"]],
  [{ groupId: "missing" }, []],
  [{ countryId: "missing" }, []],
]) assert.deepEqual(screensFor(state, selection).map(screen => screen.id), expected);
assert.deepEqual(screensFor({ ...state, entities: [], members: [] }, {}), []);
console.log("12 Controller/Monitor selection logic checks passed.");
