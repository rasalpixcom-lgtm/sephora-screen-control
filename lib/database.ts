import { Pool, type PoolClient, type QueryResultRow } from "pg";

const shared = globalThis as typeof globalThis & { sephoraPool?: Pool };
export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  if (shared.sephoraPool) return shared.sephoraPool;
  const max = Number(process.env.DATABASE_POOL_SIZE || 10);
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error("DATABASE_POOL_SIZE must be between 1 and 100.");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    application_name: "sephora-screen-control",
    max,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
  });
  // PostgreSQL restarts can emit errors on idle connections. Handle them so
  // the process survives and the pool can establish replacement connections.
  pool.on("error", (error) => console.error("Idle database connection failed", (error as { code?: string }).code || "unavailable"));
  shared.sephoraPool = pool;
  return pool;
}

type Connection = Pool | PoolClient;
class Statement {
  constructor(readonly sql: string, readonly connection: Connection, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.sql, this.connection, values); }
  async execute() {
    let parameter = 0;
    // Application SQL uses positional parameters and quotes camelCase aliases.
    const sql = this.sql.replace(/\?/g, () => `$${++parameter}`);
    return this.connection.query<QueryResultRow>(sql, this.values);
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> { return (await this.execute()).rows[0] as T || null; }
  async all<T = Record<string, unknown>>() { return { results: (await this.execute()).rows as T[] }; }
  async run() { const result = await this.execute(); return { meta: { changes: result.rowCount || 0 } }; }
}
export class ServerDatabase {
  constructor(readonly connection: Connection = getPool()) {}
  prepare(sql: string) { return new Statement(sql, this.connection); }
  async transaction<T>(work: (db: ServerDatabase) => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await work(new ServerDatabase(client));
      await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async batch(statements: Statement[]) {
    return this.transaction(async (db) => {
      const results = [];
      for (const statement of statements) results.push(await db.prepare(statement.sql).bind(...statement.values).run());
      return results;
    });
  }
}
export function database() { return new ServerDatabase(); }
