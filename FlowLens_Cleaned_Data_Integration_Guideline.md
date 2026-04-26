# FlowLens Cleaned Data Integration Guideline for Codex

## Purpose

Integrate the data engineering teammate's six cleaned OECD dashboard CSVs into the existing FlowLens MVP without breaking the current deployed architecture.

The current app already has a working Next.js/Vercel dashboard with server-side analytics routes, project/raw view handling, a project detail drawer, map/flow widgets, and URL-backed filters. This implementation pass should replace or augment the current raw-table analytics layer with the cleaned pre-aggregated data mart while preserving the existing UX loop.

## Non-Negotiable Product/Architecture Decisions

1. **Do not expose CSV files directly to the browser.**
   - No client-side CSV parsing.
   - No public `/data/*.csv` fetches.
   - No direct Supabase table access from browser code.

2. **Use a Backend-for-Frontend data access layer.**
   - Add a single read-only route:
     - `GET /api/v1/dashboard-data`
   - The frontend requests a `view` and optional filters.
   - The server validates the view/filter combination, queries the appropriate cleaned table, and returns JSON.

3. **Preserve the existing current-system contract where possible.**
   - The existing dashboard routes such as `/api/dashboard-summary`, `/api/projects`, `/api/filter-options`, etc. can remain as compatibility wrappers.
   - Internally, these wrappers should call the same repository used by `/api/v1/dashboard-data`.
   - Avoid a giant frontend rewrite unless necessary.

4. **Keep the original raw OECD table available for capabilities not present in the cleaned CSVs.**
   - The six cleaned CSVs do **not** contain all fields needed by the current FlowLens map/project architecture.
   - In particular, they do not include `Donor_country`, `type_of_flow`, `usd_commitment_defl`, `project_description`, `subsector`, `sdg_focus`, `channel_name`, or channel recipient fields.
   - Therefore, do not delete the existing raw-data repository until replacement clean views exist.

5. **Treat the six CSVs as an optimized analytics data mart, not as a full replacement for every raw-detail feature.**
   - Use tables `02`-`06` for fast dashboard widgets.
   - Use table `01` for project drilldowns and searches.
   - Use the existing raw table only for features not expressible from the new files, especially donor-country-to-recipient-country flow arcs.

---

## Inspected Data Files

The provided files were inspected directly. Their observed shapes and purposes are:

| File | Rows | Columns | Purpose |
|---|---:|---:|---|
| `01_df_main_dashboard.csv` | 114,718 | 14 | Valid positive-disbursement row-level records for drilldown/search |
| `02_df_country_summary.csv` | 603 | 5 | Year x Region x Recipient country summary for choropleth/country charts |
| `03_df_donor_summary.csv` | 1,817 | 5 | Year x Donor/foundation summary for donor leaderboard |
| `04_df_sector_summary.csv` | 110 | 3 | Year x Sector summary for sector distribution |
| `05_df_donor_portfolio.csv` | 4,141 | 3 | Donor x Sector summary for donor portfolio/concentration charts |
| `06_df_cause_marker.csv` | 19 | 4 | Year x Cause summary for cause-marker comparisons |

### Important totals

- `01_df_main_dashboard.csv` total `Amount_USD`: **68,237.10386159879**
- Tables `02`, `03`, `04`, and `05` all reconcile to the same total funding value.
- `06_df_cause_marker.csv` total funding is **19,916.26334988957**, but this is **not comparable to total disbursement** because cause markers overlap.
- The raw source had 116,561 rows. The cleaned main table has 114,718 rows because rows with missing or non-positive `Amount_USD` were dropped.
- The cleaned main table has 74,560 non-null unique `Project_ID` values and 3 rows with missing `Project_ID`.
- There are 3 aggregate `2020-2023` rows in the main table. Do not treat them as a normal year in a trend line.

---

## Critical Semantic Changes From Current App

### 1. `Donor` in the cleaned CSVs means organization/foundation, not donor country

The current FlowLens MVP has a `Donor country` concept from the raw field `Donor_country`.

The cleaned files use `Donor` to represent entities such as:

- `Gates Foundation`
- `BBVAMF`
- `Mastercard Foundation`
- `Lund Trust`

Therefore:

- Do **not** map cleaned `Donor` to the old `Donor_country` UI label.
- Rename UI controls backed by cleaned `Donor` to **Organization**, **Foundation**, or **Donor Organization**.
- If the current map still needs country-to-country arcs, keep using the raw table or create a new cleaned flow summary table.

