import { z } from "zod";

export const measureSchema = z.enum(["disbursement", "commitment"]).default("disbursement");
export const viewModeSchema = z.enum(["project", "raw"]).default("project");
export const sortBySchema = z
  .enum(["amount", "year", "organization", "donor", "recipient", "sector", "project_key"])
  .default("amount");
export const sortDirSchema = z.enum(["asc", "desc"]).default("desc");

const optionalString = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .optional()
  .catch(undefined);

const optionalNumber = z.coerce.number().finite().optional().catch(undefined);

export const dashboardFiltersSchema = z.object({
  measure: measureSchema,
  viewMode: viewModeSchema,
  flowType: optionalString,
  donorCountry: optionalString,
  regionMacro: optionalString,
  region: optionalString,
  recipientCountry: optionalString,
  year: optionalString,
  organization: optionalString,
  sector: optionalString,
  subsector: optionalString,
  amountMin: optionalNumber,
  amountMax: optionalNumber,
  keyword: z.string().trim().max(220).optional().catch(undefined),
  outlierOnly: z.coerce.boolean().optional().default(false)
});

export const projectPageQuerySchema = dashboardFiltersSchema.extend({
  page: z.coerce.number().int().min(1).max(5000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  sortBy: sortBySchema,
  sortDir: sortDirSchema,
  cursorValue: optionalString,
  cursorProjectKey: optionalString
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
export type ProjectPageQuery = z.infer<typeof projectPageQuerySchema>;
export type Measure = DashboardFilters["measure"];
export type ViewMode = DashboardFilters["viewMode"];

export type KpiResponse = {
  totalDisbursement: number;
  totalCommitment: number;
  projectCount: number;
  rawRowCount: number;
  donorCountryCount: number;
  recipientLabelCount: number;
  organizationCount: number;
};

export type ChartDatum = {
  label: string;
  value: number;
  totalDisbursement?: number;
  totalCommitment?: number;
  projectCount?: number;
  rawRowCount?: number;
};

export type YearTrendDatum = {
  year: string;
  totalDisbursement: number;
  totalCommitment: number;
  projectCount: number;
  rawRowCount: number;
  isAggregateYear: boolean;
};

export type OverviewResponse = {
  yearlyTrend: YearTrendDatum[];
  topDonors: ChartDatum[];
  topRecipients: ChartDatum[];
  sectorBreakdown: ChartDatum[];
};

export type ExactCountryFlow = {
  donorCountry: string;
  recipientCountry: string;
  donorIso3: string;
  recipientIso3: string;
  donorLat: number;
  donorLng: number;
  recipientLat: number;
  recipientLng: number;
  totalDisbursement: number;
  totalCommitment: number;
  projectCount: number;
  rawRowCount: number;
  topSector: string | null;
  topOrganization: string | null;
};

export type DomesticFlow = {
  country: string;
  iso3: string | null;
  lat: number | null;
  lng: number | null;
  totalDisbursement: number;
  totalCommitment: number;
  projectCount: number;
  rawRowCount: number;
};

export type RegionalFlow = {
  donorCountry: string | null;
  recipientLabel: string;
  regionMacro: string | null;
  region: string | null;
  geoType: "regional" | "unspecified" | "unmapped";
  totalDisbursement: number;
  totalCommitment: number;
  projectCount: number;
  rawRowCount: number;
  topSector: string | null;
  topOrganization: string | null;
};

export type FlowResponse = {
  exactCountryFlows: ExactCountryFlow[];
  domesticFlows: DomesticFlow[];
  regionalUnspecifiedFlows: RegionalFlow[];
  unmappedCount: number;
};

export type FilterOption = {
  label: string;
  value: string;
  count: number;
};

export type FilterOptionsResponse = {
  years: FilterOption[];
  flowTypes: FilterOption[];
  donorCountries: FilterOption[];
  regionMacros: FilterOption[];
  regions: FilterOption[];
  recipientCountries: FilterOption[];
  organizations: FilterOption[];
  sectors: FilterOption[];
  subsectors: FilterOption[];
};

export type InsightCard = {
  id: string;
  title: string;
  value: string;
  body: string;
  severity: "info" | "watch" | "positive";
};

export type ProjectRow = {
  projectKey: string;
  rowId: string | null;
  rawInternalId?: number;
  year: string | null;
  organizationName: string | null;
  donorCountry: string | null;
  recipientCountry: string | null;
  region: string | null;
  regionMacro: string | null;
  flowType: string | null;
  selectedScopeDisbursement: number;
  selectedScopeCommitment: number;
  projectTotalDisbursement: number;
  projectTotalCommitment: number;
  rawRowCount: number;
  sectorCount: number;
  sectorDescription: string | null;
  subsectorDescription: string | null;
  sdgFocus: string | null;
  projectTitle: string | null;
  hasMixedValues: boolean;
};

export type RawProjectRow = ProjectRow & {
  rawInternalId: number;
  channelName: string | null;
  channelReportedName: string | null;
};

export type ProjectPageResponse = {
  rows: ProjectRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalProjects: number;
  nextCursor: { value: string; projectKey: string } | null;
};

export type ProjectDetailResponse = {
  projectKey: string;
  title: string | null;
  description: string | null;
  rowId: string | null;
  organizationName: string | null;
  donorCountry: string | null;
  recipientCountry: string | null;
  year: string | null;
  flowType: string | null;
  selectedScopeDisbursement: number;
  selectedScopeCommitment: number;
  projectTotalDisbursement: number;
  projectTotalCommitment: number;
  sectors: Array<{
    sector: string;
    subsector: string | null;
    selectedScopeDisbursement: number;
    projectTotalDisbursement: number;
    rawRowCount: number;
  }>;
  sdgFocus: string[];
  markers: Record<string, string | null>;
  channelName: string | null;
  channelReportedName: string | null;
  rawRows: RawProjectRow[];
  warnings: string[];
};

export type DashboardSummaryResponse = {
  filters: DashboardFilters;
  kpis: KpiResponse;
  overview: OverviewResponse;
  flows: FlowResponse;
  filterOptions: FilterOptionsResponse;
  insights: InsightCard[];
  generatedAt: string;
};
