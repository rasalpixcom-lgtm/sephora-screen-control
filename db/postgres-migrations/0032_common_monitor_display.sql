-- Global Controller selection for the common wall. Preserve all per-client walls and keys.
CREATE TABLE common_monitor_display (
  id text PRIMARY KEY CHECK(id='main'),
  client_id text NOT NULL REFERENCES clients(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
INSERT INTO common_monitor_display(id,client_id) VALUES('main','sephora');
GRANT SELECT,UPDATE ON common_monitor_display TO pixcom_sephora_runtime;
