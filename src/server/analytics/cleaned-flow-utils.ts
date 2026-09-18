import type { CaveatTag, DashboardFilters } from "@/shared/contracts/dashboard-data";

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function normalizedToken(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const REGION_SYNONYMS: Record<string, string[]> = {
  Africa: ["Africa", "Afrique", "Afrika", "África"],
  Americas: ["Americas", "America", "América", "North America", "South America", "Latin America"],
  Asia: ["Asia", "Asie", "Ásia"],
  Europe: ["Europe", "Europa", "Europé"],
  Oceania: ["Oceania", "Oceanía", "Océanie", "Pacific"],
  "Middle East": ["Middle East", "Moyen Orient", "Oriente Medio", "Medio Oriente"],
  Global: ["Global", "World", "Worldwide", "Mundial", "Global or unspecified", "GLOBAL or unspecified"],
  "Multiple regions": ["Multiple regions"],
  Unknown: ["Unknown", "Other", "Unspecified", "N/A"]
};

const REGION_ALIAS = Object.entries(REGION_SYNONYMS).reduce<Record<string, string>>((map, [canonical, variants]) => {
  for (const variant of variants) map[normalizedToken(variant)] = canonical;
  map[normalizedToken(canonical)] = canonical;
  return map;
}, {});

const REGION_FILTER_VALUES = Object.entries(REGION_SYNONYMS).reduce<Record<string, string[]>>(
  (map, [canonical, variants]) => {
    map[canonical] = unique([canonical, ...variants]);
    return map;
  },
  {}
);

export function normalizeRegionLabel(input: string | null | undefined) {
  if (!input) return "Unknown";
  const trimmed = input.trim();
  if (!trimmed) return "Unknown";
  if (trimmed.includes(";")) return "Multiple regions";
  const normalized = normalizedToken(trimmed);
  return REGION_ALIAS[normalized] ?? trimmed;
}

export function regionFilterValues(input: string) {
  const canonical = normalizeRegionLabel(input);
  const candidates = REGION_FILTER_VALUES[canonical];
  if (!candidates) return unique([input, canonical]);
  return unique([input, canonical, ...candidates]);
}

export function summarizedFlowType(values: unknown) {
  if (!Array.isArray(values)) return "Cross-border";
  const flowTypes = unique(values.map(String).filter(Boolean));
  if (flowTypes.length === 0) return "Cross-border";
  if (flowTypes.length === 1) return flowTypes[0];
  return "Mixed";
}

export function summarizedRecipientGeoType(values: unknown) {
  if (!Array.isArray(values)) return "exact_country";
  const geoTypes = unique(values.map(String).filter(Boolean));
  if (geoTypes.length === 0) return "exact_country";
  if (geoTypes.length === 1) return geoTypes[0] === "regional" ? "unspecified" : geoTypes[0];
  if (geoTypes.includes("exact_country")) return "mixed";
  if (geoTypes.includes("regional")) return "unspecified";
  if (geoTypes.includes("unspecified")) return "unspecified";
  if (geoTypes.includes("unmapped")) return "unmapped";
  return "mixed";
}

export function recipientGeoTypeFromLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return "unmapped";
  if (normalized.includes("regional")) return "unspecified";
  if (normalized.includes("unspecified") || normalized === "global or unspecified") return "unspecified";
  return "exact_country";
}

export function normalizeRecipientCountryLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized.includes("regional")) return label;
  if (normalized.includes("unspecified") || normalized === "global or unspecified") {
    return "Bilateral, unspecified";
  }
  return label;
}

export function recipientCaveats(
  recipientCountry: string,
  options: { hasAggregateYear?: boolean; flowType?: string } = {}
): CaveatTag[] {
  const normalized = recipientCountry.trim().toLowerCase();
  const caveats: CaveatTag[] = [];

  if (
    normalized.includes("regional") ||
    normalized.includes("unspecified") ||
    normalized === "global or unspecified"
  ) {
    caveats.push("unspecified_recipient");
  }
  if (options.hasAggregateYear) caveats.push("multi_year_aggregate");
  if ((options.flowType ?? "").toLowerCase() === "domestic") caveats.push("domestic_flow");

  return unique(caveats);
}

export function buildFlowFilteredCte(
  filters: DashboardFilters,
  options: { organizationFilterActive: boolean },
  existingParams: unknown[] = []
) {
  const params = [...existingParams];
  const where = ["1 = 1"];
  const unsupported: string[] = [];

  const addTextFilter = (column: string, value: string | undefined) => {
    if (!value) return;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  };

  addTextFilter("year_label", filters.year);
  addTextFilter("donor_country", filters.donorCountry);
  addTextFilter("recipient_country", filters.recipientCountry);
  if (filters.connectedCountry) {
    params.push(filters.connectedCountry);
    where.push(`(donor_country = $${params.length} OR recipient_country = $${params.length})`);
  }
  if (filters.region) {
    params.push(regionFilterValues(filters.region));
    where.push(`region = ANY($${params.length}::text[])`);
  }

  if (filters.minAmount !== undefined) {
    params.push(filters.minAmount);
    where.push(`total_funding >= $${params.length}`);
  }

  if (!filters.includeDomestic) {
    where.push(`flow_type <> 'Domestic'`);
  }

  if (filters.cause) unsupported.push("cause");
  if (options.organizationFilterActive) unsupported.push("organization");
  if (filters.tableQ) unsupported.push("tableQ");
  if (filters.q) unsupported.push("q");
  if (filters.sector) unsupported.push("sector");
  if (filters.outlierOnly) unsupported.push("outlierOnly");

  return {
    params,
    unsupported,
    cte: `
      WITH flow_filtered AS (
        SELECT
          year_label,
          year_int,
          donor_country,
          region,
          recipient_country,
          flow_type,
          total_funding,
          unique_projects,
          exact_geo_flag,
          recipient_geo_type
        FROM analytics_clean.flow_summary
        WHERE ${where.join("\n          AND ")}
      )
    `
  };
}
