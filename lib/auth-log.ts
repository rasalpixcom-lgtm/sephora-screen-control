// SDK errors can contain SQL parameters, session tokens or submitted passwords.
// Retain severity and a bounded diagnostic code without logging those payloads.
export function authLog(level: "debug" | "info" | "warn" | "error", ...details: unknown[]) {
  const allowed = new Set(["23505", "40001", "42501", "42P01", "57P01", "53300", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"]);
  function code(value: unknown, depth = 0): string | undefined {
    if (!value || typeof value !== "object" || depth > 3) return;
    const item = value as { code?: unknown; cause?: unknown };
    if (typeof item.code === "string" && allowed.has(item.code)) return item.code;
    return code(item.cause, depth + 1);
  }
  const diagnostic = details.map(value => code(value)).find(Boolean) || "unavailable";
  const message = `Authentication service ${level}`;
  if (level === "error") console.error(message, diagnostic);
  else if (level === "warn") console.warn(message, diagnostic);
  else console.log(message, diagnostic);
}
