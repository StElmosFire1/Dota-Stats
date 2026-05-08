/**
 * Magazine v3 monetization features (Task #157).
 *
 * Bundles 8 features that share Pro-tier infrastructure but are otherwise
 * independent. Lives in one module to keep the diff against the giant
 * `src/web/server.js` and `src/db/index.js` minimal.
 *
 *  1. Replay download paywall hardening + per-user rate limit
 *  2. Weekly AI report (Groq, 7-day cache)
 *  3. AI coach pairing (recommendations)
 *  4. Org sponsorship slots (subscription, accept-then-show, moderation)
 *  5. Pro embed widget at /embed/:accountId
 *  6. Pickem season + leaderboard
 *  7. Verified badge (Stripe one-off + OAuth handles)
 *  8. One-off entitlements infra (`user_one_off_perks`)
 *
 * Server-side authorization on every mutating route. The Stripe webhook
 * handler in `src/web/server.js` dispatches new `purpose` values to the
 * `handleStripeWebhookPurpose()` function exported here.
 */

const VERIFIED_BADGE_PRICE_CENTS = 500; // AUD $5 one-off
const SPONSORSHIP_MONTHLY_PRICE_CENTS = 1900; // AUD $19/month per slot
// Round-4 review: how much of each monthly invoice is routed to the
// sponsored player when they have Stripe Connect Express set up. Expressed
// as basis points (7000 = 70%) so the math stays integer-clean. The
// remainder stays with the platform as `application_fee_percent`. Reused
// by /api/sponsorships/checkout's destination-charge plumbing.
const SPONSORSHIP_REVSHARE_BPS = 7000;

// SECURITY (Task #157 round-4 review): sponsorship link_url is rendered
// publicly as a clickable <a href=...>. Without protocol validation a
// sponsor could store `javascript:alert(1)` (or `data:`/`vbscript:` etc.)
// and turn an approved chip into an XSS/phishing primitive on the
// target's profile page. Reject anything that isn't an absolute http/https
// URL at write time. SponsorChip.jsx applies the same check at render
// time as defence-in-depth. Also reused by the verified-badge code-challenge
// proof flow to validate user-supplied profile URLs before fetch.
function _isSafeHttpUrl(s) {
  if (typeof s !== 'string') return false;
  if (s.length > 2048) return false;
  let u;
  try { u = new URL(s); } catch { return false; }
  return u.protocol === 'http:' || u.protocol === 'https:';
}

// SSRF guard for outbound fetches (round-5 review). Resolves the hostname
// via DNS and refuses any IP in a loopback / link-local / private / CGNAT /
// reserved range. Throws on rejection so callers can `try/catch` and surface
// a 4xx without leaking internal addresses.
function _isPrivateIp(ip) {
  if (typeof ip !== 'string') return true;
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('::ffff:')) return _isPrivateIp(lower.slice(7));
    return false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  if (p[0] === 10) return true;
  if (p[0] === 127) return true;
  if (p[0] === 0) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  if (p[0] >= 224) return true; // multicast + reserved
  return false;
}
async function _assertPublicHttpUrl(rawUrl) {
  if (!_isSafeHttpUrl(rawUrl)) throw new Error('URL must be absolute http(s)');
  const u = new URL(rawUrl);
  const host = u.hostname;
  if (!host) throw new Error('URL has no host');
  // Reject string-form private hosts too (some envs short-circuit DNS).
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.internal') ||
      lower.endsWith('.local') || lower === 'metadata.google.internal') {
    throw new Error('host points to a private network');
  }
  const dns = require('dns').promises;
  let addrs;
  try { addrs = await dns.lookup(host, { all: true, verbatim: true }); }
  catch (e) { throw new Error('host did not resolve'); }
  if (!addrs.length) throw new Error('host did not resolve');
  for (const a of addrs) {
    if (_isPrivateIp(a.address)) throw new Error('host resolves to a private network');
  }
}
const REPLAY_RATE_LIMIT_PER_DAY = 25; // even Pro users are bounded
const WEEKLY_REPORT_CACHE_HOURS = 24 * 7;
const ALLOWED_VERIFIED_PROVIDERS = new Set(['twitter', 'twitch', 'youtube']);

