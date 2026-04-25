import { DB_COLUMNS, RawCsvRow, createPool, isRegionalOrUnspecified, numericOrNull, readCsvRows } from "./common";
import type { PoolClient } from "pg";

const INSERT_COLUMNS = [
  "raw_internal_id",
  ...DB_COLUMNS,
  "project_key",
  "is_regional_or_unspecified"
];

function dbValues(row: RawCsvRow, rawInternalId: number) {
  const rowId = row.row_id || null;
  const projectKey = rowId ?? `missing-row-${rawInternalId}`;
  return [
    rawInternalId,
    row.year || null,
    row.organization_name || null,
    row.region || null,
    row.country || null,
    numericOrNull(row.usd_disbursements_defl),
    row.grant_recipient_project_title || null,
    row.project_description || null,
    row.expected_duration || null,
    row.type_of_flow || null,
    row.Donor_country || null,
    row.financial_instrument || null,
    row.modality_of_giving || null,
    row.gender_dimension || null,
    row.additional_info || null,
    row.gender_marker || null,
    row.climate_change_mitigation || null,
    row.climate_change_adaptation || null,
    row.subsector || null,
    row.sdg_focus || null,
    rowId,
    row.subsector_description || null,
    row.Sector || null,
    row.sector_description || null,
    numericOrNull(row.usd_commitment_defl),
    row.channel_code || null,
    row.channel_name || null,
    row.channel_reported_name || null,
    row.environment || null,
    row.biodiversity || null,
    row.desertification || null,
    row.nutrition || null,
    row.region_macro || null,
    projectKey,
    isRegionalOrUnspecified(row.country)
  ];
}

async function flush(client: PoolClient, batch: unknown[][]) {
  if (batch.length === 0) return;
  const values: unknown[] = [];
  const groups = batch.map((row) => {
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  await client.query(
    `INSERT INTO analytics.raw_oecd_philanthropy (${INSERT_COLUMNS.join(", ")})
     VALUES ${groups.join(", ")}`,
    values
  );
}

async function main() {
  const pool = createPool();
  const client = await pool.connect();
  const batch: unknown[][] = [];

  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE analytics.raw_oecd_philanthropy RESTART IDENTITY");

    const rowCount = await readCsvRows(async (row, index) => {
      batch.push(dbValues(row, index));
      if (batch.length >= 400) {
        await flush(client, batch);
        batch.length = 0;
      }
    });

    await flush(client, batch);
    await client.query("COMMIT");
    console.log(`Imported ${rowCount} raw rows into analytics.raw_oecd_philanthropy.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
