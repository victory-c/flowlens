import type { GlobeFlow } from "@/shared/contracts/dashboard-data";

export type GlobeFocusMode = "overview" | "hover-focus" | "pinned-focus";
export type GlobeDirection = "inbound" | "outbound" | "both";
export type CorridorLimit = 5 | 10 | 25 | 50 | "all";
export type FocusType = "overview" | "inbound" | "outbound";

export type NormalizedCorridor = {
  id: string;
  donorIso2: string | null;
  donorIso3: string;
  donorCountry: string;
  donorLat: number;
  donorLng: number;
  recipientIso2: string | null;
  recipientIso3: string;
  recipientCountry: string;
  recipientLat: number;
  recipientLng: number;
  region: string;
  flowType: string;
  yearLabels: string[];
  totalFunding: number;
  uniqueProjects: number;
  isSelfFlow: boolean;
};

export type FocusedCorridor = NormalizedCorridor & {
  focusType: FocusType;
};

export type CountryCorridorStats = {
  iso3: string;
  label: string;
  inbound: NormalizedCorridor[];
  outbound: NormalizedCorridor[];
  selfFlows: NormalizedCorridor[];
  totalInboundUsd: number;
  totalOutboundUsd: number;
  netUsd: number;
  connectedCountryCount: number;
};

export type CountryCorridorIndex = Record<string, CountryCorridorStats>;

export type CountryOption = {
  iso3: string;
  name: string;
};

export type CountryPolygonFeature = {
  type: "Feature";
  properties?: {
    NAME?: string;
    ADMIN?: string;
    ISO_A3?: string;
    ADM0_A3?: string;
    [key: string]: unknown;
  };
  geometry?: {
    type: string;
    coordinates: unknown;
  };
};

export type CountryPolygonCollection = {
  type: "FeatureCollection";
  features?: CountryPolygonFeature[];
};

export function canonicalIso3(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized) || normalized === "-99") return null;
  return normalized;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasValidCoordinates(corridor: Pick<NormalizedCorridor, "donorLat" | "donorLng" | "recipientLat" | "recipientLng">) {
  return (
    finite(corridor.donorLat) &&
    finite(corridor.donorLng) &&
    finite(corridor.recipientLat) &&
    finite(corridor.recipientLng)
  );
}

export function normalizeCorridors(rows: GlobeFlow[]): NormalizedCorridor[] {
  const normalized: NormalizedCorridor[] = [];

  for (const row of rows) {
    const donorIso3 = canonicalIso3(row.donorIso3);
    const recipientIso3 = canonicalIso3(row.recipientIso3);

    if (!donorIso3 || !recipientIso3) continue;
    if (
      !finite(row.donorLat) ||
      !finite(row.donorLng) ||
      !finite(row.recipientLat) ||
      !finite(row.recipientLng)
    ) {
      continue;
    }

    normalized.push({
      id: `${donorIso3}->${recipientIso3}`,
      donorIso2: row.donorIso2,
      donorIso3,
      donorCountry: row.donorCountry,
      donorLat: row.donorLat,
      donorLng: row.donorLng,
      recipientIso2: row.recipientIso2,
      recipientIso3,
      recipientCountry: row.recipientCountry,
      recipientLat: row.recipientLat,
      recipientLng: row.recipientLng,
      region: row.region,
      flowType: row.flowType,
      yearLabels: row.yearLabels,
      totalFunding: row.totalFunding,
      uniqueProjects: row.uniqueProjects,
      isSelfFlow: donorIso3 === recipientIso3
    });
  }

  return normalized;
}

function emptyStats(iso3: string): CountryCorridorStats {
  return {
    iso3,
    label: iso3,
    inbound: [],
    outbound: [],
    selfFlows: [],
    totalInboundUsd: 0,
    totalOutboundUsd: 0,
    netUsd: 0,
    connectedCountryCount: 0
  };
}

function ensureStats(index: CountryCorridorIndex, iso3: string) {
  if (!index[iso3]) index[iso3] = emptyStats(iso3);
  return index[iso3];
}

