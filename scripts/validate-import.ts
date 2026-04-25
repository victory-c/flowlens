import { RAW_COLUMNS, assertEqual, assertNear, createPool, numericOrNull, readCsvRows } from "./common";

async function validateCsv() {
  const rowIds = new Set<string>();
  let rows = 0;
  let missingRowId = 0;
  let totalDisbursement = 0;
  let totalCommitment = 0;
  let headerChecked = false;

  await readCsvRows((row) => {
    rows += 1;
    if (!headerChecked) {
      assertEqual("csv column count", Object.keys(row).length, RAW_COLUMNS.length);
      for (const column of RAW_COLUMNS) {
        if (!(column in row)) throw new Error(`Missing CSV column ${column}`);
      }
      headerChecked = true;
    }

    if (row.row_id) rowIds.add(row.row_id);
    else missingRowId += 1;

    totalDisbursement += numericOrNull(row.usd_disbursements_defl) ?? 0;
    totalCommitment += numericOrNull(row.usd_commitment_defl) ?? 0;
  });

  assertEqual("csv row count", rows, 116_561);
  assertEqual("non-null unique row_id", rowIds.size, 74_879);
  assertEqual("missing row_id", missingRowId, 3);
  assertNear("csv total disbursement", totalDisbursement, 68_237.104);
  assertNear("csv total commitment", totalCommitment, 51_755.914);
}

async function validateDatabaseIfConfigured() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set; skipped database import parity checks.");
    return;
  }

  const pool = createPool();
  try {
    const { rows } = await pool.query(`
      SELECT
        count(*)::int AS row_count,
        count(DISTINCT row_id)::int AS unique_row_id,
        count(*) FILTER (WHERE row_id IS NULL)::int AS missing_row_id,
        coalesce(sum(usd_disbursements_defl), 0)::float AS total_disbursement,
        coalesce(sum(usd_commitment_defl), 0)::float AS total_commitment
      FROM analytics.raw_oecd_philanthropy
    `);
    const row = rows[0];
    assertEqual("db row count", row.row_count, 116_561);
    assertEqual("db non-null unique row_id", row.unique_row_id, 74_879);
    assertEqual("db missing row_id", row.missing_row_id, 3);
    assertNear("db total disbursement", row.total_disbursement, 68_237.104);
    assertNear("db total commitment", row.total_commitment, 51_755.914);
  } finally {
    await pool.end();
  }
}

async function main() {
  await validateCsv();
  await validateDatabaseIfConfigured();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
