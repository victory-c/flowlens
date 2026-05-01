import { query } from "./db";
import { cached } from "./cache";
import { canonicalCleanedKey } from "./cleaned-query-params";
import { getCountryMetadataMap, resolveCountryMeta } from "./country-metadata";
import {
  buildFlowFilteredCte,
  normalizeRecipientCountryLabel,
  normalizeRegionLabel,
  recipientCaveats,
  recipientGeoTypeFromLabel,
  regionFilterValues,
  summarizedFlowType,
  summarizedRecipientGeoType
} from "./cleaned-flow-utils";
import {
  AMOUNT_UNIT,
  type CountrySummaryResponse,
  DATA_SOURCE,
  DATA_VERSION,
  type Cause,
  type CauseSummaryRow,
  type DashboardCharts,
  type DashboardDataRequest,
  type DashboardDataResponse,
  type DashboardFilters,
  type DashboardSummaryResponse,
  type DashboardWarning,
  type FilterOption,
  type FilterOptionsResponse,
  type FlowSummaryResponse,
  type GlobeFlow,
  type GlobeFlowsResponse,
  type InsightCard,
  type KpiResponse,
  type OverviewMetrics,
  type ProjectDetailResponse,
  type ProjectPageQuery,
  type ProjectPageResponse,
  type RawTableResponse,
  type RawTableRow,
  type YearlyFundingDatum,
  type YearlySummaryRow
} from "@/shared/contracts/dashboard-data";

type PgRow = Record<string, unknown>;

const CACHE_DAY = 86_400_000;

const CAUSE_CONFIG: Array<{ label: Cause; column: string }> = [
  { label: "Gender", column: "is_gender" },
  { label: "Climate", column: "is_climate" },
  { label: "Environment", column: "is_environment" },
  { label: "Biodiversity", column: "is_biodiversity" },
  { label: "Nutrition", column: "is_nutrition" },
  { label: "Desertification", column: "is_desertification" }
];

function num(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function yearOrderValue(label: string) {
  const match = label.match(/\d{4}/);
  if (!match) return Number.POSITIVE_INFINITY;
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) ? year : Number.POSITIVE_INFINITY;
}

function sortedYearLabels(values: unknown) {
  if (!Array.isArray(values)) return [];
  return unique(values.map(String)).sort((a, b) => {
    const yearDiff = yearOrderValue(a) - yearOrderValue(b);
    if (yearDiff !== 0) return yearDiff;
    return a.localeCompare(b);
  });
}

function causeColumn(cause: Cause) {
  return CAUSE_CONFIG.find((item) => item.label === cause)?.column;
}

function causesFromRow(row: PgRow): Cause[] {
  return CAUSE_CONFIG.filter((item) => Boolean(row[item.column])).map((item) => item.label);
}

function continentFromCoordinates(lat: number, lng: number) {
  if (lat <= -58) return "Antarctica";
  if (lng < -20) return lat >= 12 ? "North America" : "South America";
  if (lat >= -36 && lat <= 38 && lng >= -25 && lng <= 63) return "Africa";
  if (lat >= 35 && lng >= -12 && lng <= 60) return "Europe";
  if (lat < -8 && lng >= 105) return "Oceania";
  return "Asia";
}

function donorContinentLabel(country: {
  latitude: number | null;
  longitude: number | null;
}) {
  if (country.latitude === null || country.longitude === null) return "Unmapped";
  return continentFromCoordinates(country.latitude, country.longitude);
}

function baseWarnings(filters: DashboardFilters): DashboardWarning[] {
  const warnings: DashboardWarning[] = [
    {
      code: "DISBURSEMENT_ONLY",
      message: "Funding shown is actual disbursement in USD millions, deflated to 2023 constant values."
    },
    {
      code: "CAUSE_MARKERS_OVERLAP",
      message: "Cause categories may overlap because one donation can have multiple markers."
    }
  ];

  if (filters.year === "2020-2023") {
    warnings.push({
      code: "AGGREGATE_YEAR",
      message: "2020-2023 is a combined reporting period (NDA-restricted), not a single continuous year."
    });
  }

  return warnings;
}

function withMetadata<T>(
  view: DashboardDataRequest["view"],
  filters: DashboardFilters,
  data: T,
  warnings = baseWarnings(filters)
): DashboardDataResponse<T> {
  return {
    dataVersion: DATA_VERSION,
    amountUnit: AMOUNT_UNIT,
    source: DATA_SOURCE,
    view,
    filtersApplied: filters,
    warnings,
    data
  };
}

function filterWarnings(unsupported: string[]): DashboardWarning[] {
  if (!unsupported.length) return [];
  return [
    {
      code: "UNSUPPORTED_FILTERS",
      message: `Some filters are not available for this view and were ignored: ${unsupported.join(", ")}.`
    }
  ];
}

function organizationValue(filters: DashboardFilters) {
  return filters.organization ?? filters.donor;
}

const MAIN_SEARCH_OPTIONS = {
  includeTextSearch: true,
  includeTableSearch: true
} as const;

