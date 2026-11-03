-- Preserve all hardware records while allowing the LCD section.
ALTER TABLE screen_hardware_sections DROP CONSTRAINT IF EXISTS screen_hardware_sections_section_check;
ALTER TABLE screen_hardware_sections DROP CONSTRAINT IF EXISTS screen_hardware_section_check;
ALTER TABLE screen_hardware_sections ADD CONSTRAINT screen_hardware_section_check
  CHECK (section IN ('ledDisplay', 'ledController', 'mediaPlayer', 'powerNetwork', 'lcd'));
