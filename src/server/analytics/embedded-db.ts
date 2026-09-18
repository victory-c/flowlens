import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import {
  EMBEDDED_INDEX_SQL,
  EMBEDDED_SCHEMA_SQL,
  FLOW_COLUMNS,
  MAIN_COLUMNS
} from "./embedded-schema";

declare global {
  var flowlensEmbeddedDb: Promise<PGlite> | undefined;
}

// Literal paths (matching EMBEDDED_DATA_DIR/EMBEDDED_FILES) keep Next's file tracing from
// pulling the whole project directory into the function bundle.
const MAIN_DASHBOARD_PATH = path.join(process.cwd(), "data/embedded/main_dashboard.csv.gz");
const FLOW_SUMMARY_PATH = path.join(process.cwd(), "data/embedded/flow_summary.csv.gz");

async function copyInto(db: PGlite, table: string, columns: readonly string[], filePath: string) {
  await db.query(`COPY ${table} (${columns.join(", ")}) FROM '/dev/blob' WITH (FORMAT csv, HEADER true)`, [], {
    blob: new Blob([gunzipSync(readFileSync(filePath))])
  });
}

async function createEmbeddedDb() {
  const startedAt = Date.now();
  const db = await PGlite.create();
  await db.exec(EMBEDDED_SCHEMA_SQL);
  await copyInto(db, "analytics_clean.main_dashboard", MAIN_COLUMNS, MAIN_DASHBOARD_PATH);
  await copyInto(db, "analytics_clean.flow_summary", FLOW_COLUMNS, FLOW_SUMMARY_PATH);
  await db.exec(EMBEDDED_INDEX_SQL);
  console.info(`[flowlens] embedded analytics database ready in ${Date.now() - startedAt}ms`);
  return db;
}

export function getEmbeddedDb() {
  globalThis.flowlensEmbeddedDb ??= createEmbeddedDb().catch((error) => {
    globalThis.flowlensEmbeddedDb = undefined;
    throw error;
  });
  return globalThis.flowlensEmbeddedDb;
}
