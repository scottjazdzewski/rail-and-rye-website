# Pick Tickets — private Racing Intelligence Hub module (review branch)
The shared authority remains [RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md](./RACING_INTELLIGENCE_HUB_DESIGN_SYSTEM.md).
This module reads **source-certified** horizontal Pick Tickets; it does not score races or create tickets.

## Branch scope / launch safety
- Private URL after branch deployment: /admin/pick-tickets-preview/ (Cloudflare Access verified by the existing site Worker). **Do not enable customer/public access.**
- Admin-only JSON endpoint: GET/POST /api/admin/pick-tickets; existing signed Cloudflare Access identity and same-origin validation apply.
- There is NO new customer login, checkout, product gate, public JSON endpoint, scheduled uploader, or standalone paid portal.
- Source remains private R2 under pick-tickets/dashboard/YYYY-MM-DD/{track}.json; immutable revisions under pick-tickets/revisions/.
- The *shared* /racing-intelligence/ route, product-level purchases/bundles/member permissions, central Publication Desk, launch switch, and any PDF-retirement migration belong to the hub/commerce integration work. Do not turn this preview into a disconnected store.
- No real picks, test accounts or customer data are committed to GitHub.

## Version 1 input schema
Admin can load one object, an array of objects, or { "cards": [objects] } for up to 25 tracks at a time (3MB max).
The **production system** must provide each field. The renderer never picks runners, computes probability, infers source status, or determines PLAY/CONDITIONAL/PASS.
- schema_version: 1; product_type: pick_tickets
- date: real YYYY-MM-DD; track: published racecourse name
- revision: source-issued monotonically increasing integer
- status: initial_current | scratch_updated. Initial is labeled "INITIAL · CURRENT" until receipt-verified scratches supersede it.
- scratch_verified_at: ISO timestamp required for scratch_updated
- source_receipt: { reference, sha256 }. Both must refer to the authentic external production receipt. **The site validates their format but cannot cryptographically prove the external scorer ran**; that evidence must be checked by the trusted production exporter.
- sequences: complete source-selected array of names, race ranges, recommendation state and tickets

Each sequence:
- name (official name), start_race, end_race, play_status: PLAY | CONDITIONAL | PASS
- hit_rate_display: source-provided display percentage if available; blank when not certified
- recommendation: source-provided narrative if available (never authored by the website)
- tickets: one or more certified source tickets; each may be LEAN, FULL_COVERAGE, or BEST_POSSIBLE; no duplicated role
- PASS **must** include a BEST_POSSIBLE source ticket; it remains labeled PASS, never recategorized
- All legs must be consecutive; all selected program numbers must be explicit, including every runner in an ALL leg; no abstract "ALL", ranges, or invented numbers

Each ticket:
- role: LEAN | FULL_COVERAGE | BEST_POSSIBLE
- title: official source tier label; notes: source remarks if present
- unit_cents: wager denomination in integer cents
- combinations: source-provided whole number; total_cents: source-provided exact total
- legs: [{ race_number, programs: ["1", "1A", "12"] }, ...]
- The server audits multiplication of each leg's selections and verifies unit_cents × combinations = total_cents. **It never reduces a ticket or applies arbitrary combo/spend caps.**
- Only straight horizontal ticket grids are represented in v1; if an approved construction has multiple distinct lines, extend the versioned schema and its receipt/QA coverage rather than flattening it inaccurately.

## Example for validator tests ONLY — NEVER a customer selection
The source below is synthetic and deliberately not shipped as a UI fixture.
{
  "schema_version": 1,
  "product_type": "pick_tickets",
  "date": "2026-11-23",
  "track": "Synthetic QA Track",
  "revision": 1,
  "status": "initial_current",
  "source_receipt": {"reference": "SYNTHETIC-TEST-ONLY", "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
  "sequences": [{
    "name": "Synthetic Pick 3",
    "start_race": 1, "end_race": 3, "play_status": "PASS",
    "hit_rate_display": "12.345%",
    "recommendation": "Test only",
    "tickets": [{
      "role": "BEST_POSSIBLE", "title": "Synthetic example",
      "unit_cents": 50, "combinations": 2, "total_cents": 100,
      "legs": [
        {"race_number": 1, "programs": ["1","1A"]},
        {"race_number": 2, "programs": ["3"]},
        {"race_number": 3, "programs": ["10"]}
      ]
    }]
  }]
}

## QA / review gates
- node --check src/pick-tickets.js
- node --check public/assets/pick-tickets-dashboard.js
- node test-pick-tickets.mjs
- Run existing commerce/membership tests on the PR because src/index.js has a minimal protected admin dispatch addition.
- For **visual** acceptance, branch-deploy privately and inspect 320, 375, 390, 430, 768 and desktop widths with actual source-certified editions, including 1A, chips 11–20, long track/sequence labels, multiple tickets, 6-leg sequences, PASS cards, and modal focus/scroll. CI syntax checks are not visual acceptance.
- Validate no page overflow, no cut-off numbers, no fixed ticket caps and no leaked paid JSON before any launch. Actual R2 writes and customer permission mapping require environment-level checks and owner approval.