export function buildCountryCorridorIndex(corridors: NormalizedCorridor[]): CountryCorridorIndex {
  const index: CountryCorridorIndex = {};
  const labelByIso = new Map<string, string>();

  for (const corridor of corridors) {
    const donor = ensureStats(index, corridor.donorIso3);
    const recipient = ensureStats(index, corridor.recipientIso3);

    if (!labelByIso.has(corridor.donorIso3)) {
      labelByIso.set(corridor.donorIso3, corridor.donorCountry);
    }
    if (!labelByIso.has(corridor.recipientIso3)) {
      labelByIso.set(corridor.recipientIso3, corridor.recipientCountry);
    }

    if (corridor.isSelfFlow) {
      donor.selfFlows.push(corridor);
      continue;
    }

    donor.outbound.push(corridor);
    recipient.inbound.push(corridor);
    donor.totalOutboundUsd += corridor.totalFunding;
    recipient.totalInboundUsd += corridor.totalFunding;
  }

  for (const [iso3, stats] of Object.entries(index)) {
    stats.inbound.sort((a, b) => b.totalFunding - a.totalFunding);
    stats.outbound.sort((a, b) => b.totalFunding - a.totalFunding);
    stats.selfFlows.sort((a, b) => b.totalFunding - a.totalFunding);
    stats.netUsd = stats.totalOutboundUsd - stats.totalInboundUsd;
    stats.label = labelByIso.get(iso3) ?? stats.label;

    const connected = new Set<string>();
    for (const row of stats.inbound) connected.add(row.donorIso3);
    for (const row of stats.outbound) connected.add(row.recipientIso3);
    connected.delete(iso3);
    stats.connectedCountryCount = connected.size;
  }

  return index;
}

function limitRows<T>(rows: T[], limit: CorridorLimit) {
  if (limit === "all") return rows;
  return rows.slice(0, limit);
}

export function getFocusedCorridors(
  index: CountryCorridorIndex,
  activeIso3: string | null,
  options: {
    direction: GlobeDirection;
    corridorLimit: CorridorLimit;
  }
) {
  if (!activeIso3) {
    return {
      visible: [] as FocusedCorridor[],
      inbound: [] as FocusedCorridor[],
      outbound: [] as FocusedCorridor[],
      selfFlows: [] as NormalizedCorridor[],
      stats: null as CountryCorridorStats | null
    };
  }

  const stats = index[activeIso3] ?? null;
  if (!stats) {
    return {
      visible: [] as FocusedCorridor[],
      inbound: [] as FocusedCorridor[],
      outbound: [] as FocusedCorridor[],
      selfFlows: [] as NormalizedCorridor[],
      stats: null as CountryCorridorStats | null
    };
  }

  const limitedInbound = limitRows(stats.inbound, options.corridorLimit).map((row) => ({
    ...row,
    focusType: "inbound" as const
  }));

  const limitedOutbound = limitRows(stats.outbound, options.corridorLimit).map((row) => ({
    ...row,
    focusType: "outbound" as const
  }));

  const visible =
    options.direction === "inbound"
      ? limitedInbound
      : options.direction === "outbound"
        ? limitedOutbound
        : [...limitedInbound, ...limitedOutbound];

  return {
    visible,
    inbound: limitedInbound,
    outbound: limitedOutbound,
    selfFlows: stats.selfFlows,
    stats
  };
}

export function getOverviewCorridors(corridors: NormalizedCorridor[], limit: number) {
  return corridors
    .filter((row) => !row.isSelfFlow)
    .sort((a, b) => b.totalFunding - a.totalFunding)
    .slice(0, Math.max(1, limit));
}

export function countryIso3FromPolygon(feature: CountryPolygonFeature) {
  const candidates = [
    feature.properties?.ISO_A3,
    feature.properties?.ADM0_A3,
    feature.properties?.["WB_A3"] as string | undefined,
    feature.properties?.["SU_A3"] as string | undefined
  ];

  for (const value of candidates) {
    const iso3 = canonicalIso3(value);
    if (iso3) return iso3;
  }

  return null;
}

export function countryNameFromPolygon(feature: CountryPolygonFeature) {
  return String(feature.properties?.NAME ?? feature.properties?.ADMIN ?? "Unknown");
}

export function buildCountryOptions(
  polygons: CountryPolygonFeature[],
  index: CountryCorridorIndex
): CountryOption[] {
  const options = new Map<string, CountryOption>();

  for (const feature of polygons) {
    const iso3 = countryIso3FromPolygon(feature);
    if (!iso3) continue;
    options.set(iso3, {
      iso3,
      name: countryNameFromPolygon(feature)
    });
  }

  for (const [iso3, stats] of Object.entries(index)) {
    if (!options.has(iso3)) {
      options.set(iso3, { iso3, name: stats.label });
    }
  }

  return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function matchCountrySearchInput(options: CountryOption[], input: string) {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return null;

  const byIso = options.find((option) => option.iso3.toLowerCase() === normalized);
  if (byIso) return byIso;

  const byNameExact = options.find((option) => option.name.toLowerCase() === normalized);
  if (byNameExact) return byNameExact;

  return options.find((option) => option.name.toLowerCase().includes(normalized)) ?? null;
}
