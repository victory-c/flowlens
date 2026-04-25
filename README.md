# FlowLens

FlowLens is a philanthropic capital intelligence dashboard for tracing OECD foundation funding flows from donor countries to recipient geographies, then drilling into the project-level evidence behind each aggregate.

## Stack

- Next.js App Router + TypeScript
- Vercel route handlers for server-only analytics APIs
- Supabase Postgres for the raw OECD table, geo lookup, indexes, and materialized summaries
- Tailwind CSS, ECharts, TanStack Query, TanStack Table patterns, and lucide-react

## Local Setup

```bash
pnpm install
cp .env.example .env.local
```

Set `DATABASE_URL` to a Supabase Postgres connection string. Keep service credentials server-only.

Apply the SQL migration in `supabase/migrations/0001_flowlens_analytics.sql` with the Supabase SQL editor, Supabase CLI, or `psql`.

Import the raw CSV:

```bash
pnpm db:import
pnpm db:refresh
```

Validate data and analytics:

```bash
pnpm validate:import
pnpm validate:analytics
```

Run the app:

```bash
pnpm dev
```

## Vercel Deployment

Set these environment variables in Vercel:

- `DATABASE_URL`
- `DATABASE_SSL=true`
- `NEXT_PUBLIC_APP_URL`

Do not deploy the raw CSV to Vercel. The Next config excludes the local CSV names and `data/raw/**`; import the data into Supabase before deploying.

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

The frontend never reads Supabase raw tables directly. It talks to route handlers, which validate filters with Zod and use a repository interface built around product concepts.

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
- Project View groups sector rows by `project_key`.
- Selected-scope amount reflects current filters; project-total amount reflects all raw rows under the project key.
- Regional, unspecified, and unmapped recipient labels are not plotted as exact country flows.
- Blank marker values mean not reported or not screened, not necessarily irrelevant.
