# Race information production lock

- Keep the existing PDF and website source intake: supplied TimeformUS cards first; extract explicit purse only, otherwise verify date/track/race against the official entries independently. No extra upload is required from the operator.
- Preserve full source conditions and claiming price internally. The dashboard suppresses dollar suffixes only on recognized generic race-class titles; named stakes, grades, and original data stay intact.
- Display exact advertised purse in the existing gold purse slot. Never infer it from a claiming or starter eligibility price. New certified uploads require a positive explicit dollar purse; the existing direct TRI publisher already checks source-verified official purse and crosschecks badge evidence.
- The November 24 repair is date-scoped, only for blank purses and matching prescratch field counts. It does not modify scored R2 objects, receipts, or pick audit source hashes. Nonmatching races remain unresolved rather than guessing. Future cards must use the canonical scored package's purse field; remove the temporary repair after the corrected source is republished.
- Source index references (private production documentation, not customer-facing card text):
  - delta-downs: https://tvg.equibase.com/static/entry/RaceCardIndexDED112426USA-EQB.html
  - finger-lakes: https://tvg.equibase.com/static/entry/RaceCardIndexFL112426USA-EQB.html
  - mahoning-valley: https://tvg.equibase.com/static/entry/RaceCardIndexMVR112426USA-EQB.html
  - mountaineer: https://tvg.equibase.com/static/entry/RaceCardIndexMNR112426USA-EQB.html
  - parx-racing: https://tvg.equibase.com/static/entry/RaceCardIndexPRX112426USA-EQB.html
  - zia-park: https://tvg.equibase.com/static/entry/RaceCardIndexZIA112426USA-EQB.html

## Universal maiden classification lock (Nov 24, 2026)

Race Cards, Longshot Radar and Target List must spell out the actual source-confirmed class: Maiden Claiming, Maiden Special Weight, Maiden Optional Claiming or Maiden Allowance. Expand recognized class abbreviations (MCL, MSW, MOC and equivalent explicit forms). Never display bare `Maiden` for a known specific class. If source fields are missing or disagree, resolve using the exact official date/track/race conditions. Internal QA warnings never appear in customer headers; if still unresolved, use only the race number on Race Cards and omit the class on research readers. Never infer the class from purse, claiming price, horse ability or any model output. Preserve underlying raw conditions, scoring receipts, and approved stakes names/trophies. Pick Tickets are excluded from generic race-class labels: keep compact race-number/saddlecloth/coverage rows. Previously approved named stakes and graded trophies remain unchanged. Never add maiden or other ordinary race-class descriptions to Pick Tickets.

November 24 corrective metadata: official entry indexes above verify all 12 maiden races: Delta Downs 2/3 and Parx 9 are Maiden Claiming; Finger Lakes 4/5, Mahoning Valley 1/5, Mountaineer 3/5 and Zia Park 1/2/3 are Maiden Special Weight. Match date, track, complete race list and existing purse where present. Do not change source files, signed scoring receipts, named stakes, Pick Tickets, or race selections. The official class field is display-only.

## Distance presentation lock

All displayed race distances use the shared RRRaceTitles.formatDistance formatter in Race Cards, Longshot Radar and Target List. Raw model furlong decimals are converted for display only (8.31818 F = 1M 70Y; 8 F = 1M; 8.5 F = 1 1/16 M; 6.5 F = 6 1/2 F). Preserve source-supplied mile/yard labels, other units and approximate markers. Never change model inputs, receipts, probabilities or ticket calculations. No new race distance label on Pick Tickets.

### Daily Double production rule
- Retain source Timeform WAGERS evidence and verified consecutive pools in each authorized Race Cards response. Accept explicit Daily Double and standalone Double labels, exclude second-half-only entries. The builder tab appears only on the selected starting race when both active fields are usable. Never infer eligibility merely from consecutive race numbers. November 25, 2026: recover the 63 source-verified pools from exact date/track/full-card identity at read time, with source ZIP checksum recorded in `src/daily-double-eligibility.js`; never rewrite scored records. Future cards must carry their own Timeform WAGERS evidence.

### North American tote odds display — permanent lock (2026-11-25)
- All visible morning-line and fair-odds fields in Race Cards (mobile, desktop, runner detail), Longshot Radar and Target List use the single `RRRaceTitles.formatToteOdds` / `formatFairOdds` implementation. Use hyphen notation. Approved short rungs: 1-9, 1-5, 2-5, 1-2, 3-5, 4-5, 1-1, 6-5, 7-5, 3-2, 8-5, 9-5, 2-1, 5-2, 3-1, 7-2, 4-1, 9-2; whole-number X-1 from 5-1 upward. Quantize to nearest rung, ties to the longer price. Invalid or missing odds show an em dash. No arbitrary fractions, decimals, or sportsbook +/- odds. Preserve exact source morning line, model fair net, unrounded probabilities, rankings, selection gates and ticket calculations in the data layer; formatting is presentation only. New displays must reuse this helper. Regression example: 57.6% → FAIR 4-5, never 7-10.
