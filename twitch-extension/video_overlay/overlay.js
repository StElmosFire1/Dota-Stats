(function () {
  var $chip = document.getElementById('chip');
  var $state = document.getElementById('state');
  var $rank = document.getElementById('rank');

  var currentAccountId = '';
  var stopPoll = null;

  function render(presence, ticker) {
    var live = !!(presence && presence.matchId);
    $chip.classList.toggle('live', live);
    var label = live ? 'In match' : (presence && presence.state ? presence.state : 'Idle');
    $state.textContent = label;
    var rank = ticker && (ticker.tier || (ticker.mmr != null ? String(ticker.mmr) + ' MMR' : ''));
    $rank.textContent = rank ? ' \u00b7 ' + rank : '';
    $chip.hidden = false;
  }

  async function refreshAll(accountId) {
    if (!OI.isValidAccountId(accountId)) { $chip.hidden = true; return; }
    var presence = null, ticker = null;
    try {
      presence = await OI.getJSON('/api/overlay/live/current?for=' + encodeURIComponent(accountId));
    } catch (_) {}
    try {
      ticker = await OI.getJSON('/api/overlay/ticker/' + encodeURIComponent(accountId));
    } catch (_) {}
    render(presence, ticker);
  }

  function start(accountId) {
    if (stopPoll) { stopPoll(); stopPoll = null; }
    currentAccountId = accountId || '';
    stopPoll = OI.poll(function () { return refreshAll(currentAccountId); }, 30000);
  }

  start(OI.readSavedAccountId());

  if (window.Twitch && window.Twitch.ext) {
    window.Twitch.ext.onAuthorized(function () {});
    if (window.Twitch.ext.configuration && window.Twitch.ext.configuration.onChanged) {
      window.Twitch.ext.configuration.onChanged(function () {
        start(OI.readSavedAccountId());
      });
    }
  }
  window.addEventListener('oi:config-changed', function () {
    start(OI.readSavedAccountId());
  });
})();
