-- Preserve old account records and history, but retire credential-based monitor access.
INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, actor, created_at)
SELECT gen_random_uuid()::text, 'retired monitor account', 'user', u.id, u.email, 'System migration',
       to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM auth_user u
WHERE u.role = 'wall' AND (u.disabled = false OR EXISTS (SELECT 1 FROM auth_session s WHERE s.user_id = u.id));

UPDATE auth_user SET disabled = true, updated_at = now() WHERE role = 'wall';
DELETE FROM auth_session WHERE user_id IN (SELECT id FROM auth_user WHERE role = 'wall');
ALTER TABLE auth_user ALTER COLUMN role SET DEFAULT 'controller';
ALTER TABLE auth_user ADD CONSTRAINT auth_user_supported_roles
  CHECK (role IN ('admin', 'controller') OR (role = 'wall' AND disabled = true));
