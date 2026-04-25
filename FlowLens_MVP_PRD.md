# PRD: FlowLens MVP — Philanthropic Capital Intelligence Dashboard

**Project:** OECD Philanthropic Funding Analytics Dashboard  
**Feature Set:** MVP dashboard using the current raw database, designed to scale into cleaned/normalized data marts later  
**Owner:** Product / Data Analytics Team  
**Version:** MVP v1.0  
**Status:** Implementation-ready  
**Target Users:** Competition judges, researchers, policy analysts, philanthropy analysts, nonprofit strategy teams  
**Core Thesis:** Help users trace where philanthropic money comes from, where it goes, what it funds, and which projects deserve closer investigation.

---

## 1. Executive Summary

FlowLens is an interactive analytics dashboard for exploring philanthropic funding flows in the OECD foundation dataset. The MVP should feel like an investigative product rather than a static collection of charts. Users should be able to start from a global overview, select a donor-recipient route, narrow by year, amount, sector, organization, or keyword, and inspect the exact project records behind the aggregated funding flow.

The MVP must work directly on the current raw dataset/table without waiting for the data engineering team to finish a fully normalized pipeline. At the same time, the architecture should isolate raw-data logic behind a query/service layer so that future cleaned tables, normalized dimensions, or materialized views can replace the raw table with minimal frontend rewrites.

The product should be built around one primary experience:

> **Trace philanthropic capital from donor to destination, then drill down into the projects, sectors, organizations, and abnormal flows behind it.**

The MVP should include the following core modules:

1. **Global Overview** — high-level KPIs, top donors, top recipients, sector distribution, and yearly trend.
2. **Flow Explorer** — map-based donor-recipient flow exploration with layered filtering.
3. **Project Inspector** — searchable project/row table with a detail drawer.
4. **Insight Cards** — precomputed observations that help judges quickly understand what stands out.
5. **Raw-Ready Data Layer** — a practical implementation path that queries the current raw table now and can later scale to curated tables.

---

## 2. Product Goals

### 2.1 Primary Goals

The MVP should allow users to:

1. Understand the global funding landscape within 10 seconds.
2. Trace funding flows from donor countries to recipient countries or regions.
3. Narrow the dataset from all records to a specific project batch in 5–7 filter interactions.
4. Inspect the exact project-level evidence behind every chart or map flow.
5. Avoid misleading analysis caused by double-counting multi-sector rows.
6. Distinguish exact country-level records from regional or unspecified recipient records.
7. Use the dashboard on the current raw database while preserving a clear migration path to cleaned data marts.

### 2.2 Business / Competition Goals

The dashboard should convince judges that the team:

1. Understands the dataset structure and limitations.
2. Built a usable interactive analytics product, not just charts.
3. Can translate raw data into actionable insights.
4. Handles data-quality problems transparently.
5. Designed an implementation that is both practical for the time limit and scalable for future engineering work.

---

## 3. Non-Goals for MVP

The MVP should **not** attempt to solve everything. The following are intentionally out of scope unless all must-have functionality is complete:

1. Full machine-learning anomaly detection.
2. Natural-language query interface.
3. User authentication or saved user accounts.
4. Complex role-based permissions.
5. Full ETL normalization before launch.
6. Perfect geocoding for every regional/unspecified recipient.
7. Automated narrative report generation.
8. Real-time streaming updates.
9. Editing or writing back to the database.
10. Full Tableau/PowerBI parity.

---

## 4. Dataset Context and Constraints

### 4.1 Current Dataset Shape

The current raw dataset contains approximately:

- **116,561 rows**
- **32 columns**
- **74,879 non-null unique `row_id` values**
- **3 rows with missing `row_id`**
- **14,876 project IDs appearing in multiple rows**
- Years represented: `2020`, `2021`, `2022`, `2023`, and a very small `2020-2023` aggregate category

Important implication:

> The dataset is sector-row based, not strictly one-row-per-project. `row_id` should be treated as the closest available project/donation key. Some projects appear in multiple rows because they are associated with multiple sectors, subsectors, or classifications.

### 4.2 Current Raw Table Assumption

For implementation, assume the current database has one raw table equivalent to the CSV:

```sql
raw_oecd_philanthropy
```

If the actual table name differs, map it in the backend config. The frontend should never directly depend on the physical table name.

### 4.3 Important Raw Columns

| Product Concept | Raw Column(s) |
|---|---|
| Year | `year` |
| Funding organization | `organization_name` |
| Donor country | `Donor_country` |
| Recipient macro region | `region_macro` |
| Recipient region | `region` |
| Recipient country / regional label | `country` |
| Flow type | `type_of_flow` |
| Disbursement amount | `usd_disbursements_defl` |
| Commitment amount | `usd_commitment_defl` |
| Project title | `grant_recipient_project_title` |
| Project description | `project_description` |
| Project / donation key | `row_id` |
| Sector code | `Sector` |
| Sector name | `sector_description` |
| Subsector code | `subsector` |
| Subsector name | `subsector_description` |
| SDG focus | `sdg_focus` |
| Channel code | `channel_code` |
| Channel name | `channel_name` |
| Reported channel name | `channel_reported_name` |
| Gender marker | `gender_marker`, `gender_dimension` |
| Climate markers | `climate_change_mitigation`, `climate_change_adaptation` |
| Environment markers | `environment`, `biodiversity`, `desertification` |
| Nutrition marker | `nutrition` |
| Additional info | `additional_info` |

### 4.4 Amount Semantics

Use `usd_disbursements_defl` as the default funding measure for MVP because it represents actual disbursed funding and is more complete than commitment amount.

Use `usd_commitment_defl` as a secondary optional measure.

