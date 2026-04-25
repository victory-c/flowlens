import { cached } from "./cache";
import type {
  ChartDatum,
  DashboardFilters,
  DashboardSummaryResponse,
  FilterOption,
  FilterOptionsResponse,
  FlowResponse,
  InsightCard,
  KpiResponse,
  OverviewResponse,
  ProjectDetailResponse,
  ProjectPageQuery,
  ProjectPageResponse,
  ProjectRow,
  RawProjectRow
} from "./contracts";
import { query } from "./db";
import type { AnalyticsRepository } from "./repository";
import { buildFilteredCte, hasUserFilters, selectedMeasureColumn, sortSql } from "./sql";
import { canonicalFilterKey } from "./query-params";

type PgRow = Record<string, unknown>;

function num(value: unknown) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function chartRow(row: PgRow): ChartDatum {
  return {
    label: String(row.label ?? "Unknown / Not reported"),
    value: num(row.value),
    totalDisbursement: num(row.total_disbursement),
    totalCommitment: num(row.total_commitment),
    projectCount: num(row.project_count),
    rawRowCount: num(row.raw_row_count)
  };
}

function optionRow(row: PgRow): FilterOption {
  return {
    label: String(row.label),
    value: String(row.value),
    count: num(row.count)
  };
}

function projectRow(row: PgRow): ProjectRow {
  return {
    projectKey: String(row.project_key),
    rowId: str(row.row_id),
    rawInternalId: row.raw_internal_id === undefined ? undefined : num(row.raw_internal_id),
    year: str(row.year),
    organizationName: str(row.organization_name),
    donorCountry: str(row.donor_country),
    recipientCountry: str(row.recipient_country),
    region: str(row.region),
    regionMacro: str(row.region_macro),
    flowType: str(row.flow_type),
    selectedScopeDisbursement: num(row.selected_scope_disbursement),
    selectedScopeCommitment: num(row.selected_scope_commitment),
    projectTotalDisbursement: num(row.project_total_disbursement),
    projectTotalCommitment: num(row.project_total_commitment),
    rawRowCount: num(row.raw_row_count),
    sectorCount: num(row.sector_count),
    sectorDescription: str(row.sector_description),
    subsectorDescription: str(row.subsector_description),
    sdgFocus: str(row.sdg_focus),
    projectTitle: str(row.project_title),
    hasMixedValues: Boolean(row.has_mixed_values)
  };
}

function rawProjectRow(row: PgRow): RawProjectRow {
  return {
    ...projectRow(row),
    rawInternalId: num(row.raw_internal_id),
    channelName: str(row.channel_name),
    channelReportedName: str(row.channel_reported_name)
  };
}

export class PostgresAnalyticsRepository implements AnalyticsRepository {
  async getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummaryResponse> {
    const key = `dashboard-summary:${canonicalFilterKey(filters)}`;
    return cached(key, 45_000, async () => {
      const [kpis, overview, flows, filterOptions, insights] = await Promise.all([
        this.getKpis(filters),
        this.getOverview(filters),
        this.getFlowSummary(filters),
        this.getFilterOptions(filters),
        this.getInsights(filters)
      ]);

      return {
        filters,
        kpis,
        overview,
        flows,
        filterOptions,
        insights,
        generatedAt: new Date().toISOString()
      };
    });
  }

  async getKpis(filters: DashboardFilters): Promise<KpiResponse> {
    const key = `kpis:${canonicalFilterKey(filters)}`;
    return cached(key, 45_000, async () => {
      const { cte, params } = buildFilteredCte(filters);
      const [row] = await query<PgRow>(
        `${cte}
        SELECT
          coalesce(sum(disbursement_value), 0) AS total_disbursement,
          coalesce(sum(commitment_value), 0) AS total_commitment,
          count(DISTINCT project_key) AS project_count,
          count(*) AS raw_row_count,
          count(DISTINCT donor_country) FILTER (WHERE donor_country IS NOT NULL) AS donor_country_count,
          count(DISTINCT country) FILTER (WHERE country IS NOT NULL) AS recipient_label_count,
          count(DISTINCT organization_name) FILTER (WHERE organization_name IS NOT NULL) AS organization_count
        FROM filtered`,
        params
      );

      return {
        totalDisbursement: num(row.total_disbursement),
        totalCommitment: num(row.total_commitment),
        projectCount: num(row.project_count),
        rawRowCount: num(row.raw_row_count),
        donorCountryCount: num(row.donor_country_count),
        recipientLabelCount: num(row.recipient_label_count),
        organizationCount: num(row.organization_count)
      };
    });
  }

