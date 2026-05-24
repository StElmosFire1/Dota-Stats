# Big leaps — 2026 Q2 shortlist

Task #364. The last ~20 patch notes (v7.36 → v7.57) have been mostly
incremental polish on existing systems — sponsorships, cosmetics, badges,
coaching marketplace, security remediation. Good housekeeping, but the
next quarter needs at least one **step-change** users will notice
without having to read patch notes.

Scoring is **impact × confidence × cost** (each 1–5, higher is better;
"cost" inverted so 5 = cheap, 1 = expensive). The composite is the
product. Ranked descending.

## Ranked summary

| Rank | # | Candidate                              | Impact | Confidence | Cost (inv) | Score | Effort   |
|------|---|----------------------------------------|--------|------------|------------|-------|----------|
| 1    | 10| Public API + webhooks                  | 4      | 5          | 5          | 100   | 2–3 wk   |
| 2    | 1 | AI Coach — post-match feedback         | 5      | 4          | 4          | 80    | 3–4 wk   |
| 3    | 9 | Pro replay browser — search + filters  | 5      | 4          | 3          | 60    | 5–6 wk   |
| 4    | 7 | Auto-highlight reels                   | 5      | 3          | 2          | 30    | 6–8 wk   |
| 5    | 5 | Hero meta intelligence v2              | 4      | 4          | 2          | 32    | 5–6 wk   |
| 6    | 4 | Tournament + bracket overhaul          | 4      | 4          | 2          | 32    | 6–8 wk   |
| 7    | 2 | Streamer mode — overlay + dashboard    | 3      | 5          | 4          | 60    | 2–3 wk   |
| 8    | 3 | Mobile companion (Expo, read-only)     | 4      | 3          | 3          | 36    | 4–6 wk   |
| 9    | 6 | Team / clan system v2                  | 3      | 4          | 3          | 36    | 4–5 wk   |
| 10   | 8 | Coaching v2 — groups + async reviews   | 3      | 3          | 3          | 27    | 4–6 wk   |

