# Feature Plan: Country-Focused Donation Corridors on Interactive Globe

## 1. Feature Goal

The current globe visualization shows the top 25–100 largest donation corridors as visible arcs between countries. This creates visual clutter because many arcs overlap, cross the globe, and compete for attention.

This feature redesigns the globe so users can focus on one country at a time. When the user hovers over or clicks a country, the globe should show only the donation corridors going **into** and **out of** that selected country. The result should feel cleaner, more analytical, and easier to visually understand.

The intended experience:

> “I can explore the globe normally, then focus on a single country and instantly see who gives to it and who receives from it.”

---

## 2. Core Product Requirements

### 2.1 Default Globe View

When no country is selected:

- Show the globe with country boundaries and subtle country fill.
- Show either:
  - a limited set of global top corridors, or
  - no corridor arcs by default, depending on performance and visual clarity.
- The default state should not look like a tangled web of lines.
- The visual priority should be:
  1. Earth/globe
  2. Country hover affordance
  3. Minimal donation-flow preview
  4. Instructional hint

Recommended default:

- Display only the **top 15–25 global corridors** with very low opacity.
- Add a UI hint:

```text
Hover or click a country to focus its donation corridors
```

This keeps the globe alive without overwhelming the user.

---

### 2.2 Country Hover Behavior

When the user hovers over a country:

- Temporarily highlight that country.
- Show only corridors connected to that country:
  - outbound corridors: selected country → recipient countries
  - inbound corridors: donor countries → selected country
- Fade or hide all unrelated corridors.
- Show a compact tooltip near the cursor or country.

Tooltip should include:

```text
Country name
Total outbound donations
Total inbound donations
Net donor / net recipient status
Number of connected countries
Click to pin this view
```

Hover should be lightweight and reversible. When the mouse leaves the country, return to the default globe state unless a country is pinned.

---

### 2.3 Country Click Behavior

When the user clicks a country:

- Pin the country-focused view.
- Keep only that country’s inbound/outbound corridors visible.
- Keep the selected country highlighted.
- Show a persistent side panel with deeper details.
- The user can rotate the globe while the country stays selected.
- The user can clear the selection with:
  - an `X` button in the side panel
  - clicking empty globe space
  - pressing `Esc`

Pinned selection should override hover behavior. If a country is pinned and the user hovers another country, either:

- do not change the corridor set, or
- show a subtle preview but keep the pinned country dominant.

Recommended: keep pinned view stable until explicitly cleared.

---

## 3. Interaction State Model

Implement the globe using a simple state machine.

### 3.1 States

```ts
type GlobeFocusMode = "overview" | "hover-focus" | "pinned-focus";

interface GlobeInteractionState {
  mode: GlobeFocusMode;
  hoveredCountryIso3: string | null;
  pinnedCountryIso3: string | null;
  activeCountryIso3: string | null;
}
```

### 3.2 State Logic

| User Action | Current State | Result |
|---|---:|---|
| Hover country | overview | `hover-focus` |
| Leave country | hover-focus | `overview` |
| Click country | any | `pinned-focus` |
| Hover another country | pinned-focus | no corridor change |
| Click another country | pinned-focus | switch pinned country |
| Click empty globe | pinned-focus | `overview` |
| Press Esc | pinned-focus | `overview` |
| Press clear button | pinned-focus | `overview` |

### 3.3 Active Country Resolution

```ts
const activeCountryIso3 =
  pinnedCountryIso3 ?? hoveredCountryIso3 ?? null;
```

The visible corridors are derived from `activeCountryIso3`.

---

## 4. Visual Design Requirements

### 4.1 Country Styling

#### Default country style

- Neutral fill.
- Thin border.
- Low contrast.
- Avoid making every country visually loud.

#### Hovered country style

- Brighter fill.
- Stronger border.
- Slight outer glow.
- Cursor should become pointer.

#### Pinned country style

- Strongest highlight.
- Persistent glow or outline.
- Side panel should clearly say the selected country name.

Example visual hierarchy:

```ts
countryStyle = {
  default: {
    fillOpacity: 0.18,
    strokeOpacity: 0.35,
  },
  hovered: {
    fillOpacity: 0.55,
    strokeOpacity: 0.9,
  },
  pinned: {
    fillOpacity: 0.75,
    strokeOpacity: 1.0,
    glow: true,
  },
};
```

