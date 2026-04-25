import type {
  DashboardFilters,
  DashboardSummaryResponse,
  FilterOptionsResponse,
  FlowResponse,
  InsightCard,
  KpiResponse,
  OverviewResponse,
  ProjectDetailResponse,
  ProjectPageQuery,
  ProjectPageResponse
} from "./contracts";

export interface AnalyticsRepository {
  getKpis(filters: DashboardFilters): Promise<KpiResponse>;
  getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummaryResponse>;
  getOverview(filters: DashboardFilters): Promise<OverviewResponse>;
  getFlowSummary(filters: DashboardFilters): Promise<FlowResponse>;
  getProjectPage(query: ProjectPageQuery): Promise<ProjectPageResponse>;
  getProjectDetail(projectKey: string, filters: DashboardFilters): Promise<ProjectDetailResponse>;
  getFilterOptions(filters: DashboardFilters): Promise<FilterOptionsResponse>;
  getInsights(filters: DashboardFilters): Promise<InsightCard[]>;
}
