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
