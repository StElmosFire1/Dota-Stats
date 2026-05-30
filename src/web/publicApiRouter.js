const express = require('express');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');

// Task #415 — defaults for the v2 product. Per-key `rate_per_min` on the
// `api_keys` row overrides these when set. The anon limit is what the
// IP-scoped pre-auth limiter and the unauthenticated /status endpoint use.
const DEFAULTS = {
  anonPerMinute: 60,
  freePerMinute: 60,
  proPerMinute: 600,
};
const TIER_LIMITS = {
  free: { perMinute: DEFAULTS.freePerMinute, perDay: 1000 },
  pro:  { perMinute: DEFAULTS.proPerMinute, perDay: 50000 },
};

// Task #463 — billable rate-limit tiers. A key with an *active* quota
// subscription gets its per-minute ceiling (and a scaled daily cap) bumped to
// the purchased tier. Prices default here but a Stripe Dashboard-managed Price
// can be wired via STRIPE_API_QUOTA_<KEY>_PRICE_ID (see server.js). Currency is
// AUD to match the rest of the monetisation stack. priceCents is the monthly
// recurring charge used for the inline price_data fallback + the UI catalog.
const API_QUOTA_TIERS = {
  boost_2k: {
    id: 'boost_2k',
    label: '2,000 req/min',
    perMinute: 2000,
    perDay: 500000,
    priceCents: 2900,
    envPriceId: 'STRIPE_API_QUOTA_2K_PRICE_ID',
  },
  boost_10k: {
    id: 'boost_10k',
    label: '10,000 req/min',
    perMinute: 10000,
    perDay: 2000000,
    priceCents: 9900,
    envPriceId: 'STRIPE_API_QUOTA_10K_PRICE_ID',
  },
};

// A quota bump only counts when the subscription is healthy. We honour the
// 'past_due' grace window (Stripe is still retrying the card) but stop the
// moment the billing period has clearly lapsed, so a missed cancel webhook
// can't keep granting paid throughput forever. The cron sweep + webhook are
// the durable degrade paths; this is the per-request safety net.
function _quotaActive(keyRow) {
  const tier = keyRow?.api_quota_tier;
  if (!tier || !API_QUOTA_TIERS[tier]) return false;
  const status = keyRow.api_quota_status;
  if (status === 'cancelled' || status === 'pending') return false;
  const periodEnd = keyRow.api_quota_period_end ? new Date(keyRow.api_quota_period_end).getTime() : null;
  if (status !== 'active') {
    // past_due / unknown: keep serving only inside a ~26h grace past period end.
    if (periodEnd != null && Date.now() > periodEnd + 26 * 3600 * 1000) return false;
  }
  return true;
}

// Resolve the effective per-minute + per-day limits for a key. Precedence:
//   active billable quota  >  manual rate_per_min override  >  tier default.
function _effectiveLimits(keyRow, tier) {
  const tierLimits = TIER_LIMITS[tier];
  let perMinute = tierLimits.perMinute;
  let perDay = tierLimits.perDay;
  const override = Number(keyRow?.rate_per_min);
  if (Number.isFinite(override) && override > 0) perMinute = override;
  if (_quotaActive(keyRow)) {
    const q = API_QUOTA_TIERS[keyRow.api_quota_tier];
    perMinute = Math.max(perMinute, q.perMinute);
    perDay = Math.max(perDay, q.perDay);
  }
  return { perMinute, perDay };
}

// Task #415 — scope required to call each endpoint. Endpoints not listed
// here are key-but-scope-free (any non-revoked key works). The legacy
// `read` scope from Task #371 implies every `read:*` scope so older keys
// keep working unchanged.
const ENDPOINT_SCOPES = {
  'GET /matches': 'read:matches',
  'GET /matches/:matchId': 'read:matches',
  'GET /leaderboard': 'read:leaderboard',
  'GET /profile/:accountId': 'read:players',
  'GET /teams': 'read:teams',
  'GET /teams/:id': 'read:teams',
  'POST /webhooks': 'write:webhooks',
  'GET /webhooks': 'write:webhooks',
  'DELETE /webhooks/:id': 'write:webhooks',
};

