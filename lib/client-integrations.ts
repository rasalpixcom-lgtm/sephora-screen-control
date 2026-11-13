import { activeClientId } from "./client-workspace";

type Integration = { onsign?: { token?: string; organizationId?: string }; email?: { user?: string; appPassword?: string }; whatsapp?: { instanceId?: string; token?: string } };
type Environment = Record<string, string | undefined>;
const providers = { onsign: ["token", "organizationId"], email: ["user", "appPassword"], whatsapp: ["instanceId", "token"] } as const;
const invalid = () => new Error("Check PIXCOM_CLIENT_INTEGRATIONS on the server.");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

// Server-only configuration. No shared/default account is inherited by another
// client. An explicit entry (even {}) replaces all legacy values for that client.
export function clientIntegrations(clientId: string = activeClientId(), environment: Environment = process.env): Integration {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(clientId) || clientId.length > 80) throw invalid();
  const raw = environment.PIXCOM_CLIENT_INTEGRATIONS?.trim();
  if (raw) {
    let parsed: unknown;
    try { if (raw.length > 65536) throw invalid(); parsed = JSON.parse(raw); } catch { throw invalid(); }
    if (!object(parsed)) throw invalid();
    for (const [id, entry] of Object.entries(parsed)) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length > 80 || !object(entry)) throw invalid();
      for (const [provider, fields] of Object.entries(entry)) {
        if (!Object.hasOwn(providers, provider) || !object(fields)) throw invalid();
        for (const [key, value] of Object.entries(fields)) {
          if (!(providers[provider as keyof typeof providers] as readonly string[]).includes(key) || typeof value !== "string" || value.length > 8192 || /[\r\n\u0000]/.test(value)) throw invalid();
        }
      }
    }
    if (Object.hasOwn(parsed, clientId)) return parsed[clientId] as Integration;
  }
  if (clientId !== "sephora") return {};
  return {
    onsign: { token: environment.ONSIGN_API_TOKEN, organizationId: environment.ONSIGN_ORGANIZATION_ID },
    email: { user: environment.ALERT_EMAIL_USER, appPassword: environment.ALERT_EMAIL_APP_PASSWORD },
    whatsapp: { instanceId: environment.ULTRAMSG_INSTANCE_ID, token: environment.ULTRAMSG_TOKEN },
  };
}
