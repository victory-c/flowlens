import { query } from "./db";
import { cached } from "./cache";
import { canonicalCleanedKey } from "./cleaned-query-params";
import {
  AMOUNT_UNIT,
  DATA_SOURCE,
  DATA_VERSION,
  type Cause,
  type CauseMarkerDatum,
  type CleanedRawRow,
  type DashboardCharts,
  type DashboardDataRequest,
  type DashboardDataResponse,
  type DashboardFilters,
  type DashboardSummaryResponse,
  type DashboardWarning,
  type DonorDatum,
  type DonorPortfolioDatum,
  type FilterOption,
  type FilterOptionsResponse,
  type FlowUnavailableResponse,
  type InsightCard,
  type KpiResponse,
  type ProjectDetailResponse,
  type ProjectPageQuery,
  type ProjectPageResponse,
  type ProjectRow,
  type RecipientDatum,
  type SectorDatum,
  type YearlyFundingDatum
} from "@/shared/contracts/dashboard-data";

type PgRow = Record<string, unknown>;

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

function causeColumn(cause: Cause) {
  return CAUSE_CONFIG.find((item) => item.label === cause)?.column;
}

function causesFromRow(row: PgRow): Cause[] {
  return CAUSE_CONFIG.filter((item) => Boolean(row[item.column])).map((item) => item.label);
}

