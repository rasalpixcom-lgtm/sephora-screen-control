import { database } from "@/lib/database";
import { assertAuthConfig } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    assertAuthConfig();
    const db = database();
    await db.prepare("SELECT id, short_name, onsign_player_id, photo_key FROM entities LIMIT 1").first();
    await db.prepare("SELECT id, role, disabled FROM auth_user LIMIT 1").first();
    await db.prepare("SELECT id, selection FROM display_state LIMIT 1").first();
    await db.prepare("SELECT id FROM monitor_access LIMIT 1").first();
    await db.prepare("SELECT screen_id FROM preview_screen_state LIMIT 1").first();
    await db.prepare("SELECT id FROM preview_incident LIMIT 1").first();
    await db.prepare("SELECT id, location_id FROM location_photos LIMIT 1").first();
    await db.prepare("SELECT screen_id, section, fields, version, updated_at FROM screen_hardware_sections LIMIT 1").first();
    await db.prepare("SELECT screen_id, note, version, updated_at FROM screen_notes LIMIT 1").first();
    await db.prepare("SELECT screen_id, teamviewer_id, anydesk_id, version, updated_at FROM screen_remote_access LIMIT 1").first();
    await db.prepare("SELECT id FROM email_alert_settings LIMIT 1").first();
    await db.prepare("SELECT id FROM email_alert_queue LIMIT 1").first();
    await db.prepare("SELECT id FROM email_alert_delivery LIMIT 1").first();
    if(!await db.prepare("SELECT name FROM server_migrations WHERE name = '0007_manual_email_alerts.sql'").first())throw new Error("Manual alert migration is missing");
    await db.prepare("SELECT id FROM whatsapp_alert_settings LIMIT 1").first();
    await db.prepare("SELECT id FROM whatsapp_alert_queue LIMIT 1").first();
    await db.prepare("SELECT id FROM whatsapp_alert_delivery LIMIT 1").first();
    if(!await db.prepare("SELECT name FROM server_migrations WHERE name = '0008_whatsapp_alerts.sql'").first())throw new Error("WhatsApp alert migration is missing");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
