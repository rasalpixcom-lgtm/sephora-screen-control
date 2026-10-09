// Local review only: read-only backup of Sephora, restoration into a disposable DB.
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pg from "pg";
const sourceUrl = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(sourceUrl.hostname) || sourceUrl.port !== "55432" || sourceUrl.pathname !== "/sephora") throw new Error("This review script only supports the separate local Sephora database on port 55432.");
const stamp = crypto.randomBytes(8).toString("hex");
const destination = "sephora_restore_review_" + stamp;
const remoteFile = "/tmp/sephora-review-" + stamp + ".backup";
fs.mkdirSync(".server-runtime", { recursive: true });
const backupFile = path.resolve(".server-runtime", "review-" + stamp + ".backup");
const adminUrl = new URL(sourceUrl); adminUrl.pathname = "/postgres";
const restoredUrl = new URL(sourceUrl); restoredUrl.pathname = "/" + destination;
const admin = new pg.Pool({ connectionString: adminUrl.toString() });
const source = new pg.Pool({ connectionString: sourceUrl.toString() });
const restored = new pg.Pool({ connectionString: restoredUrl.toString() });
let created = false;
function docker(...args) { return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
try {
  docker("exec", "sephora-server-postgres", "pg_dump", "--username=sephora", "--dbname=sephora", "--format=custom", "--file=" + remoteFile);
  docker("cp", "sephora-server-postgres:" + remoteFile, backupFile);
  await admin.query('CREATE DATABASE "' + destination + '"'); created = true;
  docker("exec", "sephora-server-postgres", "pg_restore", "--username=sephora", "--dbname=" + destination, "--no-owner", "--exit-on-error", remoteFile);
  const tables = ["entities", "group_members", "display_state", "activity_log", "auth_user", "auth_account", "auth_session", "auth_verification", "auth_rate_limit", "auth_bootstrap", "monitor_access", "server_migrations"];
  for (const table of tables) {
    const rows = async (pool) => (await pool.query('SELECT * FROM "' + table + '"')).rows.map(row => JSON.stringify(row)).sort();
    const originalRows = await rows(source);
    // Only emit table names/counts, never account credentials or password hashes.
    assert.ok(JSON.stringify(originalRows) === JSON.stringify(await rows(restored)), "Restored rows differ in " + table);
    console.log("PASS restored " + table + ": " + originalRows.length + " rows preserved");
  }
  console.log("Backup restoration verified. Private backup: " + backupFile);
} finally {
  await source.end(); await restored.end();
  if (created) await admin.query('DROP DATABASE "' + destination + '" WITH (FORCE)');
  await admin.end();
}
