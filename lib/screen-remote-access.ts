export type ScreenRemoteFields = { teamViewerId: string; anyDeskId: string };
export const REMOTE_ID_MAX_LENGTH = 100;

export function parseScreenRemoteAccess(value: unknown): ScreenRemoteFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter valid remote access details.");
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some(key => key !== "teamViewerId" && key !== "anyDeskId") || typeof fields.teamViewerId !== "string" || typeof fields.anyDeskId !== "string") throw new Error("Enter only a TeamViewer ID and an AnyDesk ID or alias.");
  if (fields.teamViewerId.length > REMOTE_ID_MAX_LENGTH || fields.anyDeskId.length > REMOTE_ID_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(fields.teamViewerId + fields.anyDeskId)) throw new Error("Remote IDs must be 100 characters or fewer, without line breaks.");
  const teamViewerId = fields.teamViewerId.trim().replace(/[ -]/g, "");
  let anyDeskId = fields.anyDeskId.trim();
  if (/^[0-9 -]+$/.test(anyDeskId)) anyDeskId = anyDeskId.replace(/[ -]/g, "");
  if (teamViewerId && !/^[0-9]{1,32}$/.test(teamViewerId)) throw new Error("TeamViewer ID must contain digits only.");
  if (anyDeskId && !/^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$/.test(anyDeskId)) throw new Error("Enter an AnyDesk ID or alias using letters, numbers, dots, hyphens, underscores or @.");
  return { teamViewerId, anyDeskId };
}
