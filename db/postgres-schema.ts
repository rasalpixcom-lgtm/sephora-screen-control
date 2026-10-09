import { pgTable, text, integer, boolean, timestamp, bigint, primaryKey, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const entities = pgTable("entities", { id: text("id").primaryKey(), type: text("type").notNull(), name: text("name").notNull(), parentId: text("parent_id"), liveUrl: text("live_url"), isDemo: integer("is_demo").notNull().default(0), createdAt: text("created_at").notNull() });
export const groupMembers = pgTable("group_members", { groupId: text("group_id").notNull(), screenId: text("screen_id").notNull() }, (table) => [primaryKey({ columns: [table.groupId, table.screenId] })]);
export const displayState = pgTable("display_state", { id: text("id").primaryKey(), selection: text("selection").notNull(), autoAdvance: integer("auto_advance").notNull().default(1), intervalSeconds: integer("interval_seconds").notNull().default(10), updatedAt: text("updated_at").notNull() });
export const activityLog = pgTable("activity_log", { id: text("id").primaryKey(), action: text("action").notNull(), entityType: text("entity_type"), entityId: text("entity_id"), entityName: text("entity_name"), actor: text("actor").notNull(), createdAt: text("created_at").notNull() });
export const user = pgTable("auth_user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(), emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(), role: text("role").notNull().default("wall"), disabled: boolean("disabled").notNull().default(true),
});
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