function _hasScope(keyRow, required) {
  if (!required) return true;
  const scopes = Array.isArray(keyRow?.scopes) ? keyRow.scopes : [];
  if (scopes.includes(required)) return true;
  // Legacy wildcard: any `read:*` scope is satisfied by the catch-all `read`.
  if (required.startsWith('read:') && scopes.includes('read')) return true;
  return false;
}

function _stripInternalFields(match) {
  if (!match || typeof match !== 'object') return match;
  const {
    chat_log, chat_log_state, replay_path, replay_file_path,
    v3_modifiers, perf_breakdown, ...safe
  } = match;
  if (Array.isArray(safe.players)) {
    safe.players = safe.players.map((p) => {
      const { perf_breakdown, perf_explain, ...rest } = p || {};
      return rest;
    });
  }
  return safe;
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!_hasScope(req.apiKey, scope)) {
      return res.status(403).json({
        error: 'insufficient_scope',
        required_scope: scope,
        message: `This endpoint requires the "${scope}" scope. Grant it on your key in Settings → API & webhooks.`,
      });
    }
    next();
  };
}

// Task #415 — webhook management is a Pro-tier perk (matches the
// session-based /api/me/webhooks policy in server.js). Free-tier keys can
// hold the `write:webhooks` scope in principle but every webhook endpoint
// also requires the caller to be on a Pro key, so a downgraded account
// can't keep managing subscriptions through the API.
function requireProTier(req, res, next) {
  if (req.apiKeyTier !== 'pro') {
    return res.status(403).json({
      error: 'pro_required',
      message: 'Webhook management is a Pro perk. Upgrade your account or use a Pro-tier key.',
    });
  }
  next();
}