// =============================================================================
// SCHEMA — idempotent CREATE TABLE / ALTER TABLE statements.
// Mirrors the pattern used throughout init() in src/db/index.js.
// =============================================================================
async function applyMagazineV3Schema(pool) {
  const p = pool;

  // 8 — One-off entitlements (used by verified badges and any future one-off).
  await p.query(`
    CREATE TABLE IF NOT EXISTS user_one_off_perks (
      id SERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL,
      perk_key TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'stripe',
      stripe_session_id TEXT,
      stripe_payment_intent TEXT,
      amount_cents INTEGER,
      currency TEXT,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      metadata JSONB
    )
  `);
  await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_one_off_perks_session
                   ON user_one_off_perks(stripe_session_id)
                   WHERE stripe_session_id IS NOT NULL`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_user_one_off_perks_account
                   ON user_one_off_perks(account_id)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_user_one_off_perks_active
                   ON user_one_off_perks(account_id, perk_key)
                   WHERE revoked_at IS NULL`);

  // 5 — Embed referral log (where embed views came from — used by the
  // `/embed/:slug?ref=…` Pro widget for click attribution).
  await p.query(`
    CREATE TABLE IF NOT EXISTS embed_referral_log (
      id SERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL,
      ref TEXT NOT NULL,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_embed_referral_log_account_ts
                   ON embed_referral_log(account_id, ts DESC)`);

  // 1 — Replay download audit log (per-account daily counter).
  await p.query(`
    CREATE TABLE IF NOT EXISTS replay_download_log (
      id SERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL,
      match_id TEXT NOT NULL,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      bytes BIGINT
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_replay_download_log_account_ts
                   ON replay_download_log(account_id, ts DESC)`);

  // 2 — Weekly AI reports (one per account per ISO week, cached 7 days).
  await p.query(`
    CREATE TABLE IF NOT EXISTS weekly_ai_reports (
      id SERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL,
      week_start DATE NOT NULL,
      content_md TEXT NOT NULL,
      stats JSONB,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id, week_start)
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_weekly_ai_reports_account_week
                   ON weekly_ai_reports(account_id, week_start DESC)`);

  // 4 — Org sponsorship slots.
  await p.query(`
    CREATE TABLE IF NOT EXISTS org_sponsorships (
      id SERIAL PRIMARY KEY,
      sponsor_account_id BIGINT NOT NULL,
      target_account_id BIGINT NOT NULL,
      slot_type TEXT NOT NULL DEFAULT 'profile_chip',
      headline TEXT NOT NULL,
      body_md TEXT,
      image_url TEXT,
      link_url TEXT,
      stripe_subscription_id TEXT,
      stripe_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      moderated_by BIGINT,
      moderated_at TIMESTAMPTZ,
      moderation_notes TEXT,
      accepted_at TIMESTAMPTZ,
      activated_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_org_sponsorships_target_active
                   ON org_sponsorships(target_account_id)
                   WHERE status = 'active'`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_org_sponsorships_status
                   ON org_sponsorships(status)`);
  await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_sponsorships_session
                   ON org_sponsorships(stripe_session_id)
                   WHERE stripe_session_id IS NOT NULL`);

  // 6 — Pickem.
  await p.query(`
    CREATE TABLE IF NOT EXISTS pickem_seasons (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      lock_minutes_before INT NOT NULL DEFAULT 15,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS pickem_picks (
      id SERIAL PRIMARY KEY,
      season_id INT NOT NULL REFERENCES pickem_seasons(id) ON DELETE CASCADE,
      account_id BIGINT NOT NULL,
      match_ref TEXT NOT NULL,
      picked_winner TEXT NOT NULL,
      points_awarded INT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(season_id, account_id, match_ref)
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_pickem_picks_season_account
                   ON pickem_picks(season_id, account_id)`);
  // Round-8: optional prediction dimensions in addition to picked_winner.
  // Each is nullable — submitting just `picked_winner` is still valid.
  //   picked_first_blood          : 'radiant' | 'dire'   (+5 pts)
  //   picked_total_kills_bucket   : 'under' | 'over'     (boundary 50, +5 pts)
  //   picked_duration_tier        : 'short' | 'medium' | 'long'
  //                                 (short <30m, medium 30-45m, long >45m, +5 pts)
  // Resolution stores actual values + per-dimension awarded points.
  await p.query(`ALTER TABLE pickem_picks
                   ADD COLUMN IF NOT EXISTS picked_first_blood TEXT,
                   ADD COLUMN IF NOT EXISTS picked_total_kills_bucket TEXT,
                   ADD COLUMN IF NOT EXISTS picked_duration_tier TEXT,
                   ADD COLUMN IF NOT EXISTS points_first_blood INT,
                   ADD COLUMN IF NOT EXISTS points_total_kills INT,
                   ADD COLUMN IF NOT EXISTS points_duration_tier INT,
                   ADD COLUMN IF NOT EXISTS actual_first_blood TEXT,
                   ADD COLUMN IF NOT EXISTS actual_total_kills_bucket TEXT,
                   ADD COLUMN IF NOT EXISTS actual_duration_tier TEXT`);

  // 7 — Verified badges.
  await p.query(`
    CREATE TABLE IF NOT EXISTS verified_badges (
      id SERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL,
      provider TEXT NOT NULL,
      handle TEXT NOT NULL,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      source TEXT NOT NULL DEFAULT 'oauth',
      one_off_perk_id INT REFERENCES user_one_off_perks(id) ON DELETE SET NULL,
      revoked_at TIMESTAMPTZ,
      UNIQUE(account_id, provider)
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_verified_badges_account
                   ON verified_badges(account_id)
                   WHERE revoked_at IS NULL`);
  // Verified badges: status column added in review fix so paid checkout
  // can record a 'pending' row that does NOT show as verified until an
  // operator (or OAuth callback) approves it.
  await p.query(`ALTER TABLE verified_badges
                   ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'verified'`);
  await p.query(`ALTER TABLE verified_badges
                   ADD COLUMN IF NOT EXISTS approved_by BIGINT`);
  await p.query(`ALTER TABLE verified_badges
                   ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_verified_badges_status
                   ON verified_badges(status)`);

  // Verified badge — challenge-code proof flow (Task #157 round-4 review).
  // OAuth providers are still 503 until per-provider env vars exist; this
  // table is the no-OAuth-needed alternative. The user requests a one-time
  // code, posts it on their public profile (Steam/Twitter/Twitch/YT), then
  // the server fetches that public URL and looks for the code substring. On
  // success we promote the pending verified_badges row to status='verified'.
  await p.query(`
    CREATE TABLE IF NOT EXISTS verified_badge_challenges (
      id SERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL,
      provider TEXT NOT NULL,
      handle TEXT NOT NULL,
      proof_url TEXT NOT NULL,
      challenge_code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts_count INT NOT NULL DEFAULT 0,
      last_attempt_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      UNIQUE(account_id, provider)
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_vbc_account
                   ON verified_badge_challenges(account_id)`);

  // Round-4 review: weekly report contract requires email delivery + opt-in.
  // Steam OpenID does not return email, so the user has to provide one.
  // Stored in a dedicated table to avoid colliding with future user schemas.
  await p.query(`
    CREATE TABLE IF NOT EXISTS magv3_user_emails (
      account_id BIGINT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Org sponsor onboarding queue (Task #157 review fix). Distinct from
  // org_sponsorships (which is per-target slot purchase). Sponsors must
  // first be approved as an organisation before they can buy slots.
  await p.query(`
    CREATE TABLE IF NOT EXISTS org_sponsors (
      id SERIAL PRIMARY KEY,
      owner_account_id BIGINT NOT NULL,
      org_name TEXT NOT NULL,
      website TEXT,
      contact_email TEXT,
      description TEXT,
      stripe_connect_account_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending_review',
      moderated_by BIGINT,
      moderated_at TIMESTAMPTZ,
      moderation_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_org_sponsors_owner
                   ON org_sponsors(owner_account_id)`);
  await p.query(`CREATE INDEX IF NOT EXISTS idx_org_sponsors_status
                   ON org_sponsors(status)`);
}

// =============================================================================
// DB HELPERS
// =============================================================================
function createMagazineV3Db({ getPool }) {
  // ---- 8: one-off perks ----
  async function grantOneOffPerk({ accountId, perkKey, source = 'stripe', stripeSessionId = null, stripePaymentIntent = null, amountCents = null, currency = null, expiresAt = null, metadata = null }) {
    if (!accountId) throw new Error('grantOneOffPerk: accountId required');
    if (!perkKey) throw new Error('grantOneOffPerk: perkKey required');
    const p = getPool();
    // SECURITY (Task #157 round-3 review): if a pending row already exists
    // for this Stripe session (created by createOneOffPerkPending pre-checkout),
    // the webhook ACTIVATES it by clearing revoked_at and stamping the real
    // payment intent. This is the ONLY path that flips a perk from pending to
    // active — pre-webhook code never grants access.
    if (stripeSessionId) {
      const existing = await p.query(
        `SELECT * FROM user_one_off_perks WHERE stripe_session_id = $1 LIMIT 1`,
        [stripeSessionId]
      );
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (row.revoked_at !== null) {
          // Activate the pending row.
          const upd = await p.query(
            `UPDATE user_one_off_perks
                SET revoked_at = NULL,
                    source = $2,
                    stripe_payment_intent = COALESCE($3, stripe_payment_intent),
                    amount_cents = COALESCE($4, amount_cents),
                    currency = COALESCE($5, currency),
                    expires_at = COALESCE($6, expires_at),
                    metadata = COALESCE($7::jsonb, metadata),
                    granted_at = NOW()
              WHERE id = $1
              RETURNING *`,
            [row.id, source, stripePaymentIntent, amountCents, currency,
             expiresAt, metadata ? JSON.stringify(metadata) : null]
          );
          return upd.rows[0];
        }
        return row; // already active — idempotent
      }
    }
    const r = await p.query(
      `INSERT INTO user_one_off_perks
        (account_id, perk_key, source, stripe_session_id, stripe_payment_intent,
         amount_cents, currency, expires_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [accountId, perkKey, source, stripeSessionId, stripePaymentIntent,
       amountCents, currency, expiresAt, metadata ? JSON.stringify(metadata) : null]
    );
    return r.rows[0];
  }

  async function hasOneOffPerk(accountId, perkKey) {
    if (!accountId || !perkKey) return false;
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM user_one_off_perks
        WHERE account_id = $1 AND perk_key = $2
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`,
      [accountId, perkKey]
    );
    return r.rows.length > 0;
  }

  async function listOneOffPerks(accountId) {
    if (!accountId) return [];
    const p = getPool();
    const r = await p.query(
      `SELECT id, perk_key, source, granted_at, expires_at, amount_cents, currency, metadata
         FROM user_one_off_perks
        WHERE account_id = $1 AND revoked_at IS NULL
        ORDER BY granted_at DESC`,
      [accountId]
    );
    return r.rows;
  }

  async function createOneOffPerkPending({ accountId, perkKey, stripeSessionId, amountCents, currency, metadata }) {
    // SECURITY (Task #157 round-3 review): pre-checkout intent record. Inserts
    // a row with revoked_at = NOW() so hasOneOffPerk() returns false until the
    // verified Stripe webhook calls grantOneOffPerk() with the same session_id,
    // which clears revoked_at. This is the idempotency anchor for the webhook
    // and the audit trail for the checkout, but it grants nothing on its own.
    if (!accountId) throw new Error('createOneOffPerkPending: accountId required');
    if (!perkKey) throw new Error('createOneOffPerkPending: perkKey required');
    if (!stripeSessionId) throw new Error('createOneOffPerkPending: stripeSessionId required');
    const p = getPool();
    const existing = await p.query(
      `SELECT * FROM user_one_off_perks WHERE stripe_session_id = $1 LIMIT 1`,
      [stripeSessionId]
    );
    if (existing.rows.length) return existing.rows[0];
    const r = await p.query(
      `INSERT INTO user_one_off_perks
        (account_id, perk_key, source, stripe_session_id,
         amount_cents, currency, metadata, revoked_at)
       VALUES ($1,$2,'stripe_pending',$3,$4,$5,$6, NOW())
       RETURNING *`,
      [accountId, perkKey, stripeSessionId, amountCents, currency,
       metadata ? JSON.stringify(metadata) : null]
    );
    return r.rows[0];
  }

  // ---- 1: replay rate limit ----
  async function logReplayDownload(accountId, matchId, bytes = null) {
    if (!accountId) return;
    const p = getPool();
    await p.query(
      `INSERT INTO replay_download_log (account_id, match_id, bytes) VALUES ($1,$2,$3)`,
      [accountId, String(matchId), bytes]
    );
  }

  async function countReplayDownloadsLast24h(accountId) {
    if (!accountId) return 0;
    const p = getPool();
    const r = await p.query(
      `SELECT COUNT(*)::int AS c
         FROM replay_download_log
        WHERE account_id = $1 AND ts > NOW() - INTERVAL '24 hours'`,
      [accountId]
    );
    return r.rows[0]?.c || 0;
  }

  // ---- 2: weekly AI reports ----
  function _weekStart(d = new Date()) {
    const dt = new Date(d);
    dt.setUTCHours(0, 0, 0, 0);
    const dow = dt.getUTCDay(); // 0..6, Sun..Sat
    const offset = (dow + 6) % 7; // back to Mon
    dt.setUTCDate(dt.getUTCDate() - offset);
    return dt.toISOString().slice(0, 10);
  }

  async function getCachedWeeklyReport(accountId, weekStart = null) {
    if (!accountId) return null;
    const ws = weekStart || _weekStart();
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM weekly_ai_reports
        WHERE account_id = $1 AND week_start = $2
          AND generated_at > NOW() - INTERVAL '${WEEKLY_REPORT_CACHE_HOURS} hours'
        LIMIT 1`,
      [accountId, ws]
    );
    return r.rows[0] || null;
  }

  async function saveWeeklyReport(accountId, weekStart, contentMd, stats) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO weekly_ai_reports (account_id, week_start, content_md, stats)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (account_id, week_start) DO UPDATE
         SET content_md = EXCLUDED.content_md,
             stats = EXCLUDED.stats,
             generated_at = NOW()
       RETURNING *`,
      [accountId, weekStart, contentMd, stats ? JSON.stringify(stats) : null]
    );
    return r.rows[0];
  }

  async function getWeeklyReportSourceData(accountId) {
    const p = getPool();
    const r = await p.query(
      `SELECT m.match_id, m.date, m.duration, m.radiant_win,
              ps.team, ps.hero_id, ps.kills, ps.deaths, ps.assists,
              ps.gpm, ps.xpm, ps.hero_damage, ps.hero_healing,
              ps.tower_damage, ps.last_hits, ps.position, ps.perf, ps.perf_breakdown
         FROM player_stats ps
         JOIN matches m ON m.match_id = ps.match_id
        WHERE ps.account_id = $1
          AND m.date > NOW() - INTERVAL '7 days'
        ORDER BY m.date DESC
        LIMIT 50`,
      [accountId]
    );
    const games = r.rows;
    const wins = games.filter(g =>
      (g.team === 0 && g.radiant_win) || (g.team === 1 && !g.radiant_win)).length;
    const losses = games.length - wins;
    const avg = (k) => {
      if (!games.length) return 0;
      const vals = games.map(g => Number(g[k]) || 0);
      return Math.round((vals.reduce((a, b) => a + b, 0) / games.length) * 10) / 10;
    };
    const perfVals = games.map(g => Number(g.perf)).filter(v => Number.isFinite(v));
    const avgPerf = perfVals.length
      ? Math.round((perfVals.reduce((a, b) => a + b, 0) / perfVals.length) * 100) / 100
      : null;
    // Per-match shape used by the nightly worker (it consumes `matches[]`
    // for win/perf rollups and the deterministic-fallback renderer).
    const matches = games.map(g => ({
      match_id: g.match_id,
      hero_id: g.hero_id,
      win: (g.team === 0 && g.radiant_win) || (g.team === 1 && !g.radiant_win),
      perf: Number(g.perf) || 0,
      kda: { k: g.kills, d: g.deaths, a: g.assists },
      gpm: g.gpm, xpm: g.xpm, position: g.position,
    }));
    return {
      games_count: games.length,
      matches,
      wins, losses,
      win_rate: games.length ? Math.round((wins / games.length) * 1000) / 10 : 0,
      avg_kills: avg('kills'),
      avg_deaths: avg('deaths'),
      avg_assists: avg('assists'),
      avg_gpm: avg('gpm'),
      avg_xpm: avg('xpm'),
      avg_perf: avgPerf,
      best_match: games.slice().sort((a, b) =>
        (Number(b.perf) || 0) - (Number(a.perf) || 0))[0] || null,
    };
  }

  // ---- Round-4: verified-badge code challenge + email opt-in helpers ----
  function _generateChallengeCode() {
    // 16 hex chars (~64 bits) is plenty: collision space is per-account.
    const crypto = require('crypto');
    return 'OI-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  }

  async function createVerificationChallenge({ accountId, provider, handle, proofUrl }) {
    if (!ALLOWED_VERIFIED_PROVIDERS.has(provider) && provider !== 'steam') {
      throw new Error('Bad provider');
    }
    if (!_isSafeHttpUrl(proofUrl)) throw new Error('proofUrl must be http(s)');
    if (typeof handle !== 'string' || handle.length === 0 || handle.length > 80) {
      throw new Error('Bad handle');
    }
    const code = _generateChallengeCode();
    const p = getPool();
    const r = await p.query(
      `INSERT INTO verified_badge_challenges
        (account_id, provider, handle, proof_url, challenge_code)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (account_id, provider) DO UPDATE
         SET handle = EXCLUDED.handle,
             proof_url = EXCLUDED.proof_url,
             challenge_code = EXCLUDED.challenge_code,
             created_at = NOW(),
             attempts_count = 0,
             last_attempt_at = NULL,
             verified_at = NULL,
             expires_at = NOW() + INTERVAL '24 hours'
       RETURNING *`,
      [accountId, provider, handle, proofUrl, code]
    );
    return r.rows[0];
  }

  async function getActiveVerificationChallenge(accountId, provider) {
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM verified_badge_challenges
        WHERE account_id = $1 AND provider = $2 AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [accountId, provider]
    );
    return r.rows[0] || null;
  }

  // Mark a challenge as completed and promote the pending verified_badges
  // row to status='verified'. Caller is responsible for the actual fetch +
  // substring-match (kept out of the DB layer so it can be unit-tested).
  async function completeVerificationChallenge(challengeId) {
    const p = getPool();
    const c = await p.query(
      `UPDATE verified_badge_challenges
          SET verified_at = NOW(), last_attempt_at = NOW()
        WHERE id = $1 AND verified_at IS NULL
        RETURNING *`,
      [challengeId]
    );
    const ch = c.rows[0];
    if (!ch) return null;
    // Upsert the verified_badges row to verified status. 180-day expiry
    // matches the admin-approval path so the worker re-checks every 6 mo.
    await p.query(
      `INSERT INTO verified_badges
        (account_id, provider, handle, source, status, approved_at, expires_at, revoked_at)
       VALUES ($1,$2,$3,'code_challenge','verified', NOW(),
               NOW() + INTERVAL '180 days', NULL)
       ON CONFLICT (account_id, provider) DO UPDATE
         SET handle = EXCLUDED.handle, source = 'code_challenge',
             status = 'verified', approved_at = NOW(),
             expires_at = NOW() + INTERVAL '180 days', revoked_at = NULL`,
      [ch.account_id, ch.provider, ch.handle]
    );
    return ch;
  }

  async function setUserEmail(accountId, email) {
    if (typeof email !== 'string' || email.length > 254) throw new Error('Bad email');
    // Conservative RFC-ish check: one @, dot in domain, no spaces.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Bad email');
    const p = getPool();
    const r = await p.query(
      `INSERT INTO magv3_user_emails (account_id, email)
       VALUES ($1, $2)
       ON CONFLICT (account_id) DO UPDATE
         SET email = EXCLUDED.email, updated_at = NOW()
       RETURNING *`,
      [accountId, email.toLowerCase()]
    );
    return r.rows[0];
  }

  async function getUserEmail(accountId) {
    const p = getPool();
    const r = await p.query(
      `SELECT email FROM magv3_user_emails WHERE account_id = $1`,
      [accountId]
    );
    return r.rows[0]?.email || null;
  }

  // ---- 4: sponsorships ----
  async function createSponsorshipPending(row) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO org_sponsorships
        (sponsor_account_id, target_account_id, slot_type, headline, body_md,
         image_url, link_url, stripe_session_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_payment')
       RETURNING *`,
      [row.sponsorAccountId, row.targetAccountId, row.slotType || 'profile_chip',
       row.headline, row.bodyMd || null, row.imageUrl || null, row.linkUrl || null,
       row.stripeSessionId]
    );
    return r.rows[0];
  }

  async function markSponsorshipPaid(stripeSessionId, stripeSubscriptionId) {
    const p = getPool();
    const r = await p.query(
      `UPDATE org_sponsorships
          SET stripe_subscription_id = COALESCE($2, stripe_subscription_id),
              status = CASE WHEN status = 'pending_payment' THEN 'pending_moderation' ELSE status END,
              updated_at = NOW()
        WHERE stripe_session_id = $1
        RETURNING *`,
      [stripeSessionId, stripeSubscriptionId]
    );
    return r.rows[0] || null;
  }

  async function moderateSponsorship(id, { approve, moderatorAccountId, notes }) {
    const p = getPool();
    const newStatus = approve ? 'pending_acceptance' : 'rejected';
    const r = await p.query(
      `UPDATE org_sponsorships
          SET status = $2, moderated_by = $3, moderated_at = NOW(),
              moderation_notes = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, newStatus, moderatorAccountId, notes || null]
    );
    return r.rows[0] || null;
  }

  async function acceptSponsorship(id, accountId) {
    const p = getPool();
    const r = await p.query(
      `UPDATE org_sponsorships
          SET status = 'active', accepted_at = NOW(), activated_at = NOW(),
              expires_at = COALESCE(expires_at, NOW() + INTERVAL '30 days'),
              updated_at = NOW()
        WHERE id = $1 AND target_account_id = $2 AND status = 'pending_acceptance'
        RETURNING *`,
      [id, accountId]
    );
    return r.rows[0] || null;
  }

  async function declineSponsorship(id, accountId) {
    const p = getPool();
    const r = await p.query(
      `UPDATE org_sponsorships
          SET status = 'declined', cancelled_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND target_account_id = $2
          AND status IN ('pending_acceptance','active')
        RETURNING *`,
      [id, accountId]
    );
    return r.rows[0] || null;
  }

  async function getActiveSponsorshipsForTarget(accountId) {
    if (!accountId) return [];
    const p = getPool();
    const r = await p.query(
      `SELECT id, sponsor_account_id, headline, body_md, image_url, link_url,
              activated_at, expires_at
         FROM org_sponsorships
        WHERE target_account_id = $1 AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY activated_at DESC`,
      [accountId]
    );
    return r.rows;
  }

  async function getInboundSponsorships(accountId) {
    if (!accountId) return [];
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM org_sponsorships
        WHERE target_account_id = $1
          AND status IN ('pending_acceptance','active','declined')
        ORDER BY created_at DESC LIMIT 20`,
      [accountId]
    );
    return r.rows;
  }

  async function listPendingModerationSponsorships() {
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM org_sponsorships
        WHERE status = 'pending_moderation'
        ORDER BY created_at ASC`
    );
    return r.rows;
  }

  async function getSponsorship(id) {
    const p = getPool();
    const r = await p.query(`SELECT * FROM org_sponsorships WHERE id = $1`, [id]);
    return r.rows[0] || null;
  }

  // ---- 6: pickem ----
  async function getActivePickemSeason() {
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM pickem_seasons
        WHERE status = 'open' AND starts_at <= NOW() AND ends_at >= NOW()
        ORDER BY starts_at DESC LIMIT 1`
    );
    return r.rows[0] || null;
  }

  async function ensureDefaultPickemSeason() {
    const p = getPool();
    const existing = await p.query(`SELECT 1 FROM pickem_seasons LIMIT 1`);
    if (existing.rows.length) return;
    const slug = `pickem-${new Date().getUTCFullYear()}`;
    const start = new Date();
    const end = new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000);
    await p.query(
      `INSERT INTO pickem_seasons (slug, label, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, 'open')
       ON CONFLICT (slug) DO NOTHING`,
      [slug, 'Inhouse Pickem ' + start.getUTCFullYear(), start, end]
    );
  }

  // Round-8: pick now optionally accepts side bets — first-blood team,
  // total-kills bucket (under/over 50), duration tier (short/medium/long).
  // All four fields are individually nullable; null = "did not predict",
  // worth 0 on resolve.
  async function submitPickemPick({
    seasonId, accountId, matchRef, pickedWinner,
    pickedFirstBlood = null, pickedTotalKillsBucket = null, pickedDurationTier = null,
  }) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO pickem_picks
         (season_id, account_id, match_ref, picked_winner,
          picked_first_blood, picked_total_kills_bucket, picked_duration_tier)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (season_id, account_id, match_ref) DO UPDATE
         SET picked_winner = EXCLUDED.picked_winner,
             picked_first_blood = EXCLUDED.picked_first_blood,
             picked_total_kills_bucket = EXCLUDED.picked_total_kills_bucket,
             picked_duration_tier = EXCLUDED.picked_duration_tier,
             updated_at = NOW()
         WHERE pickem_picks.resolved_at IS NULL
       RETURNING *`,
      [seasonId, accountId, String(matchRef), pickedWinner,
       pickedFirstBlood, pickedTotalKillsBucket, pickedDurationTier]
    );
    return r.rows[0] || null;
  }

  // Resolution awards 10 pts for the winner pick + 5 pts each for any
  // optional side-bet dimension that matches. `actuals` may include
  // firstBlood, totalKillsBucket, durationTier; missing dims simply
  // award 0 for that dim across all picks.
  async function resolvePickemMatch({
    seasonId, matchRef, actualWinner,
    points = 10, sidePoints = 5,
    actualFirstBlood = null, actualTotalKillsBucket = null, actualDurationTier = null,
  }) {
    const p = getPool();
    const r = await p.query(
      `UPDATE pickem_picks
          SET points_awarded     = CASE WHEN picked_winner = $3 THEN $4 ELSE 0 END,
              points_first_blood = CASE
                WHEN $6::text IS NOT NULL AND picked_first_blood = $6 THEN $5
                WHEN picked_first_blood IS NULL THEN 0 ELSE 0 END,
              points_total_kills = CASE
                WHEN $7::text IS NOT NULL AND picked_total_kills_bucket = $7 THEN $5
                WHEN picked_total_kills_bucket IS NULL THEN 0 ELSE 0 END,
              points_duration_tier = CASE
                WHEN $8::text IS NOT NULL AND picked_duration_tier = $8 THEN $5
                WHEN picked_duration_tier IS NULL THEN 0 ELSE 0 END,
              actual_first_blood        = $6,
              actual_total_kills_bucket = $7,
              actual_duration_tier      = $8,
              resolved_at = NOW(),
              updated_at = NOW()
        WHERE season_id = $1 AND match_ref = $2 AND resolved_at IS NULL
        RETURNING account_id, points_awarded,
                  COALESCE(points_first_blood,0)
                + COALESCE(points_total_kills,0)
                + COALESCE(points_duration_tier,0) AS side_points`,
      [seasonId, String(matchRef), actualWinner, points, sidePoints,
       actualFirstBlood, actualTotalKillsBucket, actualDurationTier]
    );
    return r.rows;
  }

  // Drift closure (Task #157 round-3): plug into the match-record pipeline so
  // pickem picks resolve automatically when a match is recorded — no manual
  // admin /resolve call needed. Caller passes the recorded match's ID and
  // radiant_win flag; we resolve picks against the active season for that
  // match's match_ref. Best-effort: any error swallowed and logged so a
  // pickem-side bug never breaks match recording.
  async function autoResolvePickemForMatch(matchId, radiantWin, extras = {}) {
    try {
      const season = await getActivePickemSeason();
      if (!season) return [];
      // Round-8: side-bet auto-resolve. Caller can pass any of:
      //   firstBloodTeam: 'radiant'|'dire'  (from match.first_blood_time + tower side)
      //   totalKills: number                (auto-bucketed at boundary 50)
      //   durationSeconds: number           (auto-tiered <30m / 30-45m / >45m)
      const actualFirstBlood = extras.firstBloodTeam === 'radiant' || extras.firstBloodTeam === 'dire'
        ? extras.firstBloodTeam : null;
      const actualTotalKillsBucket = Number.isFinite(extras.totalKills)
        ? (extras.totalKills >= 50 ? 'over' : 'under') : null;
      const actualDurationTier = Number.isFinite(extras.durationSeconds)
        ? (extras.durationSeconds < 1800 ? 'short'
            : extras.durationSeconds <= 2700 ? 'medium' : 'long')
        : null;
      return await resolvePickemMatch({
        seasonId: season.id,
        matchRef: String(matchId),
        actualWinner: radiantWin ? 'radiant' : 'dire',
        points: 10, sidePoints: 5,
        actualFirstBlood, actualTotalKillsBucket, actualDurationTier,
      });
    } catch (e) {
      return [];
    }
  }

  // Season-end: pick the leaderboard champion, grant a one-time
  // `cosmetic:pickem_champion_frame:S<seasonId>` perk (no expiry, source =
  // 'season_award'). Idempotent via the perk_key uniqueness check — calling
  // it twice for the same season is a no-op.
  async function awardPickemSeasonChampion(seasonId) {
    const board = await getPickemLeaderboard(seasonId, 1);
    const champ = board[0];
    if (!champ || champ.points <= 0) return null;
    const perkKey = `cosmetic:pickem_champion_frame:S${seasonId}`;
    const exists = await hasOneOffPerk(champ.account_id, perkKey);
    if (exists) return null;
    const p = getPool();
    const r = await p.query(
      `INSERT INTO user_one_off_perks (account_id, perk_key, source, metadata)
       VALUES ($1, $2, 'season_award', $3::jsonb)
       RETURNING *`,
      [champ.account_id, perkKey,
       JSON.stringify({ season_id: seasonId, points: champ.points })],
    );
    return r.rows[0];
  }

  async function getPickemLeaderboard(seasonId, limit = 50) {
    const p = getPool();
    const r = await p.query(
      // Points = winner-pick points + any awarded side-bet points
      // (round-8: first-blood / total-kills / duration-tier dimensions).
      `SELECT pp.account_id,
              COALESCE(n.nickname, pp.account_id::text) AS display_name,
              COALESCE(SUM(pp.points_awarded), 0)::int
                + COALESCE(SUM(pp.points_first_blood), 0)::int
                + COALESCE(SUM(pp.points_total_kills), 0)::int
                + COALESCE(SUM(pp.points_duration_tier), 0)::int AS points,
              COUNT(*) FILTER (WHERE pp.resolved_at IS NOT NULL)::int AS resolved,
              COUNT(*) FILTER (WHERE pp.points_awarded > 0)::int AS correct,
              COUNT(*)::int AS total_picks
         FROM pickem_picks pp
         LEFT JOIN nicknames n ON n.account_id = pp.account_id
        WHERE pp.season_id = $1
        GROUP BY pp.account_id, n.nickname
        ORDER BY points DESC, correct DESC, total_picks DESC
        LIMIT $2`,
      [seasonId, limit]
    );
    return r.rows;
  }

  async function getMyPickemPicks(seasonId, accountId) {
    const p = getPool();
    const r = await p.query(
      `SELECT match_ref, picked_winner, points_awarded,
              picked_first_blood, picked_total_kills_bucket, picked_duration_tier,
              points_first_blood, points_total_kills, points_duration_tier,
              actual_first_blood, actual_total_kills_bucket, actual_duration_tier,
              resolved_at, updated_at
         FROM pickem_picks
        WHERE season_id = $1 AND account_id = $2
        ORDER BY updated_at DESC LIMIT 200`,
      [seasonId, accountId]
    );
    return r.rows;
  }

  // ---- 7: verified badges ----
  async function getVerifiedBadges(accountId) {
    if (!accountId) return [];
    const p = getPool();
    const r = await p.query(
      // Round-6 hardening: explicitly require status='verified' as well
      // as revoked_at IS NULL. Belt-and-braces — current write paths keep
      // the two in sync (pending rows are inserted with revoked_at=NOW(),
      // and only completeVerificationChallenge / admin-approve flips both)
      // but a future code path that clears revoked_at without bumping
      // status would otherwise mis-grant trust. Status filter prevents that.
      `SELECT id, provider, handle, verified_at, expires_at, source
         FROM verified_badges
        WHERE account_id = $1
          AND status = 'verified'
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY verified_at DESC`,
      [accountId]
    );
    return r.rows;
  }

  async function upsertVerifiedBadge({ accountId, provider, handle, source = 'oauth', oneOffPerkId = null, expiresAt = null }) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO verified_badges (account_id, provider, handle, source, one_off_perk_id, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (account_id, provider) DO UPDATE
         SET handle = EXCLUDED.handle,
             source = EXCLUDED.source,
             one_off_perk_id = EXCLUDED.one_off_perk_id,
             expires_at = EXCLUDED.expires_at,
             revoked_at = NULL,
             verified_at = NOW()
       RETURNING *`,
      [accountId, provider, handle, source, oneOffPerkId, expiresAt]
    );
    return r.rows[0];
  }

  // ---- 7 (review fix): pending verification + admin approval ----
  async function createPendingVerificationRequest({ accountId, provider, handle, oneOffPerkId = null }) {
    const p = getPool();
    // Insert as status='pending' AND revoked_at=NOW() so getVerifiedBadges()
    // (which filters revoked_at IS NULL) does NOT surface it as verified.
    const r = await p.query(
      `INSERT INTO verified_badges
         (account_id, provider, handle, source, one_off_perk_id, status, revoked_at)
       VALUES ($1,$2,$3,'paid',$4,'pending', NOW())
       ON CONFLICT (account_id, provider) DO UPDATE
         SET handle = EXCLUDED.handle,
             one_off_perk_id = EXCLUDED.one_off_perk_id,
             status = CASE WHEN verified_badges.status = 'verified'
                            THEN verified_badges.status
                            ELSE 'pending' END,
             revoked_at = CASE WHEN verified_badges.status = 'verified'
                                THEN verified_badges.revoked_at
                                ELSE NOW() END
       RETURNING *`,
      [accountId, provider, handle, oneOffPerkId]
    );
    return r.rows[0];
  }

  async function listPendingVerifications() {
    const p = getPool();
    const r = await p.query(
      `SELECT id, account_id, provider, handle, verified_at, one_off_perk_id
         FROM verified_badges
        WHERE status = 'pending'
        ORDER BY verified_at ASC
        LIMIT 100`
    );
    return r.rows;
  }

  async function approveVerification(id, moderatorAccountId) {
    const p = getPool();
    const r = await p.query(
      `UPDATE verified_badges
          SET status = 'verified',
              source = 'admin',
              approved_by = $2,
              approved_at = NOW(),
              revoked_at = NULL,
              verified_at = NOW(),
              expires_at = NOW() + INTERVAL '180 days'
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, moderatorAccountId]
    );
    return r.rows[0] || null;
  }

  async function rejectVerification(id, moderatorAccountId, reason) {
    const p = getPool();
    const r = await p.query(
      `UPDATE verified_badges
          SET status = 'rejected',
              approved_by = $2,
              approved_at = NOW(),
              revoked_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [id, moderatorAccountId]
    );
    return r.rows[0] || null;
  }

  // Periodic re-check: any verified badge older than expires_at flips back
  // to 'pending' (and revoked_at=NOW()) so the user must re-prove.
  async function expireStaleVerifiedBadges() {
    const p = getPool();
    const r = await p.query(
      `UPDATE verified_badges
          SET status = 'pending',
              revoked_at = NOW()
        WHERE status = 'verified'
          AND expires_at IS NOT NULL
          AND expires_at < NOW()
        RETURNING id, account_id, provider`
    );
    return r.rows;
  }

  // ---- 4 (review fix): org sponsor onboarding moderation queue ----
  async function createOrgSponsorApplication({ ownerAccountId, orgName, website, contactEmail, description }) {
    const p = getPool();
    const r = await p.query(
      `INSERT INTO org_sponsors (owner_account_id, org_name, website, contact_email, description)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ownerAccountId, orgName, website, contactEmail, description]
    );
    return r.rows[0];
  }
  async function listPendingOrgSponsors() {
    const p = getPool();
    const r = await p.query(
      `SELECT * FROM org_sponsors WHERE status = 'pending_review' ORDER BY created_at ASC LIMIT 100`
    );
    return r.rows;
  }
  async function moderateOrgSponsor(id, { approve, moderatorAccountId, notes }) {
    const p = getPool();
    const r = await p.query(
      `UPDATE org_sponsors
          SET status = $2, moderated_by = $3, moderated_at = NOW(),
              moderation_notes = $4, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id, approve ? 'approved' : 'rejected', moderatorAccountId, notes || null]
    );
    return r.rows[0] || null;
  }
  async function isApprovedOrgSponsor(accountId) {
    if (!accountId) return false;
    const p = getPool();
    const r = await p.query(
      `SELECT 1 FROM org_sponsors WHERE owner_account_id = $1 AND status = 'approved' LIMIT 1`,
      [accountId]
    );
    return r.rowCount > 0;
  }

  return {
    // 8
    grantOneOffPerk, hasOneOffPerk, listOneOffPerks, createOneOffPerkPending,
    // Round-4 review: code-challenge proof + email opt-in helpers
    createVerificationChallenge, getActiveVerificationChallenge,
    completeVerificationChallenge, _generateChallengeCode,
    setUserEmail, getUserEmail,
    // 1
    logReplayDownload, countReplayDownloadsLast24h,
    // 2
    getCachedWeeklyReport, saveWeeklyReport, getWeeklyReportSourceData,
    _weekStart,
    // 4
    createSponsorshipPending, markSponsorshipPaid, moderateSponsorship,
    acceptSponsorship, declineSponsorship, getActiveSponsorshipsForTarget,
    getInboundSponsorships, listPendingModerationSponsorships, getSponsorship,
    // 4 (review fix) — org onboarding
    createOrgSponsorApplication, listPendingOrgSponsors, moderateOrgSponsor,
    isApprovedOrgSponsor,
    // 6
    getActivePickemSeason, ensureDefaultPickemSeason, submitPickemPick,
    resolvePickemMatch, autoResolvePickemForMatch, awardPickemSeasonChampion,
    getPickemLeaderboard, getMyPickemPicks,
    // 7
    getVerifiedBadges, upsertVerifiedBadge,
    // 7 (review fix) — pending verification trust model
    createPendingVerificationRequest, listPendingVerifications,
    approveVerification, rejectVerification, expireStaleVerifiedBadges,
  };
}

