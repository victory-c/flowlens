import { describe, expect, it } from "vitest";

import { dashboardFiltersSchema, projectPageQuerySchema } from "../../src/server/analytics/contracts";
import { buildFilteredCte, selectedMeasureColumn, sortSql } from "../../src/server/analytics/sql";

describe("analytics SQL builder scaffolding", () => {
  it("uses the selected measure requested by filters", () => {
    expect(selectedMeasureColumn(dashboardFiltersSchema.parse({}))).toBe("disbursement_value");
    expect(selectedMeasureColumn(dashboardFiltersSchema.parse({ measure: "commitment" }))).toBe(
      "commitment_value"
    );
  });

  it("parameterizes user-controlled filters and keyword search", () => {
    const filters = dashboardFiltersSchema.parse({
      donorCountry: "United States",
      year: "2021",
      sector: "Health",
      keyword: "vaccines"
    });

    const { cte, params } = buildFilteredCte(filters);

    expect(params).toEqual(["United States", "2021", "Health", "%vaccines%"]);
    expect(cte).toContain("donor_country = $1");
    expect(cte).toContain("year = $2");
    expect(cte).toContain("sector_description = $3");
    expect(cte).toContain("lower(coalesce(project_description, '')) LIKE $4");
    expect(cte).not.toContain("United States");
    expect(cte).not.toContain("vaccines");
  });

  it("keeps project-page sorting constrained to known columns", () => {
    const query = projectPageQuerySchema.parse({
      sortBy: "recipient",
      sortDir: "asc"
    });

    expect(sortSql(query)).toBe("recipient_country ASC NULLS LAST, project_key ASC");
  });
});
