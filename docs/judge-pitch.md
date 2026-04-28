# Judge Pitch (90 Seconds)

## 1) Problem

Philanthropic funding data is rich but difficult to trust at a glance. Domestic loops, unspecified recipients, and dense flow visuals can hide the true cross-border story.

## 2) What FlowLens Does

- Starts with a globe-first view for immediate geographic context.
- Defaults to **cross-border flows only** to keep the core story defensible.
- Lets judges drill from corridor-level view into country, cause, yearly trend, and raw evidence.

## 3) Why It Is Reliable

- Domestic classification uses dataset `flow_type` directly.
- Caveat badges make ambiguous labels explicit (`Unspecified recipient`, `Regional aggregate`, `Multi-year aggregate`).
- App includes crash-safe behavior with low-graphics and 2D fallback modes.

## 4) Key Insight Prompts

- Which donor-recipient corridors dominate the selected scope?
- Where are recipient labels highly unspecified, and why does that matter?
- How does cause concentration compare across selected filters?

## 5) Decision Value

FlowLens helps decision-makers quickly identify corridor concentration, data-quality caveats, and cause funding balance, then verify conclusions with evidence-level rows.
