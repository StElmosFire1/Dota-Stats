# Site smoke-test checklist

Use this after every release batch (or weekly). Tick the box, drop a note on anything weird, then paste the whole document back to me in chat.

**How to use:**
- `[ ]` = not yet checked
- `[x]` = checked, all good
- `[!]` = checked, something is off — leave a note on the next line
- Notes go indented under each item, prefixed with `>` so they're easy to spot.

---

## 1. Sign-in & navigation

- [ ] **Steam sign-in works** — Open site in a private window, click "Sign in with Steam", complete the redirect, land back on the site signed in.
- [ ] **Sign-out works** — User menu → Sign out, confirm session ends and protected pages bounce to public view.
- [ ] **Top nav loads on every page** — Visit Home, Players, Leaderboard, Synergy, Coaches, Tournaments, Inhouse, Patch Notes. No broken links, no missing page.
- [ ] **Mobile-width nav works** — Resize browser to ~390px; hamburger / drawer opens, every item is tappable.

> Notes:

---

## 2. Home page

- [ ] **Live presence chips** show players currently in lobby / in match / in queue with correct colours (amber / gold / violet).
- [ ] **Recent matches** list loads and links to match detail.
- [ ] **Hot streaks / MVP / community challenge tiles** (if any are featured this week) render without "undefined".

> Notes:

---

## 3. Player profile

- [ ] **Your own profile loads** at `/me` and shows: rank, tier, PERF, recent matches, signature hero, nemesis widget.
- [ ] **Any other player's profile loads** by clicking a name in the leaderboard.
- [ ] **Rating history chart** renders without errors.
- [ ] **Achievements strip** shows your earned badges; hover/focus shows tooltip.
- [ ] **Nemesis / best teammate widget** populates (if you have enough matches).
- [ ] **"Watch live" / presence chip** appears when the player is currently in a lobby.

> Notes:

---

## 4. Players list & live presence

- [ ] `/players` loads, filter/sort works.
- [ ] **Live now tab** shows players currently in lobby / drafting / in match.
- [ ] **Steam avatar fallback** — players with no avatar still render a placeholder.

> Notes:

---

## 5. Leaderboard & season

- [ ] **Current season leaderboard loads** with correct headers (rank, tier, PERF, W-L).
- [ ] **Sort by each column works** (rank, PERF, W-L, K/D/A).
- [ ] **Season selector** lets you view a past season.
- [ ] **Season summary page** for a closed season shows finals, most-improved, longest streaks, Hero of the Season.

> Notes:

---

## 6. Synergy / head-to-head heatmap

- [ ] `/synergy` loads.
- [ ] **Teammates mode** shows colour-coded WR for stacks (≥2 games).
- [ ] **Enemies mode** toggles cleanly, shows H2H WR.
- [ ] Tooltip on hover/focus shows wins/games/WR.

> Notes:

---

## 7. Match detail & replay viewer v3 (just shipped)

- [ ] **Match page loads** for a recent recorded inhouse.
- [ ] **Scoreboard** renders with all 10 players, GPM/XPM/KDA, items.
- [ ] **Replay viewer 2D opens** when you click "Watch replay".
- [ ] **Gold-delta sparkline** appears above the scrub bar; clicking it jumps the playhead.
- [ ] **Hero hover on minimap** shows inventory + backpack tooltip at that timestamp.
- [ ] **Fight chips strip** lists each detected team fight; clicking a chip jumps to that fight.
- [ ] **"Share clip" button** copies a URL like `/replay/:id?t=…&end=…&focus=…` and that URL, when pasted, autoplays the clip window.
- [ ] **Sharing the URL in Discord** unfurls with a card that quotes the clip window times.

> Notes:

---

## 8. Inhouse lobby (full edition only)

- [ ] **Sign-in page** at `/inhouse` lists current open lobby with positions.
- [ ] **Register a position** as one of 1–5; you appear in the right column.
- [ ] **Accept phase** — once 10 players sign in, accept prompt appears with countdown.
- [ ] **Captain draft** — when picked as captain, pick UI is clickable, timer counts down, suggestions panel (if you opted in) appears.
- [ ] **Auto-provision** — after the 10th pick, a dedicated server is auto-spun and lobby boot info appears within ~30s.
- [ ] **Failure recovery** — (rare) if provision fails, "Retry" button appears for captains and an admin Discord ping fires.

> Notes:

---

## 9. Tournaments v2 (just shipped — Swiss + check-in)

