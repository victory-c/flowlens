import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import {
  EMBEDDED_DATA_DIR,
  EMBEDDED_FILES,
  EMBEDDED_INDEX_SQL,
  EMBEDDED_SCHEMA_SQL,
  FLOW_COLUMNS,
  MAIN_COLUMNS
} from "./embedded-schema";

declare global {
  var flowlensEmbeddedDb: Promise<PGlite> | undefined;
}

function readSnapshot(fileName: string) {
  const filePath = path.join(process.cwd(), EMBEDDED_DATA_DIR, fileName);
  return new Blob([gunzipSync(readFileSync(filePath))]);
}

async function copyInto(db: PGlite, table: string, columns: readonly string[], fileName: string) {
  await db.query(`COPY ${table} (${columns.join(", ")}) FROM '/dev/blob' WITH (FORMAT csv, HEADER true)`, [], {
    blob: readSnapshot(fileName)
  });
}

async function createEmbeddedDb() {
  const startedAt = Date.now();
  const db = await PGlite.create();
  await db.exec(EMBEDDED_SCHEMA_SQL);
  await copyInto(db, "analytics_clean.main_dashboard", MAIN_COLUMNS, EMBEDDED_FILES.mainDashboard);
  await copyInto(db, "analytics_clean.flow_summary", FLOW_COLUMNS, EMBEDDED_FILES.flowSummary);
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
