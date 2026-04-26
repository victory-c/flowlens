# Global Donation Dashboard — Implementation Guide

## 1. Product Vision

Build a high-impact, globe-first analytics dashboard for philanthropic donation flows. The first thing users see when they enter the site should be a massive, animated, interactive 3D Earth. The globe is not a decorative background; it is the primary navigation and storytelling surface of the dashboard.

The dashboard should immediately communicate:

- Which countries donate funding.
- Which countries receive funding.
- How donation flows move across the world.
- Where the largest patterns, corridors, and concentrations exist.
- That deeper quantitative analysis is available, but only after the user intentionally chooses to explore it.

The core design principle is:

> Start with geographic narrative, then progressively disclose analytical detail.

Users should not be overwhelmed by tables, charts, filters, or dashboards on first load. They should first see the world, understand the global movement of money visually, and then choose whether to inspect specific flows, countries, causes, years, or CSV-derived analytical views.

---

## 2. Overall Dashboard Structure

The dashboard should be organized into three major layers:

1. **Hero Globe Layer**
   - Full-screen or near full-screen animated 3D Earth.
   - Rotatable using mouse drag.
   - Donation flows shown as aggregated directional arcs/arrows.
   - Hover interactions reveal summarized flow information.
   - Primary entry point for exploration.

2. **Insight Entry Layer**
   - Buttons/cards below or beside the globe that let users intentionally enter deeper analysis.
   - Examples:
     - “Explore Country Flows”
     - “View Cause Breakdown”
     - “Analyze Yearly Trends”
     - “Open Data Tables”
     - “Compare Donor and Recipient Countries”

3. **Tabbed Analytics Layer**
   - More traditional charts, maps, tables, and metrics.
   - Organized into tabs to reduce cognitive load.
   - Each tab corresponds either to a major analytical question or one of the generated CSV files.
   - Flags should be shown beside country names wherever space allows.

---

## 3. First Sight / Landing Experience

### 3.1 Hero Requirement

When the user opens the site, the dashboard should immediately render a massive animated globe of planet Earth.

Recommended layout:

```text
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                    Animated 3D Globe                       │
│                                                            │
│      Donor countries  ───────▶  Recipient countries        │
│                                                            │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  [Explore Flows] [Country Insights] [Cause Breakdown]      │
│  [Yearly Trends] [Open Full Dashboard]                     │
└────────────────────────────────────────────────────────────┘
```

The globe should occupy roughly:

- Desktop: 70–85% of viewport height on landing.
- Tablet: 60–75% of viewport height.
- Mobile: 50–65% of viewport height, with simplified interactions.

The first visible experience should avoid a dense chart wall. Do not show all charts immediately on page load.

---

## 4. Globe Interaction Design

### 4.1 Mouse Controls

The globe must support:

- Drag to rotate.
- Scroll or pinch to zoom, if technically stable.
- Auto-rotation when idle.
- Pause auto-rotation while the user is dragging or hovering.
- Resume slow auto-rotation after several seconds of inactivity.

Recommended behavior:

```text
Idle state:
- Globe slowly rotates.
- Major donation arcs animate subtly.

User drag:
- Auto-rotation pauses.
- User can freely rotate globe.

User releases:
- Globe remains at current position.
- Auto-rotation resumes after 3–5 seconds.

User hover over flow:
- Related arc group highlights.
- Tooltip appears.
- Auto-rotation pauses.
```

### 4.2 Donation Arrows

The globe should display arrows from donor countries to recipient countries.

However, the implementation should **not** render every individual donation as a separate line. That would be visually noisy and technically expensive.

Instead, render **aggregated flow arcs**.

A flow arc should represent a grouped relationship such as:

```text
donor_country → recipient_country
```

or, when filters are active:

```text
donor_country → recipient_country → year
donor_country → recipient_country → cause
donor_country → recipient_country → organization_type
```

The visual line is aggregated, but the underlying tooltip and drilldown can expose the number of records or total amount represented by that arc.

### 4.3 Why Aggregated Arcs Are Required

Rendering every donation transaction individually would create:

- Severe visual clutter.
- Poor performance.
- Misleading visual emphasis due to overlapping lines.
- Cognitive overload.
- Hard-to-hover thin line targets.

Aggregated arcs solve this by showing meaningful flows instead of raw records.

