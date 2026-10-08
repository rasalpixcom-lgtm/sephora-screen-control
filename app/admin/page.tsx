import AdminDashboard from "@/components/admin-dashboard";
import { requirePage } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function Page() {
  const account = await requirePage("admin");
  return <AdminDashboard section="dashboard" accountEmail={account.email} />;
}
