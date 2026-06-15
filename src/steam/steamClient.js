const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const { config } = require('../config');
const { Dota2GCClient, DOTA2_APPID } = require('./dota2GC');
const EventEmitter = require('events');

const FRIEND_POLL_INTERVAL_MS = 60 * 1000;

// Task #313 — GC reliability watchdog tunables.
//
// The Dota 2 GC silently drops connections under load (and after Valve-side
// maintenance) without a corresponding `disconnected` event on the inner
// SteamUser socket. When that happens, the bot looks healthy (Steam socket
// alive, `isLoggedIn=true`) but every `gcClient.send*` quietly times out
// because the GC session is dead. The watchdog notices prolonged GC
// silence and triggers a re-hello.
const GC_WATCHDOG_INTERVAL_MS = 60 * 1000;
const GC_SILENCE_THRESHOLD_MS = 5 * 60 * 1000;

// Task #834 — the kick is a genuine last resort. We only replay the
// `gamesPlayed` re-hello (which is what visibly re-opens Dota and fires the
// "Dota Bot is now playing Dota 2" popup) once the keep-alive health ping has
// demonstrably failed to get a response this many times in a row. Mere
// idleness — a healthy-but-quiet GC — can never trigger it, because a healthy
// GC answers the probe and resets its own clock long before this is reached.
const GC_MAX_PING_FAILURES = 2;

// Task #840 — a Steam-level reconnect re-fires `loggedOn`, which is the OTHER
// path (besides the watchdog kick) that re-sends the `gamesPlayed([570])` GC
// hello and visibly re-opens Dota. We coalesce rapid `loggedOn` storms so a
// flapping Steam socket can't translate into a burst of Dota relaunches: once
// a hello has been sent, another within this window is suppressed.
const GAMES_PLAYED_HELLO_DEBOUNCE_MS = 10 * 1000;

// Events the Dota2GCClient genuinely emits whenever the Game Coordinator is
// alive and talking to us. Observing any of these resets the silence clock.
// (The watchdog originally listened for `message`/`receive`/`connectionStatus`,
// which the GC client never emits — so the clock was never bumped and a healthy
// idle bot got kicked on a permanent ~5-minute loop. Task #830.)
const GC_LIVENESS_EVENTS = [
  'ready',
  'lobbyResponse',
  'lobbyUpdate',
  'matchDetailsResponse',
  'lobbyJoinResponse',
  'lobbyChatMessage',
  'serverAssigned',
  'lobbyInviteReceived',
  'partyInviteReceived',
  'lobbyCreatedViaCache',
  'lobbyDestroyed',
];

class SteamDotaClient extends EventEmitter {
  constructor() {
    super();
    this.steamClient = new SteamUser();
    this.gcClient = null;
    this.isLoggedIn = false;
    this.isGCReady = false;
    this._friendMonitorTimer = null;
    this._lastSeenLobbyIds = new Map();
    this._friendMonitorEnabled = false;
    this._setupListeners();
  }

  _setupListeners() {
    // Task #834 — the raw GC-message liveness bump is registered ONCE here,
    // on the long-lived inner SteamUser socket, rather than inside the
    // `loggedOn` handler. `loggedOn` can fire repeatedly (re-login), and the
    // old code re-added this listener every time, accumulating duplicates and
    // risking a MaxListeners warning. The SteamUser instance survives logins,
    // so a single registration always sees current GC traffic.
    try {
      this.steamClient.on('receivedFromGC', (appid) => {
        if (appid === DOTA2_APPID) this._lastGcActivityAt = Date.now();
      });
    } catch (_) { /* optional; safe to skip */ }

    this.steamClient.on('loggedOn', () => this._handleLoggedOn());

    this.steamClient.on('steamGuard', (domain, callback, lastCodeWrong) => {
      if (config.steam.sharedSecret) {
        const code = SteamTotp.generateAuthCode(config.steam.sharedSecret);
        console.log('[Steam] Providing Steam Guard code from shared secret...');
        callback(code);
      } else {
        console.error('[Steam] Steam Guard code requested but no shared secret configured.');
        console.error('[Steam] Either disable Steam Guard on this account or set STEAM_SHARED_SECRET.');
        callback('');
      }
    });

    this.steamClient.on('friendRelationship', (steamID, relationship) => {
      if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
        this.steamClient.addFriend(steamID, (err) => {
          if (err) {
            console.warn(`[Steam] Failed to accept friend request from ${steamID.getSteamID64()}: ${err.message}`);
          } else {
            console.log(`[Steam] Accepted friend request from ${steamID.getSteamID64()}`);
          }
        });
      }
    });