  async getOverview(filters: DashboardFilters): Promise<OverviewResponse> {
    const key = `overview:${canonicalFilterKey(filters)}`;
    return cached(key, 45_000, async () => {
      if (!hasUserFilters(filters)) {
        return this.getOverviewFromMaterializedViews(filters);
      }

      const { cte, params } = buildFilteredCte(filters);
      const measure = selectedMeasureColumn(filters);
      const [yearlyTrend, topDonors, topRecipients, sectorBreakdown] = await Promise.all([
        query<PgRow>(
          `${cte}
          SELECT
            year,
            coalesce(sum(disbursement_value), 0) AS total_disbursement,
            coalesce(sum(commitment_value), 0) AS total_commitment,
            count(DISTINCT project_key) AS project_count,
            count(*) AS raw_row_count
          FROM filtered
          GROUP BY year
          ORDER BY year`,
          params
        ),
        query<PgRow>(
          `${cte}
          SELECT
            coalesce(donor_country, 'Unknown / Not reported') AS label,
            coalesce(sum(${measure}), 0) AS value,
            coalesce(sum(disbursement_value), 0) AS total_disbursement,
            coalesce(sum(commitment_value), 0) AS total_commitment,
            count(DISTINCT project_key) AS project_count,
            count(*) AS raw_row_count
          FROM filtered
          GROUP BY coalesce(donor_country, 'Unknown / Not reported')
          ORDER BY value DESC
          LIMIT 10`,
          params
        ),
        query<PgRow>(
          `${cte}
          SELECT
            coalesce(country, 'Unknown / Not reported') AS label,
            coalesce(sum(${measure}), 0) AS value,
            coalesce(sum(disbursement_value), 0) AS total_disbursement,
            coalesce(sum(commitment_value), 0) AS total_commitment,
            count(DISTINCT project_key) AS project_count,
            count(*) AS raw_row_count
          FROM filtered
          GROUP BY coalesce(country, 'Unknown / Not reported')
          ORDER BY value DESC
          LIMIT 10`,
          params
        ),
        query<PgRow>(
          `${cte}
          SELECT
            coalesce(sector_description, 'Unknown / Not reported') AS label,
            coalesce(sum(${measure}), 0) AS value,
            coalesce(sum(disbursement_value), 0) AS total_disbursement,
            coalesce(sum(commitment_value), 0) AS total_commitment,
            count(DISTINCT project_key) AS project_count,
            count(*) AS raw_row_count
          FROM filtered
          GROUP BY coalesce(sector_description, 'Unknown / Not reported')
          ORDER BY value DESC
          LIMIT 10`,
          params
        )
      ]);

      return {
        yearlyTrend: yearlyTrend.map((row) => ({
          year: String(row.year ?? "Unknown"),
          totalDisbursement: num(row.total_disbursement),
          totalCommitment: num(row.total_commitment),
          projectCount: num(row.project_count),
          rawRowCount: num(row.raw_row_count),
          isAggregateYear: row.year === "2020-2023"
        })),
        topDonors: topDonors.map(chartRow),
        topRecipients: topRecipients.map(chartRow),
        sectorBreakdown: sectorBreakdown.map(chartRow)
      };
    });
  }