Display copy:

> Amounts are shown in USD millions, deflated to 2023 constant values.

### 4.5 Data Quality Constraints

The MVP must explicitly handle these constraints:

1. **Multi-row projects:** some `row_id` values appear across multiple rows.
2. **Regional/unspecified recipients:** about 23.6% of rows have recipient labels such as `Bilateral, unspecified`, `Africa, regional`, or `South of Sahara, regional`.
3. **Missing fields:** several optional marker columns have high missingness and should not be primary filters.
4. **Mixed year values:** `year` includes both numeric years and the aggregate label `2020-2023`.
5. **Missing `row_id`:** 3 rows lack `row_id`; the system must generate a fallback project key.

---

## 5. Target Users and Use Cases

### 5.1 Competition Judge

**Need:** Quickly understand what the dashboard does and why it is impressive.  
**Use Case:** Open dashboard, see global funding patterns, click a donor-recipient route, inspect exact projects.  
**Success Moment:** “This feels like a real intelligence product, not a generic dashboard.”

### 5.2 Policy / Development Researcher

**Need:** Investigate where funding goes and what sectors it supports.  
**Use Case:** Filter for a recipient country, compare sectors, inspect top organizations and project details.  
**Success Moment:** Finds a specific set of funding records and can cite their project-level evidence.

### 5.3 Philanthropy Strategy Analyst

**Need:** Understand competitor/funder behavior and identify concentration patterns.  
**Use Case:** Select an organization, analyze its recipient countries, sectors, and large grants.  
**Success Moment:** Identifies where an organization concentrates its giving.

### 5.4 Data-Literate Explorer

**Need:** Search, filter, sort, and export evidence.  
**Use Case:** Search project descriptions or filter by SDG, sector, and amount range.  
**Success Moment:** Finds specific rows/projects without needing SQL.

---

## 6. MVP Information Architecture

The MVP should be organized into a single-page dashboard with sections, or into 3–4 tabs if routing is easier.

Recommended tab/section structure:

1. **Global Overview**
2. **Flow Explorer**
3. **Sector & Impact Lens**
4. **Project Inspector**

If time is limited, combine **Sector & Impact Lens** into the Global Overview and focus on three sections:

1. Overview
2. Flow Explorer
3. Project Inspector

---

## 7. MVP Feature Requirements

## 7.1 Global Overview

### Purpose

Give users a fast, trustworthy summary of the entire dataset or currently filtered subset.

### Required Components

#### A. KPI Cards

Display 5–6 KPI cards at the top of the dashboard:

1. Total disbursement
2. Total commitment
3. Number of projects
4. Number of raw rows
5. Number of donor countries
6. Number of recipient countries/regions
7. Optional: number of funding organizations

Each KPI should update based on active filters.

#### Default KPI Definitions

```sql
SELECT
  SUM(COALESCE(usd_disbursements_defl, 0)) AS total_disbursement,
  SUM(COALESCE(usd_commitment_defl, 0)) AS total_commitment,
  COUNT(*) AS raw_row_count,
  COUNT(DISTINCT COALESCE(row_id, CONCAT('missing-row-', CAST(raw_internal_id AS TEXT)))) AS project_count,
  COUNT(DISTINCT Donor_country) AS donor_country_count,
  COUNT(DISTINCT country) AS recipient_label_count,
  COUNT(DISTINCT organization_name) AS organization_count
FROM raw_oecd_philanthropy
WHERE <active_filters>;
```

If the raw database does not have `raw_internal_id`, the backend should create a row number during ingestion or query loading.

#### B. Yearly Funding Trend

Line chart:

- X-axis: `year`
- Y-axis: selected measure, default `usd_disbursements_defl`
- Optional toggle: disbursement vs commitment

Requirement:

- Exclude or separately label `2020-2023` aggregate rows so they do not distort the yearly trend.

#### C. Top Donor Countries

Horizontal bar chart:

- Dimension: `Donor_country`
- Measure: selected funding measure
- Sort: descending
- Limit: top 10

#### D. Top Recipient Countries / Regions

Horizontal bar chart:

- Dimension: `country`
- Measure: selected funding measure
- Sort: descending
- Limit: top 10

Requirement:

- Clearly label `Bilateral, unspecified`, regional values, and global/unspecified values.
- Do not hide these values by default because they are analytically important.

#### E. Sector Breakdown

Horizontal bar chart:

- Dimension: `sector_description`
- Measure: selected funding measure
- Sort: descending
- Limit: top 10

Missing sector values should be grouped as `Unknown / Not reported`.

---

## 7.2 Flow Explorer

### Purpose

The Flow Explorer is the signature MVP feature. It allows users to trace funding routes from donor countries to recipient geographies, then drill into the exact projects behind those flows.

### Core User Story

> As a user, I want to click or filter a donor-recipient route, then progressively narrow the data by year, amount, sector, and organization so that I can identify a specific project or batch of donations.

### Required Components

#### A. Flow Map

The map should display donor-to-recipient funding routes.

For MVP, implement a 2D world map rather than a complex 3D globe. Use one of the following libraries:

1. **Recommended practical choice:** Apache ECharts map / lines layer
2. **Alternative:** Plotly geographic scatter + line traces
3. **Alternative:** Leaflet + curved polyline plugin
4. **Advanced:** deck.gl ArcLayer

Recommended for time-constrained implementation:

> Use ECharts or Plotly first. Prioritize reliable interaction over visual complexity.

#### B. Cross-Border Flow Rendering

For records where `type_of_flow = 'Cross-border'` and both donor and recipient can be mapped:

