-- Keep existing assignments and let both staff roles use selected clients.
ALTER TABLE public.auth_user
  DROP CONSTRAINT auth_user_controller_client_ids_check,
  ADD CONSTRAINT auth_user_staff_client_ids_check CHECK (
    controller_client_ids IS NULL OR (
      role IN ('admin', 'controller') AND cardinality(controller_client_ids) <= 500
      AND array_position(controller_client_ids, NULL) IS NULL
    )
  );
