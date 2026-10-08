import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { roleHome, roleNames } from "@/lib/auth-policy";
import ChangePassword from "@/components/change-password";
import SignOut from "@/components/sign-out";
import "@/components/admin-dashboard.css";
import "@/components/auth.css";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser(new Headers(await headers()));
  if (!user) redirect("/login");
  return <main className="auth-screen"><section className="account-card"><h1>Your account</h1><p>{user.name} · {roleNames[user.role]}</p><p>{user.email}</p><ChangePassword/><div className="account-actions"><Link href={roleHome(user.role)}>Back to workspace</Link><SignOut/></div></section></main>;
}
