import assert from "node:assert/strict";
import { locationCountsByCountry, locationCountsByRegion, validLocationFilters } from "../lib/location-filters.ts";

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

const counts = rows => Object.fromEntries(locationCountsByCountry(rows));
assert.deepEqual(counts(entities), {uae:1,ksa:0});
const withEmptyLocation = [...entities,{id:"empty-mall",type:"store",parentId:"abu-dhabi"},{id:"screen",type:"screen",parentId:"mall"}];
assert.deepEqual(counts(withEmptyLocation), {uae:2,ksa:0});
assert.deepEqual(counts(withEmptyLocation.map(row=>row.id==="dubai"?{...row,parentId:"ksa"}:row)), {uae:1,ksa:1});
const riyadh={id:"riyadh",type:"region",parentId:"ksa"};
assert.deepEqual(counts([...withEmptyLocation.map(row=>row.id==="mall"?{...row,parentId:"riyadh"}:row),riyadh]), {uae:1,ksa:1});
assert.deepEqual(counts(withEmptyLocation.filter(row=>row.id!=="empty-mall")), {uae:1,ksa:0});
assert.deepEqual(counts(withEmptyLocation.filter(row=>row.id!=="dubai")), {uae:1,ksa:0});
assert.deepEqual(counts(withEmptyLocation.filter(row=>row.id!=="uae")), {ksa:0});
assert.deepEqual(counts([...entities,{id:"invalid-store",type:"store",parentId:"uae"}]), {uae:1,ksa:0});
assert.deepEqual(counts([]), {});
console.log("9 country location-count checks passed: zero screens, empty countries, moves, deletion and invalid parents.");

const regionCounts = rows => Object.fromEntries(locationCountsByRegion(rows));
assert.deepEqual(regionCounts(entities), {dubai:1,"abu-dhabi":0});
assert.deepEqual(regionCounts(withEmptyLocation), {dubai:1,"abu-dhabi":1});
assert.deepEqual(regionCounts(withEmptyLocation.map(row=>row.id==="mall"?{...row,parentId:"abu-dhabi"}:row)), {dubai:0,"abu-dhabi":2});
assert.deepEqual(regionCounts(withEmptyLocation.filter(row=>row.id!=="mall")), {dubai:0,"abu-dhabi":1});
assert.deepEqual(regionCounts(withEmptyLocation.filter(row=>row.id!=="dubai")), {"abu-dhabi":1});
assert.deepEqual(regionCounts([...entities,{id:"bad-location",type:"store",parentId:"uae"},{id:"orphan-location",type:"store",parentId:"missing"}]), {dubai:1,"abu-dhabi":0});
assert.deepEqual(regionCounts(withEmptyLocation.map(row=>row.id==="dubai"?{...row,parentId:"ksa"}:row)), {dubai:1,"abu-dhabi":1});
assert.deepEqual(regionCounts([]), {});
console.log("8 region location-count checks passed: empty regions, zero-screen locations, moves, deletion and invalid parents.");
