# RAIL & RYE — HOMEPAGE PRODUCTION LOCK

**Status: OWNER APPROVED / DO NOT REDESIGN**  
**Approved:** November 4, 2026 (owner-authorized Racing Wire header pill)
**Frozen homepage HTML blob:** `181ba8de8e97930f277d79e00129ed8aafc3356c` (owner approved November 22, 2026)  
**Recovery snapshot branch:** `approved-homepage-2026-11-22`  
**Website:** https://railandryeracing.com/

The owner has confirmed the homepage layout is correct. Treat this visual state as locked until the owner explicitly requests an intentional homepage change.

## Preserve

- Official Rail & Rye logo and one-row desktop masthead, center racing-intelligence strapline and navigation.
- Approved racing-action hero, headline, gold accent, placement, scale and spacing.
- The two opening tiles: **Today's Race Cards** (#1) and **Pick Tickets** (#2), their approved backgrounds and links.
- **Stories from the Rail** in the Page 4 position with saddlecloth #4.
- The **MORE FROM RAIL & RYE** heading visible beneath the two tiles on the opening desktop viewport, without small slivers of the next cards appearing at the fold at the approved screenshot size.
- The lower publication cards: Longshot Radar (#3), Stories from the Rail (#4) using the Stable Notes badge artwork, and Target List (#5). Stable Notes is hidden from the homepage and public Publication Desk.
- The mobile layout, typography, photo assets, header, panel proportions and responsive behavior.

**Not frozen:** dynamic race-card inventory, prices, checkout, Stripe, admin, the Journal, the publication pages, store pages or other site work. Product availability data is still dynamic on the homepage.

## Engineering rule

1. **Do not edit `public/index.html` or the approved homepage artwork and badge assets** for unrelated work.
2. In shared CSS (`rail-rye-core.css`, `rail-rye-components.css`, `rail-rye-pages.css`), avoid any edit that changes homepage layout, media queries, typography, photographs or panel geometry. Page-specific changes must stay page-specific.
3. **No appended CSS overrides, resurrected legacy CSS, redesigned homepage, or replacement assets.** Update the source of truth in place when authorized.
4. `node test-homepage-lock.mjs` verifies the frozen homepage HTML and approved imagery (Git blob hashes), plus the essential home layout contract in shared CSS. `.github/workflows/verify-homepage-lock.yml` checks this automatically on applicable PRs and pushes.
5. If the homepage is intentionally modified, get the owner's approval on the new visual result and only then update the baseline hashes, the lock documentation, and the approved snapshot.
6. This is a **repository-level audit guard**. GitHub Actions reports drift; it does not itself impose GitHub branch protection or block a direct push/Cloudflare deployment. Do not present it as an immutable server-side lock.

## Restore the approved homepage

Use the commit or snapshot branch above as the recovery reference. Restore **only the impacted homepage files and homepage-specific CSS rules**, not the entire repository: restoring an entire old commit could wipe newer commerce, content or security work. Recheck desktop, mobile, and the "More from Rail & Rye" fold after any restoration.

**Approved baseline:** confirmed working by the owner on October 31, 2026.

## Owner-authorized navigation addition (October 31, 2026)

The owner explicitly approved adding **Our Approach** as a fourth top-navigation pill throughout public pages and their mobile menus. The authorized homepage source change is restricted to the desktop/mobile header links and the shared header stylesheet cache version. Homepage photography, hero, typography, body copy, tiles, page spacing and fold are not redesigned. The homepage lock hash was updated to reflect the approved navigation-only change; all approved visual asset hashes and CSS layout guards remain intact. The `approved-homepage-2026-10-31` branch is still the pre-navigation recovery snapshot.

## Owner-authorized publication copy and resource hints (November 1, 2026)

The owner approved replacing inaccurate product taglines without changing the approved layout or imagery: Longshot Radar now reads **“Contenders the Market May Overlook”**, Stable Notes **“Horses Worth Following”**, and Target List **“When Favorites Face a Test.”** An early connection to the existing Google Fonts providers and a preload of the existing homepage hero image were also approved as performance-only changes. No CSS, hero artwork, cards, saddlecloth chips, navigation layout or commerce logic was altered. The homepage source hash and its regression test are updated to preserve this exact owner-authorized copy. The prior October 31 snapshot branch remains available as a historical recovery point; use the current GitHub main commit for the latest owner-approved wording.


## Owner-authorized Racing Wire navigation (November 4, 2026)

The owner explicitly authorized publishing The Racing Wire and adding **The Wire** to the desktop header and mobile menu throughout public pages. The approved homepage header now includes that navigation link. The homepage title, strapline, hero, feature tiles, spacing and fold remain unchanged. The header switches to the existing compact mobile menu at tablet widths; desktop navigation spacing is tightened to keep the strapline clear. Homepage baseline hash updated to this exact navigation-only source. The homepage lock and protected asset checks remain enabled.


## Owner-authorized Pick Tickets and Stories update (November 22, 2026)

The owner approved **Pick Tickets** as Page 2 with `public/assets/approved/publications/pick-tickets-hero.png`, and **Stories from the Rail** in the Page 4 position with saddlecloth #4 and the Stable Notes badge artwork. The Pick Tickets description is **“Multi-race selections organized by sequence, with a projected hit rate for each.”** Stable Notes is hidden from the homepage and public Publication Desk, removed from the public sitemap, and retained in Publisher's Desk for future use. Pick Tickets remains an available Publisher's Desk category and uses the existing secure listing and checkout flow. The homepage baseline records the current approved cards and copy.
