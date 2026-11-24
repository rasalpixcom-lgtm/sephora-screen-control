import { sameOrigin, sessionUser } from "@/lib/auth";
import { withWorkspace } from "@/lib/client-workspace";
import { clientCardOrderInput, getClientCardOrder, saveClientCardOrder } from "@/lib/client-card-order";
import { readObject, RequestError, requestFailure } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export const GET = withWorkspace(async (request: Request) => {
  try {
    const session = await sessionUser(request.headers);
    if (!session) throw new RequestError("Sign in again.", 401);
    if (new URL(request.url).search) throw new RequestError("Unexpected client order setting.");
    return Response.json(await getClientCardOrder(session.user.id, session.clientIds), { headers });
  } catch (error) { return requestFailure(error); }
});

export const POST = withWorkspace(async (request: Request) => {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const session = await sessionUser(request.headers);
    if (!session) throw new RequestError("Sign in again.", 401);
    // A tab rendered for a different account must never change this account's order.
    if (request.headers.get("x-client-order-user") !== session.user.id) {
      throw new RequestError("The signed-in account changed. Reload this page.", 403);
    }
    if (new URL(request.url).search) throw new RequestError("Unexpected client order setting.");
    const { order, expectedVersion } = clientCardOrderInput(await readObject(request));
    return Response.json(await saveClientCardOrder(session.user.id, session.sessionId, order, expectedVersion), { headers });
  } catch (error) {
    const messages: Record<string, [number, string]> = {
      "40001": [409, "Your client order changed elsewhere. Reload this page."],
      "P0002": [409, "The available clients changed. Reload this page."],
      "42501": [403, "An enabled staff account is required."],
      "22023": [400, "Choose a valid client order."],
      "23514": [400, "Choose a valid client order."],
    };
    const entry = messages[(error as { code?: string })?.code || ""];
    return requestFailure(entry ? new RequestError(entry[1], entry[0]) : error);
  }
});