function mainFilteredCte(
  filters: DashboardFilters,
  existingParams: unknown[] = [],
  options: { includeTextSearch?: boolean; includeTableSearch?: boolean } = {}
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
  addTextFilter("donor", organizationValue(filters));
  addTextFilter("sector_name", filters.sector);
  if (filters.connectedCountry) {
    params.push(filters.connectedCountry);
    where.push(`(donor_country = $${params.length} OR recipient_country = $${params.length})`);
  }
  if (filters.region) {
    params.push(regionFilterValues(filters.region));
    where.push(`region = ANY($${params.length}::text[])`);
  }

  if (filters.cause) {
    const column = causeColumn(filters.cause);
    if (column) where.push(`${column} = true`);
  }

  if (filters.minAmount !== undefined) {
    params.push(filters.minAmount);
    where.push(`amount_usd >= $${params.length}`);
  }

  if (filters.outlierOnly) {
    where.push("amount_usd >= 14.8");
  }

  if (!filters.includeDomestic) {
    where.push("coalesce(flow_type, '') <> 'Domestic'");
  }

  if (options.includeTextSearch && filters.q) {
    params.push(`%${filters.q.toLowerCase()}%`);
    where.push(
      `(lower(coalesce(project_title, '')) LIKE $${params.length} OR lower(coalesce(donor, '')) LIKE $${params.length})`
    );
  }

  if (options.includeTableSearch && filters.tableQ) {
    params.push(`%${filters.tableQ.toLowerCase()}%`);
    where.push(`search_text LIKE $${params.length}`);
  } else if (filters.tableQ) {
    unsupported.push("tableQ");
  }

  return {
    params,
    unsupported,
    cte: `
      WITH filtered AS (
        SELECT
          id,
          year_label,
          year_int,
          donor,
          donor_country,
          region,
          recipient_country,
          flow_type,
          sector_name,
          amount_usd,
          project_title,
          project_id,
          project_key,
          is_gender,
          is_climate,
          is_environment,
          is_biodiversity,
          is_nutrition,
          is_desertification
        FROM analytics_clean.main_dashboard
        WHERE ${where.join("\n          AND ")}
      )
    `
  };
}


function listSortClause(sortBy: DashboardDataRequest["sortBy"], sortDir: DashboardDataRequest["sortDir"]) {
  const direction = sortDir === "asc" ? "ASC" : "DESC";
  const columns: Partial<Record<DashboardDataRequest["sortBy"], string>> = {
    amount: "total_funding",
    total_funding: "total_funding",
    unique_projects: "unique_projects",
    year: "year_int",
    donorCountry: "donor_country",
    recipientCountry: "recipient_country",
    organization: "organization",
    region: "region",
    cause: "cause",
    donor: "organization",
    recipient: "recipient_country",
    sector_name: "sector_name",
    sector: "sector_name"
  };

  return `${columns[sortBy] ?? "total_funding"} ${direction} NULLS LAST`;
}

function rawSortClause(sortBy: DashboardDataRequest["sortBy"], sortDir: DashboardDataRequest["sortDir"]) {
  const direction = sortDir === "asc" ? "ASC" : "DESC";
  const columns: Partial<Record<DashboardDataRequest["sortBy"], string>> = {
    amount: "amount_usd",
    year: "year_int",
    donorCountry: "donor_country",
    organization: "donor",
    recipientCountry: "recipient_country",
    region: "region",
    sector: "sector_name",
    sector_name: "sector_name",
    project_key: "project_key"
  };

  return `${columns[sortBy] ?? "amount_usd"} ${direction} NULLS LAST, id ASC`;
}

function filtersFromRequest(request: DashboardDataRequest): DashboardFilters {
  const {
    year,
    cause,
    donorCountry,
    recipientCountry,
    connectedCountry,
    region,
    organization,
    donor,
    sector,
    minAmount,
    tableQ,
    q,
    viewMode,
    includeDomestic,
    outlierOnly
  } = request;
  return {
    year,
    cause,
    donorCountry,
    recipientCountry,
    connectedCountry,
    region,
    organization,
    donor,
    sector,
    minAmount,
    tableQ,
    q,
    viewMode,
    includeDomestic,
    outlierOnly
  };
}

function rawRow(row: PgRow): RawTableRow {
  return {
    id: num(row.id),
    yearLabel: String(row.year_label),
    organization: String(row.donor),
    donorCountry: str(row.donor_country),
    recipientCountry: String(row.recipient_country),
    flowType: str(row.flow_type),
    region: normalizeRegionLabel(String(row.region ?? "Unknown")),
    sectorName: String(row.sector_name),
    amountUsd: num(row.amount_usd),
    projectTitle: str(row.project_title),
    projectId: str(row.project_id),
    projectKey: String(row.project_key),
    isAggregate: row.year_int === null,
    causes: causesFromRow(row)
  };
}

