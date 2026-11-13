-- Explicit workspace access; preserve existing account/session values.
CREATE TABLE client_memberships (
  client_id text NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'controller')),
  PRIMARY KEY (client_id, user_id)
);
CREATE INDEX client_memberships_user_idx ON client_memberships(user_id);
INSERT INTO client_memberships(client_id,user_id,role)
  SELECT 'sephora',id,role FROM auth_user WHERE role IN ('admin','controller');
