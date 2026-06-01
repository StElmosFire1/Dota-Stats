---
name: Hype trailer renderer
description: How the OCE Inhouse hype trailer MP4 is rendered and the transition/asset decisions behind it.
---

# Hype trailer renderer

The trailer is rendered fully server-side: `scripts/render-trailer.mjs` uses
`@napi-rs/canvas` to draw all 900 frames (30s @ 30fps, 1920×1080) and pipes raw
RGBA to ffmpeg (libx264/AAC) → `attached_assets/oce-inhouse-hype-trailer.mp4`.
Run with `npm run render:trailer`. It's `.mjs` (not `.js`) because root
`package.json` is not `type:module`.

**Why server-side, not a video artifact:** this project only supports
mockup-sandbox artifacts, NOT browser-recorded video artifacts. So no browser
recording pipeline / new Repl is needed — canvas+ffmpeg is the export path.

## Transitions — never fade-to-black between beats
**Rule:** cross-dissolve between beats by rendering the outgoing and incoming
beat to two offscreen canvases and alpha-blending them over a ~0.6s window
centred on each boundary. Each beat renderer must NOT paint its own
full-screen `rgba(10,16,30,exitT)` exit overlay.
**Why:** the first cut did paint per-beat fade-to-navy overlays; the user
called the result "random flashing between scenes" — every boundary hard-cut
through near-black. The only acceptable full-frame fade is a single gentle
fade-out at the very end of the CTA.

## Feature beats use REAL website screenshots, matched 1:1 to the heading
TALL full-page captures live in `screenshots/tall_*.png`, grabbed by
`scripts/capture-trailer-pages.mjs` (Playwright, `fullPage:true`, 1440-wide,
1.5x DPR, against `http://localhost:5000`). They're composited as framed
product cards (soft shadow + brass border + caption).
- Beat 2 (overview) = home; Beat 3 (inhouse lobbies) = the **captain-pick
  board** at `/admin/draft-sandbox`; Beat 4 (MMR/ladder) = leaderboard.
**Match the page to the heading** — user explicitly rejected showing Match
History under the "Inhouse Lobbies" heading; the visual must be the thing the
headline names.
**Scroll tall pages.** `drawScrollCard`/`showScrollCard` fit the page to card
width and pan vertically (eased) across the beat — looks like a product tour.
Short pages (the /inhouse hero) stay static via `showCard` (cover-fit).
**Capture quirks:** dev `/inhouse` renders a clean sign-in hero (unlike live
prod, which is blank for anon — see playwright-site-capture.md); coaches/draft
pages are empty in dev so they're not used. Chromium needs the Nix system libs
from playwright-site-capture.md.
**Why:** user wanted real site footage that scrolls; mock UI cards with emoji
read as tacky.

## Admin-only pages need a superuser session to capture
`/admin/draft-sandbox` (the captain-pick board — the best "inhouse draft"
visual) renders "Admin only" for anon. `capture-trailer-pages.mjs` POSTs to
`/api/admin/superuser-login` with `process.env.SUPERUSER_PASSWORD` to set a
session cookie on the Playwright context before the capture loop; it degrades
gracefully (logs SKIPPED) when the var is unset. SUPERUSER_PASSWORD is NOT set
in this dev env by default — request it as a temp secret, capture, then it must
be removed via the Secrets pane (platform `deleteEnvVars` only clears env vars,
not the global secret store).

## Title-card reveals: single fade+rise, constant size + constant glow
**Rule:** reveal the "OCE INHOUSE" wordmark (and CTA logo/URL) by animating
ONLY alpha + a small vertical rise. Keep font size constant and the amber
`shadowBlur` constant; fade the logo in at near-final scale (~0.86→0.9), not
from zero.
**Why:** the first cut used a per-character staggered reveal plus an
`shadowBlur = 14*cr` that ramped with the reveal — the growing glow bloom +
staccato per-char pop read to the user as the wordmark "jumping a little in
size randomly." Same pattern on the CTA (logo scaling 0→1, `shadowBlur*urlT`).

## Cross-dissolves morph any text/line that two beats share — gate it out
**Rule:** every text element (eyebrows, headlines, sub-captions, card captions,
wordmark, CTA copy) AND every brass divider line must be multiplied by
`textGate(frame, beat)`, which returns 0 during a beat's dissolve window and 1
only once the beat owns the screen alone (in-ramp after `start+XFADE/2`,
out-ramp before `end-XFADE/2`, ~0.12s ramp; no in-gate on beat 0, no out-gate
on the last beat). Cards/emblems/backgrounds are intentionally left ungated —
imagery cross-dissolving looks good; only text/lines morph badly.
**Why:** two beats whose headlines sit at the same Y alpha-blend during the
~0.6s dissolve into a muddy half-formed blob — the user called it text
"changing size and shape randomly throughout the video." The brass divider
lines (two of them near the same Y) produced the same faint morphing band, so
they're gated too. Verify by extracting frame-accurate PNGs at dissolve
midpoints (`ffmpeg -i in.mp4 -ss <boundary> -frames:v 1` — output-seek is
frame-accurate; input-seek `-ss` before `-i` is keyframe-snapped and lies).