  private async getOverviewFromMaterializedViews(filters: DashboardFilters): Promise<OverviewResponse> {
    const amountColumn =
      filters.measure === "commitment" ? "total_commitment" : "total_disbursement";
    const [yearlyTrend, topDonors, topRecipients, sectorBreakdown] = await Promise.all([
      query<PgRow>(
        `SELECT
          year,
          total_disbursement,
          total_commitment,
          project_count,
          raw_row_count,
          year = '2020-2023' AS is_aggregate_year
        FROM analytics.mv_year_sector_summary
        WHERE sector_description = '__ALL__'
          AND year <> '__ALL__'
        ORDER BY year`
      ),
      query<PgRow>(
        `SELECT
          donor_country AS label,
          ${amountColumn} AS value,
          total_disbursement,
          total_commitment,
          project_count,
          raw_row_count
        FROM analytics.mv_country_summary
        WHERE summary_type = 'donor'
        ORDER BY ${amountColumn} DESC
        LIMIT 10`
      ),
      query<PgRow>(
        `SELECT
          country AS label,
          ${amountColumn} AS value,
          total_disbursement,
          total_commitment,
          project_count,
          raw_row_count
        FROM analytics.mv_country_summary
        WHERE summary_type = 'recipient'
        ORDER BY ${amountColumn} DESC
        LIMIT 10`
      ),
      query<PgRow>(
        `SELECT
          sector_description AS label,
          ${amountColumn} AS value,
          total_disbursement,
          total_commitment,
          project_count,
          raw_row_count
        FROM analytics.mv_year_sector_summary
        WHERE year = '__ALL__'
          AND sector_description <> '__ALL__'
        ORDER BY ${amountColumn} DESC
        LIMIT 10`
      )
    ]);

    return {
      yearlyTrend: yearlyTrend.map((row) => ({
        year: String(row.year ?? "Unknown"),
        totalDisbursement: num(row.total_disbursement),
        totalCommitment: num(row.total_commitment),
        projectCount: num(row.project_count),
        rawRowCount: num(row.raw_row_count),
        isAggregateYear: Boolean(row.is_aggregate_year)
      })),
      topDonors: topDonors.map(chartRow),
      topRecipients: topRecipients.map(chartRow),
      sectorBreakdown: sectorBreakdown.map(chartRow)
    };
  }

