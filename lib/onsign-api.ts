import { createHash } from "node:crypto";
import { onSignLoops, onSignSections, validOnSignPlayerId, type OnSignDetails, type OnSignPlayer, type OnSignPlayerOption, type OnSignSection, type OnSignLoop, type OnSignSectionResult, type OnSignValue } from "./onsign-api-shared";
import { extendedPlayerFields, relatedSelections, loopItems, loopTriggers } from "./onsign-detail-queries";

export class OnSignApiError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
const unavailable = () => new OnSignApiError("OnSign could not be reached. Please try again shortly.");
const text = (value: unknown) => typeof value === "string" ? value : null;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const boolean = (value: unknown) => typeof value === "boolean" ? value : null;
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value as ObjectValue;
}
function option(value: unknown): OnSignPlayerOption {
  const item = object(value);
  if (!validOnSignPlayerId(item.id) || typeof item.name !== "string") throw unavailable();
  return { id: item.id, name: item.name };
}
function values(value: unknown): Record<string, OnSignValue> {
  // Only JSON data can reach the UI; no HTML interpretation or executable URLs.
  const result = object(value);
  return JSON.parse(JSON.stringify(result)) as Record<string, OnSignValue>;
}
function connection(value: unknown, edges = false) {
  const item = object(value), info = object(item.pageInfo);
  const nodes = edges ? item.edges : item.nodes;
  if (!Array.isArray(nodes) || typeof info.hasNextPage !== "boolean") throw unavailable();
  const cursor = text(info.endCursor);
  if (info.hasNextPage && !cursor) throw unavailable();
  return { nodes: nodes.filter(node => node !== null).map(values), totalCount: number(item.totalCount), pageInfo: { hasNextPage: info.hasNextPage, endCursor: cursor } };
}
function player(value: unknown): OnSignPlayer {
  const item = object(value);
  return {
    ...option(item), isConnected: boolean(item.isConnected), lastSeen: text(item.lastSeen), lastSync: text(item.lastSync),
    syncProgress: number(item.syncProgress), errorCount: number(item.errorCount), warningCount: number(item.warningCount),
    model: text(item.model), version: text(item.version), osVersion: text(item.osVersion), timezone: text(item.timezone),
    signalStrength: number(item.signalStrength), isInMaintenance: boolean(item.isInMaintenance), isDetached: boolean(item.isDetached),
    network: Array.isArray(item.network) ? item.network.map(value => {
      const network = object(value);
      return { name: text(network.name), inet: text(network.inet), ssid: text(network.ssid), status: text(network.status), rssi: number(network.rssi) };
    }) : [],
  };
}

