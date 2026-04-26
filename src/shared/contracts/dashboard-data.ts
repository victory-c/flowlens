import { z } from "zod";

export const DATA_VERSION = "cleaned-oecd-2026-04-26-v2";
export const AMOUNT_UNIT = "USD_MILLIONS_2023" as const;
export const DATA_SOURCE = "cleaned_data_mart" as const;

export const causeSchema = z.enum([
  "Gender",
  "Climate",
  "Environment",
  "Biodiversity",
  "Nutrition",
  "Desertification"
]);

export const dashboardViewSchema = z.enum([
  "globe_flows",
  "overview_metrics",
  "country_summary",
  "flow_summary",
  "cause_summary",
  "yearly_summary",
  "raw_table",
  "filter_options",
  "project_detail",
  "dashboard_summary",
  "main_dashboard",
  "donor_summary",
  "sector_summary",
  "donor_portfolio",
  "cause_marker"
]);

export const viewModeSchema = z.enum(["project", "row"]).default("project");

export const sortBySchema = z
  .enum([
    "amount",
    "year",
    "donorCountry",
    "recipientCountry",
    "organization",
    "region",
    "cause",
    "project_key",
    "total_funding",
    "unique_projects",
    "sector_name",
    "donor",
    "recipient",
    "sector"
  ])
  .default("amount");

export const sortDirSchema = z.enum(["asc", "desc"]).default("desc");

const optionalString = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .optional()
  .catch(undefined);

const optionalNumber = z.coerce.number().finite().optional().catch(undefined);

export const dashboardFiltersSchema = z.object({
  year: optionalString,
  cause: causeSchema.optional().catch(undefined),
  donorCountry: optionalString,
  recipientCountry: optionalString,
  region: optionalString,
  organization: optionalString,
  donor: optionalString,
  sector: optionalString,
  minAmount: optionalNumber,
  q: z.string().trim().max(240).optional().catch(undefined),
  viewMode: viewModeSchema,
  outlierOnly: z.coerce.boolean().optional().default(false)
});

export const projectPageQuerySchema = dashboardFiltersSchema.extend({
  page: z.coerce.number().int().min(1).max(5000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: sortBySchema,
  sortDir: sortDirSchema
});

export const dashboardDataRequestSchema = projectPageQuerySchema.extend({
  view: dashboardViewSchema,
  projectKey: optionalString
});

export type Cause = z.infer<typeof causeSchema>;
export type DashboardView = z.infer<typeof dashboardViewSchema>;
export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
export type ProjectPageQuery = z.infer<typeof projectPageQuerySchema>;
export type DashboardDataRequest = z.infer<typeof dashboardDataRequestSchema>;
export type ViewMode = DashboardFilters["viewMode"];

export type DashboardWarning = {
  code: string;
  message: string;
};

export type CountryMeta = {
  country: string;
  displayName: string;
  iso2: string | null;
  iso3: string | null;
  latitude: number | null;
  longitude: number | null;
  mapped: boolean;
};

export type FilterOption = {
  label: string;
  value: string;
  count?: number;
  isAggregate?: boolean;
};

export type FilterOptionsResponse = {
  years: FilterOption[];
  donorCountries: FilterOption[];
  organizations: FilterOption[];
  regions: FilterOption[];
  recipientCountries: FilterOption[];
  sectors: FilterOption[];
  causes: FilterOption[];
};

export type OverviewMetrics = {
  totalFunding: number;
  validFinancialRows: number;
  uniqueProjects: number;
  organizations: number;
  donorCountries: number;
  recipientCountries: number;
  regions: number;
};

export type GlobeFlow = {
  donorCountry: string;
  recipientCountry: string;
  region: string;
  yearLabels: string[];
  flowType: string;
  totalFunding: number;
  uniqueProjects: number;
  donorIso2: string | null;
  donorIso3: string | null;
  donorLat: number | null;
  donorLng: number | null;
  recipientIso2: string | null;
  recipientIso3: string | null;
  recipientLat: number | null;
  recipientLng: number | null;
  recipientGeoType: string;
  exactGeo: boolean;
};

export type GlobeFlowsResponse = {
  rows: GlobeFlow[];
  totalRows: number;
  limit: number;
  truncated: boolean;
  unsupportedFilters: string[];
};

export type CountrySummaryRow = {
  country: string;
  region: string;
  totalFunding: number;
  uniqueProjects: number;
  iso2: string | null;
  iso3: string | null;
};

export type FlowSummaryRow = {
  donorCountry: string;
  recipientCountry: string;
  region: string;
  totalFunding: number;
  uniqueProjects: number;
  yearLabels: string[];
  donorIso2: string | null;
  donorIso3: string | null;
  recipientIso2: string | null;
  recipientIso3: string | null;
};

export type CauseSummaryRow = {
  yearLabel: string;
  cause: Cause;
  totalFunding: number;
  uniqueProjects: number;
};

export type YearlySummaryRow = {
  yearLabel: string;
  yearInt: number | null;
  totalFunding: number;
  uniqueProjects: number;
  isAggregate: boolean;
};

export type RawTableRow = {
  id: number;
  yearLabel: string;
  organization: string;
  recipientCountry: string;
  region: string;
  sectorName: string;
  amountUsd: number;
  projectTitle: string | null;
  projectId: string | null;
  projectKey: string;
  isAggregate: boolean;
  causes: Cause[];
};

export type RawTableResponse = {
  rows: RawTableRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalProjects: number;
};

export type ProjectDetailResponse = {
  projectKey: string;
  projectId: string | null;
  title: string | null;
  organization: string;
  recipientCountry: string;
  region: string;
  years: string[];
  totalFunding: number;
  selectedScopeFunding: number;
  sectorBreakdown: Array<{ sectorName: string; totalFunding: number }>;
  causes: Cause[];
  rawRows: RawTableRow[];
  warnings: DashboardWarning[];
};

export type KpiResponse = OverviewMetrics;

export type InsightCard = {
  id: string;
  title: string;
  value: string;
  body: string;
  severity: "info" | "watch" | "positive";
};

export type YearlyFundingDatum = {
  yearLabel: string;
  totalFunding: number;
  isAggregate: boolean;
};

export type DashboardCharts = {
  yearlyFunding: YearlyFundingDatum[];
  topRecipients: Array<{ label: string; value: number }>;
  topDonors: Array<{ label: string; value: number }>;
  topSectors: Array<{ label: string; value: number }>;
  causeMarkers: Array<{ label: string; value: number }>;
};

export type DashboardSummaryResponse = {
  dataVersion: string;
  amountUnit: typeof AMOUNT_UNIT;
  source: typeof DATA_SOURCE;
  filtersApplied: DashboardFilters;
  warnings: DashboardWarning[];
  kpis: KpiResponse;
  insights: InsightCard[];
  charts: DashboardCharts;
  filterOptions: FilterOptionsResponse;
  generatedAt: string;
};

export type DashboardDataResponse<T = unknown> = {
  dataVersion: string;
  amountUnit: typeof AMOUNT_UNIT;
  source: typeof DATA_SOURCE;
  view: DashboardView;
  filtersApplied: DashboardFilters;
  warnings: DashboardWarning[];
  data: T;
};

export type ProjectPageResponse = RawTableResponse;
