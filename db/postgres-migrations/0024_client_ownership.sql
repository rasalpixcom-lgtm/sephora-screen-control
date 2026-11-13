-- Phase 1 only: preserve the single-client application while recording ownership.
-- The default keeps existing inserts/imports working until request scoping is added.
-- Do not enable additional client workspaces before API/worker isolation is complete.
CREATE TABLE clients (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT clients_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 80),
  CONSTRAINT clients_name_check CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120)
);
INSERT INTO clients (id, slug, name) VALUES ('sephora', 'sephora', 'Sephora');

-- Existing columns, keys, relationships, timestamps and file references stay intact.
ALTER TABLE entities ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX entities_client_idx ON entities(client_id);
ALTER TABLE group_members ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX group_members_client_idx ON group_members(client_id);
ALTER TABLE display_state ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX display_state_client_idx ON display_state(client_id);
ALTER TABLE activity_log ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX activity_log_client_idx ON activity_log(client_id);
ALTER TABLE monitor_access ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX monitor_access_client_idx ON monitor_access(client_id);
ALTER TABLE preview_screen_state ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX preview_screen_state_client_idx ON preview_screen_state(client_id);
ALTER TABLE preview_incident ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX preview_incident_client_idx ON preview_incident(client_id);
ALTER TABLE email_alert_settings ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX email_alert_settings_client_idx ON email_alert_settings(client_id);
ALTER TABLE email_alert_delivery ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX email_alert_delivery_client_idx ON email_alert_delivery(client_id);
ALTER TABLE email_alert_queue ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX email_alert_queue_client_idx ON email_alert_queue(client_id);
ALTER TABLE whatsapp_alert_settings ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX whatsapp_alert_settings_client_idx ON whatsapp_alert_settings(client_id);
ALTER TABLE whatsapp_alert_delivery ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX whatsapp_alert_delivery_client_idx ON whatsapp_alert_delivery(client_id);
ALTER TABLE whatsapp_alert_queue ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX whatsapp_alert_queue_client_idx ON whatsapp_alert_queue(client_id);
ALTER TABLE screen_hardware_sections ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX screen_hardware_sections_client_idx ON screen_hardware_sections(client_id);
ALTER TABLE screen_notes ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX screen_notes_client_idx ON screen_notes(client_id);
ALTER TABLE location_photos ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX location_photos_client_idx ON location_photos(client_id);
ALTER TABLE screen_remote_access ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX screen_remote_access_client_idx ON screen_remote_access(client_id);
ALTER TABLE cms_updates ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX cms_updates_client_idx ON cms_updates(client_id);
ALTER TABLE cms_reports ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX cms_reports_client_idx ON cms_reports(client_id);
ALTER TABLE location_details ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX location_details_client_idx ON location_details(client_id);
ALTER TABLE screen_ppm_inspections ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX screen_ppm_inspections_client_idx ON screen_ppm_inspections(client_id);
ALTER TABLE screen_reference_photos ADD COLUMN client_id text NOT NULL DEFAULT 'sephora' REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX screen_reference_photos_client_idx ON screen_reference_photos(client_id);
