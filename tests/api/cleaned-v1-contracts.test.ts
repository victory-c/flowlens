import { describe, expect, it } from "vitest";
import {
  dashboardDataRequestSchema,
  dashboardFiltersSchema,
  dashboardViewSchema
} from "@/shared/contracts/dashboard-data";
import { canonicalCleanedKey, parseDashboardDataRequest } from "@/server/analytics/cleaned-query-params";

describe("cleaned v1 dashboard contracts", () => {
  it("supports the globe-first view set", () => {
    const views = dashboardViewSchema.options;
    expect(views).toContain("globe_flows");
    expect(views).toContain("overview_metrics");
    expect(views).toContain("raw_table");
    expect(views).toContain("project_detail");
  });

  it("applies safe defaults for filters and pagination", () => {
    const parsed = dashboardDataRequestSchema.parse({ view: "overview_metrics" });
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.sortBy).toBe("amount");
    expect(parsed.sortDir).toBe("desc");
    expect(parsed.viewMode).toBe("project");
    expect(parsed.includeDomestic).toBe(false);
    expect(parsed.outlierOnly).toBe(false);
  });

  it("maps compatibility aliases when parsing query params", () => {
    const parsed = parseDashboardDataRequest(
      new URLSearchParams({
        view: "raw_table",
        donor: "Gates Foundation",
        recipient: "Kenya",
        amountMin: "0.25",
        table_q: "ethiopia",
        include_domestic: "true",
        keyword: "health"
      })
    );

    expect(parsed.organization).toBe("Gates Foundation");
    expect(parsed.recipientCountry).toBe("Kenya");
    expect(parsed.minAmount).toBe(0.25);
    expect(parsed.tableQ).toBe("ethiopia");
    expect(parsed.includeDomestic).toBe(true);
    expect(parsed.q).toBe("health");
  });

  it("keeps includeDomestic false when query params explicitly set false", () => {
    const canonical = parseDashboardDataRequest(
      new URLSearchParams({
        view: "overview_metrics",
        includeDomestic: "false"
      })
    );

    const alias = parseDashboardDataRequest(
      new URLSearchParams({
        view: "overview_metrics",
        include_domestic: "false"
      })
    );

    expect(canonical.includeDomestic).toBe(false);
    expect(alias.includeDomestic).toBe(false);
  });

  it("keeps canonical cache keys stable regardless of property order", () => {
    const a = dashboardFiltersSchema.parse({ year: "2021", organization: "Acme", region: "Africa" });
    const b = dashboardFiltersSchema.parse({ region: "Africa", year: "2021", organization: "Acme" });
    expect(canonicalCleanedKey(a)).toBe(canonicalCleanedKey(b));
  });

  it("rejects invalid view names", () => {
    expect(() => parseDashboardDataRequest(new URLSearchParams({ view: "drop table" }))).toThrow();
  });
});
