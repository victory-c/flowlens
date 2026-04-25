import type {
  DashboardFilters,
  DashboardSummaryResponse,
  ProjectDetailResponse,
  ProjectPageResponse,
  ProjectPageQuery
} from "@/server/analytics/contracts";

export function filtersToParams(filters: Partial<DashboardFilters>) {
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

export function getDashboardSummary(filters: DashboardFilters) {
  const params = filtersToParams(filters);
  return fetchJson<DashboardSummaryResponse>(`/api/dashboard-summary?${params.toString()}`);
}

export function getProjects(query: ProjectPageQuery) {
  const params = filtersToParams(query);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  params.set("sortBy", query.sortBy);
  params.set("sortDir", query.sortDir);
  return fetchJson<ProjectPageResponse>(`/api/projects?${params.toString()}`);
}

export function getProjectDetail(projectKey: string, filters: DashboardFilters) {
  const params = filtersToParams(filters);
  return fetchJson<ProjectDetailResponse>(
    `/api/projects/${encodeURIComponent(projectKey)}?${params.toString()}`
  );
}
