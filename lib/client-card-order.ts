import { createHash } from "node:crypto";
import { getPool, ServerDatabase } from "./database";
import { validClientId } from "./client-workspace";
import { RequestError } from "./request";
import { canAccessClient } from "./auth-policy";

export type ClientCardOrder = { order: string[]; version: string | null };
const orderVersionFormat = /^(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|[a-f0-9]{64})$/;

function orderVersion(version: string | null, clientIds: readonly string[] | null) {
  if (version === null || clientIds === null) return version;
  // Tabs share session cookies. Bind a restricted order to the scope displayed in that tab.
  return createHash("sha256").update(JSON.stringify([version, [...clientIds].sort()])).digest("hex");
}

export async function getClientCardOrder(userId: string, clientIds: readonly string[] | null): Promise<ClientCardOrder> {
  const { rows } = await getPool("sephora").query<ClientCardOrder & { clientIds: string[] | null }>(
    `SELECT p.client_ids AS "order",p.version,u.controller_client_ids AS "clientIds"
     FROM user_client_order p JOIN auth_user u ON u.id=p.user_id
     WHERE p.user_id=$1 AND NOT u.disabled AND u.role IN ('admin','controller')`, [userId],
  );
  const stored = rows[0];
  if (!stored) return { order: [], version: null };
  const available = clientIds === null ? stored.clientIds : clientIds.filter(id => canAccessClient(stored.clientIds, id));
  return {
    order: stored.order.filter(id => canAccessClient(available, id)),
    version: orderVersion(stored.version, available),
  };
}

export function clientCardOrderInput(body: Record<string, unknown>) {
  if (Object.keys(body).some(key => !["order", "expectedVersion"].includes(key))) {
    throw new RequestError("Unexpected client order setting.");
  }
  if (!Array.isArray(body.order) || body.order.length > 500 ||
    body.order.some(id => typeof id !== "string" || id.trim() !== id || !validClientId(id)) ||
    new Set(body.order).size !== body.order.length) {
    throw new RequestError("Choose a valid client order.");
  }
  if (body.expectedVersion !== null &&
    (typeof body.expectedVersion !== "string" || !orderVersionFormat.test(body.expectedVersion))) {
    throw new RequestError("Reload the client order.");
  }
  return { order: body.order as string[], expectedVersion: body.expectedVersion as string | null };
}

export async function saveClientCardOrder(userId: string, sessionId: string, order: string[], expectedVersion: string | null): Promise<ClientCardOrder> {
  return new ServerDatabase(getPool("sephora")).transaction(async db => {
    // Match the setter's lock order. Hold the account row against access edits until the save commits.
    await db.prepare("SELECT pg_advisory_xact_lock(724018,hashtext(?))").bind(userId).run();
    const staff = await db.prepare(`SELECT controller_client_ids AS "clientIds" FROM auth_user
      WHERE id=? AND NOT disabled AND role IN ('admin','controller') FOR SHARE`)
      .bind(userId).first<{ clientIds: string[] | null }>();
    if (!staff || !await db.prepare("SELECT 1 FROM auth_session WHERE id=? AND user_id=? AND expires_at>now() FOR KEY SHARE")
      .bind(sessionId, userId).first()) {
      throw new RequestError("Sign in again.", 401);
    }
    if (order.some(id => !canAccessClient(staff.clientIds, id))) {
      throw new RequestError("A client in this order is not available to your account.", 403);
    }

    const previous = await db.prepare('SELECT client_ids AS "order",version FROM user_client_order WHERE user_id=?')
      .bind(userId).first<ClientCardOrder>();
    const previousVersion = previous?.version ?? null;
    if (orderVersion(previousVersion, staff.clientIds) !== expectedVersion) {
      throw new RequestError("Your client order changed elsewhere. Reload this page.", 409);
    }

    let nextOrder = order;
    if (staff.clientIds !== null) {
      const previousOrder = previous?.order ?? [];
      const { results } = await db.prepare("SELECT id FROM clients WHERE id=ANY(?::text[]) AND archived_at IS NULL")
        .bind(previousOrder.filter(id => !canAccessClient(staff.clientIds, id))).all<{ id: string }>();
      const hidden = new Set(results.map(client => client.id));
      nextOrder = [];
      let index = 0;
      for (const id of previousOrder) {
        if (hidden.has(id)) nextOrder.push(id);
        else if (canAccessClient(staff.clientIds, id) && index < order.length) nextOrder.push(order[index++]);
      }
      nextOrder.push(...order.slice(index));
      if (nextOrder.length > 500) throw new RequestError("The combined client order exceeds 500 saved positions.");
    }

    const saved = await db.prepare("SELECT pixcom_set_user_client_order(?,?::jsonb,?) AS version")
      .bind(userId, JSON.stringify(nextOrder), previousVersion).first<{ version: string }>();
    if (!saved) throw new Error("Client order save did not return a version.");
    return { order, version: orderVersion(saved.version, staff.clientIds) };
  });
}
