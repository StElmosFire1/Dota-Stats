# Clone evidence — summary (2026-05-30)

## Headline conclusion

`https://dota-pro-tracker.preview.emergentagent.com` ("One Tooth Gaming In-House League") is **not a verbatim visual clone** of `oceinhouse.gg` — it has its own brand name, its own tooth logo, and its own (much more elaborate, likely AI-generated) marketing copy, none of which is lifted from us. What it *is* is a **rebranded rebuild that used OCE Inhouse as its template and, most damningly, ingested our actual community data**: its rosters, "Top Players," award boards, and match history are populated with our real members' handles (Dorit Duckling, Lemon Burtle, BAD1, Frangie, Viking, Monstah, WaterBlitz, and ~15 more) and real match records — six of those handles match our own database verbatim. The strong, defensible claim is **misappropriation of our proprietary roster/match data and a feature-for-feature rebuild of our product**; the weak/unfounded claims (which the owner should *not* make) are logo theft, brand-name theft, or copied marketing text — those simply aren't present.

## Strongest evidence, ordered by severity

1. **`clear-copy` — Our real player roster + match history was scraped into the clone.** The clone's player/award/beef sections use our actual community handles, and its "Recent Matches" show real match records with full 10-hero drafts. Handles `BAD1`, `Lemon Burtle`, `MajinDabura`, `Monstah`, `Viking`, `WaterBlitz` are confirmed present verbatim in our own database; `Dorit Duckling` and `Frangie` also appear on our live home page. This is proprietary operational data, not sample data. *(Protectable interest: misappropriation of our dataset / scraping `oceinhouse.gg`. Individual handles aren't themselves copyrightable, but wholesale reproduction of our specific roster + match set is the headline proof of copying.)*

2. **`derivative` — Feature-for-feature product rebuild.** Same concept (Aussie/OCE nightly in-house Dota league, 7:30 PM AEST, MMR-balanced 5v5, captain draft, Discord voice, replay auto-parse with per-player percentile stats, seasonal prize pool, smurf detection). Re-described in new words, not copied text. *(Ideas/features are generally not protectable — frame as "they rebuilt our product," not "they copied our writing.")*

3. **`derivative` — Information architecture modelled on ours.** Near-identical page set, including the distinctive exact-match nav labels **"Synergy," "Upload Replay," "Join the League,"** plus feature parity on **Compare** and a **Draft (AI) assistant**. Supports the "pointed an AI builder at our site" story; weak on its own.

4. **`derivative` — Visual language.** Same dark-navy + gold/amber esports theme and left-rail-nav shell as our "Court & Pitch" palette. A common aesthetic, so corroborating rather than conclusive (clone CSS was not byte-compared).

## What is NOT copied (do not overstate)

- **Brand name** — "One Tooth Gaming" ≠ "OCE Inhouse". Different.
- **Logo / favicon** — tooth glyph, not our `oa-logo.png`. No shared asset.
- **Marketing/body copy** — the clone's headlines and sections ("Don't queue solo. Come home.", "Active Beefs", "Stat Goblin", "Smurf Detection", etc.) return **zero** matches in our source tree. Original to the clone.

## Capture caveats

Only the clone **home page** could be captured (its other routes sit behind Emergent's "Wake up servers" sleep gate, which needs an interactive click). `oceinhouse.gg` went into **private-preview password lockdown** during capture, so our subpages weren't accessed (per scope) — but our home text was captured just beforehand and the rest of our copy/IA is verifiable from this repo's source. Full text of the clone home is preserved in `clone-home-fulltext.md`. See `findings.md` for the detailed per-page breakdown and the evidence inventory.
