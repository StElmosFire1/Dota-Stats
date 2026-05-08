'use strict';

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');

const {
  scoreCoachMatch,
  validateWeeklyReportJson,
  WEEKLY_REPORT_SCHEMA,
  mountMagazineV3Routes,
} = require('../src/monetization/magazineV3');

// -----------------------------------------------------------------------------
// scoreCoachMatch — pure helper
// -----------------------------------------------------------------------------
test('scoreCoachMatch: returns 0..100', () => {
  const s = { mmr: 3000, top_heroes: [1, 2], primary_position: 1 };
  const c = { mmr: 3500, hero_pool: [1, 2, 3], positions: [1], review_count: 8 };
  const score = scoreCoachMatch(s, c);
  assert.ok(score >= 0 && score <= 100, `score in range, got ${score}`);
  assert.ok(score > 60, 'aligned coach should score >60');
});

test('scoreCoachMatch: penalises huge MMR mismatch', () => {
  const s = { mmr: 1000, top_heroes: [], primary_position: 5 };
  const c = { mmr: 6000, hero_pool: [], positions: [1], review_count: 0 };
  assert.ok(scoreCoachMatch(s, c) < 50);
});

// -----------------------------------------------------------------------------
// Weekly report JSON validation (review fix)
// -----------------------------------------------------------------------------
test('validateWeeklyReportJson: accepts well-formed report', () => {
  const v = validateWeeklyReportJson({
    summary: 'You played 12 games this week, mostly carry.',
    insights: ['Your last-hits per minute improved 8%.'],
    top_heroes: [{ hero_id: 1, games: 5, winrate: 0.6 }],
    deltas: { perf_avg: 0.3, winrate: 0.05, kda: -0.1 },
  });
  assert.deepStrictEqual(v, { ok: true });
});

test('validateWeeklyReportJson: rejects missing keys', () => {
  const v = validateWeeklyReportJson({ summary: 'long enough text', insights: ['ok ok ok'] });
  assert.strictEqual(v.ok, false);
  assert.ok(v.error.startsWith('missing:'));
});

test('validateWeeklyReportJson: rejects empty insights', () => {
  const v = validateWeeklyReportJson({
    summary: 'long enough text',
    insights: [],
    top_heroes: [],
    deltas: {},
  });
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.error, 'insights-bounds');
});

test('validateWeeklyReportJson: enforces upper bound', () => {
  const v = validateWeeklyReportJson({
    summary: 'long enough text',
    insights: new Array(WEEKLY_REPORT_SCHEMA.insightsMax + 1).fill('this is fine'),
    top_heroes: [],
    deltas: {},
  });
  assert.strictEqual(v.ok, false);
});

// -----------------------------------------------------------------------------
// Route-level Pro gating for Pickem (review fix — was missing).
// We mount the routes onto a tiny in-process express app with stubbed deps
// so the test runs without a database or Stripe.
// -----------------------------------------------------------------------------
function buildApp({ isPro, isSu, signedIn = true }) {
  const app = express();
  // Fake session middleware.
  app.use((req, res, next) => {
    req.session = signedIn ? { accountId: 999 } : {};
    next();
  });
  const router = express.Router();
  // Minimal magV3 stub — only the methods the Pickem POST path touches
  // before we expect the 402 to fire.
  const magV3 = {
    getActivePickemSeason: async () => ({ id: 1, label: 'Stub' }),
    submitPickemPick: async () => ({ id: 1 }),
    ensureDefaultPickemSeason: async () => null,
    getPickemLeaderboard: async () => [],
    getMyPickemPicks: async () => [],
    isApprovedOrgSponsor: async () => false,
    getInboundSponsorships: async () => [],
    getActiveSponsorshipsForTarget: async () => [],
    listPendingModerationSponsorships: async () => [],
    getVerifiedBadges: async () => [],
    listOneOffPerks: async () => [],
    listPendingVerifications: async () => [],
    listPendingOrgSponsors: async () => [],
    countReplayDownloadsLast24h: async () => 0,
    getCachedWeeklyReport: async () => null,
    getWeeklyReportSourceData: async () => ({ matches: [] }),
    saveWeeklyReport: async (a, w, c, s) => ({ content_md: c, stats: s, week_start: w, generated_at: new Date() }),
    _weekStart: () => new Date(),
  };
  const db = { getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }) };
  mountMagazineV3Routes({
    router, app, express,
    deps: {
      db, magV3,
      isProAccount: async () => isPro,
      isSuperuser: () => isSu,
      requirePro: () => (req, res, next) => next(),
      getStripe: () => null,
      getSiteUrl: () => 'http://test',
      getGroq: () => null,
    },
  });
  app.use('/api', router);
  return app;
}

