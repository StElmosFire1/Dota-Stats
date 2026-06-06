(function () {
  var BASE = 'https://oceinhouse.gg';

  var $rank = document.getElementById('rank');
  var $wl = document.getElementById('wl');
  var $wr = document.getElementById('wr');
  var $streak = document.getElementById('streak');
  var $list = document.getElementById('matches');
  var $empty = document.getElementById('empty');
  var $badge = document.getElementById('badge');

  var $seasonBar = document.getElementById('season-bar');
  var $cellBestHero = document.getElementById('cell-besthero');
  var $bestHeroImg = document.getElementById('besthero-img');
  var $bestHeroName = document.getElementById('besthero-name');
  var $bestHeroSub = document.getElementById('besthero-sub');
  var $cellRankTrend = document.getElementById('cell-ranktrend');
  var $rankTrendValue = document.getElementById('ranktrend-value');
  var $rankTrendSub = document.getElementById('ranktrend-sub');

  var $lbBody = document.getElementById('lb-body');
  var $leaderboard = document.getElementById('leaderboard');

  var $linkProfile = document.getElementById('link-profile');

  var currentAccountId = '';
  var stopPoll = null;

  // The Twitch-host iframe may not let cross-frame links navigate the
  // viewer's tab, so deep-links point at oceinhouse.gg and open in a new tab.
  function siteUrl(path) {
    if (typeof window !== 'undefined' && window.__OI_BASE_URL__) {
      return String(window.__OI_BASE_URL__).replace(/\/$/, '') + path;
    }
    return BASE + path;
  }

  // ---- Season blob (rank, WR, W/L, streak, best hero, rank trend) --------
  function renderSeason(s) {
    if (!s) return;
    $badge.textContent = s.persona_name || 'Live';

    var tier = s.tier || (s.mmr != null ? String(s.mmr) : '\u2014');
    $rank.textContent = tier;

    var wr = s.win_rate != null
      ? s.win_rate
      : (s.games_played ? Math.round((s.wins / s.games_played) * 100) : null);
    $wr.textContent = wr != null ? wr + '%' : '\u2014';
    $wl.textContent = (s.wins || 0) + ' \u2013 ' + (s.losses || 0);

    // Best hero.
    if (s.best_hero && s.best_hero.hero_name) {
      var bh = s.best_hero;
      $bestHeroName.textContent = bh.hero_name;
      $bestHeroSub.textContent = bh.win_rate != null
        ? (bh.games + 'g \u00b7 ' + bh.win_rate + '% WR')
        : (bh.games + 'g');
      var portrait = OI.heroPortrait(bh.hero_slug || bh.hero_name);
      if (portrait) {
        $bestHeroImg.src = portrait;
        $bestHeroImg.style.display = '';
        $bestHeroImg.onerror = function () { $bestHeroImg.style.display = 'none'; };
      } else { $bestHeroImg.style.display = 'none'; }
      $cellBestHero.style.display = '';
    } else {
      $cellBestHero.style.display = 'none';
    }

    // Rank trend.
    if (s.rank_trend && typeof s.rank_trend.delta === 'number') {
      var rt = s.rank_trend;
      var sign = rt.delta > 0 ? '+' : '';
      $rankTrendValue.textContent = sign + rt.delta;
      $rankTrendValue.className = 'value ' + (rt.delta > 0 ? 'streak-win' : (rt.delta < 0 ? 'streak-loss' : 'streak-none'));
      $rankTrendSub.textContent = rt.from + ' \u2192 ' + rt.to;
      $cellRankTrend.style.display = '';
    } else {
      $cellRankTrend.style.display = 'none';
    }

    var anySeason = $cellBestHero.style.display !== 'none' || $cellRankTrend.style.display !== 'none';
    $seasonBar.style.display = anySeason ? '' : 'none';

    // Deep-link to the streamer's profile.
    if (currentAccountId) {
      $linkProfile.href = siteUrl('/player/' + encodeURIComponent(currentAccountId));
    }
  }

  // ---- Streak (from the ticker endpoint — season blob has no streak) -----
  function renderStreak(t) {
    if (!t) return;
    $streak.textContent = OI.streakLabel(t.streak);
    $streak.className = 'value ' + OI.streakClass(t.streak);
  }

  function renderMatches(matches) {
    if (!matches || !matches.length) {
      $list.style.display = 'none';
      $empty.style.display = '';
      $empty.textContent = 'No matches recorded yet.';
      return;
    }
    $empty.style.display = 'none';
    $list.style.display = '';
    $list.innerHTML = '';
    matches.forEach(function (m, idx) {
      var li = document.createElement('li');
      li.className = 'row' + (idx === 0 ? ' expanded' : '');

      var img = document.createElement('img');
      img.className = 'hero';
      img.alt = '';
      img.src = OI.heroPortrait(m.hero);
      img.onerror = function () { img.style.visibility = 'hidden'; };
      li.appendChild(img);

      var meta = document.createElement('div');
      meta.className = 'meta';
      var name = document.createElement('div');
      name.className = 'hero-name';
      name.textContent = m.hero || 'Unknown hero';
      var when = document.createElement('div');
      when.className = 'when';
      when.textContent = OI.fmtRelativeDate(m.date) + ' \u00b7 ' + OI.fmtDuration(m.duration);
      meta.appendChild(name); meta.appendChild(when);
      li.appendChild(meta);

      var result = document.createElement('span');
      result.className = 'result ' + (m.won ? 'win' : 'loss');
      result.textContent = m.won ? 'Win' : 'Loss';
      li.appendChild(result);

      var extra = document.createElement('div');
      extra.className = 'row-extra';
      extra.innerHTML =
        '<span>KDA <b>' + (m.kills ?? 0) + '/' + (m.deaths ?? 0) + '/' + (m.assists ?? 0) + '</b></span>' +
        '<span>GPM <b>' + (m.gpm ?? '\u2014') + '</b></span>' +
        '<span>XPM <b>' + (m.xpm ?? '\u2014') + '</b></span>';
      li.appendChild(extra);

      // Expand-on-hover/focus, plus a deep-link to the full match page.
      // Hover/focus reveals the KDA/GPM/XPM detail (mouse + keyboard +
      // touch), while a dedicated "View" link navigates to
      // /match/:matchId on oceinhouse.gg (new tab — the Twitch host iframe
      // can't navigate the viewer's tab).
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', 'Match ' + (idx + 1) + ' details');
      li.setAttribute('aria-expanded', idx === 0 ? 'true' : 'false');
      function toggle(on) {
        var next = on == null ? !li.classList.contains('expanded') : !!on;
        li.classList.toggle('expanded', next);
        li.setAttribute('aria-expanded', next ? 'true' : 'false');
      }
      li.addEventListener('mouseenter', function () { toggle(true); });
      li.addEventListener('mouseleave', function () { if (idx !== 0) toggle(false); });
      li.addEventListener('focus', function () { toggle(true); });
      li.addEventListener('blur', function () { if (idx !== 0) toggle(false); });
      li.addEventListener('click', function () { toggle(); });
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });

      if (m.match_id) {
        var link = document.createElement('a');
        link.className = 'row-link';
        link.href = siteUrl('/match/' + encodeURIComponent(m.match_id));
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'View match \u2197';
        link.setAttribute('aria-label', 'View match ' + (idx + 1) + ' on oceinhouse.gg');
        // Don't let the link click bubble up to the row's expand toggle.
        link.addEventListener('click', function (e) { e.stopPropagation(); });
        extra.appendChild(link);
      }

      $list.appendChild(li);
    });
  }

  function renderLeaderboard(lb) {
    if (!lb || !lb.top || !lb.top.length) {
      $lbBody.style.display = 'none';
      return;
    }
    $lbBody.style.display = '';
    $leaderboard.innerHTML = '';

    var rows = lb.top.slice();
    var meInTop = lb.me && rows.some(function (r) { return String(r.account_id) === String(lb.me.account_id); });
    if (lb.me && !meInTop) rows.push(lb.me);

    rows.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'lb-row';
      var isMe = lb.me && String(r.account_id) === String(lb.me.account_id);
      if (isMe) li.classList.add('me');

      // Each row deep-links to that player's profile when we know their
      // account id; anchor element so it's keyboard-reachable + opens in a
      // new tab (Twitch host iframe can't navigate the viewer's tab).
      var rowEl = li;
      if (r.account_id) {
        var a = document.createElement('a');
        a.className = 'lb-row-link';
        a.href = siteUrl('/player/' + encodeURIComponent(r.account_id));
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', 'View ' + (r.name || ('player #' + r.rank)) + ' on oceinhouse.gg');
        li.appendChild(a);
        rowEl = a;
      }

      var rank = document.createElement('span');
      rank.className = 'lb-rank';
      rank.textContent = '#' + r.rank;
      rowEl.appendChild(rank);

      var name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = r.name || '\u2014';
      rowEl.appendChild(name);

      var mmr = document.createElement('span');
      mmr.className = 'lb-mmr';
      mmr.textContent = r.mmr != null ? String(r.mmr) : '\u2014';
      rowEl.appendChild(mmr);

      $leaderboard.appendChild(li);
    });
  }

  async function refreshAll(accountId) {
    if (!OI.isValidAccountId(accountId)) {
      $empty.textContent = 'Set an account id from the config page.';
      $empty.style.display = '';
      $list.style.display = 'none';
      $seasonBar.style.display = 'none';
      $lbBody.style.display = 'none';
      return;
    }
    // Season blob — rank, WR, W/L, best hero, rank trend.
    try {
      var s = await OI.getJSON('/api/overlay/season/' + encodeURIComponent(accountId));
      renderSeason(s);
    } catch (e) {
      $rank.textContent = '\u2014'; $wl.textContent = '\u2014'; $wr.textContent = '\u2014';
      $seasonBar.style.display = 'none';
    }
    // Streak comes from the ticker endpoint.
    try {
      var t = await OI.getJSON('/api/overlay/ticker/' + encodeURIComponent(accountId));
      renderStreak(t);
    } catch (e) { $streak.textContent = '\u2014'; }
    // Recent matches.
    try {
      var r = await OI.getJSON('/api/players/' + encodeURIComponent(accountId) + '/recent-matches?limit=5');
      renderMatches(r && r.matches);
    } catch (e) {
      $list.style.display = 'none';
      $empty.style.display = '';
      $empty.textContent = 'Could not load recent matches.';
    }
    // Compact leaderboard with the streamer's own standing highlighted.
    try {
      var lb = await OI.getJSON('/api/overlay/leaderboard?limit=5&for=' + encodeURIComponent(accountId));
      renderLeaderboard(lb);
    } catch (e) {
      $lbBody.style.display = 'none';
    }
  }

  function start(accountId) {
    if (stopPoll) { stopPoll(); stopPoll = null; }
    currentAccountId = accountId || '';
    stopPoll = OI.poll(function () { return refreshAll(currentAccountId); }, 30000);
  }

  // Initial run — read whatever is in Twitch's configuration service (or
  // localStorage in the test harness) and start polling.
  start(OI.readSavedAccountId());

  // Live config updates — when the broadcaster saves a different account
  // id from the config page, Twitch's helper fires onChanged on every
  // open panel and we re-start the poll without a full iframe reload.
  if (window.Twitch && window.Twitch.ext) {
    window.Twitch.ext.onAuthorized(function () {});
    if (window.Twitch.ext.configuration && window.Twitch.ext.configuration.onChanged) {
      window.Twitch.ext.configuration.onChanged(function () {
        start(OI.readSavedAccountId());
      });
    }
  }
  // Test harness: dispatch a custom event whenever the config saves so the
  // sibling panel iframe re-polls immediately.
  window.addEventListener('oi:config-changed', function () {
    start(OI.readSavedAccountId());
  });
})();