async function _requireApiKey(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    const flag = await db.getFeatureFlag('public_api').catch(() => null);
    const enabled = flag && (flag.state === 'on' || flag.state === 'preview');
    if (!enabled) {
      return res.status(503).json({
        error: 'public_api_disabled',
        message: 'The public API is not enabled on this deployment.',
      });
    }

    const auth = req.headers.authorization || '';
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(auth);
    const headerKey = req.headers['x-api-key'];
    const tokenStr = (bearerMatch ? bearerMatch[1] : headerKey) || '';
    const token = String(tokenStr).trim();
    if (!token) {
      return res.status(401).json({
        error: 'missing_api_key',
        message: 'Provide an API key via the Authorization: Bearer <key> header or x-api-key.',
      });
    }
    const keyRow = await db.findApiKeyByToken(token);
    if (!keyRow || keyRow.revoked_at) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }
    if (flag.state === 'preview' && !keyRow.is_owner_superuser) {
      return res.status(503).json({
        error: 'public_api_preview',
        message: 'Public API is in preview — coming soon.',
      });
    }
    const tier = keyRow.tier === 'pro' ? 'pro' : 'free';
    // Task #463 — effective limits fold in any active billable quota bump.
    const { perMinute, perDay } = _effectiveLimits(keyRow, tier);

    const now = Date.now();
    const minuteBucket = Math.floor(now / 60_000);
    const dayBucket = new Date(now).toISOString().slice(0, 10);
    const minuteKey = `m:${keyRow.id}:${minuteBucket}`;
    const dayKey = `d:${keyRow.id}:${dayBucket}`;
    const counters = _requireApiKey._counters;
    for (const [k, v] of counters) {
      if (v.expires < now) counters.delete(k);
    }
    let mBucket = counters.get(minuteKey);
    if (!mBucket) {
      mBucket = { count: 0, expires: now + 65_000 };
      counters.set(minuteKey, mBucket);
    }
    let dBucket = counters.get(dayKey);
    if (!dBucket) {
      const tomorrow = Date.UTC(
        new Date(now).getUTCFullYear(),
        new Date(now).getUTCMonth(),
        new Date(now).getUTCDate() + 1,
      );
      dBucket = { count: 0, expires: tomorrow + 5_000 };
      counters.set(dayKey, dBucket);
    }
    mBucket.count += 1;
    dBucket.count += 1;
    // Task #463 — accumulate the durable monthly counter in-process; a periodic
    // flusher rolls the deltas into api_key_usage_monthly so the Settings tile
    // and quota-overage analytics survive restarts without a DB write per call.
    const monthBucket = new Date(now).toISOString().slice(0, 7); // YYYY-MM (UTC)
    const monthKey = `${keyRow.id}:${monthBucket}`;
    _requireApiKey._monthly.set(monthKey, (_requireApiKey._monthly.get(monthKey) || 0) + 1);
    res.set('X-RateLimit-Limit', String(perMinute));
    res.set('X-RateLimit-Remaining', String(Math.max(0, perMinute - mBucket.count)));
    res.set('X-RateLimit-Tier', tier);
    res.set('X-RateLimit-Daily-Limit', String(perDay));
    res.set('X-RateLimit-Daily-Remaining', String(Math.max(0, perDay - dBucket.count)));
    if (mBucket.count > perMinute) {
      return res.status(429).json({
        error: 'rate_limited',
        scope: 'per_minute',
        message: `Per-minute limit (${perMinute}) exceeded for key.`,
        retry_after_seconds: 60 - (Math.floor(now / 1000) % 60),
      });
    }
    if (dBucket.count > perDay) {
      const msToEod = Math.max(1, Math.ceil((dBucket.expires - now) / 1000));
      return res.status(429).json({
        error: 'rate_limited',
        scope: 'per_day',
        message: `Daily limit (${perDay}) exceeded for tier "${tier}".`,
        retry_after_seconds: msToEod,
      });
    }

    db.touchApiKeyUsage(keyRow.id).catch(() => {});

    req.apiKey = keyRow;
    req.apiKeyTier = tier;
    next();
  } catch (err) {
    console.error('[v1] auth error:', err.message);
    res.status(500).json({ error: 'auth_error' });
  }
}
_requireApiKey._counters = new Map();
// Task #463 — pending (un-flushed) monthly request deltas. `${keyId}:${YYYY-MM}` -> count.
_requireApiKey._monthly = new Map();

// Drain the in-process monthly accumulator into api_key_usage_monthly. Snapshots
// then clears the pending map so concurrent requests keep counting cleanly; on a
// DB write failure the un-written delta is folded back in so nothing is lost.
let _flushInFlight = false;
async function flushMonthlyUsage() {
  if (_flushInFlight) return;
  _flushInFlight = true;
  const pending = _requireApiKey._monthly;
  _requireApiKey._monthly = new Map();
  try {
    for (const [monthKey, count] of pending) {
      if (!count) continue;
      const idx = monthKey.lastIndexOf(':');
      const keyId = monthKey.slice(0, idx);
      const month = monthKey.slice(idx + 1);
      try {
        await db.incrementApiKeyMonthlyUsage(keyId, month, count);
      } catch (err) {
        // Re-queue the delta for the next flush attempt.
        _requireApiKey._monthly.set(monthKey, (_requireApiKey._monthly.get(monthKey) || 0) + count);
      }
    }
  } finally {
    _flushInFlight = false;
  }
}

// Start the periodic flusher exactly once per process. Mounted from
// createPublicApiRouter so it only runs when the public API is actually wired up.
let _flusherTimer = null;
function startMonthlyUsageFlusher(intervalMs = 60_000) {
  if (_flusherTimer) return _flusherTimer;
  _flusherTimer = setInterval(() => { flushMonthlyUsage().catch(() => {}); }, intervalMs);
  if (_flusherTimer.unref) _flusherTimer.unref();
  return _flusherTimer;
}