function baseWarnings(filters: DashboardFilters): DashboardWarning[] {
  const warnings: DashboardWarning[] = [
    {
      code: "DISBURSEMENT_ONLY",
      message: "Funding shown is actual disbursement in USD millions, deflated to 2023 constant values."
    },
    {
      code: "CAUSE_MARKERS_OVERLAP",
      message: "Cause categories overlap. Do not add cause marker bars together as total funding."
    }
  ];

  if (filters.year === "2020-2023") {
    warnings.push({
      code: "AGGREGATE_YEAR",
      message: "2020-2023 is an aggregate/NDA-restricted label, not a continuous trend year."
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

function mainFilteredCte(filters: DashboardFilters, existingParams: unknown[] = []) {
  const params = [...existingParams];
  const where = ["1 = 1"];

  const addTextFilter = (column: string, value: string | undefined) => {
    if (!value) return;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  };

  addTextFilter("year_label", filters.year);
  addTextFilter("donor", filters.donor);
  addTextFilter("region", filters.region);
  addTextFilter("recipient_country", filters.recipientCountry);
  addTextFilter("sector_name", filters.sector);

  if (filters.cause) {
    const column = causeColumn(filters.cause);
    if (column) where.push(`${column} = true`);
  }

  if (filters.outlierOnly) {
    where.push("amount_usd >= 14.8");
  }

  if (filters.q) {
    params.push(`%${filters.q.toLowerCase()}%`);
    where.push(`search_text LIKE $${params.length}`);
  }

  return {
    params,
    cte: `
      WITH filtered AS (
        SELECT
          id,
          year_label,
          year_int,
          donor,
          region,
          recipient_country,
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

function sortClause(query: Pick<ProjectPageQuery, "sortBy" | "sortDir">) {
  const direction = query.sortDir === "asc" ? "ASC" : "DESC";
  const columns: Record<ProjectPageQuery["sortBy"], string> = {
    amount: "selected_scope_funding",
    year: "year_label",
    donor: "donor",
    recipient: "recipient_country",
    sector: "sector_name",
    project_key: "project_key",
    total_funding: "selected_scope_funding",
    unique_projects: "row_count",
    recipient_country: "recipient_country",
    sector_name: "sector_name",
    cause: "project_key"
  };

  return `${columns[query.sortBy]} ${direction} NULLS LAST, project_key ASC`;
}

function listSortClause(sortBy: DashboardDataRequest["sortBy"], sortDir: DashboardDataRequest["sortDir"]) {
  const direction = sortDir === "asc" ? "ASC" : "DESC";
  const columns: Partial<Record<DashboardDataRequest["sortBy"], string>> = {
    amount: "total_funding",
    total_funding: "total_funding",
    unique_projects: "unique_projects",
    donor: "donor",
    recipient: "recipient_country",
    recipient_country: "recipient_country",
    sector: "sector_name",
    sector_name: "sector_name",
    year: "year_label",
    cause: "cause"
  };

  return `${columns[sortBy] ?? "total_funding"} ${direction} NULLS LAST`;
}

function rawRow(row: PgRow): CleanedRawRow {
  return {
    id: num(row.id),
    yearLabel: String(row.year_label),
    donor: String(row.donor),
    recipientCountry: String(row.recipient_country),
    region: String(row.region),
    sectorName: String(row.sector_name),
    amountUsd: num(row.amount_usd),
    projectTitle: str(row.project_title),
    projectId: str(row.project_id),
    projectKey: String(row.project_key),
    isAggregate: row.year_int === null,
    causes: causesFromRow(row)
  };
}

function projectRow(row: PgRow): ProjectRow {
  return {
    projectKey: String(row.project_key),
    projectId: str(row.project_id),
    yearLabel: String(row.year_label ?? "Multiple years"),
    donor: String(row.donor ?? "Multiple donor organizations"),
    recipientCountry: String(row.recipient_country ?? "Multiple recipients"),
    region: String(row.region ?? "Multiple regions"),
    sectorName: String(row.sector_name ?? "Multiple sectors"),
    projectTitle: str(row.project_title),
    selectedScopeFunding: num(row.selected_scope_funding),
    projectTotalFunding: num(row.project_total_funding),
    rowCount: num(row.row_count),
    sectorCount: num(row.sector_count),
    isAggregate: Boolean(row.is_aggregate),
    causes: causesFromRow(row)
  };
}

function filtersFromRequest(request: DashboardDataRequest): DashboardFilters {
  const { year, donor, region, recipientCountry, sector, cause, q, viewMode, outlierOnly } = request;
  return { year, donor, region, recipientCountry, sector, cause, q, viewMode, outlierOnly };
}

export class CleanedAnalyticsRepository {
  async getCleanedView(request: DashboardDataRequest): Promise<DashboardDataResponse> {
    const filters = filtersFromRequest(request);

    switch (request.view) {
      case "dashboard_summary":
        return withMetadata(request.view, filters, await this.getDashboardSummary(filters));
      case "filter_options":
        return withMetadata(request.view, filters, await this.getFilterOptions(filters));
      case "main_dashboard":
        return withMetadata(request.view, filters, await this.getProjectPage(request));
      case "project_detail":
        if (!request.projectKey) throw new Error("projectKey is required for project_detail view.");
        return withMetadata(request.view, filters, await this.getProjectDetail(request.projectKey, filters));
      case "country_summary":
        return withMetadata(request.view, filters, await this.getCountrySummary(request));
      case "donor_summary":
        return withMetadata(request.view, filters, await this.getDonorSummary(request));
      case "sector_summary":
        return withMetadata(request.view, filters, await this.getSectorSummary(request));
      case "donor_portfolio":
        return withMetadata(request.view, filters, await this.getDonorPortfolio(filters, request));
      case "cause_marker":
        return withMetadata(request.view, filters, await this.getCauseMarkers(filters, request));
    }
  }

  async getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummaryResponse> {
    const key = `cleaned-dashboard-summary:${canonicalCleanedKey(filters)}`;
    return cached(key, 86_400_000, async () => {
      const [kpis, charts, filterOptions, insights] = await Promise.all([
        this.getKpis(filters),
        this.getCharts(filters),
        this.getFilterOptions(filters),
        this.getInsights(filters)
      ]);

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

  async getKpis(filters: DashboardFilters): Promise<KpiResponse> {
    const { cte, params } = mainFilteredCte(filters);
    const [row] = await query<PgRow>(
      `${cte}
      SELECT
        coalesce(sum(amount_usd), 0)::float AS total_funding,
        count(*)::int AS valid_financial_rows,
        count(DISTINCT project_key)::int AS unique_projects,
        count(DISTINCT donor)::int AS donors,
        count(DISTINCT recipient_country)::int AS recipients,
        count(DISTINCT region)::int AS regions,
        count(DISTINCT sector_name)::int AS sectors
      FROM filtered`,
      params
    );

    return {
      totalFunding: num(row.total_funding),
      validFinancialRows: num(row.valid_financial_rows),
      uniqueProjects: num(row.unique_projects),
      donors: num(row.donors),
      recipients: num(row.recipients),
      regions: num(row.regions),
      sectors: num(row.sectors)
    };
  }

  async getCharts(filters: DashboardFilters): Promise<DashboardCharts> {
    const [yearlyFunding, aggregateFunding, topRecipients, topDonors, topSectors, causeMarkers, donorPortfolio] =
      await Promise.all([
        this.getYearlyFunding(filters, false),
        this.getYearlyFunding(filters, true),
        this.getTopRecipients(filters),
        this.getTopDonors(filters),
        this.getTopSectors(filters),
        this.getCauseMarkers(filters, { sortBy: "year", sortDir: "asc", page: 1, pageSize: 100 }),
        this.getDonorPortfolio(filters, { sortBy: "total_funding", sortDir: "desc", page: 1, pageSize: 12 })
      ]);

    return {
      yearlyFunding,
      aggregateFunding,
      topRecipients,
      topDonors,
      topSectors,
      causeMarkers,
      donorPortfolio
    };
  }

  private async getYearlyFunding(filters: DashboardFilters, aggregateOnly: boolean): Promise<YearlyFundingDatum[]> {
    const { cte, params } = mainFilteredCte(filters);
    const rows = await query<PgRow>(
      `${cte}
      SELECT
        year_label,
        year_int,
        coalesce(sum(amount_usd), 0)::float AS total_funding
      FROM filtered
      WHERE ${aggregateOnly ? "year_int IS NULL" : "year_int IS NOT NULL"}
      GROUP BY year_label, year_int
      ORDER BY year_int NULLS LAST, year_label`,
      params
    );

    return rows.map((row) => ({
      yearLabel: String(row.year_label),
      totalFunding: num(row.total_funding),
      isAggregate: row.year_int === null
    }));
  }

  private async getTopRecipients(filters: DashboardFilters): Promise<RecipientDatum[]> {
    const { cte, params } = mainFilteredCte(filters);
    const rows = await query<PgRow>(
      `${cte}
      SELECT
        recipient_country,
        min(region) AS region,
        coalesce(sum(amount_usd), 0)::float AS total_funding,
        count(DISTINCT project_id) FILTER (WHERE project_id IS NOT NULL)::int AS unique_projects
      FROM filtered
      GROUP BY recipient_country
      ORDER BY total_funding DESC
      LIMIT 10`,
      params
    );

    return rows.map((row) => ({
      recipientCountry: String(row.recipient_country),
      region: String(row.region ?? "Unknown"),
      totalFunding: num(row.total_funding),
      uniqueProjects: num(row.unique_projects)
    }));
  }

  private async getTopDonors(filters: DashboardFilters): Promise<DonorDatum[]> {
    const { cte, params } = mainFilteredCte(filters);
    const rows = await query<PgRow>(
      `${cte}
      SELECT
        donor,
        coalesce(sum(amount_usd), 0)::float AS total_funding,
        count(DISTINCT project_id) FILTER (WHERE project_id IS NOT NULL)::int AS unique_projects,
        count(DISTINCT recipient_country)::int AS recipient_countries_count
      FROM filtered
      GROUP BY donor
      ORDER BY total_funding DESC
      LIMIT 10`,
      params
    );

    return rows.map((row) => ({
      donor: String(row.donor),
      totalFunding: num(row.total_funding),
      uniqueProjects: num(row.unique_projects),
      recipientCountriesCount: num(row.recipient_countries_count)
    }));
  }

  private async getTopSectors(filters: DashboardFilters): Promise<SectorDatum[]> {
    const { cte, params } = mainFilteredCte(filters);
    const rows = await query<PgRow>(
      `${cte}
      SELECT
        sector_name,
        coalesce(sum(amount_usd), 0)::float AS total_funding
      FROM filtered
      GROUP BY sector_name
      ORDER BY total_funding DESC
      LIMIT 10`,
      params
    );

    return rows.map((row) => ({
      sectorName: String(row.sector_name),
      totalFunding: num(row.total_funding)
    }));
  }

  async getCauseMarkers(
    filters: DashboardFilters,
    paging: Pick<DashboardDataRequest, "sortBy" | "sortDir" | "page" | "pageSize">
  ): Promise<CauseMarkerDatum[]> {
    const { cte, params } = mainFilteredCte(filters);
    params.push(paging.pageSize, (paging.page - 1) * paging.pageSize);

    const causeQueries = CAUSE_CONFIG.map(
      (item) => `
        SELECT
          year_label,
          year_int,
          '${item.label}'::text AS cause,
          coalesce(sum(amount_usd), 0)::float AS total_funding,
          count(DISTINCT project_id) FILTER (WHERE project_id IS NOT NULL)::int AS unique_projects
        FROM filtered
        WHERE ${item.column} = true
        GROUP BY year_label, year_int
      `
    );

    const rows = await query<PgRow>(
      `${cte},
      cause_rows AS (
        ${causeQueries.join("\n        UNION ALL\n")}
      )
      SELECT *
      FROM cause_rows
      ${filters.cause ? `WHERE cause = '${filters.cause}'` : ""}
      ORDER BY ${listSortClause(paging.sortBy, paging.sortDir)}, year_int NULLS LAST, cause
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows.map((row) => ({
      yearLabel: String(row.year_label),
      cause: String(row.cause) as Cause,
      totalFunding: num(row.total_funding),
      uniqueProjects: num(row.unique_projects)
    }));
  }

  async getDonorPortfolio(
    filters: DashboardFilters,
    paging: Pick<DashboardDataRequest, "sortBy" | "sortDir" | "page" | "pageSize">
  ): Promise<DonorPortfolioDatum[]> {
    const { cte, params } = mainFilteredCte(filters);
    params.push(paging.pageSize, (paging.page - 1) * paging.pageSize);
    const rows = await query<PgRow>(
      `${cte}
      SELECT
        donor,
        sector_name,
        coalesce(sum(amount_usd), 0)::float AS total_funding
      FROM filtered
      GROUP BY donor, sector_name
      ORDER BY ${listSortClause(paging.sortBy, paging.sortDir)}, donor ASC, sector_name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows.map((row) => ({
      donor: String(row.donor),
      sectorName: String(row.sector_name),
      totalFunding: num(row.total_funding)
    }));
  }

  async getCountrySummary(request: DashboardDataRequest): Promise<RecipientDatum[]> {
    const filters = filtersFromRequest(request);
    const { cte, params } = mainFilteredCte(filters);
    params.push(request.pageSize, (request.page - 1) * request.pageSize);
    const rows = await query<PgRow>(
      `${cte}
      SELECT
        year_label,
        year_int,
        recipient_country,
        min(region) AS region,
        coalesce(sum(amount_usd), 0)::float AS total_funding,
        count(DISTINCT project_id) FILTER (WHERE project_id IS NOT NULL)::int AS unique_projects
      FROM filtered
      GROUP BY year_label, year_int, recipient_country
      ORDER BY ${listSortClause(request.sortBy, request.sortDir)}, year_int NULLS LAST, recipient_country ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows.map((row) => ({
      recipientCountry: String(row.recipient_country),
      region: String(row.region ?? "Unknown"),
      totalFunding: num(row.total_funding),
      uniqueProjects: num(row.unique_projects)
    }));
  }

  async getDonorSummary(request: DashboardDataRequest): Promise<DonorDatum[]> {
    const filters = filtersFromRequest(request);
    const { cte, params } = mainFilteredCte(filters);
    params.push(request.pageSize, (request.page - 1) * request.pageSize);
    const rows = await query<PgRow>(
      `${cte}
      SELECT
        year_label,
        year_int,
        donor,
        coalesce(sum(amount_usd), 0)::float AS total_funding,
        count(DISTINCT project_id) FILTER (WHERE project_id IS NOT NULL)::int AS unique_projects,
        count(DISTINCT recipient_country)::int AS recipient_countries_count
      FROM filtered
      GROUP BY year_label, year_int, donor
      ORDER BY ${listSortClause(request.sortBy, request.sortDir)}, year_int NULLS LAST, donor ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows.map((row) => ({
      donor: String(row.donor),
      totalFunding: num(row.total_funding),
      uniqueProjects: num(row.unique_projects),
      recipientCountriesCount: num(row.recipient_countries_count)
    }));
  }

  async getSectorSummary(request: DashboardDataRequest): Promise<SectorDatum[]> {
    const filters = filtersFromRequest(request);
    const { cte, params } = mainFilteredCte(filters);
    params.push(request.pageSize, (request.page - 1) * request.pageSize);
    const rows = await query<PgRow>(
      `${cte}
      SELECT
        year_label,
        year_int,
        sector_name,
        coalesce(sum(amount_usd), 0)::float AS total_funding
      FROM filtered
      GROUP BY year_label, year_int, sector_name
      ORDER BY ${listSortClause(request.sortBy, request.sortDir)}, year_int NULLS LAST, sector_name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return rows.map((row) => ({
      sectorName: String(row.sector_name),
      totalFunding: num(row.total_funding)
    }));
  }

  async getProjectPage(pageQuery: ProjectPageQuery): Promise<ProjectPageResponse> {
    const { cte, params } = mainFilteredCte(pageQuery);
    params.push(pageQuery.pageSize, (pageQuery.page - 1) * pageQuery.pageSize);
    const sort = sortClause(pageQuery);

    if (pageQuery.viewMode === "row") {
      const rows = await query<PgRow>(
        `${cte},
        counts AS (
          SELECT count(*)::int AS total_rows, count(DISTINCT project_key)::int AS total_projects FROM filtered
        ),
        project_totals AS (
          SELECT project_key, coalesce(sum(amount_usd), 0)::float AS project_total_funding
          FROM analytics_clean.main_dashboard
          GROUP BY project_key
        )
        SELECT
          f.*,
          f.amount_usd AS selected_scope_funding,
          project_totals.project_total_funding,
          1 AS row_count,
          1 AS sector_count,
          f.year_int IS NULL AS is_aggregate,
          counts.total_rows,
          counts.total_projects
        FROM filtered f
        JOIN project_totals ON project_totals.project_key = f.project_key
        CROSS JOIN counts
        ORDER BY ${sort}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return {
        rows: rows.map(projectRow),
        page: pageQuery.page,
        pageSize: pageQuery.pageSize,
        totalRows: num(rows[0]?.total_rows),
        totalProjects: num(rows[0]?.total_projects)
      };
    }

    const rows = await query<PgRow>(
      `${cte},
      scope AS (
        SELECT
          project_key,
          min(project_id) AS project_id,
          CASE WHEN count(DISTINCT year_label) > 1 THEN 'Multiple years' ELSE min(year_label) END AS year_label,
          CASE WHEN count(DISTINCT donor) > 1 THEN 'Multiple donor organizations' ELSE min(donor) END AS donor,
          CASE WHEN count(DISTINCT recipient_country) > 1 THEN 'Multiple recipients' ELSE min(recipient_country) END AS recipient_country,
          CASE WHEN count(DISTINCT region) > 1 THEN 'Multiple regions' ELSE min(region) END AS region,
          CASE WHEN count(DISTINCT sector_name) > 1 THEN 'Multiple sectors' ELSE min(sector_name) END AS sector_name,
          min(project_title) AS project_title,
          coalesce(sum(amount_usd), 0)::float AS selected_scope_funding,
          count(*)::int AS row_count,
          count(DISTINCT sector_name)::int AS sector_count,
          bool_or(year_int IS NULL) AS is_aggregate,
          bool_or(is_gender) AS is_gender,
          bool_or(is_climate) AS is_climate,
          bool_or(is_environment) AS is_environment,
          bool_or(is_biodiversity) AS is_biodiversity,
          bool_or(is_nutrition) AS is_nutrition,
          bool_or(is_desertification) AS is_desertification
        FROM filtered
        GROUP BY project_key
      ),
      project_totals AS (
        SELECT project_key, coalesce(sum(amount_usd), 0)::float AS project_total_funding
        FROM analytics_clean.main_dashboard
        GROUP BY project_key
      ),
      counts AS (
        SELECT count(*)::int AS total_rows, count(*)::int AS total_projects FROM scope
      )
      SELECT
        scope.*,
        project_totals.project_total_funding,
        counts.total_rows,
        counts.total_projects
      FROM scope
      JOIN project_totals ON project_totals.project_key = scope.project_key
      CROSS JOIN counts
      ORDER BY ${sort}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      rows: rows.map(projectRow),
      page: pageQuery.page,
      pageSize: pageQuery.pageSize,
      totalRows: num(rows[0]?.total_rows),
      totalProjects: num(rows[0]?.total_projects)
    };
  }

  async getProjectDetail(projectKey: string, filters: DashboardFilters): Promise<ProjectDetailResponse> {
    const { cte, params } = mainFilteredCte(filters, [projectKey]);
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
          CASE WHEN count(DISTINCT donor) > 1 THEN 'Multiple donor organizations' ELSE min(donor) END AS donor,
          CASE WHEN count(DISTINCT recipient_country) > 1 THEN 'Multiple recipients' ELSE min(recipient_country) END AS recipient_country,
          CASE WHEN count(DISTINCT region) > 1 THEN 'Multiple regions' ELSE min(region) END AS region,
          array_agg(DISTINCT year_label ORDER BY year_label) AS years,
          coalesce(sum(amount_usd), 0)::float AS total_funding,
          bool_or(year_int IS NULL) AS is_aggregate,
          bool_or(is_gender) AS is_gender,
          bool_or(is_climate) AS is_climate,
          bool_or(is_environment) AS is_environment,
          bool_or(is_biodiversity) AS is_biodiversity,
          bool_or(is_nutrition) AS is_nutrition,
          bool_or(is_desertification) AS is_desertification,
          count(*)::int AS row_count
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
        message: "This record uses a generated project key because Project_ID is missing."
      });
    }
    if (Boolean(summary.is_aggregate)) {
      warnings.push({
        code: "AGGREGATE_PROJECT",
        message: "This project contains aggregate/NDA-restricted 2020-2023 data."
      });
    }

    return {
      projectKey,
      projectId: str(summary.project_id),
      title: str(summary.title),
      donor: String(summary.donor),
      recipientCountry: String(summary.recipient_country),
      region: String(summary.region),
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
  }

  async getFilterOptions(filters: DashboardFilters): Promise<FilterOptionsResponse> {
    const key = `cleaned-filter-options:${canonicalCleanedKey(filters)}`;
    return cached(key, 86_400_000, async () => {
      const { cte, params } = mainFilteredCte(filters);
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

      const [years, donors, regions, recipientCountries, sectors] = await Promise.all([
        query<PgRow>(
          `${cte}
          SELECT year_label AS label, year_label AS value, count(*)::int AS count, bool_or(year_int IS NULL) AS is_aggregate
          FROM filtered
          GROUP BY year_label
          ORDER BY min(year_int) NULLS LAST, year_label`,
          params
        ),
        optionQuery("donor", 100),
        optionQuery("region", 60),
        optionQuery("recipient_country", 120),
        optionQuery("sector_name", 80)
      ]);

      const mapOption = (row: PgRow): FilterOption => ({
        label: String(row.label),
        value: String(row.value),
        count: num(row.count),
        isAggregate: row.is_aggregate === undefined ? undefined : Boolean(row.is_aggregate)
      });

      return {
        years: years.map(mapOption),
        donors: donors.map(mapOption),
        regions: regions.map(mapOption),
        recipientCountries: recipientCountries.map(mapOption),
        sectors: sectors.map(mapOption),
        causes: CAUSE_CONFIG.map((item) => ({ label: item.label, value: item.label }))
      };
    });
  }

  async getInsights(filters: DashboardFilters): Promise<InsightCard[]> {
    const [kpis, topDonors, topSectors] = await Promise.all([
      this.getKpis(filters),
      this.getTopDonors(filters),
      this.getTopSectors(filters)
    ]);
    const topDonor = topDonors[0];
    const topSector = topSectors[0];
    const topDonorShare = kpis.totalFunding && topDonor
      ? Math.round((topDonor.totalFunding / kpis.totalFunding) * 100)
      : 0;

    return [
      {
        id: "engineered-source",
        title: "Engineered source",
        value: DATA_VERSION,
        body: "All visible dashboard widgets use the cleaned data mart imported into analytics_clean.",
        severity: "positive"
      },
      {
        id: "donor-concentration",
        title: "Donor concentration",
        value: `${topDonorShare}%`,
        body: `${topDonor?.donor ?? "The leading donor organization"} accounts for ${topDonorShare}% of selected funding.`,
        severity: "watch"
      },
      {
        id: "valid-rows",
        title: "Valid funding rows",
        value: `${kpis.validFinancialRows.toLocaleString()}`,
        body: "Rows with missing or non-positive disbursement amounts were removed before import.",
        severity: "info"
      },
      {
        id: "leading-sector",
        title: "Leading sector",
        value: topSector?.sectorName ?? "Unknown",
        body: "Sector totals update with donor, recipient, year, cause, and keyword filters.",
        severity: "positive"
      }
    ];
  }

  getFlowUnavailable(): FlowUnavailableResponse {
    return {
      available: false,
      warning: {
        code: "FLOW_SUMMARY_NOT_AVAILABLE",
        message:
          "The engineered CSVs do not include donor-country-to-recipient-country arcs. Request 07_df_flow_summary.csv to restore arc flows."
      }
    };
  }
}

let cleanedRepository: CleanedAnalyticsRepository | undefined;

export function getCleanedAnalyticsRepository() {
  cleanedRepository ??= new CleanedAnalyticsRepository();
  return cleanedRepository;
}
