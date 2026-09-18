# Deployment Notes

## Vercel only (default)

The app no longer needs a hosted database. By default the API routes load
the cleaned data mart from `data/embedded/*.csv.gz` into an in-process Postgres
([PGlite](https://pglite.dev), Postgres compiled to WASM) on first request, and run the same SQL
that used to go to Supabase.

1. Connect the repo to Vercel with the default Next.js preset.
2. No environment variables are required. A leftover `DATABASE_URL` is ignored unless
   `FLOWLENS_DATA_SOURCE=postgres` is also set.
3. Deploy, then confirm `/api/health` returns `{ "ok": true }` and
   `/api/v1/dashboard-data?view=overview_metrics` returns data.

The first request on a cold function instance takes about 2 seconds to load the snapshot; later
requests are served from memory and API responses are CDN-cached for a day.

## Refreshing the embedded data

The snapshot is generated from the cleaned CSVs plus the raw OECD CSV (for donor country and flow
type). Both inputs stay out of git; only the generated snapshot in `data/embedded/` is committed.

```bash
FLOWLENS_CLEANED_DATA_DIR=./cleaned_data6 \
FLOWLENS_CSV_PATH="./OECD Dataset.xlsx - complete_p4d3_df.csv" \
pnpm build:embedded-data
```

Commit the updated `data/embedded/` files and redeploy.

## Optional: external Postgres (Supabase)

Setting `FLOWLENS_DATA_SOURCE=postgres` together with `DATABASE_URL` (and `DATABASE_SSL=true`)
switches the API back to a hosted Postgres.

1. Run the migrations in `supabase/migrations/`.
2. Run `pnpm db:import-cleaned`, then `pnpm validate:cleaned-import` and `pnpm validate:cleaned-analytics`.
3. Set both variables in Vercel and redeploy.
