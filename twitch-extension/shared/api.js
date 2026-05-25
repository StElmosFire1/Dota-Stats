// Shared fetch helpers used by panel + video_overlay + config. Vanilla JS,
// no build step — the surfaces all <script src="../shared/api.js"></script>
// then call window.OI.* directly.

(function (global) {
  // Production host. The extension iframe runs on *.ext-twitch.tv so every
  // fetch is cross-origin; the OI CORS allowlist (Task #380) accepts the
  // `.ext-twitch.tv` suffix for these public read-only endpoints.
  var BASE = 'https://oceinhouse.gg';

  // Override for local development. The smoke-test harness sets
  // window.__OI_BASE_URL__ = 'http://localhost:5000' before loading the
  // surface iframes so the panel hits the dev server.
  function base() {
    if (typeof global !== 'undefined' && global.__OI_BASE_URL__) {
      return String(global.__OI_BASE_URL__).replace(/\/$/, '');
    }
    return BASE;
  }

  function isValidAccountId(v) {
    return typeof v === 'string' && /^\d{1,12}$/.test(v);
  }

  async function getJSON(path) {
    var url = base() + path;
    var r = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    return r.json();
  }

  function fmtDuration(seconds) {
    if (!seconds && seconds !== 0) return '—';
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtRelativeDate(dateLike) {
    if (!dateLike) return '';
    var t = new Date(dateLike).getTime();
    if (!t) return '';
    var diffMs = Date.now() - t;
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    var months = Math.floor(days / 30);
    return months + 'mo ago';
  }

  function heroPortrait(heroIdOrName) {
    // OpenDota CDN — public, no key required.
    if (!heroIdOrName) return '';
    if (typeof heroIdOrName === 'string') {
      var slug = heroIdOrName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      return 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/' + slug + '.png';
    }
    return '';
  }

  function streakLabel(s) {
    var n = Number(s || 0);
    if (n > 0) return '+' + n + 'W';
    if (n < 0) return n + 'L';
    return '—';
  }

  function streakClass(s) {
    var n = Number(s || 0);
    if (n > 0) return 'streak-win';
    if (n < 0) return 'streak-loss';
    return 'streak-none';
  }

  // POLL — wraps an async loader so it runs immediately then every `ms`
  // milliseconds (default 30 s). Returns a stop() handle.
  function poll(loader, ms) {
    var interval = Math.max(ms || 30000, 30000); // floor at 30 s per Twitch policy
    var stopped = false;
    var timer = null;
    async function tick() {
      if (stopped) return;
      try { await loader(); } catch (_) {}
      if (stopped) return;
      timer = setTimeout(tick, interval);
    }
    tick();
    return function stop() { stopped = true; if (timer) clearTimeout(timer); };
  }

  // Read the broadcaster's saved account id out of Twitch's configuration
  // service. Falls back to localStorage so the local test harness works
  // without a real Twitch helper.
  function readSavedAccountId() {
    try {
      if (global.Twitch && global.Twitch.ext && global.Twitch.ext.configuration) {
        var seg = global.Twitch.ext.configuration.broadcaster;
        if (seg && seg.content) {
          var parsed = JSON.parse(seg.content);
          if (parsed && isValidAccountId(parsed.account_id)) return parsed.account_id;
        }
      }
    } catch (_) {}
    try {
      var ls = global.localStorage && global.localStorage.getItem('oi_account_id');
      if (isValidAccountId(ls)) return ls;
    } catch (_) {}
    return '';
  }

  global.OI = {
    isValidAccountId: isValidAccountId,
    getJSON: getJSON,
    fmtDuration: fmtDuration,
    fmtRelativeDate: fmtRelativeDate,
    heroPortrait: heroPortrait,
    streakLabel: streakLabel,
    streakClass: streakClass,
    poll: poll,
    readSavedAccountId: readSavedAccountId,
  };
})(window);
