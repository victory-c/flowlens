import {
  dashboardFiltersSchema,
  projectPageQuerySchema,
  type DashboardFilters,
  type ProjectPageQuery
} from "./contracts";

export function parseFilters(searchParams: URLSearchParams): DashboardFilters {
  return dashboardFiltersSchema.parse(Object.fromEntries(searchParams.entries()));
}

export function parseProjectPageQuery(searchParams: URLSearchParams): ProjectPageQuery {
  return projectPageQuerySchema.parse(Object.fromEntries(searchParams.entries()));
}

export function canonicalFilterKey(filters: DashboardFilters) {
  const normalized = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== "" && value !== false)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(normalized);
}
