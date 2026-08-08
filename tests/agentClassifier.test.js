// Task #850 — coverage that the AI-agent classifier records/blocks traffic
// but never DMs the owner (DM digests were removed).
const test = require('node:test');
const assert = require('node:assert/strict');

// Inject a fake discord bot into the require cache so that, if the DM path
// were ever reintroduced, the stub would capture it and the test would fail.
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

const { classifierMiddleware, buildReport, _resetForTests } = require('../src/security/agentClassifier');

const GPTBOT_UA = 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)';
const CURL_UA = 'curl/8.4.0';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function fakeReq(ua, path = '/x') {
  return {
    ip: '1.2.3.4',
    method: 'GET',
    originalUrl: path,
    url: path,
    get: (h) => (h.toLowerCase() === 'user-agent' ? ua : undefined),
    headers: { 'user-agent': ua },
    app: { get: () => undefined },
  };
}
function fakeRes() {
  const res = {
    headersSent: false,
    statusCode: 200,
    headers: {},
    body: null,
    set(k, v) { if (typeof k === 'object') Object.assign(this.headers, k); else this.headers[k] = v; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    getHeader(k) { return this.headers[k]; },
    status(c) { this.statusCode = c; return this; },
    type() { return this; },
    send(b) { this.body = b; this.headersSent = true; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
  };
  return res;
}
function run(mw, req, res) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (err) => { if (!settled) { settled = true; resolve({ nextCalled: true, err }); } };
    mw(req, res, done);
    // If the middleware responded without calling next (403/429), resolve shortly after.
    setTimeout(() => { if (!settled) { settled = true; resolve({ nextCalled: false }); } }, 50);
  });
}

test('AI crawler is recorded but no owner DM fires (Task #850)', async () => {
  _resetForTests();
  delete process.env.BLOCK_AI_AGENTS;
  const dms = installFakeBot();
  try {
    await run(classifierMiddleware, fakeReq(GPTBOT_UA, '/api/matches'), fakeRes());
    await run(classifierMiddleware, fakeReq(CURL_UA, '/'), fakeRes());
    await new Promise(r => setImmediate(r));
    assert.equal(dms.length, 0, 'DM digests are disabled');
    const report = buildReport();
    assert.equal(report.families.length >= 2, true);
    const gpt = report.families.find(f => f.family === 'gptbot');
    assert.ok(gpt, 'gptbot hit recorded in ring buffer');
    assert.equal(gpt.hits, 1);
  } finally {
    uninstallFakeBot();
  }
});

test('BLOCK_AI_AGENTS=1 still 403-blocks crawlers, with no DM', async () => {
  _resetForTests();
  process.env.BLOCK_AI_AGENTS = '1';
  const dms = installFakeBot();
  try {
    const res = fakeRes();
    const { nextCalled } = await run(classifierMiddleware, fakeReq(GPTBOT_UA), res);
    assert.equal(nextCalled, false, 'request was terminated');
    assert.equal(res.statusCode, 403);
    await new Promise(r => setImmediate(r));
    assert.equal(dms.length, 0);
    const report = buildReport();
    const gpt = report.families.find(f => f.family === 'gptbot');
    assert.equal(gpt.blocked, 1, 'blocked decision recorded');
  } finally {
    delete process.env.BLOCK_AI_AGENTS;
    uninstallFakeBot();
  }
});

test('human traffic passes straight through untouched', async () => {
  _resetForTests();
  const dms = installFakeBot();
  try {
    const { nextCalled } = await run(classifierMiddleware, fakeReq(CHROME_UA), fakeRes());
    assert.equal(nextCalled, true);
    await new Promise(r => setImmediate(r));
    assert.equal(dms.length, 0);
    assert.equal(buildReport().families.length, 0, 'humans are not recorded');
  } finally {
    uninstallFakeBot();
  }
});
