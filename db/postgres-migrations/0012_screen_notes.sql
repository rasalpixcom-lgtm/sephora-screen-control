CREATE TABLE screen_notes (
  screen_id text PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (char_length(note) <= 4000),
  version text NOT NULL,
  updated_at timestamptz NOT NULL
);
