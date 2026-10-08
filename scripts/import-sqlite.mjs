// Read-only import. Requires an empty, migrated PostgreSQL database. Sessions are not copied.
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
const source = process.argv[2];
if (!source || !process.env.DATABASE_URL) throw new Error("Usage: npm run db:import -- <SQLite file>. Configure DATABASE_URL first.");
const sqlite = new DatabaseSync(source, { readOnly: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined });
const tables = ["entities", "group_members", "display_state", "activity_log", "auth_user", "auth_account", "auth_verification", "auth_bootstrap"];
const client = await pool.connect();
try {
  sqlite.exec("BEGIN"); await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(724015)");
  for (const table of tables) {
    await client.query(`LOCK TABLE "${table}" IN ACCESS EXCLUSIVE MODE`);
    if (Number((await client.query(`SELECT COUNT(*) AS count FROM "${table}"`)).rows[0].count)) throw new Error("Destination database is not empty. Import cancelled.");
  }
  for (const table of tables) {
    const exists = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if (!exists) continue;
    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    for (const row of rows) {
      const columns = Object.keys(row);
      const values = columns.map((column) => {
        if (table.startsWith("auth_") && ["email_verified", "disabled"].includes(column)) return !!row[column];
        if (table.startsWith("auth_") && column.endsWith("_at") && row[column] !== null) return new Date(Number(row[column]));
        return row[column];
      });
      await client.query(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`, values);
    }
    console.log(`${table}: ${rows.length} rows imported`);
  }
  await client.query("COMMIT"); sqlite.exec("COMMIT");
  console.log("Import complete. Existing passwords are preserved; sign in again.");
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { client.release(); sqlite.close(); await pool.end(); }
