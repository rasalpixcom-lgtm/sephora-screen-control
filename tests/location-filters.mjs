import assert from "node:assert/strict";
import { validLocationFilters } from "../lib/location-filters.ts";

const entities = [
  { id: "uae", type: "country", parentId: null },
  { id: "ksa", type: "country", parentId: null },
  { id: "dubai", type: "region", parentId: "uae" },
  { id: "abu-dhabi", type: "region", parentId: "uae" },
  { id: "mall", type: "store", parentId: "dubai" },
];
const selected = { country: "uae", region: "dubai", location: "mall" };
assert.deepEqual(validLocationFilters(entities, selected), selected);
assert.deepEqual(validLocationFilters(entities.filter(entity => entity.id !== "uae"), selected), { country: "", region: "", location: "" });
assert.deepEqual(validLocationFilters(entities.filter(entity => entity.id !== "dubai"), selected), { country: "uae", region: "", location: "" });
assert.deepEqual(validLocationFilters(entities.filter(entity => entity.id !== "mall"), selected), { ...selected, location: "" });
assert.deepEqual(validLocationFilters(entities.map(entity => entity.id === "dubai" ? { ...entity, parentId: "ksa" } : entity), selected), { country: "uae", region: "", location: "" });
assert.deepEqual(validLocationFilters(entities.map(entity => entity.id === "mall" ? { ...entity, parentId: "abu-dhabi" } : entity), selected), { ...selected, location: "" });
assert.deepEqual(validLocationFilters(entities, { ...selected, country: "" }), { ...selected, country: "" });
assert.deepEqual(validLocationFilters(entities, { ...selected, region: "" }), { ...selected, region: "" });
assert.deepEqual(validLocationFilters(entities, { country: "mall", region: "", location: "" }), { country: "", region: "", location: "" });
console.log("9 location filter checks passed: deletion, reparenting and independent filters.");
