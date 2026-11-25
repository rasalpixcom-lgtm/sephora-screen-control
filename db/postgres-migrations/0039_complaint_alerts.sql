-- Private receipt log for the optional Laravel complaint integration.
CREATE TABLE complaint_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  complaint_id bigint NOT NULL,
  occurred_at timestamptz NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  source_client_id bigint NOT NULL,
  client_name text NOT NULL,
  source_store_id bigint NOT NULL,
  store_name text NOT NULL,
  source_screen_id bigint NOT NULL,
  screen_name text NOT NULL,
  issue_label text NOT NULL,
  CONSTRAINT complaint_alerts_positive_ids_check CHECK (
    complaint_id > 0 AND source_client_id > 0 AND source_store_id > 0 AND source_screen_id > 0
  )
);

CREATE INDEX complaint_alerts_scope_cursor_idx ON complaint_alerts (source_client_id, source_store_id, id);
REVOKE ALL ON TABLE complaint_alerts FROM PUBLIC;
REVOKE ALL ON SEQUENCE complaint_alerts_id_seq FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE complaint_alerts TO pixcom_sephora_runtime;
GRANT USAGE ON SEQUENCE complaint_alerts_id_seq TO pixcom_sephora_runtime;
