---
name: Dota2 GC reconnect & listener accumulation
description: Why the "Dota Bot is now playing Dota 2" popup recurs, and the dota2-user library quirk behind it.
---

# Dota2 GC reconnect re-opening Dota

The recurring "Dota Bot is now playing Dota 2" popup has TWO independent causes; both
must be fixed or the popup persists.

1. **Watchdog false kicks** (fixed earlier): an idle-but-healthy GC was judged dead and
   recovery-kicked. Fix = await a real health ping, only kick after N consecutive ping
   failures across the silence window — never on mere idleness.

2. **Listener accumulation on Steam re-login** (the dominant remaining cause): the
   `loggedOn` handler used to build a NEW `Dota2GCClient` (new `dota2-user`) on every
   Steam re-login.

**Why this is a trap:** `dota2-user`'s `Dota2User` registers ALL its listeners
(`receivedFromGC`, `appLaunched`, `appQuit`, `disconnected`, `error`) onto the
long-lived `SteamUser` socket in its constructor, with no de-dup. Steam auto-relogs after
any socket drop, so each reconnect that builds a fresh client leaves the OLD client's
listeners attached. A single `gamesPlayed([570])` hello then fans out across every stale
client, each re-announcing Dota — multiplying the popup.

**How to apply / the fix shape (src/steam/steamClient.js):**
- Create the GC client EXACTLY ONCE (`if (!this.gcClient)`) and reuse it across re-logins.
  Bind the `ready`/liveness listeners once.
- Gate the `gamesPlayed` re-hello: on a Steam reconnect, skip it when `isGCReady` is still
  true (transient blip that didn't drop GC); only re-launch when GC was genuinely lost.
- Debounce rapid `loggedOn` storms (≈10s) into a single recovery hello.

**Key steam-user fact that makes the re-hello necessary on a real drop:** on disconnect,
steam-user calls `_initProperties()` which resets `_playingAppIds = []`, so after a genuine
reconnect Steam no longer thinks we're playing Dota — the manual `gamesPlayed([570])` is
required to bring the GC back. So you can't just stop sending it; you gate WHEN it's sent.

**Tests:** `tests/steamReconnect.test.js` stubs Dota2GCClient + steam-user via
require.cache/Module._load and calls `_handleLoggedOn()` directly (no real Steam). Asserts
single client, gated re-hello, debounce.
