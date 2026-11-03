ALTER TABLE screen_reference_photos DROP CONSTRAINT screen_reference_photos_category_check;
ALTER TABLE screen_reference_photos ADD CONSTRAINT screen_reference_photos_category_check
  CHECK (category IN ('serial', 'issues', 'back_cabling', 'looping_diagram', 'sending_card', 'media_player', 'power_network', 'connection_diagram'));
