-- Renaming changes only the display name. Existing IDs, slugs and owned rows stay intact.
ALTER TABLE client_management_activity DROP CONSTRAINT client_management_activity_action_check;
ALTER TABLE client_management_activity ADD CONSTRAINT client_management_activity_action_check
  CHECK(action IN ('create','assign','set_logo','remove_logo','set_background','remove_background','set_onsign','rename'));

CREATE FUNCTION pixcom_rename_client(actor_id text, workspace_id text, expected_name text, workspace_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE actual_name text;
BEGIN
  -- Serialize with client creation, branding edits and account disabling.
  PERFORM pg_advisory_xact_lock(724016);
  IF NOT EXISTS(SELECT 1 FROM public.auth_user WHERE id=actor_id AND role='admin' AND NOT disabled) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Admin access required.';
  END IF;
  IF workspace_name IS NULL OR workspace_name<>btrim(workspace_name) OR
     char_length(workspace_name) NOT BETWEEN 1 AND 120 OR workspace_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Enter a client name between 1 and 120 characters.';
  END IF;
  SELECT name INTO actual_name FROM public.clients WHERE id=workspace_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Client not found.'; END IF;
  IF actual_name IS DISTINCT FROM expected_name THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Client changed. Reopen the editor.';
  END IF;
  IF actual_name=workspace_name THEN RETURN workspace_id; END IF;
  IF EXISTS(SELECT 1 FROM public.clients WHERE id<>workspace_id AND lower(name)=lower(workspace_name)) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='A client with this name already exists.';
  END IF;
  UPDATE public.clients SET name=workspace_name WHERE id=workspace_id;
  INSERT INTO public.client_management_activity(id,actor_id,client_id,action,details)
    VALUES(gen_random_uuid()::text,actor_id,workspace_id,'rename',jsonb_build_object('before',actual_name,'after',workspace_name));
  RETURN workspace_id;
END $function$;
REVOKE ALL ON FUNCTION pixcom_rename_client(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pixcom_rename_client(text,text,text,text) TO pixcom_sephora_runtime;
