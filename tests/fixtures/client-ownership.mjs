export const owned = ["entities", "group_members", "display_state", "activity_log", "monitor_access", "preview_screen_state", "preview_incident", "email_alert_settings", "email_alert_delivery", "email_alert_queue", "whatsapp_alert_settings", "whatsapp_alert_delivery", "whatsapp_alert_queue", "screen_hardware_sections", "screen_notes", "location_photos", "screen_remote_access", "cms_updates", "cms_reports", "location_details", "screen_ppm_inspections", "screen_reference_photos"];
export const seed = `
INSERT INTO entities(id,type,name,parent_id,created_at) VALUES
 ('country','country','United Arab Emirates',NULL,'2026-01-01'),('region','region','Dubai','country','2026-01-01'),
 ('store','store','Store One','region','2026-01-01'),('screen','screen','Screen One','store','2026-01-01'),('group','group','Group One',NULL,'2026-01-01');
UPDATE entities SET short_name='UAE' WHERE id='country';
UPDATE entities SET screen_type='LED',onsign_player_id='Player-123',photo_key='11111111-1111-4111-8111-111111111111',live_url='https://example.test/preview' WHERE id='screen';
INSERT INTO group_members(group_id,screen_id) VALUES ('group','screen');
INSERT INTO display_state(id,selection,updated_at) VALUES ('main','{"type":"screen","id":"screen"}','2026-01-01');
INSERT INTO activity_log(id,action,entity_id,entity_name,actor,created_at) VALUES ('activity','create','screen','Screen One','admin@example.test','2026-01-01');
INSERT INTO monitor_access(id,token_hash,generation,updated_at) VALUES ('main','private-monitor-hash','generation-1',now());
INSERT INTO preview_screen_state(screen_id,source_fingerprint,status,last_checked_at,updated_at) VALUES ('screen','fingerprint','unavailable',now(),now());
INSERT INTO preview_incident(id,screen_id,source_fingerprint,started_at,last_checked_at) VALUES ('incident','screen','fingerprint',now(),now());
INSERT INTO email_alert_settings(id) VALUES ('main') ON CONFLICT DO NOTHING;
INSERT INTO whatsapp_alert_settings(id) VALUES ('main') ON CONFLICT DO NOTHING;
UPDATE email_alert_settings SET recipients='["client@example.test"]';
UPDATE whatsapp_alert_settings SET recipients='["971500000000"]';
INSERT INTO email_alert_delivery(id,kind,status,recipients,screen_count,started_at) VALUES ('email','unavailable','sent','["client@example.test"]',1,now());
INSERT INTO email_alert_queue(id,incident_id,kind,status,queued_at,delivery_id) VALUES ('email-queue','incident','unavailable','sent',now(),'email');
INSERT INTO whatsapp_alert_delivery(id,batch_id,recipient,kind,status,incident_ids,screen_count,queued_at) VALUES ('whatsapp','batch','971500000000','unavailable','accepted','["incident"]',1,now());
INSERT INTO whatsapp_alert_queue(id,incident_id,recipient,kind,status,queued_at,delivery_id) VALUES ('whatsapp-queue','incident','971500000000','unavailable','accepted',now(),'whatsapp');
INSERT INTO screen_hardware_sections(screen_id,section,fields,version,updated_at) VALUES ('screen','mediaPlayer','{"model":"P388","labelled":"No","serialNumber":"007"}','hardware-v1',now());
INSERT INTO screen_notes(screen_id,note,version,updated_at) VALUES ('screen','Line one\nLine two','notes-v1',now());
INSERT INTO screen_ppm_inspections(screen_id,fields,version) VALUES ('screen','{"overallStatus":"Pass","ppmDate":"2026-11-01"}','ppm-v1');
INSERT INTO screen_remote_access(screen_id,teamviewer_id,anydesk_id,version,updated_at) VALUES ('screen','123456789','pc@example','remote-v1',now());
INSERT INTO location_details(location_id,fields,version) VALUES ('store','{"latitude":"0","address":"Unit 5"}','location-v1');
INSERT INTO location_photos(id,location_id,position,label) VALUES ('22222222-2222-4222-8222-222222222222','store',0,'Rack room');
INSERT INTO screen_reference_photos(screen_id,category,photo_key) VALUES ('screen','media_player','33333333-3333-4333-8333-333333333333');
INSERT INTO cms_updates(id,version,payload,image,updated_by) VALUES ('cms','cms-v1','{"contentName":"Campaign","screens":[{"screenId":"screen","network":"Online"}]}',decode('0001ff','hex'),'admin@example.test');
INSERT INTO cms_reports(id,update_id,revision,source_version,pdf,created_by) VALUES ('report','cms',1,'cms-v1',decode('255044462d00ff','hex'),'admin@example.test');
INSERT INTO auth_user(id,name,email,created_at,updated_at,role,disabled) VALUES ('user','Admin','admin@example.test',now(),now(),'admin',false);
INSERT INTO auth_account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ('account','user','credential','user','unchanged-password-hash',now(),now());
INSERT INTO auth_session(id,expires_at,token,created_at,updated_at,user_id) VALUES ('session',now()+interval '1 day','unchanged-session-token',now(),now(),'user');
INSERT INTO auth_verification(id,identifier,value,expires_at,created_at,updated_at) VALUES ('verification','admin@example.test','unchanged-value',now()+interval '1 hour',now(),now());
INSERT INTO auth_bootstrap(id) VALUES ('main');
INSERT INTO auth_rate_limit(id,key,count,last_request) VALUES ('rate','fixture',2,123456789);
`;
