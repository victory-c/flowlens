"use client";

import { formatNumber, formatUsdMillions } from "@/lib/utils";
import type {
  CaveatTag,
  Cause,
  CauseSummaryRow,
  CountrySummaryRow,
  DashboardCharts,
  DashboardFilters,
  FilterOption,
  FlowSummaryRow,
  GlobeFlow,
  ProjectPageQuery,
  RawTableRow,
  YearlySummaryRow
} from "@/shared/contracts/dashboard-data";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import ReactECharts from "echarts-for-react";
import { ArrowUpDown, ChevronDown, Filter, Loader2, Monitor, MonitorOff, RotateCcw, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CountryFlag } from "./country-flag";
import {
  buildCountryCorridorIndex,
  buildCountryOptions,
  countryIso3FromPolygon,
  countryNameFromPolygon,
  getFocusedCorridors,
  getOverviewCorridors,
  matchCountrySearchInput,
  normalizeCorridors,
  type CorridorLimit,
  type CountryCorridorStats,
  type CountryOption,
  type CountryPolygonCollection,
  type CountryPolygonFeature,
  type FocusedCorridor,
  type GlobeDirection,
  type GlobeFocusMode,
  type NormalizedCorridor
} from "./globe-country-focus";
import {
  getCauseSummary,
  getCountrySummary,
  getDashboardSummary,
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
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  opacity: number;
  width: number;
  dashLength: number;
  dashGap: number;
  dashInitialGap: number;
  dashAnimateTime: number;
  focusType: "overview" | "inbound" | "outbound";
  flow: NormalizedCorridor;
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
  pointOfView: {
    (position: { lat: number; lng: number; altitude: number }, ms: number): void;
    (): { lat: number; lng: number; altitude: number };
  };
  controls: () => GlobeControls;
  scene: () => ArcObjectLike;
  renderer: () => GlobeRendererLike;
};

type TabKey = "overview" | "country" | "flows" | "cause" | "yearly" | "raw";
type SortDir = ProjectPageQuery["sortDir"];
type SortBy = ProjectPageQuery["sortBy"];
type GlobeBasemapId = "voyager" | "dark-matter";

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
    subtitle: "Break down cause funding by donor continent, organization, and sector."
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

const CAVEAT_LABEL: Record<CaveatTag, string> = {
  unspecified_recipient: "Unspecified recipient",
  regional_aggregate: "Unspecified recipient",
  multi_year_aggregate: "Combined reporting period",
  domestic_flow: "Domestic flow"
};

const GLOBE_BASEMAPS: Array<{
  id: GlobeBasemapId;
  label: string;
  description: string;
  attribution: string;
  globeImageUrl: string;
  tileUrl: (x: number, y: number, l: number) => string;
}> = [
  {
    id: "voyager",
    label: "Voyager",
    description: "Light atlas style with high-contrast custom overlays.",
    attribution: "CARTO + OpenStreetMap contributors",
    globeImageUrl: "https://unpkg.com/three-globe/example/img/earth-water.png",
    tileUrl: (x, y, l) =>
      `https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/${l}/${x}/${y}.png`
  },
  {
    id: "dark-matter",
    label: "Dark Matter",
    description: "Dark high-contrast base tuned for current globe styling.",
    attribution: "CARTO + OpenStreetMap contributors",
    globeImageUrl: "https://unpkg.com/three-globe/example/img/earth-water.png",
    tileUrl: (x, y, l) => `https://a.basemaps.cartocdn.com/dark_nolabels/${l}/${x}/${y}.png`
  }
];

type GlobeTextLabel = {
  id: string;
  lat: number;
  lng: number;
  text: string;
  kind: "continent" | "country";
  fontPx: number;
  opacity: number;
  color: string;
};

type ContinentKey =
  | "africa"
  | "antarctica"
  | "asia"
  | "europe"
  | "north-america"
  | "oceania"
  | "south-america";

type CountryLabelCandidate = {
  iso3: string;
  name: string;
  lat: number;
  lng: number;
  minSpanDeg: number;
  sizeMetric: number;
  sizeNorm: number;
  continent: ContinentKey;
  revealAltitude: number;
  maxFontPx: number;
};

const CONTINENT_LABELS: Array<{ id: ContinentKey; text: string; lat: number; lng: number }> = [
  { id: "africa", text: "AFRICA", lat: 8, lng: 20 },
  { id: "antarctica", text: "ANTARCTICA", lat: -79, lng: 15 },
  { id: "asia", text: "ASIA", lat: 37, lng: 95 },
  { id: "europe", text: "EUROPE", lat: 54, lng: 18 },
  { id: "north-america", text: "NORTH AMERICA", lat: 48, lng: -104 },
  { id: "oceania", text: "OCEANIA", lat: -23, lng: 134 },
  { id: "south-america", text: "SOUTH AMERICA", lat: -18, lng: -60 }
];

const COUNTRY_LABEL_ALTITUDE_SCALE = 2;
const COUNTRY_LABEL_START_ALTITUDE = 0.92 * COUNTRY_LABEL_ALTITUDE_SCALE;
const FULLSCREEN_GLOBE_MIN_DISTANCE = 75;
const FULLSCREEN_GLOBE_MAX_DISTANCE = 540;
const EMBEDDED_GLOBE_MIN_DISTANCE = 145;
const EMBEDDED_GLOBE_MAX_DISTANCE = 630;

const DARK_MATTER_CONTINENT_COLORS: Record<ContinentKey, string> = {
  africa: "#f8fafc",
  antarctica: "#f8fafc",
  asia: "#f8fafc",
  europe: "#f8fafc",
  "north-america": "#f8fafc",
  oceania: "#f8fafc",
  "south-america": "#f8fafc"
};

const VOYAGER_CONTINENT_COLORS: Record<ContinentKey, string> = {
  africa: "#111827",
  antarctica: "#111827",
  asia: "#111827",
  europe: "#111827",
  "north-america": "#111827",
  oceania: "#111827",
  "south-america": "#111827"
};

const COUNTRY_LABEL_OVERRIDES: Record<
  string,
  {
    lat?: number;
    lng?: number;
    name?: string;
    revealAltitude?: number;
    maxFontPx?: number;
  }
> = {
  USA: {
    lat: 39.8,
    lng: -98.6,
    name: "United States",
    revealAltitude: 1.08,
    maxFontPx: 36
  },
  FRA: {
    lat: 46.4,
    lng: 2.3,
    name: "France",
    revealAltitude: 1.0,
    maxFontPx: 28
  },
  CAN: {
    name: "Canada",
    revealAltitude: 1.14,
    maxFontPx: 36
  },
  MEX: {
    name: "Mexico",
    revealAltitude: 1.08,
    maxFontPx: 31
  },
  KAZ: {
    name: "Kazakhstan",
    revealAltitude: 1.1,
    maxFontPx: 32
  }
};

function clamp(min: number, max: number, value: number) {
  return Math.max(min, Math.min(max, value));
}

function scaleCountryLabelAltitude(altitude: number) {
  return altitude * COUNTRY_LABEL_ALTITUDE_SCALE;
}

function normalizeLabelToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function wrappedLngRadians(deltaDegrees: number) {
  const wrapped = ((deltaDegrees + 540) % 360) - 180;
  return wrapped * Math.PI / 180;
}

function projectToCameraPlane(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number
) {
  const latRad = lat * Math.PI / 180;
  const centerLatRad = centerLat * Math.PI / 180;
  const lngDeltaRad = wrappedLngRadians(lng - centerLng);
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinCenter = Math.sin(centerLatRad);
  const cosCenter = Math.cos(centerLatRad);
  const cosLngDelta = Math.cos(lngDeltaRad);
  const visibility = sinCenter * sinLat + cosCenter * cosLat * cosLngDelta;

  if (visibility <= 0) return null;

  const x = cosLat * Math.sin(lngDeltaRad);
  const y = cosCenter * sinLat - sinCenter * cosLat * cosLngDelta;
  return { x, y };
}

function continentFromCoordinates(lat: number, lng: number): ContinentKey {
  if (lat <= -58) return "antarctica";
  if (lng < -20) return lat >= 12 ? "north-america" : "south-america";
  if (lat >= -36 && lat <= 38 && lng >= -25 && lng <= 63) return "africa";
  if (lat >= 35 && lng >= -12 && lng <= 60) return "europe";
  if (lat < -8 && lng >= 105) return "oceania";
  return "asia";
}

function continentFromFeature(feature: CountryPolygonFeature, lat: number, lng: number): ContinentKey {
  const raw = String(
    feature.properties?.CONTINENT ??
      feature.properties?.["CONTINENT_EN"] ??
      feature.properties?.["continent"] ??
      ""
  );
  const token = normalizeLabelToken(raw);

  if (token.includes("north america")) return "north-america";
  if (token.includes("south america")) return "south-america";
  if (token.includes("antarctica")) return "antarctica";
  if (token.includes("oceania")) return "oceania";
  if (token.includes("africa")) return "africa";
  if (token.includes("europe")) return "europe";
  if (token.includes("asia")) return "asia";

  return continentFromCoordinates(lat, lng);
}

function isAfricaLabelCandidate(continent: ContinentKey, lat: number, lng: number) {
  return continent === "africa" || (lat >= -36 && lat <= 38 && lng >= -25 && lng <= 63);
}

function continentLabelColor(basemapId: GlobeBasemapId, continent: ContinentKey) {
  return basemapId === "voyager"
    ? VOYAGER_CONTINENT_COLORS[continent]
    : DARK_MATTER_CONTINENT_COLORS[continent];
}

function countryLabelColor(basemapId: GlobeBasemapId) {
  return basemapId === "voyager" ? voyagerCountryLabelColor() : "#f8fafc";
}

function overviewArcColor(basemapId: GlobeBasemapId) {
  return basemapId === "voyager" ? "#1d4ed8" : "#7dd3fc";
}

function voyagerCountryLabelColor() {
  return "#0f172a";
}

function collectLonLatPairs(node: unknown, out: Array<[number, number]>) {
  if (!Array.isArray(node)) return;
  if (
    node.length >= 2 &&
    typeof node[0] === "number" &&
    Number.isFinite(node[0]) &&
    typeof node[1] === "number" &&
    Number.isFinite(node[1])
  ) {
    out.push([node[0], node[1]]);
    return;
  }

  for (const child of node) collectLonLatPairs(child, out);
}

function longitudeStats(longitudes: number[]) {
  const rawMin = Math.min(...longitudes);
  const rawMax = Math.max(...longitudes);
  const rawSpan = rawMax - rawMin;
  const rawCenter = rawMin + rawSpan / 2;

  const shifted = longitudes.map((value) => (value < 0 ? value + 360 : value));
  const shiftedMin = Math.min(...shifted);
  const shiftedMax = Math.max(...shifted);
  const shiftedSpan = shiftedMax - shiftedMin;
  const shiftedCenter = shiftedMin + shiftedSpan / 2;

  if (shiftedSpan < rawSpan) {
    const center = shiftedCenter > 180 ? shiftedCenter - 360 : shiftedCenter;
    return { span: shiftedSpan, center };
  }

  return { span: rawSpan, center: rawCenter };
}

function countryLabelAnchor(feature: CountryPolygonFeature) {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates) return null;

  const points: Array<[number, number]> = [];
  collectLonLatPairs(coordinates, points);
  if (!points.length) return null;

  let minLat = 90;
  let maxLat = -90;
  let latSum = 0;
  const lngValues: number[] = [];

  for (const [lng, lat] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    latSum += lat;
    lngValues.push(lng);
  }

  const latCenter = latSum / points.length;
  const lng = longitudeStats(lngValues);
  const latSpan = Math.max(0.04, maxLat - minLat);
  const lngSpan = Math.max(0.04, lng.span);
  const sizeMetric = Math.sqrt(latSpan * lngSpan * Math.max(0.25, Math.cos(latCenter * Math.PI / 180)));

  return {
    lat: latCenter,
    lng: lng.center,
    minSpanDeg: Math.min(latSpan, lngSpan),
    sizeMetric
  };
}

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

