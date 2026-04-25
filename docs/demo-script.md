# FlowLens Demo Script

This dashboard is called FlowLens. It helps users trace philanthropic capital from donor countries to recipient geographies and then inspect the exact projects behind each flow.

Start with the KPI cards to show total disbursement, total commitment, project count, raw row count, donor countries, recipient labels, and organizations.

Use the filter ladder to select a donor, recipient, year, and sector. Every filter updates the KPIs, flow view, charts, regional panel, and Project Inspector.

The important data caveat is that this OECD dataset is sector-row based. Project View groups rows by project key to reduce double-counting, while Raw Rows shows the original sector-level records.

Open a project detail drawer. Point out the selected-scope amount versus the project-total amount, then show the raw rows under the project key.

Regional and unspecified recipients are intentionally separated from exact country map flows so the dashboard does not imply false geographic precision.

Close by explaining that the MVP runs on the raw Supabase table today, but the repository interface can later point to cleaned fact and dimension tables without rewriting the frontend.