function request(app, method, path, body) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = body ? JSON.stringify(body) : null;
      const req = http.request({
        host: '127.0.0.1', port, method, path,
        headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
      }, res => {
        let buf = '';
        res.on('data', c => { buf += c; });
        res.on('end', () => {
          server.close();
          let json = null;
          try { json = JSON.parse(buf); } catch { /* */ }
          resolve({ status: res.statusCode, body: json, raw: buf });
        });
      });
      req.on('error', err => { server.close(); reject(err); });
      if (data) req.write(data);
      req.end();
    });
  });
}

test('POST /api/pickem/pick: free signed-in user gets 402 paywall', async () => {
  const app = buildApp({ isPro: false, isSu: false });
  const r = await request(app, 'POST', '/api/pickem/pick', { matchRef: 'm1', pickedWinner: 'radiant' });
  assert.strictEqual(r.status, 402);
  assert.strictEqual(r.body.paywall, true);
  assert.strictEqual(r.body.feature, 'pickem_entry');
});

test('POST /api/pickem/pick: Pro user is allowed through', async () => {
  const app = buildApp({ isPro: true, isSu: false });
  const r = await request(app, 'POST', '/api/pickem/pick', { matchRef: 'm1', pickedWinner: 'radiant' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.pick);
});

test('POST /api/pickem/pick: superuser bypasses Pro gate', async () => {
  const app = buildApp({ isPro: false, isSu: true });
  const r = await request(app, 'POST', '/api/pickem/pick', { matchRef: 'm1', pickedWinner: 'radiant' });
  assert.strictEqual(r.status, 200);
});

test('POST /api/pickem/pick: anonymous gets 401', async () => {
  const app = buildApp({ isPro: false, isSu: false, signedIn: false });
  const r = await request(app, 'POST', '/api/pickem/pick', { matchRef: 'm1', pickedWinner: 'radiant' });
  assert.strictEqual(r.status, 401);
});

test('POST /api/pickem/pick: invalid winner returns 400 for Pro user', async () => {
  const app = buildApp({ isPro: true, isSu: false });
  const r = await request(app, 'POST', '/api/pickem/pick', { matchRef: 'm1', pickedWinner: 'spectator' });
  assert.strictEqual(r.status, 400);
});

test('POST /api/perks/checkout: rejects unknown perkKey', async () => {
  const app = buildApp({ isPro: true, isSu: false });
  const r = await request(app, 'POST', '/api/perks/checkout', { perkKey: 'bogus' });
  assert.strictEqual(r.status, 400);
});

test('GET /api/perks/catalog: returns server-controlled price list', async () => {
  const app = buildApp({ isPro: false, isSu: false });
  const r = await request(app, 'GET', '/api/perks/catalog', null);
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body.perks));
  assert.ok(r.body.perks.length >= 1);
  assert.ok(r.body.perks.every(p => typeof p.cents === 'number' && p.cents > 0));
});

test('POST /api/sponsorships/checkout: requires approved org', async () => {
  const app = buildApp({ isPro: true, isSu: false });
  const r = await request(app, 'POST', '/api/sponsorships/checkout',
    { targetAccountId: 123, headline: 'Hi' });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.body.needs_org_onboarding, true);
});

test('Admin verified routes: forbidden for non-superuser', async () => {
  const app = buildApp({ isPro: true, isSu: false });
  const r = await request(app, 'GET', '/api/admin/verified/pending', null);
  assert.strictEqual(r.status, 403);
});

