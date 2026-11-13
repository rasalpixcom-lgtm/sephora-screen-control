import { withWorkspace } from "@/lib/client-workspace";
import AdminDashboard from "@/components/admin-dashboard";
import { requirePage } from "@/lib/auth";

export const dynamic = "force-dynamic";
async function Page() {
  const account = await requirePage("admin");
  return <AdminDashboard section="dashboard" accountEmail={account.email} clientId={account.clientId} clientName={account.clientName} clientLogoKey={account.clientLogoKey} />;
}

export default withWorkspace(Page);