- Draw an arc or line from donor country centroid to recipient country centroid.
- Line thickness = total selected measure.
- Hover tooltip should include:
  - Donor country
  - Recipient country or region
  - Total disbursement
  - Total commitment
  - Project count
  - Raw row count
  - Top sector
  - Top organization

#### C. Domestic Flow Rendering

For records where `type_of_flow = 'Domestic'`:

- Do not draw self-looping arcs.
- Display a bubble over the country.
- Bubble size = total selected measure.
- Tooltip should say `Domestic funding`.

#### D. Regional / Unspecified Flow Handling

For recipient labels such as:

- `Bilateral, unspecified`
- `GLOBAL or unspecified`
- `Africa, regional`
- `Asia, regional`
- `South of Sahara, regional`
- Other values containing `regional` or `unspecified`

Do not pretend these are exact country destinations.

MVP handling options:

1. Show these as separate grouped cards under the map.
2. Show dashed lines to approximate regional centroids.
3. Show them in a side panel named `Regional / Unspecified Flows`.

Recommended MVP implementation:

> Display exact country flows on the map and show regional/unspecified flows in a ranked side panel.

This avoids misleading geospatial visualization and is easier to implement.

#### E. Layered Filter Ladder

The Flow Explorer must include a guided filter ladder with the following order:

1. Flow type
2. Donor country
3. Recipient macro region
4. Recipient country / region
5. Year
6. Funding amount range
7. Sector / subsector / SDG focus
8. Organization / keyword / project ID

Each filter should update the full dashboard state.

#### F. Active Filter Breadcrumbs

Display active filters as removable chips.

Example:

```text
All funding → Cross-border → United States → Afghanistan → 2021 → Health
```

Each chip should have an `x` to remove that filter.

#### G. Live Count Display

Always show:

```text
Showing X raw rows / Y projects
```

This is critical because the raw table is row-based while users often think in project-level terms.

#### H. Suggested Next Filter

MVP version can use rule-based logic rather than ML.

Rules:

1. If no donor selected, suggest donor country.
2. If donor selected but no recipient selected, suggest recipient region/country.
3. If route selected but no year selected, suggest year.
4. If route + year selected but too many projects remain, suggest sector.
5. If fewer than 100 projects remain, suggest organization or keyword search.

Display example:

```text
Suggested next step: Filter by sector or organization to narrow this route.
```

---

## 7.3 Project Inspector

### Purpose

Allow users to inspect the exact projects and raw rows behind charts and map flows.

### Required Components

#### A. Searchable Results Table

The table should update based on active filters.

Required columns:

| Column | Source |
|---|---|
| Project ID | `row_id` or fallback key |
| Year | `year` |
| Organization | `organization_name` |
| Donor country | `Donor_country` |
| Recipient | `country` |
| Region | `region` |
| Disbursement | `usd_disbursements_defl` |
| Commitment | `usd_commitment_defl` |
| Sector | `sector_description` |
| Subsector | `subsector_description` |
| SDG focus | `sdg_focus` |
| Project title | `grant_recipient_project_title` |

Required interactions:

- Sort by amount, year, organization, donor, recipient, sector.
- Search by project title, description, organization, channel name, or project ID.
- Click row to open detail drawer.
- Pagination or virtualization for performance.

#### B. Project-Level vs Raw Row-Level Toggle

The table must support two modes:

##### Project View

Group by project key:

```sql
project_key = COALESCE(row_id, generated_fallback_id)
```

Display one row per project.

Aggregate fields:

- `SUM(usd_disbursements_defl)`
- `SUM(usd_commitment_defl)`
- `COUNT(*) AS raw_row_count`
- `COUNT(DISTINCT sector_description) AS sector_count`
- Concatenated sector list
- First non-null title
- First non-null description
- First organization, donor, recipient, year, etc.

##### Raw Row View

Display raw sector-level records exactly as they exist in the current raw database.

This is useful for transparency and debugging.

Default mode:

> Project View

Reason:

> Users think in donations/projects, not sector rows. Defaulting to Project View reduces the risk of accidental double-counting.

#### C. Project Detail Drawer

When a user clicks a project or row, open a side drawer.

Required fields:

1. Project title
2. Project description
3. Project ID / `row_id`
4. Organization name
5. Donor country
6. Recipient country / region
7. Year
8. Flow type
9. Total disbursement
10. Total commitment
11. Sector/subsector breakdown
12. SDG focus
13. Channel name / reported channel name
14. Policy markers, if available
15. Raw row breakdown under the same `row_id`

The drawer should include a small warning if the project contains multiple raw rows:

```text
This project appears across N raw sector rows. Amounts are grouped in Project View.
```

---

## 7.4 Sector & Impact Lens

### Purpose

Show what philanthropic funding is trying to accomplish by sector, SDG, and policy markers.

### Required MVP Components

1. Sector distribution chart
2. Sector-by-year stacked bar chart or line chart
3. Top subsectors table
4. SDG focus frequency chart or searchable list
5. Marker summary cards for available fields:
   - Gender marker
   - Climate mitigation
   - Climate adaptation
   - Environment
   - Biodiversity
   - Desertification
   - Nutrition

### Important UX Rule

Because several marker columns have high missingness, the dashboard must not imply absence of a marker means the project definitely does not target that issue.

Use display language such as:

```text
Marker not reported
```

rather than:

```text
No gender/climate/environment relevance
```

---

## 7.5 Insight Cards

### Purpose

Make the dashboard immediately interpretable for judges.

### MVP Insight Cards

Show 3–5 cards near the top of the Overview page.

Recommended cards:

1. **Funding is highly concentrated**  
   A small number of donor countries and organizations account for a large share of total reported disbursements.

2. **Project-level grouping matters**  
   The dataset has more raw rows than unique project IDs because some projects are split across sector rows.

