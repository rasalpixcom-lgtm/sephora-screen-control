import { notFound } from "next/navigation";
import AdminDashboard from "@/components/admin-dashboard";
import { requirePage } from "@/lib/auth";
import { database } from "@/lib/database";
import type { Entity } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ screenId: string }> }) {
  const account = await requirePage("admin");
  const { screenId } = await params;
  if (!screenId || screenId.length > 256) notFound();
  const screen = await database().prepare(`
    SELECT e.id, e.type, e.name, e.short_name AS "shortName", e.parent_id AS "parentId",
      e.photo_key AS "photoKey", e.live_url AS "liveUrl", e.onsign_player_id AS "onsignPlayerId", e.is_demo AS "isDemo",
      e.created_at AS "createdAt", concat_ws(' · ', s.name, r.name, c.name) AS location
    FROM entities e
    LEFT JOIN entities s ON s.id = e.parent_id AND s.type = 'store'
    LEFT JOIN entities r ON r.id = s.parent_id AND r.type = 'region'
    LEFT JOIN entities c ON c.id = r.parent_id AND c.type = 'country'
    WHERE e.id = ? AND e.type = 'screen'
  `).bind(screenId).first<Entity & { location: string }>();
  if (!screen) notFound();
  return <AdminDashboard section="screens" accountEmail={account.email} screenDetails={{ screen, location: screen.location }}/>;
}