// One client per server process. Dependencies are injectable for tests; production
// always uses the fixed HTTPS endpoint, and never sends a mutation to OnSign.
export function createOnSignClient(environment: { token: () => string | undefined; organizationId?: () => string | undefined; fetch: typeof fetch; now: () => number }) {
  type Entry = { until: number; task: Promise<unknown> };
  type Context = { credential: string; organizationId: string | null; identity: string };
  const cache = new Map<string, Entry>();
  let identity = "";
  function context(): Context {
    const value = environment.token()?.trim();
    if (!value) throw new OnSignApiError("OnSign is not configured. Add ONSIGN_API_TOKEN on the server.");
    if (/[\r\n]/.test(value)) throw new OnSignApiError("Check the OnSign API token on the server.");
    const organizationId = environment.organizationId?.()?.trim() || null;
    if (organizationId && !validOnSignPlayerId(organizationId)) throw new OnSignApiError("Check ONSIGN_ORGANIZATION_ID on the server.");
    const next = createHash("sha256").update(JSON.stringify([value, organizationId])).digest("hex");
    if (identity !== next) { cache.clear(); identity = next; }
    return { credential: value, organizationId, identity: next };
  }
  async function query(query: string, variables: Record<string, unknown>, credential: string, signal: AbortSignal) {
    try {
      const response = await environment.fetch("https://api.onsign.tv/graphql", {
        method: "POST", redirect: "error", cache: "no-store", signal,
        headers: { Authorization: `token ${credential}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (response.status === 401 || response.status === 403) throw new OnSignApiError("OnSign rejected access. Check the API token and player read permission.");
      if (response.status === 429) throw new OnSignApiError("OnSign API limit reached. Please wait before trying again.", 429);
      if (!response.ok) throw unavailable();
      const result = object(await response.json());
      // Reject partial GraphQL results. Never expose upstream errors or credentials.
      if (result.errors && (!Array.isArray(result.errors) || result.errors.length)) throw new OnSignApiError("OnSign could not return this information. Check API access; published content also requires content read permission.");
      return object(result.data);
    } catch (error) { if (error instanceof OnSignApiError) throw error; throw unavailable(); }
  }
  async function cached<T>(scope: Context, name: string, ttl: number, work: () => Promise<T>): Promise<T> {
    const key = `${scope.identity}:${name}`;
    const prior = cache.get(key);
    if (prior && prior.until > environment.now()) return prior.task as Promise<T>;
    // Bound memory while retaining concurrent request deduplication.
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    const entry: Entry = { until: Infinity, task: Promise.resolve() };
    entry.task = work().then(value => {
      entry.until = environment.now() + ttl;
      return value;
    }, error => {
      entry.until = environment.now() + 30000;
      throw error;
    });
    cache.set(key, entry);
    return entry.task as Promise<T>;
  }

  async function organization(scope: Context) {
    if (scope.organizationId) return scope.organizationId;
    return cached(scope, "organization", 300000, async () => {
      const matches = new Set<string>(), cursors = new Set<string>();
      let after: string | null = null;
      const signal = AbortSignal.timeout(5000);
      for (let page = 0; page < 100; page++) {
        const data = await query(`query Organizations($after: String) { organizations(first: 100, after: $after) { nodes { id name } pageInfo { hasNextPage endCursor } } }`, { after }, scope.credential, signal);
        const connection = object(data.organizations), pageInfo = object(connection.pageInfo);
        if (!Array.isArray(connection.nodes) || typeof pageInfo.hasNextPage !== "boolean") throw unavailable();
        for (const value of connection.nodes) {
          const item = option(value);
          if (item.name.trim().toLowerCase() === "sephora") matches.add(item.id);
        }
        if (matches.size > 1) throw new OnSignApiError("More than one OnSign organization is named Sephora. Set ONSIGN_ORGANIZATION_ID on the server to select the correct one.");
        if (!pageInfo.hasNextPage) {
          const id = matches.values().next().value;
          if (!id) throw new OnSignApiError("The Sephora organization was not found. Check this token's organization access or set its ONSIGN_ORGANIZATION_ID on the server.");
          return id;
        }
        const cursor = text(pageInfo.endCursor);
        if (!cursor || cursors.has(cursor)) throw unavailable();
        cursors.add(cursor); after = cursor;
      }
      throw new OnSignApiError("The OnSign organization list is too large. Set ONSIGN_ORGANIZATION_ID on the server.");
    });
  }
  function scopedOrganization(data: ObjectValue, id: string) {
    const nodes = object(data.organizations).nodes;
    if (!Array.isArray(nodes)) throw unavailable();
    if (!nodes.length) throw new OnSignApiError("The selected Sephora organization is unavailable. Check ONSIGN_ORGANIZATION_ID and the token's organization access.");
    if (nodes.length !== 1 || object(nodes[0]).id !== id) throw unavailable();
    return object(nodes[0]);
  }
  function scopedPlayer(data: ObjectValue, organizationId: string, id: string) {
    const item = scopedOrganization(data, organizationId).player;
    if (item === null) throw new OnSignApiError("This player was not found in the selected Sephora organization. Check its link in Edit screen.", 404);
    const result = object(item);
    if (result.id !== id) throw unavailable();
    return result;
  }
  return {
    configured: () => !!environment.token()?.trim(),
    list: async () => {
      const scope = context();
      return cached(scope, "players", 300000, async () => {
        const organizationId = await organization(scope);
        const players: OnSignPlayerOption[] = [], cursors = new Set<string>(), ids = new Set<string>();
        let after: string | null = null;
        const signal = AbortSignal.timeout(5000);
        for (let page = 0; page < 100; page++) {
          const root = await query(`query Players($organizationId: ID!, $after: String) { organizations(first: 1, ids: [$organizationId]) { nodes { id players(first: 100, after: $after) { nodes { id name } pageInfo { hasNextPage endCursor } } } } }`, { organizationId, after }, scope.credential, signal);
          const data = scopedOrganization(root, organizationId);
          const connection = object(data.players), pageInfo = object(connection.pageInfo);
          if (!Array.isArray(connection.nodes) || typeof pageInfo.hasNextPage !== "boolean") throw unavailable();
          for (const item of connection.nodes) { const next = option(item); if (!ids.has(next.id)) { players.push(next); ids.add(next.id); } }
          if (!pageInfo.hasNextPage) return { players: players.sort((a, b) => a.name.localeCompare(b.name)), fetchedAt: new Date(environment.now()).toISOString() };
          const cursor = text(pageInfo.endCursor);
          if (!cursor || cursors.has(cursor)) throw unavailable();
          cursors.add(cursor); after = cursor;
        }
        throw new OnSignApiError("The OnSign player list is too large. Contact your administrator.");
      });
    },
    details: async (id: string): Promise<OnSignDetails> => {
      if (!validOnSignPlayerId(id)) throw new OnSignApiError("Choose a valid OnSign player.", 400);
      const scope = context();
      return cached(scope, `player:${id}`, 60000, async () => {
        const organizationId = await organization(scope);
        const root = await query(`query Player($organizationId: ID!, $id: ID!) { organizations(first: 1, ids: [$organizationId]) { nodes { id player(id: $id) {
          id name isConnected lastSeen lastSync syncProgress errorCount warningCount
          model version osVersion timezone signalStrength isInMaintenance isDetached
          network { name inet ssid status rssi }
        } } } }`, { organizationId, id }, scope.credential, AbortSignal.timeout(5000));
        const data = scopedOrganization(root, organizationId);
        if (data.player === null) throw new OnSignApiError("This player was not found in the selected Sephora organization. Check its link in Edit screen.", 404);
        const result = player(data.player);
        if (result.id !== id) throw unavailable();
        return { player: result, fetchedAt: new Date(environment.now()).toISOString() };
      });
    },
    section: async (id: string, section: OnSignSection, after: string | null = null, loop: OnSignLoop = "PRIMARY", groupId: string | null = null): Promise<OnSignSectionResult> => {
      if (!validOnSignPlayerId(id) || !onSignSections.includes(section) || !onSignLoops.includes(loop)
        || (after !== null && (!after || after.length > 2048)) || (groupId !== null && !validOnSignPlayerId(groupId))
        || (groupId !== null && section !== "content") || (section === "extended" && after !== null)) {
        throw new OnSignApiError("Choose valid OnSign detail options.", 400);
      }
      const scope = context();
      return cached(scope, JSON.stringify(["section", id, section, after, loop, groupId]), 60000, async () => {
        const organizationId = await organization(scope), signal = AbortSignal.timeout(5000);
        const variables = { organizationId, id, after, loop, groupId };
        if (groupId) {
          // A group is reachable only through the linked player's membership,
          // even when the token can read other groups in the same organization.
          let cursor: string | null = null, found = false;
          const cursors = new Set<string>();
          for (let page = 0; page < 100; page++) {
            const data = await query(`query PlayerMembership($organizationId: ID!, $id: ID!, $after: String) { organizations(first: 1, ids: [$organizationId]) { nodes { id player(id: $id) { id playerGroups(first: 100, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } } } } }`, { organizationId, id, after: cursor }, scope.credential, signal);
            const groups = connection(scopedPlayer(data, organizationId, id).playerGroups);
            if (groups.nodes.some(group => group.id === groupId)) { found = true; break; }
            if (!groups.pageInfo.hasNextPage) break;
            const next = groups.pageInfo.endCursor!;
            if (cursors.has(next)) throw unavailable();
            cursors.add(next); cursor = next;
          }
          if (!found) throw new OnSignApiError("This group does not belong to the linked player.", 404);
        }
        const selection = section === "extended" ? extendedPlayerFields : section === "content"
          ? `loop(name: $loop) { id kind ${loop === "TRIGGER" ? loopTriggers : loopItems} }` : relatedSelections[section];
        const args = section === "extended" ? "" : section === "content" ? ", $after: String, $loop: PlayerLoopType!" : ", $after: String";
        const target = groupId ? "playerGroup(id: $groupId)" : "player(id: $id)";
        const identifier = groupId ? "$groupId: ID!" : "$id: ID!";
        const root = await query(`query PlayerSection($organizationId: ID!, ${identifier}${args}) { organizations(first: 1, ids: [$organizationId]) { nodes { id ${target} { id ${selection} } } } }`, variables, scope.credential, signal);
        const result = groupId ? object(scopedOrganization(root, organizationId).playerGroup) : scopedPlayer(root, organizationId, id);
        if (groupId && result.id !== groupId) throw unavailable();
        const fetchedAt = new Date(environment.now()).toISOString();
        if (section === "extended") {
          const { id: _id, ...extra } = result;
          void _id;
          return { section, fetchedAt, values: values(extra), nodes: [], totalCount: null, pageInfo: { hasNextPage: false, endCursor: null } };
        }
        const list = section === "content" ? result.loop === null ? null : object(result.loop)[loop === "TRIGGER" ? "triggers" : "items"] : result[{ alerts: "activeAlerts", captures: "screenCaptures", groups: "playerGroups" }[section]];
        return { section, fetchedAt, values: section === "content" && result.loop ? { loopId: text(object(result.loop).id), kind: text(object(result.loop).kind) } : null,
          ...(list === null ? { nodes: [], totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null } } : connection(list, section === "content" && loop !== "TRIGGER")) };
      });
    },
  };
}

export const onSignApi = createOnSignClient({ token: () => process.env.ONSIGN_API_TOKEN, organizationId: () => process.env.ONSIGN_ORGANIZATION_ID, fetch: (...args) => fetch(...args), now: Date.now });
