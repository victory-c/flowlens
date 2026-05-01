import { createReadStream } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import type { PoolClient } from "pg";
import { createPool } from "./common";
import "./load-env";

const CLEANED_DATA_DIR = process.env.FLOWLENS_CLEANED_DATA_DIR ?? "./cleaned_data6";
const RAW_CSV_PATH = process.env.FLOWLENS_CSV_PATH ?? "./OECD Dataset.xlsx - complete_p4d3_df.csv";

type CsvRow = Record<string, string | undefined>;
type MainRowContext = {
  donorCountry: string | null;
  flowType: string | null;
};

const FILES = {
  mainDashboard: "01_df_main_dashboard.csv",
  countrySummary: "02_df_country_summary.csv",
  donorSummary: "03_df_donor_summary.csv",
  sectorSummary: "04_df_sector_summary.csv",
  donorPortfolio: "05_df_donor_portfolio.csv",
  causeMarker: "06_df_cause_marker.csv",
  flowSummary: "07_df_flow_summary.csv"
} as const;

const MAIN_COLUMNS = [
  "year_label",
  "year_int",
  "donor",
  "donor_country",
  "region",
  "recipient_country",
  "flow_type",
  "sector_name",
  "amount_usd",
  "project_title",
  "project_id",
  "project_key",
  "is_gender",
  "is_climate",
  "is_environment",
  "is_biodiversity",
  "is_nutrition",
  "is_desertification"
] as const;

const COUNTRY_COLUMNS = [
  "year_label",
  "year_int",
  "region",
  "recipient_country",
  "total_funding",
  "unique_projects"
] as const;

const DONOR_COLUMNS = [
  "year_label",
  "year_int",
  "donor",
  "total_funding",
  "unique_projects",
  "recipient_countries_count"
] as const;

const SECTOR_COLUMNS = ["year_label", "year_int", "sector_name", "total_funding"] as const;
const PORTFOLIO_COLUMNS = ["donor", "sector_name", "total_funding"] as const;
const CAUSE_COLUMNS = ["year_label", "year_int", "total_funding", "unique_projects", "cause"] as const;
const FLOW_COLUMNS = [
  "year_label",
  "year_int",
  "donor_country",
  "region",
  "recipient_country",
  "flow_type",
  "total_funding",
  "unique_projects",
  "exact_geo_flag",
  "recipient_geo_type"
] as const;

function cleanedPath(fileName: string) {
  return path.resolve(process.cwd(), CLEANED_DATA_DIR, fileName);
}

function rawPath() {
  return path.resolve(process.cwd(), RAW_CSV_PATH);
}

function yearParts(value: string | undefined) {
  const yearLabel = requiredText(value, "Year");
  return {
    yearLabel,
    yearInt: /^\d{4}$/.test(yearLabel) ? Number(yearLabel) : null
  };
}

function requiredText(value: string | undefined, label: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new Error(`Missing required value for ${label}`);
  return trimmed;
}

function optionalText(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function numberValue(value: string | undefined, label: string) {
  const parsed = Number((value ?? "").trim());
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number for ${label}: ${value ?? ""}`);
  return parsed;
}

function intValue(value: string | undefined, label: string) {
  const parsed = Number((value ?? "").trim());
  if (!Number.isInteger(parsed)) throw new Error(`Invalid integer for ${label}: ${value ?? ""}`);
  return parsed;
}

function booleanValue(value: string | undefined, label: string) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`Invalid boolean for ${label}: ${value ?? ""}`);
}

async function readCsvRows(fileName: string, onRow: (row: CsvRow, index: number) => void | Promise<void>) {
  let index = 0;
  const parser = createReadStream(cleanedPath(fileName)).pipe(
    parse({
      bom: true,
      columns: true,
      relax_quotes: true,
      skip_empty_lines: true
    })
  );

  for await (const record of parser) {
    index += 1;
    await onRow(record as CsvRow, index);
  }

  return index;
}

async function loadMainRowContext() {
  const context = new Map<string, MainRowContext>();
  const parser = createReadStream(rawPath()).pipe(
    parse({
      bom: true,
      columns: true,
      relax_quotes: true,
      skip_empty_lines: true
    })
  );

  for await (const record of parser) {
    const row = record as CsvRow;
    const projectId = optionalText(row.row_id);
    if (!projectId) continue;
    context.set(projectId, {
      donorCountry: optionalText(row.Donor_country),
      flowType: optionalText(row.type_of_flow)
    });
  }

  console.log(`Loaded ${context.size} raw row contexts from ${RAW_CSV_PATH}.`);
  return context;
}

async function flush(client: PoolClient, table: string, columns: readonly string[], batch: unknown[][]) {
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
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${groups.join(", ")}`,
    values
  );
}

async function loadTable(
  client: PoolClient,
  fileName: string,
  table: string,
  columns: readonly string[],
  mapRow: (row: CsvRow, index: number) => unknown[]
) {
  const batch: unknown[][] = [];
  let totalFunding = 0;

  const rowCount = await readCsvRows(fileName, async (row, index) => {
    const values = mapRow(row, index);
    batch.push(values);
    const amount = values.find((value, valueIndex) => {
      const column = columns[valueIndex];
      return column === "amount_usd" || column === "total_funding";
    });
    if (typeof amount === "number") totalFunding += amount;

    if (batch.length >= 400) {
      await flush(client, table, columns, batch);
      batch.length = 0;
    }
  });

  await flush(client, table, columns, batch);
  console.log(`Imported ${rowCount} rows into ${table}; funding total ${totalFunding.toFixed(3)}.`);
}