3. **Regional and unspecified recipients are significant**  
   A meaningful share of records use regional or unspecified recipient labels, so the dashboard separates exact country flows from regional/unspecified flows.

4. **Health is a dominant sector**  
   Health is one of the most frequent and heavily funded sectors in the dataset.

5. **Outlier-scale grants exist**  
   Some projects are much larger than the median project, so the dashboard includes large-grant filtering.

The cards can be static for MVP, but should be calculated from the database if possible.

---

## 7.6 Outlier / Large Grant Filter

### Purpose

Add a lightweight analytical feature that helps judges see which projects deserve closer investigation.

### MVP Implementation

Use rule-based thresholds instead of ML.

Recommended project-level disbursement bins:

| Bin | Definition |
|---|---|
| Micro | Less than $10k |
| Small | $10k–$100k |
| Medium | $100k–$1M |
| Large | $1M–$10M |
| Major | $10M+ |
| Top 1% / Outlier-scale | Approximately $14.8M+ based on current project-level distribution |

Because amounts are stored in USD millions:

| User Label | Stored Value Range |
|---|---|
| Less than $10k | `< 0.01` |
| $10k–$100k | `0.01` to `< 0.1` |
| $100k–$1M | `0.1` to `< 1` |
| $1M–$10M | `1` to `< 10` |
| $10M+ | `>= 10` |
| Top 1% / Outlier-scale | `>= 14.8` approximately |

Add a toggle:

```text
Show major / outlier-scale grants only
```

---

## 8. Filter System Requirements

### 8.1 Global Filters

All major charts, the map, and the table should respond to the same global filter state.

Required filters:

1. Measure type: disbursement / commitment
2. View mode: project / raw row
3. Flow type
4. Donor country
5. Recipient macro region
6. Recipient region
7. Recipient country / recipient label
8. Year
9. Organization
10. Sector
11. Subsector
12. Amount range
13. Keyword search

### 8.2 Filter Behavior

1. Filters should be combinable.
2. Filters should be removable one by one.
3. Reset button should clear all filters.
4. Filter options should update based on currently selected filters when feasible.
5. High-cardinality filters, such as organization and project title, should use searchable dropdowns.
6. Amount range should use bins first; a custom numeric range is optional.

### 8.3 Keyword Search

Keyword search should search across:

- `row_id`
- `organization_name`
- `grant_recipient_project_title`
- `project_description`
- `channel_name`
- `channel_reported_name`
- `country`
- `Donor_country`

Example SQL condition:

```sql
LOWER(COALESCE(row_id, '')) LIKE LOWER('%keyword%')
OR LOWER(COALESCE(organization_name, '')) LIKE LOWER('%keyword%')
OR LOWER(COALESCE(grant_recipient_project_title, '')) LIKE LOWER('%keyword%')
OR LOWER(COALESCE(project_description, '')) LIKE LOWER('%keyword%')
OR LOWER(COALESCE(channel_name, '')) LIKE LOWER('%keyword%')
OR LOWER(COALESCE(channel_reported_name, '')) LIKE LOWER('%keyword%')
```

---

## 9. Recommended MVP UI Layout

### 9.1 Desktop Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Header: FlowLens + measure toggle + reset filters             │
├──────────────────────────────────────────────────────────────┤
│ KPI Cards: Disbursement | Commitment | Projects | Rows | ...  │
├──────────────────────────────────────────────────────────────┤
│ Insight Cards                                                 │
├───────────────────────┬──────────────────────────────────────┤
│ Filter Ladder Panel    │ Global Map / Flow Explorer           │
│ - Flow type            │ - Arcs for exact flows                │
│ - Donor                │ - Bubbles for domestic flows          │
│ - Recipient            │ - Side panel for regional flows       │
│ - Year                 │                                      │
│ - Amount               │                                      │
│ - Sector               │                                      │
│ - Organization/Search  │                                      │
├───────────────────────┴──────────────────────────────────────┤
│ Charts: yearly trend | top donors | top recipients | sectors  │
├──────────────────────────────────────────────────────────────┤
│ Project Inspector Table                                       │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Detail Drawer Layout

```text
┌──────────────────────────────┐
│ Project Detail               │
├──────────────────────────────┤
│ Title                        │
│ Description                  │
│                              │
│ Organization                 │
│ Donor → Recipient            │
│ Year                         │
│ Disbursement / Commitment    │
│                              │
│ Sector Breakdown             │
│ SDG Focus                    │
│ Channel                      │
│ Markers                      │
│                              │
│ Raw Rows Under This Project  │
└──────────────────────────────┘
```

---

## 10. Technical Architecture

## 10.1 MVP Architecture Principles

The MVP must satisfy two constraints:

1. **Work now on the raw database.**
2. **Scale later when data engineers provide cleaned tables.**

Therefore, use a layered architecture:

```text
Frontend Components
        ↓
Dashboard API / Query Service
        ↓
Repository Layer / SQL Builders
        ↓
Raw Database Table Now
        ↓
Future Cleaned Tables / Materialized Views Later
```

The frontend should never query raw table names directly.

---

## 10.2 Recommended Implementation Stack

The specific stack can vary, but the following is practical for a competition MVP:

### Option A: Fastest Full-Code MVP

- Frontend: React + Vite
- UI: Tailwind + shadcn/ui or simple custom components
- Charts: ECharts or Plotly
- Map: ECharts map/lines or Plotly geo
- Table: TanStack Table
- Backend: FastAPI or Next.js API routes
- Database: SQLite, DuckDB, Supabase Postgres, or local Postgres

### Option B: Python-Centric MVP

