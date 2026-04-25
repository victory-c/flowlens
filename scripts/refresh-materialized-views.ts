import { createPool } from "./common";

const VIEWS = [
  "analytics.mv_project_summary",
  "analytics.mv_flow_summary",
  "analytics.mv_year_sector_summary",
  "analytics.mv_country_summary",
  "analytics.mv_org_summary"
];

async function main() {
  const pool = createPool();
  try {
    for (const view of VIEWS) {
      console.log(`Refreshing ${view}...`);
      await pool.query(`REFRESH MATERIALIZED VIEW ${view}`);
    }
    console.log("Materialized views refreshed.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
