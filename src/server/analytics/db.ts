import "server-only";
import pg from "pg";
import { getEmbeddedDb } from "./embedded-db";

const { Pool } = pg;

declare global {
  var flowlensPool: pg.Pool | undefined;
}

// By default queries run against the embedded PGlite snapshot in data/embedded/, so a plain
// Vercel deployment serves the full dashboard with no external database. A hosted Postgres
// (the original Supabase setup) is opt-in, so a stale DATABASE_URL cannot take the site down.
export function usesExternalDatabase() {
  return process.env.FLOWLENS_DATA_SOURCE === "postgres" && Boolean(process.env.DATABASE_URL);
}

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? false
        : {
            rejectUnauthorized: false
          }
  });
}

export function getPool() {
  globalThis.flowlensPool ??= createPool();
  return globalThis.flowlensPool;
}

export async function query<T extends Record<string, unknown>>(text: string, values: unknown[] = []) {
  if (usesExternalDatabase()) {
    const result = await getPool().query<T>(text, values);
    return result.rows;
  }

  const db = await getEmbeddedDb();
  const result = await db.query<T>(text, values);
  return result.rows;
}
