# FlowLens Submission Handoff (Due Monday, April 27, 2026)

## 1) Why this doc exists

This is a full teammate handoff for final submission prep while one teammate is away. It captures architecture, implementation details, decisions made across sessions, and what to run/check before final lock-in.

Primary objective: make tomorrow's submission predictable, defensible, and low-risk.

---

## 2) Current product state (as of Sunday, April 26, 2026)

FlowLens is now a **globe-first, cleaned-data-backed** dashboard with:

- Hero 3D globe of donor -> recipient corridors (cross-border default)
- Unified API endpoint (`/api/v1/dashboard-data`) with typed view contracts
- Cleaned analytics mart integration (`analytics_clean.*`)
- Evidence drilldown from aggregates to raw rows
- Caveat badges for ambiguity (`Unspecified`, `Regional`, `Multi-year`, `Domestic`)
- 2D fallback mode and low-graphics mode for resilience

The app still contains the original raw-data MVP repository code path for backward compatibility/reference, but active routes are now wired to the cleaned repository.

---

## 3) Session timeline and major decisions

## Session A - MVP foundation (commit `71f1eac`, April 25, 2026)

What shipped:

- Next.js + TypeScript app scaffold
- Raw-table-based analytics schema (`analytics.*`)
- Route handlers for KPIs, overview, flows, projects, filters, insights
- Raw ingestion + materialized view refresh scripts
- Validation scripts and baseline tests

Key decisions:

- Server-side API layer between frontend and DB (no direct browser DB reads)
- Product-oriented repository interface (to allow backend swaps later)
- Validation and SQL parameterization from day one

Why it mattered:

- Enabled fast MVP while preserving migration path to cleaner marts.

## Session B - Deployment enablement (`d0bd436`, `fbf70d2`)

What shipped:

- Vercel project deployment wiring

Key decisions:

- Keep heavyweight CSV files out of deployment artifact via Next output tracing excludes
- Depend on Supabase/Postgres as system-of-record at runtime

## Session C - Cleaned data mart migration (`768c75e`, April 25, 2026)

What shipped:

- New cleaned schema migration (`analytics_clean.main_dashboard`, `country_summary`, `donor_summary`, `sector_summary`, `donor_portfolio`, `cause_marker`)
- Cleaned CSV import pipeline and cleaned validation scripts
- New shared contracts for cleaned API views
- New cleaned repository + query parser
- New unified API endpoint: `/api/v1/dashboard-data`

Key decisions:

- Treat cleaned files as primary source for demo reliability
- Canonicalize query params with backward-compatible aliases
- Keep API stable while swapping backend source

Why it mattered:

- Improved semantic clarity and query predictability over raw-only MVP.

## Session D - Globe-first narrative + flow pipeline (`34306cb` onward, April 25-26, 2026)

What shipped:

- Hero-first globe interface and analytics section activation on scroll
- Flow summary table + globe corridor pipeline built from `analytics_clean.flow_summary`
- Country metadata resolution (DB + CSV fallback)
- Country flag rendering and donor/recipient annotation layers
- Multiple rounds of rendering/visual tuning:
  - API page-size mismatch fix (`67e445b`)
  - multi-year aggregation arc behavior (`19adf3c`)
  - exact-geo regression fix (`46e3fee`)
  - responsive canvas + labels (`2a38cdc`, `f72b673`, `ef65334`)
  - corridor drag stability (`bb616f1`)
  - basemap/polygon visual tuning and arc profile iterations (`b71771f` -> `0c77536`)

Key decisions:

- Globe as first-contact visual, analytics below fold
- Cross-border default for clearer story
- Top-N arc cap (25/50/100/200) and log-scaled thickness for readability
- 2D fallback to preserve demo continuity under WebGL failures

## Session E - Pre-submission hardening (current working tree, not fully committed yet)

What is in-progress now:

- Added judge support docs in `docs/` (pitch, checklist, methodology)
- Added cleaned repository/unit tests and extra e2e checks
- Expanded dashboard interactions around domestic toggle, table search, and fallback states

