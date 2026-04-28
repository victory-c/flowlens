import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardFiltersSchema } from "@/shared/contracts/dashboard-data";
import { normalizeCountryLabel } from "@/server/analytics/country-normalization";

const { queryMock, getCountryMetadataMapMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getCountryMetadataMapMock: vi.fn()
}));

vi.mock("@/server/analytics/db", () => ({
  query: queryMock
}));

vi.mock("@/server/analytics/cache", () => ({
  cached: async <T>(_key: string, _ttlMs: number, load: () => Promise<T>) => load()
}));

vi.mock("@/server/analytics/country-metadata", async () => {
  const actual = await vi.importActual<typeof import("@/server/analytics/country-metadata")>(
    "@/server/analytics/country-metadata"
  );
  return {
    ...actual,
    getCountryMetadataMap: getCountryMetadataMapMock
  };
});

import { CleanedAnalyticsRepository } from "@/server/analytics/cleaned-repository";
import type { CountryMeta } from "@/shared/contracts/dashboard-data";

function countryMeta(country: string, iso2: string, iso3: string, latitude: number, longitude: number): CountryMeta {
  return {
    country,
    displayName: country,
    iso2,
    iso3,
    latitude,
    longitude,
    mapped: true
  };
}

function metadataMap() {
  const map = new Map<string, CountryMeta>();
  const entries: CountryMeta[] = [
    countryMeta("United States", "US", "USA", 38, -97),
    countryMeta("India", "IN", "IND", 21, 78),
    countryMeta("Kenya", "KE", "KEN", 1, 38)
  ];

  for (const entry of entries) {
    map.set(normalizeCountryLabel(entry.country), entry);
  }

  return map;
}

describe("cleaned repository globe flow response semantics", () => {
  beforeEach(() => {
    queryMock.mockReset();
    getCountryMetadataMapMock.mockReset();
    getCountryMetadataMapMock.mockResolvedValue(metadataMap());
  });

  it("returns the full mapped aggregated corridor set without truncation", async () => {
    queryMock.mockResolvedValueOnce([
      {
        donor_country: "United States",
        recipient_country: "India",
        region: "Asia",
        total_funding: 120,
        unique_projects: 12,
        year_labels: ["2023", "2022"],
        flow_types: ["Cross-border"],
        exact_geo: true,
        recipient_geo_type: "exact_country"
      },
      {
        donor_country: "India",
        recipient_country: "Kenya",
        region: "Africa",
        total_funding: 90,
        unique_projects: 7,
        year_labels: ["2023"],
        flow_types: ["Cross-border"],
        exact_geo: true,
        recipient_geo_type: "exact_country"
      },
      {
        donor_country: "Atlantis",
        recipient_country: "Kenya",
        region: "Africa",
        total_funding: 88,
        unique_projects: 2,
        year_labels: ["2023"],
        flow_types: ["Cross-border"],
        exact_geo: true,
        recipient_geo_type: "exact_country"
      }
    ]);

    const repository = new CleanedAnalyticsRepository();
    const filters = dashboardFiltersSchema.parse({});
    const result = await repository.getGlobeFlows(filters);

    expect(result.rows).toHaveLength(2);
    expect(result.totalRows).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.rows.map((row) => `${row.donorIso3}->${row.recipientIso3}`)).toEqual(["USA->IND", "IND->KEN"]);
  });

  it("returns unsupported filter metadata as informational scope", async () => {
    queryMock.mockResolvedValueOnce([
      {
        donor_country: "United States",
        recipient_country: "India",
        region: "Asia",
        total_funding: 50,
        unique_projects: 5,
        year_labels: ["2023"],
        flow_types: ["Cross-border"],
        exact_geo: true,
        recipient_geo_type: "exact_country"
      }
    ]);

    const repository = new CleanedAnalyticsRepository();
    const filters = dashboardFiltersSchema.parse({
      cause: "Climate",
      organization: "Example Org",
      tableQ: "india",
      q: "water",
      sector: "Health",
      outlierOnly: true
    });

    const result = await repository.getGlobeFlows(filters);

    expect(result.unsupportedFilters).toEqual(
      expect.arrayContaining(["cause", "organization", "tableQ", "q", "sector", "outlierOnly"])
    );
    expect(result.truncated).toBe(false);
  });
});
