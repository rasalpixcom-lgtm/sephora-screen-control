import { database, type ServerDatabase } from "@/lib/database";
export { database } from "@/lib/database";

import type { LocationDetails } from "@/lib/location-details";
import type { ScreenType } from "@/lib/screen-type";

export type EntityType = "country" | "region" | "store" | "screen" | "group";
export type Entity = { id: string; type: EntityType; name: string; shortName?: string | null; onsignPlayerId?: string | null; photoKey?: string | null; screenType?: ScreenType | null; parentId: string | null; liveUrl: string | null; isDemo: number; createdAt: string };
export type Member = { groupId: string; screenId: string };
export type Selection = { countryId?: string; regionId?: string; storeId?: string; groupId?: string; screenIds?: string[] };
export type Display = { selection: Selection; autoAdvance: boolean; intervalSeconds: number; updatedAt: string };
export type Activity = { id: string; action: string; entityType: string | null; entityId: string | null; entityName: string | null; actor: string; createdAt: string };
export type LocationPhoto = { id: string; locationId: string; position: number; label: string };

export async function readState(db: ServerDatabase = database(), includeActivity = true, includeLocationPhotos = true) {
  // A transaction uses one pg client; concurrent client.query calls are deprecated.
  const entitiesResult = await db.prepare("SELECT id, type, name, short_name AS \"shortName\", onsign_player_id AS \"onsignPlayerId\", photo_key AS \"photoKey\", screen_type AS \"screenType\", parent_id AS \"parentId\", live_url AS \"liveUrl\", is_demo AS \"isDemo\", created_at AS \"createdAt\" FROM entities ORDER BY created_at, name").all<Entity>();
  const locationDetailsResult = includeLocationPhotos ? await db.prepare("SELECT location_id AS \"locationId\", fields, version FROM location_details").all<LocationDetails & { locationId: string }>() : { results: [] };
  const locationDetails = Object.fromEntries(locationDetailsResult.results.map(({ locationId, fields, version }) => [locationId, { fields, version }]));
  const membersResult = await db.prepare("SELECT group_id AS \"groupId\", screen_id AS \"screenId\" FROM group_members").all<Member>();
  const locationPhotosResult = includeLocationPhotos ? await db.prepare("SELECT id, location_id AS \"locationId\", position, label FROM location_photos ORDER BY location_id, position").all<LocationPhoto>() : { results: [] as LocationPhoto[] };
  const displayResult = await db.prepare("SELECT selection, auto_advance AS \"autoAdvance\", interval_seconds AS \"intervalSeconds\", updated_at AS \"updatedAt\" FROM display_state WHERE id = 'main'").first<{selection:string;autoAdvance:number;intervalSeconds:number;updatedAt:string}>();
  const activityResult = includeActivity ? await db.prepare("SELECT id, action, entity_type AS \"entityType\", entity_id AS \"entityId\", entity_name AS \"entityName\", actor, created_at AS \"createdAt\" FROM activity_log ORDER BY created_at DESC LIMIT 60").all<Activity>() : { results: [] as Activity[] };
  const display: Display = displayResult ? {
    selection: JSON.parse(displayResult.selection), autoAdvance: !!displayResult.autoAdvance,
    intervalSeconds: displayResult.intervalSeconds, updatedAt: displayResult.updatedAt,
  } : { selection: {}, autoAdvance: true, intervalSeconds: 10, updatedAt: "" };
  return { entities: entitiesResult.results, members: membersResult.results, locationPhotos: locationPhotosResult.results, locationDetails, display, activity: activityResult.results };
}
