-- Optional branding is global administration data; existing client rows/photos stay unchanged.
CREATE TABLE client_logos (
  client_id text PRIMARY KEY REFERENCES clients(id) ON DELETE RESTRICT,
  version text NOT NULL CHECK(version ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'),
  image bytea CHECK(image IS NULL OR octet_length(image) BETWEEN 1 AND 524288),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL
);
GRANT SELECT ON client_logos TO pixcom_sephora_runtime;
ALTER TABLE client_management_activity DROP CONSTRAINT client_management_activity_action_check;
ALTER TABLE client_management_activity ADD CONSTRAINT client_management_activity_action_check
  CHECK(action IN ('create','assign','set_logo','remove_logo'));

CREATE FUNCTION pixcom_set_client_logo(actor_id text, workspace_id text, expected_version text, image_bytes bytea) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE actual_version text; next_version text;
BEGIN
  PERFORM pg_advisory_xact_lock(724016);
  IF NOT EXISTS(SELECT 1 FROM public.auth_user u WHERE u.id=actor_id AND u.role='admin' AND NOT u.disabled) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Admin access required.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clients WHERE id=workspace_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Client not found.';
  END IF;
  IF image_bytes IS NOT NULL AND (octet_length(image_bytes) NOT BETWEEN 1 AND 524288 OR
      substring(image_bytes from 1 for 4)<>decode('52494646','hex') OR
      substring(image_bytes from 9 for 4)<>decode('57454250','hex')) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid logo.';
  END IF;
  SELECT version INTO actual_version FROM public.client_logos WHERE client_id=workspace_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Client logo changed. Reopen the editor.';
  END IF;
  next_version := gen_random_uuid()::text;
  INSERT INTO public.client_logos(client_id,version,image,updated_by) VALUES(workspace_id,next_version,image_bytes,actor_id)
    ON CONFLICT(client_id) DO UPDATE SET version=excluded.version,image=excluded.image,
      updated_at=now(),updated_by=excluded.updated_by;
  INSERT INTO public.client_management_activity(id,actor_id,client_id,action,details)
    VALUES(gen_random_uuid()::text,actor_id,workspace_id,CASE WHEN image_bytes IS NULL THEN 'remove_logo' ELSE 'set_logo' END,
      jsonb_build_object('version',next_version));
  RETURN next_version;
END $function$;
REVOKE ALL ON FUNCTION pixcom_set_client_logo(text,text,text,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pixcom_set_client_logo(text,text,text,bytea) TO pixcom_sephora_runtime;
