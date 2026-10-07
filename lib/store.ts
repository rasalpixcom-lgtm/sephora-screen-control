import { env } from "cloudflare:workers";

export type EntityType = "country" | "region" | "store" | "screen" | "group";
export type Entity = { id: string; type: EntityType; name: string; parentId: string | null; liveUrl: string | null; isDemo: number; createdAt: string };
export type Member = { groupId: string; screenId: string };
export type Selection = { countryId?: string; regionId?: string; storeId?: string; groupId?: string; screenIds?: string[] };
export type Display = { selection: Selection; autoAdvance: boolean; intervalSeconds: number; updatedAt: string };
export type Activity = { id: string; action: string; entityType: string | null; entityId: string | null; entityName: string | null; actor: string; createdAt: string };

export function database(): D1Database {
  if (!env.DB) throw new Error("The screen database is unavailable.");
  return env.DB;
}

export async function readState() {
  const db = database();
  const [entitiesResult, membersResult, displayResult, activityResult] = await Promise.all([
    db.prepare("SELECT id, type, name, parent_id AS parentId, live_url AS liveUrl, is_demo AS isDemo, created_at AS createdAt FROM entities ORDER BY created_at, name").all<Entity>(),
    db.prepare("SELECT group_id AS groupId, screen_id AS screenId FROM group_members").all<Member>(),
    db.prepare("SELECT selection, auto_advance AS autoAdvance, interval_seconds AS intervalSeconds, updated_at AS updatedAt FROM display_state WHERE id = 'main'").first<{selection:string;autoAdvance:number;intervalSeconds:number;updatedAt:string}>(),
    db.prepare("SELECT id, action, entity_type AS entityType, entity_id AS entityId, entity_name AS entityName, actor, created_at AS createdAt FROM activity_log ORDER BY created_at DESC LIMIT 60").all<Activity>(),
  ]);
  const display: Display = displayResult ? {
    selection: JSON.parse(displayResult.selection), autoAdvance: !!displayResult.autoAdvance,
    intervalSeconds: displayResult.intervalSeconds, updatedAt: displayResult.updatedAt,
  } : { selection: {}, autoAdvance: true, intervalSeconds: 10, updatedAt: "" };
  return { entities: entitiesResult.results, members: membersResult.results, display, activity: activityResult.results };
}
