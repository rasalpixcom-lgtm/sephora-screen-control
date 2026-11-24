import { headers } from "next/headers";
import { redirect } from "next/navigation";
import UsersPanel from "@/components/users-panel";
import { sessionUser } from "@/lib/auth";
import { isFullAdmin } from "@/lib/auth-policy";
import { withWorkspace } from "@/lib/client-workspace";

export const dynamic = "force-dynamic";

export default withWorkspace(async function Page() {
  const session = await sessionUser(new Headers(await headers()));
  if (!session) redirect("/login?next=/admin/users");
  if (!isFullAdmin(session.user.role, session.clientIds)) redirect("/workspaces");
  return <UsersPanel accountEmail={session.user.email}/>;
});
