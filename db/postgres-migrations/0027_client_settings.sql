-- Preserve every existing value, including monitor hashes, generations and revisions.
-- Each client may have its own main record; only Sephora is routable in this stage.
ALTER TABLE display_state DROP CONSTRAINT display_state_pkey;
ALTER TABLE display_state ADD PRIMARY KEY (client_id,id);
ALTER TABLE monitor_access DROP CONSTRAINT monitor_access_pkey;
ALTER TABLE monitor_access ADD PRIMARY KEY (client_id,id);
ALTER TABLE email_alert_settings DROP CONSTRAINT email_alert_settings_pkey;
ALTER TABLE email_alert_settings ADD PRIMARY KEY (client_id,id);
ALTER TABLE whatsapp_alert_settings DROP CONSTRAINT whatsapp_alert_settings_pkey;
ALTER TABLE whatsapp_alert_settings ADD PRIMARY KEY (client_id,id);
