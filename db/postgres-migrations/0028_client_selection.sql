-- Resolve ownership from the PostgreSQL startup role, never from browser input.
-- Existing Sephora rows, files and account/session values are unchanged.
CREATE FUNCTION pixcom_workspace() RETURNS text LANGUAGE sql STABLE AS $function$
  SELECT id FROM public.clients WHERE archived_at IS NULL AND
    ((id='sephora' AND current_user='pixcom_sephora_runtime') OR
     (id<>'sephora' AND current_user='pixcom_client_' || md5(id)))
$function$;

-- Provisioning is an operator/migration action, unavailable to runtime roles.
CREATE FUNCTION pixcom_provision_client(workspace_id text) RETURNS void LANGUAGE plpgsql AS $function$
DECLARE runtime_role text; table_name text;
BEGIN
  IF workspace_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(workspace_id)>64 OR
    NOT EXISTS(SELECT 1 FROM public.clients WHERE id=workspace_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'Invalid active client';
  END IF;
  runtime_role := CASE WHEN workspace_id='sephora' THEN 'pixcom_sephora_runtime' ELSE 'pixcom_client_' || md5(workspace_id) END;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role) THEN
    EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',runtime_role);
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=runtime_role AND
    (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolcanlogin OR rolreplication OR rolinherit)) THEN
    RAISE EXCEPTION 'Unsafe client runtime role';
  END IF;
  EXECUTE format('GRANT %I TO %I',runtime_role,current_user);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',runtime_role);
  EXECUTE format('GRANT SELECT ON public.clients,public.server_migrations TO %I',runtime_role);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.auth_user,public.auth_account,public.auth_session,public.auth_verification,public.auth_bootstrap,public.auth_rate_limit,public.client_memberships TO %I',runtime_role);
  FOREACH table_name IN ARRAY ARRAY['entities','group_members','display_state','activity_log','monitor_access','preview_screen_state','preview_incident','email_alert_settings','email_alert_delivery','email_alert_queue','whatsapp_alert_settings','whatsapp_alert_delivery','whatsapp_alert_queue','screen_hardware_sections','screen_notes','location_photos','screen_remote_access','cms_updates','cms_reports','location_details','screen_ppm_inspections','screen_reference_photos'] LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO %I',table_name,runtime_role);
  END LOOP;
  -- Legacy SQLite import expects a fresh Sephora display table to be empty.
  IF workspace_id<>'sephora' THEN
    INSERT INTO public.display_state(client_id,id,selection,updated_at) VALUES(workspace_id,'main','{}',now()::text) ON CONFLICT(client_id,id) DO NOTHING;
  END IF;
  INSERT INTO public.email_alert_settings(client_id,id) VALUES(workspace_id,'main') ON CONFLICT(client_id,id) DO NOTHING;
  INSERT INTO public.whatsapp_alert_settings(client_id,id) VALUES(workspace_id,'main') ON CONFLICT(client_id,id) DO NOTHING;
END
$function$;
REVOKE ALL ON FUNCTION pixcom_provision_client(text) FROM PUBLIC;

DROP POLICY sephora_workspace ON entities;
CREATE POLICY client_workspace ON entities USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE entities ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON group_members;
CREATE POLICY client_workspace ON group_members USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE group_members ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON display_state;
CREATE POLICY client_workspace ON display_state USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE display_state ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON activity_log;
CREATE POLICY client_workspace ON activity_log USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE activity_log ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON monitor_access;
CREATE POLICY client_workspace ON monitor_access USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE monitor_access ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON preview_screen_state;
CREATE POLICY client_workspace ON preview_screen_state USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE preview_screen_state ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON preview_incident;
CREATE POLICY client_workspace ON preview_incident USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE preview_incident ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON email_alert_settings;
CREATE POLICY client_workspace ON email_alert_settings USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE email_alert_settings ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON email_alert_delivery;
CREATE POLICY client_workspace ON email_alert_delivery USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE email_alert_delivery ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON email_alert_queue;
CREATE POLICY client_workspace ON email_alert_queue USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE email_alert_queue ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON whatsapp_alert_settings;
CREATE POLICY client_workspace ON whatsapp_alert_settings USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE whatsapp_alert_settings ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON whatsapp_alert_delivery;
CREATE POLICY client_workspace ON whatsapp_alert_delivery USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE whatsapp_alert_delivery ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON whatsapp_alert_queue;
CREATE POLICY client_workspace ON whatsapp_alert_queue USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE whatsapp_alert_queue ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON screen_hardware_sections;
CREATE POLICY client_workspace ON screen_hardware_sections USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE screen_hardware_sections ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON screen_notes;
CREATE POLICY client_workspace ON screen_notes USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE screen_notes ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON location_photos;
CREATE POLICY client_workspace ON location_photos USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE location_photos ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON screen_remote_access;
CREATE POLICY client_workspace ON screen_remote_access USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE screen_remote_access ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON cms_updates;
CREATE POLICY client_workspace ON cms_updates USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE cms_updates ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON cms_reports;
CREATE POLICY client_workspace ON cms_reports USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE cms_reports ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON location_details;
CREATE POLICY client_workspace ON location_details USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE location_details ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON screen_ppm_inspections;
CREATE POLICY client_workspace ON screen_ppm_inspections USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE screen_ppm_inspections ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DROP POLICY sephora_workspace ON screen_reference_photos;
CREATE POLICY client_workspace ON screen_reference_photos USING (client_id=pixcom_workspace()) WITH CHECK (client_id=pixcom_workspace());
ALTER TABLE screen_reference_photos ALTER COLUMN client_id SET DEFAULT COALESCE(pixcom_workspace(),'sephora');

DO $provision$ DECLARE workspace_id text; BEGIN
  FOR workspace_id IN SELECT id FROM clients WHERE archived_at IS NULL LOOP
    PERFORM pixcom_provision_client(workspace_id);
  END LOOP;
END $provision$;

-- The same country abbreviation may be used independently by different clients.
DROP INDEX entities_country_short_name_idx;
CREATE UNIQUE INDEX entities_country_short_name_idx ON entities(client_id,lower(short_name)) WHERE type='country' AND short_name IS NOT NULL;