// =============================================================================
// WEEKLY REPORT — JSON SCHEMA + VALIDATION (review fix)
// The Groq-generated structured output must conform to this shape; otherwise
// we fall back to deterministic stat summary.
// =============================================================================
const WEEKLY_REPORT_SCHEMA = {
  required: ['summary', 'insights', 'top_heroes', 'deltas'],
  insightsMin: 1, insightsMax: 8,
};
function validateWeeklyReportJson(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'not-object' };
  for (const k of WEEKLY_REPORT_SCHEMA.required) {
    if (!(k in obj)) return { ok: false, error: `missing:${k}` };
  }
  if (typeof obj.summary !== 'string' || obj.summary.length < 10) {
    return { ok: false, error: 'summary-too-short' };
  }
  if (!Array.isArray(obj.insights)
      || obj.insights.length < WEEKLY_REPORT_SCHEMA.insightsMin
      || obj.insights.length > WEEKLY_REPORT_SCHEMA.insightsMax) {
    return { ok: false, error: 'insights-bounds' };
  }
  if (!obj.insights.every(s => typeof s === 'string' && s.length > 5)) {
    return { ok: false, error: 'insights-bad-strings' };
  }
  if (!Array.isArray(obj.top_heroes)) return { ok: false, error: 'top_heroes-not-array' };
  if (typeof obj.deltas !== 'object' || obj.deltas == null) {
    return { ok: false, error: 'deltas-not-object' };
  }
  return { ok: true };
}

