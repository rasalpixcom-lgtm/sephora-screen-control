-- Platform administration is separate from a client's Admin membership.
-- Seed trusted existing Sephora administrators without editing existing records.
CREATE TABLE platform_administrators (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_administrators(user_id)
SELECT u.id FROM auth_user u JOIN client_memberships m ON m.user_id=u.id
WHERE u.role='admin' AND NOT u.disabled AND m.client_id='sephora' AND m.role='admin';

CREATE TABLE client_management_activity (
  id text PRIMARY KEY,
  actor_id text NOT NULL,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('create','assign')),
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_management_activity_client_idx ON client_management_activity(client_id,created_at);
GRANT SELECT ON platform_administrators,client_management_activity TO pixcom_sephora_runtime;

-- Only the validated first-account setup can grant new platform access at runtime.
CREATE FUNCTION pixcom_bootstrap_platform_admin(account_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(724016);
  IF EXISTS(SELECT 1 FROM public.platform_administrators) OR
     (SELECT count(*) FROM public.auth_user)<>1 OR
     NOT EXISTS(SELECT 1 FROM public.auth_bootstrap WHERE id='main') OR
     NOT EXISTS(SELECT 1 FROM public.auth_user u JOIN public.client_memberships m ON m.user_id=u.id
       WHERE u.id=account_id AND u.role='admin' AND NOT u.disabled AND m.client_id='sephora' AND m.role='admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Platform setup is unavailable.';
  END IF;
  INSERT INTO public.platform_administrators(user_id) VALUES(account_id);
END $function$;
REVOKE ALL ON FUNCTION pixcom_bootstrap_platform_admin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pixcom_bootstrap_platform_admin(text) TO pixcom_sephora_runtime;

-- A bounded operation provisions a client; runtime pools never gain CREATEROLE,
-- table ownership, or permission to call the unrestricted operator function.
CREATE FUNCTION pixcom_manage_client(actor_id text, operation text, workspace_id text,
  workspace_name text, requested_members jsonb, expected_version text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE before_members jsonb; after_members jsonb; actual_version text; runtime_role text;
BEGIN
  -- Share the account-update lock so disabling an Admin cannot race assignment.
  PERFORM pg_advisory_xact_lock(724016);
  IF NOT EXISTS(SELECT 1 FROM public.platform_administrators p JOIN public.auth_user u ON u.id=p.user_id
    WHERE u.id=actor_id AND u.role='admin' AND NOT u.disabled) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Platform Admin access required.';
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
    INSERT INTO public.client_memberships(client_id,user_id,role) VALUES(workspace_id,actor_id,'admin');
    INSERT INTO public.client_management_activity(id,actor_id,client_id,action,details)
      VALUES(gen_random_uuid()::text,actor_id,workspace_id,'create',jsonb_build_object('name',workspace_name));
    RETURN workspace_id;
  ELSIF operation<>'assign' OR operation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Unknown client action.';
  END IF;
  PERFORM 1 FROM public.clients WHERE id=workspace_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Client not found.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'role',role) ORDER BY user_id),'[]'::jsonb)
    INTO before_members FROM public.client_memberships WHERE client_id=workspace_id;
  actual_version := md5(before_members::text);
  IF expected_version IS DISTINCT FROM actual_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Access changed. Refresh and review it before saving.';
  END IF;
  IF requested_members IS NULL OR jsonb_typeof(requested_members)<>'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose valid users and roles.';
  END IF;
  IF jsonb_array_length(requested_members)>500 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(requested_members) item
    WHERE jsonb_typeof(item)<>'object' OR jsonb_typeof(item->'userId') IS DISTINCT FROM 'string' OR
      coalesce(item->>'role','') NOT IN ('admin','controller') OR
      NOT EXISTS(SELECT 1 FROM public.auth_user u WHERE u.id=item->>'userId' AND u.role IN ('admin','controller')
        AND (item->>'role'<>'admin' OR u.role='admin') AND (NOT u.disabled OR EXISTS(
          SELECT 1 FROM public.client_memberships m WHERE m.client_id=workspace_id AND m.user_id=u.id AND m.role=item->>'role')))
  ) OR (SELECT count(*) FROM jsonb_array_elements(requested_members)) <>
       (SELECT count(DISTINCT item->>'userId') FROM jsonb_array_elements(requested_members) item) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose enabled users with valid account roles.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(requested_members) item JOIN public.auth_user u ON u.id=item->>'userId'
    WHERE item->>'role'='admin' AND u.role='admin' AND NOT u.disabled) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Keep at least one enabled Admin for this client.';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('userId',item->>'userId','role',item->>'role') ORDER BY item->>'userId'),'[]'::jsonb)
    INTO after_members FROM jsonb_array_elements(requested_members) item;
  IF before_members=after_members THEN RETURN workspace_id; END IF;
  DELETE FROM public.client_memberships m WHERE m.client_id=workspace_id AND NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(requested_members) item WHERE item->>'userId'=m.user_id);
  INSERT INTO public.client_memberships(client_id,user_id,role)
    SELECT workspace_id,item->>'userId',item->>'role' FROM jsonb_array_elements(requested_members) item
    ON CONFLICT(client_id,user_id) DO UPDATE SET role=excluded.role;
  INSERT INTO public.client_management_activity(id,actor_id,client_id,action,details)
    VALUES(gen_random_uuid()::text,actor_id,workspace_id,'assign',jsonb_build_object('before',before_members,'after',after_members));
  RETURN workspace_id;
END $function$;
REVOKE ALL ON FUNCTION pixcom_manage_client(text,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pixcom_manage_client(text,text,text,text,jsonb,text) TO pixcom_sephora_runtime;
