CREATE TABLE whatsapp_alert_settings (
 id text PRIMARY KEY CHECK(id='main'), enabled boolean NOT NULL DEFAULT false,
 threshold_minutes integer NOT NULL DEFAULT 20 CHECK(threshold_minutes BETWEEN 1 AND 1440),
 grouping_minutes integer NOT NULL DEFAULT 5 CHECK(grouping_minutes BETWEEN 1 AND 60),
 recovery_email boolean NOT NULL DEFAULT false,
 recipients jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(recipients)='array' AND jsonb_array_length(recipients)<=20),
 revision text NOT NULL DEFAULT gen_random_uuid()::text, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO whatsapp_alert_settings(id) VALUES('main');
CREATE TABLE whatsapp_alert_delivery (
 id text PRIMARY KEY, batch_id text NOT NULL, recipient text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('unavailable','recovery','test','manual')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','failed','uncertain','cancelled')),
 incident_ids jsonb NOT NULL DEFAULT '[]', screen_count integer NOT NULL DEFAULT 0,
 queued_at timestamptz NOT NULL, finished_at timestamptz, error_code text, provider_id text
);
CREATE INDEX whatsapp_alert_delivery_queued_idx ON whatsapp_alert_delivery(queued_at DESC);
CREATE INDEX whatsapp_alert_delivery_pending_idx ON whatsapp_alert_delivery(queued_at) WHERE status='pending';
CREATE TABLE whatsapp_alert_queue (
 id text PRIMARY KEY, incident_id text NOT NULL REFERENCES preview_incident(id) ON DELETE CASCADE,
 recipient text NOT NULL, kind text NOT NULL CHECK(kind IN ('unavailable','recovery')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','scheduled','accepted','cancelled','uncertain')),
 queued_at timestamptz NOT NULL, retry_at timestamptz, attempts integer NOT NULL DEFAULT 0,
 delivery_id text REFERENCES whatsapp_alert_delivery(id), UNIQUE(incident_id,kind,recipient)
);
CREATE INDEX whatsapp_alert_queue_pending_idx ON whatsapp_alert_queue(recipient,kind,queued_at) WHERE status='pending';
