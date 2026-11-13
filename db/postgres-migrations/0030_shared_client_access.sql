-- Access now follows the existing global Admin/Controller account role.
-- Retain legacy membership/platform rows and all existing client inventory as-is.
-- Disable the obsolete platform bootstrap; no third role is granted at runtime.
REVOKE EXECUTE ON FUNCTION pixcom_bootstrap_platform_admin(text) FROM pixcom_sephora_runtime;

CREATE OR REPLACE FUNCTION pixcom_manage_client(actor_id text, operation text, workspace_id text,
  workspace_name text, requested_members jsonb, expected_version text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE runtime_role text;
BEGIN
  -- Share the account-update lock so disabling an Admin cannot race client creation.
  PERFORM pg_advisory_xact_lock(724016);
  IF NOT EXISTS(SELECT 1 FROM public.auth_user u WHERE u.id=actor_id AND u.role='admin' AND NOT u.disabled) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Admin access required.';
  END IF;
  IF operation='create' THEN
    IF workspace_id IS NULL OR workspace_id !~ '^client-[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR
       workspace_name IS NULL OR workspace_name<>btrim(workspace_name) OR
       char_length(workspace_name) NOT BETWEEN 1 AND 120 OR workspace_name ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Enter a client name between 1 and 120 characters.';
    END IF;
    IF EXISTS(SELECT 1 FROM public.clients WHERE lower(name)=lower(workspace_name)) THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='A client with this name already exists.';
    END IF;
    INSERT INTO public.clients(id,slug,name) VALUES(workspace_id,workspace_id,workspace_name);
    PERFORM public.pixcom_provision_client(workspace_id);
    runtime_role := 'pixcom_client_' || md5(workspace_id);
    -- The application login can differ from the migration/function owner.
    EXECUTE format('GRANT %I TO %I',runtime_role,session_user);
    INSERT INTO public.client_management_activity(id,actor_id,client_id,action,details)
      VALUES(gen_random_uuid()::text,actor_id,workspace_id,'create',jsonb_build_object('name',workspace_name));
    RETURN workspace_id;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Unknown client action.';
  END IF;
END $function$;
REVOKE ALL ON FUNCTION pixcom_manage_client(text,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pixcom_manage_client(text,text,text,text,jsonb,text) TO pixcom_sephora_runtime;

-- Separate capability for one read-only monitor link covering all active clients.
-- Existing per-client monitor hashes/generations are never changed or copied.
CREATE TABLE common_monitor_access (
  id text PRIMARY KEY CHECK(id='main'),
  token_hash text CHECK(token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$'),
  generation text NOT NULL,
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL
);
GRANT SELECT,INSERT,UPDATE ON common_monitor_access TO pixcom_sephora_runtime;