---

### 4.2 Corridor Styling

Use two distinct visual categories:

| Flow Type | Direction | Suggested Treatment |
|---|---|---|
| Outbound | selected country → recipient | brighter / warmer / animated forward |
| Inbound | donor → selected country | cooler / secondary / animated forward |

Do not rely only on color. Also use:

- arrowheads
- animation direction
- legend labels
- arc start/end glow
- side panel grouping

This matters for accessibility and visual interpretation.

---

### 4.3 Arc Width Scaling

Do not use raw donation amount linearly. Large corridors will dominate too much.

Use logarithmic or square-root scaling.

Recommended:

```ts
const width = scaleLog()
  .domain([minAmount, maxAmount])
  .range([0.4, 4.5]);
```

Fallback:

```ts
const width = Math.sqrt(amount) * scaleFactor;
```

Minimum width should still be visible.

---

### 4.4 Arc Opacity Scaling

For selected-country focus:

- Top corridors: high opacity.
- Smaller corridors: medium-low opacity.
- Unrelated corridors: hidden, not merely faded.

Recommended opacity:

```ts
const opacity = 0.25 + 0.65 * normalizedAmount;
```

Avoid showing hundreds of faint lines. It still becomes messy.

---

### 4.5 Arc Count Limits

For a selected country, do not automatically render every corridor if the country has many connections.

Recommended rules:

```text
Show top 20 outbound corridors
Show top 20 inbound corridors
Allow user to expand to top 50 each
```

The side panel can show complete tabular data separately.

Default focus view:

```ts
const MAX_INBOUND_ARCS = 20;
const MAX_OUTBOUND_ARCS = 20;
```

Add a control:

```text
Visible corridors: Top 10 / Top 25 / Top 50 / All
```

Default should be Top 25 or lower.

---

### 4.6 Self-Flows

Some datasets may include same-country donor/recipient pairs, such as China → China.

These should not be drawn as normal globe arcs.

Handle self-flows separately:

- Do not draw an arc from a country to itself.
- Show self-flow in the side panel as:

```text
Domestic / same-country flow
```

Optional visual:

- small pulsing ring over the country
- small vertical halo
- no global arc

---

## 5. Data Requirements

The globe needs a country-pair corridor table.

Each row should represent an aggregated donation corridor.

### 5.1 Required Fields

```ts
interface DonationCorridor {
  donor_iso3: string;
  donor_name: string;
  recipient_iso3: string;
  recipient_name: string;
  donor_lat: number;
  donor_lng: number;
  recipient_lat: number;
  recipient_lng: number;
  amount_usd: number;
  donation_count?: number;
  year?: number;
  sector?: string;
  cause?: string;
}
```

### 5.2 Derived Fields

Add derived fields at load time or API time:

```ts
interface DerivedDonationCorridor extends DonationCorridor {
  is_self_flow: boolean;
  arc_type: "inbound" | "outbound" | "unrelated";
  amount_rank_global: number;
}
```

For selected country:

```ts
type FocusedCorridorType = "inbound" | "outbound" | "self";
```

---

## 6. Data Indexing Strategy

For performance, do not filter the full dataset on every mouse hover if the dataset is large.

Build an index by country ISO3.

### 6.1 Recommended Index Shape

```ts
interface CountryCorridorIndex {
  [iso3: string]: {
    inbound: DonationCorridor[];
    outbound: DonationCorridor[];
    selfFlows: DonationCorridor[];
    totalInboundUsd: number;
    totalOutboundUsd: number;
    netUsd: number;
    connectedCountryCount: number;
  };
}
```

### 6.2 Index Construction

