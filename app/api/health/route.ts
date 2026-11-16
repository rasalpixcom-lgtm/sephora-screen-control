import { withWorkspace } from "@/lib/client-workspace";
import { clientIntegrations } from "@/lib/client-integrations";
import { database } from "@/lib/database";
import { assertAuthConfig } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function GETHandler() {
  try {
    assertAuthConfig();
    clientIntegrations();
    const db = database();
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name='0034_client_onsign_settings.sql'").first()) throw new Error("Client OnSign migration is missing");
    await db.prepare("SELECT client_id, version, mode, encrypted_token, organization_id FROM client_onsign_settings LIMIT 0").all();
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name='0033_client_backgrounds.sql'").first()) throw new Error("Client background migration is missing");
    await db.prepare("SELECT client_id, version, image FROM client_backgrounds LIMIT 0").all();
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name='0031_client_logos.sql'").first()) throw new Error("Client settings migration is missing");
    await db.prepare("SELECT client_id, version FROM client_logos LIMIT 1").first();
    await db.prepare("SELECT id, generation FROM common_monitor_access LIMIT 1").first();
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name='0032_common_monitor_display.sql'").first()) throw new Error("Common wall migration is missing");
    if (!await db.prepare("SELECT client_id FROM common_monitor_display WHERE id='main'").first()) throw new Error("Common wall selection is missing");
    const identity = await db.prepare("SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user").first<{name: string; rolsuper: boolean; rolbypassrls: boolean}>();
    if (identity?.name !== "pixcom_sephora_runtime" || identity.rolsuper || identity.rolbypassrls) throw new Error("Unsafe runtime database identity");
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name='0026_sephora_query_isolation.sql'").first()) throw new Error("Query isolation migration is missing");
    await db.prepare("SELECT client_id, user_id, role FROM client_memberships LIMIT 1").first();
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name = '0025_client_permissions.sql'").first()) throw new Error("Client permissions migration is missing");
    if (!await db.prepare("SELECT id FROM clients WHERE id = 'sephora'").first()) throw new Error("Sephora client is missing");
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name = '0024_client_ownership.sql'").first()) throw new Error("Client ownership migration is missing");
    await db.prepare("SELECT client_id FROM group_members LIMIT 1").first();
    await db.prepare("SELECT client_id FROM activity_log LIMIT 1").first();
    await db.prepare("SELECT client_id, id, short_name, onsign_player_id, photo_key, screen_type FROM entities LIMIT 1").first();
    await db.prepare("SELECT id, role, disabled FROM auth_user LIMIT 1").first();
    await db.prepare("SELECT client_id, id, selection FROM display_state LIMIT 1").first();
    await db.prepare("SELECT client_id, id FROM monitor_access LIMIT 1").first();
    await db.prepare("SELECT client_id, screen_id FROM preview_screen_state LIMIT 1").first();
    await db.prepare("SELECT client_id, id FROM preview_incident LIMIT 1").first();
    await db.prepare("SELECT client_id, id, location_id FROM location_photos LIMIT 1").first();
    await db.prepare("SELECT client_id, screen_id, category, photo_key FROM screen_reference_photos LIMIT 1").first();
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name = '0022_led_reference_photos.sql'").first()) throw new Error("LED photo migration is missing");
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name = '0023_lcd_video_wall_photos.sql'").first()) throw new Error("LCD and Video Wall photo migration is missing");
    await db.prepare("SELECT client_id, location_id, fields, version, updated_at FROM location_details LIMIT 1").first();
    await db.prepare("SELECT client_id, screen_id, section, fields, version, updated_at FROM screen_hardware_sections LIMIT 1").first();
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name = '0017_lcd_hardware.sql'").first()) throw new Error("LCD hardware migration is missing");
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name = '0018_video_wall_hardware.sql'").first()) throw new Error("Video Wall hardware migration is missing");
    await db.prepare("SELECT client_id, screen_id, fields, version, updated_at FROM screen_ppm_inspections LIMIT 1").first();
    if (!await db.prepare("SELECT name FROM server_migrations WHERE name = '0020_screen_ppm_inspection.sql'").first()) throw new Error("PPM inspection migration is missing");
    await db.prepare("SELECT client_id, screen_id, note, version, updated_at FROM screen_notes LIMIT 1").first();
    await db.prepare("SELECT client_id, screen_id, teamviewer_id, anydesk_id, version, updated_at FROM screen_remote_access LIMIT 1").first();
    await db.prepare("SELECT client_id, id, version, payload FROM cms_updates LIMIT 1").first();
    await db.prepare("SELECT client_id, id, update_id, source_version FROM cms_reports LIMIT 1").first();
    await db.prepare("SELECT client_id, id FROM email_alert_settings LIMIT 1").first();
    await db.prepare("SELECT client_id, id FROM email_alert_queue LIMIT 1").first();
    await db.prepare("SELECT client_id, id FROM email_alert_delivery LIMIT 1").first();
    if(!await db.prepare("SELECT name FROM server_migrations WHERE name = '0007_manual_email_alerts.sql'").first())throw new Error("Manual alert migration is missing");
    await db.prepare("SELECT client_id, id FROM whatsapp_alert_settings LIMIT 1").first();
    await db.prepare("SELECT client_id, id FROM whatsapp_alert_queue LIMIT 1").first();
    await db.prepare("SELECT client_id, id FROM whatsapp_alert_delivery LIMIT 1").first();
    if(!await db.prepare("SELECT name FROM server_migrations WHERE name = '0008_whatsapp_alerts.sql'").first())throw new Error("WhatsApp alert migration is missing");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}

export const GET = withWorkspace(GETHandler);
