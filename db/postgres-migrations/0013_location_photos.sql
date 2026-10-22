CREATE TABLE location_photos (
  id text PRIMARY KEY CONSTRAINT location_photos_id_check CHECK (id ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'),
  location_id text NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  position integer NOT NULL CONSTRAINT location_photos_position_check CHECK (position BETWEEN 0 AND 4),
  label text NOT NULL DEFAULT '' CONSTRAINT location_photos_label_check CHECK (char_length(label) <= 80),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX location_photos_location_position_idx ON location_photos (location_id, position);
CREATE INDEX location_photos_location_idx ON location_photos (location_id);
