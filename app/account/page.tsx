import { withWorkspace } from "@/lib/client-workspace";
import Link from "next/link";
import { headers } from "next/headers";
import { requirePage, sessionUser } from "@/lib/auth";
import { roleHome, roleNames, type AuthUser } from "@/lib/auth-policy";
import ChangePassword from "@/components/change-password";
import SignOut from "@/components/sign-out";
import "@/components/admin-dashboard.css";
import "@/components/auth.css";
export const dynamic = "force-dynamic";
async function Page() {
  const session = await sessionUser(new Headers(await headers()));
  // Staff can manage their own credentials without access to a workspace.
  const user: AuthUser = session && session.clientIds !== null ? session.user : await requirePage("controller");
  return <main className="auth-screen" data-client-workspace={user.clientId}><section className="account-card"><h1>Your account</h1><p>{user.name} · {roleNames[user.role]}</p><p>{user.email}</p><ChangePassword/><div className="account-actions"><Link href={roleHome(user.role)}>Back to workspace</Link><SignOut/></div></section></main>;
}

export default withWorkspace(Page);