- App: Streamlit or Dash
- Charts: Plotly
- Database: DuckDB or SQLite
- Pros: faster to build
- Cons: may feel less product-polished than React

### PM Recommendation

If the team must ship quickly and provide a GitHub codebase:

> Use React + Vite + FastAPI + DuckDB/SQLite/Postgres, depending on what your team already has working.

If the team is under severe time pressure:

> Use Streamlit + Plotly + DuckDB, then spend time polishing the narrative and interactions.

---

## 10.3 Raw Data Adapter

Create a backend module that abstracts the source table.

Example file structure:

```text
src/
  api/
    routes.py
  data/
    raw_repository.py
    filters.py
    aggregations.py
    project_view.py
  services/
    dashboard_service.py
  config.py
```

The raw repository should expose functions like:

```python
get_kpis(filters, measure)
get_yearly_trend(filters, measure)
get_top_donors(filters, measure, limit=10)
get_top_recipients(filters, measure, limit=10)
get_sector_breakdown(filters, measure, limit=10)
get_flow_routes(filters, measure, limit=200)
get_projects(filters, view_mode, page, page_size, sort)
get_project_detail(project_key)
get_filter_options(filters)
```

Later, these functions can query cleaned tables instead of the raw table without changing frontend components.

---

## 10.4 Future Scalable Data Model

When data engineering work is complete, migrate from one raw table to a star-schema or analytics-mart structure.

Recommended future tables:

```text
fact_project_funding
- project_key
- row_id
- year
- organization_id
- donor_country_id
- recipient_geo_id
- flow_type
- disbursement_usd_2023_m
- commitment_usd_2023_m
- raw_row_count

fact_project_sector
- project_key
- sector_code
- sector_description
- subsector_code
- subsector_description
- allocated_disbursement_usd_2023_m
- allocated_commitment_usd_2023_m

dim_organization
- organization_id
- organization_name
- donor_country_id

dim_geography
- geo_id
- label
- country_name
- region
- region_macro
- iso3
- latitude
- longitude
- geo_granularity
- is_exact_country
- is_regional
- is_unspecified

dim_sector
- sector_code
- sector_description
- subsector_code
- subsector_description

dim_channel
- channel_code
- channel_name
- channel_reported_name

dim_project_text
- project_key
- project_title
- project_description
- additional_info
```

### Migration Principle

The API response shape should stay stable.

For example, `/api/kpis` should return the same JSON whether it queries `raw_oecd_philanthropy` or `fact_project_funding`.

---

## 11. API Contract

Use these endpoints if building a separate backend. If using Streamlit/Dash, treat these as service-function contracts.

### 11.1 `GET /api/kpis`

Returns KPI values for active filters.

Query params:

```text
measure=disbursement|commitment
view_mode=project|raw
flow_type=
donor_country=
recipient_country=
region=
region_macro=
year=
sector=
organization=
amount_min=
amount_max=
keyword=
```

Response:

```json
{
  "total_disbursement": 68237.104,
  "total_commitment": 51755.914,
  "project_count": 74880,
  "raw_row_count": 116561,
  "donor_country_count": 28,
  "recipient_label_count": 163,
  "organization_count": 506
}
```

### 11.2 `GET /api/overview`

Returns chart-ready aggregates.

Response:

```json
{
  "yearly_trend": [],
  "top_donors": [],
  "top_recipients": [],
  "sector_breakdown": []
}
```

### 11.3 `GET /api/flows`

Returns map flow data.

Response shape:

```json
{
  "exact_country_flows": [
    {
      "donor_country": "United States",
      "recipient_country": "Afghanistan",
      "donor_lat": 37.0902,
      "donor_lon": -95.7129,
      "recipient_lat": 33.9391,
      "recipient_lon": 67.7100,
      "total_disbursement": 123.45,
      "total_commitment": 100.12,
      "project_count": 116,
      "raw_row_count": 140,
      "top_sector": "Health",
      "top_organization": "Example Foundation"
    }
  ],
  "domestic_flows": [],
  "regional_unspecified_flows": []
}
```

### 11.4 `GET /api/projects`

Returns paginated table data.

Query params:

```text
view_mode=project|raw
page=1
page_size=50
sort_by=amount|year|organization|recipient|sector
sort_dir=asc|desc
<filters>
```

Response:

```json
{
  "rows": [],
  "page": 1,
  "page_size": 50,
  "total_rows": 1234,
  "total_projects": 567
}
```

### 11.5 `GET /api/projects/{project_key}`

Returns detail drawer data.

Response:

```json
{
  "project_key": "F749RIW",
  "title": "For Afghanistan",
  "description": "To support Turquoise Mountain's work in Afghanistan",
  "organization_name": "Lund Trust",
  "donor_country": "United Kingdom",
  "recipient_country": "Afghanistan",
  "year": "2021",
  "flow_type": "Cross-border",
  "total_disbursement": 0.007338,
  "total_commitment": null,
  "sectors": [],
  "sdg_focus": [],
  "markers": {},
  "raw_rows": []
}
```

### 11.6 `GET /api/filter-options`

Returns dropdown values and counts.

Response:

```json
{
  "years": [],
  "flow_types": [],
  "donor_countries": [],
  "region_macros": [],
  "regions": [],
  "recipient_countries": [],
  "organizations": [],
  "sectors": [],
  "subsectors": []
}
```

---

## 12. SQL / Query Implementation Notes for Raw Database

## 12.1 Base Filter CTE

Build all queries from a shared filtered CTE.

