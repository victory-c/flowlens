import { describe, expect, it } from "vitest";
import type { GlobeFlow } from "@/shared/contracts/dashboard-data";
import {
  buildCountryCorridorIndex,
  buildCountryOptions,
  countryIso3FromPolygon,
  getFocusedCorridors,
  getOverviewCorridors,
  normalizeCorridors
} from "@/features/dashboard/globe-country-focus";

function flow(partial: Partial<GlobeFlow> & Pick<GlobeFlow, "donorCountry" | "recipientCountry">): GlobeFlow {
  const donorIso3 = "donorIso3" in partial ? partial.donorIso3 ?? null : "USA";
  const recipientIso3 = "recipientIso3" in partial ? partial.recipientIso3 ?? null : "IND";
  const donorLat = "donorLat" in partial ? partial.donorLat ?? null : 38;
  const donorLng = "donorLng" in partial ? partial.donorLng ?? null : -97;
  const recipientLat = "recipientLat" in partial ? partial.recipientLat ?? null : 21;
  const recipientLng = "recipientLng" in partial ? partial.recipientLng ?? null : 78;

  return {
    donorCountry: partial.donorCountry,
    recipientCountry: partial.recipientCountry,
    region: partial.region ?? "Test",
    yearLabels: partial.yearLabels ?? ["2023"],
    flowType: partial.flowType ?? "Cross-border",
    totalFunding: partial.totalFunding ?? 1,
    uniqueProjects: partial.uniqueProjects ?? 1,
    donorIso2: partial.donorIso2 ?? "US",
    donorIso3,
    donorLat,
    donorLng,
    recipientIso2: partial.recipientIso2 ?? "IN",
    recipientIso3,
    recipientLat,
    recipientLng,
    recipientGeoType: partial.recipientGeoType ?? "exact_country",
    exactGeo: partial.exactGeo ?? true
  };
}

describe("globe country focus helpers", () => {
  it("normalizes and filters rows to valid ISO3 + coordinate corridors", () => {
    const rows: GlobeFlow[] = [
      flow({ donorCountry: "United States", recipientCountry: "India", totalFunding: 120 }),
      flow({ donorCountry: "Unknown", recipientCountry: "India", donorIso3: null }),
      flow({ donorCountry: "Canada", recipientCountry: "Kenya", donorIso3: "CAN", recipientIso3: "KEN", donorLat: null }),
      flow({ donorCountry: "China", recipientCountry: "China", donorIso3: "CHN", recipientIso3: "CHN", totalFunding: 55 })
    ];

    const normalized = normalizeCorridors(rows);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]?.isSelfFlow).toBe(false);
    expect(normalized[1]?.isSelfFlow).toBe(true);
  });

  it("builds inbound/outbound/self index with totals and connections", () => {
    const normalized = normalizeCorridors([
      flow({ donorCountry: "United States", donorIso3: "USA", recipientCountry: "India", recipientIso3: "IND", totalFunding: 100 }),
      flow({ donorCountry: "Canada", donorIso3: "CAN", recipientCountry: "India", recipientIso3: "IND", totalFunding: 40 }),
      flow({ donorCountry: "India", donorIso3: "IND", recipientCountry: "Kenya", recipientIso3: "KEN", totalFunding: 60 }),
      flow({ donorCountry: "India", donorIso3: "IND", recipientCountry: "India", recipientIso3: "IND", totalFunding: 30 })
    ]);

    const index = buildCountryCorridorIndex(normalized);
    const india = index.IND;
    expect(india).toBeTruthy();
    expect(india?.inbound).toHaveLength(2);
    expect(india?.outbound).toHaveLength(1);
    expect(india?.selfFlows).toHaveLength(1);
    expect(india?.totalInboundUsd).toBe(140);
    expect(india?.totalOutboundUsd).toBe(60);
    expect(india?.connectedCountryCount).toBe(3);
  });

  it("derives focused corridors with direction and limit controls", () => {
    const inboundIso = ["AAA", "AAB", "AAC", "AAD", "AAE", "AAF", "AAG", "AAH", "AAI", "AAJ", "AAK", "AAL"];
    const outboundIso = ["BAA", "BAB", "BAC", "BAD", "BAE", "BAF", "BAG", "BAH", "BAI", "BAJ", "BAK", "BAL"];

    const normalized = normalizeCorridors([
      ...inboundIso.map((iso, idx) =>
        flow({
          donorCountry: `Inbound ${idx + 1}`,
          donorIso3: iso,
          recipientCountry: "India",
          recipientIso3: "IND",
          totalFunding: 200 - idx
        })
      ),
      ...outboundIso.map((iso, idx) =>
        flow({
          donorCountry: "India",
          donorIso3: "IND",
          recipientCountry: `Outbound ${idx + 1}`,
          recipientIso3: iso,
          totalFunding: 190 - idx
        })
      )
    ]);

    const index = buildCountryCorridorIndex(normalized);

    const inboundOnly = getFocusedCorridors(index, "IND", { direction: "inbound", corridorLimit: 10 });
    expect(inboundOnly.visible).toHaveLength(10);
    expect(inboundOnly.visible.every((row) => row.focusType === "inbound")).toBe(true);

    const outboundTopOne = getFocusedCorridors(index, "IND", { direction: "outbound", corridorLimit: 10 });
    expect(outboundTopOne.visible).toHaveLength(10);

    const bothLimited = getFocusedCorridors(index, "IND", { direction: "both", corridorLimit: 10 });
    expect(bothLimited.visible).toHaveLength(20);
    expect(bothLimited.inbound).toHaveLength(10);
    expect(bothLimited.outbound).toHaveLength(10);
  });

  it("keeps overview corridors restrained and excludes self-flows", () => {
    const normalized = normalizeCorridors([
      flow({ donorCountry: "China", donorIso3: "CHN", recipientCountry: "China", recipientIso3: "CHN", totalFunding: 999 }),
      flow({ donorCountry: "United States", donorIso3: "USA", recipientCountry: "India", recipientIso3: "IND", totalFunding: 120 }),
      flow({ donorCountry: "Canada", donorIso3: "CAN", recipientCountry: "Kenya", recipientIso3: "KEN", totalFunding: 80 }),
      flow({ donorCountry: "Spain", donorIso3: "ESP", recipientCountry: "Peru", recipientIso3: "PER", totalFunding: 60 })
    ]);

    const overview = getOverviewCorridors(normalized, 2);
    expect(overview).toHaveLength(2);
    expect(overview.some((row) => row.isSelfFlow)).toBe(false);
    expect(overview[0]?.totalFunding).toBeGreaterThanOrEqual(overview[1]?.totalFunding ?? 0);
  });

  it("falls back to ADM0_A3 when ISO_A3 is invalid and keeps country options", () => {
    const francePolygon = {
      type: "Feature" as const,
      properties: {
        NAME: "France",
        ISO_A3: "-99",
        ADM0_A3: "FRA"
      },
      geometry: {
        type: "Polygon",
        coordinates: []
      }
    };

    expect(countryIso3FromPolygon(francePolygon)).toBe("FRA");

    const options = buildCountryOptions([francePolygon], {});
    expect(options).toContainEqual({ iso3: "FRA", name: "France" });
  });
});
