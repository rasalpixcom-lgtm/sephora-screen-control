import AdminDashboard from "@/components/admin-dashboard";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";
export default async function Page() {
  const account = await getChatGPTUser();
  return <AdminDashboard section="dashboard" accountEmail={account?.email || null} />;
}
