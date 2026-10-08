import Workspace from "@/components/workspace";
import { requirePage } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() { return <Workspace view="monitor" account={await requirePage("monitor")} />; }
