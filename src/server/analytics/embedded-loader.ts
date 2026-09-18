// Builds the embedded PGlite database from the gzipped CSV snapshot. Kept free of
// "server-only" so scripts/build-embedded-pgdata.ts can run it at build time.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { EMBEDDED_INDEX_SQL, EMBEDDED_SCHEMA_SQL, FLOW_COLUMNS, MAIN_COLUMNS } from "./embedded-schema";

async function copyInto(db: PGlite, table: string, columns: readonly string[], filePath: string) {
  await db.query(`COPY ${table} (${columns.join(", ")}) FROM '/dev/blob' WITH (FORMAT csv, HEADER true)`, [], {
    blob: new Blob([gunzipSync(readFileSync(filePath))])
  });
}

export async function createEmbeddedDbFromCsv(paths: { mainDashboard: string; flowSummary: string }) {
  const db = await PGlite.create();
  await db.exec(EMBEDDED_SCHEMA_SQL);
  await copyInto(db, "analytics_clean.main_dashboard", MAIN_COLUMNS, paths.mainDashboard);
  await copyInto(db, "analytics_clean.flow_summary", FLOW_COLUMNS, paths.flowSummary);
  await db.exec(EMBEDDED_INDEX_SQL);
  return db;
}
