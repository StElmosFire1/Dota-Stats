const express = require('express');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');

const TIER_LIMITS = {
  free: { perMinute: 30, perDay: 1000 },
  pro:  { perMinute: 120, perDay: 50000 },
};

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
    // In preview mode, only superuser-owned keys may call. (Owner-only dogfood.)
    if (flag.state === 'preview' && !keyRow.is_owner_superuser) {
      return res.status(503).json({
        error: 'public_api_preview',
        message: 'Public API is in preview — coming soon.',
      });
    }
    const tier = keyRow.tier === 'pro' ? 'pro' : 'free';
    const limits = TIER_LIMITS[tier];

    // Per-key, per-minute counter (in-process, best-effort).
    const now = Date.now();
    const minuteBucket = Math.floor(now / 60_000);
    const dayBucket = new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const minuteKey = `m:${keyRow.id}:${minuteBucket}`;
    const dayKey = `d:${keyRow.id}:${dayBucket}`;
    const counters = _requireApiKey._counters;
    // GC old buckets opportunistically.
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
      // Expire shortly after end-of-UTC-day.
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
    res.set('X-RateLimit-Limit', String(limits.perMinute));
    res.set('X-RateLimit-Remaining', String(Math.max(0, limits.perMinute - mBucket.count)));
    res.set('X-RateLimit-Tier', tier);
    res.set('X-RateLimit-Daily-Limit', String(limits.perDay));
    res.set('X-RateLimit-Daily-Remaining', String(Math.max(0, limits.perDay - dBucket.count)));
    if (mBucket.count > limits.perMinute) {
      return res.status(429).json({
        error: 'rate_limited',
        scope: 'per_minute',
        message: `Per-minute limit (${limits.perMinute}) exceeded for tier "${tier}".`,
        retry_after_seconds: 60 - (Math.floor(now / 1000) % 60),
      });
    }
    if (dBucket.count > limits.perDay) {
      const msToEod = Math.max(1, Math.ceil((dBucket.expires - now) / 1000));
      return res.status(429).json({
        error: 'rate_limited',
        scope: 'per_day',
        message: `Daily limit (${limits.perDay}) exceeded for tier "${tier}".`,
        retry_after_seconds: msToEod,
      });
    }

    // Cumulative usage counter is persisted on the key row (best-effort).
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

function createPublicApiRouter() {
  const router = express.Router();

  // CORS is intentionally permissive for the public API surface.
  router.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, X-API-Key, Content-Type');
    res.set('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  // Coarse anti-abuse limiter applied before key lookup, by IP.
  const ipLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'ip_rate_limited' },
  });
  router.use(ipLimiter);

  // Status endpoint — unauthenticated so integrators can check availability.
  router.get('/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const flag = await db.getFeatureFlag('public_api').catch(() => null);
    res.json({
      ok: true,
      version: 'v1',
      state: flag?.state || 'off',
      events: ['match.ended', 'lobby.full', 'tournament.round_started', 'coaching.booked'],
      docs: '/api-docs',
    });
  });

  router.use(_requireApiKey);

  router.get('/me', (req, res) => {
    const k = req.apiKey;
    res.json({
      key_id: k.id,
      label: k.label,
      tier: req.apiKeyTier,
      account_id: k.account_id,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
    });
  });

  router.get('/matches', async (req, res) => {
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

  router.get('/matches/:matchId', async (req, res) => {
    try {
      const m = await db.getMatch(req.params.matchId);
      if (!m) return res.status(404).json({ error: 'not_found' });
      res.json(_stripInternalFields(m));
    } catch (err) {
      console.error('[v1] /matches/:id error:', err.message);
      res.status(500).json({ error: 'fetch_failed' });
    }
  });

  router.get('/leaderboard', async (req, res) => {
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

  router.get('/profile/:accountId', async (req, res) => {
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

  router.use((req, res) => {
    res.status(404).json({
      error: 'unknown_endpoint',
      message: `No public API endpoint at ${req.method} ${req.originalUrl}.`,
      docs: '/api-docs',
    });
  });

  return router;
}

module.exports = { createPublicApiRouter, TIER_LIMITS };