The backend or frontend data transformation should aggregate rows before rendering globe flows.

Recommended aggregation:

```text
GROUP BY donor_country, recipient_country
SUM(amount_usd)
COUNT(donation_id)
COUNT(DISTINCT organization)
COUNT(DISTINCT cause_marker)
```

If the dashboard supports filters, aggregation should happen after filters are applied.

---

## 5. Globe Visual Encoding

### 5.1 Arc Thickness

Arc thickness should represent total donation amount.

Example:

```text
Small total amount      → thin arc
Medium total amount     → medium arc
Large total amount      → thick arc
Very large total amount → thick arc with stronger glow
```

Use a logarithmic scale rather than a linear scale, because donation amounts are likely skewed.

Recommended scale:

```ts
arcWidth = scaleLog(total_amount_usd)
```

### 5.2 Arc Color

Arc color can represent one of the following:

Primary recommendation:

```text
Cause category
```

Alternative:

```text
Donor region
Recipient region
Flow intensity
Year bucket
```

Avoid using too many colors at once. If cause categories are too many, use a limited palette and group minor causes as “Other.”

### 5.3 Arc Direction

The arc must visually indicate direction from donor to recipient.

Options:

1. Animated particles moving along the arc.
2. Arrowhead near the recipient country.
3. Flow pulse traveling from donor to recipient.

Recommended:

```text
Use animated particles along arcs.
```

This is usually cleaner than rendering large arrowheads on a globe.

### 5.4 Country Markers

Use country markers at donor and recipient locations.

Marker size can represent:

- Total donated amount for donor countries.
- Total received amount for recipient countries.
- Number of flow relationships.

On hover, markers should show country-level summary.

---

## 6. Hover Interaction Over Donation Arrows

### 6.1 Hover Behavior

When the user hovers over a donation arc, show a tooltip with summarized information.

Tooltip example:

```text
United States → Kenya

Total Donation: $12.4M
Donation Records: 318
Top Cause: Health
Years: 2018–2022

[View Details]
```

### 6.2 Hover Should Highlight Related Data

On hover:

- Highlight the selected arc.
- Dim unrelated arcs.
- Highlight donor and recipient country markers.
- Optionally show country flags in the tooltip.
- Pause auto-rotation.
- Display summarized aggregate data.

### 6.3 Do Not Overload Hover Tooltips

The tooltip should be concise.

Do not put full tables inside globe hover tooltips. Instead, use a “View Details” button that opens a deeper insight panel, drawer, modal, or tab.

---

## 7. Deeper Insight Entry Points

The globe should have separate buttons for users who want more insight or specific filtered batches of donations.

Recommended buttons near the bottom of the globe:

```text
[Explore Flows]
[Country Insights]
[Cause Breakdown]
[Yearly Trends]
[Open Data Tables]
```

### 7.1 Explore Flows

Purpose:

Let users filter donation flows by:

- Year
- Donor country
- Recipient country
- Cause
- Donation amount range
- Region
- Organization/funder type, if available

Output:

- Updated globe arcs.
- Flow table.
- Top donor-recipient corridors.
- Summary cards.

### 7.2 Country Insights

Purpose:

Let users select one country and see:

- Total donated.
- Total received.
- Top partner countries.
- Top causes.
- Yearly trend.
- Country flag.
- Region and income group, if available.

### 7.3 Cause Breakdown

Purpose:

Show how donations are distributed across cause markers or thematic categories.

Output:

- Cause distribution chart.
- Cause-by-country matrix.
- Top countries for each cause.
- Overlap warning if cause markers are multi-tagged.

### 7.4 Yearly Trends

Purpose:

Show changes over time.

Output:

- Total donation amount by year.
- Record count by year.
- Top growing recipient countries.
- Top growing causes.
- Donor/recipient trend comparison.

### 7.5 Open Data Tables

Purpose:

Let users inspect the cleaned CSV-derived data.

Output:

- Searchable, sortable table views.
- CSV source selector.
- Download/export option if appropriate.

---

## 8. Tabbed Analytics Design

The charts and data-heavy part of the dashboard should use tabs. This prevents the user from seeing too many charts at once.

### 8.1 Recommended Tab Structure

