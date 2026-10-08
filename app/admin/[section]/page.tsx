import { notFound, redirect } from "next/navigation";
import AdminDashboard, { type Section } from "@/components/admin-dashboard";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";
const valid = new Set<Section>(["screens", "countries", "regions", "locations", "groups", "activity", "settings"]);
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "access") redirect("/admin/settings");
  if (!valid.has(section as Section)) notFound();
  const account = await getChatGPTUser();
  return <AdminDashboard section={section as Section} accountEmail={account?.email || null} />;
}
