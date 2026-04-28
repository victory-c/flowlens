# Judge Demo Checklist

## Before Demo

- Run `pnpm test`.
- Run `pnpm test:e2e`.
- Run `pnpm build`.
- Confirm homepage loads without console exceptions.

## Demo Flow

1. Show hero globe with cross-border-only default.
2. Call out top flow controls (`Top 25/50/100/200`) and legend.
3. Open filters and show `Include domestic giving` toggle.
4. Open `Donor -> Recipient Flows` tab and point to caveat badges.
5. Show three insight cards and explain one clear drill path.
6. Open raw data view only after narrative path is complete.
7. Toggle low-graphics mode to show resilient 2D fallback.

## Must-mention caveats

- `Bilateral, unspecified` is not a country.
- `2020-2023` is an aggregate label.
- Cause totals overlap by design.
