import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { collectComplaintAlerts } from "../lib/complaint-alerts-collector.ts";

const { outputFiles: [settingsBundle] } = await build({
  entryPoints: ["lib/complaint-alerts-settings.ts"], bundle: true, platform: "node", format: "esm", write: false,
});
const { complaintAlertSettings } = await import(`data:text/javascript;base64,${Buffer.from(settingsBundle.contents).toString("base64")}`);

const config = { mode: "pilot", origin: "https://complaints.example.test", token: "pilot-test-token", sourceClientId: 7, sourceStoreId: 22 };
const endpoint = `${config.origin}/api/integrations/screen-control/alerts`;
const pilotEnv = {
  COMPLAINT_ALERTS_ENABLED: "true", COMPLAINT_ALERTS_ORIGIN: config.origin, COMPLAINT_ALERTS_TOKEN: "t".repeat(32),
  COMPLAINT_ALERTS_MONITOR_KEY_SHA256: "a".repeat(64), COMPLAINT_ALERTS_SOURCE_CLIENT_ID: "7",
  COMPLAINT_ALERTS_SOURCE_STORE_ID: "22", COMPLAINT_ALERTS_SCREEN_MAP: '{"191":"screen-1"}',
};
const allClientsEnv = {
  COMPLAINT_ALERTS_ENABLED: "true", COMPLAINT_ALERTS_ORIGIN: config.origin, COMPLAINT_ALERTS_TOKEN: "t".repeat(32),
  COMPLAINT_ALERTS_MODE: "all_clients", COMPLAINT_ALERTS_ALL_CLIENTS_MONITOR_KEY_SHA256: "b".repeat(64),
};
const event = (id, fields = {}) => ({
  event_id: `03ea7494-4b20-49d0-8350-${id.toString().padStart(12, "0")}`,
  complaint_id: id,
  created_at: "2026-11-24T00:45:01.123456Z",
  priority: "medium",
  client_id: 7,
  client_name: "Sephora",
  store_id: 22,
  store_name: "Dubai Mall",
  screen_id: 191,
  screen_name: "Screen 1",
  issue_label: "Screen offline",
  ...fields,
});
const batch = (...alerts) => Response.json({ alerts });
const ack = () => new Response(null, { status: 204 });

test("preserves pilot settings when the delivery mode is unset, blank or explicitly pilot", () => {
  for (const mode of [undefined, "", "   ", "pilot"]) {
    assert.deepEqual(complaintAlertSettings({ ...pilotEnv, COMPLAINT_ALERTS_MODE: mode }), {
      mode: "pilot", origin: config.origin, token: pilotEnv.COMPLAINT_ALERTS_TOKEN,
      monitorKeyHash: pilotEnv.COMPLAINT_ALERTS_MONITOR_KEY_SHA256, sourceClientId: 7, sourceStoreId: 22,
      screenMap: new Map([[191, "screen-1"]]),
    });
  }
  assert.throws(() => complaintAlertSettings({ ...pilotEnv, COMPLAINT_ALERTS_SCREEN_MAP: "{}" }), /Map at least one screen/);
  assert.equal(complaintAlertSettings({ COMPLAINT_ALERTS_ENABLED: "false", COMPLAINT_ALERTS_MODE: "invalid" }), null);
});

test("all-client settings accept separate monitor credentials and an optional map keyed by client, store and screen", () => {
  const expected = {
    mode: "all_clients", origin: config.origin, token: allClientsEnv.COMPLAINT_ALERTS_TOKEN,
    monitorKeyHash: allClientsEnv.COMPLAINT_ALERTS_ALL_CLIENTS_MONITOR_KEY_SHA256, screenMap: new Map(),
  };
  assert.deepEqual(complaintAlertSettings(allClientsEnv), expected);
  assert.deepEqual(complaintAlertSettings({ ...allClientsEnv, COMPLAINT_ALERTS_ALL_CLIENTS_SCREEN_MAP: "  " }), expected);
  const mapping = { "7:22:191": { clientId: "sephora", screenId: "screen-1" }, "8:22:191": { clientId: "other-client", screenId: "screen-1" } };
  assert.deepEqual(complaintAlertSettings({
    ...allClientsEnv, COMPLAINT_ALERTS_SOURCE_CLIENT_ID: "unused", COMPLAINT_ALERTS_SOURCE_STORE_ID: "unused",
    COMPLAINT_ALERTS_SCREEN_MAP: "unused", COMPLAINT_ALERTS_MONITOR_KEY_SHA256: pilotEnv.COMPLAINT_ALERTS_MONITOR_KEY_SHA256,
    COMPLAINT_ALERTS_ALL_CLIENTS_SCREEN_MAP: JSON.stringify(mapping),
  }), { ...expected, screenMap: new Map(Object.entries(mapping)) });
});