## Text must PURE-fade — no rise/scale on any reveal
**Rule:** every text reveal (headlines, wordmark, hookline, CTA copy, captions)
and the logos animate ALPHA ONLY — no `translate(y + k*(1-reveal))` rise, no
`lerp(scaleA,scaleB)` size settle. Font size + position are constant; only
`globalAlpha` (× the dissolve gate) moves.
**Why:** the user twice reported text "jumping around and changing size … tried
to animate it but then set a fixed point that it jumps to." The culprit was the
combo of (a) per-element rise translates and (b) logo scale settles, made worse
by the dissolve gate hiding the text until *partway* through that motion — so it
popped in mid-slide and snapped to its resting spot. Removing all motion (fade
only) is the only thing that read as stable. Don't reintroduce "tasteful" rises.

## Even a pure ALPHA fade makes serif text LOOK like it changes size
**Rule:** reveal fade-in text with constant GLYPH COVERAGE, not opacity. The
shared `revealText()` helper draws the glyph at full size + full coverage every
frame and develops only its COLOUR from `C.inkNavy` (≈ the dark bg) up to the
target colour; a tiny `smoothstep(0,0.12,revealIn)` opacity gate prevents a
ghost before it appears, and the drop-shadow alpha ramps with `revealIn`. The
scene cross-dissolve still uses real opacity via the separate `gate` arg.
`drawHeadline`/`drawEyebrow` and every inline title (wordmark, hooklines, CTA
copy, sub-lines) route through it; `drawEyebrow`/`drawHeadline` now take
`(…, revealIn, gate, [size])` as SEPARATE args, not a pre-multiplied alpha.
**Why:** after all rise/scale was already removed, the user STILL reported
"fadein texts changing size randomly." Root cause: a normal `globalAlpha` fade
multiplies every pixel's AA coverage, so a serif's thin strokes (already partial
alpha) drop below visibility while the thick cores show first — the text reads
as growing small→full during the low-alpha window (measured: headline bbox went
50px→66px over the fade). Colour-develop keeps coverage at 1.0 so the glyph is
always full size; verified the bbox now holds ~63→66px from first visible frame.
**How to apply:** verify by extracting frames across a fade and measuring the
text bbox height — it must be ~constant, not grow.

## "FEATURE 0X ·" eyebrow prefixes — don't label beats "feature"
User dislikes "FEATURE 01/02/03 ·" eyebrows; keep just the descriptor
(`COMPETITIVE LOBBIES`, `SKILL-BASED RATING`, `GROW & COMPETE`).

## Tier emblems (all 11) live in the stats beat — use bg-stripped copies
`drawTierLadder()` paints all 11 crests (ascending Peasant→King per
`src/config.js`) as one horizontal strip beneath the (shrunk, lifted)
leaderboard card in beat 4, glow intensifying toward King. `badgeDir` /
`tierBadgeDir` must be declared next to `brandDir`.
**Load the transparent copies in `trailer-handoff/assets/badges/`, NOT
`web/public/badges/` directly.** The three sub-tier source PNGs
(`tier-sub-*-{peasant,vagabond,outlaw}`) ship with a navy/white card + border
baked into the art (a visible "box"); the other 8 sit on near-black that blends
into the dark trailer. User flagged the 3 boxes. Never edit the `web/public`
originals — the live site renders those.

**AI background removal is UNRELIABLE on the ornate card-style sub-tiers.** It
matted Peasant cleanly (shield on flat bg) but left Vagabond's whole card and
mangled Outlaw. **The "box" is NOT a flat backdrop — it's a fully decorated
SQUARE PLAQUE**: a navy panel + a thin gold square FRAME around the plaque edge
+ the tier name in gold text, with the heraldic shield sitting on top. The 8
plain tiers are just shields; only the 3 sub-tiers have this plaque.

**What works = programmatic matte with INSET seeds (not just border seeds):**
1. Flood-fill transparency over bg-class pixels (Vagabond bg = near-white outer
   margin OR navy plaque `avg<72 && b+12>=r`; Outlaw bg = near-black navy
   `avg<78 && b+12>=r`). **A border-only flood FAILS** — it removes the thin
   outer margin but the plaque's gold square-frame is warm/bright (not bg-class)
   and STOPS the flood, so the navy plaque interior is never reached and ~91% of
   the image survives. The fix: ALSO seed the flood from inset vertical columns
   *inside* the plaque, past that frame — `x≈0.10W` and `0.13W` (and mirror on
   the right) for `y` in `0.12H..0.88H`. Those land in plaque navy on the sides
   (shield is narrower, centred), so region-grow fills the whole plaque and
   stops at the shield's warm wood/gold border. Healthy result: kept% ≈ 45-57%.
2. Keep ONLY the connected component containing the CENTRE pixel — drops the now
   isolated gold square-frame + floating tier-name text. A crest ribbon/sash
   that crosses the shield (Outlaw's diagonal banner) stays connected and is
   KEPT — that's fine, other tiers have ribbons too.
Run on the `web/public` originals → write to `trailer-handoff/assets/badges/`.
The @napi-rs/canvas matte script must run from the workspace ROOT, not /tmp.
**Verify by compositing over MAGENTA or GREEN** (`#ff00ff`/`#00ff00`) — the read
tool's dark canvas composite HIDES a dark plaque; only a bright bg exposes it.
The low-res strip composited over the dark trailer bg ALSO hides the box, so
always re-check the matte over a bright bg, never trust the trailer-strip frame.
