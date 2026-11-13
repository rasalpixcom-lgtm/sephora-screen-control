import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sessionUser } from "@/lib/auth";
import { withWorkspace } from "@/lib/client-workspace";
export default withWorkspace(async function Page() { const session = await sessionUser(new Headers(await headers())); redirect(session ? "/workspaces" : "/login"); });
