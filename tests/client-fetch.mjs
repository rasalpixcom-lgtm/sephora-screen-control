import assert from "node:assert/strict";
import { clientFetch } from "../lib/client-fetch.ts";

const originalFetch = globalThis.fetch;
const originalTimeout = AbortSignal.timeout;
let timeout;
AbortSignal.timeout = milliseconds => {
  assert.equal(milliseconds, 15000);
  timeout = new AbortController();
  return timeout.signal;
};
globalThis.fetch = async (_input, options) => new Promise((resolve, reject) => {
  const signal = options.signal;
  if (signal.aborted) reject(signal.reason);
  else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});
try {
  const caller = new AbortController();
  const cancelled = clientFetch("https://example.test", { signal: caller.signal });
  caller.abort();
  await assert.rejects(cancelled, error => error === caller.signal.reason);
  await assert.rejects(clientFetch("https://example.test", { signal: caller.signal }), error => error === caller.signal.reason);

  const requestController = new AbortController();
  const request = new Request("https://example.test", { signal: requestController.signal });
  const requestCancelled = clientFetch(request);
  requestController.abort();
  await assert.rejects(requestCancelled, error => error.name === "AbortError");

  const timedOut = clientFetch("https://example.test");
  timeout.abort(new DOMException("Timeout", "TimeoutError"));
  await assert.rejects(timedOut, /The server took too long/);

  const networkError = new TypeError("Network unavailable");
  globalThis.fetch = async () => { throw networkError; };
  await assert.rejects(clientFetch("https://example.test"), error => error === networkError);
  globalThis.fetch = async (_input, options) => {
    assert.equal(options.signal.aborted, false);
    assert.equal(options.method, "POST");
    assert.equal(options.body, "example");
    return new Response("ok");
  };
  assert.equal(await (await clientFetch("https://example.test", { method: "POST", body: "example" })).text(), "ok");
  assert.equal(await (await clientFetch(request, { signal: null, method: "POST", body: "example" })).text(), "ok", "an explicit null signal overrides the Request signal");
  console.log("Client fetch checks passed: caller and Request cancellation, pre-aborted signals, timeout, network errors, and successful requests.");
} finally {
  globalThis.fetch = originalFetch;
  AbortSignal.timeout = originalTimeout;
}
