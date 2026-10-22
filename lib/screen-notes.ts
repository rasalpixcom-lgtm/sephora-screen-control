export const SCREEN_NOTE_MAX_LENGTH = 4000;

export function parseScreenNote(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a valid note.");
  const note = value.replace(/\r\n?/g, "\n").trim();
  if (note.length > SCREEN_NOTE_MAX_LENGTH) throw new Error(`Notes must be ${SCREEN_NOTE_MAX_LENGTH} characters or fewer.`);
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(note)) throw new Error("Notes cannot contain control characters.");
  return note;
}