function supportsWebGl() {
  if (typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

class GlobeErrorBoundary extends Component<
  { fallback: ReactNode; onError?: (error: Error) => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function ForcedGlobeCrash(): null {
  throw new Error("Forced globe crash");
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
    tableQ: "Table Search",
    q: "Project Search",
    includeDomestic: "Include Domestic"
  };

  return Object.entries(filters)
    .filter(([key, value]) => {
      if (key === "viewMode" || key === "outlierOnly" || key === "donor" || key === "sector") return false;
      return value !== undefined && value !== null && value !== "" && value !== false;
    })
    .map(([key, value]) => ({
      key: key as keyof DashboardFilters,
      label: labels[key as keyof DashboardFilters] ?? key,
      value: key === "includeDomestic" ? "On" : String(value)
    }));
}

export function FlowLensDashboard() {
  const { filters, setFilters, clearFilter, resetFilters } = useDashboardFilters();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rawPage, setRawPage] = useState(1);
  const [countryPage, setCountryPage] = useState(1);
  const [flowPage, setFlowPage] = useState(1);
  const [countrySortBy, setCountrySortBy] = useState<SortBy>("amount");
  const [countrySortDir, setCountrySortDir] = useState<SortDir>("desc");
  const [flowSortBy, setFlowSortBy] = useState<SortBy>("amount");
  const [flowSortDir, setFlowSortDir] = useState<SortDir>("desc");
  const [lowGraphicsMode, setLowGraphicsMode] = useState(false);
  const [judgeDemoMode] = useState(true);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const [analyticsActivated, setAnalyticsActivated] = useState(false);
  const [tableQInput, setTableQInput] = useState(filters.tableQ ?? "");
  const analyticsSectionRef = useRef<HTMLElement | null>(null);

  const effectiveFilters = filters;

  useEffect(() => {
    setTableQInput(filters.tableQ ?? "");
  }, [filters.tableQ]);

  useEffect(() => {
    const nextTableQ = tableQInput.trim();
    if (nextTableQ === (filters.tableQ ?? "")) return;

    const timer = window.setTimeout(() => {
      setFilters({ tableQ: nextTableQ || undefined });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [filters.tableQ, setFilters, tableQInput]);

  useEffect(() => {
    setRawPage(1);
    setCountryPage(1);
    setFlowPage(1);
  }, [effectiveFilters]);

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
    queryKey: ["dashboard", "filter-options", effectiveFilters],
    queryFn: () => getFilterOptions(effectiveFilters),
    enabled: analyticsActivated
  });

  const globeQuery = useQuery({
    queryKey: ["dashboard", "globe-flows", effectiveFilters],
    queryFn: () => getGlobeFlows(effectiveFilters)
  });

  const metricsQuery = useQuery({
    queryKey: ["dashboard", "overview-metrics", effectiveFilters],
    queryFn: () => getOverviewMetrics(effectiveFilters),
    enabled: analyticsActivated
  });

  const countryQuery = useQuery({
    queryKey: ["dashboard", "country-summary", effectiveFilters, countryPage, countrySortBy, countrySortDir],
    queryFn: () => getCountrySummary(effectiveFilters, countryPage, 25, countrySortBy, countrySortDir),
    enabled: analyticsActivated && (activeTab === "country" || activeTab === "overview"),
    placeholderData: keepPreviousData
  });

  const flowSummaryPage = activeTab === "flows" ? flowPage : 1;
  const flowSummaryQuery = useQuery({
    queryKey: ["dashboard", "flow-summary", effectiveFilters, flowSummaryPage, flowSortBy, flowSortDir],
    queryFn: () => getFlowSummary(effectiveFilters, flowSummaryPage, 25, flowSortBy, flowSortDir),
    enabled: analyticsActivated,
    placeholderData: keepPreviousData
  });

  const causeQuery = useQuery({
    queryKey: ["dashboard", "cause-summary", effectiveFilters],
    queryFn: () => getCauseSummary(effectiveFilters),
    enabled: analyticsActivated && (activeTab === "cause" || activeTab === "overview")
  });

  const yearlyQuery = useQuery({
    queryKey: ["dashboard", "yearly-summary", effectiveFilters],
    queryFn: () => getYearlySummary(effectiveFilters),
    enabled: analyticsActivated && (activeTab === "yearly" || activeTab === "overview")
  });

  const dashboardSummaryQuery = useQuery({
    queryKey: ["dashboard", "summary", effectiveFilters],
    queryFn: () => getDashboardSummary(effectiveFilters),
    enabled: analyticsActivated && (activeTab === "overview" || activeTab === "cause")
  });

  const rawTableQuery = useQuery({
    queryKey: ["dashboard", "raw-table", effectiveFilters, rawPage],
    queryFn: () => getRawTable(effectiveFilters, rawPage, 25),
    enabled: analyticsActivated && activeTab === "raw"
  });

  const detailQuery = useQuery({
    queryKey: ["dashboard", "project-detail", selectedProjectKey, effectiveFilters],
    queryFn: () => getProjectDetail(selectedProjectKey as string, effectiveFilters),
    enabled: Boolean(selectedProjectKey)
  });

  const activeFilters = activeFilterEntries(effectiveFilters);
  const flowRows = globeQuery.data?.data.rows ?? [];
  const flowSummaryRows = flowSummaryQuery.data?.data.rows ?? [];
  const countrySummaryRows = countryQuery.data?.data.rows ?? [];

  const toggleCountrySort = useCallback(
    (nextSortBy: SortBy) => {
      setCountryPage(1);
      setCountrySortDir((current) => (countrySortBy === nextSortBy ? (current === "desc" ? "asc" : "desc") : "desc"));
      setCountrySortBy(nextSortBy);
    },
    [countrySortBy]
  );

  const toggleFlowSort = useCallback(
    (nextSortBy: SortBy) => {
      setFlowPage(1);
      setFlowSortDir((current) => (flowSortBy === nextSortBy ? (current === "desc" ? "asc" : "desc") : "desc"));
      setFlowSortBy(nextSortBy);
    },
    [flowSortBy]
  );

  return (
    <main className="dashboard-shell min-h-screen">
      <section className="hero relative h-[100svh] overflow-hidden bg-[#01040a]">
        <div className="absolute inset-0 -z-20 bg-[#01040a]" />

        <div className="absolute inset-0 z-0">
          <GlobeHero
            rows={flowRows}
            loading={globeQuery.isLoading}
            unsupportedFilters={globeQuery.data?.data.unsupportedFilters ?? []}
            onSelectFlow={handleFlowSelect}
            fullScreen
            lowGraphicsMode={lowGraphicsMode}
          />
        </div>

        <header className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-6 pb-4 pt-6 sm:px-8 lg:px-10">
          <div className="max-w-3xl rounded-xl border border-slate-500/80 bg-slate-950/80 p-3 shadow-[0_10px_30px_rgba(2,6,23,0.42)] backdrop-blur-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">
              Global Donation Flows
            </h1>
            <p className="mt-2 text-sm text-slate-200 sm:text-base">
              Drag to rotate. Hover or click a country to focus inbound and outbound corridors.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
              <span className="rounded-full border border-slate-500/80 bg-slate-900/70 px-3 py-1">
                Cross-border flows only
              </span>
              {judgeDemoMode && (
                <span className="rounded-full border border-sky-400/55 bg-sky-500/20 px-3 py-1">
                  Judge demo mode
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 flex max-w-3xl gap-2">
            <button
              type="button"
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-slate-500/80 bg-slate-950/80 px-4 py-2 text-xs text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.35)] transition hover:border-sky-300/90"
              onClick={() => setLowGraphicsMode((value) => !value)}
              aria-pressed={lowGraphicsMode}
            >
              {lowGraphicsMode ? <MonitorOff size={14} /> : <Monitor size={14} />}
              {lowGraphicsMode ? "Low graphics mode on" : "Low graphics mode off"}
            </button>
          </div>
        </header>

        <div className="pointer-events-none absolute bottom-6 left-0 right-0 z-20 flex justify-center px-6 sm:px-8 lg:px-10">
          <button
            type="button"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-slate-500/80 bg-slate-950/80 px-4 py-2 text-sm text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.35)] transition hover:border-sky-300/90 hover:text-sky-100"
            onClick={scrollToAnalytics}
          >
            Full Analytics
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
                <p className="mt-2 text-xs text-slate-400">
                  Domestic flows are where donor and recipient are in the same country.
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
                  onClick={() => {
                    setTableQInput("");
                    resetFilters();
                  }}
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

            <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

            {activeTab === "overview" && (
              <JudgeInsightCards
                metrics={metricsQuery.data?.data}
                flows={flowSummaryRows}
                causeRows={causeQuery.data?.data ?? []}
                filters={effectiveFilters}
                loading={metricsQuery.isLoading || flowSummaryQuery.isLoading || causeQuery.isLoading}
              />
            )}

            {activeTab === "overview" && (
              <OverviewTab
                metrics={metricsQuery.data?.data}
                yearly={yearlyQuery.data?.data ?? []}
                flows={flowSummaryRows}
                causeRows={causeQuery.data?.data ?? []}
                summaryCharts={dashboardSummaryQuery.data?.data.charts}
                loading={
                  metricsQuery.isLoading ||
                  yearlyQuery.isLoading ||
                  flowSummaryQuery.isLoading ||
                  causeQuery.isLoading ||
                  dashboardSummaryQuery.isLoading
                }
              />
            )}

            {activeTab === "country" && (
              <CountryTab
                rows={countrySummaryRows}
                loading={countryQuery.isLoading && !countryQuery.data}
                refreshing={countryQuery.isFetching && Boolean(countryQuery.data)}
                page={countryQuery.data?.data.page ?? countryPage}
                pageSize={countryQuery.data?.data.pageSize ?? 25}
                totalRows={countryQuery.data?.data.totalRows ?? 0}
                tableQ={tableQInput}
                onTableQChange={setTableQInput}
                onNext={() => setCountryPage((page) => page + 1)}
                onPrev={() => setCountryPage((page) => Math.max(1, page - 1))}
                sortBy={countrySortBy}
                sortDir={countrySortDir}
                onToggleSort={toggleCountrySort}
              />
            )}

            {activeTab === "flows" && (
              <FlowTab
                rows={flowSummaryRows}
                loading={flowSummaryQuery.isLoading && !flowSummaryQuery.data}
                refreshing={flowSummaryQuery.isFetching && Boolean(flowSummaryQuery.data)}
                page={flowSummaryQuery.data?.data.page ?? flowPage}
                pageSize={flowSummaryQuery.data?.data.pageSize ?? 25}
                totalRows={flowSummaryQuery.data?.data.totalRows ?? 0}
                tableQ={tableQInput}
                onTableQChange={setTableQInput}
                onNext={() => setFlowPage((page) => page + 1)}
                onPrev={() => setFlowPage((page) => Math.max(1, page - 1))}
                sortBy={flowSortBy}
                sortDir={flowSortDir}
                onToggleSort={toggleFlowSort}
              />
            )}

            {activeTab === "cause" && (
              <CauseTab
                rows={causeQuery.data?.data ?? []}
                summaryCharts={dashboardSummaryQuery.data?.data.charts}
                loading={causeQuery.isLoading || dashboardSummaryQuery.isLoading}
              />
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

function netFlowStatus(stats: CountryCorridorStats | null) {
  if (!stats) return "No flow data";
  const gap = stats.totalOutboundUsd - stats.totalInboundUsd;
  if (Math.abs(gap) < 0.001) return "Balanced";
  return gap > 0 ? "Net donor" : "Net recipient";
}

function toFlowFromCorridor(corridor: NormalizedCorridor): GlobeFlow {
  return {
    donorCountry: corridor.donorCountry,
    recipientCountry: corridor.recipientCountry,
    region: corridor.region,
    yearLabels: corridor.yearLabels,
    flowType: corridor.flowType,
    totalFunding: corridor.totalFunding,
    uniqueProjects: corridor.uniqueProjects,
    donorIso2: corridor.donorIso2,
    donorIso3: corridor.donorIso3,
    donorLat: corridor.donorLat,
    donorLng: corridor.donorLng,
    recipientIso2: corridor.recipientIso2,
    recipientIso3: corridor.recipientIso3,
    recipientLat: corridor.recipientLat,
    recipientLng: corridor.recipientLng,
    recipientGeoType: "exact_country",
    exactGeo: true
  };
}

function GlobeHero({
  rows,
  loading,
  unsupportedFilters,
  onSelectFlow,
  fullScreen = false,
  lowGraphicsMode = false
}: {
  rows: GlobeFlow[];
  loading: boolean;
  unsupportedFilters: string[];
  onSelectFlow: (flow: GlobeFlow) => void;
  fullScreen?: boolean;
  lowGraphicsMode?: boolean;
}) {
  const globeRef = useRef<GlobeHandle | null>(null);
  const globeWrapRef = useRef<HTMLDivElement | null>(null);
  const needsArcStabilizeRef = useRef(false);
  const stabilizeFramesRemainingRef = useRef(0);
  const previousSceneBeforeRenderRef = useRef<((...args: unknown[]) => void) | null>(null);
  const hookedSceneRef = useRef<ArcObjectLike | null>(null);
  const pointerDownRef = useRef({ x: 0, y: 0, moved: false, startedAt: 0 });
  const lastPointerWasClickRef = useRef(false);
  const recentPolygonClickAtRef = useRef(0);
  const recentArcClickAtRef = useRef(0);
  const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredArcRef = useRef<ArcDatum | null>(null);
  const pointerOverPolygonRef = useRef(false);

  const [globeSize, setGlobeSize] = useState({ width: 1200, height: 760 });
  const [countryPolygons, setCountryPolygons] = useState<CountryPolygonFeature[]>([]);
  const [corridorLimit, setCorridorLimit] = useState<CorridorLimit>(5);
  const [direction, setDirection] = useState<GlobeDirection>("both");
  const [basemapId, setBasemapId] = useState<GlobeBasemapId>("voyager");
  const [cameraAltitude, setCameraAltitude] = useState(fullScreen ? 0.62 : 1.8);
  const [cameraCenter, setCameraCenter] = useState({ lat: 18, lng: 20 });
  const [searchInput, setSearchInput] = useState("");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [hoveredCountryIso3, setHoveredCountryIso3] = useState<string | null>(null);
  const [hoveredCountryName, setHoveredCountryName] = useState<string | null>(null);
  const [pinnedCountryIso3, setPinnedCountryIso3] = useState<string | null>(null);
  const [selectedCorridor, setSelectedCorridor] = useState<FocusedCorridor | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 24, y: 24 });
  const [globeError, setGlobeError] = useState<Error | null>(null);

  const forceGlobeCrash = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("forceGlobeCrash") === "true";
  }, []);
  const webGlAvailable = useMemo(() => supportsWebGl(), []);
  const use2dFallback = lowGraphicsMode || !webGlAvailable || Boolean(globeError) || forceGlobeCrash;

  const mode: GlobeFocusMode = pinnedCountryIso3 ? "pinned-focus" : hoveredCountryName ? "hover-focus" : "overview";
  const arcHoverEnabled = mode !== "hover-focus";
  const arcSelectionEnabled = mode === "pinned-focus";
  const activeCountryIso3 = pinnedCountryIso3 ?? hoveredCountryIso3 ?? null;
  const activeBasemap = useMemo(
    () => GLOBE_BASEMAPS.find((entry) => entry.id === basemapId) ?? GLOBE_BASEMAPS[0],
    [basemapId]
  );
  const normalizedCorridors = useMemo(() => normalizeCorridors(rows), [rows]);
  const countryCorridorIndex = useMemo(() => buildCountryCorridorIndex(normalizedCorridors), [normalizedCorridors]);
  const countryOptions = useMemo(
    () => buildCountryOptions(countryPolygons, countryCorridorIndex),
    [countryCorridorIndex, countryPolygons]
  );

  const optionByIso = useMemo(() => {
    const map = new Map<string, CountryOption>();
    for (const option of countryOptions) map.set(option.iso3, option);
    return map;
  }, [countryOptions]);

  const countryLabelCandidates = useMemo<CountryLabelCandidate[]>(() => {
    const candidates: Array<{
      iso3: string;
      name: string;
      lat: number;
      lng: number;
      minSpanDeg: number;
      sizeMetric: number;
      continent: ContinentKey;
    }> = [];

    for (const feature of countryPolygons) {
      const iso3 = countryIso3FromPolygon(feature);
      if (!iso3) continue;
      const anchor = countryLabelAnchor(feature);
      if (!anchor) continue;
      const override = COUNTRY_LABEL_OVERRIDES[iso3];
      // Use the same polygon source as hoverable countries for label text.
      const name = override?.name ?? countryNameFromPolygon(feature);
      if (!name || name === "Unknown") continue;

      candidates.push({
        iso3,
        name,
        lat: override?.lat ?? anchor.lat,
        lng: override?.lng ?? anchor.lng,
        minSpanDeg: anchor.minSpanDeg,
        sizeMetric: anchor.sizeMetric,
        continent: continentFromFeature(feature, override?.lat ?? anchor.lat, override?.lng ?? anchor.lng)
      });
    }

    if (!candidates.length) return [];
    const maxSizeMetric = Math.max(...candidates.map((row) => row.sizeMetric), 0.0001);

    return candidates
      .map((row) => {
        const override = COUNTRY_LABEL_OVERRIDES[row.iso3];
        const sizeNorm = clamp(0, 1, row.sizeMetric / maxSizeMetric);
        const africaBoost = isAfricaLabelCandidate(row.continent, row.lat, row.lng) ? 0.08 : 0;
        const autoRevealAltitude =
          0.88 + sizeNorm * 0.44 - Math.max(0, row.name.length - 14) * 0.006 + africaBoost;
        const revealAltitude = override?.revealAltitude !== undefined
          ? scaleCountryLabelAltitude(override.revealAltitude)
          : clamp(
              scaleCountryLabelAltitude(0.74),
              scaleCountryLabelAltitude(1.34),
              scaleCountryLabelAltitude(autoRevealAltitude)
            );
        const maxFontPx = clamp(
          11,
          36,
          override?.maxFontPx ??
            (13.5 + sizeNorm * 20 - Math.max(0, row.name.length - 12) * 0.15)
        );

        return {
          iso3: row.iso3,
          name: row.name,
          lat: row.lat,
          lng: row.lng,
          minSpanDeg: row.minSpanDeg,
          sizeMetric: row.sizeMetric,
          sizeNorm,
          continent: row.continent,
          revealAltitude,
          maxFontPx
        };
      })
      .sort((a, b) => b.sizeMetric - a.sizeMetric);
  }, [countryPolygons]);

  const countryAnchorByIso = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const candidate of countryLabelCandidates) {
      map.set(candidate.iso3, { lat: candidate.lat, lng: candidate.lng });
    }
    return map;
  }, [countryLabelCandidates]);

  const countryCoordinates = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const row of normalizedCorridors) {
      if (!map.has(row.donorIso3)) {
        map.set(row.donorIso3, { lat: row.donorLat, lng: row.donorLng });
      }
      if (!map.has(row.recipientIso3)) {
        map.set(row.recipientIso3, { lat: row.recipientLat, lng: row.recipientLng });
      }
    }
    return map;
  }, [normalizedCorridors]);

  const focusedResult = useMemo(
    () =>
      getFocusedCorridors(countryCorridorIndex, activeCountryIso3, {
        direction,
        corridorLimit
      }),
    [activeCountryIso3, corridorLimit, countryCorridorIndex, direction]
  );

  const pinnedResult = useMemo(
    () =>
      getFocusedCorridors(countryCorridorIndex, pinnedCountryIso3, {
        direction,
        corridorLimit
      }),
    [corridorLimit, countryCorridorIndex, direction, pinnedCountryIso3]
  );

  const overviewCorridorLimit = typeof corridorLimit === "number" ? corridorLimit : 25;
  const overviewCorridors = useMemo(
    () => getOverviewCorridors(normalizedCorridors, overviewCorridorLimit),
    [normalizedCorridors, overviewCorridorLimit]
  );
  const visibleCorridors = useMemo<(FocusedCorridor | (NormalizedCorridor & { focusType: "overview" }))[]>(() => {
    if (activeCountryIso3) return focusedResult.visible;
    return overviewCorridors.map((corridor) => ({ ...corridor, focusType: "overview" as const }));
  }, [activeCountryIso3, focusedResult.visible, overviewCorridors]);

  const visibleMaxAmount = useMemo(
    () => visibleCorridors.reduce((max, row) => Math.max(max, row.totalFunding), 0),
    [visibleCorridors]
  );

  const arcs = useMemo<ArcDatum[]>(
    () =>
      visibleCorridors
        .filter((row) => !row.isSelfFlow)
        .map((row, index) => {
          const normalizedAmount = visibleMaxAmount > 0 ? row.totalFunding / visibleMaxAmount : 0;
          const isOverview = row.focusType === "overview";
          const opacity = isOverview
            ? basemapId === "voyager"
              ? 0.34 + normalizedAmount * 0.24
              : 0.14 + normalizedAmount * 0.18
            : 0.25 + normalizedAmount * 0.65;
          const color = row.focusType === "outbound"
            ? "#f59e0b"
            : row.focusType === "inbound"
              ? "#38bdf8"
              : overviewArcColor(basemapId);
          const dashLength = row.focusType === "outbound" ? 0.5 : row.focusType === "inbound" ? 0.3 : 1;
          const dashGap = row.focusType === "outbound" ? 0.22 : row.focusType === "inbound" ? 0.18 : 0;
          const dashAnimateTime = isOverview ? 0 : row.focusType === "outbound" ? 2000 : 2400;
          const hash = ((row.id.length + index * 31) % 100) / 100;

          return {
            id: `${row.id}-${row.focusType}`,
            startLat: row.donorLat,
            startLng: row.donorLng,
            endLat: row.recipientLat,
            endLng: row.recipientLng,
            color,
            opacity,
            // Keep arrow/arc thickness consistent across all countries and corridors.
            width: 1.15,
            dashLength,
            dashGap,
            dashInitialGap: isOverview ? 0 : hash * (dashLength + dashGap),
            dashAnimateTime,
            focusType: row.focusType,
            flow: row
          };
        }),
    [basemapId, visibleCorridors, visibleMaxAmount]
  );

  const activeCountryName = useMemo(() => {
    if (!activeCountryIso3) return null;
    return optionByIso.get(activeCountryIso3)?.name ?? countryCorridorIndex[activeCountryIso3]?.label ?? activeCountryIso3;
  }, [activeCountryIso3, countryCorridorIndex, optionByIso]);

  const hoveredStats = useMemo(() => {
    if (!hoveredCountryName || pinnedCountryIso3) return null;
    if (!hoveredCountryIso3) {
      return { iso3: null, name: hoveredCountryName, stats: null as CountryCorridorStats | null, hasFlows: false };
    }
    const stats = countryCorridorIndex[hoveredCountryIso3] ?? null;
    const hasFlows = Boolean(stats && (stats.inbound.length > 0 || stats.outbound.length > 0 || stats.selfFlows.length > 0));
    return {
      iso3: hoveredCountryIso3,
      name: optionByIso.get(hoveredCountryIso3)?.name ?? hoveredCountryName,
      stats,
      hasFlows
    };
  }, [countryCorridorIndex, hoveredCountryIso3, hoveredCountryName, optionByIso, pinnedCountryIso3]);

  const unsupportedInfo = unsupportedFilters.length
    ? `Some active dashboard filters are not applied to the globe: ${unsupportedFilters.join(", ")}.`
    : null;

  const globeTextLabels = useMemo<GlobeTextLabel[]>(() => {
    // Keep continent labels visible all the way through the farthest zoom-out.
    // Country labels take over at the configured transition altitude.
    const continentMode = cameraAltitude >= COUNTRY_LABEL_START_ALTITUDE;
    if (continentMode) {
      const continentFontPx = clamp(20, 34, 32 - (cameraAltitude - COUNTRY_LABEL_START_ALTITUDE) * 6);
      return CONTINENT_LABELS.map((row) => ({
        id: row.id,
        lat: row.lat,
        lng: row.lng,
        text: row.text,
        kind: "continent" as const,
        fontPx: continentFontPx,
        opacity: 0.95,
        color: continentLabelColor(basemapId, row.id)
      }));
    }

    const zoomGain = 1 / Math.max(cameraAltitude, 0.14);
    const labels: GlobeTextLabel[] = [];
    const occupied: Array<{ x: number; y: number; radius: number }> = [];
    const minScreenSpan = Math.max(420, Math.min(globeSize.width, globeSize.height));
    const globeUnitsPerPixel = 2 / minScreenSpan;
    const detailRamp = clamp(
      0,
      1,
      (COUNTRY_LABEL_START_ALTITUDE - cameraAltitude) /
        Math.max(0.22, COUNTRY_LABEL_START_ALTITUDE - 0.44)
    );
    const nearRamp = clamp(
      0,
      1,
      (0.8 - cameraAltitude) / 0.4
    );
    const deepRamp = clamp(
      0,
      1,
      (0.56 - cameraAltitude) / 0.24
    );

    const zoomFactor = clamp(0, 1.6, detailRamp * 1.05 + nearRamp * 0.55 + deepRamp * 0.28);
    const maxCountryLabels = pinnedCountryIso3
      ? 56
      : Math.round(
          clamp(
            80,
            countryLabelCandidates.length,
            80 + detailRamp * 180 + nearRamp * 260 + deepRamp * 360
          )
        );

    const visibleCandidates: Array<{
      candidate: CountryLabelCandidate;
      projected: { x: number; y: number };
      distance: number;
      priority: number;
    }> = [];

    for (const candidate of countryLabelCandidates) {
      const projected = projectToCameraPlane(candidate.lat, candidate.lng, cameraCenter.lat, cameraCenter.lng);
      if (!projected) continue;
      const distance = Math.hypot(projected.x, projected.y);
      const centerScore = 1 - clamp(0, 1, distance / 1.05);
      const priority =
        candidate.sizeNorm * (1 - detailRamp * 0.72) +
        centerScore * (0.24 + detailRamp * 0.76) +
        (centerScore > 0.9 ? nearRamp * 0.2 : 0);
      visibleCandidates.push({
        candidate,
        projected,
        distance,
        priority
      });
    }

    visibleCandidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.distance !== b.distance) return a.distance - b.distance;
      return b.candidate.sizeMetric - a.candidate.sizeMetric;
    });

    for (const { candidate, projected } of visibleCandidates) {
      // Relax fit gating so labels are larger and can intentionally overrun
      // borders when needed. Larger countries pass this gate more easily.
      const sizeBoost = clamp(0.36, 1, candidate.sizeNorm);
      const baseFitThreshold = candidate.name.length * 0.02 * (1.08 - sizeBoost);
      const fitScalar = isAfricaLabelCandidate(candidate.continent, candidate.lat, candidate.lng)
        ? clamp(0.04, 0.28, 0.28 - detailRamp * 0.19 - nearRamp * 0.07)
        : clamp(0.04, 0.32, 0.32 - detailRamp * 0.21 - nearRamp * 0.08);
      const fitFloor = isAfricaLabelCandidate(candidate.continent, candidate.lat, candidate.lng)
        ? clamp(0.0018, 0.012, 0.012 - nearRamp * 0.007 - deepRamp * 0.0035)
        : clamp(0.002, 0.014, 0.014 - nearRamp * 0.008 - deepRamp * 0.004);
      const fitThreshold = Math.max(fitFloor, baseFitThreshold * fitScalar);
      if (zoomGain * candidate.minSpanDeg < fitThreshold) continue;

      const scaledFont = 10.2 + zoomFactor * 7.8 + Math.min(9.2, candidate.sizeMetric * 1.16);
      const fontPx = Math.min(candidate.maxFontPx, scaledFont);
      if (fontPx < 8.2) continue;

      if (pinnedCountryIso3 && candidate.iso3 !== pinnedCountryIso3) {
        // Keep pinned mode cleaner by emphasizing the selected country label.
        continue;
      }

      const labelWidthPx = candidate.name.length * fontPx * 0.62;
      const labelHeightPx = fontPx * 1.26;
      const collisionScale = clamp(0.075, 0.5, 0.5 - detailRamp * 0.24 - nearRamp * 0.15 - deepRamp * 0.08);
      const collisionPadding = clamp(0.00055, 0.0045, 0.0045 - detailRamp * 0.0024 - nearRamp * 0.0011 - deepRamp * 0.0005);
      const collisionRadius = Math.max(labelWidthPx, labelHeightPx) * collisionScale * globeUnitsPerPixel + collisionPadding;
      const skipCollisions = deepRamp > 0.9;
      if (!skipCollisions) {
        const collides = occupied.some((entry) => {
          const dx = projected.x - entry.x;
          const dy = projected.y - entry.y;
          return Math.hypot(dx, dy) < collisionRadius + entry.radius;
        });
        if (collides) continue;
      }

      const nextLabel: GlobeTextLabel = {
        id: candidate.iso3,
        lat: candidate.lat,
        lng: candidate.lng,
        text: candidate.name,
        kind: "country",
        fontPx,
        opacity: pinnedCountryIso3 ? 0.98 : 0.9,
        color: countryLabelColor(basemapId)
      };

      labels.push(nextLabel);
      occupied.push({
        x: projected.x,
        y: projected.y,
        radius: collisionRadius
      });

      if (!skipCollisions && labels.length >= maxCountryLabels) break;
    }

    return labels;
  }, [basemapId, cameraAltitude, cameraCenter.lat, cameraCenter.lng, countryLabelCandidates, globeSize.height, globeSize.width, pinnedCountryIso3]);

  const htmlLabelElement = useCallback((label: GlobeTextLabel) => {
    const node = document.createElement("div");
    node.textContent = label.text;
    node.style.transform = "translate(-50%, -50%)";
    node.style.pointerEvents = "none";
    node.style.userSelect = "none";
    node.style.whiteSpace = "nowrap";
    node.style.opacity = `${label.opacity}`;
    node.style.fontFamily = "\"Manrope\", \"Inter\", \"Segoe UI\", sans-serif";
    node.style.fontSize = `${label.fontPx}px`;
    node.style.lineHeight = "1";
    node.style.color = label.color;
    node.style.fontWeight = label.kind === "continent" ? "800" : "650";
    node.style.letterSpacing = label.kind === "continent" ? "0.08em" : "0.01em";
    node.style.textTransform = label.kind === "continent" ? "uppercase" : "none";
    const darkEdge =
      label.kind === "continent"
        ? "0 1px 0 rgba(2, 6, 23, 0.95), 0 0 9px rgba(2, 6, 23, 0.82)"
        : "0 1px 0 rgba(2, 6, 23, 0.95), 0 0 8px rgba(2, 6, 23, 0.9)";
    const voyagerEdge =
      label.kind === "continent"
        ? "0 1px 0 rgba(248, 250, 252, 0.9), 0 0 9px rgba(248, 250, 252, 0.82)"
        : "0 1px 0 rgba(248, 250, 252, 0.94), 0 0 10px rgba(248, 250, 252, 0.86)";
    node.style.textShadow = basemapId === "voyager" ? voyagerEdge : darkEdge;
    return node;
  }, [basemapId]);

  const arcLabel = useCallback(
    (arc: ArcDatum) => {
      if (pointerOverPolygonRef.current && !pinnedCountryIso3) return "";
      if (!arcHoverEnabled) return "";
      const direction =
        arc.focusType === "outbound"
          ? "Outbound corridor"
          : arc.focusType === "inbound"
            ? "Inbound corridor"
            : "Global overview corridor";
      return `${arc.flow.donorCountry} -> ${arc.flow.recipientCountry}<br/>${direction}<br/>Funding: ${formatUsdMillions(arc.flow.totalFunding)}`;
    },
    [arcHoverEnabled, pinnedCountryIso3]
  );

  const clearCountryFocus = useCallback(() => {
    if (hoverClearTimeoutRef.current) {
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    }
    hoveredArcRef.current = null;
    pointerOverPolygonRef.current = false;
    setPinnedCountryIso3(null);
    setHoveredCountryIso3(null);
    setHoveredCountryName(null);
    setSelectedCorridor(null);
  }, []);

  const cancelHoverClear = useCallback(() => {
    if (!hoverClearTimeoutRef.current) return;
    clearTimeout(hoverClearTimeoutRef.current);
    hoverClearTimeoutRef.current = null;
  }, []);

  const scheduleHoverClear = useCallback(() => {
    if (pinnedCountryIso3) return;
    cancelHoverClear();
    hoverClearTimeoutRef.current = setTimeout(() => {
      if (pointerOverPolygonRef.current) {
        hoverClearTimeoutRef.current = null;
        return;
      }
      // Keep country-hover focus sticky while the pointer is on an arc so
      // arcs don't force an unintended jump back to overview.
      if (hoveredArcRef.current) {
        hoverClearTimeoutRef.current = null;
        return;
      }
      setHoveredCountryIso3(null);
      setHoveredCountryName(null);
      hoverClearTimeoutRef.current = null;
    }, 120);
  }, [cancelHoverClear, pinnedCountryIso3]);

  const rotateToCountry = useCallback(
    (iso3: string) => {
      const target = countryCoordinates.get(iso3) ?? countryAnchorByIso.get(iso3);
      const globe = globeRef.current;
      if (!globe || !target) return;
      globe.pointOfView({ lat: target.lat, lng: target.lng, altitude: fullScreen ? 0.62 : 1.25 }, 900);
    },
    [countryAnchorByIso, countryCoordinates, fullScreen]
  );

  const selectPinnedCountry = useCallback(
    (iso3: string, name?: string) => {
      setPinnedCountryIso3(iso3);
      setHoveredCountryIso3(null);
      setHoveredCountryName(name ?? optionByIso.get(iso3)?.name ?? iso3);
      setSelectedCorridor(null);
      rotateToCountry(iso3);
    },
    [optionByIso, rotateToCountry]
  );

  const applyGlobeDistanceLimits = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const controls = globe.controls();
    controls.enablePan = false;
    controls.minDistance = fullScreen ? FULLSCREEN_GLOBE_MIN_DISTANCE : EMBEDDED_GLOBE_MIN_DISTANCE;
    controls.maxDistance = fullScreen ? FULLSCREEN_GLOBE_MAX_DISTANCE : EMBEDDED_GLOBE_MAX_DISTANCE;
  }, [fullScreen]);

  const applyGlobeAutoRotate = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const controls = globe.controls();
    controls.autoRotate = !pinnedCountryIso3;
    controls.autoRotateSpeed = 0.2;
  }, [pinnedCountryIso3]);

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
        if (!response.ok) throw new Error("Failed to load country polygons.");
        return response.json() as Promise<CountryPolygonCollection>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const usable = (Array.isArray(payload.features) ? payload.features : []).filter((feature) => Boolean(feature.geometry));
        setCountryPolygons(usable);
      })
      .catch(() => {
        setCountryPolygons([]);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedCorridor) return;
    const stillVisible = visibleCorridors.some((row) => row.id === selectedCorridor.id && row.focusType === selectedCorridor.focusType);
    if (!stillVisible) setSelectedCorridor(null);
  }, [selectedCorridor, visibleCorridors]);

  useEffect(() => {
    if (activeCountryIso3) return;
    if (corridorLimit !== "all") return;
    // "All" is focused-country only; overview should stay restrained.
    setCorridorLimit(5);
  }, [activeCountryIso3, corridorLimit]);

  useEffect(() => {
    needsArcStabilizeRef.current = true;
    stabilizeFramesRemainingRef.current = 12;
  }, [arcs]);

  useEffect(() => {
    if (!lowGraphicsMode) return;
    setSelectedCorridor(null);
  }, [lowGraphicsMode]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && pinnedCountryIso3) {
        clearCountryFocus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearCountryFocus, pinnedCountryIso3]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    applyGlobeAutoRotate();
  }, [applyGlobeAutoRotate, pinnedCountryIso3]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView({ lat: 18, lng: 20, altitude: fullScreen ? 0.62 : 1.8 }, 0);
    setCameraCenter({ lat: 18, lng: 20 });
    setCameraAltitude(fullScreen ? 0.62 : 1.8);
    applyGlobeDistanceLimits();

    return () => {
      const hookedScene = hookedSceneRef.current;
      if (hookedScene) {
        hookedScene.onBeforeRender = previousSceneBeforeRenderRef.current ?? undefined;
        hookedSceneRef.current = null;
      }
    };
  }, [applyGlobeDistanceLimits, fullScreen]);

  useEffect(() => {
    if (use2dFallback) return;

    let frame = 0;
    const tick = () => {
      const globe = globeRef.current;
      if (globe) {
        try {
          const pov = globe.pointOfView();
          if (pov && Number.isFinite(pov.altitude)) {
            setCameraAltitude((current) => {
              if (Math.abs(current - pov.altitude) < 0.01) return current;
              return pov.altitude;
            });
            setCameraCenter((current) => {
              if (Math.abs(current.lat - pov.lat) < 0.2 && Math.abs(current.lng - pov.lng) < 0.2) return current;
              return { lat: pov.lat, lng: pov.lng };
            });
          }
        } catch {
          // Ignore point-of-view read failures from interim globe mount states.
        }
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [use2dFallback]);

  useEffect(
    () => () => {
      if (!hoverClearTimeoutRef.current) return;
      clearTimeout(hoverClearTimeoutRef.current);
      hoverClearTimeoutRef.current = null;
    },
    []
  );

  const fallbackReason = lowGraphicsMode
    ? "Low graphics mode is enabled."
    : !webGlAvailable
      ? "WebGL is not available on this device."
      : globeError
        ? "The globe could not load. Analytics panels are still available below."
        : forceGlobeCrash
          ? "Forced crash mode enabled for testing."
          : "3D mode unavailable.";
  const lightOverlayMode = basemapId === "voyager";
  const filterPanelClass = lightOverlayMode
    ? "border-slate-500/80 bg-slate-950/80 text-slate-100 shadow-[0_10px_30px_rgba(2,6,23,0.42)]"
    : "border-slate-600/80 bg-slate-950/88 text-slate-100";
  const filterHeadingTextClass = lightOverlayMode ? "text-slate-100" : "text-slate-200";
  const filterMutedTextClass = lightOverlayMode ? "text-slate-300" : "text-slate-400";
  const filterActiveChipClass = lightOverlayMode
    ? "border-sky-400/55 bg-sky-500/20 text-sky-100"
    : "border-sky-400/50 bg-sky-500/20 text-sky-100";
  const filterButtonActiveClass = lightOverlayMode
    ? "border-sky-300 bg-sky-500/20 text-sky-100"
    : "border-sky-300 bg-sky-500/20 text-sky-100";
  const filterButtonInactiveClass = lightOverlayMode
    ? "border-slate-500/80 bg-slate-900/70 text-slate-100 hover:border-sky-300/80"
    : "border-slate-500/80 bg-slate-950/80 text-slate-200 hover:border-sky-300/80";
  const filterInputClass = lightOverlayMode
    ? "border-slate-500/80 bg-slate-900/70 text-slate-100 placeholder:text-slate-400 focus:border-sky-300"
    : "border-slate-700 bg-slate-900 text-slate-100 focus:border-sky-300";
  const pinnedPanelClass = lightOverlayMode
    ? "pointer-events-auto absolute bottom-4 right-4 z-30 w-[340px] max-w-[calc(100%-2rem)] rounded-xl border border-slate-500/80 bg-slate-950/80 p-4 text-sm text-slate-100 shadow-2xl backdrop-blur sm:w-[380px]"
    : "pointer-events-auto absolute bottom-4 right-4 z-30 w-[340px] max-w-[calc(100%-2rem)] rounded-xl border border-slate-600/80 bg-slate-950/92 p-4 text-sm text-slate-100 shadow-2xl backdrop-blur sm:w-[380px]";
  const pinnedSubPanelClass = lightOverlayMode
    ? "border-slate-600/80 bg-slate-900/70"
    : "border-slate-700/80 bg-slate-900/70";

  const tooltipLeft = Math.max(12, Math.min(cursorPosition.x + 14, globeSize.width - 340));
  const tooltipTop = Math.max(12, Math.min(cursorPosition.y + 14, globeSize.height - 220));
  const pinnedStats = pinnedCountryIso3 ? pinnedResult.stats : null;
  const pinnedHasNoFlows =
    Boolean(pinnedCountryIso3) &&
    (!pinnedStats || (pinnedStats.inbound.length === 0 && pinnedStats.outbound.length === 0 && pinnedStats.selfFlows.length === 0));

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
          Loading aggregated globe corridors...
        </div>
      ) : rows.length === 0 ? (
        <div
          className={`flex items-center justify-center p-6 text-center text-sm text-slate-300 ${
            fullScreen
              ? "h-full min-h-[100svh] bg-[#01040a]"
              : "h-[62vh] min-h-[420px] rounded-2xl border border-slate-700 bg-slate-900/70"
          }`}
        >
          No exact-country corridors match the current filters.
        </div>
      ) : (
        <div className="relative">
          <div
            className={`absolute z-20 space-y-2 ${
              fullScreen
                ? "left-3 right-3 top-[10.5rem] max-w-none sm:left-auto sm:right-5 sm:top-5 sm:w-[430px] sm:max-w-[430px]"
                : "left-3 top-3 max-w-[calc(100%-1.5rem)]"
            }`}
          >
            <div className={`flex flex-wrap items-center gap-1.5 rounded-xl border p-1.5 text-[11px] ${filterPanelClass}`}>
              <span className={`font-semibold ${filterHeadingTextClass}`}>View</span>
              <span className={`rounded-full border px-2 py-0.5 ${filterActiveChipClass}`}>
                {mode === "pinned-focus" && activeCountryName ? `Focused on ${activeCountryName}` : "Overview"}
              </span>
              <span className={filterMutedTextClass}>Hover or click a country to focus</span>
              <button
                type="button"
                onClick={() => setBasemapId((current) => (current === "dark-matter" ? "voyager" : "dark-matter"))}
                className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] ${basemapId === "dark-matter" ? filterButtonActiveClass : filterButtonInactiveClass}`}
                aria-pressed={basemapId === "dark-matter"}
              >
                {basemapId === "dark-matter" ? "Dark mode: on" : "Dark mode: off"}
              </button>
            </div>

            <div className={`flex flex-wrap items-center gap-1.5 rounded-xl border p-1.5 text-[11px] ${filterPanelClass}`}>
              <span className={`font-semibold ${filterHeadingTextClass}`}>Corridors</span>
              {([5, 10, 25, 50] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCorridorLimit(value)}
                  className={`rounded-full border px-3 py-1 ${corridorLimit === value ? filterButtonActiveClass : filterButtonInactiveClass}`}
                >
                  Top {value}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (!activeCountryIso3) return;
                  setCorridorLimit("all");
                }}
                disabled={!activeCountryIso3}
                className={`rounded-full border px-3 py-1 ${corridorLimit === "all" ? filterButtonActiveClass : filterButtonInactiveClass} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                All
              </button>

              <span className={`ml-2 font-semibold ${filterHeadingTextClass}`}>Direction</span>
              {(["both", "outbound", "inbound"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDirection(value)}
                  className={`rounded-full border px-3 py-1 ${direction === value ? filterButtonActiveClass : filterButtonInactiveClass}`}
                >
                  {value === "both" ? "Both" : value === "outbound" ? "Outbound" : "Inbound"}
                </button>
              ))}
            </div>

            <form
              className={`flex items-center gap-1.5 rounded-xl border p-1.5 ${filterPanelClass}`}
              onSubmit={(event) => {
                event.preventDefault();
                const match = matchCountrySearchInput(countryOptions, searchInput);
                if (!match) {
                  setSearchMessage("No matching country found.");
                  return;
                }
                setSearchMessage(null);
                selectPinnedCountry(match.iso3, match.name);
              }}
            >
              <label htmlFor="globe-country-search" className={`text-xs font-semibold ${filterHeadingTextClass}`}>
                Search country
              </label>
              <input
                id="globe-country-search"
                list="globe-country-options"
                value={searchInput}
                onChange={(event) => setSearchInput(event.currentTarget.value)}
                placeholder="Country name or ISO3"
                className={`h-7 w-52 rounded-md border px-2 text-xs outline-none ${filterInputClass}`}
              />
              <datalist id="globe-country-options">
                {countryOptions.map((option) => (
                  <option key={option.iso3} value={option.name}>
                    {option.iso3}
                  </option>
                ))}
              </datalist>
              <button
                type="submit"
                className={`rounded-md border px-2 py-1 text-xs ${filterButtonInactiveClass}`}
              >
                Focus
              </button>
              {pinnedCountryIso3 && (
                <button
                  type="button"
                  className={`rounded-md border px-2 py-1 text-xs ${filterButtonInactiveClass}`}
                  onClick={clearCountryFocus}
                >
                  Clear
                </button>
              )}
            </form>
            {searchMessage && (
              <p className="rounded-md border border-amber-600/60 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
                {searchMessage}
              </p>
            )}
            {unsupportedInfo && (
              <p className="rounded-md border border-slate-500/70 bg-slate-900/85 px-3 py-1.5 text-xs text-slate-200">
                {unsupportedInfo}
              </p>
            )}
          </div>

          <div
            ref={globeWrapRef}
            className={`flex items-center justify-center overflow-hidden ${
              fullScreen
                ? "h-[100svh] w-full bg-[#01040a]"
                : "h-[62vh] min-h-[420px] rounded-2xl border border-slate-700/80 bg-[#030817]"
            }`}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setCursorPosition({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
              });
            }}
            onPointerDown={(event) => {
              pointerDownRef.current = {
                x: event.clientX,
                y: event.clientY,
                moved: false,
                startedAt: Date.now()
              };
              lastPointerWasClickRef.current = false;
            }}
            onPointerMove={(event) => {
              const pointer = pointerDownRef.current;
              if (pointer.startedAt === 0) return;
              const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
              if (distance > 8) pointer.moved = true;
            }}
            onPointerUp={() => {
              const pointer = pointerDownRef.current;
              if (pointer.startedAt === 0) return;
              const elapsed = Date.now() - pointer.startedAt;
              lastPointerWasClickRef.current = !pointer.moved && elapsed < 350;
              pointerDownRef.current.startedAt = 0;
            }}
            onMouseLeave={() => {
              hoveredArcRef.current = null;
              pointerOverPolygonRef.current = false;
              scheduleHoverClear();
            }}
          >
            {use2dFallback ? (
              <TwoDFlowFallback rows={rows.slice(0, 25)} reason={fallbackReason} onSelectFlow={onSelectFlow} />
            ) : (
              <GlobeErrorBoundary
                fallback={
                  <TwoDFlowFallback
                    rows={rows.slice(0, 25)}
                    reason="Globe rendering failed. You can continue using the analytics tabs below."
                    onSelectFlow={onSelectFlow}
                  />
                }
                onError={(error) => setGlobeError(error)}
              >
                {forceGlobeCrash ? <ForcedGlobeCrash /> : null}
                <Globe
                  key={`globe-${basemapId}`}
                  ref={globeRef}
                  width={globeSize.width}
                  height={globeSize.height}
                  rendererConfig={{ antialias: true, alpha: true }}
                  // Keep arc hover picking active so we can avoid dropping country-hover
                  // focus when the pointer moves from a country polygon onto an arc.
                  lineHoverPrecision={0.14}
                  backgroundColor="rgba(0,0,0,0)"
                  globeImageUrl={activeBasemap.globeImageUrl}
                  globeTileEngineUrl={(x: number, y: number, l: number) => activeBasemap.tileUrl(x, y, l)}
                  htmlElementsData={globeTextLabels}
                  htmlLat={(label: GlobeTextLabel) => label.lat}
                  htmlLng={(label: GlobeTextLabel) => label.lng}
                  htmlAltitude={(label: GlobeTextLabel) => (label.kind === "continent" ? 0.03 : 0.016)}
                  htmlElement={htmlLabelElement}
                  htmlTransitionDuration={140}
                  polygonsData={countryPolygons}
                  polygonLabel={(feature: CountryPolygonFeature) => {
                    const iso3 = countryIso3FromPolygon(feature);
                    const name = countryNameFromPolygon(feature);
                    if (!iso3) return `${name}<br/>No donation data available`;
                    const stats = countryCorridorIndex[iso3];
                    if (!stats || (stats.inbound.length === 0 && stats.outbound.length === 0 && stats.selfFlows.length === 0)) {
                      return `${name}<br/>No corridors under current globe filters`;
                    }
                    return `${name}<br/>Outbound: ${formatUsdMillions(stats.totalOutboundUsd)}<br/>Inbound: ${formatUsdMillions(stats.totalInboundUsd)}`;
                  }}
                  polygonAltitude={(feature: CountryPolygonFeature) => {
                    const iso3 = countryIso3FromPolygon(feature);
                    if (!iso3) return 0.0004;
                    if (iso3 === pinnedCountryIso3) return 0.008;
                    if (!pinnedCountryIso3 && iso3 === hoveredCountryIso3) return 0.006;
                    return 0.0006;
                  }}
                  polygonCapCurvatureResolution={1}
                  polygonCapColor={(feature: CountryPolygonFeature) => {
                    const iso3 = countryIso3FromPolygon(feature);
                    if (!iso3) return "rgba(71, 85, 105, 0.17)";
                    const hasData = Boolean(countryCorridorIndex[iso3]);
                    if (iso3 === pinnedCountryIso3) return "rgba(56, 189, 248, 0.55)";
                    if (!pinnedCountryIso3 && iso3 === hoveredCountryIso3) return "rgba(14, 165, 233, 0.4)";
                    return hasData ? "rgba(51, 65, 85, 0.24)" : "rgba(71, 85, 105, 0.15)";
                  }}
                  polygonSideColor={() => "rgba(0,0,0,0)"}
                  polygonStrokeColor={(feature: CountryPolygonFeature) => {
                    const iso3 = countryIso3FromPolygon(feature);
                    if (!iso3) return "rgba(100, 116, 139, 0.25)";
                    if (iso3 === pinnedCountryIso3) return "rgba(125, 211, 252, 0.95)";
                    if (!pinnedCountryIso3 && iso3 === hoveredCountryIso3) return "rgba(125, 211, 252, 0.85)";
                    return "rgba(100, 116, 139, 0.35)";
                  }}
                  polygonsTransitionDuration={120}
                  onPolygonHover={(feature: CountryPolygonFeature | null) => {
                    if (!feature) {
                      pointerOverPolygonRef.current = false;
                      if (pinnedCountryIso3) return;
                      scheduleHoverClear();
                      return;
                    }

                    pointerOverPolygonRef.current = true;
                    cancelHoverClear();
                    const iso3 = countryIso3FromPolygon(feature);
                    const name = countryNameFromPolygon(feature);
                    setHoveredCountryName(name);
                    if (pinnedCountryIso3) return;
                    hoveredArcRef.current = null;
                    setHoveredCountryIso3(iso3);
                  }}
                  onPolygonClick={(feature: CountryPolygonFeature | null) => {
                    if (!feature) return;
                    recentPolygonClickAtRef.current = Date.now();
                    const iso3 = countryIso3FromPolygon(feature);
                    const name = countryNameFromPolygon(feature);
                    setHoveredCountryName(name);
                    if (!iso3) {
                      setSearchMessage("No donation data available for this country.");
                      return;
                    }
                    setSearchMessage(null);
                    selectPinnedCountry(iso3, name);
                  }}
                  onGlobeClick={() => {
                    if (Date.now() - recentPolygonClickAtRef.current < 220) return;
                    if (Date.now() - recentArcClickAtRef.current < 220) return;
                    if (!lastPointerWasClickRef.current) return;

                    if (!pinnedCountryIso3) {
                      setHoveredCountryIso3(null);
                      setHoveredCountryName(null);
                      return;
                    }

                    clearCountryFocus();
                  }}
                  arcsData={arcs}
                  arcLabel={arcLabel}
                  arcStartLat={(d: ArcDatum) => d.startLat}
                  arcStartLng={(d: ArcDatum) => d.startLng}
                  arcStartAltitude={0.002}
                  arcEndLat={(d: ArcDatum) => d.endLat}
                  arcEndLng={(d: ArcDatum) => d.endLng}
                  arcEndAltitude={0.002}
                  arcColor={(d: ArcDatum) => [hexToRgba(d.color, d.opacity), hexToRgba(d.color, d.opacity * 0.45)]}
                  arcAltitude={null}
                  arcAltitudeAutoScale={0.34}
                  arcStroke={(d: ArcDatum) => d.width}
                  arcDashLength={(d: ArcDatum) => d.dashLength}
                  arcDashGap={(d: ArcDatum) => d.dashGap}
                  arcDashInitialGap={(d: ArcDatum) => d.dashInitialGap}
                  arcDashAnimateTime={(d: ArcDatum) => d.dashAnimateTime}
                  arcsTransitionDuration={120}
                  onGlobeReady={() => {
                    const globe = globeRef.current;
                    if (!globe) return;

                    const renderer = globe.renderer?.();
                    const context = renderer?.getContext?.();
                    if (!context) {
                      setGlobeError(new Error("Renderer context unavailable"));
                      return;
                    }
                    setGlobeError(null);

                    if (fullScreen) {
                      globe.pointOfView({ lat: 18, lng: 20, altitude: 0.62 }, 0);
                      setCameraAltitude(0.62);
                      setCameraCenter({ lat: 18, lng: 20 });
                    }

                    // Apply zoom constraints at globe-ready time so the cap is
                    // guaranteed even when the mount-time effect ran early.
                    applyGlobeDistanceLimits();
                    applyGlobeAutoRotate();

                    const scene = globe.scene?.();
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
                    hoveredArcRef.current = arc;
                    if (!arc) {
                      if (!pinnedCountryIso3 && !pointerOverPolygonRef.current && hoveredCountryName) {
                        scheduleHoverClear();
                      }
                      return;
                    }
                    // Country hover mode is polygon-first and must not allow
                    // arc hover interactions to take over the interaction.
                    if (mode === "hover-focus") return;
                    if (!arcSelectionEnabled) return;
                    if (arc.focusType === "overview") return;
                    setSelectedCorridor(arc.flow as FocusedCorridor);
                  }}
                  onArcClick={(arc: ArcDatum | null) => {
                    if (!arc) return;
                    recentArcClickAtRef.current = Date.now();
                    const hoveredMatch = hoveredCountryName
                      ? matchCountrySearchInput(countryOptions, hoveredCountryName)
                      : null;
                    const resolvedHoverIso3 = hoveredCountryIso3 ?? hoveredMatch?.iso3 ?? null;
                    const resolvedHoverName =
                      hoveredCountryName ??
                      (resolvedHoverIso3 ? optionByIso.get(resolvedHoverIso3)?.name ?? resolvedHoverIso3 : null);

                    if (!pinnedCountryIso3 && resolvedHoverIso3 && (mode === "hover-focus" || pointerOverPolygonRef.current)) {
                      selectPinnedCountry(resolvedHoverIso3, resolvedHoverName ?? resolvedHoverIso3);
                      if (arc.focusType !== "overview") {
                        setSelectedCorridor(arc.flow as FocusedCorridor);
                      }
                      return;
                    }

                    if (arc.focusType === "overview") return;
                    if (!arcSelectionEnabled) return;
                    setSelectedCorridor(arc.flow as FocusedCorridor);
                  }}
                />
              </GlobeErrorBoundary>
            )}
          </div>

          {!use2dFallback && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-sm rounded-xl border border-slate-600/80 bg-slate-950/85 p-3 text-xs text-slate-200">
              <p className="font-semibold text-slate-100">Legend</p>
              <p className="mt-1">Overview shows a restrained Top global corridor set. Focus mode shows only selected-country links.</p>
              <p className="mt-1">Outbound uses warm lines; inbound uses cool lines. Direction also uses line pattern and motion.</p>
            </div>
          )}

          {hoveredStats && !pinnedCountryIso3 && (
            <aside
              className="pointer-events-none absolute z-30 w-[320px] rounded-xl border border-slate-600/80 bg-slate-950/90 p-4 text-sm text-slate-100 shadow-2xl backdrop-blur"
              style={{ left: tooltipLeft, top: tooltipTop }}
            >
              <p className="text-xs uppercase tracking-[0.14em] text-sky-200">Country focus preview</p>
              <p className="mt-2 text-base font-semibold">{hoveredStats.name}</p>
              {hoveredStats.stats ? (
                <>
                  <p className="mt-2 text-slate-200">Outbound: {formatUsdMillions(hoveredStats.stats.totalOutboundUsd)}</p>
                  <p className="mt-1 text-slate-300">Inbound: {formatUsdMillions(hoveredStats.stats.totalInboundUsd)}</p>
                  <p className="mt-1 text-slate-300">Status: {netFlowStatus(hoveredStats.stats)}</p>
                  <p className="mt-1 text-slate-300">Connected countries: {formatNumber(hoveredStats.stats.connectedCountryCount)}</p>
                  <p className="mt-3 rounded-md border border-sky-400/35 bg-sky-500/10 p-2 text-xs text-sky-100">
                    Click to pin this country.
                  </p>
                </>
              ) : (
                <p className="mt-3 rounded-md border border-slate-600/70 bg-slate-900/75 p-2 text-xs text-slate-200">
                  No donation corridors found for this country under the current globe filters.
                </p>
              )}
            </aside>
          )}

          {pinnedCountryIso3 && (
            <aside className={pinnedPanelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-sky-200">Pinned country</p>
                  <p className="mt-2 text-lg font-semibold">{activeCountryName ?? pinnedCountryIso3}</p>
                  <p className="mt-1 text-xs text-slate-300">{netFlowStatus(pinnedStats)}</p>
                </div>
                <button
                  className="rounded-full border border-slate-500/70 p-1 text-slate-300 hover:border-sky-300 hover:text-sky-100"
                  onClick={clearCountryFocus}
                  aria-label="Clear country focus"
                >
                  <X size={13} />
                </button>
              </div>

              {pinnedStats && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className={`rounded-md border p-2 ${pinnedSubPanelClass}`}>
                    <p className="text-slate-300">Outbound</p>
                    <p className="mt-1 font-semibold text-slate-100">{formatUsdMillions(pinnedStats.totalOutboundUsd)}</p>
                  </div>
                  <div className={`rounded-md border p-2 ${pinnedSubPanelClass}`}>
                    <p className="text-slate-300">Inbound</p>
                    <p className="mt-1 font-semibold text-slate-100">{formatUsdMillions(pinnedStats.totalInboundUsd)}</p>
                  </div>
                  <div className={`rounded-md border p-2 ${pinnedSubPanelClass}`}>
                    <p className="text-slate-300">Net</p>
                    <p className="mt-1 font-semibold text-slate-100">{formatUsdMillions(pinnedStats.netUsd)}</p>
                  </div>
                  <div className={`rounded-md border p-2 ${pinnedSubPanelClass}`}>
                    <p className="text-slate-300">Connected</p>
                    <p className="mt-1 font-semibold text-slate-100">{formatNumber(pinnedStats.connectedCountryCount)}</p>
                  </div>
                </div>
              )}

              {pinnedHasNoFlows ? (
                <p className={`mt-3 rounded-md border p-3 text-xs text-slate-200 ${pinnedSubPanelClass}`}>
                  No donation corridors found for this country under the current filters. Try changing year, direction, or corridor limit.
                </p>
              ) : (
                <>
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Outbound corridors</p>
                    <div className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1 text-xs">
                      {pinnedResult.outbound.length ? (
                        pinnedResult.outbound.map((row) => (
                          <button
                            key={`out-${row.id}`}
                            type="button"
                            onClick={() => setSelectedCorridor(row)}
                            className={`w-full rounded border p-2 text-left transition ${
                              selectedCorridor?.id === row.id && selectedCorridor?.focusType === row.focusType
                                ? "border-amber-300/80 bg-amber-500/10"
                                : `${pinnedSubPanelClass} hover:border-slate-500`
                            }`}
                          >
                            <p className="text-slate-100">{row.donorCountry} {"->"} {row.recipientCountry}</p>
                            <p className="mt-1 text-slate-300">{formatUsdMillions(row.totalFunding, false)}</p>
                          </button>
                        ))
                      ) : (
                        <p className={`rounded border p-2 text-slate-300 ${pinnedSubPanelClass}`}>No outbound corridors in scope.</p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Inbound corridors</p>
                    <div className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1 text-xs">
                      {pinnedResult.inbound.length ? (
                        pinnedResult.inbound.map((row) => (
                          <button
                            key={`in-${row.id}`}
                            type="button"
                            onClick={() => setSelectedCorridor(row)}
                            className={`w-full rounded border p-2 text-left transition ${
                              selectedCorridor?.id === row.id && selectedCorridor?.focusType === row.focusType
                                ? "border-sky-300/80 bg-sky-500/10"
                                : `${pinnedSubPanelClass} hover:border-slate-500`
                            }`}
                          >
                            <p className="text-slate-100">{row.donorCountry} {"->"} {row.recipientCountry}</p>
                            <p className="mt-1 text-slate-300">{formatUsdMillions(row.totalFunding, false)}</p>
                          </button>
                        ))
                      ) : (
                        <p className={`rounded border p-2 text-slate-300 ${pinnedSubPanelClass}`}>No inbound corridors in scope.</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Self-flows</p>
                <div className="mt-1 max-h-24 space-y-1 overflow-y-auto pr-1 text-xs">
                  {pinnedResult.selfFlows.length ? (
                    pinnedResult.selfFlows.map((row) => (
                      <div key={`self-${row.id}`} className={`rounded border p-2 ${pinnedSubPanelClass}`}>
                        <p className="text-slate-100">Domestic flow ({row.donorCountry})</p>
                        <p className="mt-1 text-slate-300">{formatUsdMillions(row.totalFunding, false)}</p>
                      </div>
                    ))
                  ) : (
                    <p className={`rounded border p-2 text-slate-300 ${pinnedSubPanelClass}`}>
                      No self-flows in scope.
                    </p>
                  )}
                </div>
              </div>

              <div className={`mt-3 rounded-md border p-3 text-xs ${pinnedSubPanelClass}`}>
                {selectedCorridor ? (
                  <>
                    <p className="font-semibold text-slate-100">Selected corridor</p>
                    <p className="mt-1 text-slate-200">
                      {selectedCorridor.donorCountry} {"->"} {selectedCorridor.recipientCountry}
                    </p>
                    <p className="mt-1 text-slate-300">
                      Direction: {selectedCorridor.focusType === "outbound" ? "Outbound from pinned country" : "Inbound to pinned country"}
                    </p>
                    <p className="mt-1 text-slate-300">Funding: {formatUsdMillions(selectedCorridor.totalFunding, false)}</p>
                    <button
                      type="button"
                      className="mt-2 rounded-md border border-sky-400/70 bg-sky-500/15 px-2 py-1 text-xs text-sky-100 hover:border-sky-300"
                      onClick={() => onSelectFlow(toFlowFromCorridor(selectedCorridor))}
                    >
                      View detailed breakdown
                    </button>
                  </>
                ) : (
                  <p className="text-slate-300">
                    Select a corridor to inspect details and optionally open deeper dashboard breakdowns.
                  </p>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function TwoDFlowFallback({
  rows,
  reason,
  onSelectFlow
}: {
  rows: GlobeFlow[];
  reason: string;
  onSelectFlow: (flow: GlobeFlow) => void;
}) {
  const maxAmount = rows[0]?.totalFunding ?? 1;

  return (
    <div className="h-full w-full overflow-y-auto bg-gradient-to-b from-[#020611] via-[#061327] to-[#030611] p-5">
      <div className="rounded-xl border border-slate-600/80 bg-slate-950/70 p-4 text-sm text-slate-100">
        <p className="text-xs uppercase tracking-[0.14em] text-sky-200">2D fallback mode</p>
        <p className="mt-2 text-slate-300">{reason}</p>
      </div>
      <div className="mt-4 space-y-2">
        {rows.slice(0, 12).map((row) => {
          const widthPct = Math.max(5, Math.min(100, (row.totalFunding / maxAmount) * 100));
          return (
            <button
              key={`${row.donorCountry}-${row.recipientCountry}`}
              type="button"
              onClick={() => onSelectFlow(row)}
              className="w-full rounded-xl border border-slate-700/90 bg-slate-950/70 p-3 text-left hover:border-sky-300/70"
            >
              <p className="text-sm font-semibold text-slate-100">
                {row.donorCountry} {"->"} {row.recipientCountry}
              </p>
              <p className="mt-1 text-xs text-slate-300">
                {formatUsdMillions(row.totalFunding, false)} • {formatNumber(row.uniqueProjects)} projects
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-800">
                <div className="h-1.5 rounded-full bg-sky-400/80" style={{ width: `${widthPct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JudgeInsightCards({
  metrics,
  flows,
  causeRows,
  filters,
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
  flows: FlowSummaryRow[];
  causeRows: CauseSummaryRow[];
  filters: DashboardFilters;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <Loader2 className="mr-2 inline animate-spin" size={14} />
        Building insight cards...
      </section>
    );
  }

  const topFlow = flows[0];
  const topFlowShare = metrics?.totalFunding
    ? Math.round((topFlow?.totalFunding ?? 0) / metrics.totalFunding * 100)
    : 0;
  const groupedCause = new Map<string, number>();
  for (const row of causeRows) groupedCause.set(row.cause, (groupedCause.get(row.cause) ?? 0) + row.totalFunding);
  const causeSorted = Array.from(groupedCause.entries()).sort((a, b) => b[1] - a[1]);
  const topCause = causeSorted[0];
  const secondCause = causeSorted[1];
  const filterTokens = [
    filters.year ? `Year: ${filters.year}` : "Year: All years",
    filters.includeDomestic ? "Domestic: included" : "Domestic: excluded",
    filters.cause ? `Cause: ${filters.cause}` : null,
    filters.region ? `Region: ${filters.region}` : null
  ].filter(Boolean) as string[];

  return (
    <section className="mb-6 grid gap-3 md:grid-cols-3">
      <article className="rounded-2xl border border-sky-500/40 bg-sky-950/20 p-4">
        <p className="text-xs uppercase tracking-wide text-sky-200">Concentration</p>
        <p className="mt-2 text-sm text-slate-100">
          Top corridor contributes about {topFlowShare}% of selected funding.
        </p>
        <p className="mt-2 text-xs text-slate-300">
          {topFlow ? `${topFlow.donorCountry} -> ${topFlow.recipientCountry}` : "No active corridors"}
        </p>
      </article>
      <article className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4">
        <p className="text-xs uppercase tracking-wide text-emerald-200">Cause signal</p>
        <p className="mt-2 text-sm text-slate-100">
          {topCause ? `${topCause[0]} is currently the largest tagged cause.` : "No cause tags in scope."}
        </p>
        {secondCause && (
          <p className="mt-2 text-xs text-slate-300">
            {topCause?.[0]} exceeds {secondCause[0]} by {formatUsdMillions(topCause[1] - secondCause[1], false)}.
          </p>
        )}
      </article>
      <article className="rounded-2xl border border-slate-500/50 bg-slate-900/35 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-300">Current scope</p>
        <p className="mt-2 text-sm text-slate-100">
          {formatNumber(metrics?.donorCountries ?? 0)} donor countries and {formatNumber(metrics?.recipientCountries ?? 0)} recipient countries are currently in scope.
        </p>
        <p className="mt-2 text-xs text-slate-300">{filterTokens.join(" • ")}</p>
        <p className="mt-2 text-xs text-slate-400">
          Use this as your quick read on what the active filters are actually showing.
        </p>
      </article>
    </section>
  );
}

function OverviewTab({
  metrics,
  yearly,
  flows,
  causeRows,
  summaryCharts,
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
  summaryCharts?: DashboardCharts;
  loading: boolean;
}) {
  if (loading) {
    return <LoadingPanel label="Loading overview analytics" id="panel-overview" />;
  }

  const annualYearlyRows = yearly.filter((row) => !row.isAggregate && row.yearInt !== null);
  const chartYearlyRows = annualYearlyRows.length ? annualYearlyRows : yearly;
  const topDonors = summaryCharts?.topDonors?.slice(0, 5) ?? [];
  const topRecipients = summaryCharts?.topRecipients?.slice(0, 5) ?? [];
  const topSectors = summaryCharts?.topSectors?.slice(0, 5) ?? [];
  const topCorridors = flows.slice(0, 5);
  const averageFundingPerProject =
    metrics?.uniqueProjects && metrics.uniqueProjects > 0
      ? (metrics.totalFunding ?? 0) / metrics.uniqueProjects
      : 0;

  const yearlyOption = {
    grid: { top: 20, right: 16, bottom: 28, left: 56 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: chartYearlyRows.map((row) => row.yearLabel)
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
        data: chartYearlyRows.map((row) => row.totalFunding)
      }
    ]
  };

  const causeTotals = new Map<string, number>();
  for (const row of causeRows) causeTotals.set(row.cause, (causeTotals.get(row.cause) ?? 0) + row.totalFunding);
  const causeChartRows = Array.from(causeTotals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const causeOption = {
    grid: { top: 20, right: 18, bottom: 24, left: 120 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => `$${value.toLocaleString()}M` }
    },
    yAxis: {
      type: "category",
      data: causeChartRows.map((item) => item.label).reverse()
    },
    series: [
      {
        type: "bar",
        data: causeChartRows.map((item) => item.value).reverse(),
        itemStyle: { color: "#22d3ee", borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  return (
    <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-200">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6 text-slate-300">
          This view summarizes global funding volume, leading donation corridors, and distribution balance
          before deeper drilldown.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Coverage: annual years 2020-2023 plus one combined reporting period label. Graphs show annual points only; the combined period remains in tables/details. Amounts are disbursements in 2023
          constant USD.
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
          <p className="mb-3 text-sm font-semibold text-slate-100">Leading corridors (Top 5)</p>
          <div className="space-y-2">
            {topCorridors.map((row) => (
              <div key={`${row.donorCountry}-${row.recipientCountry}`} className="rounded-lg border border-slate-700/60 p-3">
                <p className="text-sm text-slate-100">
                  <CountryFlag iso2={row.donorIso2} country={row.donorCountry} className="mr-1" />
                  {row.donorCountry}
                  <span className="mx-1 text-slate-500">{"->"}</span>
                  <CountryFlag iso2={row.recipientIso2} country={row.recipientCountry} className="mr-1" />
                  {row.recipientCountry}
                </p>
                <p className="mt-1 text-xs text-slate-300">{formatUsdMillions(row.totalFunding, false)}</p>
                <CaveatBadges caveats={row.caveats} />
              </div>
            ))}
            {topCorridors.length === 0 && (
              <p className="rounded-lg border border-slate-700/60 p-3 text-xs text-slate-300">
                No corridor rows in scope.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">Donor summary (Top 5)</p>
          <div className="mt-3 space-y-2">
            {topDonors.map((row) => (
              <div key={`donor-${row.label}`} className="rounded-lg border border-slate-700/60 p-3">
                <p className="text-sm text-slate-100">{row.label}</p>
                <p className="mt-1 text-xs text-slate-300">{formatUsdMillions(row.value, false)}</p>
              </div>
            ))}
            {topDonors.length === 0 && (
              <p className="rounded-lg border border-slate-700/60 p-3 text-xs text-slate-300">
                No donor summary in scope.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">Recipient summary (Top 5)</p>
          <div className="mt-3 space-y-2">
            {topRecipients.map((row) => (
              <div key={`recipient-${row.label}`} className="rounded-lg border border-slate-700/60 p-3">
                <p className="text-sm text-slate-100">{row.label}</p>
                <p className="mt-1 text-xs text-slate-300">{formatUsdMillions(row.value, false)}</p>
              </div>
            ))}
            {topRecipients.length === 0 && (
              <p className="rounded-lg border border-slate-700/60 p-3 text-xs text-slate-300">
                No recipient summary in scope.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">Cost analysis</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-700/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Total funding</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{formatUsdMillions(metrics?.totalFunding, false)}</p>
            </div>
            <div className="rounded-lg border border-slate-700/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">Unique projects</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{formatNumber(metrics?.uniqueProjects)}</p>
            </div>
            <div className="rounded-lg border border-slate-700/60 p-3 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">Average funding per project</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{formatUsdMillions(averageFundingPerProject, false)}</p>
            </div>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-300">Top sectors by funding</p>
          <div className="mt-2 space-y-2">
            {topSectors.map((sector) => (
              <div key={`sector-${sector.label}`} className="rounded-lg border border-slate-700/60 p-3">
                <p className="text-sm text-slate-100">{sector.label}</p>
                <p className="mt-1 text-xs text-slate-300">{formatUsdMillions(sector.value, false)}</p>
              </div>
            ))}
            {topSectors.length === 0 && (
              <p className="rounded-lg border border-slate-700/60 p-3 text-xs text-slate-300">
                No sector totals in scope.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">Cause distribution</p>
          <ReactECharts option={causeOption} style={{ height: 320 }} />
        </section>
      </div>
    </section>
  );
}

function CaveatBadges({ caveats }: { caveats: CaveatTag[] }) {
  if (!caveats.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {caveats.map((caveat) => (
        <span key={caveat} className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
          {CAVEAT_LABEL[caveat]}
        </span>
      ))}
    </div>
  );
}

function SortHeader({
  label,
  active,
  direction,
  onClick
}: {
  label: string;
  active: boolean;
  direction: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-400 hover:text-slate-100"
    >
      {label}
      <ArrowUpDown size={12} className={active ? "text-sky-200" : ""} />
      {active ? <span className="text-[10px] text-sky-200">{direction}</span> : null}
    </button>
  );
}

function CountryTab({
  rows,
  loading,
  refreshing,
  page,
  pageSize,
  totalRows,
  tableQ,
  onTableQChange,
  onNext,
  onPrev,
  sortBy,
  sortDir,
  onToggleSort
}: {
  rows: CountrySummaryRow[];
  loading: boolean;
  refreshing: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  tableQ?: string;
  onTableQChange: (value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  sortBy: SortBy;
  sortDir: SortDir;
  onToggleSort: (sortBy: SortBy) => void;
}) {
  if (loading) return <LoadingPanel label="Loading country summary" id="panel-country" />;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <section id="panel-country" role="tabpanel" aria-labelledby="tab-country" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Compare how much each recipient country receives across the active filter scope.
        </p>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <label className="block text-xs uppercase tracking-wide text-slate-400">Country/flow table search</label>
        <input
          className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
          placeholder="Search recipient labels"
          value={tableQ ?? ""}
          onChange={(event) => onTableQChange(event.currentTarget.value)}
          autoComplete="off"
          aria-label="Country and flow table search"
        />
      </section>
      <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
        {refreshing && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-2 rounded-full border border-slate-600/80 bg-slate-950/90 px-3 text-xs text-slate-200 shadow-lg">
            <Loader2 size={14} className="animate-spin text-sky-200" />
            Updating
          </div>
        )}
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">
                <SortHeader
                  label="Country"
                  active={sortBy === "recipientCountry"}
                  direction={sortDir}
                  onClick={() => onToggleSort("recipientCountry")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader label="Region" active={sortBy === "region"} direction={sortDir} onClick={() => onToggleSort("region")} />
              </th>
              <th className="px-4 py-3">
                <SortHeader label="Funding" active={sortBy === "amount"} direction={sortDir} onClick={() => onToggleSort("amount")} />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Projects"
                  active={sortBy === "unique_projects"}
                  direction={sortDir}
                  onClick={() => onToggleSort("unique_projects")}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-300" colSpan={4}>
                  No country rows matched the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.country} className="border-t border-slate-800/80 text-slate-200">
                  <td className="px-4 py-3">
                    <CountryFlag iso2={row.iso2} country={row.country} className="mr-2" />
                    {row.country}
                    <CaveatBadges caveats={row.caveats} />
                  </td>
                  <td className="px-4 py-3">{row.region}</td>
                  <td className="px-4 py-3">{formatUsdMillions(row.totalFunding, false)}</td>
                  <td className="px-4 py-3">{formatNumber(row.uniqueProjects)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">
        <button className="rounded-full border border-slate-600 px-3 py-1 disabled:opacity-40" onClick={onPrev} disabled={page <= 1}>
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

function FlowTab({
  rows,
  loading,
  refreshing,
  page,
  pageSize,
  totalRows,
  tableQ,
  onTableQChange,
  onNext,
  onPrev,
  sortBy,
  sortDir,
  onToggleSort
}: {
  rows: FlowSummaryRow[];
  loading: boolean;
  refreshing: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  tableQ?: string;
  onTableQChange: (value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  sortBy: SortBy;
  sortDir: SortDir;
  onToggleSort: (sortBy: SortBy) => void;
}) {
  if (loading) return <LoadingPanel label="Loading flow corridors" id="panel-flows" />;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <section id="panel-flows" role="tabpanel" aria-labelledby="tab-flows" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Bilateral donor-country to recipient-country aggregates sorted by total donation amount.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          “Bilateral, unspecified” is used only when a recipient country is truly unspecified. Regional recipient labels keep their original names and are tagged as unspecified recipient context.
        </p>
      </section>
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <label className="block text-xs uppercase tracking-wide text-slate-400">Country/flow table search</label>
        <input
          className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
          placeholder="Search donor or recipient"
          value={tableQ ?? ""}
          onChange={(event) => onTableQChange(event.currentTarget.value)}
          autoComplete="off"
          aria-label="Country and flow table search"
        />
      </section>
      <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
        {refreshing && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-2 rounded-full border border-slate-600/80 bg-slate-950/90 px-3 text-xs text-slate-200 shadow-lg">
            <Loader2 size={14} className="animate-spin text-sky-200" />
            Updating
          </div>
        )}
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">
                <SortHeader
                  label="Corridor"
                  active={sortBy === "donorCountry" || sortBy === "recipientCountry"}
                  direction={sortDir}
                  onClick={() => onToggleSort("donorCountry")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader label="Region" active={sortBy === "region"} direction={sortDir} onClick={() => onToggleSort("region")} />
              </th>
              <th className="px-4 py-3">
                <SortHeader label="Funding" active={sortBy === "amount"} direction={sortDir} onClick={() => onToggleSort("amount")} />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Projects"
                  active={sortBy === "unique_projects"}
                  direction={sortDir}
                  onClick={() => onToggleSort("unique_projects")}
                />
              </th>
              <th className="px-4 py-3">Years</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-300" colSpan={5}>
                  No flow rows matched the current filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.donorCountry}-${row.recipientCountry}`} className="border-t border-slate-800/80 text-slate-200">
                  <td className="px-4 py-3">
                    <CountryFlag iso2={row.donorIso2} country={row.donorCountry} className="mr-1" />
                    {row.donorCountry}
                    <span className="mx-1 text-slate-500">{"->"}</span>
                    <CountryFlag iso2={row.recipientIso2} country={row.recipientCountry} className="mr-1" />
                    {row.recipientCountry}
                    <CaveatBadges caveats={row.caveats} />
                  </td>
                  <td className="px-4 py-3">{row.region}</td>
                  <td className="px-4 py-3">{formatUsdMillions(row.totalFunding, false)}</td>
                  <td className="px-4 py-3">{formatNumber(row.uniqueProjects)}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">{row.yearLabels.join(", ")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-200">
        <button className="rounded-full border border-slate-600 px-3 py-1 disabled:opacity-40" onClick={onPrev} disabled={page <= 1}>
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

function CauseTab({
  rows,
  summaryCharts,
  loading
}: {
  rows: CauseSummaryRow[];
  summaryCharts?: DashboardCharts;
  loading: boolean;
}) {
  const [selectedCause, setSelectedCause] = useState<Cause | "All">("All");
  const [topN, setTopN] = useState(10);

  useEffect(() => {
    if (selectedCause === "All") return;
    const exists = rows.some((row) => row.cause === selectedCause);
    if (!exists) setSelectedCause("All");
  }, [rows, selectedCause]);

  if (loading) return <LoadingPanel label="Loading cause analysis" id="panel-cause" />;

  const causeTotals = new Map<Cause, number>();
  for (const row of rows) causeTotals.set(row.cause, (causeTotals.get(row.cause) ?? 0) + row.totalFunding);
  const causeRows = Array.from(causeTotals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const applyTopN = (input: Array<{ label: string; value: number; uniqueProjects?: number }>) => {
    if (input.length <= topN) return input;
    const head = input.slice(0, topN);
    const tail = input.slice(topN);
    const other = tail.reduce(
      (acc, row) => ({
        label: "Other",
        value: acc.value + row.value,
        uniqueProjects: (acc.uniqueProjects ?? 0) + (row.uniqueProjects ?? 0)
      }),
      { label: "Other", value: 0, uniqueProjects: 0 }
    );
    return [...head, other];
  };

  const groupBreakdown = (
    rowsIn: Array<{ cause: Cause; label: string; value: number; uniqueProjects?: number }>
  ) => {
    const filtered = selectedCause === "All" ? rowsIn : rowsIn.filter((row) => row.cause === selectedCause);
    const grouped = new Map<string, { label: string; value: number; uniqueProjects?: number }>();
    for (const row of filtered) {
      const current = grouped.get(row.label) ?? { label: row.label, value: 0, uniqueProjects: 0 };
      grouped.set(row.label, {
        label: row.label,
        value: current.value + row.value,
        uniqueProjects: (current.uniqueProjects ?? 0) + (row.uniqueProjects ?? 0)
      });
    }
    return Array.from(grouped.values()).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  };

  const donorContinentRows = groupBreakdown(summaryCharts?.causeByDonorContinent ?? []);
  const organizationRows = applyTopN(groupBreakdown(summaryCharts?.causeByOrganization ?? []));
  const sectorRows = applyTopN(groupBreakdown(summaryCharts?.causeBySector ?? []));
  const axisCurrencyLabel = (value: number) => formatUsdMillions(value, true);

  const headlineOption = {
    grid: { top: 20, right: 20, bottom: 20, left: 130 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      axisLabel: { formatter: axisCurrencyLabel }
    },
    yAxis: {
      type: "category",
      data: causeRows.map((item) => item.label).reverse()
    },
    series: [
      {
        type: "bar",
        data: causeRows.map((item) => item.value).reverse(),
        itemStyle: { color: "#22d3ee", borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  const continentOption = {
    grid: { top: 22, right: 16, bottom: 50, left: 48 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      axisLabel: { rotate: 18 },
      data: donorContinentRows.map((item) => item.label)
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: axisCurrencyLabel }
    },
    series: [
      {
        type: "bar",
        data: donorContinentRows.map((item) => item.value),
        itemStyle: { color: "#38bdf8", borderRadius: [4, 4, 0, 0] }
      }
    ]
  };

  const organizationOption = {
    grid: { top: 20, right: 20, bottom: 16, left: 170 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      axisLabel: { formatter: axisCurrencyLabel }
    },
    yAxis: {
      type: "category",
      data: organizationRows.map((item) => item.label).reverse()
    },
    series: [
      {
        type: "bar",
        data: organizationRows.map((item) => item.value).reverse(),
        itemStyle: { color: "#34d399", borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  const sectorOption = {
    grid: { top: 20, right: 20, bottom: 16, left: 170 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      axisLabel: { formatter: axisCurrencyLabel }
    },
    yAxis: {
      type: "category",
      data: sectorRows.map((item) => item.label).reverse()
    },
    series: [
      {
        type: "bar",
        data: sectorRows.map((item) => item.value).reverse(),
        itemStyle: { color: "#a78bfa", borderRadius: [0, 4, 4, 0] }
      }
    ]
  };

  return (
    <section id="panel-cause" role="tabpanel" aria-labelledby="tab-cause" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Cause marker funding distribution for selected filters, plus deeper breakdowns by donor continent, organization, and sector.
        </p>
      </section>

      <section className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 md:grid-cols-[1.4fr_0.8fr]">
        <label className="block text-xs uppercase tracking-wide text-slate-400">
          Focus cause
          <select
            className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
            value={selectedCause}
            onChange={(event) => setSelectedCause(event.currentTarget.value as Cause | "All")}
          >
            <option value="All">All causes</option>
            {causeRows.map((row) => (
              <option key={row.label} value={row.label}>
                {row.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs uppercase tracking-wide text-slate-400">
          Top rows for organization/sector
          <select
            className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
            value={String(topN)}
            onChange={(event) => setTopN(Number(event.currentTarget.value))}
          >
            <option value="5">Top 5</option>
            <option value="10">Top 10</option>
            <option value="20">Top 20</option>
          </select>
        </label>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-100">Headline cause totals</p>
        <ReactECharts option={headlineOption} style={{ height: 300 }} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">
            Donor continent breakdown ({selectedCause === "All" ? "all causes" : selectedCause})
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Derived from donor-country corridor geography weighted by yearly cause mix.
          </p>
          {donorContinentRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-300">No donor-continent rows matched the current filters.</p>
          ) : (
            <ReactECharts option={continentOption} style={{ height: 300 }} />
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">
            Organization breakdown ({selectedCause === "All" ? "all causes" : selectedCause})
          </p>
          {organizationRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-300">No organization rows matched the current filters.</p>
          ) : (
            <ReactECharts option={organizationOption} style={{ height: 300 }} />
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">
            Sector breakdown ({selectedCause === "All" ? "all causes" : selectedCause})
          </p>
          {sectorRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-300">No sector rows matched the current filters.</p>
          ) : (
            <ReactECharts option={sectorOption} style={{ height: 320 }} />
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-100">Sector details</p>
          <div className="space-y-2">
            {sectorRows.map((row) => (
              <div key={row.label} className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-3">
                <p className="text-sm text-slate-100">{row.label}</p>
                <p className="mt-1 text-xs text-slate-300">{formatUsdMillions(row.value, false)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatNumber(row.uniqueProjects ?? 0)} projects
                </p>
              </div>
            ))}
            {sectorRows.length === 0 && (
              <p className="text-sm text-slate-300">No sector detail rows matched the current filters.</p>
            )}
          </div>
        </section>
      </div>

      <p className="rounded-xl border border-amber-700/60 bg-amber-950/40 p-3 text-xs text-amber-200">
        Note: Cause categories may overlap because a single donation can carry multiple markers.
      </p>
    </section>
  );
}

function YearlyTab({ rows, loading }: { rows: YearlySummaryRow[]; loading: boolean }) {
  if (loading) return <LoadingPanel label="Loading yearly trend" id="panel-yearly" />;
  const annualRows = rows.filter((row) => !row.isAggregate && row.yearInt !== null);
  const chartRows = annualRows.length ? annualRows : rows;

  const option = {
    grid: { top: 20, right: 16, bottom: 28, left: 56 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: chartRows.map((row) => row.yearLabel)
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
        data: chartRows.map((row) => row.totalFunding)
      }
    ]
  };

  return (
    <section id="panel-yearly" role="tabpanel" aria-labelledby="tab-yearly" className="space-y-4">
      <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">What this shows</p>
        <p className="mt-2 leading-6">
          Time-based funding and project trend. The 2020-2023 label is treated as a combined reporting period bucket.
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
                <td className="px-4 py-3">{row.isAggregate ? "Combined reporting period" : "Annual"}</td>
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
                    <p className="font-medium">{row.projectTitle ?? row.projectKey}</p>
                    <p className="text-xs text-slate-400">
                      {row.projectId ? `Project ID: ${row.projectId}` : `Project Key: ${row.projectKey}`}
                    </p>
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
        data-testid="filter-drawer"
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-slate-700 bg-slate-950 p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Filter Flows</h2>
          <button
            className="rounded-md border border-slate-700 p-1 text-slate-300"
            onClick={onClose}
            aria-label="Close flow filters"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <section className="rounded-xl border border-slate-700 bg-slate-900/45 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-300">Cross-border flows only</p>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-100">
              <input
                type="checkbox"
                checked={Boolean(filters.includeDomestic)}
                onChange={(event) => setFilters({ includeDomestic: event.currentTarget.checked })}
                aria-label="Include domestic giving"
              />
              Include domestic giving
            </label>
            <p className="mt-2 text-xs text-slate-400">
              Domestic flows are where donor and recipient are in the same country.
            </p>
          </section>

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
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">Project/Raw Row Search</span>
            <div className="flex h-10 items-center rounded-md border border-slate-700 bg-slate-900 px-2">
              <Search size={14} className="text-slate-400" />
              <input
                className="h-full flex-1 border-0 bg-transparent px-2 text-sm text-slate-200 outline-none"
                placeholder="Project title, project key, organization"
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
