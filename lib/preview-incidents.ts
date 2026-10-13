import crypto from "node:crypto";
import { getPool } from "./database";
import { onSignToken } from "./onsign-stream";

export type PreviewResult = {
  screenId: string;
  token: string;
  received: boolean;
  checkedAt: number;
};

export function previewSourceFingerprint(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function recordPreviewResult(result: PreviewResult) {
  const client = await getPool().connect();
  const checkedAt = new Date(result.checkedAt);
  const fingerprint = previewSourceFingerprint(result.token);
  try {
    await client.query("BEGIN");
    const screen = (await client.query<{ live_url:string | null }>("SELECT live_url FROM entities WHERE id = $1 AND type = 'screen' FOR SHARE", [result.screenId])).rows[0];
    if (!screen?.live_url || onSignToken(screen.live_url) !== result.token) {
      await client.query("COMMIT");
      return;
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [result.screenId]);
    const state = (await client.query<{ source_fingerprint:string; last_success_at:Date | null; last_checked_at:Date }>(
      "SELECT source_fingerprint, last_success_at, last_checked_at FROM preview_screen_state WHERE screen_id = $1 FOR UPDATE",
      [result.screenId],
    )).rows[0];
    if (state?.source_fingerprint === fingerprint && state.last_checked_at.getTime() >= result.checkedAt) {
      await client.query("COMMIT");
      return;
    }
    const open = (await client.query<{ id:string; source_fingerprint:string }>(
      "SELECT id, source_fingerprint FROM preview_incident WHERE screen_id = $1 AND resolved_at IS NULL FOR UPDATE",
      [result.screenId],
    )).rows[0];

    if (open && open.source_fingerprint !== fingerprint) {
      await client.query("UPDATE preview_incident SET resolved_at = $2, resolution_reason = 'configuration_changed' WHERE id = $1", [open.id, checkedAt]);
    }

    if (result.received) {
      await client.query(
        "UPDATE preview_incident SET last_checked_at = $2, resolved_at = $2, resolution_reason = CASE WHEN source_fingerprint = $3 THEN 'recovered' ELSE 'configuration_changed' END WHERE screen_id = $1 AND resolved_at IS NULL",
        [result.screenId, checkedAt, fingerprint],
      );
      await client.query(`INSERT INTO preview_screen_state (screen_id, source_fingerprint, status, last_success_at, last_checked_at, updated_at)
        VALUES ($1, $2, 'available', $3, $3, $3)
        ON CONFLICT (screen_id) DO UPDATE SET source_fingerprint = EXCLUDED.source_fingerprint, status = EXCLUDED.status,
          last_success_at = EXCLUDED.last_success_at, last_checked_at = EXCLUDED.last_checked_at, updated_at = EXCLUDED.updated_at`,
        [result.screenId, fingerprint, checkedAt]);
    } else {
      const sameSourceSuccess = state?.source_fingerprint === fingerprint ? state.last_success_at : null;
      await client.query(`INSERT INTO preview_incident (id, screen_id, source_fingerprint, started_at, last_checked_at, last_success_at)
        VALUES ($1, $2, $3, $4, $4, $5)
        ON CONFLICT (screen_id) WHERE resolved_at IS NULL DO UPDATE SET last_checked_at = EXCLUDED.last_checked_at`,
        [crypto.randomUUID(), result.screenId, fingerprint, checkedAt, sameSourceSuccess]);
      await client.query(`INSERT INTO preview_screen_state (screen_id, source_fingerprint, status, last_success_at, last_checked_at, updated_at)
        VALUES ($1, $2, 'unavailable', $3, $4, $4)
        ON CONFLICT (screen_id) DO UPDATE SET source_fingerprint = EXCLUDED.source_fingerprint, status = EXCLUDED.status,
          last_success_at = EXCLUDED.last_success_at, last_checked_at = EXCLUDED.last_checked_at, updated_at = EXCLUDED.updated_at`,
        [result.screenId, fingerprint, sameSourceSuccess, checkedAt]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function reconcilePreviewInventory(at = new Date()) {
  const client = await getPool().connect();
  try {
    const open = await client.query<{ screen_id:string }>(
      "SELECT screen_id FROM preview_incident WHERE resolved_at IS NULL",
    );
    for (const candidate of open.rows) {
      await client.query("BEGIN");
      const screen = (await client.query<{live_url:string | null}>("SELECT live_url FROM entities WHERE id = $1 FOR SHARE", [candidate.screen_id])).rows[0];
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [candidate.screen_id]);
      const incident = (await client.query<{id:string; source_fingerprint:string}>("SELECT id, source_fingerprint FROM preview_incident WHERE screen_id = $1 AND resolved_at IS NULL FOR UPDATE", [candidate.screen_id])).rows[0];
      const token = screen?.live_url ? onSignToken(screen.live_url) : null;
      if (incident && (!token || previewSourceFingerprint(token) !== incident.source_fingerprint)) {
        await client.query("UPDATE preview_incident SET resolved_at = $2, resolution_reason = 'configuration_changed' WHERE id = $1", [incident.id, at]);
      }
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
