import { describe, expect, it } from "vitest";
import { boundedPercent } from "@/features/dashboard/insight-utils";

describe("dashboard insight helpers", () => {
  it("clamps concentration percentages to the valid range", () => {
    expect(boundedPercent(150, 100)).toBe(100);
    expect(boundedPercent(25, 100)).toBe(25);
  });

  it("returns zero for empty, invalid, or negative funding scopes", () => {
    expect(boundedPercent(25, 0)).toBe(0);
    expect(boundedPercent(25, null)).toBe(0);
    expect(boundedPercent(-5, 100)).toBe(0);
  });
});
