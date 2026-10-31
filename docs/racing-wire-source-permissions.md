# The Racing Wire — Publisher and Social Source Policy (DESIGN PREVIEW ONLY)

Updated: 2026-10-31. **No public feature launch has been authorized.**
The unlisted preview can be shared by URL but is not in the main site navigation.

## Owner-approved editorial direction

- First: original, permitted **publisher RSS feeds**, with direct source links.
- Next: **X** public original posts, using official embeds or licensed API access. No X page scraping, Nitter, or unapproved intermediaries.
- Then: **Facebook** for a verified organization, racetrack, trainer, jockey or owner who has no active X source. Use official public-post embed/link methods.
- Optional: **Instagram** for relevant, verified original announcements, with official embed/link methods. No post harvesting or metadata extraction from oEmbed.
- **Never** ingest Bluesky or TikTok.
- Never copy news photographs, publisher article bodies, or paid text.
- The user strongly prefers original minimalist artwork and *one meaningful news update per event*, with a list of credited sources rather than repetitive competing news cards.
- Subject badges are Horse, Owner, Trainer, Jockey, Stable, Race/Stakes, Racetrack, Breeding, Sales/Auctions, Regulatory, Achievement and Industry.

## Verified source inventory — availability is NOT permission to republish

| Publisher | Source link | What is verified | Current decision |
|---|---|---|---|
| Thoroughbred Daily News (TDN) | https://www.thoroughbreddailynews.com/rss-feeds/ | Official RSS directory lists All News https://www.thoroughbreddailynews.com/feed/, Top News /category/news/feed/, and other feeds; describes them for users of RSS readers | **Permission pending** for commercial website display/automated import. Do not enable without publisher approval or confirmed applicable terms. |
| Equibase | https://tvg.equibase.com/static/latechanges/html/latechanges.html?SAP=LN | Official race-day changes page offers RSS subscriptions; use is explicitly governed by Equibase terms | **Permission pending** for republication on Rail & Rye. No automated scrapes. Confirm official changes independently before labeling scratch “official.” |
| OffTrackBetting.com | https://www.offtrackbetting.com/rss.html | Official RSS feed exists; its RSS terms explicitly restrict display to **noncommercial** use | **EXCLUDED** from commercial Rail & Rye automated imports absent separate written grant. |
| Daily Racing Form | https://www.drf.com/drf-terms-and-conditions | DRF terms prohibit robot/spider/scraper automated access without authorized written permission and restrict information to personal/noncommercial use | **EXCLUDED** from automated imports without written agreement. Direct outbound links to public article pages only. |
| Paulick Report | https://paulickreport.com/ | Publisher has original daily news and verified X account at https://x.com/paulickreport | Use verified original X post links/official embeds. RSS feed and commercial redistribution terms **not yet verified**; no automatic RSS importer. |
| BloodHorse | https://www.bloodhorse.com/horse-racing | Public news source; possible RSS via third-party directories is **not** adequate authorization | Direct links until original RSS endpoint and commercial terms verified. |
| America's Best Racing | https://www.americasbestracing.net/ | Third-party RSS directory mentions a feed; official commercial reuse terms **not yet verified** | Direct links only until documented permission. |

## Social implementation

- X: https://help.x.com/en/using-x/embed-x-feed and https://help.x.com/en/using-x/how-to-embed-a-post document public post and profile embeds. Embeds are **not** equivalent to a legal license to scrape posts and reserialize them as a homegrown data feed; X developer rules disallow non-API scripting. Prefer single-post embeds for curated stories, not a firehose of every post.
- Facebook and Instagram: Meta's official embeddable public content and terms apply. The Meta-maintained https://github.com/facebook/meta-embeds-for-wordpress demonstrates official post embed methods. Do not treat it as permission to extract/cache other account content. Some accounts disable embeds; then use an ordinary direct link. Identify official accounts before use.
- Avoid embeds automatically loading trackers on every news card; use user-triggered reveal or a clearly labeled direct source link when appropriate.
- No Bluesky or TikTok at any stage.
- When no verified external source is enabled, **do not invent live news**. Display only real published Rail & Rye Journal items; if none exist, show the empty state.

## Dedup / story grouping contract

1. Group identical URLs, exact editorial event keys, or high-confidence overlapping event reports in a bounded time window (currently 48 hours) into **one news card**.
2. Primary headline and summary must faithfully reflect the retained source. Other sources appear beneath as “Also reported by” links; no copied photographs.
3. Never merge *different* developments concerning the same horse: scratch vs injury vs workout vs result vs sale; protect distinct horses in a common race.
4. Default to **not merging** if uncertain; add editor-curated \`event_key\` identifiers for tricky cross-publisher rewrites. Normalize duplicate publisher links and retain provenance.
5. When a report materially changes, update the main story and preserve linked corroboration, with a new timestamp if warranted. Corrections should not be silently discarded.

## Implementation gate

- \`src/racing-wire.js\`: publisher RSS importer exists but has **FEEDS=[]**, so no publisher content is imported until license/permission is verified; social scraping is not enabled.
- Current preview \`/preview/racing-wire-5333548f0ffee31ba519b2470ffb/\` contains **no fake/demo stories**. It auto-loads real published Rail & Rye Journal items only. TDN RSS is diagnostic-only and no social backend is connected yet.
- The live site header **must not** acquire the Racing Wire pill until separate explicit approval.
- Adding any real X/Facebook/Instagram automation requires provider permission/appropriate official API or embeds and quality-control testing. Never silently substitute Bluesky.