    this.steamClient.on('user', (sid, persona) => {
      // Task #205 — feed every Dota 2 rich-presence update we observe into
      // the live presence service, even when the friend lobby monitor is off.
      // The handler is fully wrapped in try/catch so it can never break the
      // existing friend-lobby auto-detect path below.
      try {
        if (persona && sid?.getSteamID64) {
          const sid64 = sid.getSteamID64();
          const gameApp = persona.gameid || persona.game_played_app_id;
          if (gameApp && gameApp.toString() === '570') {
            const _presence = require('../services/presenceService');
            const parsed = _presence.parseDotaRichPresence(persona.rich_presence) || {};
            if (parsed.state) {
              _presence.setSteamPresence(sid64, parsed);
            } else {
              // In Dota client but no parseable state — treat as in_lobby so
              // the chip at least shows "Online · Dota 2".
              _presence.setSteamPresence(sid64, { state: 'in_lobby' });
            }
          } else {
            const _presence = require('../services/presenceService');
            _presence.clearSteamPresence(sid64);
          }
        }
      } catch (_) { /* swallow */ }

      if (!this._friendMonitorEnabled) return;
      if (!persona || !persona.rich_presence) return;

      const steamId64 = sid.getSteamID64();
      const gameAppId = persona.gameid || persona.game_played_app_id;
      if (gameAppId && gameAppId.toString() === '570') {
        const rp = persona.rich_presence;
        const lobbyGroup = Array.isArray(rp)
          ? rp.find((x) => x.key === 'steam_player_group')
          : null;
        const lobbyId = lobbyGroup ? lobbyGroup.value : null;

        if (lobbyId && lobbyId !== '0') {
          const lastSeen = this._lastSeenLobbyIds.get(steamId64);
          if (lastSeen !== lobbyId) {
            this._lastSeenLobbyIds.set(steamId64, lobbyId);
            console.log(`[Steam] Friend ${persona.player_name || steamId64} detected in Dota 2 lobby: ${lobbyId}`);
            try { require('../web/opsState').reportSteam({ event: `friendInLobby:${lobbyId}` }); } catch (_) {}
            this.emit('friendInLobby', {
              steamId64,
              playerName: persona.player_name || steamId64,
              lobbyId,
            });
          }
        }
      } else {
        this._lastSeenLobbyIds.delete(steamId64);
      }
    });

    this.steamClient.on('error', (err) => {
      this.isLoggedIn = false;
      this.isGCReady = false;
      if (err.eresult === 34 || err.message === 'LogonSessionReplaced') {
        console.warn('[Steam] Session replaced by another login — Steam disconnected. Bot continues running without Steam.');
        try { require('../web/opsState').reportSteam({ connected: false, disconnectReason: 'LogonSessionReplaced' }); } catch (_) {}
        this.emit('steamDisconnected', 'LogonSessionReplaced');
      } else {
        console.error('[Steam] Login error:', err.message);
        try { require('../web/opsState').reportSteam({ connected: false, disconnectReason: err.message }); } catch (_) {}
        this.emit('steamDisconnected', err.message);
      }
    });

