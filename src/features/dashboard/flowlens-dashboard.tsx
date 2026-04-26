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
import { ChevronDown, Filter, Loader2, RotateCcw, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type CountryAnnotation = {
  key: string;
  country: string;
  lat: number;
  lng: number;
  weight: number;
};

type ContinentPolygonFeature = {
  type: "Feature";
  properties?: {
    NAME?: string;
    CONTINENT?: string;
    [key: string]: unknown;
  };
  geometry?: {
    type: string;
    coordinates: unknown;
  };
};

type ContinentPolygonCollection = {
  type: "FeatureCollection";
  features?: ContinentPolygonFeature[];
};

type GlobeZoomPointOfView = {
  lat: number;
  lng: number;
  altitude: number;
};

type GlobeControls = {
  enablePan: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  minDistance: number;
  maxDistance: number;
};

type ArcMaterialLike = {
  transparent?: boolean;
  depthWrite?: boolean;
  depthTest?: boolean;
};

type ArcObjectLike = {
  __globeObjType?: string;
  material?: ArcMaterialLike | ArcMaterialLike[];
  frustumCulled?: boolean;
  traverse?: (callback: (obj: ArcObjectLike) => void) => void;
  onBeforeRender?: (...args: unknown[]) => void;
};

type GlobeRendererLike = {
  getContext?: () => unknown;
};

type GlobeHandle = {
  pointOfView: (position: { lat: number; lng: number; altitude: number }, ms: number) => void;
  controls: () => GlobeControls;
  scene: () => ArcObjectLike;
  renderer: () => GlobeRendererLike;
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

const CONTINENT_COLOR: Record<string, string> = {
  Africa: "#f4b183",
  Europe: "#89b4ff",
  Asia: "#baa1ff",
  "North America": "#8edaa8",
  "South America": "#f5cd83",
  Oceania: "#7fd4ff",
  Antarctica: "#d4d4d8"
};

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const chunk = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : normalized.slice(0, 6);
  const red = Number.parseInt(chunk.slice(0, 2), 16);
  const green = Number.parseInt(chunk.slice(2, 4), 16);
  const blue = Number.parseInt(chunk.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function logWidth(amount: number, max: number) {
  const safeAmount = Math.max(amount, 0.0001);
  const safeMax = Math.max(max, 0.0001);
  return 0.2 + (Math.log10(safeAmount) / Math.log10(safeMax)) * 2.2;
}

function formatYearLabels(yearLabels: string[]) {
  if (!yearLabels.length) return "No year labels";
  return yearLabels.join(", ");
}

function isFiniteCoordinate(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function materialList(material: ArcObjectLike["material"]) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function applyArcObjectStability(root: ArcObjectLike) {
  const applyNode = (node: ArcObjectLike) => {
    node.frustumCulled = false;
    for (const material of materialList(node.material)) {
      material.transparent = true;
      material.depthWrite = false;
      material.depthTest = true;
    }
  };

  applyNode(root);
  if (!root.traverse) return 1;

  let count = 0;
  root.traverse((node) => {
    applyNode(node);
    count += 1;
  });
  return count;
}

function stabilizeArcScene(scene: ArcObjectLike) {
  if (!scene.traverse) return 0;

  let touched = 0;
  scene.traverse((node) => {
    if (node.__globeObjType !== "arc") return;
    touched += applyArcObjectStability(node);
  });
  return touched;
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
  const [analyticsActivated, setAnalyticsActivated] = useState(false);
  const analyticsSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setRawPage(1);
  }, [filters]);

  useEffect(() => {
    if (analyticsActivated) return;
    const section = analyticsSectionRef.current;
    if (!section) return;
    if (typeof IntersectionObserver === "undefined") {
      setAnalyticsActivated(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setAnalyticsActivated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.18 }
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, [analyticsActivated]);

  const scrollToAnalytics = useCallback(() => {
    setAnalyticsActivated(true);
    const section = analyticsSectionRef.current;
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleFlowSelect = useCallback(
    (flow: GlobeFlow) => {
      setFilters({ donorCountry: flow.donorCountry, recipientCountry: flow.recipientCountry });
      setActiveTab("flows");
      scrollToAnalytics();
    },
    [scrollToAnalytics, setFilters]
  );

  const filterOptionsQuery = useQuery({
    queryKey: ["dashboard", "filter-options", filters],
    queryFn: () => getFilterOptions(filters),
    enabled: analyticsActivated
  });

  const globeQuery = useQuery({
    queryKey: ["dashboard", "globe-flows", filters],
    queryFn: () => getGlobeFlows(filters)
  });

  const metricsQuery = useQuery({
    queryKey: ["dashboard", "overview-metrics", filters],
    queryFn: () => getOverviewMetrics(filters),
    enabled: analyticsActivated
  });

  const countryQuery = useQuery({
    queryKey: ["dashboard", "country-summary", filters],
    queryFn: () => getCountrySummary(filters),
    enabled: analyticsActivated && (activeTab === "country" || activeTab === "overview")
  });

  const flowSummaryQuery = useQuery({
    queryKey: ["dashboard", "flow-summary", filters],
    queryFn: () => getFlowSummary(filters),
    enabled: analyticsActivated && (activeTab === "flows" || activeTab === "overview")
  });

  const causeQuery = useQuery({
    queryKey: ["dashboard", "cause-summary", filters],
    queryFn: () => getCauseSummary(filters),
    enabled: analyticsActivated && (activeTab === "cause" || activeTab === "overview")
  });

  const yearlyQuery = useQuery({
    queryKey: ["dashboard", "yearly-summary", filters],
    queryFn: () => getYearlySummary(filters),
    enabled: analyticsActivated && (activeTab === "yearly" || activeTab === "overview")
  });

  const rawTableQuery = useQuery({
    queryKey: ["dashboard", "raw-table", filters, rawPage],
    queryFn: () => getRawTable(filters, rawPage, 25),
    enabled: analyticsActivated && activeTab === "raw"
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
      <section className="hero relative h-[100svh] overflow-hidden bg-[#01040a]">
        <div className="absolute inset-0 -z-20 bg-[#01040a]" />

        <div className="absolute inset-0 z-0">
          <GlobeHero rows={flowRows} loading={globeQuery.isLoading} onSelectFlow={handleFlowSelect} fullScreen />
        </div>

        <header className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-6 pb-4 pt-6 sm:px-8 lg:px-10">
          <div className="max-w-3xl rounded-xl border border-slate-500/25 bg-slate-950/30 p-3 backdrop-blur-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              Global Donation Flows
            </h1>
            <p className="mt-2 text-sm text-slate-300 sm:text-base">
              Drag to rotate the globe. Hover corridors for flow snapshots.
            </p>
          </div>
        </header>

        <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-20 flex justify-center px-6 sm:px-8 lg:px-10">
          <button
            type="button"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-slate-500/70 bg-slate-900/55 px-4 py-2 text-sm text-slate-100 transition hover:border-sky-300/90 hover:text-sky-100"
            onClick={scrollToAnalytics}
          >
            Scroll for analytics
            <ChevronDown size={16} />
          </button>
        </div>
      </section>

      <section
        ref={analyticsSectionRef}
        id="analytics-section"
        className="mx-auto max-w-[1440px] px-4 pb-12 pt-8 sm:px-6 lg:px-10"
      >
        {!analyticsActivated ? (
          <div className="flex min-h-[48vh] items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/60 text-sm text-slate-300">
            Scroll into this section to reveal filters, tabs, and deeper analytics.
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Deeper Analysis</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Apply filters, choose an analysis path, and drill into corridor-level evidence.
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
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
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

            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          </>
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
  onSelectFlow,
  fullScreen = false
}: {
  rows: GlobeFlow[];
  loading: boolean;
  onSelectFlow: (flow: GlobeFlow) => void;
  fullScreen?: boolean;
}) {
  const globeRef = useRef<GlobeHandle | null>(null);
  const globeWrapRef = useRef<HTMLDivElement | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const needsArcStabilizeRef = useRef(false);
  const stabilizeFramesRemainingRef = useRef(0);
  const previousSceneBeforeRenderRef = useRef<((...args: unknown[]) => void) | null>(null);
  const hookedSceneRef = useRef<ArcObjectLike | null>(null);
  const [activeFlow, setActiveFlow] = useState<GlobeFlow | null>(null);
  const [globeSize, setGlobeSize] = useState({ width: 1200, height: 760 });
  const [zoomAltitude, setZoomAltitude] = useState(1.8);
  const [continentPolygons, setContinentPolygons] = useState<ContinentPolygonFeature[]>([]);

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

  const countryAnnotations = useMemo<CountryAnnotation[]>(() => {
    const totals = new Map<
      string,
      {
        country: string;
        lat: number;
        lng: number;
        amount: number;
      }
    >();

    const accumulate = (
      key: string | null,
      country: string,
      lat: number | null,
      lng: number | null,
      amount: number
    ) => {
      if (!key || !isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) return;
      const existing = totals.get(key);
      if (existing) {
        existing.amount += amount;
        return;
      }
      totals.set(key, { country, lat, lng, amount });
    };

    for (const row of rows) {
      accumulate(row.donorIso3 ?? row.donorCountry, row.donorCountry, row.donorLat, row.donorLng, row.totalFunding);
      accumulate(
        row.recipientIso3 ?? row.recipientCountry,
        row.recipientCountry,
        row.recipientLat,
        row.recipientLng,
        row.totalFunding
      );
    }

    const widthLimit = globeSize.width < 640 ? 8 : globeSize.width < 1100 ? 12 : 16;
    const zoomLimit =
      zoomAltitude <= 0.85
        ? 120
        : zoomAltitude <= 1.1
          ? 88
          : zoomAltitude <= 1.35
            ? 64
            : zoomAltitude <= 1.65
              ? 40
              : zoomAltitude <= 1.95
                ? 24
                : 16;
    const labelLimit = Math.max(widthLimit, zoomLimit);
    const sorted = Array.from(totals.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, labelLimit);
    const topAmount = sorted[0]?.[1].amount ?? 1;

    return sorted.map(([key, item]) => {
      const weight = Math.max(0.2, Math.min(1, item.amount / topAmount));
      return {
        key,
        country: item.country,
        lat: item.lat,
        lng: item.lng,
        weight
      };
    });
  }, [globeSize.width, rows, zoomAltitude]);

  useEffect(() => {
    const element = globeWrapRef.current;
    if (!element) return;

    const updateSize = () => {
      const width = Math.max(320, Math.floor(element.clientWidth));
      const height = Math.max(420, Math.floor(element.clientHeight));
      setGlobeSize((previous) => {
        if (previous.width === width && previous.height === height) return previous;
        return { width, height };
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/geo/ne_110m_admin_0_countries.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load continent polygons.");
        return response.json() as Promise<ContinentPolygonCollection>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const usable = (Array.isArray(payload.features) ? payload.features : []).filter((feature) => {
          const continent = feature.properties?.CONTINENT ?? "";
          return Boolean(CONTINENT_COLOR[continent]);
        });
        setContinentPolygons(usable);
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  useEffect(() => {
    needsArcStabilizeRef.current = true;
    stabilizeFramesRemainingRef.current = 12;
  }, [rows]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe.pointOfView({ lat: 18, lng: 20, altitude: fullScreen ? 0.62 : 1.8 }, 0);
    const controls = globe.controls();
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;
    controls.minDistance = fullScreen ? 75 : 145;
    controls.maxDistance = fullScreen ? 360 : 420;

    return () => {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
      const hookedScene = hookedSceneRef.current;
      if (hookedScene) {
        hookedScene.onBeforeRender = previousSceneBeforeRenderRef.current ?? undefined;
        hookedSceneRef.current = null;
      }
    };
  }, [fullScreen]);

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
      globe.controls().autoRotateSpeed = 0.2;
    }, 4200);
  };

  return (
    <div
      className={
        fullScreen
          ? "h-full w-full bg-[#01040a]"
          : "rounded-3xl border border-slate-700/70 bg-slate-950/45 p-4 backdrop-blur sm:p-6"
      }
    >
      {loading ? (
        <div
          className={`flex items-center justify-center text-sm text-slate-300 ${
            fullScreen
              ? "h-full min-h-[100svh] bg-[#01040a]"
              : "h-[62vh] min-h-[420px] rounded-2xl border border-slate-700 bg-slate-900/70"
          }`}
        >
          <Loader2 className="mr-2 animate-spin" size={16} />
          Loading aggregated globe flows...
        </div>
      ) : rows.length === 0 ? (
        <div
          className={`flex items-center justify-center p-6 text-center text-sm text-slate-300 ${
            fullScreen
              ? "h-full min-h-[100svh] bg-[#01040a]"
              : "h-[62vh] min-h-[420px] rounded-2xl border border-slate-700 bg-slate-900/70"
          }`}
        >
          No exact-country arcs match these filters. Clear filters or lower the minimum amount.
        </div>
      ) : (
        <div className="relative">
          <div
            ref={globeWrapRef}
            className={`flex items-center justify-center overflow-hidden ${
              fullScreen
                ? "h-[100svh] w-full bg-[#01040a]"
                : "h-[62vh] min-h-[420px] rounded-2xl border border-slate-700/80 bg-[#030817]"
            }`}
          >
            <Globe
              ref={globeRef}
              width={globeSize.width}
              height={globeSize.height}
              rendererConfig={{ antialias: true, alpha: true }}
              lineHoverPrecision={0.18}
              backgroundColor="rgba(0,0,0,0)"
              backgroundImageUrl="https://unpkg.com/three-globe/example/img/night-sky.png"
              globeImageUrl="https://unpkg.com/three-globe/example/img/earth-water.png"
              globeTileEngineUrl={(x: number, y: number, l: number) => {
                const subdomain = ["a", "b", "c", "d"][(x + y) % 4];
                return `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager/${l}/${x}/${y}@2x.png`;
              }}
              polygonsData={continentPolygons}
              polygonLabel={(d: ContinentPolygonFeature) => d.properties?.NAME ?? ""}
              polygonAltitude={0.0004}
              polygonCapCurvatureResolution={1}
              polygonCapColor={(d: ContinentPolygonFeature) => {
                const continent = d.properties?.CONTINENT ?? "";
                const base = CONTINENT_COLOR[continent] ?? "#cbd5e1";
                const alpha = zoomAltitude > 1.6 ? 0.22 : zoomAltitude > 1.1 ? 0.18 : 0.14;
                return hexToRgba(base, alpha);
              }}
              polygonSideColor={() => "rgba(0,0,0,0)"}
              polygonStrokeColor={() => "rgba(15,23,42,0.16)"}
              polygonsTransitionDuration={0}
              arcsData={arcs}
              arcStartLat={(d: ArcDatum) => d.startLat}
              arcStartLng={(d: ArcDatum) => d.startLng}
              arcStartAltitude={0.004}
              arcEndLat={(d: ArcDatum) => d.endLat}
              arcEndLng={(d: ArcDatum) => d.endLng}
              arcEndAltitude={0.004}
              arcColor={(d: ArcDatum) => [d.color, d.color]}
              arcAltitude={null}
              arcAltitudeAutoScale={0.78}
              arcStroke={(d: ArcDatum) => d.width}
              arcsTransitionDuration={0}
              htmlElementsData={countryAnnotations}
              htmlLat={(d: CountryAnnotation) => d.lat}
              htmlLng={(d: CountryAnnotation) => d.lng}
              htmlAltitude={(d: CountryAnnotation) => 0.012 + d.weight * 0.012}
              htmlElement={(d: CountryAnnotation) => {
                const node = document.createElement("div");
                node.className = "globe-country-annotation";
                node.textContent = d.country;
                node.style.pointerEvents = "none";
                node.style.userSelect = "none";
                node.style.whiteSpace = "nowrap";
                node.style.fontSize = `${11 + Math.round(d.weight * 3)}px`;
                node.style.fontWeight = "700";
                node.style.letterSpacing = "0.02em";
                node.style.color = "#e2e8f0";
                node.style.textShadow = "0 0 8px rgba(2, 6, 23, 0.9), 0 0 18px rgba(14, 165, 233, 0.5)";
                node.style.transform = "translate(-50%, -50%)";
                node.style.opacity = "0.95";
                return node;
              }}
              htmlTransitionDuration={0}
              atmosphereColor="#dbeafe"
              atmosphereAltitude={fullScreen ? 0.08 : 0.06}
              onZoom={(pointOfView: GlobeZoomPointOfView) => {
                setZoomAltitude((previous) =>
                  Math.abs(previous - pointOfView.altitude) > 0.03 ? pointOfView.altitude : previous
                );
              }}
              onGlobeReady={() => {
                const globe = globeRef.current;
                if (!globe) return;

                if (fullScreen) {
                  globe.pointOfView({ lat: 18, lng: 20, altitude: 0.62 }, 0);
                }

                const scene = globe.scene?.();
                globe.renderer?.();
                if (!scene) return;

                if (hookedSceneRef.current && hookedSceneRef.current !== scene) {
                  hookedSceneRef.current.onBeforeRender = previousSceneBeforeRenderRef.current ?? undefined;
                }

                if (hookedSceneRef.current !== scene) {
                  previousSceneBeforeRenderRef.current =
                    typeof scene.onBeforeRender === "function" ? scene.onBeforeRender : null;
                  scene.onBeforeRender = (...args: unknown[]) => {
                    previousSceneBeforeRenderRef.current?.call(scene, ...args);

                    if (!needsArcStabilizeRef.current && stabilizeFramesRemainingRef.current <= 0) return;
                    stabilizeArcScene(scene);

                    if (stabilizeFramesRemainingRef.current > 0) {
                      stabilizeFramesRemainingRef.current -= 1;
                    }
                    if (stabilizeFramesRemainingRef.current <= 0) {
                      needsArcStabilizeRef.current = false;
                    }
                  };
                  hookedSceneRef.current = scene;
                }

                needsArcStabilizeRef.current = true;
                stabilizeFramesRemainingRef.current = Math.max(stabilizeFramesRemainingRef.current, 16);
                stabilizeArcScene(scene);
              }}
              onArcHover={(arc: ArcDatum | null) => {
                const next = arc?.flow ?? null;
                if (next) {
                  setActiveFlow(next);
                  pauseRotation();
                } else {
                  resumeRotation();
                }
              }}
              onArcClick={(arc: ArcDatum | null) => {
                const next = arc?.flow ?? null;
                if (!next) return;
                setActiveFlow(next);
                pauseRotation();
                onSelectFlow(next);
              }}
            />
          </div>

          {activeFlow && (
            <aside className="pointer-events-auto absolute right-3 top-3 w-[320px] rounded-xl border border-slate-600/80 bg-slate-950/90 p-4 text-sm text-slate-100 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.14em] text-sky-200">Corridor snapshot</p>
                <button
                  className="rounded-full border border-slate-500/70 p-1 text-slate-300 hover:border-sky-300 hover:text-sky-100"
                  onClick={() => setActiveFlow(null)}
                  aria-label="Close corridor snapshot"
                >
                  <X size={12} />
                </button>
              </div>
              <p className="mt-2 text-base font-semibold">
                <CountryFlag iso2={activeFlow.donorIso2} country={activeFlow.donorCountry} className="mr-2" />
                {activeFlow.donorCountry}
                <span className="mx-2 text-slate-400">{"->"}</span>
                <CountryFlag
                  iso2={activeFlow.recipientIso2}
                  country={activeFlow.recipientCountry}
                  className="mr-2"
                />
                {activeFlow.recipientCountry}
              </p>
              <p className="mt-3 text-slate-200">Total Donation: {formatUsdMillions(activeFlow.totalFunding)}</p>
              <p className="mt-1 text-slate-300">Unique Projects: {formatNumber(activeFlow.uniqueProjects)}</p>
              <p className="mt-1 text-slate-300">Years: {formatYearLabels(activeFlow.yearLabels)}</p>
              <p className="mt-3 rounded-md border border-sky-400/35 bg-sky-500/10 p-2 text-xs text-sky-100">
                Click this corridor to open detailed rows in the Donor {"->"} Recipient Flows tab.
              </p>
            </aside>
          )}
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