Do not simply expose raw CSV filenames as the top-level UX if the filenames are technical. Instead, use human-readable tab names that map to the CSVs internally.

Example tab structure:

```text
Overview
Country Summary
Donor → Recipient Flows
Cause Analysis
Yearly Trends
Raw Data Explorer
Methodology / Data Notes
```

If there are six CSVs, each CSV can map to one tab or sub-tab.

Example:

```text
Overview
├── Executive Summary
├── Key Metrics
└── Top Global Flows

Country Summary
├── donor_country_summary.csv
└── recipient_country_summary.csv

Flow Analysis
└── donor_recipient_flows.csv

Cause Analysis
└── cause_marker_summary.csv

Time Analysis
└── yearly_summary.csv

Data Explorer
└── cleaned_donations.csv
```

### 8.2 Entry Lower Than Tabs

The dashboard should not drop users directly into dense tabs. Put an entry section above or before the tabbed analytics layer.

Recommended entry section:

```text
Continue exploring

Choose a path:
[Understand the global picture]
[Compare countries]
[Analyze causes]
[Inspect the cleaned data]
```

Then below that, show tabs.

This creates a conscious navigation moment before deeper analytics.

### 8.3 Tab UX Requirements

Each tab should have:

- Short title.
- One-sentence explanation.
- 2–4 core charts maximum.
- One supporting table, if needed.
- Local filters only when relevant.
- Country flags next to country names.
- “What this means” insight summary at the top.

Example:

```text
Tab: Country Summary

What this shows:
This view compares how much each country donated and received across the dataset.

Charts:
- Top donor countries by total donation amount.
- Top recipient countries by total received amount.
- Net donor/recipient balance.
- Country-level searchable table.
```

---

## 9. Country Flags

### 9.1 Where to Show Flags

Show country flags in:

- Globe tooltips.
- Country cards.
- Country summary tables.
- Donor-recipient flow tables.
- Dropdown filters.
- Selected-country panels.

Example:

```text
🇺🇸 United States → 🇰🇪 Kenya
```

### 9.2 Implementation Options

Recommended package:

```bash
npm install country-flag-icons
```

Alternative:

```bash
npm install react-world-flags
```

Data requirement:

Every country should be normalized to an ISO 3166-1 alpha-2 code.

Example:

```json
{
  "country_name": "Kenya",
  "iso2": "KE",
  "iso3": "KEN",
  "latitude": -0.0236,
  "longitude": 37.9062
}
```

If the dataset only has country names, create a normalization table.

---

## 10. Data Architecture

### 10.1 Do Not Fetch CSVs Directly From the Frontend

The frontend should not directly fetch raw CSV files. This creates unnecessary coupling and makes filtering harder.

Recommended architecture:

```text
CSV files
   ↓
Import / ETL script
   ↓
Read-only analytical database or cached JSON layer
   ↓
Backend-for-Frontend API
   ↓
Dashboard frontend
```

### 10.2 Single Read-Only Dashboard API

Use a single read-only endpoint pattern.

Example:

```http
GET /api/v1/dashboard-data?view=globe_flows&year=2021&cause=health
```

The frontend requests a specific view, and the backend returns the already-shaped data needed by that component.

Recommended views:

```text
globe_flows
country_summary
flow_summary
cause_summary
yearly_summary
raw_table
overview_metrics
```

### 10.3 Example API Response for Globe

```json
{
  "view": "globe_flows",
  "filters": {
    "year": "all",
    "cause": "all"
  },
  "data": [
    {
      "donor_country": "United States",
      "donor_iso2": "US",
      "donor_lat": 37.0902,
      "donor_lng": -95.7129,
      "recipient_country": "Kenya",
      "recipient_iso2": "KE",
      "recipient_lat": -0.0236,
      "recipient_lng": 37.9062,
      "total_amount_usd": 12400000,
      "donation_count": 318,
      "top_cause": "Health",
      "years": [2018, 2019, 2020, 2021, 2022]
    }
  ]
}
```

### 10.4 Example API Response for Country Summary

```json
{
  "view": "country_summary",
  "data": [
    {
      "country": "Kenya",
      "iso2": "KE",
      "total_received_usd": 25400000,
      "total_donated_usd": 120000,
      "net_received_usd": 25280000,
      "top_cause": "Health",
      "flow_count": 42
    }
  ]
}
```

