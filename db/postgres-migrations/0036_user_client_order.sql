-- Personal client-card order is separate from client data and wall selections.
-- This migration adds empty storage; no existing rows or settings are rewritten.
CREATE TABLE user_client_order (
  user_id text PRIMARY KEY REFERENCES auth_user(id) ON DELETE CASCADE,
  client_ids jsonb NOT NULL,
  version text NOT NULL CHECK(version ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_client_order_ids_check CHECK(jsonb_typeof(client_ids)='array' AND jsonb_array_length(client_ids)<=500)
);
REVOKE ALL ON TABLE user_client_order FROM PUBLIC;
GRANT SELECT ON user_client_order TO pixcom_sephora_runtime;

CREATE FUNCTION pixcom_set_user_client_order(actor_id text, next_order jsonb, expected_version text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE actual_version text; next_version text;
BEGIN
  -- Serialize only this account's order, including concurrent first saves.
  PERFORM pg_advisory_xact_lock(724018,hashtext(actor_id));
  PERFORM 1 FROM public.auth_user WHERE id=actor_id AND role IN ('admin','controller') AND NOT disabled FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='An enabled staff account is required.';
  END IF;
  IF expected_version IS NOT NULL AND expected_version !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Reload the client order.';
  END IF;
  IF next_order IS NULL OR jsonb_typeof(next_order) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose a valid client order.';
  END IF;
  IF jsonb_array_length(next_order)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose a valid client order.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(next_order) AS entry(value)
    WHERE jsonb_typeof(value)<>'string' OR length(value #>> '{}')>64 OR (value #>> '{}') !~ '^[a-z0-9]+(-[a-z0-9]+)*$') OR
    (SELECT count(*)<>count(DISTINCT value) FROM jsonb_array_elements(next_order) AS entry(value)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Choose a valid client order.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(next_order) AS entry(client_id)
    WHERE NOT EXISTS(SELECT 1 FROM public.clients WHERE id=entry.client_id AND archived_at IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='The available clients changed. Reload this page.';
  END IF;
  SELECT version INTO actual_version FROM public.user_client_order WHERE user_id=actor_id FOR UPDATE;
  IF actual_version IS DISTINCT FROM expected_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Your client order changed elsewhere. Reload this page.';
  END IF;
  next_version := gen_random_uuid()::text;
  INSERT INTO public.user_client_order(user_id,client_ids,version)
    VALUES(actor_id,next_order,next_version)
    ON CONFLICT(user_id) DO UPDATE SET client_ids=excluded.client_ids,version=excluded.version,updated_at=now();
  RETURN next_version;
END $function$;
REVOKE ALL ON FUNCTION pixcom_set_user_client_order(text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pixcom_set_user_client_order(text,jsonb,text) TO pixcom_sephora_runtime;
