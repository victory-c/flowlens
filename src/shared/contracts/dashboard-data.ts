import { z } from "zod";

export const DATA_VERSION = "cleaned-oecd-2026-04-26-v1";
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
  "dashboard_summary",
  "main_dashboard",
  "country_summary",
  "donor_summary",
  "sector_summary",
  "donor_portfolio",
  "cause_marker",
  "project_detail",
  "filter_options"
]);

export const viewModeSchema = z.enum(["project", "row"]).default("project");

export const sortBySchema = z
  .enum([
    "amount",
    "year",
    "donor",
    "recipient",
    "sector",
    "project_key",
    "total_funding",
    "unique_projects",
    "recipient_country",
    "sector_name",
    "cause"
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

export const dashboardFiltersSchema = z.object({
  year: optionalString,
  donor: optionalString,
  region: optionalString,
  recipientCountry: optionalString,
  sector: optionalString,
  cause: causeSchema.optional().catch(undefined),
  q: z.string().trim().max(240).optional().catch(undefined),
  viewMode: viewModeSchema,
  outlierOnly: z.coerce.boolean().optional().default(false)
});

export const projectPageQuerySchema = dashboardFiltersSchema.extend({
  page: z.coerce.number().int().min(1).max(5000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
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

export type FilterOption = {
  label: string;
  value: string;
  count?: number;
  isAggregate?: boolean;
};

export type FilterOptionsResponse = {
  years: FilterOption[];
  donors: FilterOption[];
  regions: FilterOption[];
  recipientCountries: FilterOption[];
  sectors: FilterOption[];
  causes: FilterOption[];
};

export type KpiResponse = {
  totalFunding: number;
  validFinancialRows: number;
  uniqueProjects: number;
  donors: number;
  recipients: number;
  regions: number;
  sectors: number;
};

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

export type RecipientDatum = {
  recipientCountry: string;
  region: string;
  totalFunding: number;
  uniqueProjects: number;
};

export type DonorDatum = {
  donor: string;
  totalFunding: number;
  uniqueProjects: number;
  recipientCountriesCount: number;
};

export type SectorDatum = {
  sectorName: string;
  totalFunding: number;
};

export type CauseMarkerDatum = {
  yearLabel: string;
  cause: Cause;
  totalFunding: number;
  uniqueProjects: number;
};

export type DonorPortfolioDatum = {
  donor: string;
  sectorName: string;
  totalFunding: number;
};

export type DashboardCharts = {
  yearlyFunding: YearlyFundingDatum[];
  aggregateFunding: YearlyFundingDatum[];
  topRecipients: RecipientDatum[];
  topDonors: DonorDatum[];
  topSectors: SectorDatum[];
  causeMarkers: CauseMarkerDatum[];
  donorPortfolio: DonorPortfolioDatum[];
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

export type ProjectRow = {
  projectKey: string;
  projectId: string | null;
  yearLabel: string;
  donor: string;
  recipientCountry: string;
  region: string;
  sectorName: string;
  projectTitle: string | null;
  selectedScopeFunding: number;
  projectTotalFunding: number;
  rowCount: number;
  sectorCount: number;
  isAggregate: boolean;
  causes: Cause[];
};

export type CleanedRawRow = {
  id: number;
  yearLabel: string;
  donor: string;
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

export type ProjectPageResponse = {
  rows: ProjectRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalProjects: number;
};

export type ProjectDetailResponse = {
  projectKey: string;
  projectId: string | null;
  title: string | null;
  donor: string;
  recipientCountry: string;
  region: string;
  years: string[];
  totalFunding: number;
  selectedScopeFunding: number;
  sectorBreakdown: SectorDatum[];
  causes: Cause[];
  rawRows: CleanedRawRow[];
  warnings: DashboardWarning[];
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

export type FlowUnavailableResponse = {
  available: false;
  warning: DashboardWarning;
};
