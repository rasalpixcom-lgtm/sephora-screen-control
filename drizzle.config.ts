import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // Draft SQL stays outside the directory consumed by the migration runner.
  out: "./.server-runtime/postgres-migration-drafts",
  schema: "./db/postgres-schema.ts",
  dialect: "postgresql",
});
