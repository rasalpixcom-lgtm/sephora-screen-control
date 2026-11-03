import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const schema = "lcd_migration_test_" + crypto.randomBytes(8).toString("hex");
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query("CREATE TABLE entities (id text PRIMARY KEY)");
  await client.query("INSERT INTO entities VALUES ('existing-screen')");
  await client.query(fs.readFileSync("db/postgres-migrations/0011_screen_hardware.sql", "utf8"));
  for (const section of ["ledDisplay", "ledController", "mediaPlayer", "powerNetwork"]) {
    await client.query("INSERT INTO screen_hardware_sections VALUES ('existing-screen', $1, $2::jsonb, $3, '2026-01-01T00:00:00Z')", [section, JSON.stringify({ existing: section }), crypto.randomUUID()]);
  }
  const before = (await client.query("SELECT * FROM screen_hardware_sections ORDER BY section")).rows;
  const migration = fs.readFileSync("db/postgres-migrations/0017_lcd_hardware.sql", "utf8");
  await client.query(migration);
  assert.deepEqual((await client.query("SELECT * FROM screen_hardware_sections ORDER BY section")).rows, before);
  await client.query("INSERT INTO screen_hardware_sections VALUES ('existing-screen', 'lcd', '{\"tv_size\":\"55.5\"}', $1, now())", [crypto.randomUUID()]);
  await client.query(migration);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM screen_hardware_sections")).rows[0].count, 5);
  const beforeWall = (await client.query("SELECT * FROM screen_hardware_sections ORDER BY section")).rows;
  const wallMigration = fs.readFileSync("db/postgres-migrations/0018_video_wall_hardware.sql", "utf8");
  await client.query(wallMigration);
  assert.deepEqual((await client.query("SELECT * FROM screen_hardware_sections ORDER BY section")).rows, beforeWall);
  await client.query("INSERT INTO screen_hardware_sections VALUES ('existing-screen', 'video_wall', '{\"display_qty\":\"6\"}', $1, now())", [crypto.randomUUID()]);
  await client.query(wallMigration);
  assert.equal((await client.query("SELECT count(*)::int AS count FROM screen_hardware_sections")).rows[0].count, 6);
  await client.query("SAVEPOINT invalid_section");
  await assert.rejects(client.query("INSERT INTO screen_hardware_sections VALUES ('existing-screen', 'unknown', '{}', $1, now())", [crypto.randomUUID()]), { code: "23514" });
  await client.query("ROLLBACK TO SAVEPOINT invalid_section");
  assert.deepEqual((await client.query("SELECT * FROM screen_hardware_sections WHERE section NOT IN ('lcd', 'video_wall') ORDER BY section")).rows, before);
  console.log("LCD and Video Wall migrations passed: preserve existing records, accept both sections, reject unknown sections and are repeatable.");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}