async function main() {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`
      TRUNCATE
        analytics_clean.main_dashboard,
        analytics_clean.country_summary,
        analytics_clean.donor_summary,
        analytics_clean.sector_summary,
        analytics_clean.donor_portfolio,
        analytics_clean.cause_marker,
        analytics_clean.flow_summary
      RESTART IDENTITY
    `);

    const mainRowContext = await loadMainRowContext();

    await loadTable(
      client,
      FILES.mainDashboard,
      "analytics_clean.main_dashboard",
      MAIN_COLUMNS,
      (row, index) => {
        const { yearLabel, yearInt } = yearParts(row.Year);
        const projectId = optionalText(row.Project_ID);
        const context = projectId ? mainRowContext.get(projectId) : undefined;
        return [
          yearLabel,
          yearInt,
          requiredText(row.Donor, "Donor"),
          context?.donorCountry ?? null,
          requiredText(row.Region, "Region"),
          requiredText(row.Recipient_Country, "Recipient_Country"),
          context?.flowType ?? null,
          requiredText(row.Sector_Name, "Sector_Name"),
          numberValue(row.Amount_USD, "Amount_USD"),
          optionalText(row.Project_Title),
          projectId,
          projectId ?? `missing-project-${index}`,
          booleanValue(row.is_gender, "is_gender"),
          booleanValue(row.is_climate, "is_climate"),
          booleanValue(row.is_environment, "is_environment"),
          booleanValue(row.is_biodiversity, "is_biodiversity"),
          booleanValue(row.is_nutrition, "is_nutrition"),
          booleanValue(row.is_desertification, "is_desertification")
        ];
      }
    );

    await loadTable(
      client,
      FILES.countrySummary,
      "analytics_clean.country_summary",
      COUNTRY_COLUMNS,
      (row) => {
        const { yearLabel, yearInt } = yearParts(row.Year);
        return [
          yearLabel,
          yearInt,
          requiredText(row.Region, "Region"),
          requiredText(row.Recipient_Country, "Recipient_Country"),
          numberValue(row.Total_Funding, "Total_Funding"),
          intValue(row.Unique_Projects, "Unique_Projects")
        ];
      }
    );

    await loadTable(
      client,
      FILES.donorSummary,
      "analytics_clean.donor_summary",
      DONOR_COLUMNS,
      (row) => {
        const { yearLabel, yearInt } = yearParts(row.Year);
        return [
          yearLabel,
          yearInt,
          requiredText(row.Donor, "Donor"),
          numberValue(row.Total_Funding, "Total_Funding"),
          intValue(row.Unique_Projects, "Unique_Projects"),
          intValue(row.Recipient_Countries_Count, "Recipient_Countries_Count")
        ];
      }
    );

    await loadTable(
      client,
      FILES.sectorSummary,
      "analytics_clean.sector_summary",
      SECTOR_COLUMNS,
      (row) => {
        const { yearLabel, yearInt } = yearParts(row.Year);
        return [
          yearLabel,
          yearInt,
          requiredText(row.Sector_Name, "Sector_Name"),
          numberValue(row.Total_Funding, "Total_Funding")
        ];
      }
    );

    await loadTable(
      client,
      FILES.donorPortfolio,
      "analytics_clean.donor_portfolio",
      PORTFOLIO_COLUMNS,
      (row) => [
        requiredText(row.Donor, "Donor"),
        requiredText(row.Sector_Name, "Sector_Name"),
        numberValue(row.Total_Funding, "Total_Funding")
      ]
    );

    await loadTable(
      client,
      FILES.causeMarker,
      "analytics_clean.cause_marker",
      CAUSE_COLUMNS,
      (row) => {
        const { yearLabel, yearInt } = yearParts(row.Year);
        if (yearInt === null) throw new Error(`Cause marker Year must be numeric: ${yearLabel}`);
        return [
          yearLabel,
          yearInt,
          numberValue(row.Total_Funding, "Total_Funding"),
          intValue(row.Unique_Projects, "Unique_Projects"),
          requiredText(row.Cause, "Cause")
        ];
      }
    );

    await loadTable(
      client,
      FILES.flowSummary,
      "analytics_clean.flow_summary",
      FLOW_COLUMNS,
      (row) => {
        const { yearLabel, yearInt } = yearParts(row.Year);
        return [
          yearLabel,
          yearInt,
          requiredText(row.Donor_Country, "Donor_Country"),
          requiredText(row.Region, "Region"),
          requiredText(row.Recipient_Country, "Recipient_Country"),
          requiredText(row.Flow_Type, "Flow_Type"),
          numberValue(row.Total_Funding, "Total_Funding"),
          intValue(row.Unique_Projects, "Unique_Projects"),
          booleanValue(row.Exact_Geo_Flag, "Exact_Geo_Flag"),
          requiredText(row.Recipient_Geo_Type, "Recipient_Geo_Type")
        ];
      }
    );

    await client.query("COMMIT");
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
