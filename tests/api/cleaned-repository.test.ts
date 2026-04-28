import { describe, expect, it } from "vitest";
import { dashboardFiltersSchema } from "@/shared/contracts/dashboard-data";
import {
  buildFlowFilteredCte,
  normalizeRecipientCountryLabel,
  normalizeRegionLabel,
  recipientCaveats,
  recipientGeoTypeFromLabel,
  regionFilterValues
} from "@/server/analytics/cleaned-flow-utils";

describe("cleaned repository filter and caveat behavior", () => {
  it("excludes domestic flows by default", () => {
    const filters = dashboardFiltersSchema.parse({});
    const { cte } = buildFlowFilteredCte(filters, { organizationFilterActive: false });
    expect(cte).toContain("flow_type <> 'Domestic'");
  });

  it("includes domestic flows when includeDomestic=true", () => {
    const filters = dashboardFiltersSchema.parse({ includeDomestic: true });
    const { cte } = buildFlowFilteredCte(filters, { organizationFilterActive: false });
    expect(cte).not.toContain("flow_type <> 'Domestic'");
  });

  it("assigns caveat tags for unspecified and combined-period rows", () => {
    const caveats = recipientCaveats("Bilateral, unspecified", {
      hasAggregateYear: true,
      flowType: "Cross-border"
    });
    expect(caveats).toContain("unspecified_recipient");
    expect(caveats).toContain("multi_year_aggregate");
  });

  it("assigns domestic caveat for domestic flow rows", () => {
    const caveats = recipientCaveats("India", { flowType: "Domestic" });
    expect(caveats).toContain("domestic_flow");
  });

  it("maps regional recipient labels to unspecified recipient behavior", () => {
    expect(normalizeRecipientCountryLabel("Sub-Saharan Africa, regional")).toBe("Sub-Saharan Africa, regional");
    expect(recipientGeoTypeFromLabel("Sub-Saharan Africa, regional")).toBe("unspecified");
    expect(recipientCaveats("Sub-Saharan Africa, regional")).toEqual(["unspecified_recipient"]);
    expect(recipientCaveats("Sub-Saharan Africa, regional")).not.toContain("regional_aggregate");
  });

  it("keeps true unspecified aliases mapped to Bilateral, unspecified", () => {
    expect(normalizeRecipientCountryLabel("Global or unspecified")).toBe("Bilateral, unspecified");
    expect(normalizeRecipientCountryLabel("Bilateral, unspecified")).toBe("Bilateral, unspecified");
  });

  it("normalizes region labels to English canonicals", () => {
    expect(normalizeRegionLabel("América")).toBe("Americas");
    expect(normalizeRegionLabel("Europa")).toBe("Europe");
    expect(normalizeRegionLabel("Moyen Orient")).toBe("Middle East");
  });

  it("matches region filter variants for canonical region names", () => {
    const variants = regionFilterValues("Americas");
    expect(variants).toContain("Americas");
    expect(variants).toContain("America");
    expect(variants).toContain("América");
  });

  it("uses array-based region filtering for normalized names", () => {
    const filters = dashboardFiltersSchema.parse({ region: "Americas" });
    const { cte, params } = buildFlowFilteredCte(filters, { organizationFilterActive: false });
    expect(cte).toContain("region = ANY($1::text[])");
    expect(Array.isArray(params[0])).toBe(true);
    expect(params[0]).toEqual(expect.arrayContaining(["Americas", "America"]));
  });
});