```ts
function buildCountryCorridorIndex(corridors: DonationCorridor[]): CountryCorridorIndex {
  const index: CountryCorridorIndex = {};

  for (const corridor of corridors) {
    const donor = corridor.donor_iso3;
    const recipient = corridor.recipient_iso3;

    if (!index[donor]) {
      index[donor] = createEmptyCountryCorridorStats();
    }

    if (!index[recipient]) {
      index[recipient] = createEmptyCountryCorridorStats();
    }

    if (donor === recipient) {
      index[donor].selfFlows.push(corridor);
      continue;
    }

    index[donor].outbound.push(corridor);
    index[recipient].inbound.push(corridor);

    index[donor].totalOutboundUsd += corridor.amount_usd;
    index[recipient].totalInboundUsd += corridor.amount_usd;
  }

  for (const iso3 of Object.keys(index)) {
    index[iso3].outbound.sort((a, b) => b.amount_usd - a.amount_usd);
    index[iso3].inbound.sort((a, b) => b.amount_usd - a.amount_usd);

    index[iso3].netUsd =
      index[iso3].totalOutboundUsd - index[iso3].totalInboundUsd;

    const connected = new Set<string>();

    for (const c of index[iso3].outbound) {
      connected.add(c.recipient_iso3);
    }

    for (const c of index[iso3].inbound) {
      connected.add(c.donor_iso3);
    }

    index[iso3].connectedCountryCount = connected.size;
  }

  return index;
}
```

---

## 7. Corridor Filtering Logic

### 7.1 Overview Mode

When `activeCountryIso3 === null`:

```ts
visibleCorridors = globalTopCorridors.slice(0, overviewLimit);
```

Recommended `overviewLimit`:

```ts
const DEFAULT_OVERVIEW_LIMIT = 25;
```

Alternative cleaner mode:

```ts
visibleCorridors = [];
```

Use a product setting:

```ts
const SHOW_OVERVIEW_ARCS = true;
```

---

### 7.2 Focus Mode

When a country is active:

```ts
const countryData = countryCorridorIndex[activeCountryIso3];

const visibleInbound = countryData.inbound.slice(0, inboundLimit);
const visibleOutbound = countryData.outbound.slice(0, outboundLimit);

visibleCorridors = [
  ...visibleInbound.map(c => ({ ...c, focusType: "inbound" })),
  ...visibleOutbound.map(c => ({ ...c, focusType: "outbound" })),
];
```

Recommended defaults:

```ts
const inboundLimit = 20;
const outboundLimit = 20;
```

---

### 7.3 Filters

The country-focused corridors should respect all active dashboard filters.

Examples:

- year
- donor type
- recipient type
- sector
- cause
- region
- donation amount range

Important rule:

> Build or recompute the country corridor index after applying filters.

Correct order:

```text
raw corridors
→ apply global dashboard filters
→ aggregate by donor-recipient pair if needed
→ build country corridor index
→ derive visible corridors from selected country
```

Do not use an index built from unfiltered data if filters are active.

---

## 8. Side Panel Design

When a country is clicked, open a persistent side panel.

### 8.1 Side Panel Header

```text
[Flag] Country Name
Net donor / Net recipient / Balanced
```

Include:

```text
Outbound: $X
Inbound: $Y
Net: $Z
Connected countries: N
```

### 8.2 Side Panel Tabs

Use small tabs inside the panel:

```text
Overview | Outbound | Inbound | Self-Flows
```

#### Overview Tab

Show:

- total inbound
- total outbound
- net amount
- top donor countries
- top recipient countries
- small bar comparison

#### Outbound Tab

Table columns:

```text
Recipient country | Amount | Donation count | Share of outbound
```

#### Inbound Tab

Table columns:

```text
Donor country | Amount | Donation count | Share of inbound
```

#### Self-Flows Tab

Only show if self-flows exist.

```text
Same-country flows are excluded from globe arcs because they do not represent cross-border corridors.
```

---

## 9. Recommended UI Layout

### 9.1 Globe Area

The globe remains the hero visual.

Suggested structure:

```text
┌──────────────────────────────────────────────┐
│ Top-left: view mode controls                 │
│ Top-right: filters/search                    │
│                                              │
│              Interactive Globe               │
│                                              │
│ Bottom-left: legend                          │
│ Bottom-center: hint text                     │
└──────────────────────────────────────────────┘
```

### 9.2 Controls

Add lightweight controls:

```text
View:
[Overview] [Country Focus]

Corridors:
[Top 10] [Top 25] [Top 50] [All]

Direction:
[Inbound] [Outbound] [Both]
```

