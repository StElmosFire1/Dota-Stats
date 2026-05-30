---
name: Press Box design vs purchasable colour themes
description: The upscale-2026 "Press Box" mockups don't read the live purchasable-theme system; rewire needed if the design ships.
---

# Press Box mockups vs purchasable colour themes

The `artifacts/mockup-sandbox/src/components/mockups/upscale-2026/` "Press Box"
mockups use their own standalone, hardcoded palette (`--pb-*` tokens defined in
`upscale-2026/_group.css`). They do **not** reference the live site's purchasable
colour-theme system at all.

The live purchasable themes — Court & Pitch (free), Newsprint, Carbon, Holo,
Heritage, Broadcast — only restyle the **Magazine v3 profile cover**. They work by
overriding CSS variables (`--bg-base`, `--text-main`, `--accent-brass`, etc.) in
`web/src/components/MagazineCover.css`, scoped by classes like `.v3-theme-holo`.
Catalog/ownership lives in `web/src/profileCosmetics.js`; shop UI in
`web/src/pages/CosmeticsShop.jsx`.

**Parked decision (2026-05-30):** owner wants to see how the new Press Box design
looks in each purchasable theme, but only AFTER the website design is fully locked
in. Do not build theme variants until then.

**Why:** if the Press Box direction ships, the purchasable themes won't carry over
automatically — each theme's palette must be re-mapped onto the `--pb-*` token set
(and applied site-wide, not just the profile cover) so paying users keep getting
what they bought. This is a real follow-up, not cosmetic polish.

**How to apply:** once the design is locked, map each of the 5 Pro themes + the
free default onto the `--pb-*` tokens, wire a theme class/data-attribute onto the
Press Box root, and present the variants on the canvas for owner comparison.

## Graduation scoping rule (2026-05-30)

When graduating Press Box onto live pages, keep every token namespaced under
`--pb-*` and consume them only via `.pb-*` classes on the target pages. **Never
override a global Court & Pitch token** (e.g. `--bg-primary`) in `web/src/styles.css`
to get the deeper press-box background — `body` reads `--bg-primary`, so it leaks
the new look onto every non-target page and breaks a scoped/page-by-page rollout.
The architect code review fails this as cross-page leakage.

**Why:** the rollout is deliberately page-by-page with a review window per batch;
a global token change silently restyles pages that weren't reviewed.

**How to apply:** if a target page needs the deeper bg, set it on that page's
scoped root (the `.pb-leaderboard` / `.pb-profile` / `.pb-match` wrapper, or add a
wrapper class for inline-styled pages like Home/Inhouse), not on global `:root`.
