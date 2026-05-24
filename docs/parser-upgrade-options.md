# Replay parser — major data + features upgrade options

Survey + ranked shortlist for Task #363. The OpenDota Java fork in
`odota-parser/` is a Clarity-based S2 demo reader. Today it emits a
combat-log stream, per-minute interval samples (gold/xp/lh/dn/pos), ward
placements, draft picks/bans, team abilities (glyph/scan/smoke), chat
events, and an epilogue blob. Downstream the Node consumer
(`src/replay/replayParser.js`) walks those events and produces
`gameTimeline`, `laneOutcomes`, `teamAbilities`, ward maps, kill feed,
power spikes, NW swing, etc. — most of which already render on
`/match/:id`.

What follows are 12 candidate upgrades scored by:

- **Effort:** S (≤1 day, no Java/Maven), M (1–3 days, Java edits + jar
  rebuild + DB column + UI), L (3–7 days, new tables, backfill story,
  cross-page UI work).
- **Status:** what already exists in the data stream, what's missing.
- **Data unlocked / product feature.**

Picks for this sprint are at the bottom.

| # | Candidate                                | Effort | Status today                                                                                                                                  |
|---|------------------------------------------|--------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | Chat + chat wheel log                    | **S**  | Java already emits `chat` / `chatwheel` entries with `slot` + `key`. Node consumer discards them. No DB column.                              |
| 2 | Per-tick player position trail (1s)      | **M**  | Java emits `interval` every second incl. `x,y`. Node consumer samples every 10s into `allPositions` for the minimap viewer.                  |
| 3 | Teamfight cards on `/match/:id`          | **M**  | Java `CreateParsedDataBlob.processTeamfights` already produces `Teamfight` blocks (start/end/deaths/players w/ damage/healing/gold/xp delta). |
| 4 | Buyback economy                          | **S**  | `Entry.buyback_log` already populated server-side (Entry.type=`buyback_log`). Not surfaced as standalone panel.                               |
| 5 | Rune control                             | **S**  | `runes_log` already in Entry / PlayerData; partially used.                                                                                    |
| 6 | Damage attribution graph (who→whom/s)    | **L**  | Combat log has source/target every event; nothing aggregates per-second damage between players.                                               |
| 7 | Itemisation timeline + sells             | **M**  | Purchases captured; **sells/swaps not emitted** (no `OnEntityPropertyChanged` for slot 0–5 + cost rebate).                                    |
| 8 | Hero ability + talent build              | **S**  | `ability_levels` already in metadata; talents distinguishable by ability name prefix.                                                         |
| 9 | Smoke / TP-scroll usage timeline         | **S**  | `teamAbilitiesRaw.{team}_smoke` exists; TP scrolls already counted but not timestamped.                                                       |
| 10| Vision uptime graph                      | **M**  | Ward placements/destroys captured per slot; **timeline integration** (uptime % vs map quadrant) not computed.                                 |
| 11| Ward kill attribution                    | **S**  | `obs_left`/`sen_left` events captured; killer slot not always populated for ward kills.                                                       |
| 12| Lane-outcome XP/gold delta @ 10          | done   | Already shipped in `laneOutcomes`.                                                                                                            |

## Per-candidate spec

### 1. Chat + chat wheel log — **S** (~½ day, no Java change)
- **Input:** existing `chat` / `chatwheel` events from `Parse.onAllChatMessage`, `onChatWheel`, `onAllChatS1`, `onAllChatS2`. Each carries `time`, `slot`, `key` (message text or chatwheel id), `unit` (S1 prefix).
- **Output:** new `matches.chat_log JSONB` column. Shape: `[ { t, slot, type: 'chat'|'chatwheel', text } ]` ordered by `t`.
- **Consumer:** `replayParser._aggregateStats` filters chat events out of the stream into a separate array; `recordMatch` persists; `MatchDetail.jsx` renders a collapsed "Chat log" panel.
- **Feature unlock:** "Best chat moments" recap; toxicity flagging input; the most-requested community feature for friend-lobby replays.
- **Risk:** chat contains user-generated text. Render with React (auto-escaped); cap message length on insert (4 KB / line); skip empty `key`s. No PII concern beyond what was already in-game.

### 2. Per-tick player position trail — **M**
- **Input:** raise position sampling from 10s → 1s in `replayParser._aggregateStats` (no Java change — `interval` events already arrive every second).
- **Output:** ~13 KB/player/match (60 samples/min × 50 min × 10 players × 4 bytes). Persist on the existing `player_stats.position_trail JSONB` column (new).
- **Consumer:** existing minimap viewer (`MatchReplayViewer`) already paints a position trail — bump interpolation from 10s to 1s; add a "heatmap mode" toggle that bins samples into a 32×32 grid and renders an SVG overlay.
- **Feature unlock:** Lane-presence %, gank route maps, smoke detection from path discontinuity, per-position heatmaps on player profiles.
- **Risk:** match payload size grows ~130 KB. Trim radius around the edges of the map (samples are bounded 64–192) and base64-pack as Int16. Add a `position_trail_v1` feature flag; old matches without it fall back to the 10s viewer.

