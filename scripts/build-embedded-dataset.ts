// Builds the gzipped CSV snapshot that the embedded (PGlite) database loads at runtime.
// Mirrors scripts/import-cleaned-csvs.ts, but writes files into data/embedded/ instead of
// inserting into a hosted Postgres, so the deployed app needs no external database.
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { parse } from "csv-parse";
import {
  EMBEDDED_DATA_DIR,
  EMBEDDED_FILES,
  FLOW_COLUMNS,
  MAIN_COLUMNS
} from "../src/server/analytics/embedded-schema";
import "./load-env";

const CLEANED_DATA_DIR = process.env.FLOWLENS_CLEANED_DATA_DIR ?? "./cleaned_data6";
const RAW_CSV_PATH = process.env.FLOWLENS_CSV_PATH ?? "./OECD Dataset.xlsx - complete_p4d3_df.csv";

type CsvRow = Record<string, string | undefined>;

function requiredText(value: string | undefined, label: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new Error(`Missing required value for ${label}`);
  return trimmed;
}

function optionalText(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function yearParts(value: string | undefined) {
  const yearLabel = requiredText(value, "Year");
  return { yearLabel, yearInt: /^\d{4}$/.test(yearLabel) ? Number(yearLabel) : null };
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

async function* readCsv(filePath: string) {
  const parser = createReadStream(path.resolve(process.cwd(), filePath)).pipe(
    parse({ bom: true, columns: true, relax_quotes: true, skip_empty_lines: true })
  );
  for await (const record of parser) yield record as CsvRow;
}

async function loadMainRowContext() {
  const context = new Map<string, { donorCountry: string | null; flowType: string | null }>();
  for await (const row of readCsv(RAW_CSV_PATH)) {
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

// NULL is written as an unquoted empty field; COPY ... CSV reads that back as NULL,
// while empty strings never occur because every text value is trimmed-or-null.
function toCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeGzippedCsv(fileName: string, columns: readonly string[], rows: unknown[][]) {
  const lines = [columns.join(","), ...rows.map((row) => row.map(toCell).join(","))];
  const csv = `${lines.join("\n")}\n`;
  const outPath = path.resolve(process.cwd(), EMBEDDED_DATA_DIR, fileName);
  const gz = gzipSync(csv, { level: 9 });
  writeFileSync(outPath, gz);
  console.log(`Wrote ${rows.length} rows to ${outPath} (${(gz.length / 1024 / 1024).toFixed(2)} MB gzipped).`);
}

async function main() {
  mkdirSync(path.resolve(process.cwd(), EMBEDDED_DATA_DIR), { recursive: true });
  const mainRowContext = await loadMainRowContext();

  const mainRows: unknown[][] = [];
  let index = 0;
  for await (const row of readCsv(path.join(CLEANED_DATA_DIR, "01_df_main_dashboard.csv"))) {
    index += 1;
    const { yearLabel, yearInt } = yearParts(row.Year);
    const projectId = optionalText(row.Project_ID);
    const context = projectId ? mainRowContext.get(projectId) : undefined;
    mainRows.push([
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
    ]);
  }
  writeGzippedCsv(EMBEDDED_FILES.mainDashboard, MAIN_COLUMNS, mainRows);

  const flowRows: unknown[][] = [];
  for await (const row of readCsv(path.join(CLEANED_DATA_DIR, "07_df_flow_summary.csv"))) {
    const { yearLabel, yearInt } = yearParts(row.Year);
    flowRows.push([
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
    ]);
  }
  writeGzippedCsv(EMBEDDED_FILES.flowSummary, FLOW_COLUMNS, flowRows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
