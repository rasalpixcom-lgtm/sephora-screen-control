import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const entities = sqliteTable("entities", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  liveUrl: text("live_url"),
  isDemo: integer("is_demo").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const groupMembers = sqliteTable("group_members", {
  groupId: text("group_id").notNull(),
  screenId: text("screen_id").notNull(),
}, (table) => [primaryKey({ columns: [table.groupId, table.screenId] })]);

export const displayState = sqliteTable("display_state", {
  id: text("id").primaryKey(),
  selection: text("selection").notNull(),
  autoAdvance: integer("auto_advance").notNull().default(1),
  intervalSeconds: integer("interval_seconds").notNull().default(10),
  updatedAt: text("updated_at").notNull(),
});

export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  entityName: text("entity_name"),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull(),
});

export const user = sqliteTable("auth_user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false), image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  role: text("role").notNull().default("wall"), disabled: integer("disabled", { mode: "boolean" }).notNull().default(true),
});
export const session = sqliteTable("auth_session", {
  id: text("id").primaryKey(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});
export const account = sqliteTable("auth_account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }), refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"), password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const verification = sqliteTable("auth_verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const rateLimit = sqliteTable("auth_rate_limit", {
  id: text("id").primaryKey(), key: text("key").notNull().unique(), count: integer("count").notNull(), lastRequest: integer("last_request").notNull(),
});
export const bootstrap = sqliteTable("auth_bootstrap", { id: text("id").primaryKey() });
