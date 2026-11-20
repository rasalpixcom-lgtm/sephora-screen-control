import assert from "node:assert/strict";
import { emptyGroupScreenFilters, filteredGroupSelection, groupScreenView } from "../components/controller-group-filters.ts";

const entity = (id, type, name, parentId = null) => ({ id, type, name, parentId });
const entities = [
  entity("uae", "country", "United Arab Emirates"), entity("ksa", "country", "Saudi Arabia"), entity("oman", "country", "Oman"),
  entity("dubai", "region", "Dubai", "uae"), entity("abu", "region", "Abu Dhabi", "uae"), entity("riyadh", "region", "Riyadh", "ksa"),
  entity("dm", "store", "Dubai Mall", "dubai"), entity("moe", "store", "Mall of Emirates", "dubai"), entity("galleria", "store", "Galleria", "abu"), entity("park", "store", "Riyadh Park", "riyadh"), entity("unused", "store", "Other location", "dubai"),
  entity("s1", "screen", "TDM Cash", "dm"), entity("s2", "screen", "MOE Cash", "moe"), entity("s3", "screen", "Galleria Cash", "galleria"), entity("s4", "screen", "Riyadh Cash", "park"), entity("s5", "screen", "Other group", "unused"),
  entity("g1", "group", "Behind Cash"), entity("g2", "group", "Animation Table"),
];
const members = ["s1", "s2", "s3", "s4"].map(screenId => ({ groupId: "g1", screenId })).concat([{ groupId: "g2", screenId: "s5" }, { groupId: "g1", screenId: "s1" }, { groupId: "g1", screenId: "missing" }]);
const snapshot = JSON.stringify({ entities, members, emptyGroupScreenFilters });
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const ids = rows => rows.map(row => row.id);
const view = filters => groupScreenView(entities, members, "g1", { ...emptyGroupScreenFilters, ...filters });

equal(ids(view({}).screens), ["s1", "s2", "s3", "s4"]);
equal(ids(view({}).matching), ["s1", "s2", "s3", "s4"]);
equal(ids(view({}).countries), ["ksa", "uae"]);
equal(view({}).regions, []);
equal(view({}).locations, []);
equal(view({}).hasFilters, false);
equal(ids(view({ countryId: "uae" }).matching), ["s1", "s2", "s3"]);
equal(ids(view({ countryId: "uae" }).regions), ["abu", "dubai"]);
equal(ids(view({ countryId: "uae", regionId: "dubai" }).locations), ["dm", "moe"]);
equal(ids(view({ countryId: "uae", regionId: "dubai" }).matching), ["s1", "s2"]);
equal(ids(view({ countryId: "uae", regionId: "dubai", storeId: "dm" }).matching), ["s1"]);
equal(ids(view({ query: "  MOE CASH  " }).matching), ["s2"]);
equal(ids(view({ query: "dubai mall" }).matching), ["s1"]);
equal(ids(view({ query: "Abu Dhabi" }).matching), ["s3"]);
equal(ids(view({ query: "Saudi Arabia" }).matching), ["s4"]);
equal(ids(view({ countryId: "uae", query: "Riyadh" }).matching), []);
equal(view({ query: "   " }).hasFilters, false);
equal(view({ countryId: "uae", regionId: "riyadh", storeId: "park" }).filters, { ...emptyGroupScreenFilters, countryId: "uae" });
equal(view({ countryId: "oman", regionId: "dubai", storeId: "dm" }).filters, emptyGroupScreenFilters);
equal(view({ regionId: "dubai", storeId: "dm" }).filters, emptyGroupScreenFilters);
equal(view({ countryId: "uae", regionId: "dubai", storeId: "galleria" }).filters.storeId, "");

const removedLocation = entities.filter(item => item.id !== "dm");
equal(groupScreenView(removedLocation, members, "g1", { ...emptyGroupScreenFilters, countryId: "uae", regionId: "dubai", storeId: "dm" }).filters.storeId, "");
const movedLocation = entities.map(item => item.id === "dm" ? { ...item, parentId: "abu" } : item);
equal(ids(groupScreenView(movedLocation, members, "g1", { ...emptyGroupScreenFilters, countryId: "uae", regionId: "dubai", storeId: "dm" }).matching), ["s2"]);
equal(ids(groupScreenView(entities, members.filter(item => item.screenId !== "s1"), "g1", { ...emptyGroupScreenFilters, countryId: "uae", regionId: "dubai", storeId: "dm" }).matching), ["s2"]);
equal(ids(groupScreenView(entities, members, "g2", emptyGroupScreenFilters).screens), ["s5"]);
equal(groupScreenView(entities, members, "missing", emptyGroupScreenFilters).screens, []);
equal(groupScreenView([], [], "g1", emptyGroupScreenFilters).countries, []);

const matches = view({ countryId: "uae", regionId: "dubai" }).matching;
equal(filteredGroupSelection("g1", matches), { groupId: "g1", screenIds: ["s1", "s2"] });
equal(filteredGroupSelection("g1", []), null); // Empty selections otherwise mean all screens in the existing API.
equal(filteredGroupSelection("g1", [...matches, matches[0]]), { groupId: "g1", screenIds: ["s1", "s2"] });
equal(filteredGroupSelection("g1", Array.from({ length: 500 }, (_, i) => ({ id: "screen-" + i }))).screenIds.length, 500);
equal(filteredGroupSelection("g1", Array.from({ length: 501 }, (_, i) => ({ id: "screen-" + i }))), null);
equal(JSON.stringify({ entities, members, emptyGroupScreenFilters }), snapshot);
console.log(`${checks} controller group filter checks passed: hierarchy, membership, search, inventory changes, unchanged inputs and safe wall selection.`);
