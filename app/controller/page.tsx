import { withWorkspace } from "@/lib/client-workspace";
import Workspace from "@/components/workspace";
import { requirePage } from "@/lib/auth";
export const dynamic = "force-dynamic";
async function Page() { return <Workspace view="controller" account={await requirePage("controller")} />; }

export default withWorkspace(Page);
