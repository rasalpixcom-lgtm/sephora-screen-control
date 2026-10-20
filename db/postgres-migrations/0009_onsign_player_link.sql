ALTER TABLE entities ADD COLUMN onsign_player_id text;
ALTER TABLE entities ADD CONSTRAINT entities_onsign_player_screen
  CHECK (onsign_player_id IS NULL OR (type = 'screen' AND length(onsign_player_id) BETWEEN 1 AND 256 AND onsign_player_id !~ '[[:space:][:cntrl:]]'));
