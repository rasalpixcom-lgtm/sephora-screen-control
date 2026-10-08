import { DatabaseSync } from "node:sqlite";
import pg from "pg";
const sqlite = new DatabaseSync(process.argv[2], { readOnly: true });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  for (const table of ["entities", "group_members", "display_state", "activity_log", "auth_user", "auth_account", "auth_bootstrap"]) {
    const source = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    const target = (await pool.query(`SELECT * FROM "${table}"`)).rows;
    const normalize = (row, original) => JSON.stringify(Object.fromEntries(Object.keys(row).sort().map((key) => {
      let value = row[key];
      if (original && table.startsWith("auth_") && ["email_verified", "disabled"].includes(key)) value = !!value;
      if (original && table.startsWith("auth_") && key.endsWith("_at") && value !== null) value = new Date(Number(value)).toISOString();
      if (value instanceof Date) value = value.toISOString();
      return [key, value];
    })));
    if (JSON.stringify(source.map(row => normalize(row, true)).sort()) !== JSON.stringify(target.map(row => normalize(row, false)).sort())) throw new Error(`${table}: migrated data differs. No credentials printed.`);
    console.log(`PASS ${table}: ${source.length} rows preserved exactly`);
  }
} finally { sqlite.close(); await pool.end(); }
