import {
  dashboardDataRequestSchema,
  dashboardFiltersSchema,
  projectPageQuerySchema,
  type DashboardDataRequest,
  type DashboardFilters,
  type ProjectPageQuery
} from "@/shared/contracts/dashboard-data";

function paramsObject(searchParams: URLSearchParams) {
  const values = Object.fromEntries(searchParams.entries()) as Record<string, string>;

  // Compatibility aliases from legacy routes/filters.
  if (!values.organization && values.donor) values.organization = values.donor;
  if (!values.organization && values.organizationName) values.organization = values.organizationName;
  if (!values.donorCountry && values.donor_country) values.donorCountry = values.donor_country;
  if (!values.recipientCountry && values.recipient) values.recipientCountry = values.recipient;
  if (!values.recipientCountry && values.recipient_country) values.recipientCountry = values.recipient_country;
  if (!values.minAmount && values.amountMin) values.minAmount = values.amountMin;
  if (!values.tableQ && values.table_q) values.tableQ = values.table_q;
  if (!values.includeDomestic && values.include_domestic) values.includeDomestic = values.include_domestic;
  if (!values.q && values.keyword) values.q = values.keyword;
  if (values.viewMode === "raw") values.viewMode = "row";

  return values;
}

export function parseCleanedFilters(searchParams: URLSearchParams): DashboardFilters {
  return dashboardFiltersSchema.parse(paramsObject(searchParams));
}

export function parseCleanedProjectPageQuery(searchParams: URLSearchParams): ProjectPageQuery {
  return projectPageQuerySchema.parse(paramsObject(searchParams));
}

export function parseDashboardDataRequest(searchParams: URLSearchParams): DashboardDataRequest {
  return dashboardDataRequestSchema.parse(paramsObject(searchParams));
}

export function canonicalCleanedKey(value: Record<string, unknown>) {
  const normalized = Object.entries(value)
    .filter(([, entry]) => entry !== undefined && entry !== "" && entry !== false)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(normalized);
}
