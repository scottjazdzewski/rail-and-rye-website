# Rail & Rye Racing — Phone Dashboard Layout Lock (Review Draft)

## Scope and release
- Phone presentation only, max viewport width 800px. Laptop (>800px) is a separate design task.
- Shared schema and pricing data: `public/assets/projections-dashboard.js` and `src/projections.js`. Never recalculate win probability, fair odds, morning line, or factor states in the browser.
- The current member dashboard and protected admin preview share the renderer; do not expose private previews without existing Access protection.
- Retain official saddlecloths from `/assets/approved/saddlecloths/{1..20}.png`, including letter suffixes.
- No live merge without human visual review plus passing dashboard regression.

## Locked phone card hierarchy
1. Racetrack/date and a navy race header, including accurate conditions and post time.
2. Compact facts and scratches (with program chip and scratched horse name).
3. Section label `WIN PROJECTIONS`.
4. Runner identity: official chip, full horse name, `M/L`, win probability in the right-hand column; fair odds **centered below the percentage in the same column**.
5. One row of five exact factor states: SPEED, FORM, CLASS, PACE FIT, SURFACE/DISTANCE. Color is the saved source value green/gray/red; do not infer scores.
6. Bottom card footer: `Full Analysis` button. If provided in source JSON, `Trainer: ... | Jockey: ...` immediately below the action. Omit missing names rather than repeating `not listed` on every card.

## Tap-to-open `Full Analysis` bottom drawer
- Native modal dialog with close control and Esc behavior.
- Horse and official program number in dialog header; ML, win %, fair odds in a clearly aligned summary.
- Trainer/jockey when supplied.
- Race context (surface, distance, pace) from selected race.
- Readable individual 5-factor statuses exactly as supplied.
- Model notes **only if published** in JSON; never auto-write race-specific horse narratives.
- Full PDF link only when membership entitlement has a matched PDF; admin preview does not imply PDF availability.
- Preserve desktop modal's existing details.

## Two-layout boundary and QA
- Phone style under `@media(max-width:800px)`; laptop grid remains the default.
- Review 320, 375, 390, 430 pixel viewports, long names, programs 1–20 and suffixes, missing trainers/jockeys, scratch lists, and factor badges.
- Verify centered fair-odds alignment, no horizontal overflow, no clipped horse names, all interaction focus states, and bottom-sheet scroll.
- Keep race date and card values sourced exclusively from the currently loaded dashboard JSON. The November 23 TimeformUS ZIP supplies past performances and connections, **not** TRI probability outputs.

Status: design branch implementation for review; **not yet deployed**.
