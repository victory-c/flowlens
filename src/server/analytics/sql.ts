import type { DashboardFilters, ProjectPageQuery } from "./contracts";

const FILTER_COLUMN_MAP: Partial<Record<keyof DashboardFilters, string>> = {
  flowType: "type_of_flow",
  donorCountry: "donor_country",
  regionMacro: "region_macro",
  region: "region",
  recipientCountry: "country",
  year: "year",
  organization: "organization_name",
  sector: "sector_description",
  subsector: "subsector_description"
};

export function selectedMeasureColumn(filters: DashboardFilters) {
  return filters.measure === "commitment" ? "commitment_value" : "disbursement_value";
}

export function hasUserFilters(filters: DashboardFilters) {
  return Boolean(
    filters.flowType ||
      filters.donorCountry ||
      filters.regionMacro ||
      filters.region ||
      filters.recipientCountry ||
      filters.year ||
      filters.organization ||
      filters.sector ||
      filters.subsector ||
      filters.amountMin !== undefined ||
      filters.amountMax !== undefined ||
      filters.keyword ||
      filters.outlierOnly
  );
}

export function buildFilteredCte(filters: DashboardFilters, existingParams: unknown[] = []) {
  const params = [...existingParams];
  const where: string[] = ["1 = 1"];

  for (const [filterKey, column] of Object.entries(FILTER_COLUMN_MAP) as Array<
    [keyof DashboardFilters, string]
  >) {
    const value = filters[filterKey];
    if (typeof value === "string" && value.length > 0) {
      params.push(value);
      where.push(`${column} = $${params.length}`);
    }
  }

  if (filters.amountMin !== undefined) {
    params.push(filters.amountMin);
    where.push(`${selectedMeasureColumn(filters)} >= $${params.length}`);
  }

  if (filters.amountMax !== undefined) {
    params.push(filters.amountMax);
    where.push(`${selectedMeasureColumn(filters)} <= $${params.length}`);
  }

  if (filters.outlierOnly) {
    where.push("disbursement_value >= 14.8");
  }

  if (filters.keyword) {
    params.push(`%${filters.keyword.toLowerCase()}%`);
    const index = params.length;
    where.push(`(
      lower(coalesce(row_id, '')) LIKE $${index}
      OR lower(coalesce(project_key, '')) LIKE $${index}
      OR lower(coalesce(organization_name, '')) LIKE $${index}
      OR lower(coalesce(grant_recipient_project_title, '')) LIKE $${index}
      OR lower(coalesce(project_description, '')) LIKE $${index}
      OR lower(coalesce(channel_name, '')) LIKE $${index}
      OR lower(coalesce(channel_reported_name, '')) LIKE $${index}
      OR lower(coalesce(country, '')) LIKE $${index}
      OR lower(coalesce(donor_country, '')) LIKE $${index}
    )`);
  }

  return {
    params,
    cte: `
      WITH filtered AS (
        SELECT
          raw_internal_id,
          project_key,
          row_id,
          year,
          organization_name,
          region,
          country,
          type_of_flow,
          donor_country,
          grant_recipient_project_title,
          project_description,
          gender_dimension,
          additional_info,
          gender_marker,
          climate_change_mitigation,
          climate_change_adaptation,
          subsector,
          sdg_focus,
          subsector_description,
          sector,
          sector_description,
          channel_code,
          channel_name,
          channel_reported_name,
          environment,
          biodiversity,
          desertification,
          nutrition,
          region_macro,
          is_regional_or_unspecified,
          coalesce(usd_disbursements_defl, 0)::numeric AS disbursement_value,
          coalesce(usd_commitment_defl, 0)::numeric AS commitment_value
        FROM analytics.raw_oecd_philanthropy
        WHERE ${where.join("\n          AND ")}
      )
    `
  };
}

export function sortSql(query: ProjectPageQuery) {
  const direction = query.sortDir === "asc" ? "ASC" : "DESC";
  const nulls = query.sortDir === "asc" ? "NULLS LAST" : "NULLS LAST";
  const columns: Record<ProjectPageQuery["sortBy"], string> = {
    amount: "selected_scope_disbursement",
    year: "year",
    organization: "organization_name",
    donor: "donor_country",
    recipient: "recipient_country",
    sector: "sector_description",
    project_key: "project_key"
  };
  return `${columns[query.sortBy]} ${direction} ${nulls}, project_key ASC`;
}