// =============================================================================
// WEEKLY REPORT NIGHTLY WORKER (review fix)
// Runs every WEEKLY_WORKER_INTERVAL_MS (default: 1h). On the configured weekday
// (default Monday) it:
//   - finds Pro accounts active in the last 7 days
//   - generates / refreshes their weekly report
//   - delivers via Discord DM (best-effort) using deps.notifyWeeklyReport
// Idempotent thanks to the (account_id, week_start) UNIQUE constraint.
// =============================================================================
function _safeParseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // Strip markdown fences if present.
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // Find first { … last } so wrapping prose is tolerated.
  const i = s.indexOf('{'); const j = s.lastIndexOf('}');
  if (i === -1 || j === -1 || j < i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

function startWeeklyReportWorker(deps) {
  const { db, magV3, getGroq, log = console, intervalMs = 60 * 60 * 1000,
          deliveryWeekday = 1 /* Mon */, getProAccountIds,
          notifyWeeklyReport,
          // Round-4 review: email is the spec'd primary delivery channel.
          // `sendEmail({ accountId, email, subject, markdown })` may be wired
          // to Resend/Mailgun/etc. by the caller. Worker falls back to
          // notifyWeeklyReport (Discord DM) only when the caller did not
          // configure email AND the user has weekly_recap notifications on.
          sendEmail,
          isNotificationEnabled } = deps;
  let timer = null;
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      // Expire stale verified badges as part of the same nightly tick.
      try {
        const expired = await magV3.expireStaleVerifiedBadges();
        if (expired.length) log.log('[mag-v3:weekly] expired verified badges:', expired.length);
      } catch (e) { log.warn('[mag-v3:weekly] expire-verified failed:', e.message); }

      const now = new Date();
      if (now.getUTCDay() !== deliveryWeekday) return;
      // Only run once per day-of-week tick window.
      if (now.getUTCHours() !== 9) return; // 09:00 UTC

      const accounts = (await (getProAccountIds ? getProAccountIds() : Promise.resolve([]))) || [];
      if (!accounts.length) return;
      log.log('[mag-v3:weekly] running for', accounts.length, 'pro accounts');
      let delivered = 0, skipped = 0, optedOut = 0, noEmail = 0;
      for (const accountId of accounts) {
        try {
          // Round-4 review: gate generation on the user's notification opt-in.
          // The existing `weekly_recap` notification category is reused so
          // the existing settings page just works — no new UI required.
          if (typeof isNotificationEnabled === 'function') {
            const enabled = await isNotificationEnabled(accountId, 'weekly_recap');
            if (!enabled) { optedOut++; continue; }
          }
          const stats = await magV3.getWeeklyReportSourceData(accountId);
          if (!stats || !stats.matches || stats.matches.length === 0) { skipped++; continue; }
          let content = null;
          let parsedJson = null;
          const groq = getGroq && getGroq();
          if (groq && typeof groq.generateChatResponse === 'function') {
            try {
              const prompt = _weeklyPrompt(stats) +
                '\n\nReply with ONLY a single JSON object — no surrounding prose, no markdown fences.';
              const raw = await groq.generateChatResponse({ message: prompt });
              const out = _safeParseJsonObject(raw);
              const v = out ? validateWeeklyReportJson(out) : { ok: false, error: 'no-parse' };
              if (v.ok) { parsedJson = out; content = _renderWeeklyMd(out); }
              else { log.warn('[mag-v3:weekly] schema reject:', v.error); }
            } catch (e) { log.warn('[mag-v3:weekly] groq failed:', e.message); }
          }
          if (!content) content = _renderWeeklyDeterministic(stats);
          await magV3.saveWeeklyReport(accountId, magV3._weekStart(), content, { ...stats, ai: parsedJson });
          // Round-4 delivery preference: email > Discord DM. Both are gated
          // on the same `weekly_recap` opt-in (already checked above).
          let sent = false;
          const email = await magV3.getUserEmail(accountId).catch(() => null);
          if (email && typeof sendEmail === 'function') {
            try {
              await sendEmail({
                accountId, email,
                subject: 'Your weekly Dota report is ready',
                markdown: content,
              });
              sent = true;
            } catch (e) { log.warn('[mag-v3:weekly] email failed:', e.message); }
          } else if (!email) {
            noEmail++;
          }
          if (!sent && notifyWeeklyReport) {
            try { await notifyWeeklyReport(accountId, content); sent = true; }
            catch (e) { log.warn('[mag-v3:weekly] dm failed:', e.message); }
          }
          if (sent) delivered++;
        } catch (e) { log.warn('[mag-v3:weekly] account', accountId, 'failed:', e.message); }
      }
      log.log('[mag-v3:weekly] delivered:', delivered,
              'opted-out:', optedOut, 'no-email:', noEmail, 'skipped:', skipped);
    } finally { running = false; }
  }
  timer = setInterval(() => { tick().catch(e => log.warn('[mag-v3:weekly] tick:', e.message)); }, intervalMs);
  // Run once shortly after boot so verified-badge expiry is processed.
  setTimeout(() => { tick().catch(() => {}); }, 30 * 1000);
  return { stop() { if (timer) clearInterval(timer); }, _tick: tick };
}

function _weeklyPrompt(stats) {
  return `You are a Dota 2 performance analyst. Given the JSON stats below, ` +
    `respond with STRICT JSON matching this shape exactly: ` +
    `{"summary": string, "insights": string[1..8], "top_heroes": ` +
    `[{"hero_id":number,"games":number,"winrate":number}], ` +
    `"deltas": {"perf_avg":number,"winrate":number,"kda":number}}. ` +
    `Stats: ${JSON.stringify(stats).slice(0, 6000)}`;
}
function _renderWeeklyMd(j) {
  const lines = [`### Weekly Report`, ``, j.summary, ``, `**Key insights**`];
  for (const ins of j.insights) lines.push(`- ${ins}`);
  if (Array.isArray(j.top_heroes) && j.top_heroes.length) {
    lines.push(``, `**Top heroes**`);
    for (const h of j.top_heroes.slice(0, 5)) {
      lines.push(`- Hero ${h.hero_id}: ${h.games} games, ${Math.round(h.winrate * 100)}% WR`);
    }
  }
  return lines.join('\n');
}
function _renderWeeklyDeterministic(stats) {
  const m = stats.matches || [];
  const wins = m.filter(x => x.win).length;
  const wr = m.length ? Math.round((wins / m.length) * 100) : 0;
  const avgPerf = m.length ? (m.reduce((s, x) => s + (x.perf || 0), 0) / m.length).toFixed(2) : '0.00';
  return `### Weekly Report\n\nLast 7 days: **${m.length} matches**, **${wr}% WR**, average PERF **${avgPerf}**.\n\n` +
    `_(Generated from your match history; AI commentary unavailable.)_`;
}

