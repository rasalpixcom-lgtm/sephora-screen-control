import { getPool } from "./database";
import { validClientId } from "./client-workspace";
import { RequestError } from "./request";

export type ClientCardOrder = { order: string[]; version: string | null };
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export async function getClientCardOrder(userId: string): Promise<ClientCardOrder> {
  const { rows } = await getPool("sephora").query<ClientCardOrder>(
    'SELECT client_ids AS "order",version FROM user_client_order WHERE user_id=$1', [userId],
  );
  return rows[0] || { order: [], version: null };
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
    (typeof body.expectedVersion !== "string" || body.expectedVersion.length !== 36 || !uuid.test(body.expectedVersion))) {
    throw new RequestError("Reload the client order.");
  }
  return { order: body.order as string[], expectedVersion: body.expectedVersion as string | null };
}

export async function saveClientCardOrder(userId: string, order: string[], expectedVersion: string | null): Promise<ClientCardOrder> {
  const { rows } = await getPool("sephora").query<{ version: string }>(
    "SELECT pixcom_set_user_client_order($1,$2::jsonb,$3) AS version",
    [userId, JSON.stringify(order), expectedVersion],
  );
  return { order, version: rows[0].version };
}