### 2. Cleaned files measure disbursement only

The handoff states that the cleaned data keeps only valid actual disbursement rows and drops missing or non-positive `Amount_USD`.

Therefore:

- Disable or hide the current `Commitment` toggle for cleaned-data-backed widgets unless the raw table remains the source for commitment.
- Preferred copy:
  - `Funding shown is actual disbursement in USD millions, deflated to 2023 constant values.`
- If keeping the existing commitment toggle, route it to the legacy raw repository and clearly label the data-source difference.

### 3. Cleaned files do not fully support the existing flow map

The current FlowLens concept includes donor-country-to-recipient-country arcs. The new data mart only includes recipient geography and organization/foundation donor fields.

Recommended approach:

- **Short term:** Keep the existing flow map powered by the raw table or existing `mv_flow_summary`.
- **Add now:** Use `02_df_country_summary.csv` to power a recipient-country choropleth or recipient ranking.
- **Request from data engineering later:** `07_df_flow_summary.csv` with:
  - `Year`
  - `Donor_Country`
  - `Recipient_Country`
  - `Region`
  - `Total_Funding`
  - `Unique_Projects`
  - optionally `Flow_Type`
  - optionally `Donor` / organization

### 4. `2020-2023` must be handled as an aggregate label

Files `01`-`05` contain `Year = "2020-2023"` for a small number of aggregate rows. File `06` contains only integer years 2020-2023.

Implementation rule:

- Store `year_label TEXT`.
- Store `year_int INT NULL`.
- For `year_label = '2020-2023'`, set `year_int = NULL`.
- Exclude `2020-2023` from continuous line charts by default.
- Show it separately as `Aggregate / NDA-restricted`.

---

## Target Architecture

```text
Frontend React components
        |
        | fetch('/api/v1/dashboard-data?view=...')
        v
Next.js Route Handler: /api/v1/dashboard-data
        |
        | validate with Zod; map view -> repository method
        v
src/server/analytics/cleaned-repository.ts
        |
        | SQL against read-only cleaned tables
        v
Supabase Postgres schema analytics_clean
        |
        | tables imported from 6 CSVs
        v
Cleaned OECD data mart
```

### Required folder additions/changes

```text
data/engineered/
  01_df_main_dashboard.csv
  02_df_country_summary.csv
  03_df_donor_summary.csv
  04_df_sector_summary.csv
  05_df_donor_portfolio.csv
  06_df_cause_marker.csv

src/app/api/v1/dashboard-data/route.ts

src/server/analytics/
  repository.ts
  cleaned-repository.ts
  legacy-raw-repository.ts          # keep if existing
  filters.ts
  cleaned-view-router.ts
  cache.ts

src/shared/contracts/
  dashboard-data.ts

scripts/
  import-cleaned-csvs.ts
  validate-cleaned-import.ts
  validate-cleaned-analytics.ts

supabase/migrations/
  <timestamp>_create_analytics_clean_tables.sql
  <timestamp>_create_analytics_clean_indexes.sql
```

---

## Database Schema

Create a dedicated schema:

```sql
CREATE SCHEMA IF NOT EXISTS analytics_clean;
```

### 1. `analytics_clean.main_dashboard`

Source: `01_df_main_dashboard.csv`

Use this for detail tables, project drilldowns, keyword search, and dynamic fallback aggregations.

```sql
CREATE TABLE IF NOT EXISTS analytics_clean.main_dashboard (
  id BIGSERIAL PRIMARY KEY,
  year_label TEXT NOT NULL,
  year_int INT NULL,
  donor TEXT NOT NULL,
  region TEXT NOT NULL,
  recipient_country TEXT NOT NULL,
  sector_name TEXT NOT NULL,
  amount_usd DOUBLE PRECISION NOT NULL,
  project_title TEXT NULL,
  project_id TEXT NULL,
  project_key TEXT NOT NULL,
  is_gender BOOLEAN NOT NULL DEFAULT FALSE,
  is_climate BOOLEAN NOT NULL DEFAULT FALSE,
  is_environment BOOLEAN NOT NULL DEFAULT FALSE,
  is_biodiversity BOOLEAN NOT NULL DEFAULT FALSE,
  is_nutrition BOOLEAN NOT NULL DEFAULT FALSE,
  is_desertification BOOLEAN NOT NULL DEFAULT FALSE,
  search_text TEXT GENERATED ALWAYS AS (
    lower(
      coalesce(project_title, '') || ' ' ||
      coalesce(project_id, '') || ' ' ||
      coalesce(donor, '') || ' ' ||
      coalesce(region, '') || ' ' ||
      coalesce(recipient_country, '') || ' ' ||
      coalesce(sector_name, '')
    )
  ) STORED
);
```

