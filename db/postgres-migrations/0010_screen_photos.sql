ALTER TABLE entities ADD COLUMN photo_key text;
ALTER TABLE entities ADD CONSTRAINT entities_photo_screen
  CHECK (photo_key IS NULL OR (type = 'screen' AND photo_key ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'));
CREATE UNIQUE INDEX entities_photo_key_idx ON entities (photo_key) WHERE photo_key IS NOT NULL;
