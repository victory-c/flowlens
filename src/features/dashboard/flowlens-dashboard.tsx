"use client";

import { formatNumber, formatUsdMillions } from "@/lib/utils";
import type {
  CauseSummaryRow,
  CountrySummaryRow,
  DashboardFilters,
  FilterOption,
  FlowSummaryRow,
  GlobeFlow,
  RawTableRow,
  YearlySummaryRow
} from "@/shared/contracts/dashboard-data";
import { useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { Filter, Loader2, RotateCcw, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { CountryFlag } from "./country-flag";
import {
  getCauseSummary,
  getCountrySummary,
  getFilterOptions,
  getFlowSummary,
  getGlobeFlows,
  getOverviewMetrics,
  getProjectDetail,
  getRawTable,
  getYearlySummary
} from "./api";
import { useDashboardFilters } from "./use-dashboard-filters";

type GlobeComponentProps = Record<string, unknown>;
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false }) as unknown as React.ComponentType<GlobeComponentProps>;

type ArcDatum = {
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  color: string;
  width: number;
  flow: GlobeFlow;
};

type GlobeControls = {
  enablePan: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  minDistance: number;
  maxDistance: number;
};

type GlobeHandle = {
  pointOfView: (position: { lat: number; lng: number; altitude: number }, ms: number) => void;
  controls: () => GlobeControls;
};

type TabKey = "overview" | "country" | "flows" | "cause" | "yearly" | "raw";

const TABS: Array<{ key: TabKey; title: string; subtitle: string }> = [
  {
    key: "overview",
    title: "Overview",
    subtitle: "Global funding magnitude, concentration, and leading corridors."
  },
  {
    key: "country",
    title: "Country Summary",
    subtitle: "Compare recipient countries with funding and project scale."
  },
  {
    key: "flows",
    title: "Donor -> Recipient Flows",
    subtitle: "Inspect bilateral donation corridors from flow aggregates."
  },
  {
    key: "cause",
    title: "Cause Analysis",
    subtitle: "See how cause markers distribute across total funding."
  },
  {
    key: "yearly",
    title: "Yearly Trends",
    subtitle: "Track how funding and project volume changes by year."
  },
  {
    key: "raw",
    title: "Raw Data Explorer",
    subtitle: "Inspect the cleaned donation rows with pagination."
  }
];

const ENTRY_ACTIONS: Array<{ key: TabKey; title: string; body: string }> = [
  {
    key: "flows",
    title: "Explore Country Flows",
    body: "Inspect donor-country to recipient-country corridors and select high-impact routes."
  },
  {
    key: "country",
    title: "Country Insights",
    body: "Compare how much countries receive, with flags and sortable rankings."
  },
  {
    key: "cause",
    title: "Cause Breakdown",
    body: "Understand overlap-aware cause marker distribution before drilling deeper."
  },
  {
    key: "yearly",
    title: "Yearly Trends",
    body: "See trend movement and isolate the 2020-2023 aggregate label safely."
  },
  {
    key: "raw",
    title: "Open Data Tables",
    body: "Search and inspect cleaned records without loading full CSV files in the browser."
  }
];

function logWidth(amount: number, max: number) {
  const safeAmount = Math.max(amount, 0.0001);
  const safeMax = Math.max(max, 0.0001);
  return 0.2 + (Math.log10(safeAmount) / Math.log10(safeMax)) * 2.2;
}

function activeFilterEntries(filters: DashboardFilters) {
  const labels: Partial<Record<keyof DashboardFilters, string>> = {
    year: "Year",
    donorCountry: "Donor Country",
    recipientCountry: "Recipient Country",
    region: "Region",
    organization: "Organization",
    cause: "Cause",
    minAmount: "Min Amount",
    q: "Search"
  };

  return Object.entries(filters)
    .filter(([key, value]) => {
      if (key === "viewMode" || key === "outlierOnly" || key === "donor" || key === "sector") return false;
      return value !== undefined && value !== null && value !== "" && value !== false;
    })
    .map(([key, value]) => ({
      key: key as keyof DashboardFilters,
      label: labels[key as keyof DashboardFilters] ?? key,
      value: String(value)
    }));
}