(Streamer mode jumps in raw score thanks to low cost; impact ceiling is
the only reason it's not the top pick.)

## Per-candidate deep dive

### 1. Public API + webhooks — **score 100 · top pick** (Candidate #10)
- **Pitch:** Documented public REST API + webhook subscriptions. Match
  results, profile data, inhouse status, leaderboard reads. Webhooks for
  `match.ended`, `lobby.full`, `tournament.round_started`, `coaching.booked`.
  API keys managed in user settings; per-key rate limits.
- **Why now:** the internal Express API surface already exists and is
  battle-tested. Wrapping it with a versioned `/v1/` namespace +
  per-key auth + outbound webhook dispatcher is a small fraction of the
  work compared to a green-field feature. Community has been asking
  for "can I build a stream-deck button for my hero stats" / "can I get
  a Discord ping in my own server when my lobby fills" for months.
- **Dependencies:** none blocking — existing session middleware,
  existing rate-limiter, existing DB queries. Could ship behind
  `public_api` feature flag.
- **Risk:** low. Versioning means we can iterate without breaking
  callers. The only real risk is abuse (DoS) which the existing
  `express-rate-limit` + per-key quotas mitigate.
- **Revenue/retention:** indirect-but-strong. Community-built
  integrations (stream overlays, Discord bots, leaderboard mirrors)
  drive engagement and pull new users in for free. API itself is
  free-with-quotas; Pro members get higher quotas + webhooks as a
  paid feature — direct Pro upsell.
- **Effort:** 2–3 weeks (one of: auth + key management UI, `/v1/`
  router + docs page, outbound webhook dispatcher with retry/backoff).

### 2. AI Coach — post-match feedback — **score 80** (Candidate #1)
- **Pitch:** After every match, hit Groq (already in env as
  `GROQ_API_KEY`!) with the PERF breakdown + lane outcome + ward
  placements + power-spike timeline + chat log (just shipped in #363!)
  and ask for a 3-paragraph coaching note: what went well, what hurt,
  what to try next game. Personal to each player. Rendered on
  `/match/:id` and DM'd via Discord.
- **Why now:** every input is **already in the database**.
  `GROQ_API_KEY` is already provisioned. The chat-log column just
  shipped, which is the last piece for "you flamed your mid at 12:00
  and your team's PERF dropped 0.4 from there" type observations.
  This is a no-new-infra play.
- **Dependencies:** Groq quota (cheap — ~$0.0001 per match). Could
  benefit from the deferred parser upgrades (Task #369 position trail,
  Task #366 sells-timeline) but doesn't block on them.
- **Risk:** medium. LLM hallucinations + tone control — coaching notes
  that are too harsh would drive users away. Mitigation: structured
  prompt with concrete numbers, plus a "report this note" button that
  populates a moderation queue.
- **Revenue/retention:** clear monetisation ladder. Free = 1 note/week;
  Pro = every match; Coach-Premium = "share with my coach" button that
  posts the note + replay link into the coach's Discord DM. Coaching
  marketplace cross-sell on every free user's first note.
- **Effort:** 3–4 weeks (prompt engineering iteration, per-tier rate
  limiting, UI panel, Discord DM template, moderation queue,
  feature flag `ai_coach_notes`).

### 3. Pro replay browser — search by build/fight/score — **score 60** (Candidate #9)
- **Pitch:** `/replays` page where Pro members can search the entire
  archive: "5-position Treant games where the team won despite losing
  first 2 lanes", "Storm Spirit mid with early Orchid built before
  20:00", "matches with > 5 chat-wheel messages from one player".
  Indexed full-text + structured filters.
- **Why now:** the data is there; the chat-log column just landed; PERF
  + laneOutcomes are already structured. The only new thing is a
  query builder UI + Postgres GIN/JSONB indexes.
- **Dependencies:** none blocking. Will be much richer once the deferred
  parser-upgrade tasks land (sells, vision uptime, teamfight cards), so
  ideally sequenced *after* one or two of those.
- **Risk:** medium-low. Search-UX is hard to get right; will need a
  couple of iterations after launch. Index footprint on 17k matches is
  manageable (~200 MB JSONB).
- **Revenue/retention:** the strongest pure-Pro retention hook on this
  list. Power users will renew for this alone.
- **Effort:** 5–6 weeks.

### Candidates 4–10
- **#7 Auto-highlight reels (score 30).** Big shareability win — every
  clip is marketing — but ffmpeg+spectator-archive plumbing is real
  work. Defer until spectator-archive is more battle-tested.
- **#5 Hero meta v2 (score 32).** Strong Pro feature but treads on
  Dotabuff/Stratz territory; inhouse-only data is a niche edge.
  Better as a "phase 2" after AI Coach proves the Pro hook.
- **#4 Tournament/bracket overhaul (score 32).** High value when prize
  pools run — but right now the prize-pool cadence is low. Revisit
  next quarter when the inhouse system has more weekly tournaments.
- **#2 Streamer mode (score 60).** Cheap and well-scoped, but the
  addressable audience is small (~10 active streamers). Worth doing
  as a Q3 polish pass on top of API picks.
- **#3 Mobile companion (score 36).** Cheap with Expo but mobile
  audience for an inhouse tool is uncertain. Better to validate via
  the Public API (Pick 1) and let community build a PWA first.
- **#6 Team/clan v2 (score 36).** Pairs with team scrim scheduling.
  Park until clan-creation rate justifies it.
- **#8 Coaching v2 (score 27).** Group sessions + async reviews are
  high-margin but the 1:1 marketplace is still finding its feet.
  Wait for ≥20 weekly bookings before scaling up the offering.

## Recommendation

**Commit to Picks 1 and 2 in parallel** — they are independent and
target different user segments:

1. **Public API + webhooks** is the cheapest path to a step-change in
   *perceived platform openness*. Two weeks of work unlocks third-party
   integrations forever. Direct Pro upsell (higher quotas, webhooks).
2. **AI Coach post-match notes** is the highest-impact play given we
   already have the inputs and the LLM provider. Three weeks of work
   delivers a feature users will mention by name when describing the
   site. Clear monetisation ladder.

Sequencing: API can ship first (smaller surface, no LLM iteration);
AI Coach in parallel from week 2 onwards. Avoid stacking either onto
the same sprint as the deferred parser upgrades (Tasks #369 #370) so
those can land cleanly into the AI Coach prompt context once available.

Filed as follow-up tasks. Not picked → not filed (kept in this doc for
the next quarterly review).
