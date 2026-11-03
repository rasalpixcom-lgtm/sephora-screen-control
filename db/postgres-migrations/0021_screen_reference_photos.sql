CREATE TABLE IF NOT EXISTS screen_reference_photos (
  screen_id text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('serial', 'issues')),
  photo_key text NOT NULL UNIQUE CHECK (photo_key ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'),
  PRIMARY KEY (screen_id, category)
);