Important import rule:

```text
project_key = COALESCE(Project_ID, 'missing-project-' || row_number)
```

### 2. `analytics_clean.country_summary`

Source: `02_df_country_summary.csv`

```sql
CREATE TABLE IF NOT EXISTS analytics_clean.country_summary (
  id BIGSERIAL PRIMARY KEY,
  year_label TEXT NOT NULL,
  year_int INT NULL,
  region TEXT NOT NULL,
  recipient_country TEXT NOT NULL,
  total_funding DOUBLE PRECISION NOT NULL,
  unique_projects INT NOT NULL
);
```

### 3. `analytics_clean.donor_summary`

Source: `03_df_donor_summary.csv`

```sql
CREATE TABLE IF NOT EXISTS analytics_clean.donor_summary (
  id BIGSERIAL PRIMARY KEY,
  year_label TEXT NOT NULL,
  year_int INT NULL,
  donor TEXT NOT NULL,
  total_funding DOUBLE PRECISION NOT NULL,
  unique_projects INT NOT NULL,
  recipient_countries_count INT NOT NULL
);
```

### 4. `analytics_clean.sector_summary`

Source: `04_df_sector_summary.csv`

```sql
CREATE TABLE IF NOT EXISTS analytics_clean.sector_summary (
  id BIGSERIAL PRIMARY KEY,
  year_label TEXT NOT NULL,
  year_int INT NULL,
  sector_name TEXT NOT NULL,
  total_funding DOUBLE PRECISION NOT NULL
);
```

### 5. `analytics_clean.donor_portfolio`

Source: `05_df_donor_portfolio.csv`

```sql
CREATE TABLE IF NOT EXISTS analytics_clean.donor_portfolio (
  id BIGSERIAL PRIMARY KEY,
  donor TEXT NOT NULL,
  sector_name TEXT NOT NULL,
  total_funding DOUBLE PRECISION NOT NULL
);
```

Important limitation:

- This table has **no Year column**.
- If the user selects a year, do not pretend this table is year-filtered.
- Either:
  1. hide/grey out donor portfolio year filtering, or
  2. compute donor portfolio from `main_dashboard` dynamically for the selected year, or
  3. request a `donor_portfolio_by_year` table from data engineering.

### 6. `analytics_clean.cause_marker`

Source: `06_df_cause_marker.csv`

```sql
CREATE TABLE IF NOT EXISTS analytics_clean.cause_marker (
  id BIGSERIAL PRIMARY KEY,
  year_label TEXT NOT NULL,
  year_int INT NOT NULL,
  total_funding DOUBLE PRECISION NOT NULL,
  unique_projects INT NOT NULL,
  cause TEXT NOT NULL
);
```

Important limitation:

- This table supports Year and Cause filtering.
- It does **not** support Donor, Region, Country, or Sector filtering.
- If dashboard global filters include Donor/Country/Sector, either:
  1. show the cause-marker chart as "Global thematic comparison for selected year only", or
  2. compute cause funding dynamically from `main_dashboard`.

---

## Indexes

Add indexes for all filterable columns.