test("rejects unknown delivery modes and missing, malformed or reused all-client monitor credentials", () => {
  for (const mode of ["all", "ALL_CLIENTS", "pilot ", " all_clients"]) {
    assert.throws(() => complaintAlertSettings({ ...pilotEnv, COMPLAINT_ALERTS_MODE: mode }), /Invalid complaint alert mode/);
  }
  for (const key of [undefined, "", "z".repeat(64), "b".repeat(63)]) {
    assert.throws(() => complaintAlertSettings({
      ...allClientsEnv, COMPLAINT_ALERTS_MONITOR_KEY_SHA256: pilotEnv.COMPLAINT_ALERTS_MONITOR_KEY_SHA256,
      COMPLAINT_ALERTS_ALL_CLIENTS_MONITOR_KEY_SHA256: key,
    }), /Invalid complaint alert credentials/);
  }
  assert.throws(() => complaintAlertSettings({
    ...allClientsEnv, COMPLAINT_ALERTS_MONITOR_KEY_SHA256: allClientsEnv.COMPLAINT_ALERTS_ALL_CLIENTS_MONITOR_KEY_SHA256,
  }), /separate monitor key/);
});

test("rejects invalid all-client screen mapping keys and targets", () => {
  const target = { clientId: "sephora", screenId: "screen-1" };
  const badValues = [
    "{", "[]", "null", ...["07:22:191", "7:0:191", "7:22:-1", "7:22", "7:22:191:1", "7:22:9007199254740992"].map(key => JSON.stringify({ [key]: target })),
    ...[null, ["sephora", "screen-1"], "screen-1", { clientId: "sephora" }, { ...target, extra: true },
      { ...target, clientId: "client/other" }, { ...target, screenId: "" }, { ...target, screenId: " screen-1" }]
      .map(value => JSON.stringify({ "7:22:191": value })),
  ];
  for (const map of badValues) assert.throws(() => complaintAlertSettings({ ...allClientsEnv, COMPLAINT_ALERTS_ALL_CLIENTS_SCREEN_MAP: map }));
});

test("collects low, medium and high alerts over the fixed HTTPS routes with independent timeouts", async () => {
  const alerts = [event(1, { priority: "low" }), event(2), event(3, { priority: "high", created_at: "2026-11-24T00:45:02+00:00" })];
  const calls = [], saved = [], signals = new Set();
  const result = await collectComplaintAlerts(config, {
    fetch: async (url, options) => {
      const headers = new Headers(options.headers);
      assert.equal(headers.get("authorization"), "Bearer pilot-test-token");
      assert.equal(headers.get("accept"), "application/json");
      assert.equal(headers.has("cookie"), false);
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      signals.add(options.signal);
      if (options.method === "GET") {
        assert.equal(url.href, endpoint);
        calls.push("get");
        return batch(...alerts);
      }
      assert.equal(options.method, "POST");
      assert.equal(url.href, `${endpoint}/ack`);
      assert.equal(headers.get("content-type"), "application/json");
      const id = saved.at(-1).eventId;
      assert.deepEqual(JSON.parse(options.body), { event_id: id });
      calls.push(`ack ${id}`);
      return ack();
    },
    save: async alert => {
      calls.push(`save ${alert.eventId}`);
      saved.push(alert);
    },
  });
  assert.deepEqual(result, { failed: false });
  assert.equal(signals.size, 4);
  assert.deepEqual(calls, ["get", ...alerts.flatMap(row => [`save ${row.event_id}`, `ack ${row.event_id}`])]);
  assert.deepEqual(saved[0], {
    eventId: alerts[0].event_id, complaintId: 1, createdAt: alerts[0].created_at, priority: "low",
    sourceClientId: 7, clientName: "Sephora", sourceStoreId: 22, storeName: "Dubai Mall",
    sourceScreenId: 191, screenName: "Screen 1", issueLabel: "Screen offline",
  });
  assert.equal(saved[2].createdAt, alerts[2].created_at);
});

