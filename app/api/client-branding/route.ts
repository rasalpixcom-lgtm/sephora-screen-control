import { sameOrigin, sessionUser } from "@/lib/auth";
import { validClientId, withWorkspace } from "@/lib/client-workspace";
import { getPool } from "@/lib/database";
import { normalizeClientLogo, readClientLogoMutation, validLogoVersion } from "@/lib/client-logo";
import { RequestError, requestFailure } from "@/lib/request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = withWorkspace(async (request: Request) => {
  try {
    if (!sameOrigin(request)) throw new RequestError("Invalid request origin.", 403);
    const session = await sessionUser(request.headers);
    if (!session) throw new RequestError("Sign in again.", 401);
    if (session.user.role !== "admin") throw new RequestError("Admin access required.", 403);
    const { body, file, background } = await readClientLogoMutation(request, true);
    if (typeof body.clientId !== "string" || !validClientId(body.clientId)) throw new RequestError("Choose a client.");
    const changes = [];
    for (const [kind, upload] of [["logo", file], ["background", background]] as const) {
      const change = body[kind];
      if (!change || typeof change !== "object" || Array.isArray(change)) throw new RequestError("Choose a valid branding change.");
      const { action, expectedVersion } = change as Record<string, unknown>;
      if (expectedVersion !== null && !validLogoVersion(expectedVersion)) throw new RequestError("Reload the branding before saving.");
      if (!["keep", "replace", "remove"].includes(String(action)) || (action === "replace") !== !!upload) throw new RequestError("Choose a valid branding change.");
      changes.push({ kind, action, expectedVersion, image: upload ? await normalizeClientLogo(upload, kind) : null });
    }
    if (changes.every(change => change.action === "keep")) throw new RequestError("Choose a branding change.");
    const connection = await getPool("sephora").connect();
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT pg_advisory_xact_lock(724016)");
      // Check both versions, including unchanged assets, before writing either one.
      const client = (await connection.query(`SELECT l.version AS logo,b.version AS background FROM clients c LEFT JOIN client_logos l ON l.client_id=c.id LEFT JOIN client_backgrounds b ON b.client_id=c.id WHERE c.id=$1 AND c.archived_at IS NULL`, [body.clientId])).rows[0];
      if (!client) throw new RequestError("Client not found.", 404);
      if (changes.some(change => (client[change.kind] ?? null) !== change.expectedVersion)) throw new RequestError("Branding changed. Close the editor, refresh the list and try again.", 409);
      for (const change of changes) {
        if (change.action === "keep") continue;
        const sql = change.kind === "logo" ? "SELECT pixcom_set_client_logo($1,$2,$3,$4::bytea)" : "SELECT pixcom_set_client_background($1,$2,$3,$4::bytea)";
        await connection.query(sql, [session.user.id, body.clientId, change.expectedVersion, change.image]);
      }
      await connection.query("COMMIT");
    } catch (error) { await connection.query("ROLLBACK"); throw error; }
    finally { connection.release(); }
    return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const messages: Record<string, [number, string]> = { "40001": [409, "Branding changed. Close the editor, refresh the list and try again."], "42501": [403, "Admin access required."], "P0002": [404, "Client not found."], "22023": [400, "Choose valid branding images."] };
    const entry = messages[(error as { code?: string })?.code || ""];
    return requestFailure(entry ? new RequestError(entry[1], entry[0]) : error);
  }
});
