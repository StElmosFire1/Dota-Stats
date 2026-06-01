# OCE Inhouse — ~30s Hype Trailer · Build Handoff Kit

This kit is a **turnkey package for building the trailer in a NEW Replit project**. The
original project (the Dota bot + dashboard) has artifact creation disabled, so the
`video-js` workflow — which needs a dedicated "video" artifact with an in-browser
recording/MP4-export pipeline — cannot run there. Everything below lets the new
project's agent build the trailer immediately and on-brand.

---

## 0. How to use this kit (do this first)

1. **Create a new Replit project** from the Replit dashboard. Either a blank/app
   project that supports artifacts, or use the Replit Agent and ask it to build an
   animated video.
2. **Upload this whole `trailer-handoff/` folder** into the new project's
   `attached_assets/` (or project root). The logo, fonts, and music are bundled in
   `assets/`.
3. **Drop the owner's Dota 2 gameplay clips** into the new project's
   `attached_assets/` (see §6 — these are still needed; none were supplied yet).
4. **Kick off the build** by pasting the brief in §7 to the agent. It will read the
   `video-js` skill and delegate to the design subagent, which produces the MP4.

> The `video-js` workflow auto-plays + records the React/Framer-Motion composition and
> exports a real ~30s MP4 — that is the deliverable. It is NOT a slideshow of stills.

---

## 1. The goal (verbatim intent)

A punchy ~30-second motion-graphics trailer hyping the OCE Inhouse website, the inhouse
lobbies, and the fun of the community. It intercuts real Dota 2 gameplay clips
(owner-supplied) with slick, on-brand animated sequences showing off key site features.
Built for social media + Discord. Audio = background music + on-screen text callouts.
**No voiceover.** One ~30s master (no 60s re-cut, no platform variants).

Opens with a brand hook (logo + tagline) → cuts through 3–5 feature highlights
(intercut with gameplay) → lands on a CTA end card pointing at `oceinhouse.gg`.

---

## 2. Brand kit (exact tokens — use these, don't guess)

**Palette — "Court & Pitch" (dark default):**

| Role | Hex |
|---|---|
| Ink-navy (primary bg) | `#0d1424` |
| Deep panel bg | `#0a101e` |
| Card / secondary bg | `#152036` |
| Brass / gold (accent) | `#c5a975` |
| Brass bright | `#e1c79a` |
| Amber (energy accent) | `#f59e0b` |
| Parchment (light text/cards) | `#f5efe2` |
| Text primary | `#e6edf8` |
| Text secondary | `#94a6cb` |
| Radiant green (win/positive) | `#34d399` |
| Dire red (loss/negative) | `#f87171` |

Direction: ink-navy backgrounds, brass as the structural accent, amber for the hottest
"hype" moments and the URL, parchment/cream for contrast highlights. Avoid neon, purple,
or cyan/magenta — stay inside this palette for a native `oceinhouse.gg` feel.

**Typography (Google Fonts; TTFs also bundled in `assets/fonts/`):**

- **Playfair Display** — headlines / editorial text (display font). Big, confident,
  tight tracking. Weights 700 + 800.
- **Oswald** — eyebrows / labels / section tags. Uppercase, ~0.22em letter-spacing.
- **Newsreader** — numeric stats only (MMR, counts, prize totals). Tabular lining
  figures. This is the "stat number" font — use it for any counting/figure moment.
- **Inter** — body / small supporting text.

Type rule of thumb: **text → Playfair, numbers → Newsreader, labels → Oswald.**

**Logo:** `assets/brand/oa-logo.png` (the OA monogram). `assets/brand/favicon.png` is
the square mark. Brand lockup is "OCE INHOUSE" in Playfair with an Oswald eyebrow.

**Tagline options (pick one, or the agent can refine):**
- "OCEANIA'S DOTA 2 PROVING GROUND"
- "REAL INHOUSE. REAL STAKES."
- "WHERE THE OCE LADDER GETS SERIOUS"

---

## 3. Locked storyboard / beat sheet (~30s, 6 beats)

Pacing varies on purpose (punchy 4s beats mixed with 5–6s feature moments). Gameplay
intercuts land on the music's hardest hits. On-screen text is SHORT — one phrase per beat.

