// Task #498 — coverage for the lockdown access log.
// Locks down: UA-family classification, the two block decisions, and the
// ring-buffer report aggregation.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  record,
  buildReport,
  uaFamily,
  _resetForTests,
} = require('../src/security/lockdownLog');

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0';
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

test('uaFamily: coarse browser families', () => {
  assert.equal(uaFamily(CHROME_UA), 'chrome');
  assert.equal(uaFamily(FIREFOX_UA), 'firefox');
  assert.equal(uaFamily(EDGE_UA), 'edge'); // edge tested before chrome
  assert.equal(uaFamily(SAFARI_UA), 'safari'); // safari tested after chrome
  assert.equal(uaFamily('curl/8.4.0'), 'unknown-bot'); // caught by shared bot classifier first
  assert.equal(uaFamily(''), 'unknown');
  assert.equal(uaFamily('Some Weird Client'), 'other');
});

test('uaFamily: known bots are labelled via the shared classifier', () => {
  assert.equal(uaFamily('Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)'), 'gptbot');
  assert.equal(uaFamily('python-requests/2.31.0'), 'unknown-bot');
});

test('record + buildReport aggregates by UA family with decision counts', () => {
  _resetForTests();
  record({ ip: '1.1.1.1', path: '/profile', ua: CHROME_UA, method: 'GET', decision: 'html-gate' });
  record({ ip: '1.1.1.2', path: '/leaderboard', ua: CHROME_UA, method: 'GET', decision: 'html-gate' });
  record({ ip: '1.1.1.1', path: '/api/me', ua: CHROME_UA, method: 'GET', decision: '401-empty' });
  record({ ip: '2.2.2.2', path: '/api/x', ua: FIREFOX_UA, method: 'POST', decision: '401-empty' });

  const report = buildReport();
  assert.equal(report.totals.hits, 4);
  assert.equal(report.totals.html_gate, 2);
  assert.equal(report.totals.empty_401, 2);

  const chrome = report.families.find(f => f.family === 'chrome');
  assert.ok(chrome, 'chrome row present');
  assert.equal(chrome.hits, 3);
  assert.equal(chrome.html_gate, 2);
  assert.equal(chrome.empty_401, 1);
  assert.equal(chrome.unique_ips, 2);
  assert.equal(chrome.unique_paths, 3);

  const firefox = report.families.find(f => f.family === 'firefox');
  assert.equal(firefox.hits, 1);
  assert.equal(firefox.empty_401, 1);

  assert.equal(report.recent.length, 4);
  // newest first
  assert.equal(report.recent[0].path, '/api/x');
});

test('buildReport window filters out old entries', () => {
  _resetForTests();
  record({ ip: '1.1.1.1', path: '/old', ua: CHROME_UA, method: 'GET', decision: 'html-gate' });
  // tiny window → the just-recorded entry is older than 0ms ago by the time we filter
  const report = buildReport({ windowMs: -1 });
  assert.equal(report.totals.hits, 0);
});

test('record never throws on bad input', () => {
  _resetForTests();
  assert.doesNotThrow(() => record({}));
  assert.doesNotThrow(() => record({ ip: null, path: null, ua: null, decision: 'html-gate' }));
});

test('ring buffer is capped', () => {
  _resetForTests();
  const { RING_BUFFER_MAX } = require('../src/security/lockdownLog');
  for (let i = 0; i < RING_BUFFER_MAX + 50; i++) {
    record({ ip: '1.1.1.1', path: `/p${i}`, ua: CHROME_UA, method: 'GET', decision: 'html-gate' });
  }
  const report = buildReport();
  assert.equal(report.ringBufferSize, RING_BUFFER_MAX);
});

// --- Owner DM digest (Task #567) ---
// Inject a fake discord bot into the require cache so the lazy
// require('../discord/bot') inside lockdownLog resolves to a capture stub.
const BOT_PATH = require.resolve('../src/discord/bot');
function installFakeBot() {
  const dms = [];
  require.cache[BOT_PATH] = {
    id: BOT_PATH,
    filename: BOT_PATH,
    loaded: true,
    exports: {
      getDiscordBot: () => ({
        _dmOwner: async (msg) => { dms.push(msg); },
      }),
    },
  };
  return dms;
}
function uninstallFakeBot() {
  delete require.cache[BOT_PATH];
}

test('owner is DMed when a real browser hits the locked site', async () => {
  _resetForTests();
  const dms = installFakeBot();
  try {
    record({ ip: '9.9.9.9', path: '/profile?x=1', ua: CHROME_UA, method: 'GET', decision: 'html-gate' });
    await new Promise(r => setImmediate(r));
    assert.equal(dms.length, 1, 'one DM fired on first browser hit');
    assert.match(dms[0], /Locked-site visitor/);
    assert.match(dms[0], /chrome/);
    assert.match(dms[0], /9\.9\.9\.9/);
    assert.match(dms[0], /\/profile/);
    assert.doesNotMatch(dms[0], /x=1/, 'query string stripped from sample path');
  } finally {
    uninstallFakeBot();
  }
});

test('bots/crawlers never trigger the owner DM', async () => {
  _resetForTests();
  const dms = installFakeBot();
  try {
    record({ ip: '1.2.3.4', path: '/', ua: 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)', method: 'GET', decision: 'html-gate' });
    record({ ip: '1.2.3.4', path: '/', ua: 'python-requests/2.31.0', method: 'GET', decision: '401-empty' });
    record({ ip: '1.2.3.4', path: '/', ua: '', method: 'GET', decision: '401-empty' }); // unknown UA excluded
    await new Promise(r => setImmediate(r));
    assert.equal(dms.length, 0);
  } finally {
    uninstallFakeBot();
  }
});

test('repeat browser hits within 24h are deduped into a single digest', async () => {
  _resetForTests();
  const dms = installFakeBot();
  try {
    for (let i = 0; i < 5; i++) {
      record({ ip: '9.9.9.9', path: `/p${i}`, ua: CHROME_UA, method: 'GET', decision: 'html-gate' });
    }
    record({ ip: '8.8.8.8', path: '/x', ua: FIREFOX_UA, method: 'GET', decision: 'html-gate' });
    await new Promise(r => setImmediate(r));
    // First chrome hit + first firefox hit each fire once; the 4 extra chrome
    // hits are suppressed (still counted for the next digest).
    assert.equal(dms.length, 2);
    assert.equal(dms.filter(m => /chrome/.test(m)).length, 1);
    assert.equal(dms.filter(m => /firefox/.test(m)).length, 1);
  } finally {
    uninstallFakeBot();
  }
});
