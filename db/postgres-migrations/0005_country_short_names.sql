ALTER TABLE entities ADD COLUMN short_name text;
ALTER TABLE entities ADD CONSTRAINT entities_country_short_name_check CHECK (
  short_name IS NULL OR (
    type = 'country' AND short_name = btrim(short_name)
    AND char_length(short_name) BETWEEN 1 AND 12
  )
);
CREATE UNIQUE INDEX entities_country_short_name_idx ON entities (lower(short_name))
  WHERE type = 'country' AND short_name IS NOT NULL;
