CREATE TABLE preview_screen_state (
  screen_id text PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  source_fingerprint text NOT NULL,
  status text NOT NULL CONSTRAINT preview_screen_state_status CHECK (status IN ('available', 'unavailable')),
  last_success_at timestamptz,
  last_checked_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE preview_incident (
  id text PRIMARY KEY,
  screen_id text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_fingerprint text NOT NULL,
  started_at timestamptz NOT NULL,
  last_checked_at timestamptz NOT NULL,
  last_success_at timestamptz,
  resolved_at timestamptz,
  resolution_reason text CONSTRAINT preview_incident_resolution_reason CHECK (resolution_reason IS NULL OR resolution_reason IN ('recovered', 'configuration_changed'))
);

CREATE UNIQUE INDEX preview_incident_one_open_per_screen_idx
  ON preview_incident (screen_id) WHERE resolved_at IS NULL;
CREATE INDEX preview_incident_screen_idx ON preview_incident (screen_id);
CREATE INDEX preview_incident_open_started_idx ON preview_incident (resolved_at, started_at);