    this.steamClient.on('disconnected', (eresult, msg) => {
      console.warn(`[Steam] Disconnected: ${msg} (${eresult})`);
      try { require('../web/opsState').reportSteam({ connected: false, disconnectReason: `${msg} (${eresult})` }); } catch (_) {}
      this.isLoggedIn = false;
      this.isGCReady = false;
    });
  }

  // Task #840 — handle `loggedOn`. This fires on the very first login AND on
  // every Steam-level auto-reconnect (`steam-user` re-logs after any socket
  // drop). Two things matter for keeping Dota from re-opening every few
  // minutes:
  //
  //  1. The GC client is created EXACTLY ONCE and reused. The dota2-user
  //     instance hooks all its listeners (`receivedFromGC`, `appLaunched`,
  //     `appQuit`, `disconnected`, `error`) onto the long-lived SteamUser
  //     socket in its constructor. The old code built a fresh Dota2GCClient on
  //     every `loggedOn`, so each reconnect left another full set of those
  //     listeners attached — every subsequent `gamesPlayed` then fired N stale
  //     clients, each re-helloing the GC. Reusing one client eliminates that
  //     accumulation entirely.
  //  2. The `gamesPlayed([570])` re-hello (what visibly re-opens Dota) is
  //     gated — see `_sendGamesPlayedHello`.
  _handleLoggedOn() {
    console.log('[Steam] Logged in successfully.');
    try { require('../web/opsState').reportSteam({ connected: true, event: 'loggedOn' }); } catch (_) {}
    const isReLogin = !!this._everLoggedOn;
    this.isLoggedIn = true;
    this._everLoggedOn = true;
    try { this.steamClient.setPersona(SteamUser.EPersonaState.Online, 'Dota Bot'); } catch (_) {}

    if (!this.gcClient) {
      this.gcClient = new Dota2GCClient(this.steamClient);

      this.gcClient.on('ready', () => {
        console.log('[Steam] Dota 2 GC is ready!');
        this.isGCReady = true;
        this._lastGcActivityAt = Date.now();
        // Fresh GC session — clear any stale health-ping failure state left
        // over from a previous (now-recovered) silence window so the new
        // session starts from a clean slate.
        this._gcConsecutivePingFailures = 0;
        this._gcPingInFlight = false;
        this._lastHealthPingOutcome = null;
        this.emit('gcReady');
        this._startGcWatchdog();
      });

      this.gcClient.on('disconnectedFromGC', () => { this.isGCReady = false; });

      // Any GC traffic resets the silence clock. Bump on the high-level events
      // the GC client actually emits (see GC_LIVENESS_EVENTS). Bound once to the
      // single, reused gcClient. The raw `receivedFromGC` bump lives once on the
      // SteamUser socket (see _setupListeners).
      const bump = () => { this._lastGcActivityAt = Date.now(); };
      for (const ev of GC_LIVENESS_EVENTS) {
        try { this.gcClient.on(ev, bump); } catch (_) { /* optional; safe to skip */ }
      }
    }

    this._sendGamesPlayedHello(isReLogin);
  }

  // Task #840 — send the `gamesPlayed([570])` GC hello that launches Dota, but
  // only when it's actually warranted, and always with a logged reason.
  //
  //  • First login: always launch Dota.
  //  • Steam reconnect with the GC session still established: a transient blip
  //    that didn't actually drop the GC — do NOT re-open Dota.
  //  • Steam reconnect with the GC gone (the normal case — a real socket drop
  //    resets `_playingAppIds` and tears down the GC session): re-launch Dota
  //    so the GC reconnects.
  //  • Either way, coalesce rapid `loggedOn` storms via a short debounce so a
  //    flapping socket can't fire a burst of relaunches.
  _sendGamesPlayedHello(isReLogin) {
    if (isReLogin && this.isGCReady) {
      console.log('[Steam] Reconnected to Steam — Dota GC session still established; not re-opening Dota.');
      try { require('../web/opsState').reportSteam({ event: 'reconnect:gc-alive' }); } catch (_) {}
      return;
    }

    const nowMs = Date.now();
    if (this._lastGamesPlayedHelloAt != null && (nowMs - this._lastGamesPlayedHelloAt) < GAMES_PLAYED_HELLO_DEBOUNCE_MS) {
      const agoMs = nowMs - this._lastGamesPlayedHelloAt;
      console.log(`[Steam] Suppressing Dota re-open — a gamesPlayed hello was already sent ${(agoMs / 1000).toFixed(1)}s ago (debounce).`);
      try { require('../web/opsState').reportSteam({ event: 'reconnect:hello-debounced' }); } catch (_) {}
      return;
    }

    const reason = isReLogin ? 'Steam reconnect (GC session was lost)' : 'initial login';
    console.log(`[Steam] Opening Dota 2 — sending gamesPlayed([${DOTA2_APPID}]) hello. Reason: ${reason}.`);
    try { require('../web/opsState').reportSteam({ event: isReLogin ? 'gamesPlayedHello:reconnect' : 'gamesPlayedHello:initial' }); } catch (_) {}
    this._lastGamesPlayedHelloAt = nowMs;
    try {
      this.steamClient.gamesPlayed([DOTA2_APPID]);
    } catch (err) {
      console.error('[Steam] gamesPlayed hello failed:', err.message);
    }
  }

  startFriendMonitor() {
    if (this._friendMonitorEnabled) return;
    this._friendMonitorEnabled = true;
    console.log('[Steam] Friend lobby monitor enabled - watching for friends in Dota 2 lobbies.');

    this._friendMonitorTimer = setInterval(() => {
      this._pollFriendsRichPresence();
    }, FRIEND_POLL_INTERVAL_MS);

    setTimeout(() => this._pollFriendsRichPresence(), 15000);
  }

  _pollFriendsRichPresence() {
    if (!this.isLoggedIn || !this.steamClient.myFriends) return;

    const friendIds = Object.keys(this.steamClient.myFriends).filter(
      (id) => this.steamClient.myFriends[id] === SteamUser.EFriendRelationship.Friend
    );

    if (friendIds.length === 0) return;

    for (const friendId of friendIds) {
      const user = this.steamClient.users ? this.steamClient.users[friendId] : null;
      if (!user) continue;

      const gameAppId = user.gameid || user.game_played_app_id;
      if (!gameAppId || gameAppId.toString() !== '570') continue;

      if (user.rich_presence) {
        const rp = user.rich_presence;
        const lobbyGroup = Array.isArray(rp)
          ? rp.find((x) => x.key === 'steam_player_group')
          : null;
        const lobbyId = lobbyGroup ? lobbyGroup.value : null;

        if (lobbyId && lobbyId !== '0') {
          const lastSeen = this._lastSeenLobbyIds.get(friendId);
          if (lastSeen !== lobbyId) {
            this._lastSeenLobbyIds.set(friendId, lobbyId);
            console.log(`[Steam] Friend ${user.player_name || friendId} detected in Dota 2 lobby: ${lobbyId} (via poll)`);
            try { require('../web/opsState').reportSteam({ event: `friendInLobby:${lobbyId}` }); } catch (_) {}
            this.emit('friendInLobby', {
              steamId64: friendId,
              playerName: user.player_name || friendId,
              lobbyId,
            });
          }
        }
      }
    }
  }

  stopFriendMonitor() {
    this._friendMonitorEnabled = false;
    if (this._friendMonitorTimer) {
      clearInterval(this._friendMonitorTimer);
      this._friendMonitorTimer = null;
    }
  }

  login() {
    return new Promise((resolve, reject) => {
      if (!config.steam.accountName || !config.steam.password) {
        return reject(new Error('Steam credentials not configured.'));
      }

      const loginOptions = {
        accountName: config.steam.accountName,
        password: config.steam.password,
      };

      const gcTimeout = setTimeout(() => {
        cleanup();
        console.warn('[Steam] GC connection timed out — Steam is logged in but Dota 2 GC did not connect. Lobby commands will report GC unavailable until it connects.');
        resolve();
      }, 45000);

      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        clearTimeout(gcTimeout);
        this.removeListener('gcReady', onReady);
        this.steamClient.removeListener('error', onError);
      };

      this.once('gcReady', onReady);
      this.steamClient.once('error', onError);

      console.log('[Steam] Logging in...');
      this.steamClient.logOn(loginOptions);
    });
  }

  /**
   * Add all known players as Steam friends. Skips anyone already on the friends list.
   * Sends requests slowly (1 per second) to avoid rate limits.
   */
  async addAllKnownFriends(accountIds) {
    if (!this.isLoggedIn || !this.steamClient) return;
    const friends = this.steamClient.myFriends || {};
    let added = 0;
    let skipped = 0;
    for (const accountId32 of accountIds) {
      try {
        const steam64 = (BigInt('76561197960265728') + BigInt(accountId32)).toString();
        const rel = friends[steam64];
        if (rel === 3 /* EFriendRelationship.Friend */) { skipped++; continue; }
        await new Promise((resolve) => {
          this.steamClient.addFriend(steam64, (err) => {
            if (err) console.warn(`[Steam] addFriend ${steam64} failed: ${err.message}`);
            else added++;
            resolve();
          });
        });
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[Steam] addAllKnownFriends error for ${accountId32}:`, err.message);
      }
    }
    console.log(`[Steam] addAllKnownFriends: ${added} requests sent, ${skipped} already friends`);
  }

  /**
   * Send a Steam friend message to a player by their 32-bit account ID.
   * The bot must be Steam friends with them for this to work.
   */
  sendSteamMessage(accountId32, message) {
    if (!this.isLoggedIn || !this.steamClient) {
      console.warn('[Steam] Cannot send message — not logged in');
      return false;
    }
    try {
      const steam64 = (BigInt('76561197960265728') + BigInt(accountId32)).toString();
      if (typeof this.steamClient.chat?.sendFriendMessage === 'function') {
        this.steamClient.chat.sendFriendMessage(steam64, message);
      } else {
        this.steamClient.chatMessage(steam64, message);
      }
      console.log(`[Steam] Sent message to account ${accountId32} (${steam64})`);
      return true;
    } catch (err) {
      console.error(`[Steam] Failed to send message to ${accountId32}:`, err.message);
      return false;
    }
  }

  // Task #313 — GC reliability watchdog. Pings GC every 60s; if we haven't
  // observed any GC activity in 5 minutes, kicks the GC session by replaying
  // `gamesPlayed([DOTA2_APPID])`, which causes the GC client to re-hello.
  // No-op if a watchdog is already running. Safe to call from tests with
  // injected timing knobs: pass `{ intervalMs, thresholdMs, now }` to
  // override the defaults (used by the unit test).
  _startGcWatchdog(opts = {}) {
    if (this._gcWatchdogTimer) return; // already running
    const intervalMs = opts.intervalMs || GC_WATCHDOG_INTERVAL_MS;
    const thresholdMs = opts.thresholdMs || GC_SILENCE_THRESHOLD_MS;
    // Probe a quiet GC well before the kick threshold so a healthy-but-idle
    // session gets a chance to respond (and reset the clock) on its own.
    const pingThresholdMs = opts.pingThresholdMs || Math.floor(thresholdMs / 2);
    const maxPingFailures = opts.maxPingFailures || GC_MAX_PING_FAILURES;
    const now = opts.now || (() => Date.now());
    if (this._lastGcActivityAt == null) this._lastGcActivityAt = now();
    this._gcWatchdogTimer = setInterval(() => {
      try {
        this._checkGcLiveness({ thresholdMs, pingThresholdMs, maxPingFailures, now });
      } catch (err) {
        console.warn('[Steam] GC watchdog tick failed:', err.message);
      }
    }, intervalMs);
    if (this._gcWatchdogTimer.unref) this._gcWatchdogTimer.unref();
  }

  // Send a lightweight GC request (a self profile-card lookup) and AWAIT its
  // result, which is the authoritative liveness signal: a live GC answers
  // within seconds (a non-null card), a dead one never does (resolves null on
  // an 8s internal timeout). Task #834 — we no longer rely solely on the
  // generic `receivedFromGC` listener firing for the response; the awaited
  // outcome itself bumps `_lastGcActivityAt` on success and increments the
  // consecutive-failure counter that the kick decision is gated on. One probe
  // is in flight at a time. Best-effort; never throws.
  async _sendGcHealthPing(now) {
    if (this._gcPingInFlight) return; // a probe is already outstanding
    const gc = this.gcClient;
    if (!gc || typeof gc.requestProfileCard !== 'function') return;
    let accountId = null;
    try { accountId = this.steamClient?.steamID?.accountid; } catch (_) { /* ignore */ }
    if (accountId == null) {
      console.warn('[Steam] GC watchdog health ping skipped — own Steam account id unavailable.');
      return;
    }
    const clock = () => (typeof now === 'function' ? now() : Date.now());
    this._gcPingInFlight = true;
    this._lastHealthPingOutcome = 'sent';
    console.log('[Steam] GC watchdog health ping sent (self profile-card lookup).');
    try { require('../web/opsState').reportGcWatchdog({ pingOutcome: 'sent' }); } catch (_) {}
    let responded = false;
    try {
      const res = await Promise.resolve(gc.requestProfileCard(accountId));
      responded = res != null;
    } catch (_) {
      responded = false;
    }
    this._gcPingInFlight = false;
    if (responded) {
      this._lastGcActivityAt = clock();
      this._gcConsecutivePingFailures = 0;
      this._lastHealthPingOutcome = 'responded';
      console.log('[Steam] GC watchdog health ping responded — GC is alive, silence clock reset.');
      try { require('../web/opsState').reportGcWatchdog({ pingOutcome: 'responded', consecutivePingFailures: 0 }); } catch (_) {}
    } else {
      this._gcConsecutivePingFailures = (this._gcConsecutivePingFailures || 0) + 1;
      this._lastHealthPingOutcome = 'timed_out';
      console.warn(`[Steam] GC watchdog health ping got no response (consecutive failures: ${this._gcConsecutivePingFailures}).`);
      try { require('../web/opsState').reportGcWatchdog({ pingOutcome: 'timed_out', consecutivePingFailures: this._gcConsecutivePingFailures }); } catch (_) {}
    }
  }

  _checkGcLiveness({ thresholdMs, pingThresholdMs, maxPingFailures, now }) {
    if (!this.isLoggedIn) return; // can't kick GC without Steam
    const nowMs = now();
    const last = this._lastGcActivityAt || nowMs;
    const silentFor = nowMs - last;
    const failures = this._gcConsecutivePingFailures || 0;
    const maxFailures = maxPingFailures || GC_MAX_PING_FAILURES;

    // Per-tick diagnostic + telemetry so the live host can confirm the
    // keep-alive is working without code spelunking.
    console.log(
      `[Steam] GC watchdog tick — silent ${(silentFor / 1000).toFixed(0)}s, ` +
      `last health ping: ${this._lastHealthPingOutcome || 'none'}, consecutive failures: ${failures}.`
    );
    try {
      require('../web/opsState').reportGcWatchdog({
        tick: true,
        silenceMs: silentFor,
        pingOutcome: this._lastHealthPingOutcome || null,
        consecutivePingFailures: failures,
      });
    } catch (_) {}

    // Healthy / recently active — nothing to do. Clear failure tracking so a
    // brief blip never carries over toward a kick.
    if (silentFor < pingThresholdMs) {
      this._gcConsecutivePingFailures = 0;
      return;
    }

    // The GC has been quiet long enough to be suspicious. Kick ONLY when it
    // has both been silent past the hard threshold AND demonstrably failed to
    // answer repeated health pings. Mere idleness can never satisfy the second
    // condition, so a healthy bot is never kicked.
    if (silentFor >= thresholdMs && failures >= maxFailures) {
      this._kickGcSession({ silentFor, now });
      return;
    }

    // Otherwise probe the GC. A healthy GC answers and resets its own clock
    // (via the awaited ping); a dead one increments the failure counter until
    // the kick condition above is finally met.
    this._sendGcHealthPing(now);
  }

  // The recovery kick: replay `gamesPlayed([])` then `gamesPlayed([570])` a
  // second later to force the GC client to re-hello. This is what visibly
  // re-opens Dota, so it must only run when the GC is genuinely unresponsive.
  _kickGcSession({ silentFor, now }) {
    const nowMs = typeof now === 'function' ? now() : Date.now();
    console.warn(
      `[Steam] GC unresponsive — silent for ${(silentFor / 1000).toFixed(0)}s with ` +
      `${this._gcConsecutivePingFailures || 0} consecutive failed health pings. ` +
      `Kicking session (gamesPlayed re-hello).`
    );
    this.isGCReady = false;
    try {
      this.steamClient.gamesPlayed([]);
      setTimeout(() => {
        try { this.steamClient.gamesPlayed([DOTA2_APPID]); } catch (_) { /* swallow */ }
      }, 1000);
      this._lastGcActivityAt = nowMs;          // reset clock so we don't re-fire every tick
      this._gcConsecutivePingFailures = 0;     // start the next window clean
      this._lastHealthPingOutcome = null;
      try { require('../web/opsState').reportGcWatchdog({ kick: true, silenceMs: silentFor }); } catch (_) {}
      this.emit('gcWatchdogKick', { silentForMs: silentFor });
    } catch (err) {
      console.error('[Steam] GC re-hello failed:', err.message);
    }
  }

  _stopGcWatchdog() {
    if (this._gcWatchdogTimer) {
      clearInterval(this._gcWatchdogTimer);
      this._gcWatchdogTimer = null;
    }
  }

  shutdown() {
    this._stopGcWatchdog();
    if (this.gcClient) {
      this.gcClient.shutdown();
    }
    if (this.isLoggedIn) {
      this.steamClient.logOff();
    }
    this.isLoggedIn = false;
    this.isGCReady = false;
    console.log('[Steam] Shut down.');
  }
}

let instance = null;

function getSteamClient() {
  if (!instance) {
    instance = new SteamDotaClient();
  }
  return instance;
}

module.exports = { getSteamClient, SteamDotaClient };