Important: there are modified/untracked files in the working tree; see Section 11 before final commit/tag.

---

## 4) Architecture overview

## 4.1 Frontend

- Framework: Next.js App Router (React 19, TypeScript)
- Main entry: `src/app/page.tsx` -> `FlowLensDashboard`
- State and data:
  - URL-driven filter state via `useDashboardFilters`
  - TanStack Query for API fetch lifecycle
- Visualization:
  - `react-globe.gl` + `three` for 3D hero globe
  - `echarts-for-react` for charts
- Accessibility/resilience:
  - keyboard nav for key controls
  - low-graphics toggle
  - forced 2D fallback path for crash handling

## 4.2 API

- Unified endpoint:
  - `GET /api/v1/dashboard-data`
  - Query includes `view` + filter/pagination/sort fields
- Backward-compatible routes remain (dashboard-summary, flows, projects, etc.), now backed by cleaned repository
- Validation:
  - Zod schemas at boundary (`src/shared/contracts/dashboard-data.ts`)
- API safety:
  - in-memory route+IP rate limiting (`src/server/analytics/rate-limit.ts`)
  - error normalization for Zod and runtime failures

## 4.3 Data layer

- Runtime DB: Postgres (Supabase)
- Active source tables: `analytics_clean.*`
- Legacy source tables retained: `analytics.*` and materialized views for original MVP
- Repository pattern:
  - active: `CleanedAnalyticsRepository`
  - legacy: `PostgresAnalyticsRepository`

## 4.4 Data flow

1. CSVs imported via scripts into Postgres tables
2. Route parses/validates query params
3. Repository executes parameterized SQL + maps rows to typed DTOs
4. API responds with metadata envelope (data version, unit, warnings, filters applied)
5. Frontend renders globe/tables/charts from same typed contract family

---

## 5) Core implementation details by module

## 5.1 Contracts and filter semantics

File: `src/shared/contracts/dashboard-data.ts`

Notable contract design:

- Single source of truth for:
  - `DashboardFilters`
  - `DashboardDataRequest`
  - supported `view` enum
  - response payload types per view
- Explicit flags:
  - `includeDomestic` defaults `false`
  - `viewMode` defaults `project`
  - `outlierOnly` defaults `false`

Data metadata constants:

- `DATA_VERSION = "cleaned-oecd-2026-04-26-v2"`
- unit = USD millions in 2023 constant values

## 5.2 Query param compatibility layer

File: `src/server/analytics/cleaned-query-params.ts`

Important compatibility aliases:

- `donor` -> `organization`
- `recipient` / `recipient_country` -> `recipientCountry`
- `amountMin` -> `minAmount`
- `table_q` -> `tableQ`
- `include_domestic` -> `includeDomestic`
- `keyword` -> `q`
- `viewMode=raw` normalized to `viewMode=row`

Reason:

- Kept older clients/tests/links from breaking during migration.

## 5.3 Cleaned repository behavior

File: `src/server/analytics/cleaned-repository.ts`

Design highlights:

- `getCleanedView` switch for all supported views
- Common metadata wrapper with warnings for every response
- Cache key canonicalization per request/filter
- 24h in-memory cache for mostly static competition dataset

Querying strategy:

- `mainFilteredCte` for row-level/cause/year/raw/filter options
- `buildFlowFilteredCte` for corridor-specific flow views
- Explicit unsupported-filter warnings when a view cannot honor every filter

Globe flow pipeline:

- Pulls from `analytics_clean.flow_summary`
- Cross-border default excludes domestic unless opted in
- exact-geo rows only for globe rendering
- donor/recipient geocoding resolved via metadata map
- top-N truncation with `truncated` indicator

Project detail semantics:

- returns both selected-scope amount and full-project amount
- includes warning if project id is missing (generated key fallback)
- includes full raw row list for evidence transparency

## 5.4 Country metadata resolution

File: `src/server/analytics/country-metadata.ts`

Behavior:

- Preferred source: `analytics.geo_lookup`
- Fallback source: `data/lookup/geo_lookup.csv`
- Normalization/alias map handles common label variants (e.g. USA/U.S., UK/U.K., Turkey/Turkiye)