```sql
WITH filtered AS (
  SELECT
    *,
    COALESCE(row_id, CONCAT('missing-row-', CAST(raw_internal_id AS TEXT))) AS project_key,
    COALESCE(usd_disbursements_defl, 0) AS disbursement_value,
    COALESCE(usd_commitment_defl, 0) AS commitment_value,
    CASE
      WHEN country ILIKE '%regional%'
        OR country ILIKE '%unspecified%'
        OR country = 'Bilateral, unspecified'
        OR country = 'GLOBAL or unspecified'
      THEN TRUE
      ELSE FALSE
    END AS is_regional_or_unspecified
  FROM raw_oecd_philanthropy
  WHERE 1 = 1
    -- append filters safely with parameterized SQL
)
SELECT * FROM filtered;
```

For SQLite, replace `ILIKE` with `LOWER(country) LIKE '%regional%'`.

## 12.2 Project View Query

```sql
WITH filtered AS (...)
SELECT
  project_key,
  MIN(year) AS year,
  MIN(organization_name) AS organization_name,
  MIN(Donor_country) AS donor_country,
  MIN(country) AS recipient_country,
  MIN(region) AS region,
  MIN(region_macro) AS region_macro,
  MIN(type_of_flow) AS flow_type,
  SUM(disbursement_value) AS total_disbursement,
  SUM(commitment_value) AS total_commitment,
  COUNT(*) AS raw_row_count,
  COUNT(DISTINCT sector_description) AS sector_count,
  MIN(grant_recipient_project_title) AS project_title,
  MIN(project_description) AS project_description
FROM filtered
GROUP BY project_key
ORDER BY total_disbursement DESC
LIMIT :page_size OFFSET :offset;
```

## 12.3 Flow Route Query

```sql
WITH filtered AS (...)
SELECT
  Donor_country AS donor_country,
  country AS recipient_label,
  type_of_flow,
  SUM(disbursement_value) AS total_disbursement,
  SUM(commitment_value) AS total_commitment,
  COUNT(*) AS raw_row_count,
  COUNT(DISTINCT project_key) AS project_count,
  COUNT(DISTINCT organization_name) AS organization_count
FROM filtered
GROUP BY Donor_country, country, type_of_flow
ORDER BY total_disbursement DESC
LIMIT 200;
```

Map coordinates should be joined from a static lookup file/table:

```text
country_centroids.csv
- country_label
- iso3
- lat
- lon
- is_exact_country
```

For MVP, create this lookup for the top donor countries and top recipient countries first. Flows without coordinates should fall into the regional/unspecified side panel.

## 12.4 Sector Breakdown Query

```sql
WITH filtered AS (...)
SELECT
  COALESCE(sector_description, 'Unknown / Not reported') AS sector,
  SUM(disbursement_value) AS total_disbursement,
  SUM(commitment_value) AS total_commitment,
  COUNT(*) AS raw_row_count,
  COUNT(DISTINCT project_key) AS project_count
FROM filtered
GROUP BY COALESCE(sector_description, 'Unknown / Not reported')
ORDER BY total_disbursement DESC
LIMIT 15;
```

## 12.5 Keyword Search Query Pattern

```sql
AND (
  LOWER(COALESCE(row_id, '')) LIKE :keyword
  OR LOWER(COALESCE(organization_name, '')) LIKE :keyword
  OR LOWER(COALESCE(grant_recipient_project_title, '')) LIKE :keyword
  OR LOWER(COALESCE(project_description, '')) LIKE :keyword
  OR LOWER(COALESCE(channel_name, '')) LIKE :keyword
  OR LOWER(COALESCE(channel_reported_name, '')) LIKE :keyword
)
```

Backend should transform user keyword into:

```text
%lowercased_keyword%
```

and use parameterized SQL.

---

## 13. Frontend Component Plan

Recommended React component structure:

```text
src/
  App.tsx
  components/
    Header.tsx
    KpiCards.tsx
    InsightCards.tsx
    FilterPanel.tsx
    FilterBreadcrumbs.tsx
    FlowMap.tsx
    RegionalFlowsPanel.tsx
    YearlyTrendChart.tsx
    TopDonorsChart.tsx
    TopRecipientsChart.tsx
    SectorBreakdownChart.tsx
    ProjectTable.tsx
    ProjectDetailDrawer.tsx
    MeasureToggle.tsx
    ViewModeToggle.tsx
  hooks/
    useDashboardFilters.ts
    useKpis.ts
    useOverviewData.ts
    useFlowData.ts
    useProjects.ts
    useProjectDetail.ts
  services/
    api.ts
    queryParams.ts
  types/
    dashboard.ts
```

### 13.1 Shared Dashboard State

The global filter state should include:

```ts
type DashboardFilters = {
  measure: 'disbursement' | 'commitment';
  viewMode: 'project' | 'raw';
  flowType?: string;
  donorCountry?: string;
  regionMacro?: string;
  region?: string;
  recipientCountry?: string;
  year?: string;
  organization?: string;
  sector?: string;
  subsector?: string;
  amountMin?: number;
  amountMax?: number;
  keyword?: string;
  outlierOnly?: boolean;
};
```

### 13.2 Interaction Rules

1. Clicking a map route sets `donorCountry`, `recipientCountry`, and `flowType`.
2. Clicking a bar in a sector chart sets `sector`.
3. Clicking a donor bar sets `donorCountry`.
4. Clicking a recipient bar sets `recipientCountry`.
5. Selecting a project row opens the detail drawer.
6. Changing any filter refreshes all chart and table queries.

---

## 14. Performance Requirements

Because the raw table has more than 100k rows, the MVP can perform well if queries are designed sensibly.

### 14.1 Backend Performance

Required:

1. Use server-side aggregation.
2. Use pagination for the project table.
3. Limit flow map routes to the top 100–300 by selected measure.
4. Avoid sending all raw rows to the frontend.
5. Cache expensive overview queries if possible.

