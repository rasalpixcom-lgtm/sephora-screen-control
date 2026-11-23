import assert from "node:assert/strict";
import { groupAssignmentRows, setMatchingGroupScreens, sameGroupScreenSelection } from "../components/group-screen-selection.ts";

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const entity = (id, type, name, parentId = null) => ({ id, type, name, parentId, liveUrl: null, isDemo: 0, createdAt: "2026-01-01" });
const entities = [
  entity("country", "country", "United Arab Emirates"),
  entity("region", "region", "Dubai", "country"),
  entity("mall", "store", "Dubai Mall", "region"),
  entity("other", "store", "Other location", "region"),
  entity("group", "group", "Cash"),
  ...Array.from({ length: 202 }, (_, i) => entity("screen-" + i, "screen", "Screen " + i, i < 120 ? "mall" : "other")),
];
const rows = groupAssignmentRows(entities, "");
check(rows.length === 202 && rows.every(row => row.screen.type === "screen"), "Only screens appear in assignment choices");
check(rows[0].location === "Dubai Mall · Dubai · United Arab Emirates", "Location search includes the full parent path");
check(groupAssignmentRows(entities, "  DUBAI MALL ").length === 120, "Search ignores case and surrounding whitespace");
check(groupAssignmentRows(entities, "United Arab Emirates").length === 202, "Country search includes screens beyond the visible list");
check(groupAssignmentRows(entities, "screen 201")[0].screen.id === "screen-201", "Screen names are searchable");
check(groupAssignmentRows(entities, "missing").length === 0, "Unknown searches give no matches");
check(groupAssignmentRows(entities, "  ").length === 202, "Whitespace behaves as no filter");
const initial = new Set(["screen-0", "screen-150"]);
const matching = groupAssignmentRows(entities, "Dubai Mall").map(row => row.screen.id);
const added = setMatchingGroupScreens(initial, matching, true);
check(added.size === 121 && added.has("screen-119"), "Select all matching includes offscreen matches");
check(added.has("screen-150") && !added.has("screen-151"), "Select matching preserves every choice outside the filter");
check(initial.size === 2 && !initial.has("screen-119"), "Draft operations leave the saved snapshot unchanged");
const except = setMatchingGroupScreens(added, ["screen-57"], false);
check(except.size === 120 && !except.has("screen-57") && except.has("screen-58"), "An individual exception removes only that screen");
const cleared = setMatchingGroupScreens(except, matching, false);
check(cleared.size === 1 && cleared.has("screen-150"), "Clear matching preserves selections hidden by search");
check(sameGroupScreenSelection(initial, new Set(["screen-150", "screen-0"])), "Membership comparison ignores order");
check(!sameGroupScreenSelection(initial, new Set(["screen-150", "screen-1"])), "Equal counts do not hide different memberships");
check(sameGroupScreenSelection(initial, setMatchingGroupScreens(initial, [], false)), "Clearing zero matches cannot clear the group");
const all = setMatchingGroupScreens(new Set(), rows.map(row => row.screen.id), true);
check(all.size === 202, "Unfiltered Select all includes every screen");
check(setMatchingGroupScreens(all, rows.map(row => row.screen.id), false).size === 0, "Unfiltered Clear selection clears all choices");
check(groupAssignmentRows([entity("orphan", "screen", "Orphan", "missing")], "orphan")[0].location === "", "A missing parent does not break the dialog");
console.log(`${checks} group screen selection checks passed.`);
