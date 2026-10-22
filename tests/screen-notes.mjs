import assert from "node:assert/strict";
import { parseScreenNote, SCREEN_NOTE_MAX_LENGTH } from "../lib/screen-notes.ts";

assert.equal(parseScreenNote("  First line\r\nSecond line  "), "First line\nSecond line");
assert.equal(parseScreenNote("  "), "");
assert.equal(parseScreenNote("x".repeat(SCREEN_NOTE_MAX_LENGTH)).length, SCREEN_NOTE_MAX_LENGTH);
assert.throws(() => parseScreenNote("x".repeat(SCREEN_NOTE_MAX_LENGTH + 1)));
for (const value of [null, 12, {}, ["note"], "bad\u0000text", "bad\u001btext"]) assert.throws(() => parseScreenNote(value));
console.log("Screen note validation passed.");
