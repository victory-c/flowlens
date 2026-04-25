# Deployment Notes

## Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/0001_flowlens_analytics.sql`.
3. Set `DATABASE_URL` locally.
4. Run `pnpm db:import`.
5. Run `pnpm db:refresh`.
6. Run `pnpm validate:import` and `pnpm validate:analytics`.

The dashboard reads from private `analytics` schema tables through server-side Next.js route handlers.

## Vercel

1. Connect the repo to Vercel.
2. Set `DATABASE_URL`, `DATABASE_SSL=true`, and `NEXT_PUBLIC_APP_URL`.
3. Deploy with the default Next.js framework preset.
4. Confirm `/api/health` returns `{ "ok": true }`.
5. Confirm `/api/dashboard-summary` returns data.

## Refreshing Data

After re-importing the CSV, run:

```bash
pnpm db:refresh
pnpm validate:analytics
```

Materialized views are refreshed explicitly after import, not on each request.