---

## 11. Suggested Frontend Stack

Recommended stack:

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
React Query or SWR
Globe.gl / react-globe.gl / Three.js
Recharts or ECharts
TanStack Table
```

### 11.1 Globe Library Options

Strong recommendation:

```bash
npm install react-globe.gl three
```

Why:

- Good support for arcs.
- Supports points, labels, rings, polygons, and custom layers.
- Easier than building raw Three.js from scratch.
- Suitable for interactive geographic flow maps.

Alternative:

```bash
npm install three @react-three/fiber @react-three/drei
```

Use this only if custom visual polish is more important than development speed.

### 11.2 Chart Library

Recommended:

```bash
npm install recharts
```

Use Recharts for:

- Bar charts.
- Line charts.
- Area charts.
- Pie/donut charts.
- Simple composed charts.

For more complex analytical visualization, consider:

```bash
npm install echarts-for-react
```

---

## 12. Suggested Component Structure

```text
src/
  app/
    page.tsx
    api/
      v1/
        dashboard-data/
          route.ts

  components/
    globe/
      DonationGlobe.tsx
      GlobeTooltip.tsx
      GlobeControls.tsx
      FlowLegend.tsx

    dashboard/
      DashboardShell.tsx
      InsightEntryCards.tsx
      AnalyticsTabs.tsx
      OverviewTab.tsx
      CountrySummaryTab.tsx
      FlowAnalysisTab.tsx
      CauseAnalysisTab.tsx
      YearlyTrendsTab.tsx
      RawDataExplorerTab.tsx
      MethodologyTab.tsx

    charts/
      TopDonorCountriesChart.tsx
      TopRecipientCountriesChart.tsx
      CauseBreakdownChart.tsx
      YearlyTrendChart.tsx
      FlowCorridorChart.tsx

    tables/
      CountrySummaryTable.tsx
      FlowTable.tsx
      RawDonationTable.tsx

    ui/
      CountryFlag.tsx
      MetricCard.tsx
      EmptyState.tsx
      LoadingState.tsx

  lib/
    api.ts
    country-normalization.ts
    formatters.ts
    scales.ts
    types.ts

  data/
    country_metadata.json
```

---

## 13. Page Layout Recommendation

### 13.1 Main Page Flow

```tsx
export default function DashboardPage() {
  return (
    <main>
      <HeroGlobeSection />
      <InsightEntrySection />
      <AnalyticsDashboardSection />
      <MethodologySection />
    </main>
  );
}
```

### 13.2 Hero Globe Section

Responsibilities:

- Fetch `globe_flows`.
- Render 3D Earth.
- Render aggregated arcs.
- Handle hover.
- Handle drag/rotation.
- Show selected flow summary.
- Provide entry buttons.

### 13.3 Analytics Dashboard Section

Responsibilities:

- Render tab navigation.
- Fetch data according to active tab.
- Render charts and tables.
- Keep each tab focused.

---

## 14. Globe Implementation Notes

### 14.1 Example Data Shape for `react-globe.gl`

```ts
type GlobeFlow = {
  donor_country: string;
  donor_iso2: string;
  donor_lat: number;
  donor_lng: number;
  recipient_country: string;
  recipient_iso2: string;
  recipient_lat: number;
  recipient_lng: number;
  total_amount_usd: number;
  donation_count: number;
  top_cause?: string;
};
```

Map this to arcs:

```ts
const arcs = flows.map((flow) => ({
  startLat: flow.donor_lat,
  startLng: flow.donor_lng,
  endLat: flow.recipient_lat,
  endLng: flow.recipient_lng,
  amount: flow.total_amount_usd,
  donationCount: flow.donation_count,
  donorCountry: flow.donor_country,
  recipientCountry: flow.recipient_country,
  donorIso2: flow.donor_iso2,
  recipientIso2: flow.recipient_iso2,
  topCause: flow.top_cause
}));
```

### 14.2 Arc Width Scaling

```ts
function getArcWidth(amount: number, maxAmount: number) {
  const safeAmount = Math.max(amount, 1);
  const safeMax = Math.max(maxAmount, 1);
  return 0.15 + (Math.log10(safeAmount) / Math.log10(safeMax)) * 1.8;
}
```

### 14.3 Tooltip State

```ts
const [hoveredFlow, setHoveredFlow] = useState<GlobeFlow | null>(null);
```

When hovering over an arc:

```tsx
<Globe
  arcsData={arcs}
  onArcHover={(arc) => setHoveredFlow(arc as GlobeFlow)}
