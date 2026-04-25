"use client";

import { formatNumber, formatUsdMillions } from "@/lib/utils";
import type {
  DashboardFilters,
  DashboardSummaryResponse,
  FilterOption,
  ProjectDetailResponse,
  ProjectPageQuery,
  ProjectRow
} from "@/server/analytics/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownUp,
  BarChart3,
  Database,
  FilterX,
  Loader2,
  RotateCcw,
  Search,
  X
} from "lucide-react";
import { useMemo, useState } from "react";
import { BarChartCard, TrendChartCard } from "./chart-card";
import { getDashboardSummary, getProjectDetail, getProjects } from "./api";
import { useDashboardFilters } from "./use-dashboard-filters";

const FILTER_LABELS: Partial<Record<keyof DashboardFilters, string>> = {
  flowType: "Flow",
  donorCountry: "Donor",
  regionMacro: "Macro region",
  region: "Region",
  recipientCountry: "Recipient",
  year: "Year",
  organization: "Organization",
  sector: "Sector",
  subsector: "Subsector",
  keyword: "Keyword",
  amountMin: "Min amount",
  amountMax: "Max amount",
  outlierOnly: "Major grants"
};

export function FlowLensDashboard() {
  const { filters, setFilters, clearFilter, resetFilters } = useDashboardFilters();
  const [page, setPage] = useState(1);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<ProjectPageQuery["sortBy"]>("amount");
  const [sortDir, setSortDir] = useState<ProjectPageQuery["sortDir"]>("desc");

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", filters],
    queryFn: () => getDashboardSummary(filters)
  });

  const projectQuery = useQuery({
    queryKey: ["projects", filters, page, sortBy, sortDir],
    queryFn: () =>
      getProjects({
        ...filters,
        page,
        pageSize: 25,
        sortBy,
        sortDir
      })
  });

  const detailQuery = useQuery({
    queryKey: ["project-detail", selectedProjectKey, filters],
    queryFn: () => getProjectDetail(selectedProjectKey as string, filters),
    enabled: Boolean(selectedProjectKey)
  });

  const summary = summaryQuery.data;

  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div>
            <h1 className="text-2xl font-semibold text-ink">FlowLens</h1>
            <p className="text-sm text-slate-600">
              Trace philanthropic capital from donor to destination, then inspect project evidence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={filters.measure}
              options={[
                ["disbursement", "Disbursement"],
                ["commitment", "Commitment"]
              ]}
              onChange={(measure) => setFilters({ measure: measure as DashboardFilters["measure"] })}
            />
            <Segmented
              value={filters.viewMode}
              options={[
                ["project", "Project View"],
                ["raw", "Raw Rows"]
              ]}
              onChange={(viewMode) => setFilters({ viewMode: viewMode as DashboardFilters["viewMode"] })}
            />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-panel"
              onClick={() => {
                resetFilters();
                setPage(1);
              }}
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[310px_minmax(0,1fr)] lg:px-6">
        <aside className="space-y-4">
          <FilterPanel
            filters={filters}
            summary={summary}
            setFilters={(patch) => {
              setPage(1);
              setFilters(patch);
            }}
          />
          <DataQualityCard />
        </aside>

        <section className="space-y-4">
          <ActiveFilters filters={filters} clearFilter={clearFilter} />

          {summaryQuery.isLoading && <LoadingPanel label="Loading dashboard summary" />}
          {summaryQuery.isError && <ErrorPanel error={summaryQuery.error} />}
          {summary && (
            <>
              <KpiCards summary={summary} />
              <InsightCards summary={summary} />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
                <FlowExplorer
                  summary={summary}
                  filters={filters}
                  onRouteSelect={(patch) => {
                    setPage(1);
                    setFilters(patch);
                  }}
                />
                <RegionalPanel summary={summary} onSelect={(recipientCountry) => setFilters({ recipientCountry })} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <TrendChartCard data={summary.overview.yearlyTrend} measure={filters.measure} />
                <BarChartCard
                  title="Top Donor Countries"
                  data={summary.overview.topDonors}
                  color="#2364aa"
                  onSelect={(donorCountry) => setFilters({ donorCountry })}
                />
                <BarChartCard
                  title="Top Recipient Countries / Regions"
                  data={summary.overview.topRecipients}
                  color="#2a9d8f"
                  onSelect={(recipientCountry) => setFilters({ recipientCountry })}
                />
                <BarChartCard
                  title="Sector Breakdown"
                  data={summary.overview.sectorBreakdown}
                  color="#e76f51"
                  onSelect={(sector) => setFilters({ sector })}
                />
              </div>
            </>
          )}

          <ProjectInspector
            rows={projectQuery.data?.rows ?? []}
            totalRows={projectQuery.data?.totalRows ?? 0}
            totalProjects={projectQuery.data?.totalProjects ?? 0}
            page={page}
            pageSize={projectQuery.data?.pageSize ?? 25}
            loading={projectQuery.isLoading}
            sortBy={sortBy}
            sortDir={sortDir}
            measure={filters.measure}
            viewMode={filters.viewMode}
            setPage={setPage}
            setSortBy={setSortBy}
            setSortDir={setSortDir}
            onSelectProject={setSelectedProjectKey}
          />
        </section>
      </div>

      <ProjectDetailDrawer
        detail={detailQuery.data}
        loading={detailQuery.isLoading}
        open={Boolean(selectedProjectKey)}
        onClose={() => setSelectedProjectKey(null)}
      />
    </main>
  );
}

