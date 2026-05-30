# Findings — "One Tooth Gaming In-House League" vs `oceinhouse.gg`

**Date captured:** 2026-05-30
**Clone URL:** `https://dota-pro-tracker.preview.emergentagent.com` (hosted on Emergent's AI app-builder preview infra)
**Original:** `https://oceinhouse.gg` (OCE Inhouse — full edition)

---

## Capture constraints (read this first)

The evidence below is necessarily partial because of how both sites behaved on the capture date:

- **Clone — only the home page is reachable.** The Emergent preview container is asleep. Every app route other than `/` (`/standings`, `/matches`, `/players`, `/heroes`, `/about`, `/faq`, `/play`, etc.) returns an interstitial *"Ready to start your preview — Click 'Wake up servers'"* (see `screenshots/clone-subpage-preview-asleep.jpg`). Waking it requires an interactive button click and a 3–5 minute spin-up that the capture tooling can't perform, and it sleeps again on idle. The home page is served from the edge cache so it renders fully. **The full rendered text of the clone home page is preserved verbatim in `clone-home-fulltext.md`** — that single page is the richest piece of evidence and is where the per-page findings below are drawn from.
- **`oceinhouse.gg` — now behind a private-preview password.** During capture the full edition dropped into private-preview lockdown: every route (including `/`) now shows an inline *"Sign in — This site is in private preview"* gate (`screenshots/ours-home-lockdown.jpg`). Per task scope I did **not** authenticate. Fortunately the real home page was captured via text fetch moments before the lockdown engaged — preserved in `ours-home-fulltext.md` — and the rest of our site's copy/IA is verifiable directly from the source tree in this repo (`web/src/`).

So the side-by-side is: **clone home (screenshot + full text)** vs **our home (full text + source)**, plus a structural/IA/data comparison that does not depend on live subpages.

---

## 1. Brand identity — logo & name — `independent` (NOT copied)

| | Clone | Ours |
|---|---|---|
| Brand name | **"One Tooth Gaming" / "In-House League"** | **"OCE Inhouse"** |
| Logo | Yellow **tooth** glyph in a rounded square | **OA** monogram (`web/public/oa-logo.png`) |
| Wordmark treatment | Huge gold "One Tooth Gaming" + spaced "IN-HOUSE LEAGUE" | "OCE Inhouse" under the OA logo |

**Judgement:** The brand name and logo are **completely different**. There is **no** lifted `oa-logo.png`, no "OCE Inhouse" wordmark, no shared favicon. The clone did **not** copy any protected brand asset. Do not claim logo/brand-name theft — it would be false and would undermine the rest of the case.

---

## 2. Visual design language — `derivative`

Both sites run a **dark UI with gold/amber accents**. Ours is the documented "Court & Pitch" palette (ink-navy `#0d1424`, brass `#c5a975`, amber `#f59e0b`; see `replit.md` → Branding). The clone uses a near-identical dark-navy + gold/amber esports look, the same accent-amber `#f59e0b`-family highlight on its primary CTA and "Prize Pool" card, and the same left-rail-nav + content-grid shell.

**Judgement:** Strong family resemblance, but a dark+amber Dota/esports theme is a common, **unprotectable** aesthetic. The shared left-rail IA (see §3) is more telling than the colours. Tag **derivative** — evidence of "built while looking at our site," not verbatim CSS theft. (No stylesheet was compared byte-for-byte; the clone's CSS was not retrieved.)

---

## 3. Information architecture / navigation — `derivative` (distinctive overlaps noted)

Clone left-rail nav (from `screenshots/clone-home.jpg`): **Home · Play Now · Join the League · Standings · Matches · Players · Leaderboard · Hero Meta · Heroes · Synergy · Positions · Records · Compare · Overview · About/Founder · Hall of Fame · FAQ · Draft AI · Roster · Community Admin · League Admin · Upload Replay · Sign in.**

Our nav (`web/src/App.jsx`): **Home · Leaderboard · Player Stats · Positions · Heroes · Synergy · Matches · This Week · Players · Tools▾(Upload Replay, Draft & Assistant, Records, Predictions, Patch Notes, … Inhouse Lobby, Tournaments, Coaching Marketplace, … Join the League) · Pro.**

Overlapping page set:

| Clone label | Our equivalent | Note |
|---|---|---|
| Leaderboard / Standings | Leaderboard | generic stats-site label |
| Matches | Matches | generic |
| Players | Players | generic |
| Heroes / Hero Meta | Heroes (+ meta tab) | generic-ish |
| **Synergy** | **Synergy** | distinctive — same uncommon label |
| Positions | Positions | semi-distinctive |
| Records | Records | generic |
| Compare | Compare (`/compare`) | distinctive feature parity |
| **Draft AI** | **Draft & Assistant** | distinctive feature parity |
| **Upload Replay** | **Upload Replay** | distinctive — same exact label |
| **Join the League** | **Join the League** | distinctive — same exact phrase |
| Hall of Fame | Hall of Fame | semi-distinctive |
| Play Now | Inhouse Lobby (`/inhouse`) | same feature, different label |

**Judgement:** Individually most of these labels are generic to any stats tracker. But the **combination** — and specifically the exact-match distinctive labels **"Synergy," "Upload Replay," "Join the League,"** plus feature-for-feature parity on **Compare** and a **Draft assistant** — shows the clone's IA was modelled on ours. Tag **derivative**: structure/feature-set was used as a template. (Layout and feature ideas are generally not protectable on their own; this supports the "pointed at our site" narrative rather than standing alone.)

---

## 4. Proprietary community data — player roster & match history — `clear-copy` ⚠️ STRONGEST EVIDENCE

This is the part that crosses cleanly from "inspired by" into "took our stuff."

The clone is populated with **our real OCE community members' handles and our real match data**, not placeholder/sample data.

**Player handles that appear on BOTH the clone home and our home (`ours-home-fulltext.md`):**
`Dorit Duckling`, `Lemon Burtle`, `BAD1`, `Frangie`, `MajinDabura`.

**Additional distinctive handles the clone uses** (Top Players, "Active Beefs", Community Awards, Quotes Wall, Roster Vibes table): `morgiemuff`, `Destiny`, `Bisket`, `Play Better`, `Viking`, `KillerRoo`, `Squire`, `Monstah`, `WaterBlitz`, `1KD`, `BOONGERZ SASSOLE™`, `Aksoman!aC~`, `check him pc`, `Chris's Equal`, `The 1 & Only. mr FATTY`, `Skipper`.

**Verified against our own database** (read-only query of our dev DB, which holds a subset of the real roster): the following clone handles exist **verbatim** in our `player_stats.persona_name` / `nicknames.nickname`:
`BAD1`, `Lemon Burtle`, `MajinDabura`, `Monstah`, `Viking`, `WaterBlitz`. (The dev DB is only a partial snapshot, so non-matches are not exonerating — the full roster lives on the prod host.)

The clone also shows **real match records** with real-looking durations/dates (e.g. "Match #3519575 · Dire Won · May 24, 2026 · 46 min" with a full 10-hero draft), and real Dota hero portraits pulled from Steam's CDN.

**Judgement — `clear-copy`.** A community member's handle list and a league's match history are the league's own proprietary, non-public-by-default operational data. The clone didn't invent a roster — it ingested **ours**. This is the single most defensible "they took protected material" claim in the dossier, and it directly supports the task's premise that the builder pointed an AI app-builder at `oceinhouse.gg` and scraped it. (Note: individual gamer handles are not themselves copyrightable, but the wholesale reproduction of our specific roster + match dataset is strong evidence of scraping/misappropriation and is the thing to lead with.)

---

## 5. Feature concept & product framing — `derivative`

The clone reproduces our entire product concept and feature list, in its own words:

- **"Australia's #1 in-house Dota community … balanced 5v5 lobbies … seasonal rewards & rankings … nightly from 7:30 PM AEST"** — same positioning as OCE Inhouse (Aussie/OCE nightly in-house league).
- **"The first In-House League in Australia"** — same first-mover claim.
- **Auto-parsed replay stats** — "APM, GPM, IMP, fight participation, vision, role-relative percentiles," "Claude-powered scout reports." Mirrors our replay-parser + PERF/percentile feature (note: we use **PERF**, the clone says **IMP** — OpenDota's metric — so this is re-described, not copied verbatim).
- **MMR-balanced team matchmaking, captain draft, Discord voice, prize pool / seasonal payouts, Smurf Detection Score.** Every one of these is a real OCE Inhouse feature (see `replit.md`: TrueSkill MMR, inhouse captain draft, prize pools, smurf-detector fingerprinting).

**Judgement — `derivative`.** The feature set and product framing are clearly modelled on ours, but expressed in **new, original marketing copy**. None of the clone's marketing strings (`"Play of the Week"`, `"Funniest Moment"`, `"Smurf Detection"`, `"Stat Goblin"`, `"Don't queue solo. Come home."`, `"Active Beefs"`, `"Teeth Missing"`, etc.) exist anywhere in our source tree — confirmed by full-repo search. Product **ideas and feature concepts are not protectable**; the owner should frame this as "they rebuilt our product," not "they copied our text."

---

## 6. Marketing copy — `independent` (NOT copied)

The clone's landing page is **far more elaborate than ours** (~25k chars of rendered text vs our minimal ~1.6k-char hero/landing). It adds whole sections we don't have: "Active Beefs" vote cards, "Reel of the Week," "Core Values," "Community Awards," "Meme Wall," "Squad Illustrations," "Quotes Wall," a joke "Roster Vibes Chart," a "Soundboard," "Is This For You?" personas, and testimonial cards.

A full-text search of our repo for the clone's headlines and section names returned **zero** matches.

**Judgement — `independent`.** The body/marketing copy is **not** lifted from us. It's original (or AI-generated) writing wrapped around our concept and our data. Do not claim copy theft.

---

## 7. Per-page status (enumerated, mostly un-capturable)

| Page | Clone URL | Status | Equivalent on ours |
|---|---|---|---|
| Home | `/` | ✅ captured (screenshot + `clone-home-fulltext.md`) | `/` (`ours-home-fulltext.md`) |
| Standings | `/standings` | ⛔ preview asleep | `/leaderboard` |
| Leaderboard | `/leaderboard` | ⛔ preview asleep | `/leaderboard` |
| Matches | `/matches` | ⛔ preview asleep | `/matches` |
| Players | `/players` | ⛔ preview asleep | `/players` |
| Heroes | `/heroes` | ⛔ preview asleep | `/heroes` |
| Hero Meta | `/hero-meta` | ⛔ preview asleep | `/hero-position-meta` |
| Synergy | `/synergy` | ⛔ preview asleep | `/synergy` |
| Positions | `/positions` | ⛔ preview asleep | `/positions` |
| Records | `/records` | ⛔ preview asleep | `/records` |
| Compare | `/compare` | ⛔ preview asleep | `/compare` |
| Draft AI | `/draft-ai` | ⛔ preview asleep | `/draft-assistant` |
| Roster | `/roster` | ⛔ preview asleep | `/players` |
| Hall of Fame | `/hall-of-fame` | ⛔ preview asleep | `/hall-of-fame` |
| FAQ | `/league/faq` | ⛔ preview asleep | `/join` (FAQ section) |
| Overview | `/overview` | ⛔ preview asleep | `/stats` |
| About / Founder | `/about` · `/founder` | ⛔ preview asleep | (no direct equivalent) |
| Play | `/play` | ⛔ preview asleep (sign-in-gated flow) | `/inhouse` |
| Join the League | `/join` | ⛔ preview asleep | `/join` |
| Upload Replay | `/upload` | ⛔ preview asleep | `/upload` |
| Account / Sign in | `/account` | ⛔ auth-gated (not attempted) | Steam sign-in |

Re-run the screenshot pass when the Emergent preview is awake (someone clicks "Wake up servers" and visits each route within the keep-alive window) to fill in the clone-side subpage images; the equivalent `oceinhouse.gg` shots need the private-preview lockdown lifted (or a signed-in session, which is out of scope here).

---

## Evidence inventory

- `screenshots/clone-home.jpg` — clone landing page (hero + full left-rail nav + live stat cards).
- `screenshots/clone-subpage-preview-asleep.jpg` — proves clone subpages are gated behind Emergent's "Wake up servers" interstitial.
- `screenshots/ours-home-lockdown.jpg` — current `oceinhouse.gg` state (private-preview sign-in gate).
- `clone-home-fulltext.md` — complete rendered text of the clone home page (primary evidence).
- `ours-home-fulltext.md` — our home page text captured just before lockdown.