| # | Beat | Dur | On-screen text | Visual / motion | Music energy | Gameplay |
|---|------|-----|----------------|-----------------|--------------|----------|
| 1 | **Brand hook** | 0–4s (4s) | Eyebrow: `OCEANIA'S DOTA 2 PROVING GROUND` · Headline: `OCE INHOUSE` | Ink-navy void, brass particles/embers converge, OA logo strikes in with an amber flare, headline chars stagger in (Playfair), brass underline draws across | Low rumble → first downbeat hit on logo strike | — |
| 2 | **The hook line** | 4–8s (4s) | `FROM PUB CHAOS TO REAL COMPETITION` | Kinetic typography, fast cuts; first gameplay burst (teamfight) wipes in behind/through the type | Beat kicks in, fast | **GAMEPLAY CLIP A** (teamfight / high-energy) |
| 3 | **Feature: Inhouse Lobbies** | 8–13s (5s) | `FACEIT-STYLE INHOUSE LOBBIES` · sub: `Sign in → draft → dedicated server in seconds` | Captured site footage of the inhouse draft flow + the auto-provisioned-server moment, composited inside a brass-framed "device" panel with animated callouts pointing at the draft board | Driving | optional quick cut |
| 4 | **Feature: Stats / MMR / Hall of Fame** | 13–19s (6s) | `TRUESKILL MMR · 8-TIER LADDER · PERF SCORES` | Scoreboard with MMR deltas + leaderboard / Hall of Fame captures; Newsreader stat numbers count up (e.g. MMR ticks, PERF 1.0→9.4); intercut a gameplay highlight (rampage / clutch) | Peak energy | **GAMEPLAY CLIP B** (highlight moment) |
| 5 | **Feature: Coaching & Prize Pools** | 19–24s (5s) | `COACHING MARKETPLACE · PRIZE POOLS · SEASONS` | Coaching + prize-pool surfaces slide in as stacked brass cards; a prize total counts up in Newsreader; parchment accent | Sustained, building to break | optional quick cut |
| 6 | **CTA end card** | 24–30s (6s) | `JOIN THE INHOUSE` · big amber URL: `oceinhouse.gg` | Logo lockup re-forms center, amber URL snaps in, brass frame closes; everything settles then begins a subtle exit so the loop back to beat 1 is seamless | Final hit + tail | — |

**Mute test:** the story reads with no sound. **Loop test:** beat 6 has an exit so it
loops cleanly. Keep total within ~30s (±1s).

---

## 4. Motion system (so it reads "designed", not "assembled")

- **Entrance:** brass elements draw/wipe in (stroke-dashoffset on lines/frames);
  headlines stagger per-character with a small spring.
- **Exit:** scale-up + blur, or directional push that flows into the next beat —
  never fade-to-black between beats.
- **Persistent layers:** an ember/particle field + a brass frame element should live
  across beats and transform on scene change (camera-move feel), not mount/unmount.
- **Transitions:** brass "wipe" sweeps and clip-path reveals; reuse 2 types, not random.
- **Numbers always count** (Newsreader) rather than just appearing.

---

## 5. Asset inventory (bundled in this kit)

| File | Use |
|---|---|
| `assets/brand/oa-logo.png` | Hero logo — beats 1 & 6 |
| `assets/brand/favicon.png` | Corner persistent element / loader. NOTE: in the source project this file is byte-identical to `oa-logo.png` (both are the OA mark, 875×550) — there is no separate square favicon. Crop/letterbox if a square mark is needed. |
| `assets/fonts/PlayfairDisplay-*.ttf` | Headlines |
| `assets/fonts/Oswald-Medium.ttf` | Eyebrows / labels |
| `assets/fonts/Inter-*.ttf` | Body (also load Newsreader from Google Fonts for stat numbers) |
| `assets/audio/music_bed.mp3` | Candidate background track. NOTE: this was authored for a
  narrated tutorial, so it may be too soft. Prefer generating a punchier ~30s hype track
  in the new project if it doesn't hit hard enough. No voiceover either way. |

Supplemental assets to GENERATE in the new project (design subagent): ember/particle
textures, a brass frame/vignette, and any atmospheric background loops. Always
`remove_background: true` for overlays; include "no text, no words, no letters" in
image prompts.

---

## 6. Still needed from the owner

- **Dota 2 gameplay clips** — none were in `attached_assets/` at handoff time. Drop 2–4
  short high-energy clips (teamfight, rampage/clutch, a hype moment) into the new
  project's `attached_assets/`. Until then, beats 2 & 4 use clearly-marked placeholder
  panels (a labelled "GAMEPLAY CLIP A/B" slate) so the slots are obvious.
- **Live-site feature captures** — screen recordings of the inhouse draft + provisioned
  server, scoreboard w/ MMR deltas, leaderboards / Hall of Fame, coaching, prize pools.
  If not provided, the agent can recreate stylized on-brand mock UIs for these beats and
  flag them as representative.

---

## 7. Paste-ready brief for the new project's agent

> Build a ~30-second hype trailer for **OCE Inhouse** (`oceinhouse.gg`), an OCE Dota 2
> inhouse community site. Use the **video-js workflow** — read `.local/skills/video-js`
> and delegate the build to the design subagent. Output one ~30s MP4 for social/Discord.
> Audio is background music + kinetic on-screen text callouts — **no voiceover**.
>
> Follow the locked storyboard, brand kit, and motion system in `trailer-handoff/BRIEF.md`
> (uploaded in attached_assets). Use the bundled logo, fonts, and music in
> `trailer-handoff/assets/`. Palette: ink-navy `#0d1424`, brass `#c5a975`, amber
> `#f59e0b`, parchment `#f5efe2`. Fonts: Playfair Display (headlines), Oswald (eyebrows),
> Newsreader (stat numbers), Inter (body).
>
> Structure: brand hook (logo + tagline) → 3 feature beats (inhouse lobbies/draft,
> TrueSkill MMR + Hall of Fame stats, coaching + prize pools) intercut with the Dota
> gameplay clips in attached_assets → CTA end card on `oceinhouse.gg`. Intercut gameplay
> on the music's hardest hits. If gameplay clips or live-site captures are missing, stub
> those beats with clearly-labelled placeholder slates and flag where the real footage
> slots in. Make it loop cleanly.
>
> You are capable of extraordinary creative work. Don't hold back — this is the first
> thing a prospective OCE player sees, and it should stop them mid-scroll.
