ALTER TABLE entities ADD COLUMN screen_type text;
ALTER TABLE entities ADD CONSTRAINT entities_screen_type_check
  CHECK (screen_type IS NULL OR (type = 'screen' AND screen_type IN ('LED', 'LCD', 'Video Wall')));
