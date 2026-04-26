import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}

for (const fileName of [".env.local", ".env"]) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) continue;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] === undefined) process.env[key] = parseEnvValue(rawValue);
  }
}

const RAW_CSV_PATH =
  process.env.FLOWLENS_CSV_PATH ?? "./OECD Dataset.xlsx - complete_p4d3_df.csv";
const GEO_LOOKUP_PATH = "./data/lookup/geo_lookup.csv";
const OUTPUT_PATH =
  process.env.FLOWLENS_FLOW_SUMMARY_PATH ?? "./cleaned_data6/07_df_flow_summary.csv";

const OUTPUT_COLUMNS = [
  "Year",
  "Donor_Country",
  "Region",
  "Recipient_Country",
  "Flow_Type",
  "Total_Funding",
  "Unique_Projects",
  "Exact_Geo_Flag",
  "Recipient_Geo_Type"
];

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function normalizeText(value, fallback = "Unknown / Not reported") {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

function parseGeoType(value, exactLookup) {
  const label = normalizeText(value).toLowerCase();
  if (exactLookup.has(label)) return "exact_country";
  if (label.includes("regional")) return "regional";
  if (label.includes("unspecified") || label.includes("global")) return "unspecified";
  if (!label.includes(";")) return "exact_country";
  return "unmapped";
}

async function loadExactCountryLookup() {
  const exactLookup = new Set();
  const parser = fs.createReadStream(path.resolve(process.cwd(), GEO_LOOKUP_PATH)).pipe(
    parse({
      bom: true,
      columns: true,
      relax_quotes: true,
      skip_empty_lines: true
    })
  );

  for await (const row of parser) {
    if ((row.is_exact_country ?? "").toString().toLowerCase() === "true") {
      exactLookup.add((row.country_label ?? "").toString().trim().toLowerCase());
    }
  }

  return exactLookup;
}

async function main() {
  const exactLookup = await loadExactCountryLookup();
  const aggregates = new Map();

  let totalRows = 0;
  let keptRows = 0;
  let droppedRows = 0;

  const parser = fs.createReadStream(path.resolve(process.cwd(), RAW_CSV_PATH)).pipe(
    parse({
      bom: true,
      columns: true,
      relax_quotes: true,
      skip_empty_lines: false
    })
  );

  for await (const row of parser) {
    totalRows += 1;
    const amount = parseNumber(row.usd_disbursements_defl);
    if (amount === null || amount <= 0) {
      droppedRows += 1;
      continue;
    }

    keptRows += 1;

    const year = normalizeText(row.year);
    const donorCountry = normalizeText(row.Donor_country);
    const recipientCountry = normalizeText(row.country);
    const region = normalizeText(row.region_macro ?? row.region);
    const flowType = normalizeText(row.type_of_flow);
    const projectKey = normalizeText(row.row_id, `missing-row-${totalRows}`);

    const recipientGeoType = parseGeoType(recipientCountry, exactLookup);
    const donorGeoType = parseGeoType(donorCountry, exactLookup);
    const exactGeoFlag = recipientGeoType === "exact_country" && donorGeoType === "exact_country";

    const key = [year, donorCountry, region, recipientCountry, flowType].join("\u001f");
    const current =
      aggregates.get(key) ??
      {
        Year: year,
        Donor_Country: donorCountry,
        Region: region,
        Recipient_Country: recipientCountry,
        Flow_Type: flowType,
        Total_Funding: 0,
        projects: new Set(),
        Exact_Geo_Flag: exactGeoFlag,
        Recipient_Geo_Type: recipientGeoType
      };

    current.Total_Funding += amount;
    current.projects.add(projectKey);
    current.Exact_Geo_Flag = current.Exact_Geo_Flag || exactGeoFlag;

    // Keep the strictest available geography label if mixed.
    if (current.Recipient_Geo_Type !== recipientGeoType) {
      const rank = {
        exact_country: 3,
        regional: 2,
        unspecified: 1,
        unmapped: 0
      };
      if (rank[recipientGeoType] > rank[current.Recipient_Geo_Type]) {
        current.Recipient_Geo_Type = recipientGeoType;
      }
    }

    aggregates.set(key, current);
  }

  const rows = Array.from(aggregates.values())
    .map((item) => ({
      Year: item.Year,
      Donor_Country: item.Donor_Country,
      Region: item.Region,
      Recipient_Country: item.Recipient_Country,
      Flow_Type: item.Flow_Type,
      Total_Funding: item.Total_Funding,
      Unique_Projects: item.projects.size,
      Exact_Geo_Flag: item.Exact_Geo_Flag ? "true" : "false",
      Recipient_Geo_Type: item.Recipient_Geo_Type
    }))
    .sort((a, b) => {
      const yearA = /^\d{4}$/.test(a.Year) ? Number(a.Year) : 9999;
      const yearB = /^\d{4}$/.test(b.Year) ? Number(b.Year) : 9999;
      if (yearA !== yearB) return yearA - yearB;
      if (a.Year !== b.Year) return a.Year.localeCompare(b.Year);
      if (a.Donor_Country !== b.Donor_Country) return a.Donor_Country.localeCompare(b.Donor_Country);
      if (a.Recipient_Country !== b.Recipient_Country) {
        return a.Recipient_Country.localeCompare(b.Recipient_Country);
      }
      if (a.Flow_Type !== b.Flow_Type) return a.Flow_Type.localeCompare(b.Flow_Type);
      return b.Total_Funding - a.Total_Funding;
    });

  const outputDir = path.dirname(path.resolve(process.cwd(), OUTPUT_PATH));
  fs.mkdirSync(outputDir, { recursive: true });

  const header = OUTPUT_COLUMNS.join(",");
  const lines = rows.map((row) =>
    OUTPUT_COLUMNS.map((column) => escapeCsv(row[column])).join(",")
  );
  fs.writeFileSync(path.resolve(process.cwd(), OUTPUT_PATH), `${header}\n${lines.join("\n")}\n`, "utf8");

  const totalFunding = rows.reduce((sum, row) => sum + row.Total_Funding, 0);
  console.log(`Generated ${rows.length} flow rows at ${OUTPUT_PATH}`);
  console.log(`Input rows: ${totalRows}, kept: ${keptRows}, dropped (missing/non-positive): ${droppedRows}`);
  console.log(`Flow total funding: ${totalFunding}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
