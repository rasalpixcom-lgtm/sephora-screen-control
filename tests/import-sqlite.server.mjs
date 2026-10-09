// Import compatibility against a random disposable PostgreSQL database.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { migrate } from "../scripts/migrate-postgres.mjs";

const databaseName = "sephora_import_test_" + crypto.randomBytes(8).toString("hex");
const adminUrl = new URL(process.env.DATABASE_URL); adminUrl.pathname = "/postgres";
const testUrl = new URL(process.env.DATABASE_URL); testUrl.pathname = "/" + databaseName;
const admin = new pg.Pool({connectionString:adminUrl.toString()});
const pool = new pg.Pool({connectionString:testUrl.toString()});
fs.mkdirSync(".server-runtime", {recursive:true});
const file = path.resolve(".server-runtime", databaseName + ".sqlite");
let created = false;
try {
  await admin.query('CREATE DATABASE "' + databaseName + '"'); created = true;
  await migrate(pool);
  const source = new DatabaseSync(file);
  source.exec(`CREATE TABLE entities (id TEXT, type TEXT, name TEXT, parent_id TEXT, live_url TEXT, is_demo INTEGER, created_at TEXT);
    CREATE TABLE auth_user (id TEXT, name TEXT, email TEXT, email_verified INTEGER, created_at INTEGER, updated_at INTEGER, role TEXT, disabled INTEGER);
    CREATE TABLE auth_account (id TEXT, account_id TEXT, provider_id TEXT, user_id TEXT, password TEXT, created_at INTEGER, updated_at INTEGER);
    INSERT INTO entities VALUES ('country', 'country', 'Fixture country', NULL, NULL, 0, '2026-01-01T00:00:00.000Z');`);
  const stamp = Date.now();
  for (const role of ["admin", "controller", "wall"]) {
    source.prepare("INSERT INTO auth_user VALUES (?,?,?,?,?,?,?,?)").run(role,role,role+"@example.test",0,stamp,stamp,role,0);
    source.prepare("INSERT INTO auth_account VALUES (?,?,?,?,?,?,?)").run(role,role,"credential",role,"fixture-hash-"+role,stamp,stamp);
  }
  source.close();
  const run = () => spawnSync(process.execPath, ["scripts/import-sqlite.mjs",file], {env:{...process.env,DATABASE_URL:testUrl.toString()},encoding:"utf8"});
  assert.equal(run().status,0,"legacy import must succeed after current migrations");
  const users = (await pool.query("SELECT id, role, disabled FROM auth_user ORDER BY id")).rows;
  assert.deepEqual(users,[{id:"admin",role:"admin",disabled:false},{id:"controller",role:"controller",disabled:false},{id:"wall",role:"wall",disabled:true}]);
  assert.deepEqual((await pool.query("SELECT password FROM auth_account ORDER BY id")).rows.map(row=>row.password),["fixture-hash-admin","fixture-hash-controller","fixture-hash-wall"]);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM auth_session")).rows[0].n,0);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM activity_log WHERE action = 'retired monitor account'")).rows[0].n,1);
  assert.notEqual(run().status,0,"nonempty destination must be refused");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM auth_user")).rows[0].n,3);
  await pool.query("TRUNCATE auth_user CASCADE");
  await pool.query("TRUNCATE entities, activity_log");
  const invalid = new DatabaseSync(file); invalid.exec("UPDATE auth_user SET role = 'invalid' WHERE id = 'wall'"); invalid.close();
  assert.notEqual(run().status,0,"unsupported roles must fail the import");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM entities")).rows[0].n,0,"failed import must roll back earlier inventory writes");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM auth_user")).rows[0].n,0,"failed import must roll back earlier account writes");
  console.log("10 SQLite import checks passed: roles, hashes, history, destination protection and rollback.");
} finally {
  await pool.end();
  if (created) await admin.query('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
  await admin.end();
  fs.rmSync(file,{force:true});
}