export class CleanedAnalyticsRepository {
  async getCleanedView(request: DashboardDataRequest): Promise<DashboardDataResponse> {
    const filters = filtersFromRequest(request);

    switch (request.view) {
      case "globe_flows": {
        const result = await this.getGlobeFlows(filters);
        return withMetadata(
          request.view,
          filters,
          result,
          baseWarnings(filters).concat(filterWarnings(result.unsupportedFilters))
        );
      }
      case "overview_metrics":
        return withMetadata(request.view, filters, await this.getOverviewMetrics(filters));
      case "country_summary":
        return withMetadata(request.view, filters, await this.getCountrySummary(request));
      case "flow_summary":
        return withMetadata(request.view, filters, await this.getFlowSummary(request));
      case "cause_summary":
      case "cause_marker":
        return withMetadata(request.view, filters, await this.getCauseSummary(request));
      case "yearly_summary":
        return withMetadata(request.view, filters, await this.getYearlySummary(request));
      case "raw_table":
      case "main_dashboard":
        return withMetadata(request.view, filters, await this.getRawTable(request));
      case "filter_options":
        return withMetadata(request.view, filters, await this.getFilterOptions(filters));
      case "project_detail":
        if (!request.projectKey) throw new Error("projectKey is required for project_detail view.");
        return withMetadata(request.view, filters, await this.getProjectDetail(request.projectKey, filters));
      case "dashboard_summary":
        return withMetadata(request.view, filters, await this.getDashboardSummary(filters));
      case "donor_summary":
      case "sector_summary":
      case "donor_portfolio":
        return withMetadata(request.view, filters, await this.getDashboardSummary(filters).then((v) => v.charts));
    }
  }

  async getGlobeFlows(filters: DashboardFilters): Promise<GlobeFlowsResponse> {
    const key = `cleaned-globe-flows:${canonicalCleanedKey(filters)}`;
    return cached(key, CACHE_DAY, async () => {
      const { cte, params, unsupported } = buildFlowFilteredCte(filters, {
        organizationFilterActive: Boolean(organizationValue(filters))
      });

      const rows = await query<PgRow>(
        `${cte}
        SELECT
          donor_country,
          recipient_country,
          min(region) AS region,
          coalesce(sum(total_funding), 0)::float AS total_funding,
          coalesce(sum(unique_projects), 0)::int AS unique_projects,
          array_agg(DISTINCT year_label) AS year_labels,
          array_agg(DISTINCT flow_type) AS flow_types,
          bool_and(exact_geo_flag) AS exact_geo,
          min(recipient_geo_type) AS recipient_geo_type
        FROM flow_filtered
        WHERE exact_geo_flag = true
        GROUP BY donor_country, recipient_country
        ORDER BY total_funding DESC`,
        params
      );

      const metadata = await getCountryMetadataMap();

      const mapped = rows
        .map((row) => {
          const donor = resolveCountryMeta(String(row.donor_country), metadata);
          const recipient = resolveCountryMeta(String(row.recipient_country), metadata);
          return {
            donor,
            recipient,
            row
          };
        })
        .filter((item) => item.donor.mapped && item.recipient.mapped && Boolean(item.row.exact_geo))
        .map(({ donor, recipient, row }): GlobeFlow => ({
          donorCountry: donor.displayName,
          recipientCountry: recipient.displayName,
          region: normalizeRegionLabel(String(row.region ?? "Unknown")),
          yearLabels: sortedYearLabels(row.year_labels),
          flowType: summarizedFlowType(row.flow_types),
          totalFunding: num(row.total_funding),
          uniqueProjects: num(row.unique_projects),
          donorIso2: donor.iso2,
          donorIso3: donor.iso3,
          donorLat: donor.latitude,
          donorLng: donor.longitude,
          recipientIso2: recipient.iso2,
          recipientIso3: recipient.iso3,
          recipientLat: recipient.latitude,
          recipientLng: recipient.longitude,
          recipientGeoType: String(row.recipient_geo_type ?? "exact_country"),
          exactGeo: true
        }));

      return {
        rows: mapped,
        totalRows: mapped.length,
        limit: mapped.length,
        truncated: false,
        unsupportedFilters: unique(unsupported)
      };
    });
  }

  async getOverviewMetrics(filters: DashboardFilters): Promise<OverviewMetrics> {
    const key = `cleaned-overview-metrics:${canonicalCleanedKey(filters)}`;
    return cached(key, CACHE_DAY, async () => {
      const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
      const [row] = await query<PgRow>(
        `${cte}
        SELECT
          coalesce(sum(amount_usd), 0)::float AS total_funding,
          count(*)::int AS valid_financial_rows,
          count(DISTINCT project_key)::int AS unique_projects,
          count(DISTINCT donor)::int AS organizations,
          count(DISTINCT recipient_country)::int AS recipient_countries,
          count(DISTINCT region)::int AS regions
        FROM filtered`,
        params
      );

      const { cte: flowCte, params: flowParams } = buildFlowFilteredCte(filters, {
        organizationFilterActive: Boolean(organizationValue(filters))
      });
      const [flowRow] = await query<PgRow>(
        `${flowCte}
        SELECT count(DISTINCT donor_country)::int AS donor_countries
        FROM flow_filtered`,
        flowParams
      );

      return {
        totalFunding: num(row.total_funding),
        validFinancialRows: num(row.valid_financial_rows),
        uniqueProjects: num(row.unique_projects),
        organizations: num(row.organizations),
        donorCountries: num(flowRow.donor_countries),
        recipientCountries: num(row.recipient_countries),
        regions: num(row.regions)
      };
    });
  }