Default:

```text
View: Overview
Corridors: Top 25
Direction: Both
```

When a country is selected, switch label to:

```text
Focused on: Germany ×
```

---

## 10. Search Feature

Add a country search box.

Purpose:

- mobile users cannot hover
- users may not want to rotate globe manually
- accessibility improvement

Behavior:

- Search country by name or ISO3.
- On select:
  - rotate globe toward the country
  - pin the country
  - show country-focused corridors
  - open side panel

Example:

```text
Search country...
```

Implementation:

```ts
function selectCountryByIso3(iso3: string) {
  setPinnedCountryIso3(iso3);
  setHoveredCountryIso3(null);
  rotateGlobeToCountry(iso3);
}
```

---

## 11. Globe Rotation Behavior

When a country is selected from search or click:

- smoothly rotate the globe to center the country if possible
- keep user control after animation
- do not auto-rotate while country is pinned unless explicitly enabled

Recommended behavior:

```ts
if (pinnedCountryIso3) {
  globeAutoRotate = false;
}
```

When no country is selected:

```ts
globeAutoRotate = true;
```

Use slow auto-rotation only in overview mode.

---

## 12. Animation Details

### 12.1 Arc Animation

Use moving dash/particle animation to show direction.

For inbound:

```text
donor → selected country
```

For outbound:

```text
selected country → recipient
```

Animation direction must match real flow direction.

### 12.2 Transition Between States

When changing active country:

- fade old arcs out
- fade new arcs in
- avoid abrupt full re-render flicker

Acceptable implementation:

```ts
setVisibleCorridors([]);
setTimeout(() => setVisibleCorridors(nextCorridors), 120);
```

Better implementation:

- keep stable keys per corridor
- use opacity interpolation if the globe library supports it

### 12.3 Selected Country Pulse

When pinned:

- subtle pulse ring over the country
- no aggressive flashing
- should feel premium and analytical, not arcade-like

---

## 13. Accessibility Requirements

- Country search must support keyboard input.
- Selected country can be cleared with `Esc`.
- Direction categories should not rely only on color.
- Tooltips should be readable against globe background.
- Arc legend should explain:
  - inbound
  - outbound
  - line thickness
  - top-N limitation
- Side panel tables should be screen-reader friendly if possible.

---

## 14. Mobile / Touch Behavior

Hover does not exist on mobile.

Mobile behavior:

- tap country once = pin country
- tap selected country again = keep selected, do not toggle accidentally
- tap empty space or close button = clear selection
- side panel becomes bottom sheet instead of right panel

Mobile side panel layout:

```text
Bottom sheet collapsed:
[Flag] Country Name | Outbound $X | Inbound $Y

Expanded:
Full tabs and tables
```

---

## 15. Error and Empty States

### 15.1 No Corridors for Country

If selected country has no flows under active filters:

```text
No donation corridors found for this country under the current filters.
Try changing the year, cause, or corridor limit.
```

Do not leave the globe blank without explanation.

### 15.2 Missing Coordinates

If a corridor has missing donor or recipient coordinates:

- exclude it from globe arc rendering
- keep it in side-panel table if the country is selected
- log warning in development

```ts
if (!hasValidCoordinates(corridor)) {
  return false;
}
```

### 15.3 Unknown ISO3

If a country polygon does not match the dataset ISO3:

- still allow hover visual highlight
- show tooltip:

```text
No donation data available
```

---

## 16. API / Data Loading Plan

### 16.1 Option A: Frontend Static Data

Use if dataset is small enough.

Files:

```text
/public/data/corridors.json
/public/data/countries.geojson
```

Frontend flow:

```text
fetch corridors
fetch countries
apply filters client-side
build index client-side
render globe
```

Pros:

- simple
- fast to implement
- no backend needed

Cons:

- may become slow for large datasets
- heavy initial load

---

### 16.2 Option B: Backend API

Use if dataset is large or filters are complex.

Recommended endpoint:

```http
GET /api/v1/globe/country-focus?iso3=USA&year=2021&direction=both&limit=25
```

Response:

