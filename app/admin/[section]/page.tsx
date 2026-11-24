import { withWorkspace } from "@/lib/client-workspace";
import { notFound, redirect } from "next/navigation";
import AdminDashboard, { type Section } from "@/components/admin-dashboard";
import { requirePage } from "@/lib/auth";
import { isFullAdmin } from "@/lib/auth-policy";

export const dynamic = "force-dynamic";
const valid = new Set<Section>(["screens", "countries", "regions", "locations", "groups", "activity", "cms-support", "reports", "settings"]);
async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "access") redirect("/admin/settings");
  if (!valid.has(section as Section)) notFound();
  const account = await requirePage("admin");
  return <AdminDashboard section={section as Section} accountEmail={account.email} clientId={account.clientId} clientName={account.clientName} clientLogoKey={account.clientLogoKey}
    canManageSystem={isFullAdmin(account.role, account.clientIds)} />;
}

export default withWorkspace(Page);
