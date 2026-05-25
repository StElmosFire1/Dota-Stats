(function () {
  var $rank = document.getElementById('rank');
  var $wl = document.getElementById('wl');
  var $wr = document.getElementById('wr');
  var $streak = document.getElementById('streak');
  var $list = document.getElementById('matches');
  var $empty = document.getElementById('empty');
  var $badge = document.getElementById('badge');

  var currentAccountId = '';
  var stopPoll = null;

  function renderTicker(t) {
    if (!t) return;
    $rank.textContent = t.tier || (t.mmr != null ? String(t.mmr) : '\u2014');
    $wl.textContent = (t.wins || 0) + ' \u2013 ' + (t.losses || 0);
    var wr = t.win_rate != null
      ? Math.round(t.win_rate * 100)
      : (t.games_played ? Math.round((t.wins / t.games_played) * 100) : 0);
    $wr.textContent = wr + '%';
    $streak.textContent = OI.streakLabel(t.streak);
    $streak.className = 'value ' + OI.streakClass(t.streak);
    $badge.textContent = t.persona_name || 'Live';
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

      // Expand-on-hover/focus. We toggle the .expanded class on hover for
      // mouse users and on focus-within for keyboard users — keyboard
      // reaches the row via tabindex=0, and tabbing into the row reveals
      // its details. Touch users get a plain click toggle.
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

      $list.appendChild(li);
    });
  }

  async function refreshAll(accountId) {
    if (!OI.isValidAccountId(accountId)) {
      $empty.textContent = 'Set an account id from the config page.';
      $empty.style.display = '';
      $list.style.display = 'none';
      return;
    }
    try {
      var t = await OI.getJSON('/api/overlay/ticker/' + encodeURIComponent(accountId));
      renderTicker(t);
    } catch (e) {
      $rank.textContent = '\u2014'; $wl.textContent = '\u2014';
      $wr.textContent = '\u2014'; $streak.textContent = '\u2014';
    }
    try {
      var r = await OI.getJSON('/api/players/' + encodeURIComponent(accountId) + '/recent-matches?limit=5');
      renderMatches(r && r.matches);
    } catch (e) {
      $list.style.display = 'none';
      $empty.style.display = '';
      $empty.textContent = 'Could not load recent matches.';
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
