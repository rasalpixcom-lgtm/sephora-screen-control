import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { roleHome } from "@/lib/auth-policy";
export const dynamic = "force-dynamic";
export default async function Page() { const user = await currentUser(new Headers(await headers())); redirect(user ? roleHome(user.role) : "/login"); }
