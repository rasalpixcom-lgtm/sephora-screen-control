CREATE TABLE IF NOT EXISTS screen_ppm_inspections (
  screen_id text PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT screen_ppm_inspections_fields_check CHECK (jsonb_typeof(fields) = 'object')
);
