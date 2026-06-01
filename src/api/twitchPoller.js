// Background poller for the "Live now" hub (full edition).
//
// Every POLL_INTERVAL_MS it reads every inhouse player who has linked a Twitch
// channel (player_profiles.extras.twitch_login), asks Twitch Helix which of
// them are live, and caches the result in memory. The /api/twitch/live route
// reads getLive() — it never calls Twitch on the request path, so the hub stays
// fast and we stay well under Helix rate limits.

const twitch = require('./twitch');

const POLL_INTERVAL_MS = 60 * 1000;
const FIRST_RUN_DELAY_MS = 8 * 1000;

class TwitchPoller {
  constructor(db) {
    this._db = db;
    this._timer = null;
    this._polling = false;
    this._cache = { updatedAt: 0, live: [] };
  }

  start() {
    if (this._timer) return;
    if (!twitch.isConfigured()) {
      console.log('[TwitchPoller] TWITCH_CLIENT_ID/SECRET not set — live hub disabled');
      return;
    }
    console.log(`[TwitchPoller] Starting (every ${POLL_INTERVAL_MS / 1000}s)`);
    this._timer = setInterval(() => this._poll(), POLL_INTERVAL_MS);
    setTimeout(() => this._poll(), FIRST_RUN_DELAY_MS);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  // { configured, updatedAt, live: [...] }
  getLive() {
    return {
      configured: twitch.isConfigured(),
      updatedAt: this._cache.updatedAt,
      live: this._cache.live,
    };
  }

  async _poll() {
    if (this._polling) return;
    this._polling = true;
    try {
      const links = await this._db.getTwitchLinkedAccounts();
      if (!links.length) {
        this._cache = { updatedAt: Date.now(), live: [] };
        return;
      }
      // Map canonical login -> account metadata so we can stitch Twitch's
      // response back onto our players.
      const byLogin = new Map();
      for (const row of links) {
        const login = twitch.normalizeLogin(row.twitch_login);
        if (!login) continue;
        if (!byLogin.has(login)) {
          byLogin.set(login, {
            accountId: String(row.account_id),
            displayName: row.display_name || null,
          });
        }
      }
      const liveMap = await twitch.getLiveStreams([...byLogin.keys()]);
      const live = [];
      for (const [login, stream] of Object.entries(liveMap)) {
        const meta = byLogin.get(login) || {};
        live.push({
          accountId: meta.accountId || null,
          displayName: meta.displayName || stream.userName,
          login: stream.login,
          userName: stream.userName,
          title: stream.title,
          gameName: stream.gameName,
          viewerCount: stream.viewerCount,
          startedAt: stream.startedAt,
          thumbnailUrl: stream.thumbnailUrl,
        });
      }
      live.sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0));
      this._cache = { updatedAt: Date.now(), live };
    } catch (err) {
      console.warn('[TwitchPoller] poll failed:', err.message);
    } finally {
      this._polling = false;
    }
  }
}

let _instance = null;
function getTwitchPoller(db) {
  if (!_instance) _instance = new TwitchPoller(db);
  return _instance;
}

module.exports = { getTwitchPoller, TwitchPoller };
