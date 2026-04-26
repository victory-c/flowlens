import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import pg from "pg";
import "./load-env";

export const CSV_PATH =
  process.env.FLOWLENS_CSV_PATH ?? "./OECD Dataset.xlsx - complete_p4d3_df.csv";

export const RAW_COLUMNS = [
  "year",
  "organization_name",
  "region",
  "country",
  "usd_disbursements_defl",
  "grant_recipient_project_title",
  "project_description",
  "expected_duration",
  "type_of_flow",
  "Donor_country",
  "financial_instrument",
  "modality_of_giving",
  "gender_dimension",
  "additional_info",
  "gender_marker",
  "climate_change_mitigation",
  "climate_change_adaptation",
  "subsector",
  "sdg_focus",
  "row_id",
  "subsector_description",
  "Sector",
  "sector_description",
  "usd_commitment_defl",
  "channel_code",
  "channel_name",
  "channel_reported_name",
  "environment",
  "biodiversity",
  "desertification",
  "nutrition",
  "region_macro"
] as const;

export const DB_COLUMNS = [
  "year",
  "organization_name",
  "region",
  "country",
  "usd_disbursements_defl",
  "grant_recipient_project_title",
  "project_description",
  "expected_duration",
  "type_of_flow",
  "donor_country",
  "financial_instrument",
  "modality_of_giving",
  "gender_dimension",
  "additional_info",
  "gender_marker",
  "climate_change_mitigation",
  "climate_change_adaptation",
  "subsector",
  "sdg_focus",
  "row_id",
  "subsector_description",
  "sector",
  "sector_description",
  "usd_commitment_defl",
  "channel_code",
  "channel_name",
  "channel_reported_name",
  "environment",
  "biodiversity",
  "desertification",
  "nutrition",
  "region_macro"
] as const;

export type RawCsvRow = Record<(typeof RAW_COLUMNS)[number], string>;

export function numericOrNull(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRegionalOrUnspecified(country: string | null | undefined) {
  const value = (country ?? "").toLowerCase();
  return (
    value.includes("regional") ||
    value.includes("unspecified") ||
    value === "bilateral, unspecified" ||
    value === "global or unspecified"
  );
}

export function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database scripts.");
  }
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "false"
        ? false
        : {
            rejectUnauthorized: false
          }
  });
}

export async function readCsvRows(onRow: (row: RawCsvRow, index: number) => void | Promise<void>) {
  let index = 0;
  const parser = createReadStream(CSV_PATH).pipe(
    parse({
      bom: true,
      columns: true,
      relax_quotes: true,
      skip_empty_lines: false
    })
  );

  for await (const record of parser) {
    index += 1;
    await onRow(record as RawCsvRow, index);
  }

  return index;
}

export function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
  console.log(`ok: ${label} = ${actual}`);
}

export function assertNear(label: string, actual: number, expected: number, tolerance = 0.001) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
  console.log(`ok: ${label} = ${actual.toFixed(3)}`);
}
