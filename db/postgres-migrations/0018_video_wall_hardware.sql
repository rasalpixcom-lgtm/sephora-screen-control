-- Expand permitted hardware sections without changing existing records.
ALTER TABLE screen_hardware_sections DROP CONSTRAINT IF EXISTS screen_hardware_section_check;
ALTER TABLE screen_hardware_sections ADD CONSTRAINT screen_hardware_section_check
  CHECK (section IN ('ledDisplay', 'ledController', 'mediaPlayer', 'powerNetwork', 'lcd', 'video_wall'));