function Segmented({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-panel p-1">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          className={`h-8 rounded px-3 text-sm font-medium ${
            value === optionValue ? "bg-white text-ink shadow-sm" : "text-slate-600 hover:text-ink"
          }`}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-white p-5 text-sm text-slate-600 shadow-soft">
      <Loader2 className="animate-spin" size={18} />
      {label}
    </div>
  );
}

function ErrorPanel({ error }: { error: Error | null }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {error?.message ?? "The dashboard could not load."}
    </div>
  );
}

function FilterPanel({
  filters,
  summary,
  setFilters
}: {
  filters: DashboardFilters;
  summary?: DashboardSummaryResponse;
  setFilters: (patch: Partial<DashboardFilters>) => void;
}) {
  const options = summary?.filterOptions;
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Filter Ladder
        </h2>
        <FilterX size={18} className="text-slate-400" />
      </div>
      <div className="space-y-3">
        <SelectFilter
          label="Flow type"
          value={filters.flowType}
          options={options?.flowTypes}
          onChange={(flowType) => setFilters({ flowType })}
        />
        <SelectFilter
          label="Donor country"
          value={filters.donorCountry}
          options={options?.donorCountries}
          onChange={(donorCountry) => setFilters({ donorCountry })}
        />
        <SelectFilter
          label="Recipient macro region"
          value={filters.regionMacro}
          options={options?.regionMacros}
          onChange={(regionMacro) => setFilters({ regionMacro })}
        />
        <SelectFilter
          label="Recipient country / region"
          value={filters.recipientCountry}
          options={options?.recipientCountries}
          onChange={(recipientCountry) => setFilters({ recipientCountry })}
        />
        <SelectFilter
          label="Year"
          value={filters.year}
          options={options?.years}
          onChange={(year) => setFilters({ year })}
        />
        <SelectFilter
          label="Sector"
          value={filters.sector}
          options={options?.sectors}
          onChange={(sector) => setFilters({ sector })}
        />
        <SelectFilter
          label="Organization"
          value={filters.organization}
          options={options?.organizations}
          onChange={(organization) => setFilters({ organization })}
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Keyword</label>
          <div className="flex items-center gap-2 rounded-md border border-line px-2">
            <Search size={15} className="text-slate-400" />
            <input
              className="h-10 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
              defaultValue={filters.keyword ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.value;
                window.clearTimeout(Number(event.currentTarget.dataset.timer));
                const timer = window.setTimeout(() => setFilters({ keyword: value || undefined }), 400);
                event.currentTarget.dataset.timer = String(timer);
              }}
              placeholder="Project, organization, channel"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-line p-3 text-sm">
          <input
            type="checkbox"
            checked={Boolean(filters.outlierOnly)}
            onChange={(event) => setFilters({ outlierOnly: event.currentTarget.checked })}
          />
          Show major / outlier-scale grants only
        </label>
      </div>
      <p className="mt-4 rounded-md bg-panel p-3 text-xs leading-5 text-slate-600">
        Suggested next step: select donor, recipient, year, then sector or organization to narrow
        toward project evidence.
      </p>
    </section>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value?: string;
  options?: FilterOption[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-line bg-white px-2 text-sm outline-none focus:border-ocean"
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      >
        <option value="">All</option>
        {(options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({formatNumber(option.count)})
          </option>
        ))}
      </select>
    </label>
  );
}

function ActiveFilters({
  filters,
  clearFilter
}: {
  filters: DashboardFilters;
  clearFilter: (key: keyof DashboardFilters) => void;
}) {
  const entries = Object.entries(filters).filter(([key, value]) => {
    if (key === "measure" || key === "viewMode") return false;
    return value !== undefined && value !== false && value !== "";
  }) as Array<[keyof DashboardFilters, string | number | boolean]>;

  if (!entries.length) {
    return (
      <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-slate-600 shadow-soft">
        All funding. Amounts are USD millions, deflated to 2023 constant values.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 shadow-soft">
      <span className="text-sm font-medium text-slate-600">All funding</span>
      {entries.map(([key, value]) => (
        <button
          key={key}
          className="inline-flex items-center gap-1 rounded-full bg-panel px-3 py-1 text-sm text-ink hover:bg-slate-200"
          onClick={() => clearFilter(key)}
        >
          {FILTER_LABELS[key]}: {String(value)}
          <X size={14} />
        </button>
      ))}
    </div>
  );
}

function KpiCards({ summary }: { summary: DashboardSummaryResponse }) {
  const kpis = [
    ["Total disbursement", formatUsdMillions(summary.kpis.totalDisbursement)],
    ["Total commitment", formatUsdMillions(summary.kpis.totalCommitment)],
    ["Projects", formatNumber(summary.kpis.projectCount)],
    ["Raw rows", formatNumber(summary.kpis.rawRowCount)],
    ["Donor countries", formatNumber(summary.kpis.donorCountryCount)],
    ["Recipients", formatNumber(summary.kpis.recipientLabelCount)],
    ["Organizations", formatNumber(summary.kpis.organizationCount)]
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {kpis.map(([label, value]) => (
        <section key={label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </section>
      ))}
    </div>
  );
}

function InsightCards({ summary }: { summary: DashboardSummaryResponse }) {
  return (
    <div className="grid gap-3 xl:grid-cols-5">
      {summary.insights.map((insight) => (
        <section key={insight.id} className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {insight.title}
          </p>
          <p className="mt-2 text-xl font-semibold text-ink">{insight.value}</p>
          <p className="mt-2 text-sm leading-5 text-slate-600">{insight.body}</p>
        </section>
      ))}
    </div>
  );
}

function FlowExplorer({
  summary,
  filters,
  onRouteSelect
}: {
  summary: DashboardSummaryResponse;
  filters: DashboardFilters;
  onRouteSelect: (patch: Partial<DashboardFilters>) => void;
}) {
  const flows = summary.flows.exactCountryFlows.slice(0, 70);
  const measure = filters.measure === "commitment" ? "totalCommitment" : "totalDisbursement";
  const maxAmount = Math.max(...flows.map((flow) => flow[measure]), 1);
  const project = (lat: number, lng: number) => ({
    x: ((lng + 180) / 360) * 1000,
    y: ((90 - lat) / 180) * 460
  });

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Flow Explorer
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Showing {formatNumber(summary.kpis.rawRowCount)} raw rows /{" "}
            {formatNumber(summary.kpis.projectCount)} projects
          </p>
        </div>
        <BarChart3 className="text-ocean" size={22} />
      </div>
      <svg
        viewBox="0 0 1000 460"
        role="img"
        aria-label="Projected donor to recipient funding flows"
        className="h-[430px] w-full rounded-md border border-line bg-[#eef3f7]"
      >
        {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((x) => (
          <line key={`x-${x}`} x1={x} y1={0} x2={x} y2={460} stroke="#d9deea" strokeWidth="1" />
        ))}
        {[80, 160, 240, 320, 400].map((y) => (
          <line key={`y-${y}`} x1={0} y1={y} x2={1000} y2={y} stroke="#d9deea" strokeWidth="1" />
        ))}
        {flows.map((flow) => {
          const start = project(flow.donorLat, flow.donorLng);
          const end = project(flow.recipientLat, flow.recipientLng);
          const width = 1 + (flow[measure] / maxAmount) * 9;
          const midX = (start.x + end.x) / 2;
          const midY = Math.min(start.y, end.y) - Math.abs(start.x - end.x) * 0.09 - 20;
          return (
            <g key={`${flow.donorCountry}-${flow.recipientCountry}`}>
              <path
                d={`M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`}
                fill="none"
                stroke="#2364aa"
                strokeOpacity="0.32"
                strokeWidth={width}
                className="cursor-pointer hover:stroke-coral"
                onClick={() =>
                  onRouteSelect({
                    donorCountry: flow.donorCountry,
                    recipientCountry: flow.recipientCountry,
                    flowType: "Cross-border"
                  })
                }
              />
              <circle cx={end.x} cy={end.y} r={Math.max(2.5, width)} fill="#e76f51" opacity="0.75" />
            </g>
          );
        })}
      </svg>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Exact country flows use stable geo lookup coordinates. Regional, unspecified, and unmapped
        records stay out of the map to avoid false precision.
      </p>
    </section>
  );
}

function RegionalPanel({
  summary,
  onSelect
}: {
  summary: DashboardSummaryResponse;
  onSelect: (recipient: string) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Regional / Unspecified
      </h2>
      <div className="mt-3 max-h-[430px] space-y-2 overflow-auto pr-1">
        {summary.flows.regionalUnspecifiedFlows.slice(0, 20).map((flow) => (
          <button
            key={`${flow.donorCountry}-${flow.recipientLabel}-${flow.geoType}`}
            className="w-full rounded-md border border-line p-3 text-left hover:bg-panel"
            onClick={() => onSelect(flow.recipientLabel)}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-ink">{flow.recipientLabel}</p>
              <span className="rounded-full bg-panel px-2 py-1 text-xs text-slate-600">
                {flow.geoType}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{flow.donorCountry ?? "All donors"}</p>
            <p className="mt-2 text-sm font-semibold">{formatUsdMillions(flow.totalDisbursement)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProjectInspector({
  rows,
  totalRows,
  totalProjects,
  page,
  pageSize,
  loading,
  sortBy,
  sortDir,
  measure,
  viewMode,
  setPage,
  setSortBy,
  setSortDir,
  onSelectProject
}: {
  rows: ProjectRow[];
  totalRows: number;
  totalProjects: number;
  page: number;
  pageSize: number;
  loading: boolean;
  sortBy: ProjectPageQuery["sortBy"];
  sortDir: ProjectPageQuery["sortDir"];
  measure: DashboardFilters["measure"];
  viewMode: DashboardFilters["viewMode"];
  setPage: (page: number) => void;
  setSortBy: (sort: ProjectPageQuery["sortBy"]) => void;
  setSortDir: (dir: ProjectPageQuery["sortDir"]) => void;
  onSelectProject: (projectKey: string) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const selectedAmount = (row: ProjectRow) =>
    measure === "commitment" ? row.selectedScopeCommitment : row.selectedScopeDisbursement;
  const totalAmount = (row: ProjectRow) =>
    measure === "commitment" ? row.projectTotalCommitment : row.projectTotalDisbursement;
  const columns = useMemo(
    () =>
      [
        ["project_key", "Project ID"],
        ["year", "Year"],
        ["organization", "Organization"],
        ["donor", "Donor"],
        ["recipient", "Recipient"],
        ["amount", "Selected amount"],
        ["sector", "Sector"]
      ] as const,
    []
  );

  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Project Inspector
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {formatNumber(totalRows)} {viewMode === "project" ? "projects" : "raw rows"} /{" "}
            {formatNumber(totalProjects)} unique projects
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-line px-2 text-sm"
            value={sortBy}
            onChange={(event) => setSortBy(event.currentTarget.value as ProjectPageQuery["sortBy"])}
          >
            {columns.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            className="inline-flex h-9 items-center gap-1 rounded-md border border-line px-2 text-sm hover:bg-panel"
            onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          >
            <ArrowDownUp size={15} />
            {sortDir}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="border-b border-line py-2 pr-4">Project</th>
              <th className="border-b border-line py-2 pr-4">Year</th>
              <th className="border-b border-line py-2 pr-4">Organization</th>
              <th className="border-b border-line py-2 pr-4">Route</th>
              <th className="border-b border-line py-2 pr-4">Selected scope</th>
              <th className="border-b border-line py-2 pr-4">Project total</th>
              <th className="border-b border-line py-2 pr-4">Sector</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="py-8 text-center text-slate-500" colSpan={7}>
                  Loading project evidence...
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr
                  key={`${row.projectKey}-${row.rawInternalId ?? "project"}`}
                  className="cursor-pointer hover:bg-panel"
                  onClick={() => onSelectProject(row.projectKey)}
                >
                  <td className="border-b border-line py-3 pr-4">
                    <p className="font-medium text-ink">{row.projectKey}</p>
                    <p className="max-w-[280px] truncate text-xs text-slate-500">
                      {row.projectTitle ?? "Untitled project"}
                    </p>
                  </td>
                  <td className="border-b border-line py-3 pr-4">{row.year ?? "Unknown"}</td>
                  <td className="border-b border-line py-3 pr-4">{row.organizationName ?? "Unknown"}</td>
                  <td className="border-b border-line py-3 pr-4">
                    {row.donorCountry ?? "Unknown"} → {row.recipientCountry ?? "Unknown"}
                  </td>
                  <td className="border-b border-line py-3 pr-4 font-medium">
                    {formatUsdMillions(selectedAmount(row))}
                  </td>
                  <td className="border-b border-line py-3 pr-4">
                    {formatUsdMillions(totalAmount(row))}
                  </td>
                  <td className="border-b border-line py-3 pr-4">
                    {row.sectorDescription ?? "Unknown / Not reported"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          className="h-9 rounded-md border border-line px-3 text-sm disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage(Math.max(1, page - 1))}
        >
          Previous
        </button>
        <span className="text-sm text-slate-600">
          Page {page} of {formatNumber(pageCount)}
        </span>
        <button
          className="h-9 rounded-md border border-line px-3 text-sm disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function ProjectDetailDrawer({
  detail,
  loading,
  open,
  onClose
}: {
  detail?: ProjectDetailResponse;
  loading: boolean;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-ink/25" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Project Detail
            </p>
            <h2 className="mt-1 text-xl font-semibold text-ink">
              {detail?.title ?? detail?.projectKey ?? "Loading..."}
            </h2>
          </div>
          <button className="rounded-md border border-line p-2 hover:bg-panel" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {loading && <LoadingPanel label="Loading project detail" />}
        {detail && (
          <div className="space-y-4">
            {detail.warnings.map((warning) => (
              <p key={warning} className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                {warning}
              </p>
            ))}
            <p className="text-sm leading-6 text-slate-700">
              {detail.description ?? "No project description reported."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniFact label="Project ID" value={detail.projectKey} />
              <MiniFact label="Organization" value={detail.organizationName ?? "Unknown"} />
              <MiniFact
                label="Route"
                value={`${detail.donorCountry ?? "Unknown"} → ${detail.recipientCountry ?? "Unknown"}`}
              />
              <MiniFact label="Year" value={detail.year ?? "Unknown"} />
              <MiniFact
                label="Selected scope"
                value={formatUsdMillions(detail.selectedScopeDisbursement)}
              />
              <MiniFact label="Project total" value={formatUsdMillions(detail.projectTotalDisbursement)} />
            </div>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">Sector Breakdown</h3>
              <div className="space-y-2">
                {detail.sectors.map((sector) => (
                  <div key={sector.sector} className="rounded-md border border-line p-3">
                    <div className="flex justify-between gap-3">
                      <p className="font-medium">{sector.sector}</p>
                      <p>{formatUsdMillions(sector.projectTotalDisbursement)}</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      Selected scope: {formatUsdMillions(sector.selectedScopeDisbursement)} · Raw rows:{" "}
                      {sector.rawRowCount}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">Raw Rows Under This Project</h3>
              <div className="space-y-2">
                {detail.rawRows.map((row) => (
                  <div key={row.rawInternalId} className="rounded-md border border-line p-3 text-sm">
                    <p className="font-medium">
                      {row.year ?? "Unknown"} · {row.sectorDescription ?? "Unknown sector"}
                    </p>
                    <p className="text-slate-600">
                      {formatUsdMillions(row.selectedScopeDisbursement)} ·{" "}
                      {row.recipientCountry ?? "Unknown recipient"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-ink">{value}</p>
    </div>
  );
}

function DataQualityCard() {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="mb-2 flex items-center gap-2">
        <Database size={18} className="text-mint" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Data Quality
        </h2>
      </div>
      <ul className="space-y-2 text-xs leading-5 text-slate-600">
        <li>Project View groups sector rows by project key while preserving raw evidence.</li>
        <li>Selected scope amount reflects current filters; project total shows all rows for that key.</li>
        <li>Regional and unspecified recipients are separated from exact country map flows.</li>
        <li>Blank marker values mean not reported or not screened.</li>
      </ul>
    </section>
  );
}
