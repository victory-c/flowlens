import { describe, expect, it } from "vitest";

import {
  dashboardFiltersSchema,
  projectPageQuerySchema
} from "../../src/server/analytics/contracts";
import { canonicalFilterKey, parseFilters } from "../../src/server/analytics/query-params";

describe("analytics query contracts", () => {
  it("defaults dashboard filters to the MVP-safe view", () => {
    const filters = dashboardFiltersSchema.parse({});

    expect(filters.measure).toBe("disbursement");
    expect(filters.viewMode).toBe("project");
    expect(filters.outlierOnly).toBe(false);
  });

  it("coerces project pagination and sorting params", () => {
    const query = projectPageQuerySchema.parse({
      measure: "commitment",
      viewMode: "raw",
      page: "2",
      pageSize: "50",
      sortBy: "year",
      sortDir: "asc"
    });

    expect(query).toMatchObject({
      measure: "commitment",
      viewMode: "raw",
      page: 2,
      pageSize: 50,
      sortBy: "year",
      sortDir: "asc"
    });
  });

  it("drops blank optional string filters while keeping populated filters", () => {
    const filters = parseFilters(
      new URLSearchParams({
        donorCountry: "   ",
        year: "2021",
        sector: "Health"
      })
    );

    expect(filters.donorCountry).toBeUndefined();
    expect(filters.year).toBe("2021");
    expect(filters.sector).toBe("Health");
  });

  it("generates stable cache keys regardless of filter object order", () => {
    const first = dashboardFiltersSchema.parse({
      year: "2022",
      sector: "Health",
      donorCountry: "United States"
    });
    const second = dashboardFiltersSchema.parse({
      donorCountry: "United States",
      sector: "Health",
      year: "2022"
    });

    expect(canonicalFilterKey(first)).toBe(canonicalFilterKey(second));
  });
});
