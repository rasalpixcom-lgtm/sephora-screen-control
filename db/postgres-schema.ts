import { pgTable, text, integer, boolean, timestamp, bigint, jsonb, primaryKey, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const entities = pgTable("entities", { id: text("id").primaryKey(), type: text("type").notNull(), name: text("name").notNull(), shortName: text("short_name"), parentId: text("parent_id"), liveUrl: text("live_url"), onsignPlayerId: text("onsign_player_id"), photoKey: text("photo_key"), isDemo: integer("is_demo").notNull().default(0), createdAt: text("created_at").notNull() }, table => [
  check("entities_photo_screen", sql`${table.photoKey} IS NULL OR (${table.type} = 'screen' AND ${table.photoKey} ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')`),
  uniqueIndex("entities_photo_key_idx").on(table.photoKey).where(sql`${table.photoKey} IS NOT NULL`),
  check("entities_onsign_player_screen", sql`${table.onsignPlayerId} IS NULL OR (${table.type} = 'screen' AND length(${table.onsignPlayerId}) BETWEEN 1 AND 256 AND ${table.onsignPlayerId} !~ '[[:space:][:cntrl:]]')`),
  check("entities_country_short_name_check", sql`${table.shortName} IS NULL OR (${table.type} = 'country' AND ${table.shortName} = btrim(${table.shortName}) AND char_length(${table.shortName}) BETWEEN 1 AND 12)`),
  uniqueIndex("entities_country_short_name_idx").on(sql`lower(${table.shortName})`).where(sql`${table.type} = 'country' AND ${table.shortName} IS NOT NULL`),
]);
export const groupMembers = pgTable("group_members", { groupId: text("group_id").notNull(), screenId: text("screen_id").notNull() }, (table) => [primaryKey({ columns: [table.groupId, table.screenId] })]);
export const screenHardwareSections = pgTable("screen_hardware_sections", {
  screenId: text("screen_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  fields: jsonb("fields").$type<Record<string, string>>().notNull(),
  version: text("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [
  primaryKey({ columns: [table.screenId, table.section] }),
  check("screen_hardware_section_check", sql`${table.section} IN ('ledDisplay', 'ledController', 'mediaPlayer', 'powerNetwork')`),
  check("screen_hardware_fields_check", sql`jsonb_typeof(${table.fields}) = 'object'`),
]);
export const screenNotes = pgTable("screen_notes", {
  screenId: text("screen_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  version: text("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [check("screen_notes_length_check", sql`char_length(${table.note}) <= 4000`)]);
export const screenRemoteAccess = pgTable("screen_remote_access", {
  screenId: text("screen_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  teamViewerId: text("teamviewer_id").notNull(), anyDeskId: text("anydesk_id").notNull(),
  version: text("version").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [
  check("screen_remote_access_teamviewer_id_check", sql`${table.teamViewerId} = '' OR ${table.teamViewerId} ~ '^[0-9]{1,32}$'`),
  check("screen_remote_access_anydesk_id_check", sql`${table.anyDeskId} = '' OR ${table.anyDeskId} ~ '^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$'`),
]);
export const locationPhotos = pgTable("location_photos", {
  id: text("id").primaryKey(),
  locationId: text("location_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("location_photos_location_position_idx").on(table.locationId, table.position),
  check("location_photos_id_check", sql`${table.id} ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'`),
  check("location_photos_position_check", sql`${table.position} BETWEEN 0 AND 4`),
  check("location_photos_label_check", sql`char_length(${table.label}) <= 80`),
]);
export const displayState = pgTable("display_state", { id: text("id").primaryKey(), selection: text("selection").notNull(), autoAdvance: integer("auto_advance").notNull().default(1), intervalSeconds: integer("interval_seconds").notNull().default(10), updatedAt: text("updated_at").notNull() });
export const activityLog = pgTable("activity_log", { id: text("id").primaryKey(), action: text("action").notNull(), entityType: text("entity_type"), entityId: text("entity_id"), entityName: text("entity_name"), actor: text("actor").notNull(), createdAt: text("created_at").notNull() });
export const user = pgTable("auth_user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(), emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(), role: text("role").notNull().default("controller"), disabled: boolean("disabled").notNull().default(true),
}, table => [check("auth_user_supported_roles", sql`${table.role} IN ('admin', 'controller') OR (${table.role} = 'wall' AND ${table.disabled} = true)`)]);
export const session = pgTable("auth_session", {
  id: text("id").primaryKey(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(), ipAddress: text("ip_address"), userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("auth_session_user_idx").on(table.userId), index("auth_session_expiry_idx").on(table.expiresAt)]);
export const account = pgTable("auth_account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"), accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }), refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }), scope: text("scope"), password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [index("auth_account_user_idx").on(table.userId)]);
export const verification = pgTable("auth_verification", { id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(), expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull() });
export const rateLimit = pgTable("auth_rate_limit", { id: text("id").primaryKey(), key: text("key").notNull().unique(), count: integer("count").notNull(), lastRequest: bigint("last_request", { mode: "number" }).notNull() });
export const bootstrap = pgTable("auth_bootstrap", { id: text("id").primaryKey() });
export const monitorAccess = pgTable("monitor_access", {
  id: text("id").primaryKey(), tokenHash: text("token_hash"), generation: text("generation").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [check("monitor_access_singleton", sql`${table.id} = 'main'`)]);
export const previewScreenState = pgTable("preview_screen_state", {
  screenId: text("screen_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  sourceFingerprint: text("source_fingerprint").notNull(),
  status: text("status").notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [check("preview_screen_state_status", sql`${table.status} IN ('available', 'unavailable')`)]);
export const previewIncident = pgTable("preview_incident", {
  id: text("id").primaryKey(),
  screenId: text("screen_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  sourceFingerprint: text("source_fingerprint").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionReason: text("resolution_reason"),
}, table => [
  uniqueIndex("preview_incident_one_open_per_screen_idx").on(table.screenId).where(sql`${table.resolvedAt} IS NULL`),
  index("preview_incident_screen_idx").on(table.screenId),
  index("preview_incident_open_started_idx").on(table.resolvedAt, table.startedAt),
  check("preview_incident_resolution_reason", sql`${table.resolutionReason} IS NULL OR ${table.resolutionReason} IN ('recovered', 'configuration_changed')`),
]);

export const emailAlertSettings = pgTable("email_alert_settings", {
  id:text("id").primaryKey(),enabled:boolean("enabled").notNull().default(false),
  thresholdMinutes:integer("threshold_minutes").notNull().default(20),groupingMinutes:integer("grouping_minutes").notNull().default(5),
  recoveryEmail:boolean("recovery_email").notNull().default(false),recipients:jsonb("recipients").$type<string[]>().notNull().default(sql`'[]'`),
  revision:text("revision").notNull().default(sql`gen_random_uuid()::text`),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[
  check("email_alert_settings_id_check",sql`${table.id} = 'main'`),
  check("email_alert_settings_threshold_minutes_check",sql`${table.thresholdMinutes} BETWEEN 1 AND 1440`),
  check("email_alert_settings_grouping_minutes_check",sql`${table.groupingMinutes} BETWEEN 1 AND 60`),
  check("email_alert_settings_recipients_check",sql`jsonb_typeof(${table.recipients}) = 'array' AND jsonb_array_length(${table.recipients}) <= 20`),
]);
export const emailAlertDelivery=pgTable("email_alert_delivery",{
  id:text("id").primaryKey(),kind:text("kind").notNull(),status:text("status").notNull(),recipients:jsonb("recipients").$type<string[]>().notNull(),
  screenCount:integer("screen_count").notNull(),startedAt:timestamp("started_at",{withTimezone:true}).notNull(),finishedAt:timestamp("finished_at",{withTimezone:true}),errorCode:text("error_code"),
},table=>[
  index("email_alert_delivery_started_idx").on(table.startedAt.desc()),
  check("email_alert_delivery_kind_check",sql`${table.kind} IN ('unavailable','recovery','test','manual')`),
  check("email_alert_delivery_status_check",sql`${table.status} IN ('sending','sent','partial','failed','uncertain')`),
]);
export const emailAlertQueue=pgTable("email_alert_queue",{
  id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>previewIncident.id,{onDelete:"cascade"}),kind:text("kind").notNull(),status:text("status").notNull().default("pending"),
  queuedAt:timestamp("queued_at",{withTimezone:true}).notNull(),retryAt:timestamp("retry_at",{withTimezone:true}),attempts:integer("attempts").notNull().default(0),deliveryId:text("delivery_id").references(()=>emailAlertDelivery.id),
},table=>[
  uniqueIndex("email_alert_queue_incident_id_kind_key").on(table.incidentId,table.kind),
  index("email_alert_queue_pending_idx").on(table.kind,table.queuedAt).where(sql`${table.status} = 'pending'`),
  check("email_alert_queue_kind_check",sql`${table.kind} IN ('unavailable','recovery')`),
  check("email_alert_queue_status_check",sql`${table.status} IN ('pending','sending','sent','cancelled','failed','uncertain')`),
]);

export const whatsappAlertSettings = pgTable("whatsapp_alert_settings", {
  id:text("id").primaryKey(),enabled:boolean("enabled").notNull().default(false),
  thresholdMinutes:integer("threshold_minutes").notNull().default(20),groupingMinutes:integer("grouping_minutes").notNull().default(5),
  recoveryEmail:boolean("recovery_email").notNull().default(false),recipients:jsonb("recipients").$type<string[]>().notNull().default(sql`'[]'`),
  revision:text("revision").notNull().default(sql`gen_random_uuid()::text`),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[
  check("whatsapp_alert_settings_id_check",sql`${table.id} = 'main'`),
  check("whatsapp_alert_settings_threshold_minutes_check",sql`${table.thresholdMinutes} BETWEEN 1 AND 1440`),
  check("whatsapp_alert_settings_grouping_minutes_check",sql`${table.groupingMinutes} BETWEEN 1 AND 60`),
  check("whatsapp_alert_settings_recipients_check",sql`jsonb_typeof(${table.recipients}) = 'array' AND jsonb_array_length(${table.recipients}) <= 20`),
]);

export const whatsappAlertDelivery=pgTable("whatsapp_alert_delivery",{
 id:text("id").primaryKey(),batchId:text("batch_id").notNull(),recipient:text("recipient").notNull(),kind:text("kind").notNull(),status:text("status").notNull().default("pending"),
 incidentIds:jsonb("incident_ids").$type<string[]>().notNull().default(sql`'[]'`),screenCount:integer("screen_count").notNull().default(0),
 queuedAt:timestamp("queued_at",{withTimezone:true}).notNull(),finishedAt:timestamp("finished_at",{withTimezone:true}),errorCode:text("error_code"),providerId:text("provider_id"),
},table=>[
 index("whatsapp_alert_delivery_queued_idx").on(table.queuedAt.desc()),index("whatsapp_alert_delivery_pending_idx").on(table.queuedAt).where(sql`${table.status} = 'pending'`),
 check("whatsapp_alert_delivery_kind_check",sql`${table.kind} IN ('unavailable','recovery','test','manual')`),
 check("whatsapp_alert_delivery_status_check",sql`${table.status} IN ('pending','sending','accepted','failed','uncertain','cancelled')`),
]);
export const whatsappAlertQueue=pgTable("whatsapp_alert_queue",{
 id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>previewIncident.id,{onDelete:"cascade"}),recipient:text("recipient").notNull(),kind:text("kind").notNull(),status:text("status").notNull().default("pending"),
 queuedAt:timestamp("queued_at",{withTimezone:true}).notNull(),retryAt:timestamp("retry_at",{withTimezone:true}),attempts:integer("attempts").notNull().default(0),deliveryId:text("delivery_id").references(()=>whatsappAlertDelivery.id),
},table=>[
 uniqueIndex("whatsapp_alert_queue_incident_id_kind_recipient_key").on(table.incidentId,table.kind,table.recipient),
 index("whatsapp_alert_queue_pending_idx").on(table.recipient,table.kind,table.queuedAt).where(sql`${table.status} = 'pending'`),
 check("whatsapp_alert_queue_kind_check",sql`${table.kind} IN ('unavailable','recovery')`),
 check("whatsapp_alert_queue_status_check",sql`${table.status} IN ('pending','scheduled','accepted','cancelled','uncertain')`),
]);