### 3. Teamfight cards on `/match/:id` — **M**
- **Input:** `CreateParsedDataBlob.processTeamfights` already produces the structured data (start/end/deaths/players with damage, healing, gold/xp delta, item uses). Currently only reachable via the `?blob` query parameter; the streaming Node consumer doesn't request it.
- **Output:** either (a) call `processTeamfights` from `Parse.java`'s streaming output as a synthetic `teamfight` event, or (b) reconstruct from existing combat-log on the Node side — Java route is cleaner and reuses tested logic.
- **Consumer:** new `matches.teamfights JSONB` column; `<TeamfightsPanel>` on MatchDetail renders one card per fight: start–end time, participants with K/D and gold/xp swing, MVP per side (highest damage − deaths × 500).
- **Feature unlock:** Fight-quality recap; "fight of the night" auto-pick; PERF input ("teamfight win rate" per player).
- **Risk:** Java change → Maven rebuild → jar commit. Gate behind `teamfight_cards_v1` flag; if rebuild fails, fall back to current behaviour.

### 4. Buyback economy — **S**
- **Input:** `Entry.buyback_log` already populated; each entry has `time`, `slot`. Add `cost = max(100, hero_level² × 1.3 + networth/13)` Dota-formula compute on the Node side.
- **Output:** `player_stats.buybacks JSONB` (count + list of timestamps + cost + outcome). Outcome derived from whether the team won a fight within 60s.
- **Consumer:** add "Buybacks" row to scoreboard; new `<BuybackTimingPanel>` correlates with NW swing.
- **Feature unlock:** "Greedy buyback" (cost > 25% NW with no fight win) / "Saved the throne" (buyback within 30s of ancient at <500 HP) tags. Coaching content.

### 5. Rune control — **S**
- `runes_log` already emitted. Aggregate into per-player rune counts split by type (bounty/water/wisdom/power) and persist on `player_stats.rune_breakdown JSONB`. Feeds support-impact PERF.

### 6. Damage attribution graph (who→whom per second) — **L**
- Combat log has source/target every event. Aggregate into `damage_matrix[srcSlot][dstSlot][bucket60s] = total`. ~10 KB/match. Powers a "real teamfight participation %" and a "killsteal index" (damage done vs. credited kills). Out of scope for this sprint — propose as follow-up.

### 7. Itemisation timeline + sells — **M**
- Java emits purchases; sells are currently invisible (no entity-property handler for inventory slot deltas). Adding a `OnUpdate` watcher for `m_hItems[0..5]` ehandle changes + `m_iCurrentXP` correlation gives us sell events with cost rebate (50% within 10s of purchase, else 0%). Persist as `purchase_log` (already exists) + new `sell_log`. Powers build comparison vs. hero meta + BKB-timing PERF.

### 8. Hero ability + talent build — **S**
- `ability_levels` already in `meta.ability_levels`. Surface as a column on the scoreboard and on the hero meta page. Distinguish talents from regular abilities by name prefix (`special_bonus_*`).

### 9. Smoke / TP-scroll usage timeline — **S**
- `teamAbilitiesRaw.{team}_smoke` already captured. Add TP scroll usage by hooking the `dota_tp_scroll` cooldown event. Surface as overlay on the minimap viewer.

### 10. Vision uptime graph — **M**
- Combine `ward_placements` + `ward_deaths` already in `player_stats.ward_placements` to compute, per minute, vision-tile-seconds in each map quadrant. Render an area chart on `/match/:id`.

### 11. Ward kill attribution — **S**
- `obs_left`/`sen_left` already fire; `killerSlot` is sometimes `-1` because the parser only tracks the entity that did the final hit, not the player. Wire through `attackername` from the combat log instead of relying on `tracked_death`. Powers an "anti-vision" support score.

### 12. Lane outcome — **done**
- Shipped in `laneOutcomes` (Task #157 round-3).

## Backfill cost (proposal — DO NOT execute in this task)
- Full edition currently has **~17 000 parsed matches** (Season 1 → Season 10 to date), avg replay size ~110 MB, avg parse time ~95s on the production Java parser.
- Re-parsing everything cold: 17 000 × 95 s ÷ 1 parallel parser = **~450 hours**. With the parser running on the existing prod box (1 process) this would block live recordings. Two-parser fan-out (a second JVM on port 5601) brings this to ~9 days continuous wall time.
- **Recommendation:** ship the chat-log column + position-trail flag dark on new matches only. Stand up a background backfill cron that processes ≤200 matches/night during off-hours (4 AM AEST) and propagates new columns. ETA to full backfill: ~12 weeks. File as **Task #366 follow-up**.

## Picks for this sprint

1. **Candidate #1 — Chat log** (this PR). Smallest path to end-to-end demonstration: no Java change, no Maven dependency, no backfill blocker. Ships behind `chat_log_visible` feature flag (`preview` by default → admin/superuser see the panel; flip to `on` after a week of monitoring chat-rendering edge cases).

2. **Candidate #2 — Per-tick position trail / heatmap** (deferred to follow-up Task #366). Requires the Java jar untouched (no Maven on this env) but does need the matchStats payload size verification + viewer UI work. Sized as a standalone task so it gets the attention of a real Maven build environment + a UI polish pass.

Patch notes published as v7.57.