test("skips malformed and out-of-scope events, and retains only the allowed fields for a valid unmapped screen", async () => {
  const good = event(50, { screen_id: 9742, issue_label: "  Power failure  ", description: "Private report text", phone: "Private contact" });
  const alerts = [null, {}, event(1, { event_id: "not-a-uuid" }), event(2, { client_id: 8 }),
    event(3, { store_id: 33 }), event(4, { complaint_id: Number.MAX_SAFE_INTEGER + 1 }),
    event(5, { screen_id: "123" }), event(6, { priority: "urgent" }),
    event(7, { created_at: "2026-02-30T01:02:03Z" }), event(8, { created_at: "2026-11-24T04:45:01+04:00" }),
    event(9, { screen_name: "x".repeat(256) }), event(10, { issue_label: "Line\nBreak" }), good];
  const saved = [], acked = [];
  const result = await collectComplaintAlerts(config, {
    fetch: async (_url, { method, body }) => {
      if (method === "GET") return batch(...alerts);
      acked.push(JSON.parse(body).event_id);
      return ack();
    },
    save: async alert => { saved.push(alert); },
  });
  assert.deepEqual(result, { failed: true });
  assert.deepEqual(acked, [good.event_id]);
  assert.deepEqual(saved.map(alert => alert.eventId), [good.event_id]);
  assert.equal(saved[0].sourceScreenId, 9742);
  assert.equal(saved[0].issueLabel, "Power failure");
  assert.equal(Object.hasOwn(saved[0], "description"), false);
  assert.equal(Object.hasOwn(saved[0], "phone"), false);
});

test("collects valid all-client complaints in feed order without a screen map and skips invalid source IDs", async () => {
  const first = event(1, { client_id: 7, store_id: 22 });
  const next = event(2, { client_id: 8, client_name: "Other client", store_id: 41, screen_id: 191, description: "Private complaint text" });
  const last = event(3, { client_id: 7, store_id: 24, screen_id: 92 });
  const invalid = [event(4, { client_id: 0 }), event(5, { client_id: "7" }), event(6, { store_id: -1 }),
    event(7, { store_id: Number.MAX_SAFE_INTEGER + 1 }), event(8, { screen_id: 1.5 }), event(9, { screen_id: null })];
  const saved = [], acked = [];
  const result = await collectComplaintAlerts(complaintAlertSettings(allClientsEnv), {
    fetch: async (_url, { method, body }) => {
      if (method === "GET") return batch(first, ...invalid, next, last);
      acked.push(JSON.parse(body).event_id);
      return ack();
    },
    save: async alert => { saved.push(alert); },
  });
  assert.deepEqual(result, { failed: true });
  assert.deepEqual(acked, [first.event_id, next.event_id, last.event_id]);
  assert.deepEqual(saved.map(({ sourceClientId, sourceStoreId, sourceScreenId }) => [sourceClientId, sourceStoreId, sourceScreenId]),
    [[7, 22, 191], [8, 41, 191], [7, 24, 92]]);
  assert.equal(Object.hasOwn(saved[1], "description"), false);
});

test("leaves later complaints pending when an earlier save fails, then saves and acknowledges in feed order", async () => {
  const first = event(10), second = event(11, { priority: "high" });
  const saved = [], acked = [], attemptedSaves = [];
  let failedOnce = false;
  const dependencies = {
    fetch: async (_url, { method, body }) => {
      if (method === "GET") return batch(first, second);
      acked.push(JSON.parse(body).event_id);
      return ack();
    },
    save: async alert => {
      attemptedSaves.push(alert.eventId);
      if (!failedOnce && alert.eventId === first.event_id) {
        failedOnce = true;
        throw new Error("Storage failed");
      }
      saved.push(alert.eventId);
    },
  };
  assert.deepEqual(await collectComplaintAlerts(config, dependencies), { failed: true });
  assert.deepEqual(attemptedSaves, [first.event_id]);
  assert.deepEqual(saved, []);
  assert.deepEqual(acked, []);
  assert.deepEqual(await collectComplaintAlerts(config, dependencies), { failed: false });
  assert.deepEqual(attemptedSaves, [first.event_id, first.event_id, second.event_id]);
  assert.deepEqual(saved, [first.event_id, second.event_id]);
  assert.deepEqual(acked, saved);
});

