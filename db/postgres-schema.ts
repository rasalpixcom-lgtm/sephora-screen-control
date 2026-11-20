import { pgTable, text, integer, boolean, timestamp, bigint, jsonb, primaryKey, index, uniqueIndex, check, customType, pgPolicy, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Runtime roles select one active client through pixcom_workspace().
// SQL migration 0026 also forces RLS and makes ownership FKs initially deferred;
// those PostgreSQL options are not represented by these Drizzle declarations.
export const clients = pgTable("clients", {
  id: text("id").primaryKey(), slug: text("slug").notNull().unique(), name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, table => [
  check("clients_slug_check", sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(${table.slug}) <= 80`),
  check("clients_name_check", sql`${table.name} = btrim(${table.name}) AND char_length(${table.name}) BETWEEN 1 AND 120`),
]);
const clientOwnership = () => text("client_id").notNull().default(sql`COALESCE(pixcom_workspace(), 'sephora')`).references(() => clients.id, { onDelete: "restrict" });

const privateBytes = customType<{ data: Buffer; driverData: Buffer }>({ dataType() { return "bytea"; } });
// Optional small client logos are included in the database backup.
export const clientLogos = pgTable("client_logos", {
  clientId: text("client_id").primaryKey().references(() => clients.id, { onDelete: "restrict" }),
  version: text("version").notNull(), image: privateBytes("image"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), updatedBy: text("updated_by").notNull(),
}, table => [check("client_logos_version_check", sql`${table.version} ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'`),check("client_logos_image_check", sql`${table.image} IS NULL OR octet_length(${table.image}) BETWEEN 1 AND 524288`)]);
export const clientBackgrounds = pgTable("client_backgrounds", {
  clientId: text("client_id").primaryKey().references(() => clients.id, { onDelete: "restrict" }),
  version: text("version").notNull(), image: privateBytes("image"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), updatedBy: text("updated_by").notNull(),
}, table => [check("client_backgrounds_version_check", sql`${table.version} ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'`),check("client_backgrounds_image_check", sql`${table.image} IS NULL OR octet_length(${table.image}) BETWEEN 1 AND 2097152`)]);
export const cmsUpdates = pgTable("cms_updates", { clientId: clientOwnership(),
  id: text("id").primaryKey(), version: text("version").notNull(), payload: jsonb("payload").notNull(), image: privateBytes("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), updatedBy: text("updated_by").notNull(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  uniqueIndex("cms_updates_client_id_idx").on(table.clientId, table.id),
  index("cms_updates_client_idx").on(table.clientId), index("cms_updates_updated_idx").on(table.updatedAt.desc(), table.id), check("cms_updates_payload_check", sql`jsonb_typeof(${table.payload}) = 'object'`), check("cms_updates_image_check", sql`${table.image} IS NULL OR octet_length(${table.image}) <= 5242880`)]).enableRLS();
export const cmsReports = pgTable("cms_reports", { clientId: clientOwnership(),
  id: text("id").primaryKey(), updateId: text("update_id").notNull().references(() => cmsUpdates.id), revision: integer("revision").notNull(), sourceVersion: text("source_version").notNull(), pdf: privateBytes("pdf").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), createdBy: text("created_by").notNull(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "cms_reports_update_id_owner_fk", columns: [table.clientId, table.updateId], foreignColumns: [cmsUpdates.clientId, cmsUpdates.id] }).onDelete("no action"),
  index("cms_reports_client_idx").on(table.clientId), check("cms_reports_revision_check", sql`${table.revision} > 0`), check("cms_reports_pdf_check", sql`octet_length(${table.pdf}) <= 10485760`), uniqueIndex("cms_reports_update_revision_idx").on(table.updateId, table.revision), uniqueIndex("cms_reports_update_version_idx").on(table.updateId, table.sourceVersion)]).enableRLS();

export const entities = pgTable("entities", { clientId: clientOwnership(), id: text("id").primaryKey(), type: text("type").notNull(), name: text("name").notNull(), shortName: text("short_name"), parentId: text("parent_id"), liveUrl: text("live_url"), onsignPlayerId: text("onsign_player_id"), photoKey: text("photo_key"), screenType: text("screen_type"), isDemo: integer("is_demo").notNull().default(0), createdAt: text("created_at").notNull() }, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  uniqueIndex("entities_client_id_idx").on(table.clientId, table.id),
  foreignKey({ name: "entities_parent_id_owner_fk", columns: [table.clientId, table.parentId], foreignColumns: [table.clientId, table.id] }).onDelete("no action"),
  index("entities_client_idx").on(table.clientId),
  check("entities_screen_type_check", sql`${table.screenType} IS NULL OR (${table.type} = 'screen' AND ${table.screenType} IN ('LED', 'LCD', 'Video Wall'))`),
  check("entities_photo_screen", sql`${table.photoKey} IS NULL OR (${table.type} = 'screen' AND ${table.photoKey} ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')`),
  uniqueIndex("entities_photo_key_idx").on(table.photoKey).where(sql`${table.photoKey} IS NOT NULL`),
  check("entities_onsign_player_screen", sql`${table.onsignPlayerId} IS NULL OR (${table.type} = 'screen' AND length(${table.onsignPlayerId}) BETWEEN 1 AND 256 AND ${table.onsignPlayerId} !~ '[[:space:][:cntrl:]]')`),
  check("entities_country_short_name_check", sql`${table.shortName} IS NULL OR (${table.type} = 'country' AND ${table.shortName} = btrim(${table.shortName}) AND char_length(${table.shortName}) BETWEEN 1 AND 12)`),
  uniqueIndex("entities_country_short_name_idx").on(table.clientId, sql`lower(${table.shortName})`).where(sql`${table.type} = 'country' AND ${table.shortName} IS NOT NULL`),
]).enableRLS();
export const screenReferencePhotos = pgTable("screen_reference_photos", { clientId: clientOwnership(),
  screenId: text("screen_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  category: text("category").notNull(), photoKey: text("photo_key").notNull().unique(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "screen_reference_photos_screen_id_owner_fk", columns: [table.clientId, table.screenId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("screen_reference_photos_client_idx").on(table.clientId), primaryKey({ columns: [table.screenId, table.category] }),
  check("screen_reference_photos_category_check", sql`${table.category} IN ('serial', 'issues', 'back_cabling', 'looping_diagram', 'sending_card', 'media_player', 'power_network', 'connection_diagram')`),
  check("screen_reference_photos_photo_key_check", sql`${table.photoKey} ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'`),
]).enableRLS();
export const groupMembers = pgTable("group_members", { clientId: clientOwnership(), groupId: text("group_id").notNull(), screenId: text("screen_id").notNull() }, (table) => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "group_members_group_id_owner_fk", columns: [table.clientId, table.groupId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  foreignKey({ name: "group_members_screen_id_owner_fk", columns: [table.clientId, table.screenId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("group_members_client_idx").on(table.clientId), primaryKey({ columns: [table.groupId, table.screenId] })]).enableRLS();
export const screenHardwareSections = pgTable("screen_hardware_sections", { clientId: clientOwnership(),
  screenId: text("screen_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  fields: jsonb("fields").$type<Record<string, string>>().notNull(),
  version: text("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "screen_hardware_sections_screen_id_owner_fk", columns: [table.clientId, table.screenId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("screen_hardware_sections_client_idx").on(table.clientId),
  primaryKey({ columns: [table.screenId, table.section] }),
  check("screen_hardware_section_check", sql`${table.section} IN ('ledDisplay', 'ledController', 'mediaPlayer', 'powerNetwork', 'lcd', 'video_wall')`),
  check("screen_hardware_fields_check", sql`jsonb_typeof(${table.fields}) = 'object'`),
]).enableRLS();
export const screenNotes = pgTable("screen_notes", { clientId: clientOwnership(),
  screenId: text("screen_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  version: text("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "screen_notes_screen_id_owner_fk", columns: [table.clientId, table.screenId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("screen_notes_client_idx").on(table.clientId), check("screen_notes_length_check", sql`char_length(${table.note}) <= 4000`)]).enableRLS();
export const screenPpmInspections = pgTable("screen_ppm_inspections", { clientId: clientOwnership(),
  screenId: text("screen_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
  version: text("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "screen_ppm_inspections_screen_id_owner_fk", columns: [table.clientId, table.screenId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("screen_ppm_inspections_client_idx").on(table.clientId), check("screen_ppm_inspections_fields_check", sql`jsonb_typeof(${table.fields}) = 'object'`)]).enableRLS();
export const screenRemoteAccess = pgTable("screen_remote_access", { clientId: clientOwnership(),
  screenId: text("screen_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  teamViewerId: text("teamviewer_id").notNull(), anyDeskId: text("anydesk_id").notNull(),
  version: text("version").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "screen_remote_access_screen_id_owner_fk", columns: [table.clientId, table.screenId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("screen_remote_access_client_idx").on(table.clientId),
  check("screen_remote_access_teamviewer_id_check", sql`${table.teamViewerId} = '' OR ${table.teamViewerId} ~ '^[0-9]{1,32}$'`),
  check("screen_remote_access_anydesk_id_check", sql`${table.anyDeskId} = '' OR ${table.anyDeskId} ~ '^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$'`),
]).enableRLS();
export const locationDetails = pgTable("location_details", { clientId: clientOwnership(),
  locationId: text("location_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
  version: text("version").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "location_details_location_id_owner_fk", columns: [table.clientId, table.locationId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("location_details_client_idx").on(table.clientId), check("location_details_fields_check", sql`jsonb_typeof(${table.fields}) = 'object'`)]).enableRLS();
export const locationPhotos = pgTable("location_photos", { clientId: clientOwnership(),
  id: text("id").primaryKey(),
  locationId: text("location_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "location_photos_location_id_owner_fk", columns: [table.clientId, table.locationId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("location_photos_client_idx").on(table.clientId),
  uniqueIndex("location_photos_location_position_idx").on(table.locationId, table.position),
  check("location_photos_id_check", sql`${table.id} ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'`),
  check("location_photos_position_check", sql`${table.position} BETWEEN 0 AND 4`),
  check("location_photos_label_check", sql`char_length(${table.label}) <= 80`),
]).enableRLS();
export const displayState = pgTable("display_state", { clientId: clientOwnership(), id: text("id").notNull(), selection: text("selection").notNull(), autoAdvance: integer("auto_advance").notNull().default(1), intervalSeconds: integer("interval_seconds").notNull().default(10), updatedAt: text("updated_at").notNull() }, table => [
  primaryKey({ columns: [table.clientId, table.id] }),
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  index("display_state_client_idx").on(table.clientId)]).enableRLS();
export const activityLog = pgTable("activity_log", { clientId: clientOwnership(), id: text("id").primaryKey(), action: text("action").notNull(), entityType: text("entity_type"), entityId: text("entity_id"), entityName: text("entity_name"), actor: text("actor").notNull(), createdAt: text("created_at").notNull() }, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  index("activity_log_client_idx").on(table.clientId)]).enableRLS();
export const user = pgTable("auth_user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(), emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(), role: text("role").notNull().default("controller"), disabled: boolean("disabled").notNull().default(true),
}, table => [check("auth_user_supported_roles", sql`${table.role} IN ('admin', 'controller') OR (${table.role} = 'wall' AND ${table.disabled} = true)`)]);
// Legacy mappings are retained for migration history; access uses auth_user.role.
export const platformAdministrators = pgTable("platform_administrators", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const clientManagementActivity = pgTable("client_management_activity", {
  id: text("id").primaryKey(), actorId: text("actor_id").notNull(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  action: text("action").notNull(), details: jsonb("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("client_management_activity_client_idx").on(table.clientId, table.createdAt),
  check("client_management_activity_action_check", sql`${table.action} IN ('create','assign','set_logo','remove_logo','set_background','remove_background','set_onsign','rename')`)]);

export const clientMemberships = pgTable("client_memberships", {
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
}, table => [
  primaryKey({ columns: [table.clientId, table.userId] }),
  index("client_memberships_user_idx").on(table.userId),
  check("client_memberships_role_check", sql`${table.role} IN ('admin', 'controller')`),
]);
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
export const monitorAccess = pgTable("monitor_access", { clientId: clientOwnership(),
  id: text("id").notNull(), tokenHash: text("token_hash"), generation: text("generation").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [
  primaryKey({ columns: [table.clientId, table.id] }),
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  index("monitor_access_client_idx").on(table.clientId), check("monitor_access_singleton", sql`${table.id} = 'main'`)]).enableRLS();
export const previewScreenState = pgTable("preview_screen_state", { clientId: clientOwnership(),
  screenId: text("screen_id").primaryKey().references(() => entities.id, { onDelete: "cascade" }),
  sourceFingerprint: text("source_fingerprint").notNull(),
  status: text("status").notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "preview_screen_state_screen_id_owner_fk", columns: [table.clientId, table.screenId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("preview_screen_state_client_idx").on(table.clientId), check("preview_screen_state_status", sql`${table.status} IN ('available', 'unavailable')`)]).enableRLS();
export const previewIncident = pgTable("preview_incident", { clientId: clientOwnership(),
  id: text("id").primaryKey(),
  screenId: text("screen_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  sourceFingerprint: text("source_fingerprint").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionReason: text("resolution_reason"),
}, table => [
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  uniqueIndex("preview_incident_client_id_idx").on(table.clientId, table.id),
  foreignKey({ name: "preview_incident_screen_id_owner_fk", columns: [table.clientId, table.screenId], foreignColumns: [entities.clientId, entities.id] }).onDelete("cascade"),
  index("preview_incident_client_idx").on(table.clientId),
  uniqueIndex("preview_incident_one_open_per_screen_idx").on(table.screenId).where(sql`${table.resolvedAt} IS NULL`),
  index("preview_incident_screen_idx").on(table.screenId),
  index("preview_incident_open_started_idx").on(table.resolvedAt, table.startedAt),
  check("preview_incident_resolution_reason", sql`${table.resolutionReason} IS NULL OR ${table.resolutionReason} IN ('recovered', 'configuration_changed')`),
]).enableRLS();

export const emailAlertSettings = pgTable("email_alert_settings", { clientId: clientOwnership(),
  id:text("id").notNull(),enabled:boolean("enabled").notNull().default(false),
  thresholdMinutes:integer("threshold_minutes").notNull().default(20),groupingMinutes:integer("grouping_minutes").notNull().default(5),
  recoveryEmail:boolean("recovery_email").notNull().default(false),recipients:jsonb("recipients").$type<string[]>().notNull().default(sql`'[]'`),
  revision:text("revision").notNull().default(sql`gen_random_uuid()::text`),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[
  primaryKey({ columns: [table.clientId, table.id] }),
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  index("email_alert_settings_client_idx").on(table.clientId),
  check("email_alert_settings_id_check",sql`${table.id} = 'main'`),
  check("email_alert_settings_threshold_minutes_check",sql`${table.thresholdMinutes} BETWEEN 1 AND 1440`),
  check("email_alert_settings_grouping_minutes_check",sql`${table.groupingMinutes} BETWEEN 1 AND 60`),
  check("email_alert_settings_recipients_check",sql`jsonb_typeof(${table.recipients}) = 'array' AND jsonb_array_length(${table.recipients}) <= 20`),
]).enableRLS();
export const emailAlertDelivery=pgTable("email_alert_delivery",{ clientId: clientOwnership(),
  id:text("id").primaryKey(),kind:text("kind").notNull(),status:text("status").notNull(),recipients:jsonb("recipients").$type<string[]>().notNull(),
  screenCount:integer("screen_count").notNull(),startedAt:timestamp("started_at",{withTimezone:true}).notNull(),finishedAt:timestamp("finished_at",{withTimezone:true}),errorCode:text("error_code"),
},table=>[
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  uniqueIndex("email_alert_delivery_client_id_idx").on(table.clientId, table.id),
  index("email_alert_delivery_client_idx").on(table.clientId),
  index("email_alert_delivery_started_idx").on(table.startedAt.desc()),
  check("email_alert_delivery_kind_check",sql`${table.kind} IN ('unavailable','recovery','test','manual')`),
  check("email_alert_delivery_status_check",sql`${table.status} IN ('sending','sent','partial','failed','uncertain')`),
]).enableRLS();
export const emailAlertQueue=pgTable("email_alert_queue",{ clientId: clientOwnership(),
  id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>previewIncident.id,{onDelete:"cascade"}),kind:text("kind").notNull(),status:text("status").notNull().default("pending"),
  queuedAt:timestamp("queued_at",{withTimezone:true}).notNull(),retryAt:timestamp("retry_at",{withTimezone:true}),attempts:integer("attempts").notNull().default(0),deliveryId:text("delivery_id").references(()=>emailAlertDelivery.id),
},table=>[
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "email_alert_queue_incident_id_owner_fk", columns: [table.clientId, table.incidentId], foreignColumns: [previewIncident.clientId, previewIncident.id] }).onDelete("cascade"),
  foreignKey({ name: "email_alert_queue_delivery_id_owner_fk", columns: [table.clientId, table.deliveryId], foreignColumns: [emailAlertDelivery.clientId, emailAlertDelivery.id] }).onDelete("no action"),
  index("email_alert_queue_client_idx").on(table.clientId),
  uniqueIndex("email_alert_queue_incident_id_kind_key").on(table.incidentId,table.kind),
  index("email_alert_queue_pending_idx").on(table.kind,table.queuedAt).where(sql`${table.status} = 'pending'`),
  check("email_alert_queue_kind_check",sql`${table.kind} IN ('unavailable','recovery')`),
  check("email_alert_queue_status_check",sql`${table.status} IN ('pending','sending','sent','cancelled','failed','uncertain')`),
]).enableRLS();

export const whatsappAlertSettings = pgTable("whatsapp_alert_settings", { clientId: clientOwnership(),
  id:text("id").notNull(),enabled:boolean("enabled").notNull().default(false),
  thresholdMinutes:integer("threshold_minutes").notNull().default(20),groupingMinutes:integer("grouping_minutes").notNull().default(5),
  recoveryEmail:boolean("recovery_email").notNull().default(false),recipients:jsonb("recipients").$type<string[]>().notNull().default(sql`'[]'`),
  revision:text("revision").notNull().default(sql`gen_random_uuid()::text`),updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[
  primaryKey({ columns: [table.clientId, table.id] }),
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  index("whatsapp_alert_settings_client_idx").on(table.clientId),
  check("whatsapp_alert_settings_id_check",sql`${table.id} = 'main'`),
  check("whatsapp_alert_settings_threshold_minutes_check",sql`${table.thresholdMinutes} BETWEEN 1 AND 1440`),
  check("whatsapp_alert_settings_grouping_minutes_check",sql`${table.groupingMinutes} BETWEEN 1 AND 60`),
  check("whatsapp_alert_settings_recipients_check",sql`jsonb_typeof(${table.recipients}) = 'array' AND jsonb_array_length(${table.recipients}) <= 20`),
]).enableRLS();

export const whatsappAlertDelivery=pgTable("whatsapp_alert_delivery",{ clientId: clientOwnership(),
 id:text("id").primaryKey(),batchId:text("batch_id").notNull(),recipient:text("recipient").notNull(),kind:text("kind").notNull(),status:text("status").notNull().default("pending"),
 incidentIds:jsonb("incident_ids").$type<string[]>().notNull().default(sql`'[]'`),screenCount:integer("screen_count").notNull().default(0),
 queuedAt:timestamp("queued_at",{withTimezone:true}).notNull(),finishedAt:timestamp("finished_at",{withTimezone:true}),errorCode:text("error_code"),providerId:text("provider_id"),
},table=>[
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  uniqueIndex("whatsapp_alert_delivery_client_id_idx").on(table.clientId, table.id),
  index("whatsapp_alert_delivery_client_idx").on(table.clientId),
 index("whatsapp_alert_delivery_queued_idx").on(table.queuedAt.desc()),index("whatsapp_alert_delivery_pending_idx").on(table.queuedAt).where(sql`${table.status} = 'pending'`),
 check("whatsapp_alert_delivery_kind_check",sql`${table.kind} IN ('unavailable','recovery','test','manual')`),
 check("whatsapp_alert_delivery_status_check",sql`${table.status} IN ('pending','sending','accepted','failed','uncertain','cancelled')`),
]).enableRLS();
export const whatsappAlertQueue=pgTable("whatsapp_alert_queue",{ clientId: clientOwnership(),
 id:text("id").primaryKey(),incidentId:text("incident_id").notNull().references(()=>previewIncident.id,{onDelete:"cascade"}),recipient:text("recipient").notNull(),kind:text("kind").notNull(),status:text("status").notNull().default("pending"),
 queuedAt:timestamp("queued_at",{withTimezone:true}).notNull(),retryAt:timestamp("retry_at",{withTimezone:true}),attempts:integer("attempts").notNull().default(0),deliveryId:text("delivery_id").references(()=>whatsappAlertDelivery.id),
},table=>[
  pgPolicy("client_workspace", { to: "public", for: "all", using: sql`${table.clientId} = pixcom_workspace()`, withCheck: sql`${table.clientId} = pixcom_workspace()` }),
  foreignKey({ name: "whatsapp_alert_queue_incident_id_owner_fk", columns: [table.clientId, table.incidentId], foreignColumns: [previewIncident.clientId, previewIncident.id] }).onDelete("cascade"),
  foreignKey({ name: "whatsapp_alert_queue_delivery_id_owner_fk", columns: [table.clientId, table.deliveryId], foreignColumns: [whatsappAlertDelivery.clientId, whatsappAlertDelivery.id] }).onDelete("no action"),
  index("whatsapp_alert_queue_client_idx").on(table.clientId),
 uniqueIndex("whatsapp_alert_queue_incident_id_kind_recipient_key").on(table.incidentId,table.kind,table.recipient),
 index("whatsapp_alert_queue_pending_idx").on(table.recipient,table.kind,table.queuedAt).where(sql`${table.status} = 'pending'`),
 check("whatsapp_alert_queue_kind_check",sql`${table.kind} IN ('unavailable','recovery')`),
 check("whatsapp_alert_queue_status_check",sql`${table.status} IN ('pending','scheduled','accepted','cancelled','uncertain')`),
]).enableRLS();

export const commonMonitorAccess = pgTable("common_monitor_access", {
  id: text("id").primaryKey(), tokenHash: text("token_hash"), generation: text("generation").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(), updatedBy: text("updated_by").notNull(),
}, table => [check("common_monitor_access_id_check", sql`${table.id} = 'main'`),
  check("common_monitor_access_token_hash_check", sql`${table.tokenHash} IS NULL OR ${table.tokenHash} ~ '^[a-f0-9]{64}$'`)]);

export const commonMonitorDisplay = pgTable("common_monitor_display", {
  id: text("id").primaryKey(), clientId: text("client_id").notNull().references(() => clients.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), updatedBy: text("updated_by"),
}, table => [check("common_monitor_display_id_check", sql`${table.id} = 'main'`)]);

export const clientOnSignSettings = pgTable("client_onsign_settings", {
  clientId: text("client_id").primaryKey().references(() => clients.id, { onDelete: "restrict" }),
  version: text("version").notNull(), mode: text("mode").notNull(),
  organizationId: text("organization_id"), encryptedToken: text("encrypted_token"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(), updatedBy: text("updated_by").notNull(),
}, table => [
  check("client_onsign_settings_version_check", sql`${table.version} ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'`),
  check("client_onsign_settings_mode_check", sql`${table.mode} IN ('custom','disabled','server')`),
  check("client_onsign_settings_check", sql`(${table.mode}='custom' AND ${table.encryptedToken} IS NOT NULL
    AND length(${table.encryptedToken}) BETWEEN 1 AND 20000 AND ${table.encryptedToken} LIKE 'v1.%'
    AND (${table.organizationId} IS NULL OR (length(${table.organizationId}) BETWEEN 1 AND 256 AND ${table.organizationId} !~ '[[:space:][:cntrl:]]'))
    AND (${table.clientId}='sephora' OR ${table.organizationId} IS NOT NULL))
    OR (${table.mode} IN ('disabled','server') AND ${table.encryptedToken} IS NULL AND ${table.organizationId} IS NULL)`),
]);