  async getCountrySummary(request: DashboardDataRequest): Promise<CountrySummaryResponse> {
    const filters = filtersFromRequest(request);
    const key = `cleaned-country-summary:${canonicalCleanedKey(request)}`;

    return cached(key, CACHE_DAY, async () => {
      const { cte, params } = mainFilteredCte(filters, [], { includeTextSearch: true });
      const searchPattern = filters.tableQ ? `%${filters.tableQ.toLowerCase()}%` : null;
      params.push(searchPattern);
      params.push(request.pageSize, (request.page - 1) * request.pageSize);

      const rows = await query<PgRow>(
        `${cte}
        ,
        grouped AS (
          SELECT
            recipient_country,
            min(region) AS region,
            coalesce(sum(amount_usd), 0)::float AS total_funding,
            count(DISTINCT project_key)::int AS unique_projects,
            bool_or(year_int IS NULL) AS has_aggregate_year
          FROM filtered
          GROUP BY recipient_country
        ),
        searched AS (
          SELECT *
          FROM grouped
          WHERE ($${params.length - 2}::text IS NULL OR lower(recipient_country) LIKE $${params.length - 2})
        ),
        counts AS (
          SELECT count(*)::int AS total_rows FROM searched
        )
        SELECT
          searched.*,
          counts.total_rows
        FROM searched
        CROSS JOIN counts
        ORDER BY ${listSortClause(request.sortBy, request.sortDir)}, recipient_country ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const metadata = await getCountryMetadataMap();

      return {
        rows: rows.map((row) => {
          const rawCountry = String(row.recipient_country);
          const normalizedRecipient = normalizeRecipientCountryLabel(rawCountry);
          const recipientGeoType = recipientGeoTypeFromLabel(normalizedRecipient);
          const hasAggregateYear = Boolean(row.has_aggregate_year);
          const caveats = recipientCaveats(normalizedRecipient, { hasAggregateYear });
          const country = resolveCountryMeta(normalizedRecipient, metadata);
          return {
            country: country.displayName,
            region: normalizeRegionLabel(String(row.region ?? "Unknown")),
            totalFunding: num(row.total_funding),
            uniqueProjects: num(row.unique_projects),
            iso2: country.iso2,
            iso3: country.iso3,
            recipientGeoType,
            caveats
          };
        }),
        page: request.page,
        pageSize: request.pageSize,
        totalRows: num(rows[0]?.total_rows)
      };
    });
  }

  async getFlowSummary(request: DashboardDataRequest): Promise<FlowSummaryResponse> {
    const filters = filtersFromRequest(request);
    const key = `cleaned-flow-summary:${canonicalCleanedKey(request)}`;

    return cached(key, CACHE_DAY, async () => {
      const { cte, params } = buildFlowFilteredCte(filters, {
        organizationFilterActive: Boolean(organizationValue(filters))
      });
      const searchPattern = filters.tableQ ? `%${filters.tableQ.toLowerCase()}%` : null;
      params.push(searchPattern);
      params.push(request.pageSize, (request.page - 1) * request.pageSize);

      const rows = await query<PgRow>(
        `${cte}
        ,
        grouped AS (
          SELECT
            donor_country,
            recipient_country,
            min(region) AS region,
            coalesce(sum(total_funding), 0)::float AS total_funding,
            coalesce(sum(unique_projects), 0)::int AS unique_projects,
            array_agg(DISTINCT year_label ORDER BY year_label) AS year_labels,
            array_agg(DISTINCT flow_type) AS flow_types,
            array_agg(DISTINCT recipient_geo_type) AS recipient_geo_types,
            bool_or(year_int IS NULL) AS has_aggregate_year
          FROM flow_filtered
          GROUP BY donor_country, recipient_country
        ),
        searched AS (
          SELECT *
          FROM grouped
          WHERE (
            $${params.length - 2}::text IS NULL OR
            lower(donor_country) LIKE $${params.length - 2} OR
            lower(recipient_country) LIKE $${params.length - 2}
          )
        ),
        counts AS (
          SELECT count(*)::int AS total_rows FROM searched
        )
        SELECT
          searched.*,
          counts.total_rows
        FROM searched
        CROSS JOIN counts
        ORDER BY ${listSortClause(request.sortBy, request.sortDir)}, donor_country ASC, recipient_country ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const metadata = await getCountryMetadataMap();

      return {
        rows: rows.map((row) => {
          const donor = resolveCountryMeta(String(row.donor_country), metadata);
          const normalizedRecipient = normalizeRecipientCountryLabel(String(row.recipient_country));
          const recipient = resolveCountryMeta(normalizedRecipient, metadata);
          const flowType = summarizedFlowType(row.flow_types);
          const recipientGeoType = summarizedRecipientGeoType(row.recipient_geo_types);
          const caveats = recipientCaveats(normalizedRecipient, {
            hasAggregateYear: Boolean(row.has_aggregate_year),
            flowType
          });
          return {
            donorCountry: donor.displayName,
            recipientCountry: recipient.displayName,
            region: normalizeRegionLabel(String(row.region ?? "Unknown")),
            totalFunding: num(row.total_funding),
            uniqueProjects: num(row.unique_projects),
            yearLabels: Array.isArray(row.year_labels) ? row.year_labels.map(String) : [],
            flowType,
            recipientGeoType,
            donorIso2: donor.iso2,
            donorIso3: donor.iso3,
            recipientIso2: recipient.iso2,
            recipientIso3: recipient.iso3,
            caveats
          };
        }),
        page: request.page,
        pageSize: request.pageSize,
        totalRows: num(rows[0]?.total_rows)
      };
    });
  }

  async getCauseSummary(request: DashboardDataRequest): Promise<CauseSummaryRow[]> {
    const filters = filtersFromRequest(request);
    const key = `cleaned-cause-summary:${canonicalCleanedKey(request)}`;

    return cached(key, CACHE_DAY, async () => {
      const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
      params.push(request.pageSize, (request.page - 1) * request.pageSize);

      const causeQueries = CAUSE_CONFIG.map(
        (item) => `
          SELECT
            year_label,
            year_int,
            '${item.label}'::text AS cause,
            coalesce(sum(amount_usd), 0)::float AS total_funding,
            count(DISTINCT project_key)::int AS unique_projects
          FROM filtered
          WHERE ${item.column} = true
          GROUP BY year_label, year_int
        `
      );

      const rows = await query<PgRow>(
        `${cte},
        cause_rows AS (
          ${causeQueries.join("\n          UNION ALL\n")}
        )
        SELECT *
        FROM cause_rows
        ${filters.cause ? `WHERE cause = '${filters.cause}'` : ""}
        ORDER BY ${listSortClause(request.sortBy, request.sortDir)}, year_int NULLS LAST, cause
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return rows.map((row) => ({
        yearLabel: String(row.year_label),
        cause: String(row.cause) as Cause,
        totalFunding: num(row.total_funding),
        uniqueProjects: num(row.unique_projects)
      }));
    });
  }

  async getYearlySummary(request: DashboardDataRequest): Promise<YearlySummaryRow[]> {
    const filters = filtersFromRequest(request);
    const key = `cleaned-yearly-summary:${canonicalCleanedKey(request)}`;

    return cached(key, CACHE_DAY, async () => {
      const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
      params.push(request.pageSize, (request.page - 1) * request.pageSize);

      const rows = await query<PgRow>(
        `${cte}
        SELECT
          year_label,
          year_int,
          coalesce(sum(amount_usd), 0)::float AS total_funding,
          count(DISTINCT project_key)::int AS unique_projects
        FROM filtered
        GROUP BY year_label, year_int
        ORDER BY ${listSortClause(request.sortBy, request.sortDir)}, year_int NULLS LAST, year_label
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return rows.map((row) => ({
        yearLabel: String(row.year_label),
        yearInt: row.year_int === null ? null : num(row.year_int),
        totalFunding: num(row.total_funding),
        uniqueProjects: num(row.unique_projects),
        isAggregate: row.year_int === null
      }));
    });
  }

  async getRawTable(request: Pick<DashboardDataRequest, keyof DashboardDataRequest>): Promise<RawTableResponse> {
    const filters = filtersFromRequest(request as DashboardDataRequest);
    const key = `cleaned-raw-table:${canonicalCleanedKey(request as Record<string, unknown>)}`;

    return cached(key, CACHE_DAY, async () => {
      const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
      params.push(request.pageSize, (request.page - 1) * request.pageSize);

      const rows = await query<PgRow>(
        `${cte},
        counts AS (
          SELECT count(*)::int AS total_rows, count(DISTINCT project_key)::int AS total_projects FROM filtered
        )
        SELECT
          filtered.*,
          counts.total_rows,
          counts.total_projects
        FROM filtered
        CROSS JOIN counts
        ORDER BY ${rawSortClause(request.sortBy, request.sortDir)}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return {
        rows: rows.map(rawRow),
        page: request.page,
        pageSize: request.pageSize,
        totalRows: num(rows[0]?.total_rows),
        totalProjects: num(rows[0]?.total_projects)
      };
    });
  }

  async getProjectPage(pageQuery: ProjectPageQuery): Promise<ProjectPageResponse> {
    return this.getRawTable(pageQuery as DashboardDataRequest);
  }

  async getProjectDetail(projectKey: string, filters: DashboardFilters): Promise<ProjectDetailResponse> {
    const key = `cleaned-project-detail:${projectKey}:${canonicalCleanedKey(filters)}`;

    return cached(key, CACHE_DAY, async () => {
      const { cte, params } = mainFilteredCte(filters, [projectKey], MAIN_SEARCH_OPTIONS);
      const [summary] = await query<PgRow>(
        `${cte},
        selected_scope AS (
          SELECT project_key, coalesce(sum(amount_usd), 0)::float AS selected_scope_funding
          FROM filtered
          WHERE project_key = $1
          GROUP BY project_key
        ),
        full_project AS (
          SELECT
            project_key,
            min(project_id) AS project_id,
            min(project_title) AS title,
            CASE WHEN count(DISTINCT donor) > 1 THEN 'Multiple organizations' ELSE min(donor) END AS organization,
            CASE WHEN count(DISTINCT recipient_country) > 1 THEN 'Multiple recipients' ELSE min(recipient_country) END AS recipient_country,
            CASE WHEN count(DISTINCT region) > 1 THEN 'Multiple regions' ELSE min(region) END AS region,
            array_agg(DISTINCT year_label ORDER BY year_label) AS years,
            coalesce(sum(amount_usd), 0)::float AS total_funding,
            bool_or(is_gender) AS is_gender,
            bool_or(is_climate) AS is_climate,
            bool_or(is_environment) AS is_environment,
            bool_or(is_biodiversity) AS is_biodiversity,
            bool_or(is_nutrition) AS is_nutrition,
            bool_or(is_desertification) AS is_desertification
          FROM analytics_clean.main_dashboard
          WHERE project_key = $1
          GROUP BY project_key
        )
        SELECT
          full_project.*,
          coalesce(selected_scope.selected_scope_funding, 0)::float AS selected_scope_funding
        FROM full_project
        LEFT JOIN selected_scope ON selected_scope.project_key = full_project.project_key`,
        params
      );

      if (!summary) throw new Error(`Project not found: ${projectKey}`);

      const [sectorRows, rowRows] = await Promise.all([
        query<PgRow>(
          `SELECT
            sector_name,
            coalesce(sum(amount_usd), 0)::float AS total_funding
          FROM analytics_clean.main_dashboard
          WHERE project_key = $1
          GROUP BY sector_name
          ORDER BY total_funding DESC`,
          [projectKey]
        ),
        query<PgRow>(
          `SELECT *
          FROM analytics_clean.main_dashboard
          WHERE project_key = $1
          ORDER BY year_int NULLS LAST, year_label, id`,
          [projectKey]
        )
      ]);

      const warnings = baseWarnings(filters);
      if (!summary.project_id) {
        warnings.push({
          code: "MISSING_PROJECT_ID",
          message: "This project uses a generated key because Project_ID is missing."
        });
      }

      return {
        projectKey,
        projectId: str(summary.project_id),
        title: str(summary.title),
        organization: String(summary.organization),
        recipientCountry: String(summary.recipient_country),
        region: normalizeRegionLabel(String(summary.region ?? "Unknown")),
        years: Array.isArray(summary.years) ? summary.years.map(String) : [],
        totalFunding: num(summary.total_funding),
        selectedScopeFunding: num(summary.selected_scope_funding),
        sectorBreakdown: sectorRows.map((row) => ({
          sectorName: String(row.sector_name),
          totalFunding: num(row.total_funding)
        })),
        causes: causesFromRow(summary),
        rawRows: rowRows.map(rawRow),
        warnings
      };
    });
  }

  async getFilterOptions(filters: DashboardFilters): Promise<FilterOptionsResponse> {
    const key = `cleaned-filter-options:${canonicalCleanedKey(filters)}`;

    return cached(key, CACHE_DAY, async () => {
      const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
      const optionQuery = (column: string, limit = 100) =>
        query<PgRow>(
          `${cte}
          SELECT ${column} AS label, ${column} AS value, count(*)::int AS count
          FROM filtered
          WHERE ${column} IS NOT NULL AND ${column} <> ''
          GROUP BY ${column}
          ORDER BY count DESC, ${column} ASC
          LIMIT ${limit}`,
          params
        );

      const [years, organizations, regions, recipientCountries, sectors] = await Promise.all([
        query<PgRow>(
          `${cte}
          SELECT year_label AS label, year_label AS value, count(*)::int AS count, bool_or(year_int IS NULL) AS is_aggregate
          FROM filtered
          GROUP BY year_label
          ORDER BY min(year_int) NULLS LAST, year_label`,
          params
        ),
        optionQuery("donor", 120),
        optionQuery("region", 80),
        optionQuery("recipient_country", 160),
        optionQuery("sector_name", 80)
      ]);

      const { cte: flowCte, params: flowParams } = buildFlowFilteredCte(filters, {
        organizationFilterActive: Boolean(organizationValue(filters))
      });
      const donorCountries = await query<PgRow>(
        `${flowCte}
        SELECT donor_country AS label, donor_country AS value, count(*)::int AS count
        FROM flow_filtered
        GROUP BY donor_country
        ORDER BY count DESC, donor_country ASC
        LIMIT 80`,
        flowParams
      );

      const mapOption = (row: PgRow): FilterOption => ({
        label: String(row.label),
        value: String(row.value),
        count: num(row.count),
        isAggregate: row.is_aggregate === undefined ? undefined : Boolean(row.is_aggregate)
      });

      const normalizedRegionOptions = Array.from(
        regions.reduce<Map<string, number>>((map, row) => {
          const canonical = normalizeRegionLabel(String(row.label ?? row.value ?? "Unknown"));
          map.set(canonical, (map.get(canonical) ?? 0) + num(row.count));
          return map;
        }, new Map())
      )
        .map(([label, count]) => ({ label, value: label, count }))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label));

      return {
        years: years.map(mapOption),
        donorCountries: donorCountries.map(mapOption),
        organizations: organizations.map(mapOption),
        regions: normalizedRegionOptions,
        recipientCountries: recipientCountries.map(mapOption),
        sectors: sectors.map(mapOption),
        causes: CAUSE_CONFIG.map((item) => ({ label: item.label, value: item.label }))
      };
    });
  }

  async getKpis(filters: DashboardFilters): Promise<KpiResponse> {
    return this.getOverviewMetrics(filters);
  }

  async getInsights(filters: DashboardFilters): Promise<InsightCard[]> {
    const key = `cleaned-insights:${canonicalCleanedKey(filters)}`;

    return cached(key, CACHE_DAY, async () => {
      const [metrics, topOrganizations, topRecipients] = await Promise.all([
        this.getOverviewMetrics(filters),
        this.getTopOrganizations(filters),
        this.getTopRecipients(filters)
      ]);

      const topOrg = topOrganizations[0];
      const topRecipient = topRecipients[0];
      const topOrgShare =
        metrics.totalFunding > 0 && topOrg ? Math.round((topOrg.value / metrics.totalFunding) * 100) : 0;

      return [
        {
          id: "engineered-source",
          title: "Engineered source",
          value: DATA_VERSION,
          body: "Widgets and charts are served from the cleaned analytics mart via read-only APIs.",
          severity: "positive"
        },
        {
          id: "organization-concentration",
          title: "Organization concentration",
          value: `${topOrgShare}%`,
          body: `${topOrg?.label ?? "Top organization"} contributes ${topOrgShare}% of selected funding.`,
          severity: "watch"
        },
        {
          id: "recipient-leader",
          title: "Top recipient",
          value: topRecipient?.label ?? "Unknown",
          body: "Recipient rankings update after year, cause, region, and search filtering.",
          severity: "info"
        }
      ];
    });
  }

  private async getTopOrganizations(filters: DashboardFilters) {
    const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
    const rows = await query<PgRow>(
      `${cte}
      SELECT donor AS label, coalesce(sum(amount_usd), 0)::float AS value
      FROM filtered
      GROUP BY donor
      ORDER BY value DESC
      LIMIT 10`,
      params
    );
    return rows.map((row) => ({ label: String(row.label), value: num(row.value) }));
  }

  private async getTopRecipients(filters: DashboardFilters) {
    const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
    const rows = await query<PgRow>(
      `${cte}
      SELECT recipient_country AS label, coalesce(sum(amount_usd), 0)::float AS value
      FROM filtered
      GROUP BY recipient_country
      ORDER BY value DESC`,
      params
    );
    const grouped = new Map<string, number>();
    for (const row of rows) {
      const normalized = normalizeRecipientCountryLabel(String(row.label));
      grouped.set(normalized, (grouped.get(normalized) ?? 0) + num(row.value));
    }
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }

  private async getTopSectors(filters: DashboardFilters) {
    const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
    const rows = await query<PgRow>(
      `${cte}
      SELECT sector_name AS label, coalesce(sum(amount_usd), 0)::float AS value
      FROM filtered
      GROUP BY sector_name
      ORDER BY value DESC
      LIMIT 10`,
      params
    );
    return rows.map((row) => ({ label: String(row.label), value: num(row.value) }));
  }

  private async getCauseBreakdownByOrganization(filters: DashboardFilters) {
    const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
    const causeQueries = CAUSE_CONFIG.map(
      (item) => `
        SELECT
          '${item.label}'::text AS cause,
          donor AS label,
          coalesce(sum(amount_usd), 0)::float AS value,
          count(DISTINCT project_key)::int AS unique_projects
        FROM filtered
        WHERE ${item.column} = true
        GROUP BY donor
      `
    );

    const rows = await query<PgRow>(
      `${cte},
      cause_rows AS (
        ${causeQueries.join("\n        UNION ALL\n")}
      )
      SELECT cause, label, value, unique_projects
      FROM cause_rows
      ORDER BY cause ASC, value DESC, label ASC`,
      params
    );

    return rows.map((row) => ({
      cause: String(row.cause) as Cause,
      label: String(row.label),
      value: num(row.value),
      uniqueProjects: num(row.unique_projects)
    }));
  }

  private async getCauseBreakdownBySector(filters: DashboardFilters) {
    const { cte, params } = mainFilteredCte(filters, [], MAIN_SEARCH_OPTIONS);
    const causeQueries = CAUSE_CONFIG.map(
      (item) => `
        SELECT
          '${item.label}'::text AS cause,
          sector_name AS label,
          coalesce(sum(amount_usd), 0)::float AS value,
          count(DISTINCT project_key)::int AS unique_projects
        FROM filtered
        WHERE ${item.column} = true
        GROUP BY sector_name
      `
    );

    const rows = await query<PgRow>(
      `${cte},
      cause_rows AS (
        ${causeQueries.join("\n        UNION ALL\n")}
      )
      SELECT cause, label, value, unique_projects
      FROM cause_rows
      ORDER BY cause ASC, value DESC, label ASC`,
      params
    );

    return rows.map((row) => ({
      cause: String(row.cause) as Cause,
      label: String(row.label),
      value: num(row.value),
      uniqueProjects: num(row.unique_projects)
    }));
  }

  private async getCauseBreakdownByDonorContinent(filters: DashboardFilters, causeRows: CauseSummaryRow[]) {
    const yearlyCauseTotals = new Map<string, Map<Cause, number>>();
    const yearlyCauseSum = new Map<string, number>();

    for (const row of causeRows) {
      const yearLabel = row.yearLabel;
      const map = yearlyCauseTotals.get(yearLabel) ?? new Map<Cause, number>();
      map.set(row.cause, (map.get(row.cause) ?? 0) + row.totalFunding);
      yearlyCauseTotals.set(yearLabel, map);
      yearlyCauseSum.set(yearLabel, (yearlyCauseSum.get(yearLabel) ?? 0) + row.totalFunding);
    }

    const { cte, params } = buildFlowFilteredCte(filters, {
      organizationFilterActive: Boolean(organizationValue(filters))
    });
    const rows = await query<PgRow>(
      `${cte}
      SELECT year_label, donor_country, coalesce(sum(total_funding), 0)::float AS total_funding
      FROM flow_filtered
      GROUP BY year_label, donor_country`,
      params
    );

    const metadata = await getCountryMetadataMap();
    const grouped = new Map<string, number>();

    for (const row of rows) {
      const yearLabel = String(row.year_label ?? "");
      const causeByYear = yearlyCauseTotals.get(yearLabel);
      const yearTotal = yearlyCauseSum.get(yearLabel) ?? 0;
      if (!causeByYear || yearTotal <= 0) continue;

      const donor = resolveCountryMeta(String(row.donor_country), metadata);
      const continent = donorContinentLabel(donor);
      const funding = num(row.total_funding);
      if (funding <= 0) continue;

      for (const [cause, causeTotal] of causeByYear.entries()) {
        if (causeTotal <= 0) continue;
        const weight = causeTotal / yearTotal;
        const key = `${cause}__${continent}`;
        grouped.set(key, (grouped.get(key) ?? 0) + funding * weight);
      }
    }

    return Array.from(grouped.entries())
      .map(([key, value]) => {
        const [cause, label] = key.split("__");
        return { cause: cause as Cause, label, value };
      })
      .sort((a, b) => a.cause.localeCompare(b.cause) || b.value - a.value || a.label.localeCompare(b.label));
  }

  async getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummaryResponse> {
    const key = `cleaned-dashboard-summary:${canonicalCleanedKey(filters)}`;

    return cached(key, CACHE_DAY, async () => {
      const [
        kpis,
        yearly,
        organizations,
        recipients,
        sectors,
        causeRows,
        filterOptions,
        insights,
        causeByOrganization,
        causeBySector
      ] =
        await Promise.all([
          this.getOverviewMetrics(filters),
          this.getYearlySummary({
            ...filters,
            view: "yearly_summary",
            projectKey: undefined,
            page: 1,
            pageSize: 20,
            sortBy: "year",
            sortDir: "asc"
          }),
          this.getTopOrganizations(filters),
          this.getTopRecipients(filters),
          this.getTopSectors(filters),
          this.getCauseSummary({
            ...filters,
            view: "cause_summary",
            projectKey: undefined,
            page: 1,
            pageSize: 50,
            sortBy: "amount",
            sortDir: "desc"
          }),
          this.getFilterOptions(filters),
          this.getInsights(filters),
          this.getCauseBreakdownByOrganization(filters),
          this.getCauseBreakdownBySector(filters)
        ]);

      const causeByDonorContinent = await this.getCauseBreakdownByDonorContinent(filters, causeRows);

      const groupedCause = new Map<string, number>();
      for (const row of causeRows) {
        groupedCause.set(row.cause, (groupedCause.get(row.cause) ?? 0) + row.totalFunding);
      }

      const charts: DashboardCharts = {
        yearlyFunding: yearly.map((item): YearlyFundingDatum => ({
          yearLabel: item.yearLabel,
          totalFunding: item.totalFunding,
          isAggregate: item.isAggregate
        })),
        topRecipients: recipients,
        topDonors: organizations,
        topSectors: sectors,
        causeMarkers: Array.from(groupedCause.entries())
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value),
        causeByDonorContinent,
        causeByOrganization,
        causeBySector
      };

      return {
        dataVersion: DATA_VERSION,
        amountUnit: AMOUNT_UNIT,
        source: DATA_SOURCE,
        filtersApplied: filters,
        warnings: baseWarnings(filters),
        kpis,
        insights,
        charts,
        filterOptions,
        generatedAt: new Date().toISOString()
      };
    });
  }
}

let cleanedRepository: CleanedAnalyticsRepository | undefined;

export function getCleanedAnalyticsRepository() {
  cleanedRepository ??= new CleanedAnalyticsRepository();
  return cleanedRepository;
}

export const __testing = {
  buildFlowFilteredCte,
  mainFilteredCte,
  recipientCaveats,
  recipientGeoTypeFromLabel,
  summarizedRecipientGeoType
};
