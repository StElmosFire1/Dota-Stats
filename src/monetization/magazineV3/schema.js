/**
 * Schema migrations for the Magazine v3 monetization bundle.
 *
 * Kept in a single file (per task spec) so a single `applyMagazineV3Schema`
 * call on boot does the right thing for every feature, even though each
 * feature's runtime code lives in its own sibling module.
 *
 * Idempotent CREATE TABLE / ALTER TABLE statements — mirrors the pattern
 * used throughout init() in src/db/index.js.
 */

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

module.exports = { applyMagazineV3Schema };