```ts
interface CountryFocusResponse {
  country: {
    iso3: string;
    name: string;
    flag?: string;
    lat: number;
    lng: number;
  };
  totals: {
    inboundUsd: number;
    outboundUsd: number;
    netUsd: number;
    connectedCountryCount: number;
  };
  corridors: {
    inbound: DonationCorridor[];
    outbound: DonationCorridor[];
    selfFlows: DonationCorridor[];
  };
}
```

Pros:

- scalable
- smaller frontend memory load
- easier to query filtered subsets

Cons:

- more backend work
- hover may become too slow if every hover triggers network call

Recommended hybrid:

```text
Preload country-level index for hover.
Fetch detailed side-panel data on click.
```

---

## 17. Implementation Tasks for Codex

### Task 1: Identify Current Globe Component

Find the component responsible for rendering the globe.

Likely files may include names like:

```text
Globe.tsx
DonationGlobe.tsx
WorldGlobe.tsx
HeroGlobe.tsx
FlowGlobe.tsx
```

Codex should inspect:

- globe library being used
- current arc data shape
- current country polygon data shape
- existing filters
- current tooltip implementation
- current top-N corridor logic

---

### Task 2: Normalize Corridor Data

Create a normalized corridor type.

Add or verify fields:

```ts
donor_iso3
recipient_iso3
donor_lat
donor_lng
recipient_lat
recipient_lng
amount_usd
```

If the existing data uses different names, create a mapping function:

```ts
function normalizeCorridor(raw: RawCorridor): DonationCorridor {
  return {
    donor_iso3: raw.donor_iso3 ?? raw.source_iso3,
    recipient_iso3: raw.recipient_iso3 ?? raw.target_iso3,
    donor_lat: raw.donor_lat ?? raw.source_lat,
    donor_lng: raw.donor_lng ?? raw.source_lng,
    recipient_lat: raw.recipient_lat ?? raw.target_lat,
    recipient_lng: raw.recipient_lng ?? raw.target_lng,
    amount_usd: Number(raw.amount_usd ?? raw.amount ?? 0),
    ...
  };
}
```

---

### Task 3: Build Country Corridor Index

Create a helper file:

```text
src/lib/globe/buildCountryCorridorIndex.ts
```

Export:

```ts
buildCountryCorridorIndex(corridors)
getFocusedCorridors(index, iso3, options)
getCountryFlowStats(index, iso3)
```

Suggested options:

```ts
interface FocusedCorridorOptions {
  inboundLimit: number;
  outboundLimit: number;
  direction: "inbound" | "outbound" | "both";
}
```

---

### Task 4: Add Globe Interaction State

Inside the globe component:

```ts
const [hoveredCountryIso3, setHoveredCountryIso3] = useState<string | null>(null);
const [pinnedCountryIso3, setPinnedCountryIso3] = useState<string | null>(null);

const activeCountryIso3 = pinnedCountryIso3 ?? hoveredCountryIso3;
const isPinned = pinnedCountryIso3 !== null;
```

Add handlers:

```ts
function handleCountryHover(country) {
  if (pinnedCountryIso3) return;
  setHoveredCountryIso3(getIso3(country));
}

function handleCountryLeave() {
  if (pinnedCountryIso3) return;
  setHoveredCountryIso3(null);
}

function handleCountryClick(country) {
  setPinnedCountryIso3(getIso3(country));
  setHoveredCountryIso3(null);
}

function clearCountryFocus() {
  setPinnedCountryIso3(null);
  setHoveredCountryIso3(null);
}
```

Add `Esc` listener:

```ts
useEffect(() => {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      clearCountryFocus();
    }
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, []);
```

---

### Task 5: Replace Global Arc Rendering With Derived Visible Corridors

Current implementation likely does something like:

```ts
const arcsData = topCorridors;
```

Replace with:

```ts
const arcsData = useMemo(() => {
  if (!activeCountryIso3) {
    return overviewCorridors.slice(0, overviewLimit);
  }

  return getFocusedCorridors(countryCorridorIndex, activeCountryIso3, {
    inboundLimit,
    outboundLimit,
    direction,
  });
}, [
  activeCountryIso3,
  overviewCorridors,
  overviewLimit,
  countryCorridorIndex,
  inboundLimit,
  outboundLimit,
  direction,
]);
```