test("continues after acknowledgment failures and retries acknowledgments for saved events", async () => {
  const lostAck = event(11), wrongStatus = event(12), last = event(13);
  const saved = new Set();
  const acked = [], attemptedSaves = [];
  let fetchingRetry = false;
  const dependencies = {
    fetch: async (_url, { method, body }) => {
      if (method === "GET") return fetchingRetry ? batch(lostAck, wrongStatus) : batch(lostAck, wrongStatus, last);
      const { event_id: id } = JSON.parse(body);
      acked.push(id);
      if (!fetchingRetry && id === lostAck.event_id) throw new DOMException("Timed out", "TimeoutError");
      if (!fetchingRetry && id === wrongStatus.event_id) return Response.json({ accepted: true });
      return ack();
    },
    save: async alert => {
      attemptedSaves.push(alert.eventId);
      saved.add(alert.eventId);
    },
  };
  assert.deepEqual(await collectComplaintAlerts(config, dependencies), { failed: true });
  assert.deepEqual([...saved], [lostAck.event_id, wrongStatus.event_id, last.event_id]);
  assert.deepEqual(acked, [lostAck.event_id, wrongStatus.event_id, last.event_id]);
  fetchingRetry = true;
  assert.deepEqual(await collectComplaintAlerts(config, dependencies), { failed: false });
  assert.equal(saved.size, 3);
  assert.deepEqual(acked.slice(3), [lostAck.event_id, wrongStatus.event_id]);
  assert.deepEqual(attemptedSaves, [lostAck.event_id, wrongStatus.event_id, last.event_id, lostAck.event_id, wrongStatus.event_id]);
});

test("rejects incompatible batch responses without saving or acknowledging any event", async () => {
  const responses = [
    () => Response.redirect("https://elsewhere.example.test", 302),
    () => new Response("unavailable", { status: 503 }),
    () => new Response("{"),
    () => Response.json({ alerts: {} }),
    () => batch(...Array.from({ length: 51 }, (_, index) => event(index + 1))),
    () => { throw new DOMException("Timed out", "TimeoutError"); },
  ];
  for (const response of responses) {
    const requests = [], saved = [];
    assert.deepEqual(await collectComplaintAlerts(config, {
      fetch: async (_url, { method }) => { requests.push(method); return response(); },
      save: async alert => { saved.push(alert); },
    }), { failed: true });
    assert.deepEqual(requests, ["GET"]);
    assert.deepEqual(saved, []);
  }
});

test("bounds streamed JSON even without a content-length header", async () => {
  let reads = 0, cancelled = false, saves = 0;
  const body = new ReadableStream({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(200 * 1024).fill(32)); },
    cancel() { cancelled = true; },
  });
  const result = await collectComplaintAlerts(config, {
    fetch: async () => new Response(body),
    save: async () => { saves++; },
  });
  assert.deepEqual(result, { failed: true });
  assert.equal(saves, 0);
  assert.equal(cancelled, true);
  assert.ok(reads <= 3);
});

test("does not send credentials for invalid origins, tokens or pilot scope", async () => {
  for (const invalid of [
    { origin: "http://complaints.example.test" }, { origin: "https://user:pw@complaints.example.test" },
    { origin: "https://complaints.example.test/base" }, { origin: "https://complaints.example.test/?test=1" },
    { origin: "https://complaints.example.test/#fragment" }, { token: "pilot-test-token\n" }, { token: "" }, { sourceStoreId: 0 }, { mode: "all" },
  ]) {
    let calls = 0;
    const result = await collectComplaintAlerts({ ...config, ...invalid }, {
      fetch: async () => { calls++; return batch(); }, save: async () => { calls++; },
    });
    assert.deepEqual(result, { failed: true });
    assert.equal(calls, 0);
  }
});

test("treats an empty alert queue as a successful poll", async () => {
  assert.deepEqual(await collectComplaintAlerts(config, {
    fetch: async () => batch(), save: async () => assert.fail("Nothing to save"),
  }), { failed: false });
});