```sql
CREATE INDEX IF NOT EXISTS idx_clean_main_year ON analytics_clean.main_dashboard(year_label);
CREATE INDEX IF NOT EXISTS idx_clean_main_year_int ON analytics_clean.main_dashboard(year_int);
CREATE INDEX IF NOT EXISTS idx_clean_main_donor ON analytics_clean.main_dashboard(donor);
CREATE INDEX IF NOT EXISTS idx_clean_main_region ON analytics_clean.main_dashboard(region);
CREATE INDEX IF NOT EXISTS idx_clean_main_recipient ON analytics_clean.main_dashboard(recipient_country);
CREATE INDEX IF NOT EXISTS idx_clean_main_sector ON analytics_clean.main_dashboard(sector_name);
CREATE INDEX IF NOT EXISTS idx_clean_main_project_key ON analytics_clean.main_dashboard(project_key);
CREATE INDEX IF NOT EXISTS idx_clean_main_project_id ON analytics_clean.main_dashboard(project_id);
CREATE INDEX IF NOT EXISTS idx_clean_main_amount ON analytics_clean.main_dashboard(amount_usd DESC);

CREATE INDEX IF NOT EXISTS idx_clean_country_year ON analytics_clean.country_summary(year_label);
CREATE INDEX IF NOT EXISTS idx_clean_country_region ON analytics_clean.country_summary(region);
CREATE INDEX IF NOT EXISTS idx_clean_country_recipient ON analytics_clean.country_summary(recipient_country);

CREATE INDEX IF NOT EXISTS idx_clean_donor_year ON analytics_clean.donor_summary(year_label);
CREATE INDEX IF NOT EXISTS idx_clean_donor_donor ON analytics_clean.donor_summary(donor);

CREATE INDEX IF NOT EXISTS idx_clean_sector_year ON analytics_clean.sector_summary(year_label);
CREATE INDEX IF NOT EXISTS idx_clean_sector_sector ON analytics_clean.sector_summary(sector_name);

CREATE INDEX IF NOT EXISTS idx_clean_portfolio_donor ON analytics_clean.donor_portfolio(donor);
CREATE INDEX IF NOT EXISTS idx_clean_portfolio_sector ON analytics_clean.donor_portfolio(sector_name);

CREATE INDEX IF NOT EXISTS idx_clean_cause_year ON analytics_clean.cause_marker(year_label);
CREATE INDEX IF NOT EXISTS idx_clean_cause_cause ON analytics_clean.cause_marker(cause);
```

Optional keyword search:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_clean_main_search_trgm
ON analytics_clean.main_dashboard
USING gin (search_text gin_trgm_ops);
```

---

## Import Script Requirements

Create:

```text
scripts/import-cleaned-csvs.ts
```

Responsibilities:

1. Read all six CSVs from `data/engineered`.
2. Normalize headers from CSV names to DB names:
   - `Year` -> `year_label`
   - `Donor` -> `donor`
   - `Region` -> `region`
   - `Recipient_Country` -> `recipient_country`
   - `Sector_Name` -> `sector_name`
   - `Amount_USD` -> `amount_usd`
   - `Project_Title` -> `project_title`
   - `Project_ID` -> `project_id`
   - `Total_Funding` -> `total_funding`
   - `Unique_Projects` -> `unique_projects`
   - `Recipient_Countries_Count` -> `recipient_countries_count`
   - Boolean flags remain boolean.
3. Coerce `Year` into:
   - `year_label = String(Year)`
   - `year_int = /^\d{4}$/.test(year_label) ? Number(year_label) : null`
4. Generate `project_key`.
5. Load into `analytics_clean.*` tables inside a transaction.
6. Truncate existing cleaned tables before reload.
7. Log row counts and totals after import.
8. Never import these CSVs through Vercel serverless functions.

Suggested script command:

```bash
pnpm import:cleaned-data
pnpm validate:cleaned-import
pnpm validate:cleaned-analytics
```

Add to `package.json`:

```json
{
  "scripts": {
    "import:cleaned-data": "tsx scripts/import-cleaned-csvs.ts",
    "validate:cleaned-import": "tsx scripts/validate-cleaned-import.ts",
    "validate:cleaned-analytics": "tsx scripts/validate-cleaned-analytics.ts"
  }
}
```

---

## Validation Scripts

### `validate-cleaned-import.ts`

Assert these exact values:

```text
main_dashboard row count = 114,718
country_summary row count = 603
donor_summary row count = 1,817
sector_summary row count = 110
donor_portfolio row count = 4,141
cause_marker row count = 19

main_dashboard amount_usd sum = 68,237.10386159879
country_summary total_funding sum = 68,237.10386159878
donor_summary total_funding sum = 68,237.10386159879
sector_summary total_funding sum = 68,237.10386159875
donor_portfolio total_funding sum = 68,237.10386159879

