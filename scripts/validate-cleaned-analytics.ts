import { createReadStream } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { assertEqual, assertNear } from "./common";
import "./load-env";

type CsvRow = Record<string, string | undefined>;

type Aggregate = {
  total: number;
  projects: Set<string>;
  recipients: Set<string>;
};

const CLEANED_DATA_DIR = process.env.FLOWLENS_CLEANED_DATA_DIR ?? "./cleaned_data6";
const EPSILON = 0.001;

const CAUSE_FLAGS = [
  ["Gender", "is_gender"],
  ["Climate", "is_climate"],
  ["Environment", "is_environment"],
  ["Biodiversity", "is_biodiversity"],
  ["Nutrition", "is_nutrition"],
  ["Desertification", "is_desertification"]
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

function integer(value: string | undefined) {
  const parsed = Number((value ?? "").trim());
  if (!Number.isInteger(parsed)) throw new Error(`Invalid integer value: ${value ?? ""}`);
  return parsed;
}

function key(...parts: Array<string | undefined>) {
  return parts.map((part) => part ?? "").join("\u001f");
}

function addAggregate(
  map: Map<string, Aggregate>,
  groupKey: string,
  total: number,
  projectId: string | null,
  recipient?: string
) {
  const existing = map.get(groupKey) ?? { total: 0, projects: new Set<string>(), recipients: new Set<string>() };
  existing.total += total;
  if (projectId) existing.projects.add(projectId);
  if (recipient) existing.recipients.add(recipient);
  map.set(groupKey, existing);
}

function assertGroupedTotals(
  label: string,
  actual: Map<string, Aggregate>,
  expected: Map<string, { total: number; projects?: number; recipients?: number }>
) {
  assertEqual(`${label} group count`, actual.size, expected.size);

  for (const [groupKey, expectedValue] of expected) {
    const actualValue = actual.get(groupKey);
    if (!actualValue) throw new Error(`${label} missing group ${groupKey}`);
    if (Math.abs(actualValue.total - expectedValue.total) > EPSILON) {
      throw new Error(
        `${label} total mismatch for ${groupKey}: expected ${expectedValue.total}, received ${actualValue.total}`
      );
    }
    if (expectedValue.projects !== undefined) {
      if (actualValue.projects.size !== expectedValue.projects) {
        throw new Error(
          `${label} unique projects mismatch for ${groupKey}: expected ${expectedValue.projects}, received ${actualValue.projects.size}`
        );
      }
    }
    if (expectedValue.recipients !== undefined) {
      if (actualValue.recipients.size !== expectedValue.recipients) {
        throw new Error(
          `${label} recipient countries mismatch for ${groupKey}: expected ${expectedValue.recipients}, received ${actualValue.recipients.size}`
        );
      }
    }
  }
}

async function main() {
  const [mainRows, countryRows, donorRows, sectorRows, portfolioRows, causeRows] = await Promise.all([
    readRows("01_df_main_dashboard.csv"),
    readRows("02_df_country_summary.csv"),
    readRows("03_df_donor_summary.csv"),
    readRows("04_df_sector_summary.csv"),
    readRows("05_df_donor_portfolio.csv"),
    readRows("06_df_cause_marker.csv")
  ]);

  const countryActual = new Map<string, Aggregate>();
  const donorActual = new Map<string, Aggregate>();
  const sectorActual = new Map<string, Aggregate>();
  const portfolioActual = new Map<string, Aggregate>();
  const causeActual = new Map<string, Aggregate>();
  let mainTotal = 0;

  mainRows.forEach((row) => {
    const amount = numeric(row.Amount_USD);
    const projectId = (row.Project_ID ?? "").trim() || null;
    mainTotal += amount;

    addAggregate(
      countryActual,
      key(row.Year, row.Region, row.Recipient_Country),
      amount,
      projectId,
      row.Recipient_Country
    );
    addAggregate(donorActual, key(row.Year, row.Donor), amount, projectId, row.Recipient_Country);
    addAggregate(sectorActual, key(row.Year, row.Sector_Name), amount, projectId);
    addAggregate(portfolioActual, key(row.Donor, row.Sector_Name), amount, projectId);

    for (const [cause, flag] of CAUSE_FLAGS) {
      if ((row[flag] ?? "").trim() === "True") {
        addAggregate(causeActual, key(row.Year, cause), amount, projectId);
      }
    }
  });

  const countryExpected = new Map(
    countryRows.map((row) => [
      key(row.Year, row.Region, row.Recipient_Country),
      { total: numeric(row.Total_Funding), projects: integer(row.Unique_Projects) }
    ])
  );
  const donorExpected = new Map(
    donorRows.map((row) => [
      key(row.Year, row.Donor),
      {
        total: numeric(row.Total_Funding),
        projects: integer(row.Unique_Projects),
        recipients: integer(row.Recipient_Countries_Count)
      }
    ])
  );
  const sectorExpected = new Map(
    sectorRows.map((row) => [key(row.Year, row.Sector_Name), { total: numeric(row.Total_Funding) }])
  );
  const portfolioExpected = new Map(
    portfolioRows.map((row) => [key(row.Donor, row.Sector_Name), { total: numeric(row.Total_Funding) }])
  );
  const causeExpected = new Map(
    causeRows.map((row) => [
      key(row.Year, row.Cause),
      { total: numeric(row.Total_Funding), projects: integer(row.Unique_Projects) }
    ])
  );

  assertGroupedTotals("country_summary vs main_dashboard", countryActual, countryExpected);
  assertGroupedTotals("donor_summary vs main_dashboard", donorActual, donorExpected);
  assertGroupedTotals("sector_summary vs main_dashboard", sectorActual, sectorExpected);
  assertGroupedTotals("donor_portfolio vs main_dashboard", portfolioActual, portfolioExpected);
  assertGroupedTotals("cause_marker vs main_dashboard flags", causeActual, causeExpected);

  const causeTotal = causeRows.reduce((sum, row) => sum + numeric(row.Total_Funding), 0);
  if (Math.abs(causeTotal - mainTotal) < EPSILON) {
    throw new Error("Cause marker total unexpectedly equals total disbursement; cause markers should overlap.");
  }

  assertNear("main dashboard total", mainTotal, 68_237.10386159879);
  assertNear("overlapping cause marker total", causeTotal, 19_916.26334988957);
  console.log("ok: cleaned analytics summaries reconcile and cause markers remain overlap-aware");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
