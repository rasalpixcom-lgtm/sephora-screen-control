CREATE TABLE email_alert_settings (
  id text PRIMARY KEY CHECK (id = 'main'),
  enabled boolean NOT NULL DEFAULT false,
  threshold_minutes integer NOT NULL DEFAULT 20 CHECK (threshold_minutes BETWEEN 1 AND 1440),
  grouping_minutes integer NOT NULL DEFAULT 5 CHECK (grouping_minutes BETWEEN 1 AND 60),
  recovery_email boolean NOT NULL DEFAULT false,
  recipients jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(recipients) = 'array' AND jsonb_array_length(recipients) <= 20),
  revision text NOT NULL DEFAULT gen_random_uuid()::text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO email_alert_settings (id) VALUES ('main');
CREATE TABLE email_alert_delivery (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('unavailable','recovery','test')),
  status text NOT NULL CHECK (status IN ('sending','sent','partial','failed','uncertain')),
  recipients jsonb NOT NULL,
  screen_count integer NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  error_code text
);
CREATE INDEX email_alert_delivery_started_idx ON email_alert_delivery (started_at DESC);
CREATE TABLE email_alert_queue (
  id text PRIMARY KEY,
  incident_id text NOT NULL REFERENCES preview_incident(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('unavailable','recovery')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','cancelled','failed','uncertain')),
  queued_at timestamptz NOT NULL,
  retry_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  delivery_id text REFERENCES email_alert_delivery(id),
  UNIQUE (incident_id, kind)
);
CREATE INDEX email_alert_queue_pending_idx ON email_alert_queue (kind, queued_at) WHERE status = 'pending';