### 14.2 Database Index Recommendations

If using SQLite/Postgres, add indexes on:

```sql
CREATE INDEX idx_oecd_year ON raw_oecd_philanthropy(year);
CREATE INDEX idx_oecd_donor ON raw_oecd_philanthropy(Donor_country);
CREATE INDEX idx_oecd_country ON raw_oecd_philanthropy(country);
CREATE INDEX idx_oecd_region ON raw_oecd_philanthropy(region);
CREATE INDEX idx_oecd_region_macro ON raw_oecd_philanthropy(region_macro);
CREATE INDEX idx_oecd_org ON raw_oecd_philanthropy(organization_name);
CREATE INDEX idx_oecd_sector ON raw_oecd_philanthropy(sector_description);
CREATE INDEX idx_oecd_row_id ON raw_oecd_philanthropy(row_id);
CREATE INDEX idx_oecd_flow_type ON raw_oecd_philanthropy(type_of_flow);
```

For keyword search, full-text search is nice-to-have, not required for MVP.

### 14.3 Frontend Performance

Required:

1. Use loading skeletons or spinners for chart/table refresh.
2. Debounce keyword search by 300–500ms.
3. Use table pagination or virtualization.
4. Do not render thousands of map lines at once.
5. Cap dropdown option lists or make them searchable.

---

## 15. Data Quality Display Requirements

The dashboard must be honest about data limitations.

### 15.1 Required Data Quality Indicators

Show small notes or badges for:

1. Project View vs Raw Row View
2. Regional/unspecified recipient records
3. Missing marker values
4. Amount unit: USD millions, 2023 constant
5. Aggregate year label `2020-2023`

### 15.2 Suggested Copy

For project view:

```text
Project View groups rows by row_id to reduce double-counting across sector-level records.
```

For regional recipients:

```text
Some recipient labels are regional or unspecified. These records are shown separately from exact country-level map flows.
```

For markers:

```text
Blank marker values mean the marker was not reported or not screened, not necessarily that the issue is irrelevant.
```

For amount units:

```text
Amounts are shown in USD millions, deflated to 2023 constant dollars.
```

---

## 16. MVP Acceptance Criteria

## 16.1 Functional Acceptance Criteria

The MVP is acceptable if:

1. User can see overview KPIs.
2. User can filter by donor country, recipient country/region, year, sector, organization, and amount range.
3. User can view a map or geographic visualization of flows.
4. User can click a map flow or chart element to update dashboard filters.
5. User can see yearly funding trend.
6. User can see top donor, top recipient, and sector charts.
7. User can inspect matching records in a table.
8. User can switch between Project View and Raw Row View.
9. User can open a detail drawer for a selected project.
10. User can identify whether a record is exact country-level or regional/unspecified.
11. User can reset filters.
12. User can search by keyword.
13. Dashboard works from the raw database.
14. Backend/query layer is abstracted enough to migrate later.

## 16.2 UX Acceptance Criteria

The MVP is acceptable if:

1. A judge can understand the dashboard purpose in under 10 seconds.
2. A judge can trace a donor-recipient flow in under 30 seconds.
3. The dashboard does not feel like a random collection of charts.
4. Active filters are always visible.
5. Row/project counts are always visible.
6. The table and detail drawer provide evidence for all aggregated views.
7. Regional/unspecified data is not misleadingly mapped as exact country data.

## 16.3 Technical Acceptance Criteria

The MVP is acceptable if:

1. App runs locally from GitHub setup instructions.
2. Database connection path is documented.
3. Data loading instructions are documented.
4. No component directly hardcodes raw SQL table names in the UI layer.
5. Queries are parameterized.
6. Large table results are paginated.
7. Basic loading/error states exist.
8. README includes demo script and limitations.

---

## 17. Implementation Roadmap

## 17.1 Phase 0 — Data Setup

Goal: Load raw CSV/table and validate basic stats.

Tasks:

1. Load raw dataset into local DB.
2. Confirm row count.
3. Confirm unique `row_id` count.
4. Confirm amount fields parse as numeric.
5. Add indexes.
6. Create static country centroid lookup.
7. Create backend config for raw table name.

Deliverable:

- Raw table queryable by backend.
- Basic validation script.

## 17.2 Phase 1 — Core Backend APIs

Goal: Implement reusable data access functions.

Tasks:

1. Build filter parser.
2. Build KPI query.
3. Build overview aggregation queries.
4. Build flow route query.
5. Build project table query.
6. Build project detail query.
7. Build filter-options query.

Deliverable:

- Working API/service layer.

## 17.3 Phase 2 — Overview UI

Goal: Build the baseline dashboard.

Tasks:

1. Header and measure toggle.
2. KPI cards.
3. Insight cards.
4. Yearly trend chart.
5. Top donors chart.
6. Top recipients chart.
7. Sector chart.
8. Global filter panel.

Deliverable:

- Dashboard baseline complete.

## 17.4 Phase 3 — Flow Explorer

Goal: Build the standout feature.

Tasks:

1. Flow map.
2. Regional/unspecified side panel.
3. Map click interaction.
4. Filter ladder.
5. Breadcrumbs.
6. Live row/project count.
7. Suggested next filter message.

Deliverable:

- Demo-ready investigation flow.

## 17.5 Phase 4 — Project Inspector

Goal: Add evidence and drill-down.

Tasks:

1. Project table.
2. Raw row / project view toggle.
3. Search box.
4. Sorting and pagination.
5. Detail drawer.
6. Raw row breakdown inside drawer.

Deliverable:

- Users can inspect exact records behind every flow.

## 17.6 Phase 5 — Polish and Judge Demo

Goal: Make it presentation-ready.

