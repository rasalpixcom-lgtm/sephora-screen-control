CREATE TABLE IF NOT EXISTS location_details (
  location_id text PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_details_fields_check CHECK (jsonb_typeof(fields) = 'object')
);