// =============================================================================
// COACH PAIRING (3) — pure scoring helper. No DB writes.
// =============================================================================
function scoreCoachMatch(student, coach) {
  // Both are plain objects already loaded by the caller. Returns 0..100.
  let score = 50;
  // MMR proximity — closer to student's MMR (but slightly higher) is best.
  const sm = Number(student.mmr) || 0;
  const cm = Number(coach.mmr) || 0;
  if (sm > 0 && cm > 0) {
    const delta = cm - sm;
    if (delta < 0) score -= Math.min(20, Math.abs(delta) / 100);
    else if (delta < 1500) score += 15 - Math.abs(delta - 500) / 100;
    else score -= Math.min(15, (delta - 1500) / 200);
  }
  // Hero overlap (coach.hero_pool is array of hero_ids, student.top_heroes too).
  const studentHeroes = new Set((student.top_heroes || []).map(Number));
  const coachHeroes = new Set((coach.hero_pool || []).map(Number));
  let heroOverlap = 0;
  for (const h of studentHeroes) if (coachHeroes.has(h)) heroOverlap++;
  score += Math.min(20, heroOverlap * 5);
  // Position match.
  if (student.primary_position != null && coach.positions
      && Array.isArray(coach.positions)
      && coach.positions.map(Number).includes(Number(student.primary_position))) {
    score += 10;
  }
  // Penalize coaches with no recent reviews.
  const reviews = Number(coach.review_count) || 0;
  if (reviews === 0) score -= 5;
  else score += Math.min(10, reviews);
  return Math.max(0, Math.min(100, Math.round(score)));
}

// =============================================================================
// STRIPE WEBHOOK DISPATCH (called from src/web/server.js webhook handler)
// =============================================================================
async function handleStripeWebhookPurpose({ purpose, session, db, magV3, log }) {
  if (purpose === 'verified_badge') {
    const accountId = session.metadata?.account_id;
    const provider = session.metadata?.provider;
    const handle = session.metadata?.handle;
    if (!accountId || !provider || !handle) {
      log.warn('[mag-v3] verified_badge webhook missing metadata');
      return;
    }
    // SECURITY (Task #157 review fix): payment alone does NOT grant a
    // verified badge — that would let anyone "buy verified" and undermine
    // the badge's authenticity. The paid checkout funds *processing* of
    // a verification request. We:
    //   1. Grant a `pending_verification:<provider>` perk so the user can
    //      see their request was received.
    //   2. Insert a row into `verified_badges` with `source='pending'`
    //      AND `revoked_at = NOW()` so it is NOT exposed by
    //      getVerifiedBadges(). The badge only flips to `verified` after
    //      either an OAuth handshake or a superuser approval (see the
    //      `/api/admin/verified/:id/approve` route).
    const perk = await magV3.grantOneOffPerk({
      accountId, perkKey: `pending_verification:${provider}`,
      source: 'stripe',
      stripeSessionId: session.id,
      stripePaymentIntent: session.payment_intent || null,
      amountCents: session.amount_total || null,
      currency: session.currency || null,
      metadata: { provider, handle, status: 'pending_verification' },
    });
    await magV3.createPendingVerificationRequest({
      accountId, provider, handle, oneOffPerkId: perk?.id || null,
    });
    log.log('[mag-v3] verified_badge: pending_verification recorded', accountId, provider);
    return;
  }
  if (purpose === 'org_sponsorship') {
    const row = await magV3.markSponsorshipPaid(
      session.id,
      session.subscription || null,
    );
    if (row) log.log('[mag-v3] sponsorship paid -> moderation', row.id);
    else log.warn('[mag-v3] org_sponsorship webhook: no row for session', session.id);
    return;
  }
  if (purpose === 'one_off_perk') {
    const accountId = session.metadata?.account_id;
    const perkKey = session.metadata?.perk_key;
    if (!accountId || !perkKey) return;
    await magV3.grantOneOffPerk({
      accountId, perkKey, source: 'stripe',
      stripeSessionId: session.id,
      stripePaymentIntent: session.payment_intent || null,
      amountCents: session.amount_total || null,
      currency: session.currency || null,
    });
    log.log('[mag-v3] one_off_perk granted', accountId, perkKey);
    return;
  }
}

