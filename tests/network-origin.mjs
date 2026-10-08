import assert from "node:assert/strict";
import { validAuthOrigin, configuredAuthOrigins, matchesAuthOrigin } from "../lib/network-origin.ts";
for (const [origin, enabled, expected] of [
  ["http://127.0.0.1:5174", false, true], ["http://localhost:5174", false, true],
  ["http://192.168.2.131:5174", false, false], ["http://192.168.2.131:5174", true, true],
  ["http://10.1.2.3:5174", true, true], ["http://172.16.1.1:5174", true, true],
  ["http://172.31.255.255:5174", true, true], ["http://172.32.0.1:5174", true, false],
  ["http://192.169.2.131:5174", true, false], ["http://8.8.8.8:5174", true, false],
  ["http://example.com:5174", true, false], ["http://0.0.0.0:5174", true, false],
  ["https://screens.example.com", false, true], ["https://screens.example.com/path", true, false],
  ["https://user:pass@screens.example.com", true, false], ["ftp://192.168.2.131", true, false],
]) assert.equal(validAuthOrigin(origin, enabled), expected, origin);
console.log("16 network-origin checks passed; public HTTP remains blocked.");
const origins = configuredAuthOrigins("http://192.168.2.131:5174", "http://localhost:5174,http://127.0.0.1:5174", true);
for (const origin of origins) assert.equal(matchesAuthOrigin(new Request(origin + "/api/state", { headers: { origin } }), origins), true);
assert.equal(matchesAuthOrigin(new Request(origins[0] + "/api/state", { headers: { origin: origins[1] } }), origins), false);
assert.equal(matchesAuthOrigin(new Request(origins[0] + "/api/state", { headers: { origin: "http://attacker.test:5174" } }), origins), false);
assert.equal(matchesAuthOrigin(new Request(origins[0] + "/api/state"), origins), false);
assert.throws(() => configuredAuthOrigins(origins[0], "http://8.8.8.8:5174", true));
assert.throws(() => configuredAuthOrigins("https://screens.example.com", "http://localhost:5174"));
console.log("8 additional checks passed for explicit origins, same-host writes, and protocol validation.");