function createPublicApiRouter() {
  startMonthlyUsageFlusher();
  const router = express.Router();

  router.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type');
    res.set('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  // Task #415 — IP-scoped anon limiter (default 60/min). Applied only to
  // unauthenticated surface (`/status`) so it can't shadow the per-key
  // limit on keyed `/v1/*` traffic — Pro keys need to be able to burst at
  // 600+/min from a single integration host.
  const ipLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: DEFAULTS.anonPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'ip_rate_limited' },
  });

  router.get('/status', ipLimiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const flag = await db.getFeatureFlag('public_api').catch(() => null);
    res.json({
      ok: true,
      version: 'v1',
      product_version: 'v2',
      state: flag?.state || 'off',
      events: db.listKnownWebhookEvents(),
      scopes: db.listKnownApiScopes(),
      defaults: {
        anon_per_minute: DEFAULTS.anonPerMinute,
        free_per_minute: DEFAULTS.freePerMinute,
        pro_per_minute: DEFAULTS.proPerMinute,
      },
      docs: '/developers',
    });
  });

  router.use(_requireApiKey);

  router.get('/me', (req, res) => {
    const k = req.apiKey;
    const { perMinute, perDay } = _effectiveLimits(k, req.apiKeyTier);
    const quotaActive = _quotaActive(k);
    res.json({
      key_id: k.id,
      label: k.label,
      tier: req.apiKeyTier,
      account_id: k.account_id,
      scopes: k.scopes || [],
      rate_per_min: k.rate_per_min ?? null,
      quota_tier: quotaActive ? k.api_quota_tier : null,
      effective_per_minute: perMinute,
      effective_per_day: perDay,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
    });
  });

  router.get('/matches', requireScope(ENDPOINT_SCOPES['GET /matches']), async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const seasonId = req.query.season_id ? parseInt(req.query.season_id, 10) : null;
      const [matches, total] = await Promise.all([
        db.getMatches(limit, offset, seasonId),
        db.getMatchCount(seasonId),
      ]);
      res.json({
        matches: matches.map((m) => ({
          match_id: m.match_id,
          season_id: m.season_id,
          radiant_win: m.radiant_win,
          duration: m.duration,
          start_time: m.start_time,
          recorded_at: m.recorded_at,
          patch: m.patch,
          lobby_name: m.lobby_name,
        })),
        total,
        limit,
        offset,
      });
    } catch (err) {
      console.error('[v1] /matches error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/matches/:matchId', requireScope(ENDPOINT_SCOPES['GET /matches/:matchId']), async (req, res) => {
    try {
      const m = await db.getMatch(req.params.matchId);
      if (!m) return res.status(404).json({ error: 'not_found' });
      res.json(_stripInternalFields(m));
    } catch (err) {
      console.error('[v1] /matches/:id error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/leaderboard', requireScope(ENDPOINT_SCOPES['GET /leaderboard']), async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const seasonId = req.query.season_id ? parseInt(req.query.season_id, 10) : null;
      let rows = [];
      try {
        rows = await db.getComputedLeaderboard(seasonId);
      } catch (_) {
        rows = await db.getLeaderboard(limit);
      }
      const trimmed = (rows || []).slice(0, limit).map((r) => ({
        account_id: r.account_id,
        display_name: r.display_name || r.nickname || null,
        mmr: r.mmr ?? r.rating ?? null,
        wins: r.wins ?? null,
        losses: r.losses ?? null,
        games: r.games ?? r.games_played ?? null,
      }));
      res.json({ leaderboard: trimmed, season_id: seasonId, limit });
    } catch (err) {
      console.error('[v1] /leaderboard error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/profile/:accountId', requireScope(ENDPOINT_SCOPES['GET /profile/:accountId']), async (req, res) => {
    try {
      const accountId = String(req.params.accountId).replace(/[^0-9]/g, '');
      if (!accountId) return res.status(400).json({ error: 'invalid_account_id' });
      if (await db.isAccountHidden(accountId).catch(() => false)) {
        return res.status(404).json({ error: 'not_found' });
      }
      const [nickname, rating, stats] = await Promise.all([
        db.getNickname(accountId).catch(() => null),
        db.getPlayerRating(accountId).catch(() => null),
        db.getPlayerStats(accountId).catch(() => null),
      ]);
      if (!nickname && !rating && !stats) {
        return res.status(404).json({ error: 'not_found' });
      }
      res.json({
        account_id: accountId,
        display_name: nickname?.display_name || nickname?.nickname || null,
        rating: rating ? {
          mmr: rating.mmr,
          mu: rating.mu,
          sigma: rating.sigma,
          rank_tier: rating.rank_tier ?? null,
        } : null,
        stats: stats ? {
          games: stats.games_played ?? stats.games ?? null,
          wins: stats.wins ?? null,
          losses: stats.losses ?? null,
          perf: stats.perf ?? null,
        } : null,
      });
    } catch (err) {
      console.error('[v1] /profile error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/inhouse/status', async (req, res) => {
    try {
      const active = await db.getActiveInhouseSession();
      res.json({
        active: !!active,
        session: active ? {
          id: active.id,
          state: active.state,
          captain_radiant: active.captain_radiant || null,
          captain_dire: active.captain_dire || null,
          created_at: active.created_at,
          updated_at: active.updated_at,
          players: Array.isArray(active.players) ? active.players.length : null,
        } : null,
      });
    } catch (err) {
      console.error('[v1] /inhouse/status error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/tournaments', async (req, res) => {
    try {
      const seasonId = req.query.season_id ? parseInt(req.query.season_id, 10) : null;
      const list = await db.getTournaments(seasonId);
      res.json({
        tournaments: (list || []).map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description || null,
          status: t.status,
          format: t.format,
          season_id: t.season_id || null,
          start_date: t.start_date || null,
          end_date: t.end_date || null,
          buy_in_cents: t.buy_in_cents ?? null,
          prize_pool_cents: t.prize_pool_cents ?? null,
          max_participants: t.max_participants ?? null,
        })),
      });
    } catch (err) {
      console.error('[v1] /tournaments error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/tournaments/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
      const [t, matches, participants] = await Promise.all([
        db.getTournamentById(id),
        db.getTournamentMatches(id).catch(() => []),
        db.getTournamentParticipants(id).catch(() => []),
      ]);
      if (!t) return res.status(404).json({ error: 'not_found' });
      res.json({
        id: t.id,
        name: t.name,
        description: t.description || null,
        status: t.status,
        format: t.format,
        season_id: t.season_id || null,
        start_date: t.start_date || null,
        end_date: t.end_date || null,
        buy_in_cents: t.buy_in_cents ?? null,
        prize_pool_cents: t.prize_pool_cents ?? null,
        max_participants: t.max_participants ?? null,
        participants: (participants || []).map((p) => ({
          account_id: p.account_id,
          display_name: p.display_name || p.nickname || null,
          seed: p.seed ?? null,
        })),
        matches: (matches || []).map((m) => ({
          id: m.id,
          bracket: m.bracket,
          round: m.round,
          slot: m.slot,
          p1_account_id: m.p1_id || m.player1_id || null,
          p2_account_id: m.p2_id || m.player2_id || null,
          winner_account_id: m.winner_id || null,
          inhouse_match_id: m.inhouse_match_id || null,
        })),
      });
    } catch (err) {
      console.error('[v1] /tournaments/:id error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/coaches', async (req, res) => {
    try {
      const list = await db.listActiveCoaches();
      res.json({
        coaches: (list || []).map((c) => ({
          id: c.id,
          account_id: c.account_id,
          display_name: c.display_name || null,
          headline: c.headline || null,
          rate_cents: c.rate_cents ?? c.hourly_rate_cents ?? null,
          languages: c.languages || null,
          accepting_bookings: c.accepting_bookings !== false,
        })),
      });
    } catch (err) {
      console.error('[v1] /coaches error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/coaches/:id/availability', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
      const slots = await db.getCoachAvailability(id);
      res.json({ coach_id: id, slots: slots || [] });
    } catch (err) {
      console.error('[v1] /coaches/:id/availability error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  // Task #415 — teams listing for the `read:teams` scope.
  router.get('/teams', requireScope(ENDPOINT_SCOPES['GET /teams']), async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const list = await db.listTeams({ limit });
      res.json({
        teams: (list || []).map((t) => ({
          id: t.id,
          name: t.name,
          tag: t.tag || null,
          owner_account_id: t.owner_account_id || null,
          member_count: t.member_count ?? null,
          created_at: t.created_at,
        })),
        limit,
      });
    } catch (err) {
      console.error('[v1] /teams error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/teams/:id', requireScope(ENDPOINT_SCOPES['GET /teams/:id']), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
      const [team, members] = await Promise.all([
        db.getTeamById(id),
        db.getTeamMembers(id).catch(() => []),
      ]);
      if (!team) return res.status(404).json({ error: 'not_found' });
      res.json({
        id: team.id,
        name: team.name,
        tag: team.tag || null,
        owner_account_id: team.owner_account_id || null,
        created_at: team.created_at,
        members: (members || []).map((m) => ({
          account_id: m.account_id,
          display_name: m.nickname || null,
          role: m.role,
          joined_at: m.joined_at,
        })),
      });
    } catch (err) {
      console.error('[v1] /teams/:id error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  // Task #415 — programmatic webhook management for `write:webhooks` keys.
  // Bound to the key's owning account so a key can only manage that owner's
  // subscriptions.
  router.get('/webhooks', requireScope(ENDPOINT_SCOPES['GET /webhooks']), requireProTier, async (req, res) => {
    try {
      const subs = await db.listWebhookSubscriptionsForAccount(req.apiKey.account_id);
      res.json({
        subscriptions: subs.map((s) => ({
          id: s.id, url: s.url, events: s.events, active: s.active,
          created_at: s.created_at, secret: s.secret,
        })),
      });
    } catch (err) {
      console.error('[v1] /webhooks list error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.post('/webhooks', express.json(), requireScope(ENDPOINT_SCOPES['POST /webhooks']), requireProTier, async (req, res) => {
    try {
      const url = (req.body?.url || '').toString().trim();
      const events = Array.isArray(req.body?.events) ? req.body.events : [];
      const { validateWebhookUrlSync, assertSafeAtDispatch } = require('./webhookUrlGuard');
      const sync = validateWebhookUrlSync(url);
      if (!sync.ok) return res.status(400).json({ error: 'invalid_url', message: sync.error });
      const dnsCheck = await assertSafeAtDispatch(url);
      if (!dnsCheck.ok) return res.status(400).json({ error: 'invalid_url', message: dnsCheck.error });
      const sub = await db.createWebhookSubscription({
        accountId: req.apiKey.account_id, url, events,
      });
      res.status(201).json(sub);
    } catch (err) {
      console.error('[v1] /webhooks create error:', err.message);
      res.status(400).json({ error: 'create_failed', message: err.message });
    }
  });

  router.delete('/webhooks/:id', requireScope(ENDPOINT_SCOPES['DELETE /webhooks/:id']), requireProTier, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
      const ok = await db.deleteWebhookSubscription({ accountId: req.apiKey.account_id, id });
      if (!ok) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('[v1] /webhooks delete error:', err.message);
      res.status(500).json({ error: 'delete_failed' });
    }
  });

  router.use((req, res) => {
    res.status(404).json({
      error: 'unknown_endpoint',
      message: `No public API endpoint at ${req.method} ${req.originalUrl}.`,
      docs: '/developers',
    });
  });

  return router;
}

module.exports = {
  createPublicApiRouter,
  TIER_LIMITS,
  DEFAULTS,
  ENDPOINT_SCOPES,
  API_QUOTA_TIERS,
  flushMonthlyUsage,
  startMonthlyUsageFlusher,
  _effectiveLimits,
  _quotaActive,
};
