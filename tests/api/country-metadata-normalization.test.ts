import { describe, expect, it } from "vitest";
import { normalizeCountryLabel } from "@/server/analytics/country-normalization";

describe("country metadata normalization aliases", () => {
  it("normalizes United States variants", () => {
    expect(normalizeCountryLabel("USA")).toBe("united states");
    expect(normalizeCountryLabel("U.S.")).toBe("united states");
    expect(normalizeCountryLabel("United States of America")).toBe("united states");
  });

  it("normalizes Cote d'Ivoire variants", () => {
    expect(normalizeCountryLabel("Côte d’Ivoire")).toBe("cote d ivoire");
    expect(normalizeCountryLabel("Ivory Coast")).toBe("cote d ivoire");
  });

  it("normalizes Turkiye variants", () => {
    expect(normalizeCountryLabel("Turkey")).toBe("turkiye");
    expect(normalizeCountryLabel("Türkiye")).toBe("turkiye");
  });

  it("normalizes Congo variants", () => {
    expect(normalizeCountryLabel("DR Congo")).toBe("democratic republic of the congo");
    expect(normalizeCountryLabel("Congo-Kinshasa")).toBe("democratic republic of the congo");
    expect(normalizeCountryLabel("Congo-Brazzaville")).toBe("republic of the congo");
  });
});
