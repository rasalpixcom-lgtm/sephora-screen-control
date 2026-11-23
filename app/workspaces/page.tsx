import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "@/lib/auth";
import { database } from "@/lib/database";
import { withWorkspace } from "@/lib/client-workspace";
import ClientSelection from "@/components/client-selection";
import { getClientCardOrder } from "@/lib/client-card-order";
export const dynamic = "force-dynamic";
export default withWorkspace(async function Page() {
  const session = await sessionUser(new Headers(await headers()));
  if (!session) redirect("/login");
  const preference = await getClientCardOrder(session.user.id);
  const { results } = await database().prepare(`SELECT c.id,c.name,CASE WHEN l.image IS NOT NULL THEN l.version END AS "logoKey",CASE WHEN b.image IS NOT NULL THEN b.version END AS "backgroundKey" FROM clients c LEFT JOIN client_logos l ON l.client_id=c.id LEFT JOIN client_backgrounds b ON b.client_id=c.id WHERE c.archived_at IS NULL ORDER BY lower(c.name),c.id`).all<{ id: string; name: string; logoKey: string | null; backgroundKey: string | null }>();
  return <ClientSelection key={`${session.user.id}:${preference.version ?? "default"}`} clients={results.map(client => ({ ...client, role: session.user.role }))} initialOrder={preference.order} orderVersion={preference.version} orderUserId={session.user.id} email={session.user.email} admin={session.user.role === "admin"}/>;
});
