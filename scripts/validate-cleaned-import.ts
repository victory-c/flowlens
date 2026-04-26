import { createReadStream } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { assertEqual, assertNear, createPool } from "./common";
import "./load-env";

type CsvRow = Record<string, string | undefined>;

const CLEANED_DATA_DIR = process.env.FLOWLENS_CLEANED_DATA_DIR ?? "./cleaned_data6";

const EXPECTED = {
  mainDashboard: { rows: 114_718, sum: 68_237.10386159879 },
  countrySummary: { rows: 603, sum: 68_237.10386159878 },
  donorSummary: { rows: 1_817, sum: 68_237.10386159879 },
  sectorSummary: { rows: 110, sum: 68_237.10386159875 },
  donorPortfolio: { rows: 4_141, sum: 68_237.10386159879 },
  causeMarker: { rows: 19, sum: 19_916.26334988957 },
  missingProjectIds: 3,
  uniqueProjectIds: 74_560
};

const FILES = [
  {
    key: "mainDashboard",
    file: "01_df_main_dashboard.csv",
    amountColumn: "Amount_USD",
    columns: [
      "Year",
      "Donor",
      "Region",
      "Recipient_Country",
      "Sector_Name",
      "Amount_USD",
      "Project_Title",
      "Project_ID",
      "is_gender",
      "is_climate",
      "is_environment",
      "is_biodiversity",
      "is_nutrition",
      "is_desertification"
    ]
  },
  {
    key: "countrySummary",
    file: "02_df_country_summary.csv",
    amountColumn: "Total_Funding",
    columns: ["Year", "Region", "Recipient_Country", "Total_Funding", "Unique_Projects"]
  },
  {
    key: "donorSummary",
    file: "03_df_donor_summary.csv",
    amountColumn: "Total_Funding",
    columns: ["Year", "Donor", "Total_Funding", "Unique_Projects", "Recipient_Countries_Count"]
  },
  {
    key: "sectorSummary",
    file: "04_df_sector_summary.csv",
    amountColumn: "Total_Funding",
    columns: ["Year", "Sector_Name", "Total_Funding"]
  },
  {
    key: "donorPortfolio",
    file: "05_df_donor_portfolio.csv",
    amountColumn: "Total_Funding",
    columns: ["Donor", "Sector_Name", "Total_Funding"]
  },
  {
    key: "causeMarker",
    file: "06_df_cause_marker.csv",
    amountColumn: "Total_Funding",
    columns: ["Year", "Total_Funding", "Unique_Projects", "Cause"]
  }
] as const;

async function readRows(fileName: string) {
  const rows: CsvRow[] = [];
  const parser = createReadStream(path.resolve(process.cwd(), CLEANED_DATA_DIR, fileName)).pipe(
    parse({
      bom: true,
      columns: true,
      relax_quotes: true,
      skip_empty_lines: true
    })
  );

  for await (const record of parser) rows.push(record as CsvRow);
  return rows;
}

