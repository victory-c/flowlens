# FlowLens Methodology and Limitations

## Data and Units

- Source tables come from the OECD philanthropic dataset and cleaned mart tables in `analytics_clean`.
- Funding values are **disbursements in USD millions, deflated to 2023 constant USD**.
- Time coverage includes annual labels `2020` to `2023`, plus the aggregate label `2020-2023`.

## Classification Decisions

- Domestic vs cross-border is taken from `flow_type` (not country-name equality).
- Dashboard default is cross-border only (`includeDomestic=false`).
- Caveat badges are rendered directly in tables:
  - `Unspecified recipient`
  - `Regional aggregate`
  - `Multi-year aggregate`
  - `Domestic flow`

## Visual Design Choices

- Globe is used as first-contact narrative surface.
- Arc thickness uses log scaling to prevent large corridors from flattening smaller ones.
- Arc density defaults to top 50 to reduce overdraw and improve legibility.
- A 2D fallback view is available for low-end or incompatible devices.

## Known Limitations

- Cause-marker totals overlap because one donation can carry multiple markers.
- “Bilateral, unspecified” and similar recipient labels indicate missing recipient specificity.
- Aggregate year rows are not equivalent to a single annual period.
- 2D fallback is chart/table-first for reliability; no full choropleth is included in this sprint.
