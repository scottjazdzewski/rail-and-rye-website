# The Racing Wire — Source Roster and Ingestion Plan

Updated: 2026-10-31

This file distinguishes sources that are **LIVE**, **TEST-ONLY**, **PLANNED**, and **BLOCKED/EXCLUDED**. It is not a claim that every listed source is currently being ingested.

## Current state

### LIVE ON THE UNLISTED PREVIEW
- **Rail & Rye Journal** — published articles.
- **Thoroughbred Daily News (TDN)** — official All News RSS.
- **Past The Wire** — RSS.
- **America's Best Racing** — RSS.
- **US Racing** — RSS.
- **BloodHorse** — all-news RSS.
- **Paulick Report** — RSS.
- **Horse Racing Nation** — news RSS.
- **The Racing Biz** — RSS.
- **Woodbine** — official track RSS.
- **Canadian Thoroughbred** — RSS.
- **National Steeplechase Association** — RSS.
- **American Racehorse** — RSS.
- **Ocala Breeders’ Sales (OBS)** — blog/news RSS.
- **BBC Horse Racing** — horse-racing RSS.
- **Timeform** — horse-racing news RSS.

These external sources are fetched live by the unlisted preview API and are not persisted to D1. Only source name, headline, timestamp, direct URL and Rail & Rye subject classification are displayed. Publisher photos, article bodies and feed descriptions are not copied. Each external source is capped and the editorial relevance gate removes obvious picks, betting guides, promos, TV/streaming guides and other low-value feed clutter before the cross-source dedupe pass.

### TEST / DIAGNOSTIC
The "Test real RSS" control checks the same preview source endpoints and reports HTTP status and parsed item counts.

### NOT CURRENTLY FEEDING CARDS
- **Daily Racing Form** — a feed endpoint is detectable, but automated/commercial reuse remains permission/licensing-sensitive, so it is not enabled in the preview.
- **Fasig-Tipton** — no clean first-party news RSS endpoint confirmed; keep on the official social/API queue.
- **Keeneland / Keeneland Sales** — active first-party news room, but no clean RSS endpoint confirmed; keep on social/API/structured-source queue.
- **HISA / HIWU** — active first-party news, but no clean RSS endpoint confirmed; high-priority official social/API sources.
- **Equibase Race Day Changes** — official live structured data/XML/RSS service exists, but its separate terms and specialized parser need to be handled as a race-day intelligence integration rather than dropped into the generic article RSS parser.
- **Breeders' Cup, NYRA, Churchill Downs, Santa Anita, Del Mar, Gulfstream/1/ST, Oaklawn and other tracks** — official social/API sources remain queued where no clean RSS feed is confirmed.
- **X, Facebook and Instagram** are not yet connected to the backend.

The production/public syndication allowlist remains empty; the live external RSS set above is an unlisted-preview test path only.

## Source strategy

Priority order:
1. Publisher/organization RSS or structured first-party feed where commercial display is allowed.
2. **X API** for public posts from verified official racing accounts. X embeds are suitable for display, but API access is the preferred path for normalized/deduplicated cards.
3. **Facebook** official public posts as a fallback when a source has no useful X presence, using official Meta embed/link methods or suitable authorized API access.
4. **Instagram** for high-value official announcements, using official Meta embed/link methods. Do not use Instagram oEmbed metadata as a scraping/discovery feed.
5. No Bluesky. No TikTok.

## Planned high-priority source universe

### Racing publications / media
- Thoroughbred Daily News
- Paulick Report
- BloodHorse
- Daily Racing Form
- America's Best Racing
- Equibase editorial/news content
- Additional reputable racing publications added only after source/permission review

### Governing / integrity / industry
- HISA
- HIWU
- The Jockey Club
- NTRA
- TOBA
- Breeders' Cup
- State racing commissions and official stewards/rulings sources where public and suitable

### Racetracks / major race organizations
- Keeneland / @keenelandracing on X; @keeneland on Facebook/Instagram
- NYRA / @TheNYRA and @BelmontStakes
- Churchill Downs / @ChurchillDowns
- Kentucky Derby official channels
- Breeders' Cup / @BreedersCup
- Santa Anita / @santaanitapark plus official publicity/workout accounts where appropriate
- Del Mar
- Gulfstream / 1/ST Racing
- Oaklawn
- Monmouth
- Woodbine
- Fair Grounds
- Pimlico / Laurel
- Other active Thoroughbred tracks as verified

### Sales / breeding
- Keeneland Sales / @keenelandsales
- Fasig-Tipton
- OBS
- Tattersalls
- Goffs
- Major breeding farms and stallion operations when they are the original source of a breeding/retirement announcement

### Connections / people
- Trainers
- Jockeys
- Owners / syndicates / stables
- Breeders
- Agents / publicists
- Racing secretaries / official track communications
- Use only verified or clearly official accounts and direct original posts.

## Deduplication rules

- One Racing Wire card per real-world event, not one card per source.
- Multiple publishers/social accounts covering the same development appear as **Also reported by** links.
- Do not merge distinct developments involving the same horse (e.g. workout vs. scratch vs. injury vs. sale vs. retirement vs. result).
- Prefer the original/primary source when available: horse connection, track, governing body, sales company, or official race organization.
- If an official source and a media report disagree, do not silently collapse them; preserve both and flag for editorial review.
- No third-party photographs are copied into cards.

## Social implementation notes

### X
- X provides official public-post APIs and official embedded post/timeline tools.
- For a real normalized Rail & Rye newsfeed, the preferred implementation is X API access with an allowlisted account roster and keyword/entity filters.
- Do not scrape x.com HTML or use unofficial mirrors.

### Facebook / Instagram
- Meta supports official embeds for public content.
- These are best treated as display/link fallbacks unless we have appropriate API access for automated discovery.
- Instagram oEmbed is for rendering public posts, not mining/persisting content for a homegrown feed.
- For accounts with no X presence, Facebook can be the next source; Instagram is additional/secondary.

## Quality gate before any source becomes LIVE

For each source:
- verify the official account/domain;
- verify technical access;
- verify commercial/reuse terms or use official embed/API mechanism;
- store only the minimum data needed for the card (source, URL, timestamp, short faithful source-grounded summary, category);
- test duplicates and stale-content behavior;
- add source to the allowlist only after review.

## Important current limitation

The unlisted Racing Wire preview is now a **real multi-source RSS test feed** using Rail & Rye Journal plus 15 external racing feeds where each endpoint responds successfully. It is still not a finished production newswire: external RSS is preview-only, the production allowlist remains empty, and X/Facebook/Instagram have not yet been connected to the backend.
