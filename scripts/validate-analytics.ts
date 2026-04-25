import { assertEqual, assertNear, createPool } from "./common";

async function main() {
  const pool = createPool();
  try {
    const { rows: [quality] } = await pool.query(`
      SELECT
        count(*)::int AS raw_row_count,
        count(DISTINCT project_key)::int AS project_count,
        count(*) FILTER (WHERE is_regional_or_unspecified)::int AS regional_rows,
        coalesce(sum(usd_disbursements_defl), 0)::float AS total_disbursement
      FROM analytics.raw_oecd_philanthropy
    `);

    assertEqual("analytics raw row count", quality.raw_row_count, 116_561);
    assertEqual("analytics project key count", quality.project_count, 74_882);
    assertEqual("regional/unspecified rows", quality.regional_rows, 27_531);
    assertNear("analytics disbursement total", quality.total_disbursement, 68_237.104);

    const { rows: [mixed] } = await pool.query(`
      SELECT count(*)::int AS mixed_project_keys
      FROM (
        SELECT project_key
        FROM analytics.raw_oecd_philanthropy
        GROUP BY project_key
        HAVING count(DISTINCT country) > 1
           OR count(DISTINCT organization_name) > 1
           OR count(DISTINCT year) > 1
           OR count(DISTINCT grant_recipient_project_title) > 1
      ) flagged
    `);
    if (mixed.mixed_project_keys <= 0) {
      throw new Error("Expected mixed project_key groups to be detected.");
    }
    console.log(`ok: mixed project_key groups detected = ${mixed.mixed_project_keys}`);

    const { rows: [flow] } = await pool.query(`
      SELECT
        count(*) FILTER (WHERE recipient.geo_type = 'exact_country')::int AS exact_country_rows,
        count(*) FILTER (WHERE recipient.geo_type IN ('regional', 'unspecified'))::int AS regional_rows,
        count(*) FILTER (WHERE recipient.geo_type IS NULL OR recipient.geo_type = 'unmapped')::int AS unmapped_rows
      FROM analytics.raw_oecd_philanthropy raw
      LEFT JOIN analytics.geo_lookup recipient ON lower(recipient.raw_label) = lower(raw.country)
    `);
    if (flow.exact_country_rows <= 0) throw new Error("Expected exact country geo mappings.");
    if (flow.regional_rows <= 0) throw new Error("Expected regional/unspecified geo mappings.");
    console.log(
      `ok: geo coverage exact=${flow.exact_country_rows} regional=${flow.regional_rows} unmapped=${flow.unmapped_rows}`
    );

    const { rows: [projectScope] } = await pool.query(`
      WITH one_project AS (
        SELECT project_key
        FROM analytics.raw_oecd_philanthropy
        WHERE sector_description IS NOT NULL
        GROUP BY project_key
        HAVING count(DISTINCT sector_description) > 1
        LIMIT 1
      )
      SELECT
        coalesce(sum(raw.usd_disbursements_defl), 0)::float AS project_total,
        coalesce(sum(raw.usd_disbursements_defl) FILTER (
          WHERE raw.sector_description = min_sector.sector_description
        ), 0)::float AS selected_scope
      FROM analytics.raw_oecd_philanthropy raw
      JOIN one_project USING (project_key)
      JOIN LATERAL (
        SELECT sector_description
        FROM analytics.raw_oecd_philanthropy
        WHERE project_key = one_project.project_key
        GROUP BY sector_description
        ORDER BY count(*) DESC
        LIMIT 1
      ) min_sector ON true
    `);
    if (projectScope.project_total < projectScope.selected_scope) {
      throw new Error("Selected scope amount cannot exceed project total amount.");
    }
    console.log("ok: selected-scope vs project-total amount semantics validated");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
