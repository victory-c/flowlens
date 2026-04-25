import "server-only";
import pg from "pg";

const { Pool } = pg;

declare global {
  var flowlensPool: pg.Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for FlowLens analytics routes.");
  }

  return new Pool({
    connectionString,
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
  const result = await getPool().query<T>(text, values);
  return result.rows;
}
