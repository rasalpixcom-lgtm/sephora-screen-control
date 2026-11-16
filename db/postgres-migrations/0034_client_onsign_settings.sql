-- Optional encrypted OnSign overrides. No existing rows or environment values change.
CREATE TABLE client_onsign_settings (
  client_id text PRIMARY KEY REFERENCES clients(id) ON DELETE RESTRICT,
  version text NOT NULL CHECK(version ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'),
  mode text NOT NULL CHECK(mode IN ('custom','disabled','server')),
  organization_id text,
  encrypted_token text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CHECK ((mode='custom' AND encrypted_token IS NOT NULL AND length(encrypted_token) BETWEEN 1 AND 20000
    AND encrypted_token LIKE 'v1.%'
    AND (organization_id IS NULL OR (length(organization_id) BETWEEN 1 AND 256 AND organization_id !~ '[[:space:][:cntrl:]]'))
    AND (client_id='sephora' OR organization_id IS NOT NULL))
    OR (mode IN ('disabled','server') AND encrypted_token IS NULL AND organization_id IS NULL))
);
GRANT SELECT ON client_onsign_settings TO pixcom_sephora_runtime;
ALTER TABLE client_management_activity DROP CONSTRAINT client_management_activity_action_check;
ALTER TABLE client_management_activity ADD CONSTRAINT client_management_activity_action_check
  CHECK(action IN ('create','assign','set_logo','remove_logo','set_background','remove_background','set_onsign'));

CREATE FUNCTION pixcom_set_client_onsign(actor_id text, workspace_id text, expected_version text,
  next_mode text, next_organization text, next_token text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE actual_version text; next_version text;
BEGIN
  PERFORM pg_advisory_xact_lock(724016);
  IF NOT EXISTS(SELECT 1 FROM public.auth_user WHERE id=actor_id AND role='admin' AND NOT disabled) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Admin access required.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clients WHERE id=workspace_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Client not found.';
  END IF;
  SELECT version INTO actual_version FROM public.client_onsign_settings WHERE client_id=workspace_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='OnSign settings changed. Reopen the editor.';
  END IF;
  next_version := gen_random_uuid()::text;
  INSERT INTO public.client_onsign_settings(client_id,version,mode,organization_id,encrypted_token,updated_by)
    VALUES(workspace_id,next_version,next_mode,next_organization,next_token,actor_id)
    ON CONFLICT(client_id) DO UPDATE SET version=excluded.version,mode=excluded.mode,
      organization_id=excluded.organization_id,encrypted_token=excluded.encrypted_token,
      updated_at=now(),updated_by=excluded.updated_by;
  -- Never put credentials or organization IDs in the audit payload.
  INSERT INTO public.client_management_activity(id,actor_id,client_id,action,details)
    VALUES(gen_random_uuid()::text,actor_id,workspace_id,'set_onsign',jsonb_build_object('mode',next_mode,'version',next_version));
  RETURN next_version;
END $function$;
REVOKE ALL ON FUNCTION pixcom_set_client_onsign(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pixcom_set_client_onsign(text,text,text,text,text,text) TO pixcom_sephora_runtime;