// =============================================================================
// ROUTES — mounted from src/web/server.js's createApiRouter().
// `deps` provides the existing helpers we need (auth, Pro check, db, etc).
// =============================================================================
function mountMagazineV3Routes({ router, app, express, deps }) {
  // (round-7 review note) Be defensive about required wiring rather than
  // silently mounting a partial route set. The embed widget mounts a
  // top-level `/embed/:accountId` page on `app`; if a future caller
  // forgets to pass `app`, fail fast at startup instead of letting the
  // embed surface 404 in production while everything else looks fine.
  if (!router) throw new Error('mountMagazineV3Routes: `router` is required');
  if (!app) throw new Error('mountMagazineV3Routes: `app` is required (used to mount /embed/:accountId)');
  if (!express) throw new Error('mountMagazineV3Routes: `express` is required');
  if (!deps) throw new Error('mountMagazineV3Routes: `deps` is required');
  const { db, magV3, isProAccount, isSuperuser, requirePro, getStripe, getSiteUrl, getGroq } = deps;

  function requireAuth(req, res, next) {
    if (!req.session?.accountId) {
      return res.status(401).json({ error: 'Sign in with Steam' });
    }
    next();
  }

  // ---------------------------------------------------------------
  // 1 — Replay paywall: per-user daily quota check (hooked into existing
  //     download route from src/web/server.js via `checkReplayQuota` helper).
  // ---------------------------------------------------------------
  router.get('/me/replay-quota', requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      const used = await magV3.countReplayDownloadsLast24h(accountId);
      res.json({
        used,
        limit: REPLAY_RATE_LIMIT_PER_DAY,
        remaining: Math.max(0, REPLAY_RATE_LIMIT_PER_DAY - used),
        is_pro: await isProAccount(accountId),
      });
    } catch (err) {
      console.error('[API] me/replay-quota:', err.message);
      res.status(500).json({ error: 'Failed to fetch quota' });
    }
  });

  // ---------------------------------------------------------------
  // 2 — Weekly AI report (Pro-gated)
  // ---------------------------------------------------------------
  router.get('/me/weekly-report', requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      if (!isSuperuser(req) && !(await isProAccount(accountId))) {
        return res.status(402).json({
          error: 'Weekly AI report requires Pro membership.',
          paywall: true, feature: 'weekly_ai_report', signed_in: true,
        });
      }
      const cached = await magV3.getCachedWeeklyReport(accountId);
      if (cached) {
        return res.json({
          report: cached.content_md,
          stats: cached.stats,
          week_start: cached.week_start,
          generated_at: cached.generated_at,
          cached: true,
        });
      }
      const stats = await magV3.getWeeklyReportSourceData(accountId);
      let content;
      let aiJson = null;
      if (!stats.games_count) {
        content = "_No games played in the last 7 days. Get back in the lobby and we'll have something to write about next week._";
      } else {
        // Review fix: align on-demand handler with the worker — both must
        // request strict JSON output and validate it against
        // WEEKLY_REPORT_SCHEMA before showing the user any AI text. Any
        // schema failure (or missing AI provider) falls back to the
        // deterministic stat summary so the user never sees hallucinations.
        const groq = getGroq();
        try {
          if (groq && typeof groq.generateChatResponse === 'function') {
            const prompt = _weeklyPrompt(stats) +
              '\n\nReply with ONLY a single JSON object — no surrounding prose, no markdown fences.';
            const raw = await groq.generateChatResponse({ message: prompt });
            const parsed = _safeParseJsonObject(raw);
            const v = parsed ? validateWeeklyReportJson(parsed) : { ok: false, error: 'no-parse' };
            if (v.ok) { aiJson = parsed; content = _renderWeeklyMd(parsed); }
            else { console.warn('[mag-v3] weekly-report schema reject:', v.error); }
          }
        } catch (e) {
          console.warn('[mag-v3] weekly-report groq failed:', e.message);
        }
        if (!content || typeof content !== 'string' || content.length < 30) {
          // Graceful deterministic fallback so the user always gets a useful
          // report even if the AI is unavailable or returns malformed JSON.
          const wr = stats.win_rate.toFixed(1);
          const k = stats.avg_kills, d = stats.avg_deaths, a = stats.avg_assists;
          content = [
            `**Last 7 days — ${stats.games_count} games, ${stats.wins}–${stats.losses} (${wr}% WR).**`,
            `Average line: ${k}/${d}/${a} · ${stats.avg_gpm} GPM · ${stats.avg_xpm} XPM` +
              (stats.avg_perf != null ? ` · PERF ${stats.avg_perf}` : '') + '.',
            stats.win_rate >= 55
              ? "You're trending up — keep the lineup that's working."
              : (stats.win_rate >= 45
                  ? "Roughly break-even — the swing stat to watch is your KDA balance."
                  : "Rough week. Focus on staying alive — your deaths line is dragging the rest down."),
          ].join(' ');
        }
      }
      stats.ai = aiJson;
      const saved = await magV3.saveWeeklyReport(
        accountId, magV3._weekStart(), content, stats
      );
      res.json({
        report: saved.content_md, stats: saved.stats,
        week_start: saved.week_start, generated_at: saved.generated_at,
        cached: false,
      });
    } catch (err) {
      console.error('[API] me/weekly-report:', err.message);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // ---------------------------------------------------------------
  // 3 — AI coach pairing (Pro-gated)
  // Two routes share `_buildCoachRecommendations`:
  //   - GET /me/coach-recommendations           (self)
  //   - GET /players/:id/coach-recommendations  (Pro acting on a profile)
  // Per review fix, both routes also return `weakest_dimensions[]`
  // describing the student's two weakest per-position stats vs peers,
  // so the UI can explain WHY each coach was matched.
  // ---------------------------------------------------------------
  async function _buildStudentSnapshot(accountId) {
    const pool = db.getPool();
    const studentRow = await pool.query(
      `SELECT MAX(r.mmr)::int AS mmr
         FROM ratings r WHERE r.player_id::text = $1::text`,
      [String(accountId)]
    );
    const heroes = await pool.query(
      `SELECT hero_id, COUNT(*)::int AS games
         FROM player_stats WHERE account_id = $1 AND hero_id IS NOT NULL
         GROUP BY hero_id ORDER BY games DESC LIMIT 5`,
      [accountId]
    );
    const positionRow = await pool.query(
      `SELECT position, COUNT(*)::int AS games
         FROM player_stats WHERE account_id = $1 AND position IS NOT NULL
         GROUP BY position ORDER BY games DESC LIMIT 1`,
      [accountId]
    );
    return {
      mmr: studentRow.rows[0]?.mmr || null,
      top_heroes: heroes.rows.map(r => r.hero_id),
      primary_position: positionRow.rows[0]?.position || null,
    };
  }

  // Returns up to 2 stat dimensions where the student is weakest vs the
  // average for the same primary position. Each dimension is named by
  // human-readable label and a numeric delta (negative = below peers).
  //
  // Round-6 review fix: the previous implementation referenced derived
  // columns (`kills_per_min`, `deaths_per_min`, …) and `ps.created_at`
  // that don't exist on the production `player_stats` schema (see
  // `src/db/index.js` line ~50: rows have raw counters + `gpm`/`xpm`,
  // and time comes from the joined `matches` table). The whole try/catch
  // was silently returning `[]` for every account, which broke the
  // grounding requirement on coach recommendations. Now: per-minute
  // metrics are computed in-SQL from raw counters divided by
  // `matches.duration / 60.0`, joined to `matches` for the time window,
  // and PERF (the persisted position-aware score) is included as the
  // primary dimension since the task spec calls it out specifically.
  async function _weakestDimensions(accountId, primaryPosition) {
    if (!primaryPosition) return [];
    const pool = db.getPool();
    // Each row: [sql_expr, label, lowerBetter]
    // Per-minute metrics are computed inline against the actual schema.
    const STAT_DIMS = [
      ['ps.perf',                                              'PERF score',           false],
      ['ps.kills    / NULLIF(m.duration/60.0, 0)',             'Kills / min',          false],
      ['ps.deaths   / NULLIF(m.duration/60.0, 0)',             'Deaths / min',         true],
      ['ps.assists  / NULLIF(m.duration/60.0, 0)',             'Assists / min',        false],
      ['ps.gpm::float',                                        'Gold / min',           false],
      ['ps.xpm::float',                                        'XP / min',             false],
      ['ps.last_hits   / NULLIF(m.duration/60.0, 0)',          'Last hits / min',      false],
      ['ps.hero_damage / NULLIF(m.duration/60.0, 0)',          'Hero damage / min',    false],
    ];
    const cols = STAT_DIMS.map(([expr], i) =>
      `AVG(CASE WHEN ps.account_id = $1 THEN ${expr} END)::float AS own_${i}, ` +
      `AVG(CASE WHEN ps.account_id <> $1 THEN ${expr} END)::float AS peer_${i}`
    ).join(', ');
    let r;
    try {
      r = await pool.query(
        `SELECT ${cols}
           FROM player_stats ps
           JOIN matches m ON m.match_id = ps.match_id
          WHERE ps.position = $2
            AND m.date > NOW() - INTERVAL '90 days'
            AND m.duration > 0`,
        [accountId, primaryPosition]
      );
    } catch (e) {
      // Defensive: if a deployment lacks `ps.perf` or `m.date`, retry
      // without the PERF dimension and using created_at instead. Worst
      // case we still return raw per-minute metrics rather than [].
      try {
        const altCols = STAT_DIMS.slice(1).map(([expr], i) =>
          `AVG(CASE WHEN ps.account_id = $1 THEN ${expr} END)::float AS own_${i + 1}, ` +
          `AVG(CASE WHEN ps.account_id <> $1 THEN ${expr} END)::float AS peer_${i + 1}`
        ).join(', ');
        r = await pool.query(
          `SELECT ${altCols}
             FROM player_stats ps
             JOIN matches m ON m.match_id = ps.match_id
            WHERE ps.position = $2
              AND m.duration > 0`,
          [accountId, primaryPosition]
        );
      } catch {
        return [];
      }
    }
    const row = r.rows[0] || {};
    const dims = [];
    STAT_DIMS.forEach(([_expr, label, lowerBetter], i) => {
      const own = row[`own_${i}`];
      const peer = row[`peer_${i}`];
      if (own == null || peer == null || peer === 0) return;
      const rawDelta = (own - peer) / Math.abs(peer);
      const normalised = lowerBetter ? -rawDelta : rawDelta;
      dims.push({ stat: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
                  label, delta_pct: Math.round(normalised * 100) });
    });
    dims.sort((a, b) => a.delta_pct - b.delta_pct);
    return dims.slice(0, 3);
  }

  async function _buildCoachRecommendations(accountId) {
    const student = await _buildStudentSnapshot(accountId);
    const weakest = await _weakestDimensions(accountId, student.primary_position);
    const coaches = typeof db.listActiveCoaches === 'function'
      ? await db.listActiveCoaches({}).catch(() => [])
      : [];
    const scored = coaches
      .filter(c => String(c.account_id) !== String(accountId))
      .map(c => ({
        coach_id: c.id,
        account_id: c.account_id,
        display_name: c.display_name || null,
        headline: c.headline || null,
        hourly_rate_cents: c.hourly_rate_cents,
        languages: c.languages,
        score: scoreCoachMatch(student, c),
        reasons: _coachMatchReasons(student, c, weakest),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { student, weakest_dimensions: weakest, recommendations: scored };
  }

  router.get('/me/coach-recommendations', requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      if (!isSuperuser(req) && !(await isProAccount(accountId))) {
        return res.status(402).json({
          error: 'Coach recommendations require Pro membership.',
          paywall: true, feature: 'coach_recommendations', signed_in: true,
        });
      }
      res.json(await _buildCoachRecommendations(accountId));
    } catch (err) {
      console.error('[API] me/coach-recommendations:', err.message);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  // Per-player route — caller must be Pro AND must be looking at their own
  // profile, OR a superuser. We do NOT let Pro users browse arbitrary
  // accounts' weakest dimensions (privacy + competitive fairness).
  router.get('/players/:id/coach-recommendations', requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      const targetId = String(req.params.id);
      const isOwn = String(accountId) === targetId;
      if (!isSuperuser(req) && !isOwn) {
        return res.status(403).json({ error: 'Can only view your own coach recommendations.' });
      }
      if (!isSuperuser(req) && !(await isProAccount(accountId))) {
        return res.status(402).json({
          error: 'Coach recommendations require Pro membership.',
          paywall: true, feature: 'coach_recommendations', signed_in: true,
        });
      }
      res.json(await _buildCoachRecommendations(targetId));
    } catch (err) {
      console.error('[API] players/:id/coach-recommendations:', err.message);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  function _coachMatchReasons(student, coach, weakestDims = []) {
    const reasons = [];
    const sm = Number(student.mmr) || 0;
    const cm = Number(coach.mmr) || 0;
    if (sm && cm && cm > sm && cm - sm < 1500) reasons.push(`+${cm - sm} MMR above you`);
    const overlap = (student.top_heroes || []).filter(h =>
      (coach.hero_pool || []).map(Number).includes(Number(h))).length;
    if (overlap > 0) reasons.push(`${overlap} of your top 5 heroes`);
    if (student.primary_position != null && Array.isArray(coach.positions)
        && coach.positions.map(Number).includes(Number(student.primary_position))) {
      reasons.push(`Plays your position (${student.primary_position})`);
    }
    if ((Number(coach.review_count) || 0) >= 5) reasons.push(`${coach.review_count}+ reviews`);
    // Surface the student's weakest dimensions so the user understands
    // *what* this coach can help with (review fix).
    for (const d of (weakestDims || []).slice(0, 1)) {
      if (d && d.delta_pct < 0) reasons.push(`Can help with ${d.label} (${d.delta_pct}% vs peers)`);
    }
    return reasons;
  }

  // ---------------------------------------------------------------
  // 4 — Org sponsorships
  // ---------------------------------------------------------------
  router.post('/sponsorships/checkout', express.json(), requireAuth, async (req, res) => {
    try {
      const sponsorAccountId = req.session.accountId;
      // Review fix: only sponsors that have completed org-onboarding moderation
      // (or superusers) may purchase a sponsorship slot. This prevents random
      // accounts from putting paid copy on someone else's profile.
      if (!isSuperuser(req) && !(await magV3.isApprovedOrgSponsor(sponsorAccountId))) {
        return res.status(403).json({
          error: 'Your organisation must be approved before purchasing sponsorship slots.',
          needs_org_onboarding: true,
        });
      }
      const { targetAccountId, headline, bodyMd, imageUrl, linkUrl } = req.body || {};
      if (!targetAccountId || !headline) {
        return res.status(400).json({ error: 'targetAccountId and headline are required' });
      }
      if (typeof headline !== 'string' || headline.length > 80) {
        return res.status(400).json({ error: 'headline must be a string ≤80 chars' });
      }
      if (bodyMd && (typeof bodyMd !== 'string' || bodyMd.length > 500)) {
        return res.status(400).json({ error: 'bodyMd must be ≤500 chars' });
      }
      // SECURITY (round-4): reject non-http(s) link/image URLs server-side.
      if (linkUrl && !_isSafeHttpUrl(linkUrl)) {
        return res.status(400).json({ error: 'linkUrl must be an absolute http(s) URL' });
      }
      if (imageUrl && !_isSafeHttpUrl(imageUrl)) {
        return res.status(400).json({ error: 'imageUrl must be an absolute http(s) URL' });
      }
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
      const baseUrl = getSiteUrl();
      // Connect rev-share (round-4): if the sponsorship target is a
      // payouts-active coach (i.e. has Stripe Connect Express set up via the
      // coaching marketplace), route SPONSORSHIP_REVSHARE_BPS basis points of
      // each monthly invoice to them as a destination charge with an
      // application fee. Players without Connect onboarding still receive
      // 100% platform retention so the existing flow continues to work.
      let revshareConfig = null;
      try {
        if (typeof db.getCoachByAccountId === 'function') {
          const coach = await db.getCoachByAccountId(targetAccountId);
          if (coach?.stripe_account_id && coach?.status === 'active') {
            const targetBps = SPONSORSHIP_REVSHARE_BPS;
            const platformFeeCents = Math.round(
              SPONSORSHIP_MONTHLY_PRICE_CENTS * (10000 - targetBps) / 10000
            );
            revshareConfig = {
              destination: coach.stripe_account_id,
              application_fee_percent: Math.round((10000 - targetBps) / 100),
              platform_fee_cents: platformFeeCents,
              target_share_cents: SPONSORSHIP_MONTHLY_PRICE_CENTS - platformFeeCents,
            };
          }
        }
      } catch { /* fall through — no rev share */ }
      const sessionParams = {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            recurring: { interval: 'month' },
            product_data: {
              name: 'OCE Inhouse — Org Sponsorship Slot (monthly)',
              description: 'One profile sponsorship slot, billed monthly. Cancel anytime.',
            },
            unit_amount: SPONSORSHIP_MONTHLY_PRICE_CENTS,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/sponsorships/sent?checkout=success`,
        cancel_url: `${baseUrl}/sponsorships/sent?checkout=cancelled`,
        metadata: {
          purpose: 'org_sponsorship',
          sponsor_account_id: String(sponsorAccountId),
          target_account_id: String(targetAccountId),
          revshare_target_bps: revshareConfig ? String(SPONSORSHIP_REVSHARE_BPS) : '0',
        },
      };
      if (revshareConfig) {
        // Subscription destination charges: routes funds to the connected
        // account, applies an application_fee_percent that stays with the
        // platform. Same plumbing the coaching booking checkout uses.
        sessionParams.subscription_data = {
          application_fee_percent: revshareConfig.application_fee_percent,
          transfer_data: { destination: revshareConfig.destination },
        };
      }
      const session = await stripe.checkout.sessions.create(sessionParams);
      const row = await magV3.createSponsorshipPending({
        sponsorAccountId, targetAccountId,
        headline, bodyMd, imageUrl, linkUrl,
        stripeSessionId: session.id,
      });
      res.json({ url: session.url, sponsorship_id: row.id });
    } catch (err) {
      console.error('[API] sponsorships/checkout:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout' });
    }
  });

  router.get('/me/sponsorships/inbox', requireAuth, async (req, res) => {
    try {
      const rows = await magV3.getInboundSponsorships(req.session.accountId);
      res.json({ sponsorships: rows });
    } catch (err) {
      console.error('[API] sponsorships/inbox:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sponsorships/:id/accept', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const row = await magV3.acceptSponsorship(id, req.session.accountId);
      if (!row) return res.status(404).json({ error: 'No matching pending sponsorship for this account.' });
      res.json({ sponsorship: row });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sponsorships/:id/decline', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const row = await magV3.declineSponsorship(id, req.session.accountId);
      if (!row) return res.status(404).json({ error: 'No matching sponsorship for this account.' });
      res.json({ sponsorship: row });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/players/:id/sponsorships', async (req, res) => {
    try {
      const accountId = parseInt(req.params.id, 10);
      const rows = await magV3.getActiveSponsorshipsForTarget(accountId);
      // Public — only safe fields (no internal IDs / sponsor account).
      res.json({
        sponsorships: rows.map(r => ({
          headline: r.headline, body_md: r.body_md,
          image_url: r.image_url, link_url: r.link_url,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin moderation queue.
  router.get('/admin/sponsorships/pending', async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'Superuser only' });
    try {
      const rows = await magV3.listPendingModerationSponsorships();
      res.json({ sponsorships: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/admin/sponsorships/:id/moderate', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'Superuser only' });
    try {
      const id = parseInt(req.params.id, 10);
      const { approve, notes } = req.body || {};
      const row = await magV3.moderateSponsorship(id, {
        approve: !!approve,
        moderatorAccountId: req.session?.accountId || null,
        notes,
      });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json({ sponsorship: row });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------------------------------------------------------------
  // 5 — Pro embed widget
  // ---------------------------------------------------------------
  // Drift closure (Task #157 round-3): vanity slug + theme accent + referral
  // attribution. Resolves either a numeric account_id OR a nickname slug, lets
  // a `?theme=#hex` query override the embed accent (validated on the server),
  // and best-effort logs `?ref=...` to embed_referral_log so the embedded user
  // can see where their views came from.
  async function _resolveEmbedTarget(idOrSlug) {
    const pool = db.getPool();
    if (/^\d+$/.test(idOrSlug)) return parseInt(idOrSlug, 10);
    const slug = String(idOrSlug).toLowerCase().slice(0, 64);
    const r = await pool.query(
      `SELECT account_id FROM nicknames
        WHERE LOWER(nickname) = $1 OR LOWER(REGEXP_REPLACE(nickname,'[^a-z0-9]','','gi')) = $1
        LIMIT 1`,
      [slug],
    ).catch(() => ({ rows: [] }));
    return r.rows[0]?.account_id || null;
  }
  app.get('/embed/:accountId', async (req, res) => {
    try {
      const accountId = await _resolveEmbedTarget(req.params.accountId);
      if (!accountId) return res.status(400).send('Bad account id');
      // Embed is itself a Pro perk for the *embedded user* — only Pro accounts
      // can be embedded externally.
      const isPro = await isProAccount(accountId);
      if (!isPro) {
        res.removeHeader('X-Frame-Options');
        return res
          .status(404)
          .type('html')
          .send('<!doctype html><meta charset="utf-8"><title>Embed unavailable</title>' +
                '<body style="font-family:system-ui;padding:1rem;color:#666;background:#fff">' +
                'This profile does not have an embeddable widget enabled.</body>');
      }
      const pool = db.getPool();
      const profile = await pool.query(
        `SELECT COALESCE(n.nickname, ps.persona_name) AS name,
                MAX(ps.id) AS pid
           FROM player_stats ps
           LEFT JOIN nicknames n ON n.account_id = ps.account_id
          WHERE ps.account_id = $1
          GROUP BY n.nickname, ps.persona_name
          LIMIT 1`,
        [accountId]
      );
      const ratingRow = await pool.query(
        `SELECT MAX(mmr)::int AS mmr,
                COALESCE(SUM(wins), 0)::int AS wins,
                COALESCE(SUM(losses), 0)::int AS losses
           FROM ratings WHERE player_id::text = $1::text`,
        [String(accountId)]
      );
      const name = profile.rows[0]?.name || ('Player ' + accountId);
      const mmr = ratingRow.rows[0]?.mmr || null;
      const wins = ratingRow.rows[0]?.wins || 0;
      const losses = ratingRow.rows[0]?.losses || 0;
      const total = wins + losses;
      const wr = total ? Math.round((wins / total) * 1000) / 10 : 0;
      const baseUrl = getSiteUrl();

      // Theme accent: query param wins, then per-account customization, then
      // brass default. Strict #rrggbb validation prevents CSS injection.
      let accent = '#c5a975';
      const safeHex = (s) => (typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)) ? s : null;
      const themeQ = safeHex(req.query.theme);
      if (themeQ) accent = themeQ;
      else {
        try {
          const cust = await pool.query(
            `SELECT theme_accent FROM profile_customization WHERE account_id = $1`, [accountId],
          );
          const custAccent = safeHex(cust.rows[0]?.theme_accent);
          if (custAccent) accent = custAccent;
        } catch {}
      }
      // Referral attribution — fire-and-forget log row, gracefully degrade if
      // the optional log table is missing.
      const ref = String(req.query.ref || '').slice(0, 64);
      if (ref) {
        pool.query(
          `INSERT INTO embed_referral_log (account_id, ref, ts) VALUES ($1, $2, NOW())`,
          [accountId, ref],
        ).catch(() => {});
      }
      // Round-8: support spec'd embed format variants. `?format=` selects:
      //   card     — default compact 420×~96 horizontal card
      //   portrait — 400×600 vertical "trading card" with full stats stack
      //   banner   — 800×120 horizontal banner suitable for forum sigs
      // Themed accent colour applies to all three layouts.
      const fmt = ['card', 'portrait', 'banner'].includes(req.query.format)
        ? req.query.format : 'card';
      const playerLink = `${_esc(baseUrl)}/player/${accountId}`;
      const statsBlock =
        `${mmr != null ? `<div class="stat"><strong>${mmr}</strong>MMR</div>` : ''}` +
        `<div class="stat"><strong>${wr}%</strong>WR</div>` +
        `<div class="stat"><strong>${total}</strong>Games</div>` +
        `<div class="stat"><strong>${wins}-${losses}</strong>W-L</div>`;
      let html;
      if (fmt === 'portrait') {
        html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${_esc(name)} — OCE Inhouse</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;padding:0;background:transparent;font-family:Inter,system-ui,sans-serif}
  .card{width:400px;height:600px;box-sizing:border-box;background:#0d1424;color:#f5efe2;
        border:2px solid ${accent};border-radius:14px;padding:28px 24px;
        display:flex;flex-direction:column;justify-content:space-between}
  .head{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px}
  .name{font-weight:700;font-size:24px;margin:0;color:#f5efe2;font-family:Oswald,sans-serif;letter-spacing:.5px}
  .sub{font-size:13px;color:${accent};margin:0;text-transform:uppercase;letter-spacing:2px}
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
  .stat{background:#11192a;border:1px solid ${accent}33;border-radius:8px;padding:14px;text-align:center}
  .stat strong{display:block;font-size:28px;color:${accent};font-family:Oswald,sans-serif;margin-bottom:4px}
  .stat span{font-size:11px;color:#a8a8a8;text-transform:uppercase;letter-spacing:1.5px}
  .foot{text-align:center;font-size:11px;color:#888;border-top:1px solid ${accent}22;padding-top:14px}
  a{color:inherit;text-decoration:none}
</style></head><body><a href="${playerLink}" target="_blank"><div class="card">
  <div class="head"><p class="sub">OCE Inhouse · Pro</p><p class="name">${_esc(name)}</p></div>
  <div class="stats">
    ${mmr != null ? `<div class="stat"><strong>${mmr}</strong><span>MMR</span></div>` : ''}
    <div class="stat"><strong>${wr}%</strong><span>Win Rate</span></div>
    <div class="stat"><strong>${total}</strong><span>Games</span></div>
    <div class="stat"><strong>${wins}-${losses}</strong><span>W-L</span></div>
  </div>
  <div class="foot">View full profile →</div>
</div></a></body></html>`;
      } else if (fmt === 'banner') {
        html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${_esc(name)} — OCE Inhouse</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;padding:0;background:transparent;font-family:Inter,system-ui,sans-serif}
  .banner{width:800px;height:120px;box-sizing:border-box;background:#0d1424;color:#f5efe2;
          border:1px solid ${accent};border-radius:6px;padding:16px 24px;
          display:flex;align-items:center;gap:32px}
  .who{flex:0 0 auto}
  .name{font-weight:700;font-size:20px;margin:0;color:#f5efe2;font-family:Oswald,sans-serif}
  .sub{font-size:11px;color:${accent};margin:2px 0 0;text-transform:uppercase;letter-spacing:1.5px}
  .stats{display:flex;gap:28px;margin-left:auto}
  .stat{text-align:center}
  .stat strong{display:block;font-size:22px;color:${accent};font-family:Oswald,sans-serif}
  .stat span{font-size:10px;color:#a8a8a8;text-transform:uppercase;letter-spacing:1.2px}
  a{color:inherit;text-decoration:none}
</style></head><body><a href="${playerLink}" target="_blank"><div class="banner">
  <div class="who"><p class="name">${_esc(name)}</p><p class="sub">OCE Inhouse · Pro</p></div>
  <div class="stats">
    ${mmr != null ? `<div class="stat"><strong>${mmr}</strong><span>MMR</span></div>` : ''}
    <div class="stat"><strong>${wr}%</strong><span>WR</span></div>
    <div class="stat"><strong>${total}</strong><span>Games</span></div>
    <div class="stat"><strong>${wins}-${losses}</strong><span>W-L</span></div>
  </div>
</div></a></body></html>`;
      } else {
        html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${_esc(name)} — OCE Inhouse</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;padding:0;background:transparent;font-family:Inter,system-ui,sans-serif}
  .card{background:#0d1424;color:#f5efe2;border:1px solid ${accent};border-radius:8px;
        padding:14px 16px;display:flex;align-items:center;gap:14px;max-width:420px}
  .name{font-weight:600;font-size:15px;margin:0 0 2px;color:#f5efe2}
  .sub{font-size:12px;color:${accent};margin:0}
  .stats{display:flex;gap:12px;margin-left:auto;font-size:12px}
  .stat strong{display:block;font-size:16px;color:${accent};font-family:Oswald,sans-serif}
  a{color:inherit;text-decoration:none}
</style></head>
<body><div class="card">
  <div>
    <p class="name"><a href="${playerLink}" target="_blank">${_esc(name)}</a></p>
    <p class="sub">OCE Inhouse · Pro</p>
  </div>
  <div class="stats">${statsBlock}</div>
</div></body></html>`;
      }
      res.removeHeader('X-Frame-Options');
      res.setHeader('Content-Security-Policy', "frame-ancestors *");
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.type('html').send(html);
    } catch (err) {
      console.error('[mag-v3] embed:', err.message);
      res.status(500).send('Embed error');
    }
  });

  // ---------------------------------------------------------------
  // 6 — Pickem
  // ---------------------------------------------------------------
  router.get('/pickem/active-season', async (req, res) => {
    try {
      await magV3.ensureDefaultPickemSeason();
      const season = await magV3.getActivePickemSeason();
      res.json({ season });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/pickem/leaderboard', async (req, res) => {
    try {
      const seasonId = parseInt(req.query.season_id, 10);
      let sid = seasonId;
      if (!Number.isFinite(sid)) {
        const s = await magV3.getActivePickemSeason();
        sid = s?.id;
      }
      if (!sid) return res.json({ leaderboard: [] });
      const rows = await magV3.getPickemLeaderboard(sid, 100);
      res.json({ leaderboard: rows, season_id: sid });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/pickem/me', requireAuth, async (req, res) => {
    try {
      const s = await magV3.getActivePickemSeason();
      if (!s) return res.json({ picks: [], season: null });
      const picks = await magV3.getMyPickemPicks(s.id, req.session.accountId);
      res.json({ picks, season: s });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/pickem/pick', express.json(), requireAuth, async (req, res) => {
    try {
      // Task #157 — Pickem submission is Pro-gated. Free users can read the
      // leaderboard and active season but cannot enter picks themselves.
      // (Fixes the "Pickem gating" finding from the rejected review.)
      const accountId = req.session.accountId;
      if (!isSuperuser(req) && !(await isProAccount(accountId))) {
        return res.status(402).json({
          error: 'Pickem entry requires Pro membership.',
          paywall: true, feature: 'pickem_entry', signed_in: true,
        });
      }
      const {
        matchRef, pickedWinner,
        pickedFirstBlood, pickedTotalKillsBucket, pickedDurationTier,
      } = req.body || {};
      if (!matchRef || !['radiant', 'dire'].includes(pickedWinner)) {
        return res.status(400).json({ error: 'matchRef and pickedWinner=radiant|dire required' });
      }
      // Round-8: validate optional side-bet dimensions against fixed enums.
      const validOrNull = (v, allowed) => v == null ? null
        : (allowed.includes(v) ? v : 'INVALID');
      const fb = validOrNull(pickedFirstBlood, ['radiant', 'dire']);
      const tk = validOrNull(pickedTotalKillsBucket, ['under', 'over']);
      const dt = validOrNull(pickedDurationTier, ['short', 'medium', 'long']);
      if (fb === 'INVALID' || tk === 'INVALID' || dt === 'INVALID') {
        return res.status(400).json({
          error: 'Invalid side bet — firstBlood=radiant|dire, totalKillsBucket=under|over, durationTier=short|medium|long',
        });
      }
      const s = await magV3.getActivePickemSeason();
      if (!s) return res.status(409).json({ error: 'No active pickem season' });
      const row = await magV3.submitPickemPick({
        seasonId: s.id, accountId: req.session.accountId,
        matchRef, pickedWinner,
        pickedFirstBlood: fb, pickedTotalKillsBucket: tk, pickedDurationTier: dt,
      });
      if (!row) return res.status(409).json({ error: 'Pick already locked.' });
      res.json({ pick: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Admin: resolve a match's picks.
  router.post('/admin/pickem/resolve', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'Superuser only' });
    try {
      const { matchRef, actualWinner, points } = req.body || {};
      if (!matchRef || !['radiant', 'dire'].includes(actualWinner)) {
        return res.status(400).json({ error: 'matchRef and actualWinner required' });
      }
      const s = await magV3.getActivePickemSeason();
      if (!s) return res.status(409).json({ error: 'No active season' });
      const updated = await magV3.resolvePickemMatch({
        seasonId: s.id, matchRef, actualWinner, points: points || 10,
      });
      res.json({ resolved: updated.length, rows: updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ---------------------------------------------------------------
  // 7 — Verified badges
  // ---------------------------------------------------------------
  router.get('/players/:id/verified-badges', async (req, res) => {
    try {
      const accountId = parseInt(req.params.id, 10);
      const rows = await magV3.getVerifiedBadges(accountId);
      // Public — strip internal columns.
      res.json({
        badges: rows.map(b => ({
          provider: b.provider, handle: b.handle,
          verified_at: b.verified_at, source: b.source,
        })),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/verified/checkout', express.json(), requireAuth, async (req, res) => {
    try {
      const { provider, handle } = req.body || {};
      if (!ALLOWED_VERIFIED_PROVIDERS.has(provider)) {
        return res.status(400).json({ error: `provider must be one of ${[...ALLOWED_VERIFIED_PROVIDERS].join(', ')}` });
      }
      if (typeof handle !== 'string' || handle.length < 1 || handle.length > 64) {
        return res.status(400).json({ error: 'handle must be 1-64 chars' });
      }
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
      const baseUrl = getSiteUrl();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: `OCE Inhouse — Verified ${provider} badge`,
              description: `One-off verified badge linking your OCE Inhouse profile to @${handle} on ${provider}.`,
            },
            unit_amount: VERIFIED_BADGE_PRICE_CENTS,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/settings/profile?verified=${provider}`,
        cancel_url: `${baseUrl}/settings/profile?verified=cancelled`,
        metadata: {
          purpose: 'verified_badge',
          account_id: String(req.session.accountId),
          provider, handle,
        },
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] verified/checkout:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // OAuth-style verification — graceful: returns 503 when secrets missing
  // so the frontend can fall back to the paid path.
  router.post('/verified/oauth/start', express.json(), requireAuth, async (req, res) => {
    const { provider } = req.body || {};
    if (!ALLOWED_VERIFIED_PROVIDERS.has(provider)) {
      return res.status(400).json({ error: 'Bad provider' });
    }
    const envKey = `${provider.toUpperCase()}_OAUTH_CLIENT_ID`;
    if (!process.env[envKey]) {
      return res.status(503).json({
        error: `${provider} OAuth not configured. Use the paid verification path instead.`,
        oauth_unavailable: true,
      });
    }
    res.status(501).json({ error: 'OAuth flow not yet wired in this build.' });
  });

  // ---------------------------------------------------------------
  // 7 (round-4) — Code-challenge verification flow.
  // OAuth alternative that works without per-provider client IDs.
  // Flow: (1) user posts handle + public profile URL; we issue a one-time
  // code. (2) user pastes the code on that public profile. (3) user hits
  // /check; we fetch the URL and match the substring. (4) on success we
  // upsert the verified_badges row to status='verified' (180-day expiry).
  // ---------------------------------------------------------------
  router.post('/verified/challenge/start', express.json(), requireAuth, async (req, res) => {
    try {
      const { provider, handle, proofUrl } = req.body || {};
      const ch = await magV3.createVerificationChallenge({
        accountId: req.session.accountId,
        provider, handle, proofUrl,
      });
      res.json({
        challenge_id: ch.id,
        provider: ch.provider,
        challenge_code: ch.challenge_code,
        proof_url: ch.proof_url,
        expires_at: ch.expires_at,
        instructions: `Paste the code "${ch.challenge_code}" anywhere on the public profile at ${ch.proof_url} and then call /api/verified/challenge/check.`,
      });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Failed to create challenge' });
    }
  });

  router.post('/verified/challenge/check', express.json(), requireAuth, async (req, res) => {
    try {
      const { provider } = req.body || {};
      const ch = await magV3.getActiveVerificationChallenge(req.session.accountId, provider);
      if (!ch) {
        return res.status(404).json({ error: 'No active challenge — start one first.' });
      }
      // Bound attempts so this can't be used to hammer arbitrary URLs.
      if ((ch.attempts_count || 0) >= 6) {
        return res.status(429).json({ error: 'Too many attempts — wait for the challenge to expire.' });
      }
      // SECURITY (round-5 review): SSRF hardening. Even though the URL was
      // validated as http(s) at /start time, an attacker could still target
      // internal services (localhost, 169.254.x metadata endpoints, RFC1918
      // ranges). Resolve the hostname and reject any address that's not a
      // public unicast IP before we ever issue the request.
      try {
        await _assertPublicHttpUrl(ch.proof_url);
      } catch (e) {
        await db.getPool().query(
          `UPDATE verified_badge_challenges
              SET attempts_count = attempts_count + 1, last_attempt_at = NOW()
            WHERE id = $1`, [ch.id]);
        return res.status(400).json({ error: `Proof URL rejected: ${e.message}` });
      }
      // Best-effort fetch with a tight timeout. Fetch is built-in on Node 18+.
      let body = '';
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(ch.proof_url, {
          signal: ctrl.signal,
          redirect: 'error', // don't follow into private ranges
          headers: { 'User-Agent': 'OCEInhouse-Verifier/1.0' },
        });
        clearTimeout(timer);
        if (r.ok) body = (await r.text()).slice(0, 200_000);
      } catch (e) {
        // Increment attempt counter so a broken URL doesn't loop forever.
        await db.getPool().query(
          `UPDATE verified_badge_challenges
              SET attempts_count = attempts_count + 1, last_attempt_at = NOW()
            WHERE id = $1`, [ch.id]);
        return res.status(502).json({ error: `Could not fetch proof URL: ${e.message}` });
      }
      const found = body.includes(ch.challenge_code);
      await db.getPool().query(
        `UPDATE verified_badge_challenges
            SET attempts_count = attempts_count + 1, last_attempt_at = NOW()
          WHERE id = $1`, [ch.id]);
      if (!found) {
        return res.status(400).json({
          error: `Challenge code "${ch.challenge_code}" not found at the proof URL. Make sure it is publicly visible (no privacy gates) and try again.`,
        });
      }
      const result = await magV3.completeVerificationChallenge(ch.id);
      res.json({ verified: true, challenge: result });
    } catch (err) {
      console.error('[API] verified/challenge/check:', err.message);
      res.status(500).json({ error: err.message || 'Verification failed' });
    }
  });

  // ---------------------------------------------------------------
  // Round-4 — Weekly report opt-in & email setter.
  // ---------------------------------------------------------------
  router.get('/me/email', requireAuth, async (req, res) => {
    try {
      const email = await magV3.getUserEmail(req.session.accountId);
      res.json({ email });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/me/email', express.json(), requireAuth, async (req, res) => {
    try {
      const row = await magV3.setUserEmail(req.session.accountId, req.body?.email);
      res.json({ ok: true, email: row.email });
    } catch (err) {
      res.status(400).json({ error: err.message || 'Bad email' });
    }
  });

  // ---------------------------------------------------------------
  // 8 — One-off perks listing for self + generic checkout.
  // ---------------------------------------------------------------
  router.get('/me/perks', requireAuth, async (req, res) => {
    try {
      const rows = await magV3.listOneOffPerks(req.session.accountId);
      res.json({ perks: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Generic one-off perk checkout (review fix). Supports any catalogued
  // cosmetic perk so feature-8 infra is actually consumed beyond the
  // verified badge. Stripe webhook routes back through `one_off_perk`.
  // Catalogue is intentionally tiny and server-controlled — never trust
  // client to choose price.
  // Round-8: aligned to the spec'd one-off cosmetic catalog —
  // themes, animated cover FX packs, trophy frames, achievement borders,
  // voice packs, vanity-URL slugs, spotlight credits. Pre-existing keys
  // are kept for backward compat with already-issued perks.
  const ONE_OFF_PERK_CATALOG = {
    // ---- Spec'd round-8 cosmetics ----
    'cosmetic:theme_pack':          { name: 'Profile Theme Pack',       cents: 700 },
    'cosmetic:cover_fx_pack':       { name: 'Animated Cover FX Pack',   cents: 900 },
    'cosmetic:trophy_frame':        { name: 'Trophy Frame',             cents: 600 },
    'cosmetic:achievement_border':  { name: 'Achievement Border',       cents: 500 },
    'cosmetic:voice_pack':          { name: 'Hero Voice Pack',          cents: 800 },
    'cosmetic:vanity_url':          { name: 'Vanity URL Slug',          cents: 1200 },
    'cosmetic:spotlight_credit':    { name: 'Spotlight Credit',         cents: 1500 },
    // ---- Earlier rounds (kept for back-compat) ----
    'cosmetic:profile_glow':        { name: 'Profile Glow Effect',      cents: 500 },
    'cosmetic:animated_avatar':     { name: 'Animated Avatar Frame',    cents: 800 },
    'cosmetic:scoreboard_theme':    { name: 'Scoreboard Theme Pack',    cents: 600 },
    'cosmetic:patch_note_shoutout': { name: 'Patch Note Shoutout',      cents: 1500 },
    'cosmetic:profile_banner':      { name: 'Profile Banner Image',     cents: 700 },
    'cosmetic:custom_title':        { name: 'Custom Profile Title',     cents: 600 },
    'cosmetic:hero_loadout_pin':    { name: 'Extra Pinned Hero Slot',   cents: 400 },
    'cosmetic:match_pin':           { name: 'Extra Pinned Match Slot',  cents: 400 },
    'cosmetic:embed_theme':         { name: 'Custom Embed Accent',      cents: 500 },
    'cosmetic:replay_pack_10':      { name: '10-pack Replay Quota',     cents: 300 },
  };
  router.get('/perks/catalog', (req, res) => {
    res.json({ perks: Object.entries(ONE_OFF_PERK_CATALOG).map(([k, v]) => ({ key: k, ...v })) });
  });
  router.post('/perks/checkout', express.json(), requireAuth, async (req, res) => {
    try {
      const accountId = req.session.accountId;
      const perkKey = String(req.body?.perkKey || '');
      const perk = ONE_OFF_PERK_CATALOG[perkKey];
      if (!perk) return res.status(400).json({ error: 'Unknown perkKey' });
      // If user already owns this active perk, refuse.
      if (await magV3.hasOneOffPerk(accountId, perkKey)) {
        return res.status(409).json({ error: 'You already own this perk.' });
      }
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: 'Payments are not configured.' });
      const baseUrl = getSiteUrl();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: { name: perk.name },
            unit_amount: perk.cents,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/profile?perk=success`,
        cancel_url: `${baseUrl}/profile?perk=cancelled`,
        metadata: {
          purpose: 'one_off_perk',
          account_id: String(accountId),
          perk_key: perkKey,
        },
      });
      await magV3.createOneOffPerkPending({
        accountId, perkKey,
        stripeSessionId: session.id,
        amountCents: perk.cents, currency: 'aud',
        metadata: { name: perk.name },
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('[API] perks/checkout:', err.message);
      res.status(500).json({ error: err.message || 'Failed to create checkout' });
    }
  });

  // ---------------------------------------------------------------
  // 7 (review fix) — Verified-badge admin approval routes.
  // Replaces the old "buy verified instantly" model: paid checkout files
  // a pending request, a superuser must explicitly approve or reject.
  // OAuth flow remains the alternate fast-path (still 503 until configured).
  // ---------------------------------------------------------------
  router.get('/admin/verified/pending', async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const rows = await magV3.listPendingVerifications();
      res.json({ pending: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/admin/verified/:id/approve', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const id = parseInt(req.params.id, 10);
      const row = await magV3.approveVerification(id, req.session?.accountId || 0);
      if (!row) return res.status(404).json({ error: 'No matching pending request.' });
      res.json({ verified: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/admin/verified/:id/reject', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const id = parseInt(req.params.id, 10);
      const row = await magV3.rejectVerification(id, req.session?.accountId || 0, req.body?.reason || null);
      if (!row) return res.status(404).json({ error: 'No matching pending request.' });
      res.json({ rejected: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ---------------------------------------------------------------
  // 4 (review fix) — Org sponsor onboarding application + moderation.
  // ---------------------------------------------------------------
  router.post('/orgs/onboard', express.json(), requireAuth, async (req, res) => {
    try {
      const ownerAccountId = req.session.accountId;
      const { orgName, website, contactEmail, description } = req.body || {};
      if (!orgName || typeof orgName !== 'string' || orgName.length > 80) {
        return res.status(400).json({ error: 'orgName required (≤80 chars)' });
      }
      if (description && (typeof description !== 'string' || description.length > 1000)) {
        return res.status(400).json({ error: 'description ≤1000 chars' });
      }
      const row = await magV3.createOrgSponsorApplication({
        ownerAccountId, orgName, website: website || null,
        contactEmail: contactEmail || null, description: description || null,
      });
      res.json({ application: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.get('/admin/orgs/pending', async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const rows = await magV3.listPendingOrgSponsors();
      res.json({ pending: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  router.post('/admin/orgs/:id/moderate', express.json(), async (req, res) => {
    if (!isSuperuser(req)) return res.status(403).json({ error: 'forbidden' });
    try {
      const id = parseInt(req.params.id, 10);
      const { approve, notes } = req.body || {};
      const row = await magV3.moderateOrgSponsor(id, {
        approve: !!approve, moderatorAccountId: req.session?.accountId || 0,
        notes: notes || null,
      });
      if (!row) return res.status(404).json({ error: 'No such application.' });
      res.json({ application: row });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}

function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = {
  applyMagazineV3Schema,
  createMagazineV3Db,
  mountMagazineV3Routes,
  handleStripeWebhookPurpose,
  scoreCoachMatch,
  startWeeklyReportWorker,
  validateWeeklyReportJson,
  WEEKLY_REPORT_SCHEMA,
  REPLAY_RATE_LIMIT_PER_DAY,
  ALLOWED_VERIFIED_PROVIDERS,
  VERIFIED_BADGE_PRICE_CENTS,
  SPONSORSHIP_MONTHLY_PRICE_CENTS,
  _isSafeHttpUrl,
  _assertPublicHttpUrl,
  _isPrivateIp,
};