  async getFlowSummary(filters: DashboardFilters): Promise<FlowResponse> {
    const key = `flows:${canonicalFilterKey(filters)}`;
    return cached(key, 45_000, async () => {
      const { cte, params } = buildFilteredCte(filters);
      const rows = await query<PgRow>(
        `${cte},
        grouped AS (
          SELECT
            donor_country,
            country AS recipient_label,
            min(region_macro) AS region_macro,
            min(region) AS region,
            type_of_flow,
            bool_or(is_regional_or_unspecified) AS is_regional_or_unspecified,
            coalesce(sum(disbursement_value), 0) AS total_disbursement,
            coalesce(sum(commitment_value), 0) AS total_commitment,
            count(DISTINCT project_key) AS project_count,
            count(*) AS raw_row_count,
            (array_agg(sector_description ORDER BY disbursement_value DESC NULLS LAST))[1] AS top_sector,
            (array_agg(organization_name ORDER BY disbursement_value DESC NULLS LAST))[1] AS top_organization
          FROM filtered
          GROUP BY donor_country, country, type_of_flow
          ORDER BY coalesce(sum(${selectedMeasureColumn(filters)}), 0) DESC
          LIMIT 250
        )
        SELECT
          grouped.*,
          donor_geo.iso3 AS donor_iso3,
          donor_geo.lat AS donor_lat,
          donor_geo.lng AS donor_lng,
          donor_geo.geo_type AS donor_geo_type,
          recipient_geo.iso3 AS recipient_iso3,
          recipient_geo.display_name AS recipient_display_name,
          recipient_geo.lat AS recipient_lat,
          recipient_geo.lng AS recipient_lng,
          recipient_geo.geo_type AS recipient_geo_type
        FROM grouped
        LEFT JOIN analytics.geo_lookup donor_geo
          ON lower(donor_geo.raw_label) = lower(grouped.donor_country)
        LEFT JOIN analytics.geo_lookup recipient_geo
          ON lower(recipient_geo.raw_label) = lower(grouped.recipient_label)
        ORDER BY grouped.total_disbursement DESC`,
        params
      );

      const exactCountryFlows = [];
      const domesticFlows = [];
      const regionalUnspecifiedFlows = [];
      let unmappedCount = 0;

      for (const row of rows) {
        const typeOfFlow = str(row.type_of_flow);
        const recipientGeoType = str(row.recipient_geo_type);
        const donorGeoType = str(row.donor_geo_type);
        const isExact =
          typeOfFlow === "Cross-border" &&
          donorGeoType === "exact_country" &&
          recipientGeoType === "exact_country" &&
          row.donor_lat !== null &&
          row.recipient_lat !== null;

        if (isExact) {
          exactCountryFlows.push({
            donorCountry: String(row.donor_country),
            recipientCountry: String(row.recipient_display_name ?? row.recipient_label),
            donorIso3: String(row.donor_iso3),
            recipientIso3: String(row.recipient_iso3),
            donorLat: num(row.donor_lat),
            donorLng: num(row.donor_lng),
            recipientLat: num(row.recipient_lat),
            recipientLng: num(row.recipient_lng),
            totalDisbursement: num(row.total_disbursement),
            totalCommitment: num(row.total_commitment),
            projectCount: num(row.project_count),
            rawRowCount: num(row.raw_row_count),
            topSector: str(row.top_sector),
            topOrganization: str(row.top_organization)
          });
          continue;
        }

        if (typeOfFlow === "Domestic") {
          domesticFlows.push({
            country: String(row.recipient_display_name ?? row.recipient_label ?? row.donor_country),
            iso3: str(row.recipient_iso3 ?? row.donor_iso3),
            lat: row.recipient_lat === null ? null : num(row.recipient_lat),
            lng: row.recipient_lng === null ? null : num(row.recipient_lng),
            totalDisbursement: num(row.total_disbursement),
            totalCommitment: num(row.total_commitment),
            projectCount: num(row.project_count),
            rawRowCount: num(row.raw_row_count)
          });
          continue;
        }

        const geoType: "regional" | "unspecified" | "unmapped" =
          recipientGeoType === "regional" || recipientGeoType === "unspecified"
            ? recipientGeoType
            : "unmapped";
        if (geoType === "unmapped") unmappedCount += num(row.raw_row_count);

        regionalUnspecifiedFlows.push({
          donorCountry: str(row.donor_country),
          recipientLabel: String(row.recipient_label ?? "Unknown / Not reported"),
          regionMacro: str(row.region_macro),
          region: str(row.region),
          geoType,
          totalDisbursement: num(row.total_disbursement),
          totalCommitment: num(row.total_commitment),
          projectCount: num(row.project_count),
          rawRowCount: num(row.raw_row_count),
          topSector: str(row.top_sector),
          topOrganization: str(row.top_organization)
        });
      }

      return {
        exactCountryFlows,
        domesticFlows,
        regionalUnspecifiedFlows,
        unmappedCount
      };
    });
  }

