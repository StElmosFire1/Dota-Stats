---
name: Captain's Mode draft balance
description: Counter-pick weight in the CM game's pick scoring must stay modest or the responding side wins nearly every AI-vs-AI draft.
---

The Captain's Mode game (`/captain-mode`, logic in `web/src/lib/captainMode.js`) scores picks as base winrate + counter + synergy. Because the second-picking side always gets to respond, a heavy counter weight makes the responder systematically out-draft the first-pick side.

**Why:** At counter weight ×2 (and ×0.8 in draftFit) AI-vs-AI playouts averaged ~30 vs ~58 draft fit — the player (first pick, Radiant) would almost always start ~11% win odds. Lowering to ×1.2 / ×0.5 restored parity (~44 vs ~46).

**How to apply:** Any tuning of pickValue/counterScore/draftFit should be re-validated with a 20-run AI-vs-AI playout (see the inline comment in pickValue) checking the average draft-fit gap stays small. Also: the hero dataset endpoint `/api/captain-mode/hero-meta` is server-cached 6h and serves stale on OpenDota failure — don't add per-request OpenDota calls in this path.
