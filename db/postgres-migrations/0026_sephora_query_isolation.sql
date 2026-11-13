-- Fixed-workspace isolation: no second workspace is routable in this stage.
-- Provision this NOLOGIN role with an administrator first if the migration user
-- lacks CREATEROLE; that administrator must also GRANT it to the migration user.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pixcom_sephora_runtime') THEN
    CREATE ROLE pixcom_sephora_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pixcom_sephora_runtime' AND
    (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin OR rolreplication OR rolinherit)) THEN
    RAISE EXCEPTION 'Unsafe pixcom_sephora_runtime role attributes';
  END IF;
  IF NOT pg_has_role(current_user,'pixcom_sephora_runtime','MEMBER') THEN
    EXECUTE format('GRANT pixcom_sephora_runtime TO %I',current_user);
  END IF;
END
$role$;
GRANT USAGE ON SCHEMA public TO pixcom_sephora_runtime;
GRANT SELECT ON clients, server_migrations TO pixcom_sephora_runtime;
-- Authentication remains global; access is checked by the application permission gate.
GRANT SELECT,INSERT,UPDATE,DELETE ON auth_user,auth_account,auth_session,auth_verification,auth_bootstrap,auth_rate_limit,client_memberships TO pixcom_sephora_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON entities TO pixcom_sephora_runtime;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON entities TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON group_members TO pixcom_sephora_runtime;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON group_members TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON display_state TO pixcom_sephora_runtime;
ALTER TABLE display_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_state FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON display_state TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON activity_log TO pixcom_sephora_runtime;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON activity_log TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON monitor_access TO pixcom_sephora_runtime;
ALTER TABLE monitor_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_access FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON monitor_access TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON preview_screen_state TO pixcom_sephora_runtime;
ALTER TABLE preview_screen_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_screen_state FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON preview_screen_state TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON preview_incident TO pixcom_sephora_runtime;
ALTER TABLE preview_incident ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_incident FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON preview_incident TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON email_alert_settings TO pixcom_sephora_runtime;
ALTER TABLE email_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_alert_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON email_alert_settings TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON email_alert_delivery TO pixcom_sephora_runtime;
ALTER TABLE email_alert_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_alert_delivery FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON email_alert_delivery TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON email_alert_queue TO pixcom_sephora_runtime;
ALTER TABLE email_alert_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_alert_queue FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON email_alert_queue TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON whatsapp_alert_settings TO pixcom_sephora_runtime;
ALTER TABLE whatsapp_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_alert_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON whatsapp_alert_settings TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON whatsapp_alert_delivery TO pixcom_sephora_runtime;
ALTER TABLE whatsapp_alert_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_alert_delivery FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON whatsapp_alert_delivery TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON whatsapp_alert_queue TO pixcom_sephora_runtime;
ALTER TABLE whatsapp_alert_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_alert_queue FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON whatsapp_alert_queue TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON screen_hardware_sections TO pixcom_sephora_runtime;
ALTER TABLE screen_hardware_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_hardware_sections FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON screen_hardware_sections TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON screen_notes TO pixcom_sephora_runtime;
ALTER TABLE screen_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON screen_notes TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON location_photos TO pixcom_sephora_runtime;
ALTER TABLE location_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON location_photos TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON screen_remote_access TO pixcom_sephora_runtime;
ALTER TABLE screen_remote_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_remote_access FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON screen_remote_access TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON cms_updates TO pixcom_sephora_runtime;
ALTER TABLE cms_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_updates FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON cms_updates TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON cms_reports TO pixcom_sephora_runtime;
ALTER TABLE cms_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON cms_reports TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON location_details TO pixcom_sephora_runtime;
ALTER TABLE location_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_details FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON location_details TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON screen_ppm_inspections TO pixcom_sephora_runtime;
ALTER TABLE screen_ppm_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_ppm_inspections FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON screen_ppm_inspections TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');
GRANT SELECT,INSERT,UPDATE,DELETE ON screen_reference_photos TO pixcom_sephora_runtime;
ALTER TABLE screen_reference_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE screen_reference_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY sephora_workspace ON screen_reference_photos TO pixcom_sephora_runtime USING (client_id = 'sephora') WITH CHECK (client_id = 'sephora');

-- Prevent cross-owner references and cascades; do not repair/delete old records.
CREATE UNIQUE INDEX entities_client_id_idx ON entities(client_id,id);
CREATE UNIQUE INDEX cms_updates_client_id_idx ON cms_updates(client_id,id);
CREATE UNIQUE INDEX preview_incident_client_id_idx ON preview_incident(client_id,id);
CREATE UNIQUE INDEX email_alert_delivery_client_id_idx ON email_alert_delivery(client_id,id);
CREATE UNIQUE INDEX whatsapp_alert_delivery_client_id_idx ON whatsapp_alert_delivery(client_id,id);
ALTER TABLE entities ADD CONSTRAINT entities_parent_id_owner_fk FOREIGN KEY (client_id,parent_id) REFERENCES entities(client_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE group_members ADD CONSTRAINT group_members_group_id_owner_fk FOREIGN KEY (client_id,group_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE group_members ADD CONSTRAINT group_members_screen_id_owner_fk FOREIGN KEY (client_id,screen_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE screen_reference_photos ADD CONSTRAINT screen_reference_photos_screen_id_owner_fk FOREIGN KEY (client_id,screen_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE screen_hardware_sections ADD CONSTRAINT screen_hardware_sections_screen_id_owner_fk FOREIGN KEY (client_id,screen_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE screen_notes ADD CONSTRAINT screen_notes_screen_id_owner_fk FOREIGN KEY (client_id,screen_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE screen_ppm_inspections ADD CONSTRAINT screen_ppm_inspections_screen_id_owner_fk FOREIGN KEY (client_id,screen_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE screen_remote_access ADD CONSTRAINT screen_remote_access_screen_id_owner_fk FOREIGN KEY (client_id,screen_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE preview_screen_state ADD CONSTRAINT preview_screen_state_screen_id_owner_fk FOREIGN KEY (client_id,screen_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE preview_incident ADD CONSTRAINT preview_incident_screen_id_owner_fk FOREIGN KEY (client_id,screen_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE location_details ADD CONSTRAINT location_details_location_id_owner_fk FOREIGN KEY (client_id,location_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE location_photos ADD CONSTRAINT location_photos_location_id_owner_fk FOREIGN KEY (client_id,location_id) REFERENCES entities(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE cms_reports ADD CONSTRAINT cms_reports_update_id_owner_fk FOREIGN KEY (client_id,update_id) REFERENCES cms_updates(client_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE email_alert_queue ADD CONSTRAINT email_alert_queue_incident_id_owner_fk FOREIGN KEY (client_id,incident_id) REFERENCES preview_incident(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE email_alert_queue ADD CONSTRAINT email_alert_queue_delivery_id_owner_fk FOREIGN KEY (client_id,delivery_id) REFERENCES email_alert_delivery(client_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE whatsapp_alert_queue ADD CONSTRAINT whatsapp_alert_queue_incident_id_owner_fk FOREIGN KEY (client_id,incident_id) REFERENCES preview_incident(client_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE whatsapp_alert_queue ADD CONSTRAINT whatsapp_alert_queue_delivery_id_owner_fk FOREIGN KEY (client_id,delivery_id) REFERENCES whatsapp_alert_delivery(client_id,id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