/>
```

### 14.4 Avoid Rendering Too Many Arcs

Set a maximum number of arcs on the landing globe.

Recommended:

```text
Initial landing globe: top 100–300 aggregated flows.
Filtered globe: up to 500 aggregated flows.
Full table: no visual limit, but paginated.
```

If the dataset has thousands of donor-recipient pairs, show the top flows by total amount and group the rest under “Other flows” in charts, not on the globe.

---

## 15. Filtering Design

### 15.1 Global Filters

Global filters should affect both the globe and analytics tabs.

Recommended global filters:

- Year
- Cause
- Donor country
- Recipient country
- Region
- Minimum donation amount

### 15.2 Filter Placement

Do not place a large filter panel over the landing globe by default.

Instead:

- Show compact filter chips or a “Filter flows” button.
- Open filters in a side drawer.
- Apply filters intentionally.

### 15.3 Filter UX

Example:

```text
[Filter Flows]

Active filters:
Year: 2021
Cause: Health
Donor: United States
```

The user should always be able to clear filters.

---

## 16. CSV-to-Tab Mapping

Because the project has multiple CSV files, structure them in the UI as analytical views.

Use this mapping pattern:

| CSV Type | Suggested Tab | Purpose |
|---|---|---|
| Cleaned donation-level data | Raw Data Explorer | Inspect cleaned records |
| Country summary data | Country Summary | Compare donor/recipient countries |
| Donor-recipient flow data | Flow Analysis | Analyze bilateral donation corridors |
| Cause marker data | Cause Analysis | Understand issue/cause distribution |
| Year summary data | Yearly Trends | Understand time-based changes |
| Dashboard metrics / overview data | Overview | Show high-level KPIs |

If actual CSV names differ, keep the UX names human-readable and map internally.

---

## 17. Important Data Warnings

### 17.1 Cause Marker Overlap

If cause markers are Boolean columns and a donation can belong to multiple causes, do not blindly sum cause marker counts as if they are mutually exclusive.

Example problem:

```text
One donation can be tagged as both Health and Education.
```

So:

```text
Health count + Education count may exceed total donation count.
```

The UI should include a note in the Cause Analysis tab:

```text
Note: Cause categories may overlap because a single donation can be tagged with multiple cause markers.
```

### 17.2 Null Handling

The implementation guide should preserve the cleaning assumptions from the data handoff.

Frontend should not reinterpret null values inconsistently.

Recommended display rules:

```text
Missing country      → "Unknown country"
Missing amount       → exclude from amount totals, include in record counts if useful
Missing cause        → "Uncategorized"
Missing year         → "Unknown year"
Missing organization → "Unknown organization"
```

### 17.3 Country Name Normalization

Country names must be normalized before globe rendering.

Examples:

```text
USA → United States
U.S. → United States
United States of America → United States
UK → United Kingdom
```

Every country used on the globe must have:

```text
country_name
iso2
iso3
latitude
longitude
```

---

## 18. Backend Implementation Guide

### 18.1 Recommended Storage

For a simple project:

```text
SQLite database
```

For larger datasets:

```text
PostgreSQL
```

For frontend-only prototype:

```text
Precomputed JSON files
```

Best practical recommendation:

```text
Use SQLite or DuckDB for local analytical querying, then expose a Next.js API route.
```

### 18.2 Import Script

Create an import script that:

1. Reads the six CSV files.
2. Normalizes column names.
3. Validates country names.
4. Joins country metadata.
5. Creates pre-aggregated tables.
6. Saves into SQLite/DuckDB or JSON.

Example generated tables:

```text
cleaned_donations
country_summary
donor_recipient_flows
cause_summary
yearly_summary
overview_metrics
```

### 18.3 API Route Example

```ts
// app/api/v1/dashboard-data/route.ts

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const view = searchParams.get("view") ?? "overview";
  const year = searchParams.get("year");
  const cause = searchParams.get("cause");
  const donor = searchParams.get("donor");
  const recipient = searchParams.get("recipient");

  switch (view) {
    case "globe_flows":
      return Response.json(await getGlobeFlows({ year, cause, donor, recipient }));

    case "country_summary":
      return Response.json(await getCountrySummary({ year, cause }));

    case "flow_summary":
      return Response.json(await getFlowSummary({ year, cause, donor, recipient }));

    case "cause_summary":
      return Response.json(await getCauseSummary({ year, donor, recipient }));

    case "yearly_summary":
      return Response.json(await getYearlySummary({ cause, donor, recipient }));

    case "raw_table":
      return Response.json(await getRawTable({ year, cause, donor, recipient }));

    default:
      return Response.json(
        { error: "Invalid dashboard view" },
        { status: 400 }
      );
  }
}
```

---

## 19. Frontend Implementation Phases

### Phase 1 — Data Contract and Static UI

Build:

- TypeScript data types.
- API client functions.
- Static layout.
- Placeholder globe.
- Placeholder tabs.
- Placeholder charts.

Goal:

```text
The page structure feels correct before real data is fully wired.
```

### Phase 2 — Globe MVP

Build:

- Interactive globe.
- Aggregated arcs.
- Country markers.
- Hover tooltip.
- Auto-rotation.
- Entry buttons.

Goal:

```text
The first-sight dashboard experience works.
```

### Phase 3 — API Integration

Build:

- `/api/v1/dashboard-data`.
- `globe_flows` response.
- `country_summary` response.
- `cause_summary` response.
- `yearly_summary` response.
- `raw_table` response.

Goal:

```text
Frontend no longer depends directly on CSV files.
```

### Phase 4 — Analytics Tabs

Build:

- Overview tab.
- Country Summary tab.
- Flow Analysis tab.
- Cause Analysis tab.
- Yearly Trends tab.
- Raw Data Explorer tab.
- Methodology tab.

Goal:

```text
Each tab answers one analytical question clearly.
```

### Phase 5 — Visual Polish

Add:

- Smooth transitions.
- Loading skeletons.
- Empty states.
- Better legends.
- Country flags.
- Responsive layout.
- Dark-mode-compatible visual design.

Goal:

```text
The dashboard feels like a polished portfolio-level product.
```

---

## 20. Suggested UI Copy

### 20.1 Hero Title

```text
Global Donation Flows
```

### 20.2 Hero Subtitle

```text
Explore how philanthropic funding moves from donor countries to recipient countries across the world.
```

### 20.3 Globe Hint

```text
Drag to rotate the globe. Hover over a flow to inspect aggregated donation movement.
```

### 20.4 Insight Entry Header

```text
Go deeper
```

### 20.5 Insight Entry Description

```text
Choose a focused view to analyze countries, causes, yearly trends, or the cleaned dataset.
```

---

## 21. Visual Design Direction

### 21.1 Style

The dashboard should feel:

- Global.
- Analytical.
- Premium.
- Calm.
- Not cluttered.
- More like an intelligence product than a generic school dashboard.

### 21.2 Recommended Aesthetic

```text
Dark background
Subtle grid or starfield
Glowing globe
Soft arcs
Glassmorphism cards
Minimal but readable labels
```

Avoid:

- Too many bright colors.
- Too many charts on one screen.
- Tiny unreadable labels.
- Dense tables above the fold.
- Raw CSV filenames as primary navigation labels.

### 21.3 Color Use

Recommended:

- Background: deep navy / charcoal.
- Globe: muted blue and green or realistic Earth texture.
- Arcs: cause-based or intensity-based.
- Cards: translucent dark surfaces.
- Text: high-contrast white/gray.

---

## 22. Accessibility Requirements

Even though the globe is visual, the dashboard should still be usable with non-visual aids.

Requirements:

- Provide chart/table equivalents for globe flows.
- Use semantic buttons.
- Keyboard-accessible tabs.
- Do not rely only on color to communicate cause or intensity.
- Tooltips should have equivalent selected-state panels.
- Maintain sufficient contrast.
- Add ARIA labels for major controls.

Example:

```tsx
<button aria-label="Open country insights">
  Country Insights