- [ ] **Tournaments list** at `/tournaments` loads.
- [ ] **Create a test tournament** in admin (format = Swiss).
- [ ] **Sign up for it** with the test account.
- [ ] **Check-in window opens** at start - offset minutes; check-in button appears and works.
- [ ] **No-show DQ** — players who don't check in are removed when the 60s sweep runs.
- [ ] **Swiss round 1** generates pairings; standings page loads.
- [ ] **Set a winner**; standings recompute live (Buchholz tiebreak).
- [ ] **Advance round** button (superuser) generates round 2 without repeats.
- [ ] **Prize splits editor** lets you set per-place %; total is validated.
- [ ] **Payouts table** populates once tournament is complete.

> Notes:

---

## 10. Coaching marketplace (Task #410 — discovery upgrade)

- [ ] `/coaches` loads with sidebar filters: Position 1–5, Language, Price range, Min rating, Available-this-week toggle.
- [ ] **Sort dropdown** works for each option (relevance, price, rating, next available, most booked).
- [ ] **Premium coaches float to the top** of each sort.
- [ ] **Instant Booking ⚡ badge** shows on coaches whose next slot is within 48h.
- [ ] **Coach of the Month** spotlight tile renders above the grid.
- [ ] **Anonymised review snippets** (≤3) show on coach cards AND on coach detail page — only for coaches who turned on the consent toggle.
- [ ] **Filter combinations** behave sensibly (no empty-when-it-shouldn't-be).

> Notes:

---

## 11. Coaching booking & recurring plans (Task #413 — coaching v3)

### One-off booking
- [ ] **Book a 1:1 session** with a test coach → Stripe Checkout opens → test card `4242 4242 4242 4242` completes → booking confirmed page appears.
- [ ] **Confirmation DM** lands in Discord.
- [ ] **Session reminder DM** lands ~1 hour before the slot.
- [ ] **VOD review request** flow works the same way.
- [ ] **Group session join** debits a seat and confirms.

### Recurring plans
- [ ] **Coach edit → Recurring student plans editor** lets a coach create a draft plan.
- [ ] **Publish** creates a Stripe Product + Price (test mode).
- [ ] **Public coach profile** shows the plan card.
- [ ] **Subscribe** as a different test student via Stripe Checkout (subscription mode) — test card works.
- [ ] **Use the plan** to book a 1:1 / group / VOD with `use_plan:true` → quota debits, no Stripe charge, booking is $0.
- [ ] **`/me/coaching/plan-subscriptions`** lists the student's active subs.
- [ ] **Cancel subscription** from the student side; access continues until period end.

> Notes:

---

## 12. Coach earnings & Stripe Connect

- [ ] **Coach earnings page** loads, shows month-to-date totals.
- [ ] **Three plan-MRR tiles** render: MRR cents, active subscribers, retained this month.
- [ ] **Refund a test booking** from admin; earnings page reflects the refund (next task #421 will tighten this further).

> Notes:

---

## 13. Pro subscription / Stripe billing

- [ ] **Pro upgrade page** opens.
- [ ] **Subscribe with test card** completes Checkout.
- [ ] **Pro-only features unlock** immediately (Pro frame, ad-free, whatever the current Pro bundle includes).
- [ ] **Manage billing** opens Stripe Customer Portal.
- [ ] **Cancel subscription** — Pro features remain until period end.

> Notes:

---

## 14. Coin economy & frame shop

- [ ] **Coin balance** shows on profile.
- [ ] **Buy coins** via Stripe Checkout (test mode) credits the right amount.
- [ ] **Frame shop** loads, each frame shows price + ownership state.
- [ ] **Buy a frame with coins** debits coins and applies the frame.
- [ ] **Gift a frame** to another user flow completes end-to-end.

> Notes:

---

## 15. Notifications

### Web (Settings → Notifications)
- [ ] `/me/notifications` page loads.
- [ ] Each category toggle saves and persists on reload.
- [ ] **Browser web-push** subscribe flow asks for permission and registers the service worker.
- [ ] **Test push** delivers a notification.

### Discord DMs
For each, toggle ON in `/me/notifications` then trigger the event:
- [ ] `post_match_dm` — fires after a recorded match (test by playing or recording one).
- [ ] `match_ready` — DM when a lobby reaches 10 and is ready to accept.
- [ ] `mvp_vote` — DM prompt after a match.
- [ ] `attitude_vote` — DM prompt after a match.
- [ ] `hot_streak` — fire only after 5 / 10 win streak.
- [ ] `schedule_reminder` — T-24h and T-1h DMs for scheduled games.
- [ ] `weekly_recap` — Sunday-night digest lands.
- [ ] `coaching_booking_confirmed` — DM on Stripe payment.
- [ ] `coaching_session_reminder` — DM ~1h before session.
- [ ] `coaching_review_request` — DM after session ends.

> Notes:

---

## 16. Discord bot commands

In the bot's channel(s), try:
- [ ] `!stats` (or your prefixed equivalent) — returns your stats card.
- [ ] `!last` — shows last match.
- [ ] `!season` — shows current season standings.
- [ ] `!leaderboard` — top 10.
- [ ] **Owner-only commands** (test as owner only): `!perf-backfill 10`, `!backfill-pick-source` (gated on `OWNER_DISCORD_ID`).
- [ ] **Patch broadcast** — bot announces in the configured patch channel when a new patch note ships.

> Notes:

---

## 17. Admin panel (superuser only)

- [ ] **Login** with superuser password prompts and grants access.
- [ ] **Match list** loads, can edit / replay a match.
- [ ] **Replay manager** — "⚔️ Backfill fights" button runs and shows polling status (done/total · failed · detected · remaining).
- [ ] **Season lifecycle panel** — Edit end conditions, "Close Season" (manual rollover), "↩️ Undo Rollover" on archived seasons.
- [ ] **Coaching admin** — "🧪 Test: Promote to Coach" works (synthetic coach).
- [ ] **Backup DB** — `📸 Backup` button creates a snapshot; "List backups" shows it; "Restore" restores ratings tables.
- [ ] **Feature flags** — toggle a flag and see the front-end react.
- [ ] **Tournament admin** — create / edit / advance Swiss round / finalize payouts.

> Notes:

---

## 18. Public API & developer portal (Task #415 — just shipped)

- [ ] `/developers` portal loads with the endpoint list.
- [ ] **Create a test API key** in `/me/settings` (or wherever the keys live) with scope `read:matches`.
- [ ] **Paste key into the portal's "Try it" runner** → call `/v1/matches` → see status, latency, rate headers, body.
- [ ] **Wrong-scope call** is rejected (e.g. use `read:matches` key on `/v1/teams` → 403).
- [ ] **Rate-limit headers** present on every response.
- [ ] **Register a webhook endpoint** (use webhook.site) for `match.finalized`; trigger a match record; payload arrives with `version: 1` + full per-player stats.

> Notes:

---

## 19. Mobile companion v2 (Task #414 — write actions)

On the Expo app (logged in as the same test account):
- [ ] **Push notification → tap** deep-links into the matching action screen.
- [ ] **Inhouse ready-check accept / decline** completes and reflects on the web UI.
- [ ] **MVP vote** screen submits.
- [ ] **Scrim respond** screen works.
- [ ] **Roster transfer respond** works.
- [ ] **Book coach** screen completes booking (or kicks to Stripe Checkout in WebView).
- [ ] **VOD review request** submits.
- [ ] **Booking reminder ack** marks the booking as acknowledged.
- [ ] **401 reauth modal** — sign out on the web, trigger an action on mobile; reauth modal appears and recovers cleanly.

> Notes:

---

## 20. Patch notes feed

- [ ] `/patch-notes` page loads, latest entry at top.
- [ ] **No duplicate-version warnings** in the bot startup logs (Task #418 cleanup).
- [ ] **Pagination / scroll** works to the bottom.

> Notes:

---

## 21. Observability sanity (Task #417 — just shipped)

These are quick "is the wiring intact" checks; deep dashboard work is separate.
- [ ] **`/admin/ops` dashboard** (Task #406) shows live numbers: parser queue depth, webhook lag, recent error counts.
- [ ] **No OTel boot errors** in the bot startup logs (look for `[otel]` lines).
- [ ] **Grafana Cloud dashboard** (if you've imported `ops/grafana/dashboard.json`) shows traffic on the 10 panels.

> Notes:

---

## 22. Community edition (paywall-free)

Spot-check on `dota.stats.corvidaeinc.com`:
- [ ] Public stats, leaderboard, profiles all load.
- [ ] **No Pro / coaching / tournament / Stripe touchpoints** visible anywhere.
- [ ] Discord bot for community edition (`inhouse-bot` PM2 process) responds to `!stats`, `!last`, `!leaderboard`.

> Notes:

---

## 23. Cross-cutting

- [ ] **Browser console** has no red errors after clicking through the major pages.
- [ ] **404 page** renders cleanly for `/this-does-not-exist`.
- [ ] **Keyboard-only navigation** — Tab through the home page; every interactive thing receives a visible focus ring.
- [ ] **Screen reader** (VoiceOver / NVDA) reads labels on icon-only buttons (Watch live, Share clip, etc.).
- [ ] **Mobile-width spot-check** — re-open at ~390px on the most-used pages; nothing overflows.

> Notes:

---

## Overall release notes

What went well:
>

What broke / felt off:
>

What we should tighten next:
>