export function FlowLensDashboard() {
  const { filters, setFilters, clearFilter, resetFilters } = useDashboardFilters();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rawPage, setRawPage] = useState(1);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);

  useEffect(() => {
    setRawPage(1);
  }, [filters]);

  const filterOptionsQuery = useQuery({
    queryKey: ["dashboard", "filter-options", filters],
    queryFn: () => getFilterOptions(filters)
  });

  const globeQuery = useQuery({
    queryKey: ["dashboard", "globe-flows", filters],
    queryFn: () => getGlobeFlows(filters)
  });

  const metricsQuery = useQuery({
    queryKey: ["dashboard", "overview-metrics", filters],
    queryFn: () => getOverviewMetrics(filters)
  });

  const countryQuery = useQuery({
    queryKey: ["dashboard", "country-summary", filters],
    queryFn: () => getCountrySummary(filters),
    enabled: activeTab === "country" || activeTab === "overview"
  });

  const flowSummaryQuery = useQuery({
    queryKey: ["dashboard", "flow-summary", filters],
    queryFn: () => getFlowSummary(filters),
    enabled: activeTab === "flows" || activeTab === "overview"
  });

  const causeQuery = useQuery({
    queryKey: ["dashboard", "cause-summary", filters],
    queryFn: () => getCauseSummary(filters),
    enabled: activeTab === "cause" || activeTab === "overview"
  });

  const yearlyQuery = useQuery({
    queryKey: ["dashboard", "yearly-summary", filters],
    queryFn: () => getYearlySummary(filters),
    enabled: activeTab === "yearly" || activeTab === "overview"
  });

  const rawTableQuery = useQuery({
    queryKey: ["dashboard", "raw-table", filters, rawPage],
    queryFn: () => getRawTable(filters, rawPage, 25),
    enabled: activeTab === "raw"
  });

  const detailQuery = useQuery({
    queryKey: ["dashboard", "project-detail", selectedProjectKey, filters],
    queryFn: () => getProjectDetail(selectedProjectKey as string, filters),
    enabled: Boolean(selectedProjectKey)
  });

  const activeFilters = activeFilterEntries(filters);
  const flowRows = globeQuery.data?.data.rows ?? [];

  return (
    <main className="dashboard-shell min-h-screen">
      <section className="hero relative overflow-hidden px-4 pb-8 pt-8 sm:px-6 lg:px-10">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_20%_20%,rgba(24,169,255,0.24),transparent_45%),radial-gradient(circle_at_80%_5%,rgba(84,209,156,0.2),transparent_30%),radial-gradient(circle_at_50%_120%,rgba(12,31,67,0.95),rgba(6,13,30,1)_65%)]" />
        <div className="mx-auto max-w-[1440px]">
          <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
                Global Donation Flows
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300 sm:text-base">
                Explore how philanthropic funding moves from donor countries to recipient countries across
                the world. Start with geography first, then choose a focused analysis path.
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-sky-200/80">
                Drag to rotate {"->"} hover an arc for aggregated movement
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-500/60 bg-slate-900/45 px-4 text-sm text-slate-100 transition hover:border-sky-300"
                onClick={() => setFiltersOpen(true)}
                aria-label="Open flow filters"
              >
                <Filter size={16} />
                Filter Flows
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-500/60 bg-slate-900/45 px-4 text-sm text-slate-100 transition hover:border-sky-300"
                onClick={resetFilters}
              >
                <RotateCcw size={16} />
                Reset Filters
              </button>
            </div>
          </header>

          <div className="mb-3 flex flex-wrap gap-2">
            {activeFilters.length === 0 ? (
              <span className="rounded-full border border-slate-600/70 bg-slate-900/50 px-3 py-1 text-xs text-slate-300">
                No active filters
              </span>
            ) : (
              activeFilters.map((entry) => (
                <button
                  key={entry.key}
                  onClick={() => clearFilter(entry.key)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-500/70 bg-slate-900/50 px-3 py-1 text-xs text-slate-100 hover:border-sky-300"
                >
                  {entry.label}: {entry.value}
                  <X size={12} />
                </button>
              ))
            )}
          </div>

          <GlobeHero
            rows={flowRows}
            loading={globeQuery.isLoading}
            onSelectFlow={(flow) => {
              setFilters({ donorCountry: flow.donorCountry, recipientCountry: flow.recipientCountry });
              setActiveTab("flows");
            }}
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {ENTRY_ACTIONS.map((entry) => (
              <button
                key={entry.key}
                onClick={() => setActiveTab(entry.key)}
                className="rounded-2xl border border-slate-600/60 bg-slate-900/40 p-4 text-left transition hover:border-sky-300/80 hover:bg-slate-900/55"
              >
                <p className="text-sm font-semibold text-slate-100">{entry.title}</p>
                <p className="mt-2 text-xs leading-5 text-slate-300">{entry.body}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-12 sm:px-6 lg:px-10">
        <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {activeTab === "overview" && (
          <OverviewTab
            metrics={metricsQuery.data?.data}
            yearly={yearlyQuery.data?.data ?? []}
            flows={flowSummaryQuery.data?.data ?? []}
            causeRows={causeQuery.data?.data ?? []}
            loading={
              metricsQuery.isLoading || yearlyQuery.isLoading || flowSummaryQuery.isLoading || causeQuery.isLoading
            }
          />
        )}

        {activeTab === "country" && (
          <CountryTab rows={countryQuery.data?.data ?? []} loading={countryQuery.isLoading} />
        )}

        {activeTab === "flows" && (
          <FlowTab rows={flowSummaryQuery.data?.data ?? []} loading={flowSummaryQuery.isLoading} />
        )}

        {activeTab === "cause" && (
          <CauseTab rows={causeQuery.data?.data ?? []} loading={causeQuery.isLoading} />
        )}

        {activeTab === "yearly" && (
          <YearlyTab rows={yearlyQuery.data?.data ?? []} loading={yearlyQuery.isLoading} />
        )}

        {activeTab === "raw" && (
          <RawDataTab
            rows={rawTableQuery.data?.data.rows ?? []}
            loading={rawTableQuery.isLoading}
            page={rawTableQuery.data?.data.page ?? rawPage}
            pageSize={rawTableQuery.data?.data.pageSize ?? 25}
            totalRows={rawTableQuery.data?.data.totalRows ?? 0}
            onNext={() => setRawPage((page) => page + 1)}
            onPrev={() => setRawPage((page) => Math.max(1, page - 1))}
            onSelectProject={setSelectedProjectKey}
          />
        )}
      </section>

      <ProjectDetailDrawer
        open={Boolean(selectedProjectKey)}
        onClose={() => setSelectedProjectKey(null)}
        loading={detailQuery.isLoading}
        detail={detailQuery.data?.data}
      />

      <FilterDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        options={filterOptionsQuery.data?.data}
      />
    </main>
  );
}

function TabBar({
  activeTab,
  setActiveTab
}: {
  activeTab: TabKey;
  setActiveTab: (key: TabKey) => void;
}) {
  return (
    <div className="mb-6 rounded-2xl border border-slate-700/70 bg-slate-950/70 p-2" role="tablist" aria-label="Analytics sections">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`panel-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-xl px-3 py-3 text-left transition ${
              activeTab === tab.key
                ? "bg-sky-500/20 text-sky-100 ring-1 ring-sky-300/60"
                : "bg-slate-900/50 text-slate-300 hover:bg-slate-900/80"
            }`}
          >
            <p className="text-sm font-semibold">{tab.title}</p>
            <p className="mt-1 text-xs leading-5 opacity-90">{tab.subtitle}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function GlobeHero({
  rows,
  loading,
  onSelectFlow
}: {
  rows: GlobeFlow[];
  loading: boolean;
  onSelectFlow: (flow: GlobeFlow) => void;
}) {
  const globeRef = useRef<GlobeHandle | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const [hoveredFlow, setHoveredFlow] = useState<GlobeFlow | null>(null);

  const maxAmount = useMemo(
    () => rows.reduce((acc, row) => Math.max(acc, row.totalFunding), 0),
    [rows]
  );

  const arcs = useMemo(
    () =>
      rows.map((row) => ({
        startLat: row.donorLat,
        startLng: row.donorLng,
        endLat: row.recipientLat,
        endLng: row.recipientLng,
        color: row.region.toLowerCase().includes("africa")
          ? "#18d0ff"
          : row.region.toLowerCase().includes("asia")
            ? "#86efac"
            : row.region.toLowerCase().includes("europe")
              ? "#fde047"
              : "#fda4af",
        width: logWidth(row.totalFunding, maxAmount || 1),
        flow: row
      })),
    [maxAmount, rows]
  );

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe.pointOfView({ lat: 18, lng: 20, altitude: 1.8 }, 0);
    const controls = globe.controls();
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.minDistance = 220;
    controls.maxDistance = 420;

    return () => {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const pauseRotation = () => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.controls().autoRotate = false;
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
  };

  const resumeRotation = () => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      const globe = globeRef.current;
      if (!globe) return;
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.35;
    }, 3500);
  };

  const topFlows = rows.slice(0, 8);

  return (
    <div className="rounded-3xl border border-slate-700/70 bg-slate-950/45 p-4 backdrop-blur sm:p-6">
      {loading ? (
        <div className="flex h-[62vh] min-h-[420px] items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/70 text-sm text-slate-300">
          <Loader2 className="mr-2 animate-spin" size={16} />
          Loading aggregated globe flows...
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-[62vh] min-h-[420px] items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-center text-sm text-slate-300">
          No exact-country arcs match these filters. Clear filters or lower the minimum amount.
        </div>
      ) : (
        <div className="relative">
          <div className="h-[62vh] min-h-[420px] overflow-hidden rounded-2xl border border-slate-700/80 bg-[#030817]">
            <Globe
              ref={globeRef}
              width={1200}
              height={760}
              backgroundColor="rgba(0,0,0,0)"
              globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
              bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
              arcsData={arcs}
              arcStartLat={(d: ArcDatum) => d.startLat}
              arcStartLng={(d: ArcDatum) => d.startLng}
              arcEndLat={(d: ArcDatum) => d.endLat}
              arcEndLng={(d: ArcDatum) => d.endLng}
              arcColor={(d: ArcDatum) => [d.color, d.color]}
              arcAltitude={(d: ArcDatum) => 0.18 + d.width * 0.02}
              arcStroke={(d: ArcDatum) => d.width}
              arcDashLength={0.78}
              arcDashGap={0.6}
              arcDashInitialGap={() => Math.random()}
              arcDashAnimateTime={1600}
              atmosphereColor="#7dd3fc"
              atmosphereAltitude={0.18}
              onArcHover={(arc: ArcDatum | null) => {
                const next = arc?.flow ?? null;
                setHoveredFlow(next);
                if (next) pauseRotation();
                else resumeRotation();
              }}
            />
          </div>

          {hoveredFlow && (
            <aside className="pointer-events-auto absolute right-3 top-3 w-[320px] rounded-xl border border-slate-600/80 bg-slate-950/90 p-4 text-sm text-slate-100 shadow-2xl backdrop-blur">
              <p className="text-xs uppercase tracking-[0.14em] text-sky-200">Selected corridor</p>
              <p className="mt-2 text-base font-semibold">
                <CountryFlag iso2={hoveredFlow.donorIso2} country={hoveredFlow.donorCountry} className="mr-2" />
                {hoveredFlow.donorCountry}
                <span className="mx-2 text-slate-400">{"->"}</span>
                <CountryFlag
                  iso2={hoveredFlow.recipientIso2}
                  country={hoveredFlow.recipientCountry}
                  className="mr-2"
                />
                {hoveredFlow.recipientCountry}
              </p>
              <p className="mt-3 text-slate-200">Total Donation: {formatUsdMillions(hoveredFlow.totalFunding)}</p>
              <p className="mt-1 text-slate-300">Unique Projects: {formatNumber(hoveredFlow.uniqueProjects)}</p>
              <p className="mt-1 text-slate-300">Year: {hoveredFlow.yearLabel}</p>
              <button
                className="mt-4 rounded-full border border-sky-300/70 px-3 py-1 text-xs text-sky-100 hover:bg-sky-500/20"
                onClick={() => onSelectFlow(hoveredFlow)}
              >
                View Details
              </button>
            </aside>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {topFlows.map((flow) => (
              <button
                key={`${flow.donorCountry}-${flow.recipientCountry}-${flow.yearLabel}`}
                onClick={() => onSelectFlow(flow)}
                className="rounded-xl border border-slate-700/70 bg-slate-950/60 p-3 text-left hover:border-sky-300/70"
              >
                <p className="text-xs text-slate-400">Top corridor</p>
                <p className="mt-1 text-sm font-medium text-slate-100">
                  <CountryFlag iso2={flow.donorIso2} country={flow.donorCountry} className="mr-1" />
                  {flow.donorCountry}
                  <span className="mx-1 text-slate-500">{"->"}</span>
                  <CountryFlag iso2={flow.recipientIso2} country={flow.recipientCountry} className="mr-1" />
                  {flow.recipientCountry}
                </p>
                <p className="mt-1 text-xs text-slate-300">{formatUsdMillions(flow.totalFunding, false)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({
  metrics,
  yearly,
  flows,
  causeRows,
  loading
}: {
  metrics?: {
    totalFunding: number;
    validFinancialRows: number;
    uniqueProjects: number;
    organizations: number;
    donorCountries: number;
    recipientCountries: number;
    regions: number;
  };
  yearly: YearlySummaryRow[];
  flows: FlowSummaryRow[];
  causeRows: CauseSummaryRow[];
  loading: boolean;
}) {
  if (loading) {
    return <LoadingPanel label="Loading overview analytics" id="panel-overview" />;
  }

  const yearlyOption = {
    grid: { top: 20, right: 16, bottom: 28, left: 56 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: yearly.map((row) => row.yearLabel)
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    series: [
      {
        name: "Funding",
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { color: "#38bdf8", width: 3 },
        itemStyle: { color: "#38bdf8" },
        areaStyle: { color: "rgba(56,189,248,0.15)" },
        data: yearly.map((row) => row.totalFunding)
      }
    ]
  };

  const causeTotals = new Map<string, number>();
  for (const row of causeRows) causeTotals.set(row.cause, (causeTotals.get(row.cause) ?? 0) + row.totalFunding);

  return (
    <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-200">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6 text-slate-300">
          This view summarizes global funding volume, leading donation corridors, and distribution balance
          before deeper drilldown.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total funding" value={formatUsdMillions(metrics?.totalFunding)} />
        <MetricCard label="Unique projects" value={formatNumber(metrics?.uniqueProjects)} />
        <MetricCard label="Donor countries" value={formatNumber(metrics?.donorCountries)} />
        <MetricCard label="Recipient countries" value={formatNumber(metrics?.recipientCountries)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-100">Yearly trend</p>
          <ReactECharts option={yearlyOption} style={{ height: 280 }} />
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-100">Leading corridors</p>
          <div className="space-y-2">
            {flows.slice(0, 8).map((row) => (
              <div key={`${row.donorCountry}-${row.recipientCountry}`} className="rounded-lg border border-slate-700/60 p-3">
                <p className="text-sm text-slate-100">
                  <CountryFlag iso2={row.donorIso2} country={row.donorCountry} className="mr-1" />
                  {row.donorCountry}
                  <span className="mx-1 text-slate-500">{"->"}</span>
                  <CountryFlag iso2={row.recipientIso2} country={row.recipientCountry} className="mr-1" />
                  {row.recipientCountry}
                </p>
                <p className="mt-1 text-xs text-slate-300">{formatUsdMillions(row.totalFunding, false)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <p className="text-sm font-semibold text-slate-100">Cause mix snapshot</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from(causeTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([cause, total]) => (
              <div key={cause} className="rounded-lg border border-slate-700/60 p-3">
                <p className="text-sm text-slate-200">{cause}</p>
                <p className="mt-1 text-xs text-slate-300">{formatUsdMillions(total, false)}</p>
              </div>
            ))}
        </div>
      </section>
    </section>
  );
}

function CountryTab({ rows, loading }: { rows: CountrySummaryRow[]; loading: boolean }) {
  if (loading) return <LoadingPanel label="Loading country summary" id="panel-country" />;

  return (
    <section id="panel-country" role="tabpanel" aria-labelledby="tab-country" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Compare how much each recipient country receives across the active filter scope.
        </p>
      </section>
      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Funding</th>
              <th className="px-4 py-3">Projects</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.country} className="border-t border-slate-800/80 text-slate-200">
                <td className="px-4 py-3">
                  <CountryFlag iso2={row.iso2} country={row.country} className="mr-2" />
                  {row.country}
                </td>
                <td className="px-4 py-3">{row.region}</td>
                <td className="px-4 py-3">{formatUsdMillions(row.totalFunding, false)}</td>
                <td className="px-4 py-3">{formatNumber(row.uniqueProjects)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FlowTab({ rows, loading }: { rows: FlowSummaryRow[]; loading: boolean }) {
  if (loading) return <LoadingPanel label="Loading flow corridors" id="panel-flows" />;

  return (
    <section id="panel-flows" role="tabpanel" aria-labelledby="tab-flows" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Bilateral donor-country to recipient-country aggregates sorted by total donation amount.
        </p>
      </section>
      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Corridor</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Funding</th>
              <th className="px-4 py-3">Projects</th>
              <th className="px-4 py-3">Years</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.donorCountry}-${row.recipientCountry}`} className="border-t border-slate-800/80 text-slate-200">
                <td className="px-4 py-3">
                  <CountryFlag iso2={row.donorIso2} country={row.donorCountry} className="mr-1" />
                  {row.donorCountry}
                  <span className="mx-1 text-slate-500">{"->"}</span>
                  <CountryFlag iso2={row.recipientIso2} country={row.recipientCountry} className="mr-1" />
                  {row.recipientCountry}
                </td>
                <td className="px-4 py-3">{row.region}</td>
                <td className="px-4 py-3">{formatUsdMillions(row.totalFunding, false)}</td>
                <td className="px-4 py-3">{formatNumber(row.uniqueProjects)}</td>
                <td className="px-4 py-3 text-xs text-slate-300">{row.yearLabels.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CauseTab({ rows, loading }: { rows: CauseSummaryRow[]; loading: boolean }) {
  if (loading) return <LoadingPanel label="Loading cause analysis" id="panel-cause" />;

  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.cause, (totals.get(row.cause) ?? 0) + row.totalFunding);
  const chartRows = Array.from(totals.entries()).map(([label, value]) => ({ label, value }));

  const option = {
    grid: { top: 20, right: 20, bottom: 20, left: 130 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    yAxis: {
      type: "category",
      data: chartRows.map((item) => item.label).reverse()
    },
    series: [
      {
        type: "bar",
        data: chartRows.map((item) => item.value).reverse(),
        itemStyle: { color: "#22d3ee", borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  return (
    <section id="panel-cause" role="tabpanel" aria-labelledby="tab-cause" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Cause marker funding distribution for selected filters. Cause categories can overlap.
        </p>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <ReactECharts option={option} style={{ height: 320 }} />
      </section>
      <p className="rounded-xl border border-amber-700/60 bg-amber-950/40 p-3 text-xs text-amber-200">
        Note: Cause categories may overlap because a single donation can carry multiple markers.
      </p>
    </section>
  );
}

function YearlyTab({ rows, loading }: { rows: YearlySummaryRow[]; loading: boolean }) {
  if (loading) return <LoadingPanel label="Loading yearly trend" id="panel-yearly" />;

  const option = {
    grid: { top: 20, right: 16, bottom: 28, left: 56 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.yearLabel)
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbolSize: 8,
        lineStyle: { color: "#22d3ee", width: 3 },
        itemStyle: { color: "#22d3ee" },
        areaStyle: { color: "rgba(34,211,238,0.15)" },
        data: rows.map((row) => row.totalFunding)
      }
    ]
  };

  return (
    <section id="panel-yearly" role="tabpanel" aria-labelledby="tab-yearly" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Time-based funding and project trend. The 2020-2023 label is treated as an aggregate bucket.
        </p>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <ReactECharts option={option} style={{ height: 320 }} />
      </section>
      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Funding</th>
              <th className="px-4 py-3">Projects</th>
              <th className="px-4 py-3">Type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.yearLabel} className="border-t border-slate-800/80 text-slate-200">
                <td className="px-4 py-3">{row.yearLabel}</td>
                <td className="px-4 py-3">{formatUsdMillions(row.totalFunding, false)}</td>
                <td className="px-4 py-3">{formatNumber(row.uniqueProjects)}</td>
                <td className="px-4 py-3">{row.isAggregate ? "Aggregate" : "Annual"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RawDataTab({
  rows,
  loading,
  page,
  pageSize,
  totalRows,
  onNext,
  onPrev,
  onSelectProject
}: {
  rows: RawTableRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  onNext: () => void;
  onPrev: () => void;
  onSelectProject: (projectKey: string) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <section id="panel-raw" role="tabpanel" aria-labelledby="tab-raw" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Page through cleaned donation records. Select a row to open project detail context.
        </p>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-300" colSpan={5}>
                  <Loader2 className="mr-2 inline animate-spin" size={14} />
                  Loading rows...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-300" colSpan={5}>
                  No records matched these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={`${row.id}-${row.projectKey}`}
                  className="cursor-pointer border-t border-slate-800/80 text-slate-200 hover:bg-slate-900/50"
                  onClick={() => onSelectProject(row.projectKey)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.projectKey}</p>
                    <p className="text-xs text-slate-400">{row.projectTitle ?? "Untitled project"}</p>
                  </td>
                  <td className="px-4 py-3">{row.yearLabel}</td>
                  <td className="px-4 py-3">{row.organization}</td>
                  <td className="px-4 py-3">{row.recipientCountry}</td>
                  <td className="px-4 py-3">{formatUsdMillions(row.amountUsd, false)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">
        <button
          className="rounded-full border border-slate-600 px-3 py-1 disabled:opacity-40"
          onClick={onPrev}
          disabled={page <= 1}
        >
          Previous
        </button>
        <p>
          Page {page} of {formatNumber(totalPages)} {"->"} {formatNumber(totalRows)} rows
        </p>
        <button
          className="rounded-full border border-slate-600 px-3 py-1 disabled:opacity-40"
          onClick={onNext}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-100">{value}</p>
    </section>
  );
}

function LoadingPanel({ label, id }: { label: string; id: string }) {
  return (
    <section
      id={id}
      role="tabpanel"
      className="rounded-2xl border border-slate-700 bg-slate-950/70 p-8 text-center text-sm text-slate-300"
    >
      <Loader2 className="mr-2 inline animate-spin" size={16} />
      {label}
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value?: string;
  options?: FilterOption[];
  onChange: (next: string | undefined) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
        value={value ?? ""}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      >
        <option value="">All</option>
        {(options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.count !== undefined ? ` (${formatNumber(option.count)})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterDrawer({
  open,
  onClose,
  filters,
  setFilters,
  options
}: {
  open: boolean;
  onClose: () => void;
  filters: DashboardFilters;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  options?: {
    years: FilterOption[];
    donorCountries: FilterOption[];
    organizations: FilterOption[];
    regions: FilterOption[];
    recipientCountries: FilterOption[];
    sectors: FilterOption[];
    causes: FilterOption[];
  };
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-slate-950 p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Filter Flows</h2>
          <button className="rounded-md border border-slate-700 p-1 text-slate-300" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <SelectField
            label="Year"
            value={filters.year}
            options={options?.years}
            onChange={(year) => setFilters({ year })}
          />
          <SelectField
            label="Donor Country"
            value={filters.donorCountry}
            options={options?.donorCountries}
            onChange={(donorCountry) => setFilters({ donorCountry })}
          />
          <SelectField
            label="Recipient Country"
            value={filters.recipientCountry}
            options={options?.recipientCountries}
            onChange={(recipientCountry) => setFilters({ recipientCountry })}
          />
          <SelectField
            label="Organization"
            value={filters.organization}
            options={options?.organizations}
            onChange={(organization) => setFilters({ organization })}
          />
          <SelectField
            label="Region"
            value={filters.region}
            options={options?.regions}
            onChange={(region) => setFilters({ region })}
          />
          <SelectField
            label="Cause"
            value={filters.cause}
            options={options?.causes}
            onChange={(cause) => setFilters({ cause: cause as DashboardFilters["cause"] })}
          />

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Minimum Donation (USD millions)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={filters.minAmount ?? ""}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (!value) setFilters({ minAmount: undefined });
                else setFilters({ minAmount: Number(value) });
              }}
              className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Search</span>
            <div className="flex h-10 items-center rounded-md border border-slate-700 bg-slate-900 px-2">
              <Search size={14} className="text-slate-400" />
              <input
                className="h-full flex-1 border-0 bg-transparent px-2 text-sm text-slate-200 outline-none"
                placeholder="Project title, organization"
                defaultValue={filters.q ?? ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  window.clearTimeout(Number(event.currentTarget.dataset.timer));
                  const timer = window.setTimeout(() => setFilters({ q: value || undefined }), 400);
                  event.currentTarget.dataset.timer = String(timer);
                }}
              />
            </div>
          </label>
        </div>
      </aside>
    </div>
  );
}

function ProjectDetailDrawer({
  open,
  onClose,
  loading,
  detail
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  detail?: {
    projectKey: string;
    title: string | null;
    projectId: string | null;
    organization: string;
    recipientCountry: string;
    region: string;
    years: string[];
    totalFunding: number;
    selectedScopeFunding: number;
    sectorBreakdown: Array<{ sectorName: string; totalFunding: number }>;
    rawRows: RawTableRow[];
    warnings: Array<{ code: string; message: string }>;
  };
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/55" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-700 bg-slate-950 p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-100">Project Detail</h2>
          <button className="rounded-md border border-slate-700 p-1 text-slate-300" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="text-sm text-slate-300">
            <Loader2 className="mr-2 inline animate-spin" size={16} />
            Loading project detail...
          </div>
        )}

        {detail && (
          <div className="space-y-4 text-sm text-slate-300">
            <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">Project</p>
              <p className="mt-1 text-lg font-semibold text-slate-100">{detail.title ?? detail.projectKey}</p>
              <p className="mt-2">Organization: {detail.organization}</p>
              <p>Recipient: {detail.recipientCountry}</p>
              <p>Region: {detail.region}</p>
              <p>Years: {detail.years.join(", ")}</p>
              <p className="mt-2">Selected scope: {formatUsdMillions(detail.selectedScopeFunding, false)}</p>
              <p>Total project funding: {formatUsdMillions(detail.totalFunding, false)}</p>
            </section>

            {detail.warnings.map((warning) => (
              <p key={warning.code} className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-200">
                {warning.message}
              </p>
            ))}

            <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <p className="font-semibold text-slate-100">Sector Breakdown</p>
              <div className="mt-2 space-y-2">
                {detail.sectorBreakdown.map((sector) => (
                  <div key={sector.sectorName} className="rounded-lg border border-slate-700/70 p-2">
                    <p>{sector.sectorName}</p>
                    <p className="text-xs text-slate-400">{formatUsdMillions(sector.totalFunding, false)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <p className="font-semibold text-slate-100">Underlying Rows</p>
              <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                {detail.rawRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-slate-700/70 p-2">
                    <p>
                      {row.yearLabel} {"->"} {row.sectorName}
                    </p>
                    <p className="text-xs text-slate-400">
                      {row.organization} {"->"} {formatUsdMillions(row.amountUsd, false)}
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