// -----------------------------------------------------------------------------
// SECURITY (Task #157 round-3 review): one-off perk pre-grant fix.
// createOneOffPerkPending must NOT make hasOneOffPerk return true; only the
// signature-verified Stripe webhook (grantOneOffPerk with the same session_id)
// is allowed to activate the perk.
// -----------------------------------------------------------------------------
test('one-off perk: createOneOffPerkPending stores intent but does NOT grant access', async () => {
  const { createMagazineV3Db } = require('../src/monetization/magazineV3');
  // Tiny in-memory query stub modelling the user_one_off_perks rows.
  const rows = [];
  const fakePool = {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('SELECT * FROM user_one_off_perks WHERE stripe_session_id')) {
        return { rows: rows.filter(r => r.stripe_session_id === params[0]) };
      }
      if (s.startsWith('INSERT INTO user_one_off_perks')) {
        const row = {
          id: rows.length + 1, account_id: params[0], perk_key: params[1],
          source: 'stripe_pending', stripe_session_id: params[2],
          amount_cents: params[3], currency: params[4],
          metadata: params[5] ? JSON.parse(params[5]) : null,
          revoked_at: new Date(), expires_at: null, granted_at: new Date(),
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (s.startsWith('SELECT 1 FROM user_one_off_perks')) {
        const m = rows.filter(r =>
          r.account_id === params[0] && r.perk_key === params[1] &&
          r.revoked_at === null &&
          (r.expires_at === null || r.expires_at > new Date()));
        return { rows: m.length ? [{ '?column?': 1 }] : [] };
      }
      if (s.startsWith('UPDATE user_one_off_perks')) {
        const row = rows.find(r => r.id === params[0]);
        if (row) {
          row.revoked_at = null;
          row.source = params[1];
          row.granted_at = new Date();
        }
        return { rows: row ? [row] : [] };
      }
      throw new Error('unexpected query: ' + s);
    },
  };
  const db = createMagazineV3Db({ getPool: () => fakePool });

  // Pre-checkout: user has no perk.
  assert.strictEqual(await db.hasOneOffPerk(42, 'cosmetic:profile_glow'), false);

  // Pre-checkout intent recorded.
  await db.createOneOffPerkPending({
    accountId: 42, perkKey: 'cosmetic:profile_glow',
    stripeSessionId: 'cs_test_1', amountCents: 500, currency: 'aud',
  });

  // CRITICAL: still no access — payment hasn't been confirmed.
  assert.strictEqual(
    await db.hasOneOffPerk(42, 'cosmetic:profile_glow'), false,
    'pre-webhook intent must NOT grant perk access',
  );

  // Webhook arrives -> grantOneOffPerk activates the pending row.
  await db.grantOneOffPerk({
    accountId: 42, perkKey: 'cosmetic:profile_glow',
    source: 'stripe', stripeSessionId: 'cs_test_1',
    stripePaymentIntent: 'pi_test', amountCents: 500, currency: 'aud',
  });

  // Now the user has access.
  assert.strictEqual(
    await db.hasOneOffPerk(42, 'cosmetic:profile_glow'), true,
    'post-webhook activation must grant perk access',
  );

  // Re-running the webhook is idempotent and does not duplicate rows.
  await db.grantOneOffPerk({
    accountId: 42, perkKey: 'cosmetic:profile_glow',
    source: 'stripe', stripeSessionId: 'cs_test_1',
  });
  assert.strictEqual(rows.length, 1, 'webhook re-delivery must be idempotent');
});

// -----------------------------------------------------------------------------
// SECURITY (Task #157 round-4 review): sponsorship link_url must reject
// non-http(s) schemes server-side. `javascript:` would otherwise become an
// XSS/phishing primitive on the target's profile page.
// -----------------------------------------------------------------------------
function buildAppApprovedOrg() {
  const app = express();
  app.use((req, res, next) => { req.session = { accountId: 999 }; next(); });
  const router = express.Router();
  const magV3 = {
    isApprovedOrgSponsor: async () => true,
    createSponsorshipPending: async () => ({ id: 1 }),
    getActivePickemSeason: async () => null,
    submitPickemPick: async () => ({ id: 1 }),
    ensureDefaultPickemSeason: async () => null,
    getPickemLeaderboard: async () => [],
    getMyPickemPicks: async () => [],
    getInboundSponsorships: async () => [],
    getActiveSponsorshipsForTarget: async () => [],
    listPendingModerationSponsorships: async () => [],
    getVerifiedBadges: async () => [],
    listOneOffPerks: async () => [],
    listPendingVerifications: async () => [],
    listPendingOrgSponsors: async () => [],
    countReplayDownloadsLast24h: async () => 0,
    getCachedWeeklyReport: async () => null,
    getWeeklyReportSourceData: async () => ({ matches: [] }),
    saveWeeklyReport: async (a, w, c, s) => ({ content_md: c, stats: s, week_start: w, generated_at: new Date() }),
    _weekStart: () => new Date(),
  };
  const db = {
    getPool: () => ({ query: async () => ({ rows: [], rowCount: 0 }) }),
    getCoachByAccountId: async () => null,
  };
  mountMagazineV3Routes({
    router, app, express,
    deps: {
      db, magV3,
      isProAccount: async () => true,
      isSuperuser: () => false,
      requirePro: () => (req, res, next) => next(),
      // Returning a non-null stripe object is enough to pass the gate;
      // we never reach the create-session call because URL validation
      // rejects the request first.
      getStripe: () => ({ checkout: { sessions: { create: async () => ({ id: 'cs_x', url: 'http://x' }) } } }),
      getSiteUrl: () => 'http://test',
      getGroq: () => null,
    },
  });
  app.use('/api', router);
  return app;
}

