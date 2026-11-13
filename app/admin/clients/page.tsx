import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "@/lib/auth";
import { listManagedClients } from "@/lib/client-management";
import { withWorkspace } from "@/lib/client-workspace";
import ClientsManagement from "@/components/clients-management";
export const dynamic = "force-dynamic";
export default withWorkspace(async function Page() {
  const session = await sessionUser(new Headers(await headers()));
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/workspaces");
  return <ClientsManagement initialData={await listManagedClients()} email={session.user.email}/>;
});
