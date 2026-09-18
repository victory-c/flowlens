# FlowLens

FlowLens is a philanthropic capital intelligence dashboard for tracing OECD foundation funding flows from donor countries to recipient geographies, then drilling into the project-level evidence behind each aggregate.

## Stack

- Next.js App Router + TypeScript
- Vercel route handlers for server-only analytics APIs
- Embedded Postgres ([PGlite](https://pglite.dev)) loaded from a committed data snapshot, so Vercel is the only service needed; a hosted Postgres (Supabase) is optional
- Tailwind CSS, ECharts, TanStack Query, TanStack Table patterns, and lucide-react

## Local Setup

```bash
pnpm install
pnpm dev
```

No database or environment variables are required: the API loads `data/embedded/*.csv.gz` into an in-process Postgres on first request. To regenerate that snapshot from the cleaned CSVs, see [docs/deployment.md](docs/deployment.md).

## Vercel Deployment

Connect the repo to Vercel with the default Next.js preset and deploy. No environment variables are needed; the embedded data is used unless `FLOWLENS_DATA_SOURCE=postgres` and `DATABASE_URL` are both set (see [docs/deployment.md](docs/deployment.md)).

Do not deploy the raw CSV to Vercel. The Next config excludes the local CSV names, `data/raw/**`, and `cleaned_data6/**`; only the generated `data/embedded/` snapshot ships.

## API Surface

- `GET /api/dashboard-summary`
- `GET /api/kpis`
- `GET /api/overview`
- `GET /api/flows`
- `GET /api/projects`
- `GET /api/projects/[projectKey]`
- `GET /api/filter-options`
- `GET /api/insights`
- `GET /api/health`
- `GET /api/v1/dashboard-data`

The frontend never reads database tables directly. It talks to route handlers, which validate filters with Zod and use a repository interface built around product concepts.

### API Query Examples

`Cross-border-only globe flows (default):`

```bash
curl "http://localhost:3000/api/v1/dashboard-data?view=globe_flows"
```

`Include domestic flows:`

```bash
curl "http://localhost:3000/api/v1/dashboard-data?view=flow_summary&includeDomestic=true"
```

`Search and sort flow table server-side:`

```bash
curl "http://localhost:3000/api/v1/dashboard-data?view=flow_summary&tableQ=india&sortBy=amount&sortDir=desc&page=1&pageSize=25"
```

`Raw/project text search (project_title, project_key, organization):`

```bash
curl "http://localhost:3000/api/v1/dashboard-data?view=raw_table&q=vaccine&page=1&pageSize=25"
```

## Demo Acceptance Path

A judge should be able to complete this path in under 90 seconds:

1. Open FlowLens and read the KPI cards.
2. Select a donor-recipient route from the flow view.
3. Narrow by year and sector.
4. Open a project detail drawer from the Project Inspector.
5. Compare selected-scope amount with project-total amount.
6. Inspect raw rows under the project key.
7. Switch Project View to Raw Rows.
8. Reset filters.

## Data Notes

- Amounts are USD millions, deflated to 2023 constant values.
- Annual years are `2020`, `2021`, `2022`, `2023`; `2020-2023` is an aggregate label.
- Project View groups sector rows by `project_key`.
- Selected-scope amount reflects current filters; project-total amount reflects all raw rows under the project key.
- Regional, unspecified, and unmapped recipient labels are not plotted as exact country flows.
- Blank marker values mean not reported or not screened, not necessarily irrelevant.

## Competition Notes

- Methodology and limitations: `docs/methodology.md`
- Judge pitch script: `docs/judge-pitch.md`
- Demo checklist: `docs/judge-demo-checklist.md`
- Teammate submission handoff: `docs/submission-handoff-2026-04-27.md`
