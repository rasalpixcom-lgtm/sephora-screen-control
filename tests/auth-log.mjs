import assert from "node:assert/strict";
import { authLog } from "../lib/auth-log.ts";
const original = { error: console.error, warn: console.warn, log: console.log };
const entries = [];
try {
  for (const method of Object.keys(original)) console[method] = (...args) => entries.push({ method, args });
  const privateValue = "private-session-password-token";
  authLog("error", `Failed query params: ${privateValue}`, { cause: { code: "42P01", params: [privateValue], message: privateValue } });
  assert.deepEqual(entries.pop(), { method: "error", args: ["Authentication service error", "42P01"] });
  authLog("warn", privateValue, { code: privateValue });
  assert.deepEqual(entries.pop(), { method: "warn", args: ["Authentication service warn", "unavailable"] });
  authLog("info", privateValue, { cause: { code: "ETIMEDOUT" } });
  assert.deepEqual(entries.pop(), { method: "log", args: ["Authentication service info", "ETIMEDOUT"] });
  const cycle = {}; cycle.cause = cycle;
  authLog("debug", privateValue, cycle);
  assert.deepEqual(entries.pop(), { method: "log", args: ["Authentication service debug", "unavailable"] });
} finally { Object.assign(console, original); }
console.log("4 authentication logging checks passed: severity, safe codes, private payload exclusion and bounded causes.");
