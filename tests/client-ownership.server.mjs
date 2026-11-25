// Never migrates the configured database: creates and drops disposable databases.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { migrate } from "../scripts/migrate-postgres.mjs";
import {owned, seed} from "./fixtures/client-ownership.mjs";
import { closeTestPool } from "./fixtures/postgres-pool.mjs";
const globalTables = ["auth_user", "auth_account", "auth_session", "auth_verification", "auth_bootstrap", "auth_rate_limit"];
const migrationName = "0024_client_ownership.sql";
const adminUrl = new URL(process.env.DATABASE_URL); adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.href });
const resources = [];
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.log("PASS " + label); };
async function rows(pool, table, legacy = false) {
  const addedColumn = table === "auth_user" ? "controller_client_ids" : "client_id";
  const row = legacy ? `to_jsonb(t) - '${addedColumn}'` : "to_jsonb(t)";
  return (await pool.query(`SELECT ${row} AS row FROM "${table}" t`)).rows.map(result => JSON.stringify(result.row)).sort();
}
async function createDb() {
  const name = "sephora_ownership_test_" + crypto.randomBytes(8).toString("hex");
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL); url.pathname = "/" + name;
  const pool = new pg.Pool({ connectionString: url.href }); resources.push({ name, pool }); return pool;
}
async function oldMigrations(pool) {
  await pool.query("CREATE TABLE server_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const name of fs.readdirSync("db/postgres-migrations").filter(n => n.endsWith(".sql") && n < migrationName).sort()) {
    const sql = fs.readFileSync("db/postgres-migrations/" + name, "utf8").replace(/\r\n/g, "\n");
    await pool.query(sql); await pool.query("INSERT INTO server_migrations(name,checksum) VALUES ($1,$2)", [name, crypto.createHash("sha256").update(sql).digest("hex")]);
  }
}
async function legacyStructure(pool) {
  return (await pool.query(`SELECT c.relname AS table_name, a.attname AS column_name,
    format_type(a.atttypid,a.atttypmod) AS data_type, a.attnotnull AS required,
    pg_get_expr(d.adbin,d.adrelid) AS default_value
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind='r' AND a.attname<>'client_id'
      AND NOT (c.relname='auth_user' AND a.attname='controller_client_ids')
    ORDER BY c.relname,a.attnum`)).rows;
}
async function checkReadiness(pool) {
  const probe=net.createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  const server=spawn(process.execPath,[path.resolve('.next/standalone/server.js')],{windowsHide:true,stdio:'ignore',env:{...process.env,
    COMPLAINT_ALERTS_ENABLED:'false',
    PORT:String(port),HOSTNAME:'127.0.0.1',DATABASE_URL:pool.options.connectionString,AUTH_URL:origin,AUTH_ADDITIONAL_ORIGINS:'',
    AUTH_SECRET:crypto.randomBytes(48).toString('hex'),AUTH_ADMIN_EMAIL:'ownership@example.test',
    ONSIGN_API_TOKEN:'',ALERT_EMAIL_USER:'',ALERT_EMAIL_APP_PASSWORD:'',ULTRAMSG_TOKEN:''}});
  try {
    let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).status===200){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
    check(ready,'health accepts a fully migrated database');
    const status=async()=>(await fetch(origin+'/api/health')).status;
    await pool.query('ALTER TABLE clients RENAME TO clients_test_hidden');
    check(await status()===503,'health refuses a missing client table');
    await pool.query('ALTER TABLE clients_test_hidden RENAME TO clients');
    await pool.query('ALTER TABLE screen_reference_photos RENAME COLUMN client_id TO client_id_test_hidden');
    check(await status()===503,'health refuses an incomplete ownership schema');
    await pool.query('ALTER TABLE screen_reference_photos RENAME COLUMN client_id_test_hidden TO client_id');
    const migration=(await pool.query('DELETE FROM server_migrations WHERE name=$1 RETURNING *',[migrationName])).rows[0];
    check(await status()===503,'health refuses a missing ownership migration record');
    await pool.query('INSERT INTO server_migrations(name,checksum,applied_at) VALUES($1,$2,$3)',[migration.name,migration.checksum,migration.applied_at]);
    check(await status()===200,'health recovers when ownership schema and migration are restored');
    const brandingMigration=(await pool.query("DELETE FROM server_migrations WHERE name='0033_client_backgrounds.sql' RETURNING *")).rows[0];
    check(await status()===503,'health refuses a missing background migration record');
    await pool.query('INSERT INTO server_migrations(name,checksum,applied_at) VALUES($1,$2,$3)',[brandingMigration.name,brandingMigration.checksum,brandingMigration.applied_at]);
    await pool.query('ALTER TABLE client_backgrounds RENAME TO client_backgrounds_test_hidden');
    check(await status()===503,'health refuses missing background storage');
    await pool.query('ALTER TABLE client_backgrounds_test_hidden RENAME TO client_backgrounds');
    check(await status()===200,'health recovers after background storage is restored');
    const onsignMigration=(await pool.query("DELETE FROM server_migrations WHERE name='0034_client_onsign_settings.sql' RETURNING *")).rows[0];
    check(await status()===503,'health refuses a missing OnSign settings migration');
    await pool.query('INSERT INTO server_migrations(name,checksum,applied_at) VALUES($1,$2,$3)',[onsignMigration.name,onsignMigration.checksum,onsignMigration.applied_at]);
    await pool.query('ALTER TABLE client_onsign_settings RENAME TO client_onsign_settings_hidden');
    check(await status()===503,'health refuses missing OnSign settings storage');
    await pool.query('ALTER TABLE client_onsign_settings_hidden RENAME TO client_onsign_settings');
    check(await status()===200,'health recovers after OnSign settings storage is restored');
    await pool.query('TRUNCATE '+owned.map(t=>'"'+t+'"').join(',')+' CASCADE');
    await pool.query("DELETE FROM common_monitor_display WHERE id='main'");
    await pool.query("DELETE FROM clients WHERE id='sephora'");
    check(await status()===503,'health refuses a missing Sephora client');
  } finally {
    if(server.exitCode===null){const exit=once(server,'exit');server.kill();await exit;}
  }
}
try {
  const upgraded = await createDb(); await oldMigrations(upgraded); await upgraded.query(seed);
  const before = new Map(); for (const t of [...owned,...globalTables,"server_migrations"]) before.set(t, await rows(upgraded,t));
  const structureBefore = await legacyStructure(upgraded);
  const originalTables = new Set(structureBefore.map(column => column.table_name));
  const constraintsBefore=(await upgraded.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname")).rows;
  await migrate(upgraded);
  const preservedStructure = (await legacyStructure(upgraded)).filter(column => originalTables.has(column.table_name));
  check(JSON.stringify(structureBefore) === JSON.stringify(preservedStructure), "all original column types, defaults and nullability preserved");
  const constraintsAfter=(await upgraded.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname")).rows;
  check(constraintsBefore.filter(old=>!['display_state_pkey','monitor_access_pkey','email_alert_settings_pkey','whatsapp_alert_settings_pkey'].includes(old.conname)).every(old=>constraintsAfter.some(current=>current.conname===old.conname && current.definition===old.definition)),'all original constraints preserved except the four client-specific singleton primary keys');
  const client = (await upgraded.query("SELECT id,slug,name FROM clients")).rows;
  check(client.length===1 && client[0].id==='sephora' && client[0].name==='Sephora' && client[0].slug==='sephora','exactly one Sephora client created');
  const members=(await upgraded.query("SELECT client_id,user_id,role FROM client_memberships ORDER BY user_id")).rows;
  check(members.length===1 && members[0].client_id==='sephora' && members[0].user_id==='user' && members[0].role==='admin','existing administrator receives explicit Sephora membership');
  for (const t of owned) {
    check(JSON.stringify(before.get(t))===JSON.stringify(await rows(upgraded,t,true)),t+': every original value preserved');
    check((await upgraded.query(`SELECT count(*)::int AS n FROM "${t}" WHERE client_id <> 'sephora' OR client_id IS NULL`)).rows[0].n===0,t+': all existing rows assigned to Sephora');
    const columns=(await upgraded.query("SELECT is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='client_id'",[t])).rows;
    check(columns.length===1 && columns[0].is_nullable==='NO' && columns[0].column_default.includes('sephora'),t+': required compatibility default');
    check((await upgraded.query("SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename=$1 AND indexname=$2",[t,t+'_client_idx'])).rowCount===1,t+': ownership index exists');
    await assert.rejects(upgraded.query(`UPDATE "${t}" SET client_id='missing-client'`),e=>e.code==='23503'); checks++;
    await assert.rejects(upgraded.query(`UPDATE "${t}" SET client_id=NULL`),e=>e.code==='23502'); checks++;
  }
  for (const t of globalTables) {
    check(JSON.stringify(before.get(t))===JSON.stringify(await rows(upgraded,t,true)),t+': authentication data unchanged');
    check((await upgraded.query("SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='client_id'",[t])).rowCount===0,t+': remains global');
  }
  check((await upgraded.query("SELECT count(*)::int AS n FROM server_migrations")).rows[0].n===fs.readdirSync('db/postgres-migrations').filter(n=>n.endsWith('.sql')).length,'current migrations recorded');
  const history=(await upgraded.query("SELECT to_jsonb(t) AS row FROM server_migrations t WHERE name<$1",[migrationName])).rows.map(r=>JSON.stringify(r.row)).sort();
  check(JSON.stringify(history)===JSON.stringify(before.get('server_migrations')),'prior migration history unchanged');
  const after = new Map(); for (const t of [...owned,...globalTables,'clients','server_migrations']) after.set(t,await rows(upgraded,t));
  await migrate(upgraded); for(const [t,expected] of after) check(JSON.stringify(expected)===JSON.stringify(await rows(upgraded,t)),t+': migration rerun changes nothing');
  await assert.rejects(upgraded.query("DELETE FROM clients WHERE id='sephora'"),e=>e.code==='23503');check(true,'client deletion cannot cascade into existing data');
  // Existing insert shapes omit ownership. Clone all fixture rows into empty tables
  // in one rollback-only transaction, exercising every application table default.
  const connection=await upgraded.connect();try {
    await connection.query('BEGIN');
    await connection.query('TRUNCATE '+owned.map(t=>'"'+t+'"').join(',')+' CASCADE');
    await connection.query(seed.split('INSERT INTO auth_user')[0]);
    for(const t of owned) check((await connection.query(`SELECT count(*)::int AS n FROM "${t}" WHERE client_id='sephora'`)).rows[0].n>0,t+': legacy inserts still use Sephora');
    await connection.query('ROLLBACK');
  } finally { await connection.query('ROLLBACK');connection.release(); }
  const fresh=await createDb();await migrate(fresh);await migrate(fresh);
  check((await fresh.query("SELECT count(*)::int AS n FROM clients WHERE id='sephora'")).rows[0].n===1,'fresh installation and repeat migration succeed');
  await checkReadiness(fresh);
  const broken=await createDb();await oldMigrations(broken);await broken.query(seed);
  await broken.query("ALTER TABLE screen_reference_photos ADD COLUMN client_id text");
  const intact=await rows(broken,'entities');
  await assert.rejects(migrate(broken),e=>e.code==='42701');
  check((await broken.query("SELECT to_regclass('public.clients') AS name")).rows[0].name===null,'late migration error rolls back client creation');
  check((await broken.query("SELECT 1 FROM information_schema.columns WHERE table_name='entities' AND column_name='client_id'")).rowCount===0,'late migration error rolls back earlier ownership columns');
  check(JSON.stringify(intact)===JSON.stringify(await rows(broken,'entities')),'failed migration leaves existing records intact');
  check((await broken.query("SELECT 1 FROM server_migrations WHERE name=$1",[migrationName])).rowCount===0,'failed migration is not recorded');
  console.log(`Client ownership: ${checks} checks passed; disposable databases only.`);
} finally {
  for (const { name, pool } of resources) {
    await closeTestPool(pool);
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
  await admin.end();
}