</button>
```

---

## 23. Performance Requirements

### 23.1 Globe Performance

Do:

- Limit initial arcs.
- Use aggregated data.
- Memoize transformed arc data.
- Lazy-load analytics tabs.
- Avoid rendering massive table data at once.

Do not:

- Render every raw donation as an arc.
- Fetch all CSVs on page load.
- Load all chart data before user opens tabs.
- Recompute country coordinates repeatedly.

### 23.2 Recommended Data Limits

```text
Landing globe arcs: 100–300
Filtered globe arcs: up to 500
Tables: paginated, 25–100 rows per page
Charts: top 10–25 categories unless expanded
```

---

## 24. Testing Checklist

### 24.1 Globe

- [ ] Globe loads on first page view.
- [ ] Globe rotates automatically when idle.
- [ ] User can drag to rotate globe.
- [ ] Hovering over an arc shows tooltip.
- [ ] Tooltip shows donor and recipient countries.
- [ ] Tooltip shows total amount and donation count.
- [ ] Arc thickness reflects amount.
- [ ] Direction from donor to recipient is clear.
- [ ] Auto-rotation pauses during hover or drag.
- [ ] Globe still works when no filters are selected.
- [ ] Globe gracefully handles empty filtered results.

### 24.2 Data

- [ ] Country names are normalized.
- [ ] ISO2 codes exist for flags.
- [ ] Coordinates exist for globe rendering.
- [ ] Amounts are formatted as currency.
- [ ] Null values display consistently.
- [ ] Cause marker overlap warning is visible.
- [ ] API returns predictable view-based responses.

### 24.3 Tabs

- [ ] Tabs are keyboard accessible.
- [ ] Each tab has a clear explanation.
- [ ] No tab shows too many charts at once.
- [ ] Country flags appear in country views.
- [ ] Tables are searchable and sortable.
- [ ] Raw data is paginated.

### 24.4 Responsive

- [ ] Globe is usable on laptop screens.
- [ ] Globe scales down on mobile.
- [ ] Tabs do not overflow horizontally without scroll support.
- [ ] Tooltips do not go off-screen.
- [ ] Buttons remain tappable on mobile.

---

## 25. Instructions for Coding Agent

Use these instructions when handing this project to a coding agent.

```text
You are implementing a global philanthropic donation dashboard.

