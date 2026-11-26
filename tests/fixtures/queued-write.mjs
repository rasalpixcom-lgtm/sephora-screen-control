import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

export async function verifyQueuedWriteRevocation({ pool, label, lock, lockParams, request, revoke, snapshot }) {
  const before = await snapshot();
  const locker = await pool.connect();
  let pending;
  try {
    await locker.query("BEGIN");
    await locker.query(lock, lockParams);
    pending = request();
    pending.catch(() => {});
    let waiting = false;
    for (let attempt = 0; attempt < 160 && !waiting; attempt++) {
      const result = await pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",
        [locker.processID],
      );
      waiting = result.rowCount > 0;
      if (!waiting) await delay(25);
    }
    assert.ok(waiting, label + " waits for its transaction lock");
    assert.equal((await revoke()).status, 200, "the queued session has signed out");
  } finally {
    try { await locker.query("ROLLBACK"); } finally { locker.release(); }
    if (pending) await pending.catch(() => {});
  }
  assert.equal((await pending).status, 401, label + " requires the queued session to still be active");
  assert.deepEqual(await snapshot(), before, label + " preserves the existing state");
  console.log("PASS " + label + " stops when the queued session is revoked");
}

export function queuedPostChecks(request, credentials, pool) {
  let loginCount = 0;
  return async function verifyPost({ route, body, label = route, lock, lockParams, snapshot }) {
    const login = await request("/api/auth/sign-in/email", credentials, "", {
      "x-forwarded-for": `192.0.2.${++loginCount}`,
    });
    assert.equal(login.status, 200, "fixture Admin starts a separate session");
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    await verifyQueuedWriteRevocation({
      pool, label, lock, lockParams, snapshot,
      request: () => request(route, body, cookie),
      revoke: () => request("/api/auth/sign-out", {}, cookie),
    });
  };
}
