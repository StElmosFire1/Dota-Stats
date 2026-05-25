(function () {
  var input = document.getElementById('account-id');
  var btn = document.getElementById('save-btn');
  var status = document.getElementById('status');
  var form = document.getElementById('form');

  function setStatus(msg, kind) {
    status.textContent = msg || '';
    status.className = 'status' + (kind ? ' ' + kind : '');
  }

  // Pre-fill from whatever the broadcaster has saved (Twitch
  // configuration service in prod, localStorage in the test harness).
  input.value = OI.readSavedAccountId();

  function save(e) {
    if (e && e.preventDefault) e.preventDefault();
    var aid = (input.value || '').trim();
    if (!OI.isValidAccountId(aid)) {
      setStatus('That doesn\u2019t look like a numeric account id.', 'err');
      input.focus();
      return;
    }
    btn.disabled = true;
    try {
      var payload = JSON.stringify({ account_id: aid });
      // Prod: persist into Twitch's configuration service so every viewer
      // sees the same setting. Test harness: stash in localStorage.
      if (window.Twitch && window.Twitch.ext && window.Twitch.ext.configuration) {
        window.Twitch.ext.configuration.set('broadcaster', '1.0', payload);
      }
      try { window.localStorage.setItem('oi_account_id', aid); } catch (_) {}
      setStatus('Saved. Viewers will see this player on your panel + overlay.', 'ok');
    } catch (err) {
      setStatus('Save failed: ' + (err && err.message ? err.message : err), 'err');
    }
    btn.disabled = false;
  }

  form.addEventListener('submit', save);

  // Twitch fires `onAuthorized` once on load; nothing extra to do for a
  // pure-read extension, but reading it confirms the helper is wired.
  if (window.Twitch && window.Twitch.ext) {
    window.Twitch.ext.onAuthorized(function () {});
  }
})();
