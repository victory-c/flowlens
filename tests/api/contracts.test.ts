import { describe, expect, it } from "vitest";
import { dashboardFiltersSchema, projectPageQuerySchema } from "@/server/analytics/contracts";
import { canonicalFilterKey } from "@/server/analytics/query-params";

describe("dashboard query contracts", () => {
  it("applies conservative defaults", () => {
    const filters = dashboardFiltersSchema.parse({});
    expect(filters.measure).toBe("disbursement");
    expect(filters.viewMode).toBe("project");
    expect(filters.outlierOnly).toBe(false);
  });

  it("allowlists project sort fields", () => {
    expect(() => projectPageQuerySchema.parse({ sortBy: "drop table" })).toThrow();
    const parsed = projectPageQuerySchema.parse({ sortBy: "recipient", sortDir: "asc" });
    expect(parsed.sortBy).toBe("recipient");
    expect(parsed.sortDir).toBe("asc");
  });

  it("creates stable cache keys independent of query order", () => {
    const a = dashboardFiltersSchema.parse({ year: "2021", donorCountry: "United States" });
    const b = dashboardFiltersSchema.parse({ donorCountry: "United States", year: "2021" });
    expect(canonicalFilterKey(a)).toBe(canonicalFilterKey(b));
  });
});