Reason:

- Prevent globe/table breakage if DB lookup table is absent or partial.

## 5.5 Dashboard client flow

Files:

- `src/features/dashboard/flowlens-dashboard.tsx`
- `src/features/dashboard/api.ts`
- `src/features/dashboard/use-dashboard-filters.ts`

Important UX behavior:

- Globe loads immediately on first viewport
- Deeper analytics queries are gated until analytics section is reached
- Selecting an arc sets donor+recipient filters and jumps to flow tab
- Table search (`tableQ`) and project text search (`q`) are separated
- Filter chips reflect active constraints and allow single-click clear

Resilience behavior:

- WebGL support detection
- runtime error boundary around globe
- explicit `forceGlobeCrash` query param for fallback testing
- low-graphics mode toggle always available

---

## 6) Data model and semantic decisions that must not be lost

1. **Disbursement is the primary funding metric** in cleaned views.
2. **`2020-2023` is an aggregate label**, not a normal annual point.
3. **Domestic flow is explicit via `flow_type`**, not inferred from string equality.
4. **Cause totals overlap** by definition (multi-marker rows).
5. **Unspecified/regional recipients are caveated** and not plotted as exact country arcs.
6. **`Donor` in cleaned files means organization**; donor country is separately modeled in flow summary data.

---

## 7) Testing and quality posture

## 7.1 API/unit tests

Current test suites cover:

- contract defaults + sort allowlists
- query parser alias compatibility
- stable cache key generation
- cleaned flow filter and caveat assignment behavior

Files:

- `tests/api/contracts.test.ts`
- `tests/api/query-contracts.test.ts`
- `tests/api/sql-builder.test.ts`
- `tests/api/cleaned-v1-contracts.test.ts`
- `tests/api/cleaned-repository.test.ts`

## 7.2 E2E tests

Files:

- `tests/e2e/demo-path.spec.ts`
- `tests/e2e/flow-controls.spec.ts`
- `tests/e2e/accessibility.spec.ts`

These cover:

- hero-first journey and lazy analytics activation
- domestic toggle and table-search wiring to `/api/v1/dashboard-data`
- 2D fallback behavior
- keyboard interaction for filters and tab navigation

---

## 8) Runbook: local, data, and deploy

## 8.1 Local app

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Required env:

- `DATABASE_URL`
- `DATABASE_SSL` (typically `true` for hosted Postgres)
- `NEXT_PUBLIC_APP_URL`

## 8.2 Raw pipeline (legacy MVP path)

```bash
pnpm db:import
pnpm db:refresh
pnpm validate:import
pnpm validate:analytics
```

## 8.3 Cleaned pipeline (submission path)

```bash
pnpm db:import-cleaned
pnpm validate:cleaned-import
pnpm validate:cleaned-analytics
```

Migration order:

1. `supabase/migrations/0001_flowlens_analytics.sql`
2. `supabase/migrations/0002_create_analytics_clean.sql`
3. `supabase/migrations/0003_add_clean_flow_summary.sql`

## 8.4 Pre-submission verification

```bash
pnpm test
pnpm test:e2e
pnpm build
```

Smoke endpoints:

- `/api/health`
- `/api/v1/dashboard-data?view=globe_flows`
- `/api/v1/dashboard-data?view=flow_summary`
- `/api/v1/dashboard-data?view=project_detail&projectKey=<known-key>`

---

## 9) Performance and reliability decisions

1. In-memory cache in API repository to reduce repeated compute on static dataset.
2. In-memory rate limiter for burst protection during demos.
3. Arc density cap + log scaling to avoid visual occlusion.
4. Country metadata preloaded and reused across map/table transformations.
5. Analytics section query gating to reduce initial page load pressure.

Tradeoff notes:

- Cache and limiter are instance-local (acceptable for hackathon/demo scope).
- If we needed strict global behavior, we'd externalize these to Redis/Edge store.

---

## 10) Known gaps / technical debt

