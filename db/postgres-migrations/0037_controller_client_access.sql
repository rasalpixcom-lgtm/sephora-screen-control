-- NULL is unrestricted, including all existing accounts. An empty array grants no clients.
ALTER TABLE auth_user ADD COLUMN controller_client_ids text[];
ALTER TABLE auth_user ADD CONSTRAINT auth_user_controller_client_ids_check CHECK (
  controller_client_ids IS NULL OR (
    role = 'controller' AND cardinality(controller_client_ids) <= 500 AND array_position(controller_client_ids, NULL) IS NULL
  )
);
