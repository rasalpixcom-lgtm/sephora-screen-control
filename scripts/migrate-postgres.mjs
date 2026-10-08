import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(724015)");
    await client.query("CREATE TABLE IF NOT EXISTS server_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of fs.readdirSync("db/postgres-migrations").filter((name) => name.endsWith(".sql")).sort()) {
      const sql = fs.readFileSync(path.join("db/postgres-migrations", name), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const prior = (await client.query("SELECT checksum FROM server_migrations WHERE name = $1", [name])).rows[0];
      if (prior) { if (prior.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`); continue; }
      await client.query(sql);
      await client.query("INSERT INTO server_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined });
  try { await migrate(pool); console.log("PostgreSQL migrations applied."); } finally { await pool.end(); }
}