main_dashboard missing project_id rows = 3
main_dashboard non-null unique project_id count = 74,560
```

Use tolerance for floating point checks:

```ts
const EPSILON = 0.001;
```

### `validate-cleaned-analytics.ts`

Assert:

1. `02_country_summary` reconciles with grouping `01_main_dashboard` by:
   - `year_label`
   - `region`
   - `recipient_country`

2. `03_donor_summary` reconciles with grouping `01_main_dashboard` by:
   - `year_label`
   - `donor`

3. `04_sector_summary` reconciles with grouping `01_main_dashboard` by:
   - `year_label`
   - `sector_name`

4. `05_donor_portfolio` reconciles with grouping `01_main_dashboard` by:
   - `donor`
   - `sector_name`

5. `06_cause_marker` is **not** expected to reconcile to total disbursement because cause flags overlap.

6. `2020-2023` exists in `main_dashboard`, `country_summary`, `donor_summary`, `sector_summary`, and `donor_portfolio` indirectly through donor/sector totals, but not in `cause_marker`.

---

## API Contract

### Endpoint

```http
GET /api/v1/dashboard-data
```

### Query parameters

| Param | Required | Description |
|---|---:|---|
| `view` | yes | Which cleaned view to return |
| `year` | no | `2020`, `2021`, `2022`, `2023`, or `2020-2023` |
| `donor` | no | Organization/foundation donor |
| `region` | no | Recipient macro/region label |
| `recipientCountry` | no | Recipient country/region label |
| `sector` | no | Sector name |
| `cause` | no | Cause marker label |
| `q` | no | Keyword search for project detail rows |
| `page` | no | For paginated row/detail views |
| `pageSize` | no | Default 25; max 100 |
| `sortBy` | no | Allowlisted only |
| `sortDir` | no | `asc` or `desc` |

### Supported views

```ts
const DashboardView = z.enum([
  "dashboard_summary",
  "main_dashboard",
  "country_summary",
  "donor_summary",
  "sector_summary",
  "donor_portfolio",
  "cause_marker",
  "project_detail",
  "filter_options"
]);
```

### View-to-table mapping

| View | Table | Use |
|---|---|---|
| `dashboard_summary` | mixed | KPI cards, top charts, filters, insights |
| `main_dashboard` | `analytics_clean.main_dashboard` | paginated project/drilldown table |
| `country_summary` | `analytics_clean.country_summary` | choropleth/country ranking |
| `donor_summary` | `analytics_clean.donor_summary` | donor leaderboard |
| `sector_summary` | `analytics_clean.sector_summary` | sector chart |
| `donor_portfolio` | `analytics_clean.donor_portfolio` | donor-sector portfolio chart |
| `cause_marker` | `analytics_clean.cause_marker` | cause-marker comparison |
| `project_detail` | `analytics_clean.main_dashboard` | raw rows under selected project key |
| `filter_options` | mixed | dropdown values and counts |

### Do not build SQL by string interpolation

Use an explicit allowlist:

```ts
const VIEW_CONFIG = {
  country_summary: {
    table: "analytics_clean.country_summary",
    filters: ["year", "region", "recipientCountry"],
    sort: ["total_funding", "unique_projects", "recipient_country"]
  },
  donor_summary: {
    table: "analytics_clean.donor_summary",
    filters: ["year", "donor"],
    sort: ["total_funding", "unique_projects", "recipient_countries_count", "donor"]
  },
  sector_summary: {
    table: "analytics_clean.sector_summary",
    filters: ["year", "sector"],
    sort: ["total_funding", "sector_name"]
  },
  donor_portfolio: {
    table: "analytics_clean.donor_portfolio",
    filters: ["donor", "sector"],
    sort: ["total_funding", "donor", "sector_name"]
  },
  cause_marker: {
    table: "analytics_clean.cause_marker",
    filters: ["year", "cause"],
    sort: ["total_funding", "unique_projects", "cause"]
  }
} as const;
```

For unsupported filter combinations, return one of:

```json
{
  "warning": {
    "code": "FILTER_NOT_SUPPORTED_FOR_VIEW",
    "message": "donor_portfolio does not support year filtering. Showing all-year donor portfolio."
  }
}
```

or compute dynamically from `main_dashboard`.

---

## Recommended Repository Interface

Create or update:

```text
src/server/analytics/repository.ts
```

```ts
export interface AnalyticsRepository {
  getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummaryResponse>;
  getCleanedView(params: DashboardDataRequest): Promise<DashboardDataResponse>;
  getProjectPage(params: ProjectPageRequest): Promise<ProjectPageResponse>;
  getProjectDetail(projectKey: string, filters: DashboardFilters): Promise<ProjectDetailResponse>;
  getFilterOptions(filters: DashboardFilters): Promise<FilterOptionsResponse>;
}
```

Create:

```text
src/server/analytics/cleaned-repository.ts
```

Responsibilities:

- Query `analytics_clean.*` tables.
- Prefer pre-aggregated tables for default charts.
- Use `main_dashboard` for paginated details and filter combinations unsupported by summary tables.
- Return warnings when a summary table cannot respect a global filter.
- Preserve response shapes expected by existing frontend components.

Keep:

```text
src/server/analytics/legacy-raw-repository.ts
```

Use it only for:

- donor-country flow arcs
- commitment mode
- project descriptions
- channel/subsector/SDG fields
- any current feature not covered by cleaned tables

---

## Dashboard Summary Behavior

`GET /api/v1/dashboard-data?view=dashboard_summary`

Should return one object:

```ts
type DashboardSummaryResponse = {
  dataVersion: string;
  amountUnit: "USD_MILLIONS_2023";
  source: "cleaned_data_mart";
  filtersApplied: DashboardFilters;
  warnings: DashboardWarning[];

  kpis: {
    totalFunding: number;
    validFinancialRows: number;
    uniqueProjects: number;
    donors: number;
    recipients: number;
    regions: number;
    sectors: number;
  };

  insights: InsightCard[];

  charts: {
    yearlyFunding: Array<{ yearLabel: string; totalFunding: number; isAggregate: boolean }>;
    topRecipients: Array<{ recipientCountry: string; region: string; totalFunding: number; uniqueProjects: number }>;
    topDonors: Array<{ donor: string; totalFunding: number; uniqueProjects: number; recipientCountriesCount: number }>;
    topSectors: Array<{ sectorName: string; totalFunding: number }>;
    causeMarkers: Array<{ yearLabel: string; cause: string; totalFunding: number; uniqueProjects: number }>;
  };

  filterOptions: {
    years: Array<{ value: string; label: string; isAggregate: boolean }>;
    donors: Array<{ value: string; label: string; count?: number }>;
    regions: Array<{ value: string; label: string; count?: number }>;
    recipientCountries: Array<{ value: string; label: string; count?: number }>;
    sectors: Array<{ value: string; label: string; count?: number }>;
    causes: Array<{ value: string; label: string }>;
  };
};
```

### Dashboard summary computation rules

1. For total funding:
   - Use `main_dashboard` if multiple filters are applied.
   - Use `sector_summary` or `country_summary` for unfiltered/Year-only cases.

2. For yearly trend:
   - Use `sector_summary` grouped by `year_label`, or `main_dashboard` when filters require donor/country/sector dynamic computation.
   - Exclude or separately label `2020-2023`.

3. For top recipients:
   - Use `country_summary` if filters are year/region/country only.
   - Use `main_dashboard` if donor or sector filter is selected.

4. For top donors:
   - Use `donor_summary` if filters are year/donor only.
   - Use `main_dashboard` if country, region, or sector filter is selected.

5. For top sectors:
   - Use `sector_summary` if filters are year/sector only.
   - Use `main_dashboard` if donor/country/region filter is selected.

6. For cause markers:
   - Use `cause_marker` for year-only/global cause comparison.
   - If donor/country/sector is selected, either compute from `main_dashboard` boolean flags or return a warning that cause markers are not cross-filtered except by year.
   - Preferred: compute dynamically from `main_dashboard` for selected filters.

---

## Frontend Integration Plan

### 1. Rename confusing labels

Update filter labels:

| Current label | New label if backed by cleaned CSV |
|---|---|
| Donor country | Donor organization / Foundation |
| Total disbursement | Total funding / Disbursement |
| Raw rows | Valid financial rows |
| Project View | Project grouping view |

If the old donor-country flow map stays, keep its old label only for that component.

### 2. Add or update widgets powered by cleaned data

Use these mappings:

| Widget | Preferred Source |
|---|---|
| KPI cards | `dashboard_summary` |
| Recipient choropleth / top recipient chart | `country_summary` |
| Top donor organizations | `donor_summary` |
| Sector breakdown | `sector_summary` |
| Donor portfolio concentration | `donor_portfolio` |
| Cause marker comparison | `cause_marker` or dynamic from `main_dashboard` |
| Project table | `main_dashboard` |
| Project detail drawer | `main_dashboard` grouped by `project_key` |
| Existing donor-country flow map | legacy raw repository until `07_flow_summary` exists |

### 3. New widget: Cause Marker Comparison

Add a card/chart showing cause markers:

- Gender
- Climate
- Environment
- Biodiversity
- Nutrition
- Desertification

Use copy:

```text
Cause categories overlap. Do not add these bars together as total funding.
```

Preferred visual:

- grouped bar by year and cause, or
- small multiples by cause.

### 4. New widget: Donor Portfolio

Add a chart to show donor concentration by sector.

MVP options:

1. If a single donor is selected:
   - show that donor's sector allocation as a horizontal bar chart.
2. If no donor is selected:
   - show top donor-sector pairs by amount.
3. If a year is selected:
   - show warning that this portfolio is all-year unless dynamically computed from `main_dashboard`.

### 5. Project Inspector updates

Use `main_dashboard` fields:

```text
Project_ID
Project_Title
Year
Donor
Region
Recipient_Country
Sector_Name
Amount_USD
Cause flags
```

If `Project_ID` is missing:

- Use generated `project_key`.
- Display badge: `Aggregate / missing project ID`.

Project detail drawer should show:

- selected project key
- project ID
- title
- donor organization
- recipient country/region
- years covered
- total amount
- sector breakdown
- cause flags detected across raw rows
- raw cleaned rows under this project

---

## Compatibility With Current FlowLens MVP

### Keep current features

Do not remove:

- project/raw toggle
- detail drawer
- URL-backed filter state
- active filter chips
- reset button
- existing flow map unless replacing with a reliable equivalent

### Modify current features

1. **KPI card raw row count**
   - Current dashboard may show 116,561 raw rows.
   - Cleaned data has 114,718 valid financial rows.
   - New copy:
     - `Valid funding rows: 114,718`
     - optionally `Source rows before cleaning: 116,561`

2. **Commitment toggle**
   - Cleaned data has no commitment.
   - Either hide it or keep it only on legacy raw-backed views.
   - Do not show commitment values from cleaned tables.

3. **Donor filter**
   - Split into:
     - `Donor organization` from cleaned CSVs
     - `Donor country` from legacy raw source if map remains

4. **Flow Explorer**
   - If using cleaned data only, convert it from arc map to recipient choropleth + country ranking.
   - If preserving current arc map, keep legacy raw source for `/api/flows`.

---

## API Route Implementation Notes

Create:

```text
src/app/api/v1/dashboard-data/route.ts
```

Pseudo-code:

```ts
import { NextRequest, NextResponse } from "next/server";
import { DashboardDataRequestSchema } from "@/shared/contracts/dashboard-data";
import { cleanedRepository } from "@/server/analytics/cleaned-repository";
import { getCached } from "@/server/analytics/cache";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = DashboardDataRequestSchema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "BAD_REQUEST", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const request = parsed.data;
  const cacheKey = `dashboard-data:${stableStringify(request)}`;

  const result = await getCached(cacheKey, 60 * 60 * 24, () => {
    return cleanedRepository.getCleanedView(request);
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800"
    }
  });
}
```

Need:

- Zod validation.
- Stable cache key.
- No unrestricted dynamic table name.
- Allowlisted sort fields only.
- Page-size maximum.
- Consistent error payload.

---

## Caching Strategy

Because the OECD dataset updates infrequently, use aggressive caching.

Minimum:

```http
Cache-Control: public, s-maxage=86400, stale-while-revalidate=604800
```

Apply to:

- `dashboard_summary`
- `country_summary`
- `donor_summary`
- `sector_summary`
- `donor_portfolio`
- `cause_marker`
- `filter_options`

Use shorter or no cache for:

- project search with `q`
- paginated detail views
- legacy raw flow endpoints if expensive and still changing

Include `dataVersion` in every response:

```ts
const DATA_VERSION = "cleaned-oecd-2026-04-26-v1";
```

---

## CORS / Safety

Since this API is served by the same Next.js app, CORS may not be needed for normal browser use. Still implement origin checks if the endpoint may be called cross-origin.

Rules:

- Only allow `GET`.
- Deny unsupported origins in production if `Origin` is present.
- Never accept arbitrary SQL/table names from query params.
- Never expose database credentials.
- Use a read-only database user if available.
- Rate-limit public requests if the app starts receiving traffic.

---

## Tests

### Unit tests

Test:

- `Year` parsing:
  - `2020` -> `{ yearLabel: "2020", yearInt: 2020 }`
  - `2020-2023` -> `{ yearLabel: "2020-2023", yearInt: null }`
- View allowlist rejects unknown view.
- Unsupported filter returns warning or dynamic fallback.
- Cause marker response includes overlap warning.
- Donor portfolio ignores or warns about year filter if not dynamically computed.
- Pagination limit caps at 100.
- Sort fields are allowlisted.

### API tests

Test requests:

```bash
GET /api/v1/dashboard-data?view=dashboard_summary
GET /api/v1/dashboard-data?view=country_summary&year=2022
GET /api/v1/dashboard-data?view=donor_summary&year=2023
GET /api/v1/dashboard-data?view=sector_summary&year=2021
GET /api/v1/dashboard-data?view=donor_portfolio&donor=Gates%20Foundation
GET /api/v1/dashboard-data?view=cause_marker&year=2023
GET /api/v1/dashboard-data?view=main_dashboard&donor=Gates%20Foundation&recipientCountry=Afghanistan&page=1&pageSize=25
```

Expected:

- HTTP 200.
- JSON schema matches contract.
- No CSV file contents are exposed directly.
- Warnings appear for known limitations.
- Amounts are numbers, not formatted strings.

### Playwright smoke path

1. Load dashboard.
2. Select donor organization `Gates Foundation`.
3. Select recipient country `Afghanistan`.
4. Select sector `Health`.
5. Confirm KPI/cards/table update.
6. Open a project detail drawer.
7. Confirm raw cleaned rows display under the project.
8. Open cause marker chart and verify overlap disclaimer.
9. Reset filters.
10. Confirm dashboard returns to unfiltered state.

---

## Implementation Sequence for Codex

### Phase 1: Data mart import

1. Add the six CSVs under `data/engineered/`.
2. Add Supabase migration for `analytics_clean`.
3. Add cleaned tables and indexes.
4. Implement `scripts/import-cleaned-csvs.ts`.
5. Run import locally/staging.
6. Run validation scripts until all counts/totals match.

Do not touch frontend until this phase passes.

### Phase 2: Repository and contracts

1. Create `src/shared/contracts/dashboard-data.ts`.
2. Implement Zod request/response schemas.
3. Create `cleaned-repository.ts`.
4. Implement `getCleanedView`.
5. Implement `getDashboardSummary`.
6. Add warnings for limitations:
   - overlapping cause markers
   - donor portfolio not year-aware
   - cleaned data is disbursement-only
   - donor means organization, not country

### Phase 3: API route

1. Add `/api/v1/dashboard-data`.
2. Add cache headers.
3. Add strict validation.
4. Add tests for all views.
5. Add compatibility wrappers from old API routes if needed.

### Phase 4: Frontend

1. Switch KPI cards and top charts to `dashboard_summary`.
2. Rename donor filter to donor organization if it uses cleaned source.
3. Update row count label to valid funding rows.
4. Add cause-marker chart with overlap warning.
5. Add donor portfolio chart.
6. Keep existing flow map on legacy raw repository unless clean flow summary exists.
7. Update project inspector to use `main_dashboard`.

### Phase 5: QA and demo

1. Run validation scripts.
2. Run API tests.
3. Run Playwright smoke path.
4. Verify deployed dashboard does not fetch CSV files directly.
5. Verify all data-source limitations are visible through copy/tooltips.
6. Verify judge demo path still works.

---

## Acceptance Criteria

The implementation is complete when:

1. The six cleaned CSVs are imported into `analytics_clean` tables.
2. Validation scripts pass exact row-count and funding-total checks.
3. `/api/v1/dashboard-data` supports all required views.
4. Frontend widgets are powered by cleaned summary views where possible.
5. Project drilldown uses `main_dashboard`, not browser CSV parsing.
6. Cause marker chart includes overlap warning.
7. Donor portfolio chart is added or existing donor chart is upgraded.
8. Commitment toggle is hidden, disabled, or clearly marked as legacy raw-backed.
9. Existing flow map is not broken; if cleaned data cannot power it, it remains on legacy raw flow source.
10. No frontend code imports, fetches, or parses CSV files directly.
11. All public API queries are validated, cached, and read-only.
12. The dashboard still supports the core demo:
    - filter by donor/foundation
    - filter by recipient
    - filter by sector/year
    - inspect project evidence
    - reset filters

---

## Recommended Additional Data Request to Teammate

Ask the data engineering teammate for a seventh optional view to fully replace the legacy flow map:

```text
07_df_flow_summary.csv
```

Suggested schema:

```text
Year
Donor_Country
Donor
Region
Recipient_Country
Flow_Type
Total_Funding
Unique_Projects
Exact_Geo_Flag
Recipient_Geo_Type
```

Without this file, the cleaned data mart can power summaries and project inspection, but not the full country-to-country arc map.

---

## Final Instruction to Codex

Implement this as a **safe data-source migration**, not a dashboard rewrite.

Priority order:

1. Import cleaned data correctly.
2. Add validated single BFF endpoint.
3. Preserve current app compatibility.
4. Switch summary widgets to cleaned tables.
5. Add cause and donor-portfolio functionality.
6. Preserve legacy raw source for features the cleaned CSVs cannot support.
7. Do not break the judge demo path.