1. Legacy raw repository (`PostgresAnalyticsRepository`) remains in codebase and is no longer primary path.
2. `src/features/dashboard/chart-card.tsx` reflects older UI style and appears largely unused in current globe-first surface.
3. Some filters are view-specific and intentionally unsupported; this is surfaced as warnings but still a complexity point.
4. Country/geo normalization depends on lookup coverage quality.

---

## 11) Working tree status before final teammate lock-in

Current state includes modified/untracked files (not all committed yet), including:

- `README.md`
- `src/features/dashboard/api.ts`
- `src/features/dashboard/flowlens-dashboard.tsx`
- `src/features/dashboard/use-dashboard-filters.ts`
- `src/server/analytics/cleaned-query-params.ts`
- `src/server/analytics/cleaned-repository.ts`
- `src/shared/contracts/dashboard-data.ts`
- `tests/api/cleaned-v1-contracts.test.ts`
- `tests/e2e/demo-path.spec.ts`
- new docs and tests (`docs/judge-*`, `docs/methodology.md`, `tests/api/cleaned-repository.test.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/flow-controls.spec.ts`)
- new helper: `src/server/analytics/cleaned-flow-utils.ts`

Teammate should:

1. Review `git status` first.
2. Run test + build gates.
3. Commit with a clear message that bundles final pre-submission hardening.

---

## 12) Tomorrow (April 27, 2026) execution checklist for teammate

1. Pull latest branch and open this doc first.
2. Confirm env vars are set in local and Vercel.
3. Run cleaned validation scripts.
4. Run `pnpm test`, `pnpm test:e2e`, `pnpm build`.
5. Run demo path once end-to-end:
   - Hero globe
   - Scroll to analytics
   - Toggle include domestic in filter drawer
   - Open flows tab and table search
   - Open raw row and project detail drawer
   - Toggle low graphics mode and confirm 2D fallback
6. Confirm caveats are verbally ready:
   - unspecified recipient labels
   - aggregate year semantics
   - cause overlap caveat
7. Final commit + deploy.
8. Recheck `/api/health` and home page in deployed preview/prod.

---

## 13) Suggested final commit framing

`chore: finalize submission hardening, judge docs, and cleaned dashboard QA coverage`

Suggested body:

- finalize judge-facing docs (pitch/checklist/methodology/handoff)
- add cleaned filter/caveat regression tests
- add e2e coverage for domestic toggle, fallback, and keyboard flow
- stabilize dashboard filter/query compatibility behavior

---

## 14) Quick file map for teammate

- Product docs:
  - `FlowLens_MVP_PRD.md`
  - `FlowLens_Cleaned_Data_Integration_Guideline.md`
  - `global_donation_dashboard_implementation_guide.md`
  - `docs/judge-pitch.md`
  - `docs/judge-demo-checklist.md`
  - `docs/methodology.md`
  - `docs/submission-handoff-2026-04-27.md` (this file)
- Frontend:
  - `src/features/dashboard/flowlens-dashboard.tsx`
  - `src/features/dashboard/api.ts`
  - `src/features/dashboard/use-dashboard-filters.ts`
- API/repository:
  - `src/app/api/v1/dashboard-data/route.ts`
  - `src/server/analytics/cleaned-query-params.ts`
  - `src/server/analytics/cleaned-repository.ts`
  - `src/server/analytics/cleaned-flow-utils.ts`
  - `src/server/analytics/country-metadata.ts`
- Data scripts/migrations:
  - `supabase/migrations/0001_flowlens_analytics.sql`
  - `supabase/migrations/0002_create_analytics_clean.sql`
  - `supabase/migrations/0003_add_clean_flow_summary.sql`
  - `scripts/import-cleaned-csvs.ts`
  - `scripts/validate-cleaned-import.ts`
  - `scripts/validate-cleaned-analytics.ts`
- Tests:
  - `tests/api/cleaned-v1-contracts.test.ts`
  - `tests/api/cleaned-repository.test.ts`
  - `tests/e2e/demo-path.spec.ts`
  - `tests/e2e/flow-controls.spec.ts`
  - `tests/e2e/accessibility.spec.ts`

