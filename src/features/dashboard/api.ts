import type {
  CauseSummaryRow,
  CountrySummaryResponse,
  DashboardDataResponse,
  DashboardDataRequest,
  DashboardFilters,
  DashboardSummaryResponse,
  FilterOptionsResponse,
  FlowSummaryResponse,
  GlobeFlowsResponse,
  OverviewMetrics,
  ProjectDetailResponse,
  RawTableResponse,
  YearlySummaryRow
} from "@/shared/contracts/dashboard-data";

type ViewResponseMap = {
  globe_flows: GlobeFlowsResponse;
  overview_metrics: OverviewMetrics;
  country_summary: CountrySummaryResponse;
  flow_summary: FlowSummaryResponse;
  cause_summary: CauseSummaryRow[];
  yearly_summary: YearlySummaryRow[];
  raw_table: RawTableResponse;
  filter_options: FilterOptionsResponse;
  project_detail: ProjectDetailResponse;
  dashboard_summary: DashboardSummaryResponse;
};

function paramsFromFilters(filters: Partial<DashboardFilters>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    params.set(key, String(value));
  }

  return params;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getDashboardView<TView extends keyof ViewResponseMap>(
  view: TView,
  options: {
    filters: DashboardFilters;
    page?: number;
    pageSize?: number;
    sortBy?: DashboardDataRequest["sortBy"];
    sortDir?: DashboardDataRequest["sortDir"];
    projectKey?: string;
  }
) {
  const params = paramsFromFilters(options.filters);
  params.set("view", view);
  params.set("page", String(options.page ?? 1));
  params.set("pageSize", String(options.pageSize ?? 25));
  params.set("sortBy", options.sortBy ?? "amount");
  params.set("sortDir", options.sortDir ?? "desc");
  if (options.projectKey) params.set("projectKey", options.projectKey);

  return fetchJson<DashboardDataResponse<ViewResponseMap[TView]>>(
    `/api/v1/dashboard-data?${params.toString()}`
  );
}

export function getGlobeFlows(filters: DashboardFilters) {
  return getDashboardView("globe_flows", {
    filters,
    pageSize: 200,
    sortBy: "amount",
    sortDir: "desc"
  });
}

export function getOverviewMetrics(filters: DashboardFilters) {
  return getDashboardView("overview_metrics", { filters });
}

export function getCountrySummary(
  filters: DashboardFilters,
  page = 1,
  pageSize = 25,
  sortBy: DashboardDataRequest["sortBy"] = "amount",
  sortDir: DashboardDataRequest["sortDir"] = "desc"
) {
  return getDashboardView("country_summary", {
    filters,
    page,
    pageSize,
    sortBy,
    sortDir
  });
}

export function getFlowSummary(
  filters: DashboardFilters,
  page = 1,
  pageSize = 25,
  sortBy: DashboardDataRequest["sortBy"] = "amount",
  sortDir: DashboardDataRequest["sortDir"] = "desc"
) {
  return getDashboardView("flow_summary", {
    filters,
    page,
    pageSize,
    sortBy,
    sortDir
  });
}

export function getCauseSummary(filters: DashboardFilters) {
  return getDashboardView("cause_summary", {
    filters,
    pageSize: 50,
    sortBy: "amount",
    sortDir: "desc"
  });
}

export function getYearlySummary(filters: DashboardFilters) {
  return getDashboardView("yearly_summary", {
    filters,
    pageSize: 20,
    sortBy: "year",
    sortDir: "asc"
  });
}

export function getRawTable(filters: DashboardFilters, page = 1, pageSize = 25) {
  return getDashboardView("raw_table", {
    filters,
    page,
    pageSize,
    sortBy: "amount",
    sortDir: "desc"
  });
}

export function getFilterOptions(filters: DashboardFilters) {
  return getDashboardView("filter_options", {
    filters,
    pageSize: 1
  });
}

export function getProjectDetail(projectKey: string, filters: DashboardFilters) {
  return getDashboardView("project_detail", {
    filters,
    projectKey,
    pageSize: 1
  });
}

export function getDashboardSummary(filters: DashboardFilters) {
  return getDashboardView("dashboard_summary", {
    filters,
    pageSize: 1
  });
}
