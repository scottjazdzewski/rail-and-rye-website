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
