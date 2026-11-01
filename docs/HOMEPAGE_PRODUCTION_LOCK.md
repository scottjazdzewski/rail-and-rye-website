# RAIL & RYE — HOMEPAGE PRODUCTION LOCK

**Status: OWNER APPROVED / DO NOT REDESIGN**  
**Approved:** October 31, 2026  
**Frozen homepage source:** `cff3435ac37acfbbf2643ce36f4f6cd7fd6c8910`  
**Recovery snapshot branch:** `approved-homepage-2026-10-31`  
**Website:** https://railandryeracing.com/

The owner has confirmed the homepage layout is correct. Treat this visual state as locked until the owner explicitly requests an intentional homepage change.

## Preserve

- Official Rail & Rye logo and one-row desktop masthead, center racing-intelligence strapline and navigation.
- Approved racing-action hero, headline, gold accent, placement, scale and spacing.
- The two opening tiles: **Today's Race Cards** and **Stories from the Rail**, their numbered chips, backgrounds and links.
- The **MORE FROM RAIL & RYE** heading visible beneath the two tiles on the opening desktop viewport, without small slivers of the next cards appearing at the fold at the approved screenshot size.
- The lower three publication cards, their approved image treatments and category images.
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
