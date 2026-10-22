import assert from "node:assert/strict";
import { parseScreenRemoteAccess } from "../lib/screen-remote-access.ts";

assert.deepEqual(parseScreenRemoteAccess({ teamViewerId: " 123 456-789 ", anyDeskId: " 987 654 321 " }), { teamViewerId: "123456789", anyDeskId: "987654321" });
assert.deepEqual(parseScreenRemoteAccess({ teamViewerId: "", anyDeskId: "store-screen@ad" }), { teamViewerId: "", anyDeskId: "store-screen@ad" });
assert.deepEqual(parseScreenRemoteAccess({ teamViewerId: "", anyDeskId: "" }), { teamViewerId: "", anyDeskId: "" });
for (const value of [null, [], {}, { teamViewerId: 123, anyDeskId: "" }, { teamViewerId: "abc", anyDeskId: "" }, { teamViewerId: "1".repeat(33), anyDeskId: "" }, { teamViewerId: "", anyDeskId: "https://example.com" }, { teamViewerId: "", anyDeskId: "a".repeat(101) }, { teamViewerId: "123\n456", anyDeskId: "" }, { teamViewerId: "", anyDeskId: "alias name" }, { teamViewerId: "", anyDeskId: "", password: "not-stored" }]) assert.throws(() => parseScreenRemoteAccess(value));
console.log("Remote access validation passed: optional fields, ID normalization, aliases, invalid characters, length limits and unexpected fields.");
