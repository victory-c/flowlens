// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { query } from "@/server/analytics/db";

describe("embedded analytics database", () => {
  it("serves the cleaned mart unless postgres is opted into", async () => {
    vi.stubEnv("FLOWLENS_DATA_SOURCE", "");

    const [main] = await query<{ rows: number; with_donor_country: number }>(
      `SELECT count(*)::int AS rows, count(donor_country)::int AS with_donor_country
       FROM analytics_clean.main_dashboard`
    );
    const [flow] = await query<{ rows: number; years: string[] }>(
      `SELECT count(*)::int AS rows, array_agg(DISTINCT year_label) AS years
       FROM analytics_clean.flow_summary`
    );

    expect(main.rows).toBeGreaterThan(100_000);
    expect(main.with_donor_country).toBeGreaterThan(0);
    expect(flow.rows).toBeGreaterThan(1_000);
    expect(flow.years).toEqual(expect.arrayContaining(["2020", "2023"]));

    vi.unstubAllEnvs();
  }, 30_000);
});