The landing page must be globe-first. The first visible section should be a massive animated 3D globe that users can rotate with the mouse. Donation flows should be shown as aggregated directional arcs from donor countries to recipient countries. Do not render every raw donation row as a separate globe line. Aggregate by donor country and recipient country, then visualize those grouped flows.

The globe should support hover behavior. When a user hovers over a donation arc, show a concise tooltip with donor country, recipient country, total donation amount, donation count, top cause if available, and a button or interaction to view deeper details. Hover should highlight the selected flow and dim unrelated flows.

Below the globe, create intentional entry buttons for deeper analysis, such as Explore Flows, Country Insights, Cause Breakdown, Yearly Trends, and Open Data Tables.

The more data-heavy dashboard section should be organized with tabs to reduce cognitive load. Use human-readable tab names. Each tab should answer one analytical question and should contain a limited number of charts. Map the six CSV-derived datasets into organized analytical tabs rather than dumping all CSVs directly into the UI.

Show country flags wherever country names appear in cards, tables, dropdowns, and tooltips. Normalize countries to ISO2 codes before rendering flags.

Use a backend-for-frontend API instead of fetching raw CSVs directly in the frontend. Implement a route like `/api/v1/dashboard-data?view=globe_flows`. Supported views should include globe_flows, country_summary, flow_summary, cause_summary, yearly_summary, raw_table, and overview_metrics.

Prioritize performance. Limit the landing globe to the top aggregated flows by amount. Use pagination for tables. Lazy-load tab content when possible.

The final dashboard should feel premium, global, analytical, and uncluttered.
```

---

## 26. Definition of Done

The dashboard implementation is complete when:

- The first screen is dominated by an animated, interactive globe.
- Users can rotate the globe with the mouse.
- Donation flows appear as aggregated donor-to-recipient arcs.
- Hovering over flows reveals concise aggregated insight.
- Users can intentionally move from the globe into deeper analysis.
- Analytics are organized into tabs rather than one overwhelming page.
- Each major CSV-derived dataset has a clear home in the UI.
- Country flags are shown consistently.
- Data is served through a stable read-only API.
- The dashboard avoids cognitive overload and performs smoothly.
