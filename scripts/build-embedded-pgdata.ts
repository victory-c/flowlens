// Runs before `next build`: turns the committed CSV snapshot into a ready-to-load Postgres
// data directory, so cold starts on Vercel skip initdb/COPY/indexing. The output is a
// build artifact (gitignored) that Next's file tracing ships with the API functions.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createEmbeddedDbFromCsv } from "../src/server/analytics/embedded-loader";
import { EMBEDDED_DATA_DIR, EMBEDDED_FILES, EMBEDDED_PGDATA_FILE } from "../src/server/analytics/embedded-schema";

async function main() {
  const startedAt = Date.now();
  const dataDir = path.resolve(process.cwd(), EMBEDDED_DATA_DIR);
  const db = await createEmbeddedDbFromCsv({
    mainDashboard: path.join(dataDir, EMBEDDED_FILES.mainDashboard),
    flowSummary: path.join(dataDir, EMBEDDED_FILES.flowSummary)
  });
  await db.exec("CHECKPOINT");
  const dump = await db.dumpDataDir("gzip");
  const outPath = path.join(dataDir, EMBEDDED_PGDATA_FILE);
  writeFileSync(outPath, Buffer.from(await dump.arrayBuffer()));
  await db.close();
  console.log(
    `Wrote ${outPath} (${(dump.size / 1024 / 1024).toFixed(1)} MB) in ${Date.now() - startedAt}ms.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