---

### Task 6: Add Direction-Sensitive Arc Styling

Arc color/opacity/width should depend on focus type.

Example:

```ts
function getArcColor(corridor) {
  if (!activeCountryIso3) {
    return "rgba(120, 180, 255, 0.28)";
  }

  if (corridor.focusType === "outbound") {
    return "rgba(255, 170, 80, 0.85)";
  }

  if (corridor.focusType === "inbound") {
    return "rgba(80, 190, 255, 0.85)";
  }

  return "rgba(180, 180, 180, 0.25)";
}
```

Do not hardcode colors if the app already has a design token system. Use existing theme tokens when available.

---

### Task 7: Add Country Tooltip

Create a tooltip component:

```text
CountryFocusTooltip.tsx
```

Props:

```ts
interface CountryFocusTooltipProps {
  countryName: string;
  inboundUsd: number;
  outboundUsd: number;
  netUsd: number;
  connectedCountryCount: number;
  isPinned: boolean;
}
```

Display:

```text
Country Name
Outbound: $X
Inbound: $Y
Net: $Z
Connected countries: N
Click to pin
```

---

### Task 8: Add Pinned Country Side Panel

Create:

```text
CountryFocusPanel.tsx
```

Props:

```ts
interface CountryFocusPanelProps {
  countryIso3: string;
  countryName: string;
  stats: CountryFlowStats;
  inboundCorridors: DonationCorridor[];
  outboundCorridors: DonationCorridor[];
  selfFlows: DonationCorridor[];
  onClose: () => void;
}
```

Panel contents:

- country name
- flag if available
- inbound/outbound/net totals
- tabs:
  - overview
  - outbound
  - inbound
  - self-flows

---

### Task 9: Add Corridor Limit and Direction Controls

Add UI controls to the globe overlay.

State:

```ts
const [focusLimit, setFocusLimit] = useState<10 | 25 | 50 | "all">(25);
const [direction, setDirection] = useState<"inbound" | "outbound" | "both">("both");
```

Behavior:

```ts
const inboundLimit = focusLimit === "all" ? Infinity : focusLimit;
const outboundLimit = focusLimit === "all" ? Infinity : focusLimit;
```

---

### Task 10: Add Country Search

Create:

```text
CountrySearchCombobox.tsx
```

Behavior:

- User types country name.
- User selects country.
- Set pinned country.
- Rotate globe to country if supported.

Pseudo-code:

```ts
function handleCountrySearchSelect(iso3: string) {
  setPinnedCountryIso3(iso3);
  setHoveredCountryIso3(null);
  rotateToCountry(iso3);
}
```

---

## 18. Suggested File Structure

```text
src/
  components/
    globe/
      DonationGlobe.tsx
      CountryFocusPanel.tsx
      CountryFocusTooltip.tsx
      CountrySearchCombobox.tsx
      GlobeLegend.tsx
      GlobeControls.tsx
  lib/
    globe/
      buildCountryCorridorIndex.ts
      getFocusedCorridors.ts
      formatGlobeData.ts
      countryIso.ts
  types/
    globe.ts
```

Adjust to match existing project structure.

---

## 19. Acceptance Criteria

### Interaction

- Hovering a country shows only inbound/outbound corridors connected to that country.
- Moving the mouse away returns to overview mode.
- Clicking a country pins the focused corridor view.
- Clicking another country switches the pinned country.
- Clicking clear button exits focus mode.
- Pressing `Esc` exits focus mode.
- Search selection pins a country and shows its corridors.

### Visual

- Default globe is not cluttered.
- Focused country is clearly highlighted.
- Inbound and outbound corridors are visually distinguishable.
- Arc direction is understandable.
- Self-flows are not drawn as normal arcs.
- Side panel does not cover too much of the globe on desktop.
- Mobile uses a bottom sheet or compact panel.

### Data

- Corridors respect active filters.
- Corridor widths scale by donation amount.
- Missing coordinate rows do not crash the globe.
- Countries with no data show a clear empty state.
- Large countries with many corridors are capped by top-N controls.

### Performance

