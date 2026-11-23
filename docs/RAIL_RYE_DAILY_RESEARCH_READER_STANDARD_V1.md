# RAIL & RYE — DAILY RESEARCH READER STANDARD V1
**Longshot Radar + Target List, shared visual contract • November 23, 2026**

## Purpose
The two protected research modules must feel like ONE application and share a practical, legible typographic scale. Each uses the same shell, form controls, race headers, market figures, commentary block and compact spacing. Their data structures remain distinct: Radar displays its own one-horse selections; Target List has ML FAVORITE and ATTACK rows. Never duplicate or invent scoring information to make the layouts uniform.

## Exact mobile (320–430 CSS px) specification
| Element | Shared target |
|---|---|
| Brand/header | Shared `rr-hub-header.css` masthead with the approved ivory Rail & Rye logo, serif wordmark, and no duplicate branding or hero graphic. |
| Five module tabs | Same five gold-outlined pill links as the homepage on wide screens; below 1080px, a keyboard-accessible **Menu** disclosure with all five links. Never clip or horizontally scroll module buttons. |
| App content | 10–12px left/right padding, 8px gap between race cards. No horizontal page overflow. |
| Review/status | Only neutral loading, availability, or error messages. No customer-facing model-review, preview, source-receipt, or edition-stage commentary. Dates belong in the selector. |
| Title | Kicker 11px Inter Bold; page title 28px Inter Extra Bold, without repeated introductory instructions or an oversized hero. |
| Controls | Two independent controls, Date and Sort; 12px labels, 15px select values, >=42px height, 8px internal padding; two columns when they fit, otherwise stack. No JSON uploader. |
| Summary | Identical split layout: 16px selection/target count on the left, 12px active Post-time/Track sort order on the right; no repeated date or product heading. |
| Race header | Full navy #102d53 bar with 3px gold #c99831 top rule; track 16–17px Inter Bold, race/post-time 13px; distance, surface and source-supplied conditions INSIDE the navy header in 14px Inter; always show the complete available distance, surface and class conditions on a SECOND LINE beneath track/race/post time inside the same navy banner, without clipping or reducing type. Do not invent missing conditions or purse. |
| Horse identity | Official saddlecloth art 34–36px; name 17px Inter Bold; morning line near name at 14px; label (ML FAVORITE / ATTACK when applicable) 12px Inter Bold. Full long names wrap. |
| Market columns | WIN % 25px Tinos Bold, FAIR odds 22px Tinos Bold; 11–12px labels; never place metrics into a second giant gray box. ML appears once, alongside each horse name on desktop and mobile; WIN % and FAIR ODDS use the same two-column metrics layout on both pages. Store/score values remain unchanged; show tote fractions consistently. |
| Analysis | Entire original source-backed analysis immediately below horse+metrics; 17px Inter, line-height 1.50–1.55, dark navy text on white/off-white, 11–13px padding. NEVER clamp to two lines, replace with teaser, require modal to finish reading, or manufacture commentary. |
| Cards | Thin neutral border, ~7px radius, 8px vertical gaps; no redundant “Race Details” buttons, oversized colored stat backgrounds, decorative illustrations or double separator strips. Details drawers are optional enhancement. |
| Footer | Shared small private footer; does not float mid-screen. |

## Desktop/tablet
Keep the same visual hierarchy, with runner identity and numeric columns on one row. No need to force the entire desktop display into the mobile stack. Main reader max-width around 1120–1160px, using a readable column width. Text sizes must not decrease below 16px for body analysis and 17px for names.

## Product-specific rules
**Target List:** two source-backed contender rows per race (ML FAVORITE and ATTACK), with each contender's WIN / FAIR. Preserve actual race/horse, PWIN/ML/fair/analysis/scratches. Retain independent Track / Post Time sort. Preserve actual access protections and publication eligibility without exposing internal status badges.

**Longshot Radar:** one published horse row per selection (program, name, ML by name, WIN / FAIR to right). Preserve Radar-specific evidence/details if supplied, but avoid a duplicate gray 3-column stats band and any full-width action button. Use the same navy racebar and full source narrative style. Preserve publication status/edition metadata accurately; no scoring changes.

## Non-negotiable safety and release
Private R2 data remains behind Cloudflare Access; no real proprietary data in public static files, PR screenshots or synthetic demo payloads. No new probabilities, modified odds, shortened analysis, template-driven fabricated details, PDF upload step, or changes to the customer's purchase flow.

## QA
Run both modules at **320, 375, 390, 430, 768 and 1280px** and visually inspect actual feed screenshots, not merely detail dialogs. Assert: all source text visible, full horse names readable, no horizontal overflow, five-link menu accessible with 40px tap targets, date/sort usable, no repeated status/date blocks, original saddlecloths, and successful Cloudflare production deployment. Match computed font sizes, not merely stylesheet text.

### UI parity refinements — November 23, 2026
Longshot Radar and Target List use the same masthead, title/kicker, 760px-wide gold-topped Date and Sort control panel (two columns, stacking below 360px), 16px selection count, navy/gold race headers, 17px runner names, authentic saddlecloths and 25px WIN / 22px FAIR figures. Both show original source Morning Line beside the name and use American tote-style hyphen notation (e.g. 5-1) without changing source values. Target List keeps its ML FAVORITE / ATTACK / optional ALSO LIVE distinction, but no longer repeats ML or a separate metric-column heading. Neutral empty states replace production explanations; no timestamp line inside date/sort controls. Full race analysis, original probabilities, conditions, grade trophies and scratches remain intact.

### Reader layout parity refinement — November 23, 2026
Longshot Radar and Target List use matching compact title, gold-topped Date/Sort controls, a split count (left) and sort order (right) summary, matching card gaps, navy racebar, and white inline 17px editorial analysis. Radar retains one value horse and its evidence, while Target List retains ML FAVORITE, ATTACK, and optional ALSO LIVE rows and its optional detail drawer. Never fabricate identical content or change scores to force equal card heights. Mobile-first verification is required.