test('POST /api/sponsorships/checkout: rejects javascript: linkUrl', async () => {
  const app = buildAppApprovedOrg();
  const r = await request(app, 'POST', '/api/sponsorships/checkout', {
    targetAccountId: 123, headline: 'Hi',
    linkUrl: 'javascript:alert(1)',
  });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error || '', /linkUrl/);
});

test('POST /api/sponsorships/checkout: rejects data: imageUrl', async () => {
  const app = buildAppApprovedOrg();
  const r = await request(app, 'POST', '/api/sponsorships/checkout', {
    targetAccountId: 123, headline: 'Hi',
    imageUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
  });
  assert.strictEqual(r.status, 400);
  assert.match(r.body.error || '', /imageUrl/);
});

test('POST /api/sponsorships/checkout: accepts https linkUrl', async () => {
  const app = buildAppApprovedOrg();
  const r = await request(app, 'POST', '/api/sponsorships/checkout', {
    targetAccountId: 123, headline: 'Hi',
    linkUrl: 'https://example.com/landing',
  });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.url);
});

// -----------------------------------------------------------------------------
// REGRESSION (round-4): pickem season-rollover must auto-grant the
// `cosmetic:pickem_champion_frame:S<id>` perk to the #1 finisher and be
// idempotent on re-call.
// -----------------------------------------------------------------------------
test('awardPickemSeasonChampion: grants champion frame to top finisher and is idempotent', async () => {
  const { createMagazineV3Db } = require('../src/monetization/magazineV3');
  const board = [
    { account_id: 7, points: 50 },
    { account_id: 8, points: 30 },
  ];
  const perkRows = [];
  const fakePool = {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      // Leaderboard read.
      if (s.includes('FROM pickem_picks')) {
        return { rows: board };
      }
      // hasOneOffPerk probe.
      if (s.startsWith('SELECT 1 FROM user_one_off_perks')) {
        const m = perkRows.filter(r =>
          r.account_id === params[0] && r.perk_key === params[1] &&
          r.revoked_at === null);
        return { rows: m.length ? [{ '?column?': 1 }] : [] };
      }
      if (s.startsWith('INSERT INTO user_one_off_perks')) {
        const row = {
          id: perkRows.length + 1, account_id: params[0], perk_key: params[1],
          source: 'season_award',
          metadata: params[2] ? JSON.parse(params[2]) : null,
          revoked_at: null, expires_at: null, granted_at: new Date(),
        };
        perkRows.push(row);
        return { rows: [row] };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const db = createMagazineV3Db({ getPool: () => fakePool });

  const award1 = await db.awardPickemSeasonChampion(42);
  assert.ok(award1, 'first call grants the perk');
  assert.strictEqual(award1.account_id, 7);
  assert.strictEqual(award1.perk_key, 'cosmetic:pickem_champion_frame:S42');
  assert.strictEqual(perkRows.length, 1);

  const award2 = await db.awardPickemSeasonChampion(42);
  assert.strictEqual(award2, null, 'second call is idempotent (no duplicate grant)');
  assert.strictEqual(perkRows.length, 1);
});

// -----------------------------------------------------------------------------
// SECURITY (round-5 review): SSRF guard for proof-URL fetcher. The verified
// badge code-challenge route fetches user-supplied URLs server-side; without
// hostname-resolution checks an attacker could probe internal services
// (localhost, 169.254.169.254 metadata, RFC1918, CGNAT). The exported
// `_assertPublicHttpUrl` helper is the gate.
// -----------------------------------------------------------------------------
test('_assertPublicHttpUrl: rejects localhost / loopback / private / metadata hosts', async () => {
  const { _assertPublicHttpUrl } = require('../src/monetization/magazineV3');
  const blocked = [
    'http://localhost/x',
    'http://127.0.0.1/x',
    'http://[::1]/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/admin',
    'http://192.168.1.1/',
    'http://172.16.5.5/',
    'http://100.64.0.1/',           // CGNAT
    'http://metadata.google.internal/',
    'http://service.local/',
    'ftp://example.com/x',          // wrong scheme
    'javascript:alert(1)',          // wrong scheme
  ];
  for (const u of blocked) {
    let threw = false;
    try { await _assertPublicHttpUrl(u); } catch { threw = true; }
    assert.ok(threw, `expected reject: ${u}`);
  }
});

// -----------------------------------------------------------------------------
// REGRESSION (round-6 hardening): getVerifiedBadges() must filter by both
// `status='verified'` and `revoked_at IS NULL`. A row with revoked_at IS NULL
// but status='pending' (e.g. legacy data, mid-migration row, or future code
// path that clears revoked_at without bumping status) MUST NOT be returned.
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// REGRESSION (round-7 review): the canonical replay route must not have a
// duplicate Express registration that bypasses the Pro daily quota. We
// statically grep src/web/server.js to assert exactly one `/matches/:matchId/replay`
// handler registration exists (mounted via the shared _replayDownloadHandler).
// -----------------------------------------------------------------------------
test("canonical /matches/:matchId/replay is registered exactly once and uses the quota-aware handler", () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'web', 'server.js'), 'utf8');
  const matches = src.match(/router\.get\(\s*['"]\/matches\/:matchId\/replay['"]/g) || [];
  assert.strictEqual(matches.length, 1,
    `expected exactly one /matches/:matchId/replay registration, got ${matches.length}`);
  // The single registration must be the one wired to _replayDownloadHandler
  // (which performs the auth + quota check). Asserting both lines appear and
  // that the registration uses `_replayDownloadHandler` keeps future edits
  // honest if someone re-adds a separate handler with inline logic.
  assert.match(src, /router\.get\(\s*['"]\/matches\/:matchId\/replay['"]\s*,\s*_replayDownloadHandler\s*\)/,
    'canonical /matches/:matchId/replay must mount _replayDownloadHandler');
});

// -----------------------------------------------------------------------------
// REGRESSION (round-8): side-bet auto-resolution wiring. The match-record
// pipeline calls autoResolvePickemForMatch with the parsed-replay extras —
// duration, totalKills, firstBloodTeam — and the helper must (a) bucket
// totalKills at the 50 boundary, (b) tier duration <30 / 30-45 / >45 minutes,
// and (c) feed those to resolvePickemMatch as actual_* values so awarded
// points line up with picked_* values per dim.
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// REGRESSION (round-9 review comment): UI provider list and the backend
// /api/verified/checkout allow-list must stay in sync. If they drift, a
// user picking a UI-only provider gets a 400 from the server.
// -----------------------------------------------------------------------------
test('verified-badge: UI provider list matches ALLOWED_VERIFIED_PROVIDERS server set', () => {
  const fs = require('fs');
  const path = require('path');
  const { ALLOWED_VERIFIED_PROVIDERS } = require('../src/monetization/magazineV3');
  const modalSrc = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'components', 'VerifiedBadgePurchaseModal.jsx'),
    'utf8',
  );
  // Parse the value:'...' literals out of the modal's PROVIDERS array.
  const uiProviders = new Set(
    [...modalSrc.matchAll(/value:\s*'([a-z0-9_]+)'/gi)].map(m => m[1])
  );
  for (const p of uiProviders) {
    assert.ok(
      ALLOWED_VERIFIED_PROVIDERS.has(p),
      `UI offers provider "${p}" but /verified/checkout server allow-list does not include it`,
    );
  }
  // Reverse direction is informational, not strict — backend may add a
  // provider before UI exposes it intentionally — so we don't assert on it.
  assert.ok(uiProviders.size > 0, 'UI must offer at least one provider');
});

test('autoResolvePickemForMatch: side-bet actuals bucket/tier correctly and feed resolvePickemMatch', async () => {
  const { createMagazineV3Db } = require('../src/monetization/magazineV3');
  let resolveCallArgs = null;
  // Stub query just enough that getActivePickemSeason returns a season
  // and resolvePickemMatch is reached. We capture the final call args
  // (parameter array passed to the UPDATE) to assert bucketing/tiering.
  const fakePool = {
    async query(sql, params) {
      if (/SELECT \* FROM pickem_seasons/i.test(sql)) {
        return { rows: [{ id: 42, slug: 'pickem-test', status: 'open' }] };
      }
      if (/UPDATE pickem_picks/i.test(sql)) {
        // resolvePickemMatch params order:
        //   [seasonId, matchRef, actualWinner, points, sidePoints,
        //    actualFirstBlood, actualTotalKillsBucket, actualDurationTier]
        resolveCallArgs = params;
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const db = createMagazineV3Db({ getPool: () => fakePool });
  // 32 minutes (1920s) → medium; 60 kills → over; firstBlood radiant.
  await db.autoResolvePickemForMatch('m_under', true, {
    durationSeconds: 1920, totalKills: 60, firstBloodTeam: 'radiant',
  });
  assert.ok(resolveCallArgs, 'resolvePickemMatch must be invoked');
  assert.strictEqual(resolveCallArgs[0], 42, 'seasonId');
  assert.strictEqual(resolveCallArgs[1], 'm_under', 'matchRef');
  assert.strictEqual(resolveCallArgs[2], 'radiant', 'actualWinner');
  assert.strictEqual(resolveCallArgs[5], 'radiant', 'actualFirstBlood');
  assert.strictEqual(resolveCallArgs[6], 'over',    'totalKills>=50 → over');
  assert.strictEqual(resolveCallArgs[7], 'medium',  '32min → medium');

  // Boundary cases: 49 → under; 1799s (29:59) → short; 2701s (45:01) → long.
  resolveCallArgs = null;
  await db.autoResolvePickemForMatch('m_short', false, {
    durationSeconds: 1799, totalKills: 49, firstBloodTeam: 'dire',
  });
  assert.strictEqual(resolveCallArgs[2], 'dire',    'actualWinner=dire on radiantWin=false');
  assert.strictEqual(resolveCallArgs[6], 'under',   'totalKills<50 → under');
  assert.strictEqual(resolveCallArgs[7], 'short',   '<30min → short');

  resolveCallArgs = null;
  await db.autoResolvePickemForMatch('m_long', true, {
    durationSeconds: 2701, totalKills: 50, firstBloodTeam: 'radiant',
  });
  assert.strictEqual(resolveCallArgs[6], 'over',    'exactly 50 → over (boundary)');
  assert.strictEqual(resolveCallArgs[7], 'long',    '>45min → long');

  // Missing extras → all dims null (skipped, no points awarded for them).
  resolveCallArgs = null;
  await db.autoResolvePickemForMatch('m_winneronly', true);
  assert.strictEqual(resolveCallArgs[5], null, 'no firstBlood → null');
  assert.strictEqual(resolveCallArgs[6], null, 'no totalKills → null');
  assert.strictEqual(resolveCallArgs[7], null, 'no duration → null');
});

test('getVerifiedBadges: WHERE clause requires status=verified AND revoked_at IS NULL', async () => {
  const { createMagazineV3Db } = require('../src/monetization/magazineV3');
  let capturedSql = '';
  const fakePool = {
    async query(sql) { capturedSql = sql; return { rows: [] }; },
  };
  const db = createMagazineV3Db({ getPool: () => fakePool });
  await db.getVerifiedBadges(123);
  const norm = capturedSql.replace(/\s+/g, ' ');
  assert.match(norm, /status\s*=\s*'verified'/, 'must filter status=verified');
  assert.match(norm, /revoked_at IS NULL/, 'must filter revoked_at IS NULL');
});

test('_assertPublicHttpUrl: accepts well-known public host', async () => {
  const { _assertPublicHttpUrl } = require('../src/monetization/magazineV3');
  // Use a well-known public IP literal so we don't depend on real DNS for
  // a hostname (still exercises the public-IP branch). 8.8.8.8 is Google DNS.
  await _assertPublicHttpUrl('https://8.8.8.8/');
});

test('awardPickemSeasonChampion: zero-point season grants nothing', async () => {
  const { createMagazineV3Db } = require('../src/monetization/magazineV3');
  const fakePool = {
    async query(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.includes('FROM pickem_picks')) {
        return { rows: [{ account_id: 1, points: 0 }] };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const db = createMagazineV3Db({ getPool: () => fakePool });
  const r = await db.awardPickemSeasonChampion(99);
  assert.strictEqual(r, null);
});