function numeric(value: string | undefined) {
  const parsed = Number((value ?? "").trim());
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value: ${value ?? ""}`);
  return parsed;
}

function assertHeaders(fileName: string, row: CsvRow | undefined, expectedColumns: readonly string[]) {
  if (!row) throw new Error(`${fileName} is empty`);
  const actual = Object.keys(row);
  assertEqual(`${fileName} column count`, actual.length, expectedColumns.length);
  for (const column of expectedColumns) {
    if (!(column in row)) throw new Error(`${fileName} missing column ${column}`);
  }
}

async function validateCsvFiles() {
  for (const fileConfig of FILES) {
    const rows = await readRows(fileConfig.file);
    const expected = EXPECTED[fileConfig.key];
    assertHeaders(fileConfig.file, rows[0], fileConfig.columns);
    assertEqual(`${fileConfig.file} row count`, rows.length, expected.rows);

    const total = rows.reduce((sum, row) => sum + numeric(row[fileConfig.amountColumn]), 0);
    assertNear(`${fileConfig.file} funding total`, total, expected.sum);
  }

  const mainRows = await readRows("01_df_main_dashboard.csv");
  const projectIds = new Set<string>();
  let missingProjectIds = 0;

  for (const row of mainRows) {
    const projectId = (row.Project_ID ?? "").trim();
    if (projectId) projectIds.add(projectId);
    else missingProjectIds += 1;

    for (const flag of [
      "is_gender",
      "is_climate",
      "is_environment",
      "is_biodiversity",
      "is_nutrition",
      "is_desertification"
    ]) {
      const value = (row[flag] ?? "").trim();
      if (value !== "True" && value !== "False") {
        throw new Error(`${flag} must be True or False; received ${value}`);
      }
    }
  }

  assertEqual("main_dashboard missing project_id rows", missingProjectIds, EXPECTED.missingProjectIds);
  assertEqual("main_dashboard non-null unique project_id count", projectIds.size, EXPECTED.uniqueProjectIds);
}

async function validateDatabaseIfConfigured() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set; skipped cleaned database import checks.");
    return;
  }

  const pool = createPool();
  try {
    const { rows: [counts] } = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM analytics_clean.main_dashboard) AS main_rows,
        (SELECT count(*)::int FROM analytics_clean.country_summary) AS country_rows,
        (SELECT count(*)::int FROM analytics_clean.donor_summary) AS donor_rows,
        (SELECT count(*)::int FROM analytics_clean.sector_summary) AS sector_rows,
        (SELECT count(*)::int FROM analytics_clean.donor_portfolio) AS portfolio_rows,
        (SELECT count(*)::int FROM analytics_clean.cause_marker) AS cause_rows,
        (SELECT coalesce(sum(amount_usd), 0)::float FROM analytics_clean.main_dashboard) AS main_total,
        (SELECT coalesce(sum(total_funding), 0)::float FROM analytics_clean.country_summary) AS country_total,
        (SELECT coalesce(sum(total_funding), 0)::float FROM analytics_clean.donor_summary) AS donor_total,
        (SELECT coalesce(sum(total_funding), 0)::float FROM analytics_clean.sector_summary) AS sector_total,
        (SELECT coalesce(sum(total_funding), 0)::float FROM analytics_clean.donor_portfolio) AS portfolio_total,
        (SELECT coalesce(sum(total_funding), 0)::float FROM analytics_clean.cause_marker) AS cause_total,
        (SELECT count(*)::int FROM analytics_clean.main_dashboard WHERE project_id IS NULL) AS missing_project_ids,
        (SELECT count(DISTINCT project_id)::int FROM analytics_clean.main_dashboard WHERE project_id IS NOT NULL) AS unique_project_ids,
        (SELECT count(*)::int FROM analytics_clean.main_dashboard WHERE year_label = '2020-2023' AND year_int IS NULL) AS aggregate_year_rows
    `);

    assertEqual("db main_dashboard row count", counts.main_rows, EXPECTED.mainDashboard.rows);
    assertEqual("db country_summary row count", counts.country_rows, EXPECTED.countrySummary.rows);
    assertEqual("db donor_summary row count", counts.donor_rows, EXPECTED.donorSummary.rows);
    assertEqual("db sector_summary row count", counts.sector_rows, EXPECTED.sectorSummary.rows);
    assertEqual("db donor_portfolio row count", counts.portfolio_rows, EXPECTED.donorPortfolio.rows);
    assertEqual("db cause_marker row count", counts.cause_rows, EXPECTED.causeMarker.rows);
    assertNear("db main_dashboard funding total", counts.main_total, EXPECTED.mainDashboard.sum);
    assertNear("db country_summary funding total", counts.country_total, EXPECTED.countrySummary.sum);
    assertNear("db donor_summary funding total", counts.donor_total, EXPECTED.donorSummary.sum);
    assertNear("db sector_summary funding total", counts.sector_total, EXPECTED.sectorSummary.sum);
    assertNear("db donor_portfolio funding total", counts.portfolio_total, EXPECTED.donorPortfolio.sum);
    assertNear("db cause_marker funding total", counts.cause_total, EXPECTED.causeMarker.sum);
    assertEqual("db missing project_id rows", counts.missing_project_ids, EXPECTED.missingProjectIds);
    assertEqual("db non-null unique project_id count", counts.unique_project_ids, EXPECTED.uniqueProjectIds);
    assertEqual("db aggregate year rows with null year_int", counts.aggregate_year_rows, 3);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "42P01"
    ) {
      console.log("analytics_clean tables not found; skipped database checks until migration/import runs.");
      return;
    }
    throw error;
  } finally {
    await pool.end();
  }
}

async function main() {
  await validateCsvFiles();
  await validateDatabaseIfConfigured();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
