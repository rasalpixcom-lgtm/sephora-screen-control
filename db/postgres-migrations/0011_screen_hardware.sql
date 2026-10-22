CREATE TABLE screen_hardware_sections (
  screen_id text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('ledDisplay', 'ledController', 'mediaPlayer', 'powerNetwork')),
  fields jsonb NOT NULL CHECK (jsonb_typeof(fields) = 'object'),
  version text NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (screen_id, section)
);