  async getProjectPage(pageQuery: ProjectPageQuery): Promise<ProjectPageResponse> {
    const { cte, params } = buildFilteredCte(pageQuery);
    const page = pageQuery.page;
    const pageSize = pageQuery.pageSize;
    const offset = (page - 1) * pageSize;
    const sort = sortSql(pageQuery);

    if (pageQuery.viewMode === "raw") {
      params.push(pageSize, offset);
      const rows = await query<PgRow>(
        `${cte},
        counts AS (
          SELECT count(*) AS total_rows, count(DISTINCT project_key) AS total_projects FROM filtered
        )
        SELECT
          f.project_key,
          f.row_id,
          f.raw_internal_id,
          f.year,
          f.organization_name,
          f.donor_country,
          f.country AS recipient_country,
          f.region,
          f.region_macro,
          f.type_of_flow AS flow_type,
          f.disbursement_value AS selected_scope_disbursement,
          f.commitment_value AS selected_scope_commitment,
          totals.project_total_disbursement,
          totals.project_total_commitment,
          1 AS raw_row_count,
          1 AS sector_count,
          f.sector_description,
          f.subsector_description,
          f.sdg_focus,
          f.grant_recipient_project_title AS project_title,
          false AS has_mixed_values,
          counts.total_rows,
          counts.total_projects
        FROM filtered f
        CROSS JOIN counts
        JOIN (
          SELECT
            project_key,
            coalesce(sum(usd_disbursements_defl), 0) AS project_total_disbursement,
            coalesce(sum(usd_commitment_defl), 0) AS project_total_commitment
          FROM analytics.raw_oecd_philanthropy
          GROUP BY project_key
        ) totals ON totals.project_key = f.project_key
        ORDER BY ${sort.replaceAll("selected_scope_disbursement", "f.disbursement_value")}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return {
        rows: rows.map(projectRow),
        page,
        pageSize,
        totalRows: num(rows[0]?.total_rows),
        totalProjects: num(rows[0]?.total_projects),
        nextCursor: null
      };
    }

    params.push(pageSize, offset);
    const rows = await query<PgRow>(
      `${cte},
      scope AS (
        SELECT
          project_key,
          min(row_id) AS row_id,
          CASE WHEN count(DISTINCT year) > 1 THEN 'Multiple years' ELSE min(year) END AS year,
          CASE WHEN count(DISTINCT organization_name) > 1 THEN 'Multiple organizations' ELSE min(organization_name) END AS organization_name,
          CASE WHEN count(DISTINCT donor_country) > 1 THEN 'Multiple donors' ELSE min(donor_country) END AS donor_country,
          CASE WHEN count(DISTINCT country) > 1 THEN 'Multiple recipients' ELSE min(country) END AS recipient_country,
          CASE WHEN count(DISTINCT region) > 1 THEN 'Multiple regions' ELSE min(region) END AS region,
          CASE WHEN count(DISTINCT region_macro) > 1 THEN 'Multiple macro regions' ELSE min(region_macro) END AS region_macro,
          CASE WHEN count(DISTINCT type_of_flow) > 1 THEN 'Mixed' ELSE min(type_of_flow) END AS flow_type,
          coalesce(sum(disbursement_value), 0) AS selected_scope_disbursement,
          coalesce(sum(commitment_value), 0) AS selected_scope_commitment,
          count(*) AS raw_row_count,
          count(DISTINCT sector_description) AS sector_count,
          CASE WHEN count(DISTINCT sector_description) > 1 THEN 'Multiple sectors' ELSE min(sector_description) END AS sector_description,
          CASE WHEN count(DISTINCT subsector_description) > 1 THEN 'Multiple subsectors' ELSE min(subsector_description) END AS subsector_description,
          string_agg(DISTINCT nullif(sdg_focus, ''), '; ') AS sdg_focus,
          min(nullif(grant_recipient_project_title, '')) AS project_title,
          (
            count(DISTINCT organization_name) > 1
            OR count(DISTINCT donor_country) > 1
            OR count(DISTINCT country) > 1
            OR count(DISTINCT year) > 1
            OR count(DISTINCT grant_recipient_project_title) > 1
          ) AS has_mixed_values
        FROM filtered
        GROUP BY project_key
      ),
      totals AS (
        SELECT
          project_key,
          coalesce(sum(usd_disbursements_defl), 0) AS project_total_disbursement,
          coalesce(sum(usd_commitment_defl), 0) AS project_total_commitment
        FROM analytics.raw_oecd_philanthropy
        GROUP BY project_key
      ),
      counts AS (
        SELECT
          count(*) AS total_rows,
          count(*) AS total_projects
        FROM scope
      )
      SELECT
        scope.*,
        totals.project_total_disbursement,
        totals.project_total_commitment,
        counts.total_rows,
        counts.total_projects
      FROM scope
      JOIN totals ON totals.project_key = scope.project_key
      CROSS JOIN counts
      ORDER BY ${sort}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const mapped = rows.map(projectRow);
    const last = mapped.at(-1);
    return {
      rows: mapped,
      page,
      pageSize,
      totalRows: num(rows[0]?.total_rows),
      totalProjects: num(rows[0]?.total_projects),
      nextCursor: last
        ? { value: String(last.selectedScopeDisbursement), projectKey: last.projectKey }
        : null
    };
  }

  async getProjectDetail(
    projectKey: string,
    filters: DashboardFilters
  ): Promise<ProjectDetailResponse> {
    const initialParams: unknown[] = [projectKey];
    const { cte, params } = buildFilteredCte(filters, initialParams);

    const [summary] = await query<PgRow>(
      `${cte},
      selected_scope AS (
        SELECT
          project_key,
          coalesce(sum(disbursement_value), 0) AS selected_scope_disbursement,
          coalesce(sum(commitment_value), 0) AS selected_scope_commitment
        FROM filtered
        WHERE project_key = $1
        GROUP BY project_key
      ),
      full_project AS (
        SELECT
          project_key,
          min(row_id) AS row_id,
          min(nullif(grant_recipient_project_title, '')) AS title,
          min(nullif(project_description, '')) AS description,
          CASE WHEN count(DISTINCT organization_name) > 1 THEN 'Multiple organizations' ELSE min(organization_name) END AS organization_name,
          CASE WHEN count(DISTINCT donor_country) > 1 THEN 'Multiple donors' ELSE min(donor_country) END AS donor_country,
          CASE WHEN count(DISTINCT country) > 1 THEN 'Multiple recipients' ELSE min(country) END AS recipient_country,
          CASE WHEN count(DISTINCT year) > 1 THEN 'Multiple years' ELSE min(year) END AS year,
          CASE WHEN count(DISTINCT type_of_flow) > 1 THEN 'Mixed' ELSE min(type_of_flow) END AS flow_type,
          coalesce(sum(usd_disbursements_defl), 0) AS project_total_disbursement,
          coalesce(sum(usd_commitment_defl), 0) AS project_total_commitment,
          min(channel_name) AS channel_name,
          min(channel_reported_name) AS channel_reported_name,
          count(*) AS raw_row_count
        FROM analytics.raw_oecd_philanthropy
        WHERE project_key = $1
        GROUP BY project_key
      )
      SELECT
        full_project.*,
        coalesce(selected_scope.selected_scope_disbursement, 0) AS selected_scope_disbursement,
        coalesce(selected_scope.selected_scope_commitment, 0) AS selected_scope_commitment
      FROM full_project
      LEFT JOIN selected_scope ON selected_scope.project_key = full_project.project_key`,
      params
    );

    if (!summary) {
      throw new Error(`Project not found: ${projectKey}`);
    }

    const [sectorRows, rawRows] = await Promise.all([
      query<PgRow>(
        `${cte},
        selected_sector AS (
          SELECT
            coalesce(sector_description, 'Unknown / Not reported') AS sector,
            min(subsector_description) AS subsector,
            coalesce(sum(disbursement_value), 0) AS selected_scope_disbursement,
            count(*) AS selected_raw_rows
          FROM filtered
          WHERE project_key = $1
          GROUP BY coalesce(sector_description, 'Unknown / Not reported')
        ),
        full_sector AS (
          SELECT
            coalesce(sector_description, 'Unknown / Not reported') AS sector,
            min(subsector_description) AS subsector,
            coalesce(sum(usd_disbursements_defl), 0) AS project_total_disbursement,
            count(*) AS raw_row_count
          FROM analytics.raw_oecd_philanthropy
          WHERE project_key = $1
          GROUP BY coalesce(sector_description, 'Unknown / Not reported')
        )
        SELECT
          full_sector.sector,
          full_sector.subsector,
          coalesce(selected_sector.selected_scope_disbursement, 0) AS selected_scope_disbursement,
          full_sector.project_total_disbursement,
          full_sector.raw_row_count
        FROM full_sector
        LEFT JOIN selected_sector ON selected_sector.sector = full_sector.sector
        ORDER BY full_sector.project_total_disbursement DESC`,
        params
      ),
      query<PgRow>(
        `SELECT
          project_key,
          row_id,
          raw_internal_id,
          year,
          organization_name,
          donor_country,
          country AS recipient_country,
          region,
          region_macro,
          type_of_flow AS flow_type,
          coalesce(usd_disbursements_defl, 0) AS selected_scope_disbursement,
          coalesce(usd_commitment_defl, 0) AS selected_scope_commitment,
          coalesce(usd_disbursements_defl, 0) AS project_total_disbursement,
          coalesce(usd_commitment_defl, 0) AS project_total_commitment,
          1 AS raw_row_count,
          1 AS sector_count,
          sector_description,
          subsector_description,
          sdg_focus,
          gender_marker,
          climate_change_mitigation,
          climate_change_adaptation,
          environment,
          biodiversity,
          desertification,
          nutrition,
          grant_recipient_project_title AS project_title,
          false AS has_mixed_values,
          channel_name,
          channel_reported_name
        FROM analytics.raw_oecd_philanthropy
        WHERE project_key = $1
        ORDER BY raw_internal_id`,
        [projectKey]
      )
    ]);

    const markerRows = rawRows as PgRow[];
    const warnings = [];
    if (num(summary.raw_row_count) > 1) {
      warnings.push(
        `This project appears across ${num(summary.raw_row_count)} raw sector rows. Amounts are grouped in Project View.`
      );
    }
    if (str(summary.organization_name)?.startsWith("Multiple") || str(summary.recipient_country)?.startsWith("Multiple")) {
      warnings.push("This project key has mixed raw values; the drawer shows all underlying rows.");
    }

    return {
      projectKey,
      title: str(summary.title),
      description: str(summary.description),
      rowId: str(summary.row_id),
      organizationName: str(summary.organization_name),
      donorCountry: str(summary.donor_country),
      recipientCountry: str(summary.recipient_country),
      year: str(summary.year),
      flowType: str(summary.flow_type),
      selectedScopeDisbursement: num(summary.selected_scope_disbursement),
      selectedScopeCommitment: num(summary.selected_scope_commitment),
      projectTotalDisbursement: num(summary.project_total_disbursement),
      projectTotalCommitment: num(summary.project_total_commitment),
      sectors: sectorRows.map((row) => ({
        sector: String(row.sector),
        subsector: str(row.subsector),
        selectedScopeDisbursement: num(row.selected_scope_disbursement),
        projectTotalDisbursement: num(row.project_total_disbursement),
        rawRowCount: num(row.raw_row_count)
      })),
      sdgFocus: Array.from(
        new Set(
          markerRows
            .flatMap((row) => String(row.sdg_focus ?? "").split(";"))
            .map((item) => item.trim())
            .filter(Boolean)
        )
      ),
      markers: {
        genderMarker: str(markerRows.find((row) => row.gender_marker)?.gender_marker),
        climateMitigation: str(
          markerRows.find((row) => row.climate_change_mitigation)?.climate_change_mitigation
        ),
        climateAdaptation: str(
          markerRows.find((row) => row.climate_change_adaptation)?.climate_change_adaptation
        ),
        environment: str(markerRows.find((row) => row.environment)?.environment),
        biodiversity: str(markerRows.find((row) => row.biodiversity)?.biodiversity),
        desertification: str(markerRows.find((row) => row.desertification)?.desertification),
        nutrition: str(markerRows.find((row) => row.nutrition)?.nutrition)
      },
      channelName: str(summary.channel_name),
      channelReportedName: str(summary.channel_reported_name),
      rawRows: rawRows.map(rawProjectRow),
      warnings
    };
  }

  async getFilterOptions(filters: DashboardFilters): Promise<FilterOptionsResponse> {
    const key = `filter-options:${canonicalFilterKey(filters)}`;
    return cached(key, 60_000, async () => {
      const { cte, params } = buildFilteredCte(filters);
      const optionQuery = (column: string, limit = 80) =>
        query<PgRow>(
          `${cte}
          SELECT ${column} AS label, ${column} AS value, count(*) AS count
          FROM filtered
          WHERE ${column} IS NOT NULL AND ${column} <> ''
          GROUP BY ${column}
          ORDER BY count DESC, ${column} ASC
          LIMIT ${limit}`,
          params
        );

      const [
        years,
        flowTypes,
        donorCountries,
        regionMacros,
        regions,
        recipientCountries,
        organizations,
        sectors,
        subsectors
      ] = await Promise.all([
        optionQuery("year", 12),
        optionQuery("type_of_flow", 10),
        optionQuery("donor_country", 40),
        optionQuery("region_macro", 30),
        optionQuery("region", 60),
        optionQuery("country", 100),
        optionQuery("organization_name", 100),
        optionQuery("sector_description", 60),
        optionQuery("subsector_description", 100)
      ]);

      return {
        years: years.map(optionRow),
        flowTypes: flowTypes.map(optionRow),
        donorCountries: donorCountries.map(optionRow),
        regionMacros: regionMacros.map(optionRow),
        regions: regions.map(optionRow),
        recipientCountries: recipientCountries.map(optionRow),
        organizations: organizations.map(optionRow),
        sectors: sectors.map(optionRow),
        subsectors: subsectors.map(optionRow)
      };
    });
  }

  async getInsights(filters: DashboardFilters): Promise<InsightCard[]> {
    const key = `insights:${canonicalFilterKey(filters)}`;
    return cached(key, 60_000, async () => {
      const { cte, params } = buildFilteredCte(filters);
      const [row] = await query<PgRow>(
        `${cte},
        totals AS (
          SELECT
            coalesce(sum(disbursement_value), 0) AS total_disbursement,
            count(*) AS raw_row_count,
            count(DISTINCT project_key) AS project_count,
            count(*) FILTER (WHERE is_regional_or_unspecified) AS regional_rows
          FROM filtered
        ),
        top_donor AS (
          SELECT donor_country, coalesce(sum(disbursement_value), 0) AS amount
          FROM filtered
          GROUP BY donor_country
          ORDER BY amount DESC
          LIMIT 1
        ),
        top_sector AS (
          SELECT coalesce(sector_description, 'Unknown / Not reported') AS sector, coalesce(sum(disbursement_value), 0) AS amount
          FROM filtered
          GROUP BY coalesce(sector_description, 'Unknown / Not reported')
          ORDER BY amount DESC
          LIMIT 1
        ),
        outliers AS (
          SELECT count(*) AS outlier_rows
          FROM filtered
          WHERE disbursement_value >= 14.8
        )
        SELECT
          totals.*,
          top_donor.donor_country,
          top_donor.amount AS top_donor_amount,
          top_sector.sector AS top_sector,
          top_sector.amount AS top_sector_amount,
          outliers.outlier_rows
        FROM totals
        LEFT JOIN top_donor ON true
        LEFT JOIN top_sector ON true
        LEFT JOIN outliers ON true`,
        params
      );

      const total = num(row.total_disbursement);
      const regionalShare = num(row.raw_row_count)
        ? Math.round((num(row.regional_rows) / num(row.raw_row_count)) * 100)
        : 0;
      const topDonorShare = total ? Math.round((num(row.top_donor_amount) / total) * 100) : 0;

      return [
        {
          id: "concentration",
          title: "Funding concentration",
          value: `${topDonorShare}%`,
          body: `${str(row.donor_country) ?? "The top donor"} accounts for ${topDonorShare}% of selected disbursements.`,
          severity: "watch"
        },
        {
          id: "project-grouping",
          title: "Project grouping matters",
          value: `${num(row.raw_row_count) - num(row.project_count)}`,
          body: "Raw sector rows exceed unique project keys, so Project View groups rows while preserving raw evidence.",
          severity: "info"
        },
        {
          id: "regional-unspecified",
          title: "Regional labels are material",
          value: `${regionalShare}%`,
          body: "Regional and unspecified recipients are separated from exact country map flows.",
          severity: "info"
        },
        {
          id: "top-sector",
          title: "Leading sector",
          value: str(row.top_sector) ?? "Unknown",
          body: "Sector totals update with every filter and can be used to narrow the investigation.",
          severity: "positive"
        },
        {
          id: "outliers",
          title: "Outlier-scale rows",
          value: `${num(row.outlier_rows)}`,
          body: "Rows at or above $14.8M are available through the major grants toggle.",
          severity: "watch"
        }
      ];
    });
  }
}

let repository: PostgresAnalyticsRepository | undefined;

export function getAnalyticsRepository() {
  repository ??= new PostgresAnalyticsRepository();
  return repository;
}