- Hover interaction should feel immediate.
- Avoid full expensive recomputation on every mouse move.
- Use `useMemo` for filtered corridors and country index.
- Avoid rendering hundreds of arcs by default.
- Globe should remain rotatable while focused.

---

## 20. QA Test Cases

### Basic Focus

1. Open dashboard.
2. Hover United States.
3. Verify only corridors connected to United States appear.
4. Move mouse away.
5. Verify default overview returns.

### Pinned Focus

1. Click Germany.
2. Verify Germany stays highlighted.
3. Rotate globe.
4. Verify Germany’s corridors remain visible.
5. Press `Esc`.
6. Verify focus clears.

### Direction Filter

1. Click China.
2. Set direction to `Outbound`.
3. Verify only China → other country corridors appear.
4. Set direction to `Inbound`.
5. Verify only other country → China corridors appear.
6. Set direction to `Both`.
7. Verify both categories appear.

### Corridor Limit

1. Click a high-volume country.
2. Set Top 10.
3. Verify no more than 10 inbound and 10 outbound arcs appear.
4. Set Top 50.
5. Verify more arcs appear if data exists.

### Self-Flow Handling

1. Select a country with same-country flows.
2. Verify no self-loop arc is drawn.
3. Verify self-flow appears in side panel.

### Filter Compatibility

1. Apply year filter.
2. Click a country.
3. Verify side panel totals match filtered data.
4. Change year.
5. Verify country corridors update.

### Empty State

1. Apply restrictive filters.
2. Select a country with no matching corridors.
3. Verify empty message appears.
4. Verify the app does not crash.

### Mobile

1. Open on mobile width.
2. Tap a country.
3. Verify focus pins.
4. Verify panel appears as bottom sheet or mobile-friendly drawer.
5. Tap close.
6. Verify focus clears.

---

## 21. Implementation Notes for Coding Agent

Important implementation priorities:

1. Do not simply add more arcs to the existing globe.
2. Build country-focused filtering first.
3. Make hover and click behavior stable.
4. Keep overview mode visually minimal.
5. Keep self-flows out of globe arcs.
6. Respect active filters before building the country index.
7. Use memoized derived data for performance.
8. Prefer clear UX over maximal data density.

The final globe should feel like:

```text
Overview: quiet, premium, explorable
Hover: instant country-level preview
Click: stable analytical focus mode
Panel: detailed data without cluttering the globe
```

---

## 22. Suggested Codex Planning Prompt

Use this prompt in Codex planning mode:

```text
I want to revise the globe feature so it supports country-focused donation corridors.

Currently the globe shows the top global donation corridors as many arcs, which creates visual clutter. Implement a cleaner interaction where hovering over a country temporarily shows only donation corridors going into and out of that country, and clicking a country pins that focused view with a side panel.

Please inspect the existing globe component, data shape, filters, and current arc-rendering logic. Then implement the feature according to the attached markdown plan.

Priorities:
1. Add hover-focus and pinned-focus state.
2. Build a country corridor index from the filtered corridor data.
3. Render only selected-country inbound/outbound arcs during focus.
4. Keep overview mode minimal.
5. Add tooltip and side panel.
6. Add top-N corridor limit and inbound/outbound/both controls.
7. Handle same-country flows separately without drawing self-loop arcs.
8. Keep performance smooth with memoization.

Do not rewrite the entire dashboard unless necessary. Preserve the existing design system and integrate with current components.
```

---

## 23. Optional Future Upgrade: Corridor Bundling

If the arcs still look messy for countries with many connections, add arc bundling or regional aggregation.

Possible future modes:

```text
Country Focus: individual country corridors
Region Focus: aggregated corridors by world region
Top Partners: only top 10 donor/recipient partners
```

Do not implement this in the first pass unless necessary. The first implementation should focus on hover/click country filtering.

---

## 24. Final Design Direction

The revised globe should not try to show all the data at once. Its job is to make global donation flows explorable.

The best version of the feature is not:

```text
A globe with every important line visible at the same time.
```

It is:

```text
A globe that becomes specific when the user expresses intent.
```

That means:

- overview by default
- focus on hover
- pin on click
- detail in panel
- filters and tabs for deeper analysis

This will make the globe significantly less cluttered while preserving the impressive first-glance visual impact.