Tasks:

1. Add loading states.
2. Add data quality notes.
3. Add empty states.
4. Improve chart labels and number formatting.
5. Add README.
6. Add demo script.
7. Deploy or provide local run instructions.

Deliverable:

- Competition-ready MVP.

---

## 18. Recommended Two-Day Build Priority

If the team has only two days, follow this order strictly.

### Day 1 Morning

1. Load raw DB.
2. Build KPI and chart queries.
3. Build filter parser.
4. Build Overview UI.

### Day 1 Afternoon

1. Build project table.
2. Add project/raw toggle.
3. Add search and filters.
4. Add detail drawer.

### Day 2 Morning

1. Build map/flow visualization.
2. Add map click-to-filter.
3. Add regional/unspecified side panel.
4. Add breadcrumbs.

### Day 2 Afternoon

1. Add insight cards.
2. Add outlier filter.
3. Polish styling.
4. Write README.
5. Prepare demo script.
6. Test deployment/local run.

### If Time Runs Out

Minimum fallback version must still include:

1. KPI cards
2. Filters
3. Top donor/recipient/sector charts
4. Yearly trend
5. Project table
6. Project detail drawer
7. Clean README

The map can degrade to a recipient-country map or a top-flow ranked table if necessary, but the project table and filters should not be sacrificed.

---

## 19. Demo Script

Use this script during judging.

```text
This dashboard is called FlowLens. It helps users trace philanthropic capital from donor countries to recipient geographies and then inspect the exact projects behind each flow.

At the top, we show the full dataset overview: total disbursement, total commitment, number of projects, number of raw rows, donor countries, recipient regions, and organizations.

The key thing about this dataset is that it is not simply one row per donation. Some projects appear across multiple sector-level rows, so we provide a Project View and a Raw Row View. Project View groups records by row_id to reduce accidental double-counting.

The main feature is the Flow Explorer. Users can start with the global map, select a donor-recipient route, and progressively narrow by year, amount, sector, and organization. For example, we can trace funding from the United States to a selected recipient, then filter to health-related funding in a specific year.

Every filter updates the KPIs, charts, map, and project table. When we click a project, the detail drawer shows the actual project title, description, organization, donor country, recipient country, amount, sector, SDG focus, channel information, and raw row breakdown.

We also separate exact country flows from regional or unspecified recipient records so the map does not create false precision.

The MVP currently runs on the raw database, but the query layer is abstracted so when our data engineering teammates complete the cleaned tables, we can swap the backend data source without rebuilding the UI.
```

---

## 20. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Map takes too long to implement | Dashboard loses visual wow factor | Use Plotly/ECharts or fallback to top-flow table + recipient map |
| Raw table queries become slow | Poor UX | Add indexes, limit results, server-side aggregation, pagination |
| Multi-row projects cause double-counting confusion | Analytical credibility issue | Default to Project View and explain Raw Row View |
| Regional recipients are inaccurately mapped | Misleading visualization | Separate regional/unspecified records from exact map arcs |
| Marker fields are sparse | Users misread missing values | Use `not reported` language and avoid primary reliance on sparse markers |
| Too many filters overwhelm users | Poor usability | Use guided filter ladder and breadcrumbs |
| Team runs out of time | Incomplete product | Prioritize Overview + Project Inspector before advanced features |

---

## 21. Definition of Done

The MVP is done when:

1. The dashboard runs from the current raw database.
2. The user can filter across geography, year, amount, sector, organization, and keyword.
3. KPI cards and charts update based on filters.
4. A geographic flow visualization or acceptable fallback exists.
5. Project table supports Project View and Raw Row View.
6. Project detail drawer displays full evidence for selected records.
7. Regional/unspecified recipients are handled transparently.
8. Insight cards communicate key findings.
9. App has a clean README with run instructions.
10. Demo script is included and tested.

---

## 22. Recommended MVP Name and Positioning

### Product Name

**FlowLens**

### Subtitle

**A philanthropic capital intelligence dashboard for tracing funding flows from donor to destination.**

### One-Sentence Pitch

FlowLens helps users trace philanthropic funding across countries, sectors, organizations, and projects, turning raw OECD grant records into an interactive investigation tool.

### Judge-Facing Value Proposition

Unlike a static dashboard that only summarizes totals, FlowLens lets users move from macro-level funding patterns to micro-level project evidence in a few clicks, while preserving transparency around raw data limitations.

---

## 23. Future Enhancements After MVP

Once the MVP is stable and the cleaned data engineering pipeline is complete, consider adding:

1. Saved investigation paths.
2. Export filtered project results to CSV.
3. Natural-language search.
4. Similar project recommendations.
5. True anomaly detection using statistical baselines.
6. Country profile pages.
7. Organization profile pages.
8. Sector deep-dive pages.
9. Time animation for map flows.
10. Full-text search index over project descriptions.
11. Materialized views for faster performance.
12. Data lineage panel showing how raw rows map to cleaned entities.
13. Downloadable insight report.

---

## 24. Implementation Summary

Build the MVP as a practical, raw-data-compatible analytics product:

1. Use the raw table now.
2. Hide raw complexity behind a backend/query service.
3. Build the dashboard around the Flow Explorer narrative.
4. Default to Project View to avoid double-counting.
5. Keep Raw Row View for transparency.
6. Handle regional/unspecified data honestly.
7. Use map + filters + table + drawer as the core product loop.
8. Add insight cards and outlier filtering to make the product feel analytical.
9. Preserve API response shapes so the future cleaned data model can replace raw queries without frontend rewrites.

The result should feel like:

> **A research-grade philanthropy intelligence dashboard that starts with global funding flows and ends with exact project-level evidence.**
