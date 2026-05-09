const { Pool } = require('pg');

let pool = null;

function decodeByteString(val) {
  if (!val || typeof val !== 'string') return val;
  if (!val.includes('"bytes"')) return val;
  try {
    const parsed = JSON.parse(val);
    if (parsed.bytes && Array.isArray(parsed.bytes)) {
      return Buffer.from(parsed.bytes.map(b => b < 0 ? b + 256 : b)).toString('utf8');
    }
  } catch {}
  return val;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  }
  return pool;
}

async function init() {
  const p = getPool();
  try {
    await p.query('SELECT 1');
    console.log('[DB] PostgreSQL connected.');

    await p.query(`
      CREATE TABLE IF NOT EXISTS matches (
        match_id VARCHAR(50) PRIMARY KEY,
        date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        duration INTEGER DEFAULT 0,
        game_mode INTEGER DEFAULT 0,
        radiant_win BOOLEAN DEFAULT false,
        lobby_name VARCHAR(255) DEFAULT '',
        recorded_by VARCHAR(100) DEFAULT '',
        parse_method VARCHAR(50) DEFAULT '',
        file_hash VARCHAR(64),
        patch VARCHAR(20),
        season_id INTEGER
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS player_stats (
        id SERIAL PRIMARY KEY,
        match_id VARCHAR(50) NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
        account_id BIGINT DEFAULT 0,
        discord_id VARCHAR(100) DEFAULT '',
        persona_name VARCHAR(255) DEFAULT '',
        hero_id INTEGER DEFAULT 0,
        hero_name VARCHAR(100) DEFAULT '',
        team VARCHAR(20) DEFAULT 'radiant',
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        last_hits INTEGER DEFAULT 0,
        denies INTEGER DEFAULT 0,
        gpm INTEGER DEFAULT 0,
        xpm INTEGER DEFAULT 0,
        hero_damage INTEGER DEFAULT 0,
        tower_damage INTEGER DEFAULT 0,
        hero_healing INTEGER DEFAULT 0,
        level INTEGER DEFAULT 0,
        net_worth INTEGER DEFAULT 0,
        position INTEGER DEFAULT 0,
        is_captain BOOLEAN DEFAULT false,
        obs_placed INTEGER DEFAULT 0,
        sen_placed INTEGER DEFAULT 0,
        creeps_stacked INTEGER DEFAULT 0,
        camps_stacked INTEGER DEFAULT 0,
        damage_taken INTEGER DEFAULT 0,
        slot INTEGER DEFAULT 0,
        rune_pickups INTEGER DEFAULT 0,
        stun_duration REAL DEFAULT 0,
        towers_killed INTEGER DEFAULT 0,
        roshans_killed INTEGER DEFAULT 0,
        teamfight_participation REAL DEFAULT 0,
        firstblood_claimed INTEGER DEFAULT 0,
        wards_killed INTEGER DEFAULT 0,
        obs_purchased INTEGER DEFAULT 0,
        sen_purchased INTEGER DEFAULT 0,
        buybacks INTEGER DEFAULT 0,
        courier_kills INTEGER DEFAULT 0,
        tp_scrolls_used INTEGER DEFAULT 0,
        double_kills INTEGER DEFAULT 0,
        triple_kills INTEGER DEFAULT 0,
        ultra_kills INTEGER DEFAULT 0,
        rampages INTEGER DEFAULT 0,
        kill_streak INTEGER DEFAULT 0,
        smoke_kills INTEGER DEFAULT 0,
        first_death INTEGER DEFAULT 0,
        lane_cs_10min INTEGER DEFAULT 0,
        has_scepter BOOLEAN DEFAULT false,
        has_shard BOOLEAN DEFAULT false,
        laning_nw INTEGER
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        player_id BIGINT PRIMARY KEY,
        discord_id VARCHAR(100) DEFAULT '',
        display_name VARCHAR(255) DEFAULT '',
        mu REAL DEFAULT 25,
        sigma REAL DEFAULT 8.333,
        mmr REAL DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await p.query(`
      ALTER TABLE matches ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);
    `);
    await p.query(`DROP INDEX IF EXISTS idx_matches_file_hash`);
    await p.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_file_hash_unique ON matches(file_hash) WHERE file_hash IS NOT NULL;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS nicknames (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL UNIQUE,
        nickname VARCHAR(64) NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        discord_id VARCHAR(100) NOT NULL UNIQUE,
        discord_name VARCHAR(255) DEFAULT '',
        steam_id_64 VARCHAR(20) NOT NULL,
        account_id_32 VARCHAR(20) NOT NULL,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS match_deletions (
        id SERIAL PRIMARY KEY,
        match_id VARCHAR NOT NULL,
        match_data JSONB,
        deleted_by VARCHAR,
        reason VARCHAR,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS is_captain BOOLEAN DEFAULT false`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS obs_placed INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS sen_placed INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS creeps_stacked INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS camps_stacked INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS damage_taken INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS slot INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS rune_pickups INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS stun_duration REAL DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS towers_killed INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS roshans_killed INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS teamfight_participation REAL DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS firstblood_claimed INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS wards_killed INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS obs_purchased INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS sen_purchased INTEGER DEFAULT 0`);

    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS buybacks INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS courier_kills INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS tp_scrolls_used INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS double_kills INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS triple_kills INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS ultra_kills INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS rampages INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS kill_streak INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS smoke_kills INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS first_death INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS lane_cs_10min INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS has_scepter BOOLEAN DEFAULT false`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS has_shard BOOLEAN DEFAULT false`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS support_gold_spent INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS killed_by JSONB DEFAULT '{}'`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS hook_attempts INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS hook_hits INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS hook_cast_times JSONB DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS hook_cast_log JSONB DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS dieback_count INTEGER DEFAULT 0`);
    // PERF — Positive Impact Score (1.0–10.0) and breakdown per player_stats row.
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS perf NUMERIC(3,1) DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS perf_breakdown JSONB DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS perf_source TEXT DEFAULT NULL`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_player_stats_perf ON player_stats(account_id, perf) WHERE perf IS NOT NULL`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_player_stats_perf_null ON player_stats(match_id) WHERE perf IS NULL`);
    // Position baselines — per-position, per-minute-bucket distribution snapshots.
    // Reserved for the future timeline_v1 path; created empty now so the migration
    // is a no-op upgrade. Maintenance jobs will populate this table.
    await p.query(`
      CREATE TABLE IF NOT EXISTS position_baselines (
        position SMALLINT NOT NULL,
        minute_bucket SMALLINT NOT NULL,
        stat_key TEXT NOT NULL,
        p10 REAL,
        p25 REAL,
        p50 REAL,
        p75 REAL,
        p90 REAL,
        p99 REAL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (position, minute_bucket, stat_key)
      );
    `);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS replay_file_path TEXT DEFAULT NULL`);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS replay_file_expires_at TIMESTAMPTZ DEFAULT NULL`);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS replay_path TEXT DEFAULT NULL`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS patch_notes (
        id SERIAL PRIMARY KEY,
        version VARCHAR(20) NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        author VARCHAR(100),
        published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS scheduled_games (
        id SERIAL PRIMARY KEY,
        scheduled_at TIMESTAMPTZ NOT NULL,
        note TEXT DEFAULT '',
        created_by VARCHAR(200) DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_cancelled BOOLEAN NOT NULL DEFAULT FALSE
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS match_ratings (
        id SERIAL PRIMARY KEY,
        match_id VARCHAR NOT NULL,
        rater_account_id BIGINT NOT NULL,
        rated_account_id BIGINT NOT NULL,
        attitude_score INTEGER CHECK (attitude_score BETWEEN 1 AND 10),
        is_mvp_vote BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (match_id, rater_account_id, rated_account_id)
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS match_dm_log (
        id SERIAL PRIMARY KEY,
        match_id VARCHAR NOT NULL,
        account_id BIGINT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (match_id, account_id)
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS player_items (
        id SERIAL PRIMARY KEY,
        match_id VARCHAR NOT NULL,
        slot INTEGER NOT NULL,
        item_slot INTEGER NOT NULL,
        item_id INTEGER DEFAULT 0,
        item_name VARCHAR DEFAULT '',
        purchase_time INTEGER DEFAULT 0,
        enhancement_level INTEGER DEFAULT 0,
        UNIQUE(match_id, slot, item_slot)
      );
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS player_abilities (
        id SERIAL PRIMARY KEY,
        match_id VARCHAR NOT NULL,
        slot INTEGER NOT NULL,
        ability_name VARCHAR NOT NULL,
        ability_level INTEGER NOT NULL,
        time INTEGER DEFAULT 0
      );
    `);

    await p.query(`CREATE INDEX IF NOT EXISTS idx_player_items_match ON player_items(match_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_player_abilities_match ON player_abilities(match_id)`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        active BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS patch VARCHAR(20)`);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES seasons(id)`);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS team_abilities JSONB`);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false`);
    await p.query(`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false`);

    // Multi-tier seasons (1.6) — each season can have N tiers (default 8 for S10).
    // S10 tier placement is based on inhouse TrueSkill MMR via `min_mmr`. The
    // legacy `rank_floor`/`rank_ceiling` columns are kept for back-compat with any
    // pre-S10 row that was seeded under the original 3-tier rank_tier model and
    // are simply ignored when `min_mmr` is set.
    await p.query(`
      CREATE TABLE IF NOT EXISTS season_tiers (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        tier_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        rank_floor INTEGER,
        rank_ceiling INTEGER,
        prize_pool_cents INTEGER NOT NULL DEFAULT 0,
        buyin_cents INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(season_id, tier_number)
      )
    `);
    // S10 8-tier MMR-based placement: add min_mmr column on the existing table.
    // Idempotent — safe to run on legacy rows; existing rank_floor data is left
    // untouched and ignored once min_mmr is populated.
    await p.query(`ALTER TABLE season_tiers ADD COLUMN IF NOT EXISTS min_mmr INTEGER`);
    await p.query(`ALTER TABLE season_tiers ADD COLUMN IF NOT EXISTS sponsor_name TEXT`);
    await p.query(`ALTER TABLE season_tiers ADD COLUMN IF NOT EXISTS sponsor_active_from TIMESTAMPTZ`);
    await p.query(`ALTER TABLE season_tiers ADD COLUMN IF NOT EXISTS sponsor_active_until TIMESTAMPTZ`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS gift_purchases (
        id SERIAL PRIMARY KEY,
        gifter_account_id BIGINT NOT NULL,
        recipient_account_id BIGINT NOT NULL,
        gift_type VARCHAR(50) NOT NULL,
        stripe_session_id VARCHAR(200) UNIQUE,
        amount_cents INTEGER,
        currency VARCHAR(10) DEFAULT 'aud',
        status VARCHAR(20) DEFAULT 'pending',
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_gift_purchases_recipient ON gift_purchases(recipient_account_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_gift_purchases_session ON gift_purchases(stripe_session_id)`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS frame_purchases (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL,
        frame_id VARCHAR(50) NOT NULL,
        stripe_session_id VARCHAR(200) UNIQUE,
        amount_cents INTEGER,
        currency VARCHAR(10) DEFAULT 'aud',
        status VARCHAR(20) DEFAULT 'pending',
        purchased_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(account_id, frame_id)
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_frame_purchases_account ON frame_purchases(account_id)`);

    // Season pass purchases: records players who have purchased/received the season pass.
    // This is the entitlement record that unlocks the premium season pass progression tier.
    await p.query(`
      CREATE TABLE IF NOT EXISTS season_pass_purchases (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL,
        season_number INTEGER NOT NULL,
        stripe_session_id VARCHAR(200) UNIQUE,
        gift_stripe_session_id VARCHAR(200),
        source VARCHAR(50) NOT NULL DEFAULT 'purchase',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(account_id, season_number)
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_spp_account ON season_pass_purchases(account_id)`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS season_tier_players (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        tier_number INTEGER NOT NULL,
        account_id BIGINT NOT NULL,
        placement_rank_tier INTEGER,
        override_admin_id TEXT,
        placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(season_id, account_id)
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_season_tier_players_season_tier ON season_tier_players(season_id, tier_number)`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS match_draft (
        id SERIAL PRIMARY KEY,
        match_id VARCHAR(50) NOT NULL,
        hero_id INTEGER NOT NULL,
        is_pick BOOLEAN NOT NULL,
        order_num INTEGER DEFAULT 0,
        team INTEGER DEFAULT 0
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_match_draft_match_id ON match_draft(match_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_match_draft_hero_id ON match_draft(hero_id)`);
    await p.query(`
      DELETE FROM match_draft WHERE id NOT IN (
        SELECT MIN(id) FROM match_draft GROUP BY match_id, order_num
      )
    `);
    await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_match_draft_unique ON match_draft(match_id, order_num)`);

    // Migrate old match_draft rows where team was stored as raw rawTeam value (not 0/1).
    // draft_active_team is unreliable so we cross-reference picks with player_stats, then
    // apply the CM sequence pattern for bans.
    {
      const CM_PAT = [0,1,0,1,0,1,0, 0,1, 1,0,1, 1,0,0,1,1,0, 0,1,0,1, 0,1];
      // Find matches where any pick's stored team disagrees with the player's actual team.
      // This catches both raw-value rows (team=2/3) AND rows wrongly converted by an old migration.
      const staleMatches = await p.query(`
        SELECT DISTINCT md.match_id
        FROM match_draft md
        JOIN player_stats ps ON ps.match_id = md.match_id AND ps.hero_id = md.hero_id
        WHERE md.is_pick = true
          AND md.team != CASE WHEN ps.team = 'radiant' THEN 0 ELSE 1 END
      `);
      for (const { match_id } of staleMatches.rows) {
        // Build heroTeamMap from player_stats
        const pRows = await p.query(
          `SELECT hero_id, team FROM player_stats WHERE match_id = $1`, [match_id]
        );
        const heroTeamMap = {};
        for (const r of pRows.rows) {
          if (r.hero_id > 0) heroTeamMap[r.hero_id] = r.team;
        }
        // Fix picks using heroTeamMap
        await p.query(
          `UPDATE match_draft md SET team = sub.t FROM (
             SELECT md2.order_num,
               CASE WHEN ps.team = 'radiant' THEN 0 ELSE 1 END AS t
             FROM match_draft md2
             JOIN player_stats ps ON ps.match_id = md2.match_id AND ps.hero_id = md2.hero_id
             WHERE md2.match_id = $1 AND md2.is_pick = true
           ) sub WHERE md.match_id = $1 AND md.order_num = sub.order_num`,
          [match_id]
        );
        // Determine radiantFirst from corrected picks, then fix bans via CM pattern
        const allRows = await p.query(
          `SELECT order_num, hero_id, is_pick, team FROM match_draft WHERE match_id = $1 ORDER BY order_num`,
          [match_id]
        );
        let radiantFirst = null;
        for (let i = 0; i < allRows.rows.length; i++) {
          const r = allRows.rows[i];
          if (r.is_pick && (r.team === 0 || r.team === 1) && i < CM_PAT.length) {
            const isTeamA = CM_PAT[i] === 0;
            radiantFirst = r.team === 0 ? isTeamA : !isTeamA;
            break;
          }
        }
        if (radiantFirst !== null) {
          for (let i = 0; i < allRows.rows.length; i++) {
            const r = allRows.rows[i];
            if (!r.is_pick && i < CM_PAT.length) {
              const isRadiant = radiantFirst ? CM_PAT[i] === 0 : CM_PAT[i] !== 0;
              await p.query(
                `UPDATE match_draft SET team = $1 WHERE match_id = $2 AND order_num = $3`,
                [isRadiant ? 0 : 1, match_id, r.order_num]
              );
            }
          }
        }
      }
    }

    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS laning_nw INTEGER`);

    await p.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'player_stats' AND column_name = 'team'
          AND data_type = 'integer'
        ) THEN
          ALTER TABLE player_stats ALTER COLUMN team TYPE VARCHAR(20)
            USING CASE WHEN team = 0 THEN 'radiant' ELSE 'dire' END;
        END IF;
      END $$;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS rating_history (
        id SERIAL PRIMARY KEY,
        player_id BIGINT NOT NULL,
        mmr REAL NOT NULL,
        mu REAL NOT NULL,
        sigma REAL NOT NULL,
        match_id VARCHAR(50),
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_rating_history_player ON rating_history(player_id, recorded_at)`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id SERIAL PRIMARY KEY,
        player_id BIGINT NOT NULL,
        achievement_key VARCHAR(50) NOT NULL,
        achieved_at TIMESTAMPTZ DEFAULT NOW(),
        match_id VARCHAR(50),
        value REAL DEFAULT 0,
        UNIQUE(player_id, achievement_key)
      )
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS season_predictions (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        predictor_name VARCHAR(100) NOT NULL,
        predictions JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(season_id, predictor_name)
      )
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS match_predictions (
        id SERIAL PRIMARY KEY,
        match_id BIGINT NOT NULL,
        predictor_account_id BIGINT,
        predictor_name VARCHAR(100) NOT NULL,
        predicted_winner VARCHAR(10) NOT NULL,
        resolved BOOLEAN NOT NULL DEFAULT false,
        correct BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(match_id, predictor_account_id)
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_match_predictions_match ON match_predictions(match_id)`);

    await p.query(`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS buyin_amount_cents INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ`);
    await p.query(`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS match_count_limit INTEGER`);
    await p.query(`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS season_status TEXT NOT NULL DEFAULT 'pending'`);
    await p.query(`UPDATE seasons SET season_status = 'active' WHERE active = true AND season_status = 'pending'`);
    await p.query(`UPDATE seasons SET season_status = 'archived' WHERE is_legacy = true AND season_status = 'pending'`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS season_buyins (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        account_id BIGINT,
        display_name VARCHAR(100) NOT NULL,
        amount_cents INTEGER NOT NULL,
        stripe_session_id VARCHAR(200) UNIQUE,
        status VARCHAR(20) DEFAULT 'pending',
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_season_buyins_season ON season_buyins(season_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_season_buyins_account ON season_buyins(account_id)`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS season_payout_categories (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
        category_type VARCHAR(50) NOT NULL,
        label VARCHAR(100) NOT NULL,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        payout_mode VARCHAR(10) NOT NULL DEFAULT 'cents',
        amount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
        winner_account_id BIGINT,
        winner_display_name VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await p.query(`ALTER TABLE season_payout_categories ADD COLUMN IF NOT EXISTS payout_mode VARCHAR(10) NOT NULL DEFAULT 'cents'`);
    await p.query(`ALTER TABLE season_payout_categories ADD COLUMN IF NOT EXISTS amount_percent DECIMAL(5,2) NOT NULL DEFAULT 0`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_payout_categories_season ON season_payout_categories(season_id)`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS weekly_recaps (
        id SERIAL PRIMARY KEY,
        generated_at TIMESTAMPTZ DEFAULT NOW(),
        matches_count INTEGER DEFAULT 0,
        ai_blurb TEXT,
        top_performers JSONB,
        fun_highlights JSONB,
        period_start TIMESTAMPTZ,
        period_end TIMESTAMPTZ
      )
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS hero_tier_overrides (
        id SERIAL PRIMARY KEY,
        season_id INTEGER,
        hero_id INTEGER NOT NULL,
        tier VARCHAR(1) NOT NULL CHECK (tier IN ('S','A','B','C','D')),
        set_by VARCHAR(200),
        set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_hero_tier_overrides_unique
      ON hero_tier_overrides (COALESCE(season_id, -1), hero_id)
    `);

    // Fix column types that may be wrong on older DB instances (CREATE TABLE IF NOT EXISTS doesn't alter existing columns)
    await p.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'player_stats' AND column_name = 'account_id'
            AND data_type NOT IN ('bigint', 'integer')
        ) THEN
          ALTER TABLE player_stats ALTER COLUMN account_id TYPE BIGINT
            USING NULLIF(TRIM(account_id::text), '')::bigint;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'nicknames' AND column_name = 'account_id'
            AND data_type NOT IN ('bigint', 'integer')
        ) THEN
          ALTER TABLE nicknames ALTER COLUMN account_id TYPE BIGINT
            USING NULLIF(TRIM(account_id::text), '')::bigint;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'nicknames' AND column_name = 'discord_id'
        ) THEN
          ALTER TABLE nicknames ADD COLUMN discord_id VARCHAR(100) DEFAULT '';
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ratings' AND column_name = 'player_id'
            AND data_type NOT IN ('bigint', 'integer')
        ) THEN
          ALTER TABLE ratings ALTER COLUMN player_id TYPE BIGINT
            USING NULLIF(TRIM(player_id::text), '')::bigint;
        END IF;
      END $$;
    `);

    await p.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_patch_notes_version ON patch_notes(version);
    `);

    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS game_timeline JSONB`);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS lane_outcomes JSONB`);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT false`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS ward_placements JSONB DEFAULT '[]'`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS nemesis_hero_name VARCHAR(100) DEFAULT ''`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS nemesis_kills INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_items ADD COLUMN IF NOT EXISTS enhancement_level INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS damage_physical INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS damage_magical INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS damage_pure INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS evasion_count INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS long_range_kills INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS heal_saves INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS lifesteal_healing INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS dusts_used INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS pull_count INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS ward_dewarded_count INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS ward_avg_lifespan INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS obs_dewarded_count INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS obs_avg_lifespan INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS sen_dewarded_count INTEGER DEFAULT 0`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS sen_avg_lifespan INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS dead_time_seconds INTEGER DEFAULT NULL`);
    // Rename shallow_grave_count → death_prevention_count (expanded to track all death-prevention modifiers)
    await p.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_stats' AND column_name='shallow_grave_count') THEN
        ALTER TABLE player_stats RENAME COLUMN shallow_grave_count TO death_prevention_count;
      ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='player_stats' AND column_name='death_prevention_count') THEN
        ALTER TABLE player_stats ADD COLUMN death_prevention_count INTEGER DEFAULT 0;
      END IF;
    END $$`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS server_logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(10) NOT NULL DEFAULT 'error',
        source VARCHAR(100),
        message TEXT NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_server_logs_created ON server_logs(created_at DESC)`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS match_notes (
        id SERIAL PRIMARY KEY,
        match_id BIGINT NOT NULL,
        content TEXT NOT NULL,
        added_by VARCHAR(100) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_match_notes_match ON match_notes(match_id)`);

    // announced_at: NULL = not yet announced to Discord; existing rows backfilled with NOW()
    await p.query(`ALTER TABLE patch_notes ADD COLUMN IF NOT EXISTS announced_at TIMESTAMPTZ DEFAULT NOW()`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS schedule_rsvps (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL,
        discord_id TEXT NOT NULL,
        username TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'yes',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(game_id, discord_id)
      )
    `);
    await p.query(`ALTER TABLE scheduled_games ADD COLUMN IF NOT EXISTS rsvp_message_id TEXT`);
    await p.query(`ALTER TABLE scheduled_games ADD COLUMN IF NOT EXISTS rsvp_channel_id TEXT`);
    await p.query(`ALTER TABLE scheduled_games ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN NOT NULL DEFAULT FALSE`);
    await p.query(`ALTER TABLE scheduled_games ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN NOT NULL DEFAULT FALSE`);
    await p.query(`ALTER TABLE scheduled_games ADD COLUMN IF NOT EXISTS reminder_10m_sent BOOLEAN NOT NULL DEFAULT FALSE`);
    await p.query(`ALTER TABLE scheduled_games ADD COLUMN IF NOT EXISTS lobby_created BOOLEAN NOT NULL DEFAULT FALSE`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS player_preferences (
        discord_id TEXT PRIMARY KEY,
        report_card_optout BOOLEAN NOT NULL DEFAULT FALSE,
        report_card_optin BOOLEAN NOT NULL DEFAULT FALSE,
        ratings_optout BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`ALTER TABLE player_preferences ADD COLUMN IF NOT EXISTS report_card_optin BOOLEAN NOT NULL DEFAULT FALSE`);
    await p.query(`ALTER TABLE player_preferences ADD COLUMN IF NOT EXISTS ratings_optout BOOLEAN NOT NULL DEFAULT FALSE`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        season_id INTEGER REFERENCES seasons(id),
        format TEXT NOT NULL DEFAULT 'single_elim',
        status TEXT NOT NULL DEFAULT 'upcoming',
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`
      CREATE TABLE IF NOT EXISTS tournament_participants (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        account_id BIGINT NOT NULL,
        seed INTEGER,
        eliminated BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE(tournament_id, account_id)
      )
    `);
    await p.query(`
      CREATE TABLE IF NOT EXISTS tournament_matches (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        round INTEGER NOT NULL,
        slot INTEGER NOT NULL,
        p1_id BIGINT,
        p2_id BIGINT,
        winner_id BIGINT,
        inhouse_match_id TEXT,
        scheduled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS bracket VARCHAR(10) DEFAULT 'W'`);

    // Multi-tier seasons (1.6) — tournaments can be tagged to a specific season
    // tier (or NULL for cross-tier/exhibition).
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS tier_number INTEGER DEFAULT NULL`);

    // Per-tournament Stripe buy-ins + self-service signup (1.7).
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS entry_fee_cents INTEGER NOT NULL DEFAULT 0`);
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS signup_open_at TIMESTAMPTZ`);
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS signup_close_at TIMESTAMPTZ`);
    // v5.92 — capacity gate for self-signup.
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_participants INTEGER`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS tournament_entries (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        account_id BIGINT NOT NULL,
        steam_id TEXT,
        paid_at TIMESTAMPTZ,
        stripe_session_id TEXT,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        refunded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(tournament_id, account_id)
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_tournament_entries_tournament ON tournament_entries(tournament_id, status)`);
    // v5.92 — stash PaymentIntent for the withdraw/refund flow.
    await p.query(`ALTER TABLE tournament_entries ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT`);

    await p.query(`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS dota_rank_tier INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS dota_leaderboard_rank INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS dota_rank_source VARCHAR(16) DEFAULT NULL`);
    await p.query(`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS dota_rank_updated_at TIMESTAMPTZ DEFAULT NULL`);

    // Task 103 — enforce one-Discord-per-account at the DB layer too. Prevents
    // the race where two POST /api/me/link-discord calls slip past the
    // application-level cross-account check and both write the same
    // discord_id. Partial index so that empty / NULL discord_id values (the
    // "not yet linked" state) are still allowed for many accounts.
    //
    // If pre-existing duplicates exist, the CREATE will throw — surface the
    // collisions to admins via the log so they can be reconciled by hand
    // rather than silently picking a winner.
    try {
      await p.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_nicknames_discord_id_unique
        ON nicknames(TRIM(discord_id))
        WHERE discord_id IS NOT NULL AND TRIM(discord_id) <> ''
      `);
    } catch (err) {
      try {
        const dupes = await p.query(`
          SELECT TRIM(discord_id) AS discord_id, ARRAY_AGG(account_id ORDER BY account_id) AS account_ids
          FROM nicknames
          WHERE discord_id IS NOT NULL AND TRIM(discord_id) <> ''
          GROUP BY TRIM(discord_id)
          HAVING COUNT(*) > 1
        `);
        if (dupes.rows.length > 0) {
          console.error(
            `[nicknames] Cannot create unique index on discord_id — ${dupes.rows.length} duplicate(s) need admin attention:`
          );
          for (const row of dupes.rows) {
            console.error(`  discord_id=${row.discord_id} → accounts=${row.account_ids.join(', ')}`);
          }
        } else {
          console.error('[nicknames] Failed to create unique index on discord_id:', err.message);
        }
      } catch (innerErr) {
        console.error('[nicknames] Failed to create unique index on discord_id:', err.message);
        console.error('[nicknames] Duplicate diagnostic also failed:', innerErr.message);
      }
    }

    // Backfill: link discord_id into nicknames for players registered via !register
    // who already have a players table entry but no nicknames row or empty discord_id.
    await p.query(`
      INSERT INTO nicknames (account_id, discord_id, nickname, updated_at)
      SELECT
        p.account_id_32::bigint,
        p.discord_id,
        p.discord_name,
        NOW()
      FROM players p
      WHERE p.account_id_32 IS NOT NULL AND p.account_id_32 != ''
        AND p.discord_id IS NOT NULL AND TRIM(p.discord_id) != ''
      ON CONFLICT (account_id) DO UPDATE SET
        discord_id = CASE WHEN TRIM(nicknames.discord_id) = '' OR nicknames.discord_id IS NULL
                          THEN EXCLUDED.discord_id ELSE nicknames.discord_id END,
        updated_at = NOW()
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS signup_requests (
        id SERIAL PRIMARY KEY,
        discord_username TEXT NOT NULL,
        steam_url TEXT,
        preferred_name TEXT,
        preferred_positions INTEGER[] DEFAULT '{}',
        message TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        reviewed_by TEXT
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_signup_requests_status ON signup_requests(status)`);
    await p.query(`ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS mmr TEXT`);
    await p.query(`ALTER TABLE signup_requests ADD COLUMN IF NOT EXISTS referral TEXT`);

    // Generic key/value site settings (e.g. CMS payloads like welcome_modal,
    // engagement_milestone_thresholds).
    await p.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // v5.95 — drop the unused `use_v3_trueskill` row left over from the
    // V1/V3 toggle era. The setting was ignored at runtime since v5.90 and
    // is now physically removed so it stops appearing in admin tooling /
    // backups. Idempotent — no-op once cleared.
    await p.query(`DELETE FROM site_settings WHERE key = 'use_v3_trueskill'`);
    await p.query(
      `INSERT INTO site_settings (key, value) VALUES ('engagement_milestone_thresholds', '50,100,150,200')
       ON CONFLICT (key) DO NOTHING`
    );
    await p.query(
      `INSERT INTO site_settings (key, value) VALUES ('engagement_referral_xp', '50')
       ON CONFLICT (key) DO NOTHING`
    );
    await p.query(
      `INSERT INTO site_settings (key, value) VALUES ('welcome_modal', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({
        enabled: false,
        version: 1,
        eyebrow: 'Season 10 · Court & Pitch',
        title: 'Welcome to the new OCE Inhouse',
        body: 'Fresh ladder, refined design, and the full Court & Pitch experience across every page. Read the patch notes for the full rundown.',
        ctaText: 'Read patch notes',
        ctaHref: '/patch-notes',
      })]
    );
    await p.query(
      `INSERT INTO site_settings (key, value) VALUES ('home_banner', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({
        enabled: true,
        version: 1,
        eyebrow: 'Season 10 · Court & Pitch',
        title: 'The new season is in session.',
        body: 'Fresh ladder, refined design, and the full Court & Pitch experience across every page. Read the patch notes for the rundown — and good luck on the climb.',
        ctaText: 'Open the ladder',
        ctaHref: '/leaderboard',
      })]
    );

    await p.query(
      `INSERT INTO site_settings (key, value) VALUES ('broadcast_ticker', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({
        enabled: true,
        items: [
          'Season 10 ladder live',
          'New Court & Pitch design',
          'Inhouse lobby open · /inhouse',
          'Coaching marketplace beta',
          'Draft Assistant V2 — try it',
          'Patch notes updated',
        ],
      })]
    );

    // Feature flags — three-state toggle (off / preview / on) used to stage
    // new features behind a superuser-only "preview" gate before launching to
    // everyone. Season 10 launch cron bulk-flips all 'preview' flags to 'on'.
    await p.query(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        key TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'off' CHECK (state IN ('off', 'preview', 'on')),
        description TEXT,
        enabled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(
      `INSERT INTO feature_flags (key, state, description) VALUES
         ('home_launch_banner', 'off', 'Season 10 launch banner on the home page'),
         ('home_join_button', 'off', 'Prominent Join the League CTA on the home page'),
         ('profile_chart_v2', 'off', 'Enhanced profile charts (modifier history, rating overlay, what helped/hurt) for the logged-in player on their own profile only'),
         ('mvp_match_badges', 'off', 'MVP badge displayed on match scoreboard rows where that player won MVP'),
         ('multi_tier_seasons', 'off', 'Season tiers system — separate leaderboards/prize pools/brackets per tier (Tier 1 Immortal, Tier 2 Divine+Ancient, Tier 3 Legend and below)'),
         ('tournament_self_signup', 'off', 'Per-tournament Stripe buy-ins with self-service signup and eligibility checks'),
         ('new_rank_theme', 'off', 'New 8-tier rank badge theme using inhouse TrueSkill MMR (replaces Dota medal display)'),
         ('welcome_modal_s10', 'off', 'One-shot Season 10 welcome modal shown post-launch'),
         ('hero_meta_v2', 'off', 'Wave 2: Hero analytics overhaul — position-specific WR, pick frequency by tier, best counters'),
         ('draft_assistant_v2', 'off', 'Wave 2: Live counter-pick + synergy suggestions during the captain draft phase'),
         ('mvp_attitude_analytics', 'off', 'Wave 3: MVP rate + attitude trend analytics on player profiles'),
         ('web_push', 'off', 'Wave 3: Browser web push notifications for game reminders + match completions'),
         ('pro_tier', 'off', 'Pro Tier — paid lifetime unlock. Gates Hero Meta V2, Hero Matchups, Skill Builds, Compare/H2H, Benchmarks, premium profile cosmetics, and CSV match exports when state=on'),
         ('coaching_marketplace', 'on', 'Coaching Marketplace — paid 1:1 coaching via Stripe Connect (Express). 10% platform take rate. Eligibility = top-5 leaderboard or Immortal+ Steam rank. Sessions delivered in Discord; no built-in video.')
       ON CONFLICT (key) DO NOTHING`
    );

    // v5.93 — Coaching Marketplace launch. One-shot migration: flip the flag
    // from the original 'off' seed to 'on' for existing deployments where the
    // ON CONFLICT DO NOTHING above would otherwise leave the row at its
    // launch-day default. Gated on a sentinel in `site_settings` so the bump
    // runs **exactly once per database** — without this guard, db.init() runs
    // every process boot and would silently undo any admin who later flipped
    // the flag back to 'off' via the kill-switch panel. Rows previously set
    // to 'preview' are also left untouched.
    {
      const sentinel = await p.query(
        `SELECT 1 FROM site_settings WHERE key = 'coaching_marketplace_v593_launched'`
      );
      if (sentinel.rows.length === 0) {
        await p.query(
          `UPDATE feature_flags
             SET state = 'on',
                 enabled_at = COALESCE(enabled_at, NOW()),
                 updated_at = NOW()
           WHERE key = 'coaching_marketplace' AND state = 'off'`
        );
        await p.query(
          `INSERT INTO site_settings (key, value)
           VALUES ('coaching_marketplace_v593_launched', $1)
           ON CONFLICT (key) DO NOTHING`,
          [new Date().toISOString()]
        );
      }
    }

    // Task #128 — discord_autojoin_failures: queue of users whose Discord
    // OAuth round-trip succeeded (we have their Steam↔Discord link saved)
    // but `bot.addUserToLeagueGuild` then failed to actually pull them into
    // the OCE Inhouse server (e.g. bot lost Manage Roles for a few hours,
    // 5xx from Discord, network blip). The OAuth access token is single-use
    // and we don't store it, so we can't retry transparently — instead we
    // remember the failure here so the next-visit site banner + DM can
    // prompt the player to click *Reconnect with Discord*. Keyed by
    // discord_id (one pending row per Discord user, latest failure wins);
    // cleared on the next successful auto-join.
    await p.query(`
      CREATE TABLE IF NOT EXISTS discord_autojoin_failures (
        discord_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        last_code TEXT,
        last_error TEXT,
        attempts INTEGER NOT NULL DEFAULT 1,
        first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_discord_autojoin_failures_account ON discord_autojoin_failures (account_id)`);

    // Task #135 — discord_autojoin_log: persistent audit trail of every
    // `addUserToLeagueGuild` outcome (success or failure) so the admin
    // health panel's 24h rollup and last-failure record survive PM2
    // restarts and deploys. Previously this lived in an in-memory ring
    // buffer on the DiscordBot instance, which meant the panel went
    // amber ("No signups recorded yet") for hours after every restart
    // and admins lost the trail of any failure that pre-dated the
    // restart. Pruned to ~7 days so it doesn't grow unbounded.
    await p.query(`
      CREATE TABLE IF NOT EXISTS discord_autojoin_log (
        id BIGSERIAL PRIMARY KEY,
        ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ok BOOLEAN NOT NULL DEFAULT false,
        code TEXT NOT NULL DEFAULT 'unknown',
        discord_id TEXT,
        error TEXT
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_discord_autojoin_log_ts ON discord_autojoin_log (ts DESC)`);

    // Profile customization (`profile_customization`) — per-account cosmetic
    // overrides that render on the public PlayerProfile page. Keyed by
    // account_id (UNIQUE) so each player has at most one customization row.
    // Premium values (custom_title, theme_accent) are validated against the
    // shared cosmetics catalogue at write time; the gating itself happens in
    // the route handler (Pro check), not in the schema.
    await p.query(`
      CREATE TABLE IF NOT EXISTS player_profiles (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL UNIQUE,
        bio TEXT,
        custom_title TEXT,
        theme_accent TEXT,
        pinned_hero_id INTEGER,
        pinned_hero_caption TEXT,
        pinned_match_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_player_profiles_account ON player_profiles (account_id)`);
    await p.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false`);
    await p.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS profile_frame TEXT`);
    // v5.81 — `extras` JSONB holds the eight new mockup-graduated fields
    // (pinned_hero_border, pinned_achievement_id, flair_unlocked,
    // flair_override, show_top_heroes, show_streak, frame_animated,
    // bg_pattern, social_twitch, social_youtube, social_steam). Stored as
    // one JSONB so adding/removing knobs in the future doesn't need a
    // migration. See src/profileCosmetics.js for validation + defaults.
    await p.query(`ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS extras JSONB NOT NULL DEFAULT '{}'::jsonb`);

    // Pro Tier (`pro_tier`) — paid lifetime unlock. One row per purchase.
    // status: 'pending' (checkout created), 'active' (paid via webhook),
    // 'refunded' (charge.refunded webhook). isProMember() looks for an
    // 'active' row keyed on account_id. plan_type is reserved for future
    // monthly/annual tiers; today only 'lifetime' is issued.
    await p.query(`
      CREATE TABLE IF NOT EXISTS pro_subscriptions (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL,
        plan_type TEXT NOT NULL DEFAULT 'lifetime',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'refunded')),
        stripe_session_id TEXT UNIQUE,
        stripe_payment_intent TEXT,
        amount_cents INTEGER,
        currency TEXT DEFAULT 'aud',
        purchased_at TIMESTAMPTZ,
        refunded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_pro_subscriptions_account ON pro_subscriptions (account_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_pro_subscriptions_active ON pro_subscriptions (account_id) WHERE status = 'active'`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_pro_subscriptions_pi ON pro_subscriptions (stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL`);

    // ---------- Coaching Marketplace (`coaching_marketplace`) ----------
    // 1:1 paid coaching via Stripe Connect Express. 10% platform take rate.
    // One `coaches` row per applicant. status:
    //   'kyc_pending' — Connect account created, KYC not complete
    //   'active'      — charges_enabled per Stripe `account.updated` webhook
    //   'suspended'   — admin sanction
    //   'delisted'    — terminal admin sanction
    // No destructive ALTERs anywhere in this block; all CREATE TABLE IF NOT
    // EXISTS so repeated init() calls are safe.
    await p.query(`
      CREATE TABLE IF NOT EXISTS coaches (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL UNIQUE,
        stripe_account_id TEXT UNIQUE,
        status TEXT NOT NULL DEFAULT 'kyc_pending'
          CHECK (status IN ('kyc_pending', 'active', 'suspended', 'delisted')),
        hourly_rate_cents INTEGER NOT NULL DEFAULT 5000,
        currency TEXT NOT NULL DEFAULT 'aud',
        bio TEXT,
        languages TEXT,
        taught_roles TEXT,
        taught_heroes TEXT,
        intro_video_url TEXT,
        sample_replays TEXT,
        response_time_hours INTEGER DEFAULT 24,
        country TEXT DEFAULT 'AU',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_coaches_status ON coaches (status)`);

    // Weekly availability slots — repeating weekly (no calendar sync v1).
    // day_of_week 0=Sun..6=Sat, times stored as HH:MM strings in slot timezone.
    await p.query(`
      CREATE TABLE IF NOT EXISTS coach_availability_slots (
        id SERIAL PRIMARY KEY,
        coach_account_id BIGINT NOT NULL,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_coach_avail_account ON coach_availability_slots (coach_account_id)`);

    // Bookings — one row per session sale. status flow:
    //   'pending'       — Payment Intent created, awaiting webhook
    //   'paid'          — payment_intent.succeeded, funds held in escrow
    //   'completed'     — both confirmed OR 48h auto-release; payout issued
    //   'disputed'      — student raised within 48h, awaiting admin
    //   'refunded'      — coach no-show, admin refund, or charge.refunded
    //   'cancelled'     — pre-payment cancel
    await p.query(`
      CREATE TABLE IF NOT EXISTS coaching_bookings (
        id SERIAL PRIMARY KEY,
        coach_account_id BIGINT NOT NULL,
        student_account_id BIGINT NOT NULL,
        slot_start_at TIMESTAMPTZ NOT NULL,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'paid', 'completed', 'disputed', 'refunded', 'cancelled')),
        stripe_session_id TEXT UNIQUE,
        stripe_payment_intent TEXT,
        stripe_charge_id TEXT,
        amount_cents INTEGER NOT NULL,
        platform_fee_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'aud',
        coach_confirmed_at TIMESTAMPTZ,
        student_confirmed_at TIMESTAMPTZ,
        coach_arrived_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        dispute_reason TEXT,
        disputed_at TIMESTAMPTZ,
        refunded_at TIMESTAMPTZ,
        reminder_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Idempotent additive migration for environments where coaching_bookings
    // was created in an earlier round without `coach_arrived_at`. Following
    // the codebase's standard ADD COLUMN IF NOT EXISTS pattern.
    await p.query(`ALTER TABLE coaching_bookings ADD COLUMN IF NOT EXISTS coach_arrived_at TIMESTAMPTZ`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_coaching_bookings_coach ON coaching_bookings (coach_account_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_coaching_bookings_student ON coaching_bookings (student_account_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_coaching_bookings_status ON coaching_bookings (status)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_coaching_bookings_pi ON coaching_bookings (stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL`);

    // Reviews — one per booking max (UNIQUE booking_id), gated server-side
    // to bookings whose status is 'completed'.
    await p.query(`
      CREATE TABLE IF NOT EXISTS coaching_reviews (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL UNIQUE,
        student_account_id BIGINT NOT NULL,
        coach_account_id BIGINT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        written_review TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_coaching_reviews_coach ON coaching_reviews (coach_account_id)`);

    // Sanctions log — applied by admins. severity:
    //   'warning'  — informational, no behaviour change
    //   'suspended' — coach.status flipped to 'suspended' (hidden from browse)
    //   'delisted'  — coach.status flipped to 'delisted' (terminal)
    await p.query(`
      CREATE TABLE IF NOT EXISTS coach_sanctions (
        id SERIAL PRIMARY KEY,
        coach_account_id BIGINT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('warning', 'suspended', 'delisted')),
        reason TEXT NOT NULL,
        applied_by_admin_id BIGINT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_coach_sanctions_coach ON coach_sanctions (coach_account_id)`);

    // Weekend / special event tournaments
    await p.query(`
      CREATE TABLE IF NOT EXISTS weekend_tournaments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        start_date TIMESTAMPTZ NOT NULL,
        end_date TIMESTAMPTZ NOT NULL,
        games_to_count INTEGER DEFAULT 3,
        prize_pool NUMERIC DEFAULT 0,
        buy_in NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'upcoming',
        discord_announced BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS inhouse_sessions (
        id SERIAL PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'open',
        captain_mode TEXT NOT NULL DEFAULT 'highest_rank',
        match_password TEXT,
        server_ip TEXT,
        server_port INTEGER,
        match_id BIGINT,
        captain1_account_id BIGINT,
        captain2_account_id BIGINT,
        team1_is_radiant BOOLEAN DEFAULT TRUE,
        accept_phase_starts_at TIMESTAMPTZ,
        accept_phase_seconds INTEGER DEFAULT 60,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        notes TEXT
      )
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS inhouse_session_players (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES inhouse_sessions(id) ON DELETE CASCADE,
        account_id BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'registered',
        team INTEGER DEFAULT 0,
        pick_order INTEGER,
        preferred_positions TEXT,
        roll INTEGER,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        accepted_at TIMESTAMPTZ,
        voice_verified BOOLEAN DEFAULT FALSE,
        not_in_dota BOOLEAN DEFAULT FALSE,
        joined_server BOOLEAN DEFAULT FALSE,
        UNIQUE (session_id, account_id)
      )
    `);
    // Task #136 — liveness heartbeat. Frontend pings every ~15s while the
    // lobby page is mounted; the autoStartTicker sweep drops anyone whose
    // last_seen_at is older than the configured threshold.
    await p.query(`ALTER TABLE inhouse_session_players ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    // Task #136 — last express-session id we saw the player on. Used by the
    // sweep tick to drop seats whose underlying Steam session has been
    // destroyed (logout, cookie expiry, store-side eviction) without waiting
    // for the heartbeat-staleness window. Nullable for legacy / bot rows.
    await p.query(`ALTER TABLE inhouse_session_players ADD COLUMN IF NOT EXISTS last_session_id TEXT`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_inhouse_session_players_session ON inhouse_session_players (session_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_inhouse_sessions_status ON inhouse_sessions (status)`);
    // v5.75: auto-start gating once min_players is reached, plus lobby_fill_seconds
    // grace timer so stragglers can register before we flip into accept phase.
    await p.query(`ALTER TABLE inhouse_sessions ADD COLUMN IF NOT EXISTS min_players INTEGER DEFAULT 10`);
    await p.query(`ALTER TABLE inhouse_sessions ADD COLUMN IF NOT EXISTS lobby_fill_seconds INTEGER DEFAULT 30`);
    await p.query(`ALTER TABLE inhouse_sessions ADD COLUMN IF NOT EXISTS auto_start_at TIMESTAMPTZ`);
    // v6.03 — per-player captain-mode poll. JSONB map { "<accountId>": "highest_rank" | "random" | "auto_balance" | "volunteer" }.
    // Resolved into the session's captain_mode by autoStartTicker at the moment the accept phase begins.
    await p.query(`ALTER TABLE inhouse_sessions ADD COLUMN IF NOT EXISTS captain_mode_votes JSONB NOT NULL DEFAULT '{}'::jsonb`);
    // Task #119 — per-player captain volunteer signups for 'volunteer' captain mode.
    // JSONB map { "<accountId>": true }. Only accepted players can self-nominate; the
    // /select-captains route filters this map down to current accepted members at
    // resolve time, then picks the captains from that pool.
    await p.query(`ALTER TABLE inhouse_sessions ADD COLUMN IF NOT EXISTS captain_volunteers JSONB NOT NULL DEFAULT '{}'::jsonb`);
    // Task #130 — projected balance metadata for auto_balance captain mode.
    // Persists the per-player skill score, per-team sums, |delta|, and a
    // simple Elo-style win probability so the inhouse page can show players
    // exactly how balanced the auto-picked teams are.
    // Shape: { team1Sum, team2Sum, delta, winProbTeam1, scores: { "<accountId>": number } }
    await p.query(`ALTER TABLE inhouse_sessions ADD COLUMN IF NOT EXISTS auto_balance_meta JSONB`);
    // Task #172 — per-pick countdown for the captain draft. `draft_pick_seconds`
    // is the configurable budget per pick (default 30s); `draft_pick_deadline_at`
    // is set to NOW() + budget every time it becomes a captain's turn, and
    // cleared when the draft completes. The autoStartTicker polls drafting
    // sessions and auto-picks the highest-MMR remaining player when the
    // deadline expires, so an AFK captain can no longer stall the lobby.
    await p.query(`ALTER TABLE inhouse_sessions ADD COLUMN IF NOT EXISTS draft_pick_seconds INTEGER DEFAULT 30`);
    await p.query(`ALTER TABLE inhouse_sessions ADD COLUMN IF NOT EXISTS draft_pick_deadline_at TIMESTAMPTZ`);

    // ===== Wave 2 / 3 schema =====
    // F3 — Season Pass: per-event XP ledger. account_id + season_number +
    // match_id + source must be unique so re-running the post-match grant
    // is idempotent (ON CONFLICT DO NOTHING in awardSeasonPassXp).
    await p.query(`
      CREATE TABLE IF NOT EXISTS season_pass_xp_events (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL,
        season_number INTEGER NOT NULL,
        match_id VARCHAR(50),
        source TEXT NOT NULL,
        xp_delta INTEGER NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (account_id, season_number, match_id, source)
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_spxp_account_season ON season_pass_xp_events (account_id, season_number)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_spxp_season ON season_pass_xp_events (season_number)`);

    // F4 — Notification preferences: per (account_id, category) toggle.
    // Default is "enabled" if no row exists, so the table only stores
    // explicit opt-outs / re-enables.
    await p.query(`
      CREATE TABLE IF NOT EXISTS notification_prefs (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL,
        category TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (account_id, category)
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notif_prefs_account ON notification_prefs (account_id)`);

    // F7 — Web push subscriptions: one row per (account_id, endpoint).
    // Endpoint is unique across the whole table because a single push
    // endpoint identifies a single browser install.
    await p.query(`
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_web_push_account ON web_push_subscriptions (account_id)`);

    // F5 — Tournament prize-split (top 1/2/3 default 50/30/20). JSONB so
    // future tournaments can configure 4-place / 5-place splits without a
    // schema change.
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_split JSONB DEFAULT '[50,30,20]'::jsonb`);

    // Inhouse queue — persistent across restarts
    await p.query(`
      CREATE TABLE IF NOT EXISTS inhouse_queue (
        id SERIAL PRIMARY KEY,
        discord_id VARCHAR(100) NOT NULL UNIQUE,
        account_id BIGINT NOT NULL,
        mmr REAL DEFAULT 2600,
        nickname VARCHAR(255),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Invite / referral: track which account referred each player
    await p.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS referred_by BIGINT DEFAULT NULL`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_players_referred_by ON players (referred_by)`);

    // Tournament bracket state model
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS bracket_type VARCHAR(20)`);
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS bracket_data JSONB`);
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS seeding JSONB`);
    await p.query(`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS bracket_size INTEGER`);

    // All-time per-match records table. One row per stat_key; holds the record
    // value, who set it, and which match it was set in.
    await p.query(`
      CREATE TABLE IF NOT EXISTS match_records (
        stat_key TEXT PRIMARY KEY,
        account_id BIGINT NOT NULL,
        value REAL NOT NULL,
        match_id VARCHAR(50),
        player_name TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Backfill match_records from all historical player_stats so that the
    // first post-deploy check compares against actual existing bests rather
    // than treating an empty table as "no records yet".
    await p.query(`
      INSERT INTO match_records (stat_key, account_id, value, match_id, player_name, updated_at)
      SELECT v.stat_key, ps.account_id, v.best_val::real,
             ps.match_id,
             COALESCE(n.nickname, ps.persona_name),
             NOW()
        FROM (
          VALUES
            ('kills',        (SELECT MAX(kills)        FROM player_stats WHERE account_id > 0)),
            ('gpm',          (SELECT MAX(gpm)          FROM player_stats WHERE account_id > 0)),
            ('assists',      (SELECT MAX(assists)      FROM player_stats WHERE account_id > 0)),
            ('hero_damage',  (SELECT MAX(hero_damage)  FROM player_stats WHERE account_id > 0)),
            ('tower_damage', (SELECT MAX(tower_damage) FROM player_stats WHERE account_id > 0)),
            ('last_hits',    (SELECT MAX(last_hits)    FROM player_stats WHERE account_id > 0))
        ) AS v(stat_key, best_val)
        JOIN LATERAL (
          SELECT ps2.account_id, ps2.match_id, ps2.persona_name
            FROM player_stats ps2
           WHERE ps2.account_id > 0
             AND CASE v.stat_key
                   WHEN 'kills'        THEN ps2.kills::real
                   WHEN 'gpm'          THEN ps2.gpm::real
                   WHEN 'assists'      THEN ps2.assists::real
                   WHEN 'hero_damage'  THEN ps2.hero_damage::real
                   WHEN 'tower_damage' THEN ps2.tower_damage::real
                   WHEN 'last_hits'    THEN ps2.last_hits::real
                 END = v.best_val
           ORDER BY ps2.match_id
           LIMIT 1
        ) ps ON true
        LEFT JOIN nicknames n ON n.account_id = ps.account_id
       WHERE v.best_val IS NOT NULL
      ON CONFLICT (stat_key) DO NOTHING
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS scouting_reports (
        id SERIAL PRIMARY KEY,
        account_id BIGINT NOT NULL UNIQUE,
        report JSONB NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_scouting_reports_account ON scouting_reports(account_id)`);

    // Task #157 — Magazine v3 monetization features (replay paywall log,
    // weekly AI reports, org sponsorships, pickem, verified badges, one-off
    // perks). Schema lives in src/monetization/magazineV3.js so the diff in
    // this file stays small. Applied last so it doesn't block earlier
    // migrations on a fresh DB.
    // Round-6 hardening: previously this swallowed migration errors with
    // a warn, which left production in a partially-migrated state while
    // the v3 routes (paywall, perks, sponsorships, verified badges) were
    // already mounted and serving requests. Fail-fast so the process
    // exits non-zero and the deploy/restart loop surfaces the problem
    // instead of silently disabling monetization features. Opt-out via
    // `MAGV3_SCHEMA_OPTIONAL=1` for dev hosts that intentionally don't
    // want the v3 tables.
    try {
      const { applyMagazineV3Schema } = require('../monetization/magazineV3');
      await applyMagazineV3Schema(p);
    } catch (e) {
      console.error('[DB] magazineV3 schema apply failed:', e.message);
      if (process.env.MAGV3_SCHEMA_OPTIONAL !== '1') throw e;
      console.warn('[DB] continuing because MAGV3_SCHEMA_OPTIONAL=1 — v3 routes may misbehave.');
    }

    console.log('[DB] Schema migrations applied.');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    return false;
  }
}

function _sc(seasonId, params, alias) {
  if (!seasonId) return ` AND ${alias}.is_legacy = false`;
  if (seasonId === 'legacy') return ` AND ${alias}.is_legacy = true`;
  params.push(parseInt(seasonId));
  return ` AND ${alias}.season_id = $${params.length}`;
}
function _scWhere(seasonId, params, alias) {
  if (!seasonId) return ` WHERE ${alias}.is_legacy = false`;
  if (seasonId === 'legacy') return ` WHERE ${alias}.is_legacy = true`;
  params.push(parseInt(seasonId));
  return ` WHERE ${alias}.season_id = $${params.length}`;
}
function _scNoAlias(seasonId, params) {
  if (!seasonId) return ' AND is_legacy = false';
  if (seasonId === 'legacy') return ' AND is_legacy = true';
  params.push(parseInt(seasonId));
  return ` AND season_id = $${params.length}`;
}

async function getSeasons() {
  const p = getPool();
  const result = await p.query(`
    SELECT s.*,
           COALESCE(mc.match_count, 0)::integer AS match_count
    FROM seasons s
    LEFT JOIN (
      SELECT season_id, COUNT(*) AS match_count
      FROM matches
      WHERE season_id IS NOT NULL
      GROUP BY season_id
    ) mc ON mc.season_id = s.id
    ORDER BY s.start_date DESC
  `);
  return result.rows;
}

async function getActiveSeason() {
  const p = getPool();
  const result = await p.query(`SELECT * FROM seasons WHERE active = true LIMIT 1`);
  return result.rows[0] || null;
}

async function createSeason(name) {
  const p = getPool();
  const activeR = await p.query(`SELECT id FROM seasons WHERE active = true LIMIT 1`);
  const hasActive = activeR.rows.length > 0;
  if (!hasActive) {
    // No current active season — create this one as the active season.
    await p.query(`UPDATE seasons SET active = false, season_status = 'archived' WHERE active = true`);
    const result = await p.query(
      `INSERT INTO seasons (name, active, season_status) VALUES ($1, true, 'active') RETURNING *`,
      [name]
    );
    return result.rows[0];
  } else {
    // A season is already running — create the new one as pending so it doesn't
    // disturb the current season. Auto-activation will pick it up when the
    // current season closes.
    const result = await p.query(
      `INSERT INTO seasons (name, active, season_status) VALUES ($1, false, 'pending') RETURNING *`,
      [name]
    );
    return result.rows[0];
  }
}

// Multi-tier seasons (1.6) helpers ────────────────────────────────────────────
// Season 10 ladder is **MMR-based 8-tier**. Display MMR uses the V3 formula
// `round((mu - 3*sigma) * 100) + 5000`, so a fresh player at mu=25/sigma=8.333
// reads as exactly 5000 → falls into Tier V (the default).
// Tier names are placeholders — superusers can rename per-season in the admin panel.
const DEFAULT_S10_TIERS = [
  { tier_number: 1, name: 'Tier I',    min_mmr: 0,    rank_floor: null, rank_ceiling: null },
  { tier_number: 2, name: 'Tier II',   min_mmr: 2000, rank_floor: null, rank_ceiling: null },
  { tier_number: 3, name: 'Tier III',  min_mmr: 3000, rank_floor: null, rank_ceiling: null },
  { tier_number: 4, name: 'Tier IV',   min_mmr: 4000, rank_floor: null, rank_ceiling: null },
  { tier_number: 5, name: 'Tier V',    min_mmr: 5000, rank_floor: null, rank_ceiling: null },
  { tier_number: 6, name: 'Tier VI',   min_mmr: 6000, rank_floor: null, rank_ceiling: null },
  { tier_number: 7, name: 'Tier VII',  min_mmr: 7000, rank_floor: null, rank_ceiling: null },
  { tier_number: 8, name: 'Tier VIII', min_mmr: 8000, rank_floor: null, rank_ceiling: null },
];

// MMR-based placement: pick the highest tier whose min_mmr <= player's MMR.
// Tiers without min_mmr are ignored (legacy rank_tier rows fall back to tier 1).
function _tierForMmr(mmr, tiers) {
  const candidates = [...tiers]
    .filter(t => Number.isFinite(t.min_mmr) || t.min_mmr === 0)
    .sort((a, b) => Number(a.min_mmr) - Number(b.min_mmr));
  if (!candidates.length) return tiers[0]?.tier_number ?? 1;
  const m = Number(mmr || 0);
  let pick = candidates[0];
  for (const t of candidates) {
    if (m >= Number(t.min_mmr)) pick = t;
    else break;
  }
  return pick.tier_number;
}

// Legacy rank_tier-based placement (kept for back-compat with pre-S10 rows that
// don't have min_mmr populated). Not used by the S10 default placement.
function _tierForRankTier(rankTier, tiers) {
  const sorted = [...tiers].sort((a, b) => a.tier_number - b.tier_number);
  if (rankTier == null || rankTier === 0) return sorted[sorted.length - 1].tier_number;
  for (const t of sorted) {
    const aboveFloor   = t.rank_floor   == null || rankTier >= t.rank_floor;
    const belowCeiling = t.rank_ceiling == null || rankTier <= t.rank_ceiling;
    if (aboveFloor && belowCeiling) return t.tier_number;
  }
  return sorted[sorted.length - 1].tier_number;
}

async function getSeasonTiers(seasonId) {
  const p = getPool();
  const r = await p.query(
    `SELECT st.*,
            COALESCE(pc.player_count, 0) AS player_count
     FROM season_tiers st
     LEFT JOIN (
       SELECT tier_number, COUNT(*) AS player_count
       FROM season_tier_players WHERE season_id = $1
       GROUP BY tier_number
     ) pc ON pc.tier_number = st.tier_number
     WHERE st.season_id = $1
     ORDER BY st.tier_number ASC`,
    [parseInt(seasonId)]
  );
  return r.rows;
}

async function ensureSeasonTiers(seasonId, tiers = DEFAULT_S10_TIERS) {
  const p = getPool();
  for (const t of tiers) {
    await p.query(
      `INSERT INTO season_tiers (season_id, tier_number, name, rank_floor, rank_ceiling, min_mmr)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (season_id, tier_number) DO UPDATE
         SET min_mmr = COALESCE(season_tiers.min_mmr, EXCLUDED.min_mmr)`,
      [parseInt(seasonId), t.tier_number, t.name, t.rank_floor ?? null, t.rank_ceiling ?? null, t.min_mmr ?? null]
    );
  }
  return getSeasonTiers(seasonId);
}

async function updateSeasonTier(seasonId, tierNumber, fields = {}) {
  const allowed = ['name', 'rank_floor', 'rank_ceiling', 'min_mmr', 'prize_pool_cents', 'buyin_cents', 'sponsor_name', 'sponsor_active_from', 'sponsor_active_until'];
  const sets = []; const vals = []; let i = 1;
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k} = $${i++}`);
      vals.push(fields[k]);
    }
  }
  if (!sets.length) return null;
  vals.push(parseInt(seasonId), parseInt(tierNumber));
  const p = getPool();
  const r = await p.query(
    `UPDATE season_tiers SET ${sets.join(', ')}
     WHERE season_id = $${i++} AND tier_number = $${i}
     RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

async function placeAllPlayersInSeasonTiers(seasonId, { force = false } = {}) {
  const p = getPool();
  const tiers = await getSeasonTiers(parseInt(seasonId));
  if (!tiers.length) throw new Error('Season has no tiers configured');
  // S10 placement is MMR-based. Pull every rated player and compute display MMR
  // = round((mu - 3*sigma) * 100) + 5000 — matches the V3 formula used everywhere
  // else (leaderboard, profile, embeds). Falls back to legacy rank_tier-based
  // placement if a season's tiers have no min_mmr populated (back-compat).
  const useMmr = tiers.some(t => Number.isFinite(t.min_mmr));
  const rows = useMmr
    ? (await p.query(
        `SELECT player_id::bigint AS account_id, mu, sigma
         FROM ratings
         WHERE player_id IS NOT NULL`
      )).rows
    : (await p.query(
        `SELECT account_id::bigint AS account_id, dota_rank_tier
         FROM nicknames
         WHERE account_id IS NOT NULL`
      )).rows;
  let placed = 0, skipped = 0;
  for (const row of rows) {
    let tierNum, basisRankTier = null;
    if (useMmr) {
      const mmr = Math.round(((row.mu ?? 25) - 3 * (row.sigma ?? 8.333)) * 100) + 5000;
      tierNum = _tierForMmr(mmr, tiers);
    } else {
      tierNum = _tierForRankTier(row.dota_rank_tier, tiers);
      basisRankTier = row.dota_rank_tier;
    }
    const ins = await p.query(
      `INSERT INTO season_tier_players (season_id, tier_number, account_id, placement_rank_tier)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (season_id, account_id) DO ${force
         ? 'UPDATE SET tier_number = EXCLUDED.tier_number, placement_rank_tier = EXCLUDED.placement_rank_tier, override_admin_id = NULL, placed_at = NOW()'
         : 'NOTHING'}
       RETURNING id`,
      [parseInt(seasonId), tierNum, row.account_id, basisRankTier]
    );
    if (ins.rowCount > 0) placed++; else skipped++;
  }
  return { placed, skipped, total: rows.length, basis: useMmr ? 'mmr' : 'rank_tier' };
}

async function overridePlayerTier(seasonId, accountId, newTier, adminId) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO season_tier_players (season_id, tier_number, account_id, override_admin_id, placed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (season_id, account_id) DO UPDATE
       SET tier_number = EXCLUDED.tier_number,
           override_admin_id = EXCLUDED.override_admin_id,
           placed_at = NOW()
     RETURNING *`,
    [parseInt(seasonId), parseInt(newTier), String(accountId), adminId || null]
  );
  return r.rows[0];
}

async function getPlayerSeasonTier(seasonId, accountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT * FROM season_tier_players WHERE season_id = $1 AND account_id = $2`,
    [parseInt(seasonId), String(accountId)]
  );
  return r.rows[0] || null;
}

async function getSeasonTierPlayers(seasonId, tierNumber) {
  const p = getPool();
  const r = await p.query(
    `SELECT stp.*, COALESCE(n.nickname, '') AS nickname, n.dota_rank_tier AS current_rank_tier
     FROM season_tier_players stp
     LEFT JOIN nicknames n ON n.account_id::bigint = stp.account_id
     WHERE stp.season_id = $1 AND stp.tier_number = $2
     ORDER BY n.nickname NULLS LAST, stp.account_id`,
    [parseInt(seasonId), parseInt(tierNumber)]
  );
  return r.rows;
}

async function setActiveSeason(id) {
  const p = getPool();
  await p.query(`UPDATE seasons SET active = false, season_status = 'archived' WHERE active = true`);
  const result = await p.query(
    `UPDATE seasons SET active = true, season_status = 'active' WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function archiveSeason(id) {
  const p = getPool();
  await p.query('BEGIN');
  try {
    await p.query(
      `UPDATE seasons SET active = false, is_legacy = true, season_status = 'archived' WHERE id = $1`,
      [id]
    );
    await p.query(
      `UPDATE matches SET is_legacy = true WHERE season_id = $1`,
      [id]
    );
    await p.query('COMMIT');
    const result = await p.query(`SELECT * FROM seasons WHERE id = $1`, [id]);
    return result.rows[0] || null;
  } catch (err) {
    await p.query('ROLLBACK');
    throw err;
  }
}

async function setSeasonEndConditions(id, { endDate = null, matchCountLimit = null } = {}) {
  const p = getPool();
  const result = await p.query(
    `UPDATE seasons SET end_date = $1, match_count_limit = $2 WHERE id = $3 RETURNING *`,
    [endDate || null, matchCountLimit ? parseInt(matchCountLimit) : null, id]
  );
  return result.rows[0] || null;
}

async function getSeasonSummary(seasonId) {
  const p = getPool();
  const sid = parseInt(seasonId);

  const overviewR = await p.query(
    `SELECT COUNT(DISTINCT m.match_id) AS total_matches,
            COUNT(DISTINCT ps.account_id) FILTER (WHERE ps.account_id != 0) AS total_players
     FROM matches m
     JOIN player_stats ps ON ps.match_id = m.match_id
     WHERE m.season_id = $1`,
    [sid]
  );
  const overview = overviewR.rows[0] || {};

  const dateR = await p.query(
    `SELECT MIN(m.date) AS start_date, MAX(m.date) AS end_date
     FROM matches m WHERE m.season_id = $1`,
    [sid]
  );
  const dates = dateR.rows[0] || {};

  // Top 3: use each player's last rating_history entry during this season so the
  // snapshot reflects season-final MMR, not the current global (post-season) value.
  // W/L/games are scoped to this season's matches only.
  const top3R = await p.query(
    `WITH season_match_ids AS (
       SELECT match_id::text AS mid FROM matches WHERE season_id = $1
     ),
     last_season_mmr AS (
       SELECT DISTINCT ON (rh.player_id)
              rh.player_id, rh.mmr
       FROM rating_history rh
       WHERE rh.match_id IN (SELECT mid FROM season_match_ids)
       ORDER BY rh.player_id, rh.recorded_at DESC
     ),
     season_wl AS (
       SELECT ps.account_id,
              SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int AS wins,
              SUM(CASE WHEN NOT ((ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win)) THEN 1 ELSE 0 END)::int AS losses,
              COUNT(*)::int AS games_played
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE m.season_id = $1 AND ps.account_id != 0
       GROUP BY ps.account_id
     )
     SELECT lm.player_id AS account_id,
            COALESCE(n.nickname, r.display_name, lm.player_id::text) AS display_name,
            lm.mmr::int AS mmr,
            COALESCE(sw.wins, 0) AS wins,
            COALESCE(sw.losses, 0) AS losses,
            COALESCE(sw.games_played, 0) AS games_played
     FROM last_season_mmr lm
     LEFT JOIN ratings r ON r.player_id = lm.player_id
     LEFT JOIN nicknames n ON n.account_id = lm.player_id
     LEFT JOIN season_wl sw ON sw.account_id = lm.player_id
     ORDER BY lm.mmr DESC NULLS LAST
     LIMIT 3`,
    [sid]
  );
  const topPlayers = top3R.rows;

  const heroR = await p.query(
    `SELECT ps.hero_id, ps.hero_name,
            COUNT(*) AS games,
            SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) AS wins
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE m.season_id = $1
       AND ps.hero_id IS NOT NULL AND ps.hero_id != 0
       AND ps.hero_name IS NOT NULL AND ps.hero_name != ''
     GROUP BY ps.hero_id, ps.hero_name
     HAVING COUNT(*) >= 5
     ORDER BY (SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::float / COUNT(*)) DESC
     LIMIT 1`,
    [sid]
  );
  const heroRow = heroR.rows[0] || null;
  const heroOfSeason = heroRow
    ? { ...heroRow, games: parseInt(heroRow.games), wins: parseInt(heroRow.wins), winRate: parseFloat(((parseInt(heroRow.wins) / parseInt(heroRow.games)) * 100).toFixed(1)) }
    : null;

  const improvedR = await p.query(
    `WITH season_rh AS (
       SELECT rh.player_id, rh.mmr, rh.recorded_at
       FROM rating_history rh
       WHERE rh.match_id IN (
         SELECT match_id::text FROM matches WHERE season_id = $1
       )
     ),
     ordered AS (
       SELECT player_id, mmr, recorded_at,
              ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY recorded_at ASC) AS rn_first,
              ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY recorded_at DESC) AS rn_last
       FROM season_rh
     ),
     deltas AS (
       SELECT
         MAX(CASE WHEN rn_first = 1 THEN player_id END) AS player_id,
         MAX(CASE WHEN rn_first = 1 THEN mmr END) AS first_mmr,
         MAX(CASE WHEN rn_last  = 1 THEN mmr END) AS last_mmr
       FROM ordered
       WHERE rn_first = 1 OR rn_last = 1
       GROUP BY player_id
     )
     SELECT d.player_id,
            COALESCE(n.nickname, r.display_name, d.player_id::text) AS display_name,
            d.first_mmr::int, d.last_mmr::int,
            (d.last_mmr - d.first_mmr)::int AS delta
     FROM deltas d
     LEFT JOIN ratings r ON r.player_id = d.player_id
     LEFT JOIN nicknames n ON n.account_id = d.player_id
     WHERE d.last_mmr > d.first_mmr
     ORDER BY (d.last_mmr - d.first_mmr) DESC
     LIMIT 1`,
    [sid]
  );
  const mostImproved = improvedR.rows[0] || null;

  const streakR = await p.query(
    `WITH season_results AS (
       SELECT ps.account_id, m.match_id, m.date,
              CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END AS won
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE m.season_id = $1 AND ps.account_id != 0
     ),
     numbered AS (
       SELECT *,
              ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY date) AS rn,
              ROW_NUMBER() OVER (PARTITION BY account_id, won ORDER BY date) AS rn_grp
       FROM season_results
     ),
     streaks AS (
       SELECT account_id, won, COUNT(*) AS streak_len
       FROM numbered
       WHERE won = 1
       GROUP BY account_id, won, (rn - rn_grp)
     ),
     best AS (
       SELECT account_id, MAX(streak_len) AS longest_streak
       FROM streaks
       GROUP BY account_id
     )
     SELECT b.account_id,
            COALESCE(n.nickname, r.display_name, b.account_id::text) AS display_name,
            b.longest_streak
     FROM best b
     LEFT JOIN ratings r ON r.player_id = b.account_id
     LEFT JOIN nicknames n ON n.account_id = b.account_id
     ORDER BY b.longest_streak DESC
     LIMIT 1`,
    [sid]
  );
  const longestStreak = streakR.rows[0] || null;

  return {
    overview: {
      totalMatches: parseInt(overview.total_matches) || 0,
      totalPlayers: parseInt(overview.total_players) || 0,
    },
    dates: { startDate: dates.start_date || null, endDate: dates.end_date || null },
    topPlayers,
    heroOfSeason,
    mostImproved,
    longestStreak,
  };
}

async function deleteSeason(id) {
  const p = getPool();
  await p.query('BEGIN');
  try {
    await p.query(`UPDATE matches SET season_id = NULL WHERE season_id = $1`, [id]);
    const result = await p.query(`DELETE FROM seasons WHERE id = $1 RETURNING *`, [id]);
    await p.query('COMMIT');
    return result.rows[0] || null;
  } catch (err) {
    await p.query('ROLLBACK');
    throw err;
  }
}

async function getSeasonPayouts(seasonId) {
  const p = getPool();
  const result = await p.query(
    `SELECT * FROM season_payout_categories WHERE season_id = $1 ORDER BY created_at ASC`,
    [seasonId]
  );
  return result.rows;
}

async function addSeasonPayout(seasonId, categoryType, label, amountCents, notes, payoutMode, amountPercent) {
  const p = getPool();
  const mode = payoutMode === 'percent' ? 'percent' : 'cents';
  const pct = mode === 'percent' ? (parseFloat(amountPercent) || 0) : 0;
  const cents = mode === 'cents' ? (parseInt(amountCents) || 0) : 0;
  const result = await p.query(
    `INSERT INTO season_payout_categories (season_id, category_type, label, amount_cents, payout_mode, amount_percent, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [seasonId, categoryType, label, cents, mode, pct, notes || null]
  );
  return result.rows[0];
}

async function deleteSeasonPayout(payoutId) {
  const p = getPool();
  await p.query(`DELETE FROM season_payout_categories WHERE id = $1`, [payoutId]);
}

async function setPayoutWinner(payoutId, winnerAccountId, winnerDisplayName) {
  const p = getPool();
  const result = await p.query(
    `UPDATE season_payout_categories SET winner_account_id = $1, winner_display_name = $2 WHERE id = $3 RETURNING *`,
    [winnerAccountId || null, winnerDisplayName || null, payoutId]
  );
  return result.rows[0];
}

async function setSeasonBuyinAmount(seasonId, amountCents) {
  const p = getPool();
  const result = await p.query(
    `UPDATE seasons SET buyin_amount_cents = $1 WHERE id = $2 RETURNING *`,
    [amountCents, seasonId]
  );
  return result.rows[0];
}

async function createBuyin(seasonId, accountId, displayName, amountCents, stripeSessionId) {
  const p = getPool();
  const result = await p.query(
    `INSERT INTO season_buyins (season_id, account_id, display_name, amount_cents, stripe_session_id, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [seasonId, accountId || null, displayName, amountCents, stripeSessionId]
  );
  return result.rows[0];
}

async function confirmBuyin(stripeSessionId) {
  const p = getPool();
  const result = await p.query(
    `UPDATE season_buyins SET status = 'paid', paid_at = NOW()
     WHERE stripe_session_id = $1 AND status != 'paid' RETURNING *`,
    [stripeSessionId]
  );
  return result.rows[0] || null;
}

async function getBuyinBySession(stripeSessionId) {
  const p = getPool();
  const result = await p.query(
    `SELECT * FROM season_buyins WHERE stripe_session_id = $1`,
    [stripeSessionId]
  );
  return result.rows[0] || null;
}

async function getSeasonBuyins(seasonId) {
  const p = getPool();
  const result = await p.query(
    `SELECT sb.*, s.buyin_amount_cents, s.name as season_name
     FROM season_buyins sb
     JOIN seasons s ON s.id = sb.season_id
     WHERE sb.season_id = $1
     ORDER BY sb.paid_at ASC NULLS LAST, sb.created_at ASC`,
    [seasonId]
  );
  const totalCents = result.rows.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.amount_cents, 0);
  return { buyins: result.rows, totalCents };
}

async function updateMatchMeta(matchId, { patch, seasonId, date }) {
  const p = getPool();
  const updates = [];
  const params = [];
  if (patch !== undefined) { updates.push(`patch = $${params.length + 1}`); params.push(patch || null); }
  if (seasonId !== undefined) {
    const sid = (seasonId === null || seasonId === '' || seasonId === 0) ? null : parseInt(seasonId);
    if (sid !== null && isNaN(sid)) throw new Error(`Invalid seasonId: ${seasonId}`);
    updates.push(`season_id = $${params.length + 1}`);
    params.push(sid);
  }
  if (date !== undefined && date) { updates.push(`date = $${params.length + 1}`); params.push(new Date(date).toISOString()); }
  if (updates.length === 0) return;
  params.push(matchId);
  const sql = `UPDATE matches SET ${updates.join(', ')} WHERE match_id = $${params.length}`;
  console.log(`[DB] updateMatchMeta: ${sql} [${params.join(', ')}]`);
  await p.query(sql, params);
}

async function updateMatchDetails(matchId, { radiant_win, duration, lobby_name }) {
  const p = getPool();
  const updates = [];
  const params = [];
  if (radiant_win !== undefined) { updates.push(`radiant_win = $${params.length + 1}`); params.push(!!radiant_win); }
  if (duration !== undefined) { updates.push(`duration = $${params.length + 1}`); params.push(parseInt(duration) || 0); }
  if (lobby_name !== undefined) { updates.push(`lobby_name = $${params.length + 1}`); params.push(lobby_name || ''); }
  if (updates.length === 0) return;
  params.push(matchId);
  await p.query(`UPDATE matches SET ${updates.join(', ')} WHERE match_id = $${params.length}`, params);
}

async function updatePlayerStats(matchId, players) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    for (const pl of players) {
      await client.query(`
        UPDATE player_stats SET
          kills=$1, deaths=$2, assists=$3, last_hits=$4, denies=$5,
          gpm=$6, xpm=$7, hero_damage=$8, tower_damage=$9, hero_healing=$10,
          level=$11, net_worth=$12, position=$13, is_captain=$14,
          obs_placed=$15, sen_placed=$16, obs_purchased=$17, sen_purchased=$18,
          wards_killed=$19, creeps_stacked=$20, camps_stacked=$21,
          rune_pickups=$22, stun_duration=$23, towers_killed=$24, roshans_killed=$25,
          teamfight_participation=$26, firstblood_claimed=$27, buybacks=$28,
          courier_kills=$29, tp_scrolls_used=$30, double_kills=$31, triple_kills=$32,
          ultra_kills=$33, rampages=$34, kill_streak=$35, smoke_kills=$36,
          first_death=$37, lane_cs_10min=$38, has_scepter=$39, has_shard=$40,
          damage_taken=$41, laning_nw=$42, team=$43,
          support_gold_spent=$44, killed_by=$45,
          hook_attempts=$48, hook_hits=$49
        WHERE match_id=$46 AND slot=$47
      `, [
        parseInt(pl.kills)||0, parseInt(pl.deaths)||0, parseInt(pl.assists)||0,
        parseInt(pl.last_hits)||0, parseInt(pl.denies)||0,
        parseInt(pl.gpm)||0, parseInt(pl.xpm)||0,
        parseInt(pl.hero_damage)||0, parseInt(pl.tower_damage)||0, parseInt(pl.hero_healing)||0,
        parseInt(pl.level)||0, parseInt(pl.net_worth)||0,
        parseInt(pl.position)||0, !!pl.is_captain,
        parseInt(pl.obs_placed)||0, parseInt(pl.sen_placed)||0,
        parseInt(pl.obs_purchased)||0, parseInt(pl.sen_purchased)||0,
        parseInt(pl.wards_killed)||0, parseInt(pl.creeps_stacked)||0, parseInt(pl.camps_stacked)||0,
        parseInt(pl.rune_pickups)||0, parseFloat(pl.stun_duration)||0,
        parseInt(pl.towers_killed)||0, parseInt(pl.roshans_killed)||0,
        parseFloat(pl.teamfight_participation)||0, parseInt(pl.firstblood_claimed)||0,
        parseInt(pl.buybacks)||0, parseInt(pl.courier_kills)||0,
        parseInt(pl.tp_scrolls_used)||0, parseInt(pl.double_kills)||0, parseInt(pl.triple_kills)||0,
        parseInt(pl.ultra_kills)||0, parseInt(pl.rampages)||0, parseInt(pl.kill_streak)||0,
        parseInt(pl.smoke_kills)||0, parseInt(pl.first_death)||0, parseInt(pl.lane_cs_10min)||0,
        !!pl.has_scepter, !!pl.has_shard,
        parseInt(pl.damage_taken)||0,
        pl.laning_nw !== null && pl.laning_nw !== undefined && pl.laning_nw !== '' ? parseInt(pl.laning_nw) : null,
        pl.team,
        parseInt(pl.support_gold_spent)||0,
        JSON.stringify(pl.killed_by || {}),
        matchId, parseInt(pl.slot),
        pl.hook_attempts != null ? parseInt(pl.hook_attempts) : null,
        pl.hook_hits != null ? parseInt(pl.hook_hits) : null,
      ]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function recordMatch(matchStats, lobbyName, recordedBy, fileHash, patch, seasonId) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO matches (match_id, date, duration, game_mode, radiant_win, lobby_name, recorded_by, parse_method, file_hash, patch, season_id, game_timeline, lane_outcomes, team_abilities)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (match_id) DO UPDATE SET date = EXCLUDED.date,
         game_timeline = COALESCE(EXCLUDED.game_timeline, matches.game_timeline),
         lane_outcomes = COALESCE(EXCLUDED.lane_outcomes, matches.lane_outcomes),
         team_abilities = COALESCE(EXCLUDED.team_abilities, matches.team_abilities)
         WHERE EXCLUDED.date < NOW() - INTERVAL '10 minutes'`,
      [
        matchStats.matchId,
        matchStats.gameStartTime ? new Date(matchStats.gameStartTime * 1000).toISOString() : new Date().toISOString(),
        matchStats.duration || 0,
        matchStats.gameMode || 0,
        matchStats.radiantWin,
        lobbyName || '',
        recordedBy || '',
        matchStats.parseMethod || '',
        fileHash || null,
        patch || null,
        seasonId || null,
        matchStats.gameTimeline ? JSON.stringify(matchStats.gameTimeline) : null,
        matchStats.laneOutcomes ? JSON.stringify(matchStats.laneOutcomes) : null,
        matchStats.teamAbilities ? JSON.stringify(matchStats.teamAbilities) : null,
      ]
    );

    for (const player of matchStats.players) {
      await client.query(
        `INSERT INTO player_stats (match_id, account_id, discord_id, persona_name, hero_id, hero_name, team, kills, deaths, assists, last_hits, denies, gpm, xpm, hero_damage, tower_damage, hero_healing, level, net_worth, position, is_captain, obs_placed, sen_placed, creeps_stacked, camps_stacked, damage_taken, slot, rune_pickups, stun_duration, towers_killed, roshans_killed, teamfight_participation, firstblood_claimed, wards_killed, obs_purchased, sen_purchased, buybacks, courier_kills, tp_scrolls_used, double_kills, triple_kills, ultra_kills, rampages, kill_streak, smoke_kills, first_death, lane_cs_10min, has_scepter, has_shard, laning_nw, support_gold_spent, killed_by, ward_placements, nemesis_hero_name, nemesis_kills, hook_attempts, hook_hits, evasion_count, long_range_kills, heal_saves, lifesteal_healing, dusts_used, pull_count, ward_dewarded_count, ward_avg_lifespan, obs_dewarded_count, obs_avg_lifespan, sen_dewarded_count, sen_avg_lifespan, dead_time_seconds, hook_cast_times, hook_cast_log, dieback_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73)`,
        [
          matchStats.matchId,
          player.accountId || 0,
          player.discordId || '',
          player.personaname || '',
          player.heroId || 0,
          player.heroName || '',
          player.team || 'radiant',
          player.kills || 0,
          player.deaths || 0,
          player.assists || 0,
          player.lastHits || 0,
          player.denies || 0,
          player.goldPerMin || 0,
          player.xpPerMin || 0,
          player.heroDamage || 0,
          player.towerDamage || 0,
          player.heroHealing || 0,
          player.level || 0,
          player.netWorth || 0,
          player.position || 0,
          player.isCaptain || false,
          player.obsPlaced || 0,
          player.senPlaced || 0,
          player.creepsStacked || 0,
          player.campsStacked || 0,
          player.damageTaken || 0,
          player.slot || 0,
          player.runePickups || 0,
          player.stunDuration || 0,
          player.towersKilled || 0,
          player.roshansKilled || 0,
          player.teamfightParticipation || 0,
          player.firstbloodClaimed || 0,
          player.wardsKilled || 0,
          player.obsPurchased || 0,
          player.senPurchased || 0,
          player.buybacks || 0,
          player.courierKills || 0,
          player.tpScrollsUsed || 0,
          player.doubleKills || 0,
          player.tripleKills || 0,
          player.ultraKills || 0,
          player.rampages || 0,
          player.killStreak || 0,
          player.smokeKills || 0,
          player.firstDeath || 0,
          player.laneCs10min || 0,
          player.hasScepter || false,
          player.hasShard || false,
          player.laningNw != null ? player.laningNw : null,
          player.supportGoldSpent || 0,
          JSON.stringify(player.killedBy || {}),
          JSON.stringify(player.wardPlacements || []),
          player.nemesisHeroName || '',
          player.nemesisKills || 0,
          player.hookAttempts != null ? player.hookAttempts : null,
          player.hookHits != null ? player.hookHits : null,
          player.evasionCount || 0,
          player.longRangeKills || 0,
          player.healSaves || 0,
          player.lifestealHealing || 0,
          player.dustsUsed || 0,
          player.pullCount || 0,
          player.wardDewardedCount || 0,
          player.wardAvgLifespan || null,
          player.obsDewardedCount || 0,
          player.obsAvgLifespan || null,
          player.senDewardedCount || 0,
          player.senAvgLifespan || null,
          player.deadTimeSeconds != null ? player.deadTimeSeconds : null,
          player.hookCastTimes ? JSON.stringify(player.hookCastTimes) : null,
          player.hookCastLog ? JSON.stringify(player.hookCastLog) : null,
          player.diebackCount || 0,
        ]
      );

      // Persist damage type breakdown if available from replay parsing
      if (player.damagePhysical || player.damageMagical || player.damagePure) {
        await client.query(
          `UPDATE player_stats SET damage_physical=$1, damage_magical=$2, damage_pure=$3
           WHERE match_id=$4 AND slot=$5`,
          [player.damagePhysical || 0, player.damageMagical || 0, player.damagePure || 0,
           matchStats.matchId, player.slot || 0]
        );
      }

      if (player.items && player.items.length > 0) {
        for (const item of player.items) {
          await client.query(
            `INSERT INTO player_items (match_id, slot, item_slot, item_id, item_name, purchase_time, enhancement_level)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (match_id, slot, item_slot) DO NOTHING`,
            [matchStats.matchId, player.slot || 0, item.slot, item.itemId || 0, item.itemName || '', item.purchaseTime || 0, item.enhancementLevel || 0]
          );
        }
      }

      if (player.abilities && player.abilities.length > 0) {
        for (const ability of player.abilities) {
          await client.query(
            `INSERT INTO player_abilities (match_id, slot, ability_name, ability_level, time)
             VALUES ($1, $2, $3, $4, $5)`,
            [matchStats.matchId, player.slot || 0, ability.abilityName || '', ability.abilityLevel || 0, ability.time || 0]
          );
        }
      }
    }

    if (matchStats.draft && matchStats.draft.length > 0) {
      await client.query(`DELETE FROM match_draft WHERE match_id = $1`, [matchStats.matchId]);
      for (const d of matchStats.draft) {
        if (!d.heroId || d.heroId <= 0) continue;
        await client.query(
          `INSERT INTO match_draft (match_id, hero_id, is_pick, order_num, team)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (match_id, order_num) DO NOTHING`,
          [matchStats.matchId, d.heroId, d.isPick, d.order || 0, typeof d.team === 'string' ? (d.team === 'radiant' ? 0 : 1) : (d.team === 2 ? 0 : d.team === 3 ? 1 : (d.team || 0))]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`[DB] Recorded match ${matchStats.matchId}`);

    // PERF — compute and persist Positive Impact Scores (best-effort, post-commit)
    try {
      const { computeAndSavePerfForMatch } = require('../perf/perfService');
      const r = await computeAndSavePerfForMatch(getPool, matchStats.matchId, { silent: true });
      if (r.ok) console.log(`[PERF] match ${matchStats.matchId}: ${r.count} players scored`);
    } catch (e) {
      console.warn(`[PERF] match ${matchStats.matchId} failed: ${e.message}`);
    }

    // Wave 2 F3 — grant Season Pass XP (win/loss/hot-streak) for every player.
    // Idempotent (UNIQUE constraint), gated only by the season being known.
    // Failures here must NOT roll back the recorded match — XP is best-effort.
    if (seasonId) {
      try {
        const r = await grantSeasonPassXpForMatch(matchStats.matchId, seasonId);
        if (r.granted > 0) console.log(`[SeasonPass] match ${matchStats.matchId}: ${r.granted} XP events granted`);
      } catch (e) {
        console.warn(`[SeasonPass] grant failed for match ${matchStats.matchId}: ${e.message}`);
      }
    }

    // Grant achievements for every player — best-effort, non-blocking, happens after commit.
    const achievementGrants = [];
    try {
      for (const player of matchStats.players) {
        const accountId = player.accountId ? parseInt(player.accountId) : 0;
        if (!accountId || accountId === 0) continue;
        const newOnes = await checkAndGrantAchievements([accountId], matchStats.matchId);
        if (newOnes.length > 0) achievementGrants.push({ player, newOnes });
      }
      if (achievementGrants.length > 0) {
        console.log(`[Achievements] match ${matchStats.matchId}: ${achievementGrants.reduce((s, g) => s + g.newOnes.length, 0)} achievements granted`);
      }
    } catch (e) {
      console.warn(`[Achievements] grant failed for match ${matchStats.matchId}: ${e.message}`);
    }

    return { matchId: matchStats.matchId, achievementGrants };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      console.log(`[DB] Match ${matchStats.matchId} already recorded (duplicate).`);
      return { matchId: null, achievementGrants: [] };
    }
    throw err;
  } finally {
    client.release();
  }
}

async function isMatchRecorded(matchId) {
  const p = getPool();
  const result = await p.query('SELECT 1 FROM matches WHERE match_id = $1 LIMIT 1', [matchId]);
  return result.rows.length > 0;
}

async function isFileHashRecorded(fileHash) {
  if (!fileHash) return null;
  const p = getPool();
  const result = await p.query('SELECT match_id FROM matches WHERE file_hash = $1 LIMIT 1', [fileHash]);
  return result.rows.length > 0 ? result.rows[0].match_id : null;
}

async function getMatches(limit = 50, offset = 0, seasonId = null) {
  const p = getPool();
  const params = [limit, offset];
  const seasonClause = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT m.*,
       (SELECT COUNT(*) FROM player_stats ps WHERE ps.match_id = m.match_id) as player_count
     FROM matches m
     WHERE 1=1${seasonClause}
     ORDER BY m.date DESC
     LIMIT $1 OFFSET $2`,
    params
  );
  return result.rows;
}

async function getMatchCount(seasonId = null) {
  const p = getPool();
  if (seasonId === 'legacy') {
    const result = await p.query('SELECT COUNT(*) as count FROM matches WHERE is_legacy = true');
    return parseInt(result.rows[0].count);
  }
  if (seasonId) {
    const result = await p.query('SELECT COUNT(*) as count FROM matches WHERE season_id = $1', [parseInt(seasonId)]);
    return parseInt(result.rows[0].count);
  }
  const result = await p.query('SELECT COUNT(*) as count FROM matches WHERE is_legacy = false');
  return parseInt(result.rows[0].count);
}

async function getMatch(matchId) {
  const p = getPool();
  const matchResult = await p.query('SELECT * FROM matches WHERE match_id = $1', [matchId]);
  if (matchResult.rows.length === 0) return null;

  const playersResult = await p.query(
    `SELECT ps.*, n.nickname
     FROM player_stats ps
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE ps.match_id = $1
     ORDER BY team, kills DESC`,
    [matchId]
  );

  const itemsResult = await p.query(
    'SELECT * FROM player_items WHERE match_id = $1 ORDER BY slot, item_slot',
    [matchId]
  );

  const abilitiesResult = await p.query(
    'SELECT * FROM player_abilities WHERE match_id = $1 ORDER BY slot, time, ability_level',
    [matchId]
  );

  const itemsBySlot = {};
  for (const item of itemsResult.rows) {
    if (!itemsBySlot[item.slot]) itemsBySlot[item.slot] = [];
    itemsBySlot[item.slot].push(item);
  }

  const abilitiesBySlot = {};
  for (const ability of abilitiesResult.rows) {
    if (!abilitiesBySlot[ability.slot]) abilitiesBySlot[ability.slot] = [];
    abilitiesBySlot[ability.slot].push(ability);
  }

  for (const row of playersResult.rows) {
    row.persona_name = decodeByteString(row.persona_name);
    row.items = itemsBySlot[row.slot] || [];
    row.abilities = abilitiesBySlot[row.slot] || [];
  }

  const draftResult = await p.query(
    `SELECT hero_id, is_pick, order_num, team FROM match_draft WHERE match_id = $1 ORDER BY order_num ASC`,
    [matchId]
  );

  // 1.5 — MVP per match: account_id with the most MVP votes for this match
  // (ties broken by lower account_id for determinism). Null if no votes cast.
  let mvpAccountId = null;
  let mvpVoteCount = 0;
  try {
    const mvpRes = await p.query(
      `SELECT rated_account_id, COUNT(*)::int AS votes
         FROM match_ratings
        WHERE match_id = $1 AND is_mvp_vote = TRUE AND rated_account_id IS NOT NULL
        GROUP BY rated_account_id
        ORDER BY votes DESC, rated_account_id ASC
        LIMIT 1`,
      [matchId]
    );
    if (mvpRes.rows[0]) {
      mvpAccountId = String(mvpRes.rows[0].rated_account_id);
      mvpVoteCount = mvpRes.rows[0].votes;
    }
  } catch (e) {
    // match_ratings may not exist on very old DBs — fail silent so getMatch works
    console.warn('[getMatch] mvp lookup failed:', e.message);
  }

  return {
    ...matchResult.rows[0],
    mvp_account_id: mvpAccountId,
    mvp_vote_count: mvpVoteCount,
    players: playersResult.rows,
    draft: draftResult.rows,
  };
}

async function deleteMatch(matchId, deletedBy, reason) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    const matchResult = await client.query('SELECT * FROM matches WHERE match_id = $1', [matchId]);
    if (matchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const playersResult = await client.query('SELECT * FROM player_stats WHERE match_id = $1', [matchId]);

    const matchData = {
      match: matchResult.rows[0],
      players: playersResult.rows,
    };

    await client.query(
      `INSERT INTO match_deletions (match_id, match_data, deleted_by, reason)
       VALUES ($1, $2, $3, $4)`,
      [matchId, JSON.stringify(matchData), deletedBy || 'unknown', reason || '']
    );

    await client.query('DELETE FROM player_items WHERE match_id = $1', [matchId]);
    await client.query('DELETE FROM player_abilities WHERE match_id = $1', [matchId]);
    await client.query('DELETE FROM player_stats WHERE match_id = $1', [matchId]);
    await client.query('DELETE FROM match_draft WHERE match_id = $1', [matchId]);
    await client.query('DELETE FROM matches WHERE match_id = $1', [matchId]);

    await client.query('COMMIT');
    console.log(`[DB] Deleted match ${matchId} by ${deletedBy}`);
    return matchData;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getLeaderboard(limit = 50) {
  const p = getPool();
  const result = await p.query(
    `WITH perf_avg AS (
       SELECT account_id, ROUND(AVG(perf)::numeric, 1)::float AS avg_perf, COUNT(*) AS perf_games
         FROM player_stats WHERE perf IS NOT NULL GROUP BY account_id
     )
     SELECT
       COALESCE(n.nickname, r.player_id::text) as group_key,
       MAX(r.mmr) as mmr,
       MAX(r.mu) as mu,
       MIN(r.sigma) as sigma,
       SUM(r.wins)::int as wins,
       SUM(r.losses)::int as losses,
       SUM(r.games_played)::int as games_played,
       MAX(r.display_name) as display_name,
       MAX(r.player_id) as player_id,
       MAX(n.nickname) as nickname,
       MAX(r.last_updated) as last_updated,
       ROUND(AVG(pa.avg_perf)::numeric, 1)::float AS avg_perf,
       SUM(COALESCE(pa.perf_games, 0))::int AS perf_games
     FROM ratings r
     LEFT JOIN nicknames n ON n.account_id::text = r.player_id::text
     LEFT JOIN perf_avg pa ON pa.account_id::text = r.player_id::text
     GROUP BY COALESCE(n.nickname, r.player_id::text)
     ORDER BY mmr DESC LIMIT $1`,
    [limit]
  );
  for (const row of result.rows) {
    row.display_name = decodeByteString(row.display_name);
  }
  return result.rows;
}

// ── Site settings (key/value) ───────────────────────────────────────────────
async function getSetting(key) {
  const p = getPool();
  const res = await p.query('SELECT value FROM site_settings WHERE key = $1', [key]);
  return res.rows[0]?.value ?? null;
}

async function getAllSettings() {
  const p = getPool();
  const res = await p.query('SELECT key, value FROM site_settings');
  const out = {};
  for (const row of res.rows) out[row.key] = row.value;
  return out;
}

async function setSetting(key, value) {
  const p = getPool();
  await p.query(
    `INSERT INTO site_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value == null ? null : String(value)]
  );
  return { key, value };
}

// ── Feature flags (off / preview / on) ──────────────────────────────────────
const FEATURE_FLAG_STATES = new Set(['off', 'preview', 'on']);

async function getAllFeatureFlags() {
  const p = getPool();
  const res = await p.query(
    `SELECT key, state, description, enabled_at, created_at, updated_at
     FROM feature_flags ORDER BY key`
  );
  return res.rows;
}

async function getFeatureFlag(key) {
  const p = getPool();
  const res = await p.query(
    `SELECT key, state, description, enabled_at, created_at, updated_at
     FROM feature_flags WHERE key = $1`,
    [key]
  );
  return res.rows[0] || null;
}

async function setFeatureFlag(key, { state, description } = {}) {
  if (!key || typeof key !== 'string') throw new Error('feature flag key required');
  if (state != null && !FEATURE_FLAG_STATES.has(state)) {
    throw new Error(`invalid feature flag state: ${state}`);
  }
  const p = getPool();
  // Stamp enabled_at the first time the flag flips to 'on'.
  const enabledAtSql = state === 'on'
    ? `COALESCE(feature_flags.enabled_at, NOW())`
    : `feature_flags.enabled_at`;
  const res = await p.query(
    `INSERT INTO feature_flags (key, state, description, enabled_at, updated_at)
     VALUES ($1, COALESCE($2, 'off'), $3, CASE WHEN $2 = 'on' THEN NOW() ELSE NULL END, NOW())
     ON CONFLICT (key) DO UPDATE
       SET state = COALESCE(EXCLUDED.state, feature_flags.state),
           description = COALESCE(EXCLUDED.description, feature_flags.description),
           enabled_at = ${enabledAtSql},
           updated_at = NOW()
     RETURNING key, state, description, enabled_at, created_at, updated_at`,
    [key, state ?? null, description ?? null]
  );
  return res.rows[0];
}

// Returns a flat { key: bool } map resolved for the caller. Preview flags are
// "enabled" only when the caller is a superuser, so superusers can dogfood new
// features before they go live for everyone.
async function getResolvedFeatureFlags({ isSuperuser = false } = {}) {
  const rows = await getAllFeatureFlags();
  const out = {};
  for (const row of rows) {
    out[row.key] = row.state === 'on' || (row.state === 'preview' && isSuperuser);
  }
  return out;
}

// Bulk-flip every flag currently in 'preview' to 'on'. Used by the Season 10
// launch cron and the manual "Launch Now" admin button. Idempotent at the
// row level — re-running won't re-stamp enabled_at on already-on flags.
async function flipPreviewFlagsToOn() {
  const p = getPool();
  const res = await p.query(
    `UPDATE feature_flags
     SET state = 'on',
         enabled_at = COALESCE(enabled_at, NOW()),
         updated_at = NOW()
     WHERE state = 'preview'
     RETURNING key`
  );
  return res.rows.map(r => r.key);
}

// One-shot orchestrator for the Season 10 launch. Returns:
//   { alreadyLaunched: bool, launchedAt: iso|null, flippedKeys: string[] }
// Called from both the launch cron (in src/discord/bot.js) and the manual
// admin "Launch Now" endpoint. The Discord announcement is posted separately
// by the bot — this function only handles DB state.
async function executeSeason10Launch() {
  const launched = await getSetting('season_10_launched_at');
  if (launched) {
    return {
      alreadyLaunched: true,
      launchedAt: launched,
      flippedKeys: [],
      seasonId: null,
      tierPlacement: null,
    };
  }
  const flippedKeys = await flipPreviewFlagsToOn();
  // Always force the home banner on, even if nobody flipped it to preview.
  await setFeatureFlag('home_launch_banner', { state: 'on' });
  if (!flippedKeys.includes('home_launch_banner')) flippedKeys.push('home_launch_banner');

  // Provision the Season 10 row (idempotent — reuse if it already exists).
  const p = getPool();
  let seasonId = null;
  try {
    const existing = await p.query(`SELECT id FROM seasons WHERE name = $1 LIMIT 1`, ['Season 10']);
    if (existing.rows[0]) {
      seasonId = existing.rows[0].id;
      await p.query(`UPDATE seasons SET active = false`);
      await p.query(`UPDATE seasons SET active = true WHERE id = $1`, [seasonId]);
    } else {
      const created = await createSeason('Season 10');
      seasonId = created.id;
    }
    // Provision the default tier definitions (no-op if rows already exist).
    await ensureSeasonTiers(seasonId);
  } catch (err) {
    console.error('[Season10Launch] season/tier provisioning failed:', err.message);
  }

  // Place every registered player into their tier based on Dota rank_tier.
  // Non-fatal — best-effort; admins can re-run from the panel if needed.
  let tierPlacement = null;
  if (seasonId) {
    try {
      tierPlacement = await placeAllPlayersInSeasonTiers(seasonId);
    } catch (err) {
      console.error('[Season10Launch] tier placement failed:', err.message);
    }
  }

  const launchedAt = new Date().toISOString();
  await setSetting('season_10_launched_at', launchedAt);
  return { alreadyLaunched: false, launchedAt, flippedKeys, seasonId, tierPlacement };
}

// ── TrueSkill V3 ────────────────────────────────────────────────────────────
// Computes per-season TrueSkill ratings using the V3 environment and a
// per-match, per-player performance modifier derived from the same scoring
// formula used by the weekend tournament. Modifier is z-scored within each
// match (ddof=0), clamped to ±2σ, then mapped to [0.80, 1.20]. Lobby-only
// matches (no stats) fall back to modifier = 1.0 for everyone. Sole rating
// engine since v5.90; the legacy V1 implementation was removed in v5.95.
function _v3PerfScore(s, won) {
  const winBonus = won ? 25 : 0;
  // Deward scoring: small tiebreaker weights — obs kills (1.5 pts), sentry kills (0.5 pts), no cap.
  // Weights are intentionally small so dewards differentiate active vs passive supports
  // without creating a systematic position-wide bonus on top of obs_placed / sen_placed.
  // obs_dewarded_count / sen_dewarded_count are only populated for matches parsed with
  // the extended parser. When the split is missing, fall back to 0.75 pts per combined kill.
  const hasDewardSplit = (s.obs_dewards || 0) + (s.sen_dewards || 0) > 0;
  const dewardPts = hasDewardSplit
    ? (s.obs_dewards || 0) * 1.5 + (s.sen_dewards || 0) * 0.5
    : (s.dewards    || 0) * 0.75;
  return (
    (s.kills        || 0) * 4
    + (s.assists    || 0) * 2.5
    + (s.deaths     || 0) * -3
    + (s.gpm        || 0) * 0.25
    + (s.xpm        || 0) * 0.22
    + (s.hero_dmg   || 0) / 2000
    + (s.tower_dmg  || 0) / 1000
    + (s.healing    || 0) / 1500
    + (s.camps      || 0) * 7
    + (s.obs        || 0) * 4
    + (s.sen        || 0) * 6
    + dewardPts
    + winBonus
  );
}

// Same as _v3PerfScore, but returns the per-component contributions so the UI
// can explain *why* a player's modifier landed where it did. The component sum
// equals what _v3PerfScore returns.
function _v3PerfScoreBreakdown(s, won) {
  const hasDewardSplit = (s.obs_dewards || 0) + (s.sen_dewards || 0) > 0;
  const dewardPts = hasDewardSplit
    ? (s.obs_dewards || 0) * 1.5 + (s.sen_dewards || 0) * 0.5
    : (s.dewards    || 0) * 0.75;
  const parts = {
    kills:        (s.kills      || 0) * 4,
    assists:      (s.assists    || 0) * 2.5,
    deaths:       (s.deaths     || 0) * -3,
    gpm:          (s.gpm        || 0) * 0.25,
    xpm:          (s.xpm        || 0) * 0.22,
    hero_damage:  (s.hero_dmg   || 0) / 2000,
    tower_damage: (s.tower_dmg  || 0) / 1000,
    healing:      (s.healing    || 0) / 1500,
    camps:        (s.camps      || 0) * 7,
    obs:          (s.obs        || 0) * 4,
    sen:          (s.sen        || 0) * 6,
    dewards:      dewardPts,
    win:          won ? 25 : 0,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts };
}

// Convert per-player performance scores (keyed by canonical id) into per-player
// modifiers for V3 rating updates. Z-scores are clamped to ±2σ and then mapped
// linearly to [0.80, 1.20] (z=-2 → 0.80, z=0 → 1.00, z=+2 → 1.20). When all
// scores are equal (std=0), every modifier is 1.0.
function _v3ScoresToModifiers(scoreByCanon) {
  const allScores = Object.values(scoreByCanon);
  const out = {};
  const n = allScores.length;
  if (n === 0) return out;
  const mean = allScores.reduce((a, b) => a + b, 0) / n;
  const variance = allScores.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  for (const [cid, sc] of Object.entries(scoreByCanon)) {
    let z = std > 0 ? (sc - mean) / std : 0;
    if (z >  2) z =  2;
    if (z < -2) z = -2;
    out[cid] = 1.0 + 0.10 * z;
  }
  return out;
}

// Defensive guard: if canonical-account merging produced the same player ID on
// both Radiant and Dire, the match must be skipped — TrueSkill can't sensibly
// update one rating from two opposing teams in a single update.
function _v3HasCrossTeamCollision(radiantIds, direIds) {
  const r = new Set(radiantIds);
  for (const id of direIds) if (r.has(id)) return true;
  return false;
}

async function computeSeasonTrueSkillV3(seasonId = null, _poolForTest = null) {
  const p = _poolForTest || getPool();
  const { getStatsService } = require('../stats/statsService');
  const statsService = getStatsService();

  // Same canonical-account merge logic as v1
  const nickRes = await p.query('SELECT account_id, nickname FROM nicknames');
  const nicknameToIds = {};
  for (const row of nickRes.rows) {
    const aid = row.account_id.toString();
    const nick = row.nickname.toLowerCase();
    if (!nicknameToIds[nick]) nicknameToIds[nick] = [];
    nicknameToIds[nick].push(aid);
  }
  const accountToCanonical = {};
  for (const ids of Object.values(nicknameToIds)) {
    if (ids.length < 2) continue;
    ids.sort();
    const canonical = ids[0];
    for (const id of ids) accountToCanonical[id] = canonical;
  }
  const getCanonical = (id) => accountToCanonical[id] || id;

  const params = [];
  let matchWhere;
  if (seasonId === 'legacy') {
    matchWhere = 'WHERE m.is_legacy = true';
  } else if (seasonId !== null && seasonId !== undefined) {
    params.push(parseInt(seasonId));
    matchWhere = `WHERE m.season_id = $${params.length}`;
  } else {
    matchWhere = 'WHERE m.is_legacy = false';
  }

  // Pull match basics + per-player performance columns
  const rows = await p.query(
    `SELECT m.match_id, m.date, m.radiant_win,
            ps.account_id, ps.persona_name, ps.team,
            ps.kills, ps.deaths, ps.assists,
            ps.gpm, ps.xpm,
            ps.hero_damage, ps.tower_damage, ps.hero_healing,
            ps.obs_placed, ps.sen_placed, ps.wards_killed, ps.camps_stacked,
            ps.obs_dewarded_count, ps.sen_dewarded_count
     FROM matches m
     JOIN player_stats ps ON ps.match_id = m.match_id
     ${matchWhere}
     ORDER BY m.date ASC, m.match_id ASC`,
    params
  );

  // Group by match
  const matchMap = new Map();
  for (const row of rows.rows) {
    if (!matchMap.has(row.match_id)) {
      matchMap.set(row.match_id, { radiantWin: row.radiant_win, radiant: [], dire: [], allEntries: [] });
    }
    const rawId = row.account_id > 0 ? row.account_id.toString() : null;
    if (!rawId) continue;
    const id = getCanonical(rawId);
    const stats = {
      kills:      Number(row.kills) || 0,
      deaths:     Number(row.deaths) || 0,
      assists:    Number(row.assists) || 0,
      gpm:        Number(row.gpm) || 0,
      xpm:        Number(row.xpm) || 0,
      hero_dmg:   Number(row.hero_damage) || 0,
      tower_dmg:  Number(row.tower_damage) || 0,
      healing:    Number(row.hero_healing) || 0,
      obs:          Number(row.obs_placed) || 0,
      sen:          Number(row.sen_placed) || 0,
      dewards:      Number(row.wards_killed) || 0,
      obs_dewards:  Number(row.obs_dewarded_count) || 0,
      sen_dewards:  Number(row.sen_dewarded_count) || 0,
      camps:        Number(row.camps_stacked) || 0,
    };
    const entry = { id, persona_name: row.persona_name, stats };
    const m = matchMap.get(row.match_id);
    if (row.team === 'radiant') m.radiant.push(entry);
    else m.dire.push(entry);
    m.allEntries.push({ ...entry, team: row.team });
  }

  const DEFAULT_MU = 25, DEFAULT_SIGMA = 8.333;
  const ratings = {};

  for (const [, match] of matchMap) {
    if (match.radiant.length === 0 || match.dire.length === 0) continue;

    // Detect "stats present" — any non-trivial value across the 10 players
    const hasStats = match.allEntries.some(e => {
      const s = e.stats;
      return (s.kills + s.deaths + s.assists + s.gpm + s.xpm + s.hero_dmg + s.tower_dmg + s.healing + s.obs + s.sen + s.dewards + s.camps) > 0;
    });

    // Compute modifiers per canonical player ID for this match
    let modByCanon = {};
    if (hasStats) {
      const scoreByCanon = {};
      for (const e of match.allEntries) {
        const won = (e.team === 'radiant') === match.radiantWin;
        const sc = _v3PerfScore(e.stats, won);
        // If a canonical player appears twice (two merged accounts in same match),
        // keep the higher score
        scoreByCanon[e.id] = scoreByCanon[e.id] != null ? Math.max(scoreByCanon[e.id], sc) : sc;
      }
      modByCanon = _v3ScoresToModifiers(scoreByCanon);
    }

    const dedup = (team) => {
      const seen = new Set();
      return team.filter(pl => seen.has(pl.id) ? false : seen.add(pl.id));
    };
    const buildSide = (side) => dedup(side).map(pl => ({
      id: pl.id,
      mu:    ratings[pl.id]?.mu    ?? DEFAULT_MU,
      sigma: ratings[pl.id]?.sigma ?? DEFAULT_SIGMA,
      modifier: hasStats ? (modByCanon[pl.id] ?? 1.0) : 1.0,
    }));
    const radiant = buildSide(match.radiant);
    const dire    = buildSide(match.dire);

    // Defensive guard: if canonical-account merging collapsed two raw
    // accounts that played on opposite sides into the same canonical id,
    // skip this match — TrueSkill can't update one rating from both teams.
    if (_v3HasCrossTeamCollision(radiant.map(pl => pl.id), dire.map(pl => pl.id))) {
      continue;
    }

    const newRatings = statsService.calculateNewRatingsV3(radiant, dire, match.radiantWin);

    for (const r of newRatings) {
      const isRadiant = radiant.some(pl => pl.id === r.id);
      const won = isRadiant ? match.radiantWin : !match.radiantWin;
      const playerInfo = [...match.radiant, ...match.dire].find(pl => pl.id === r.id);
      if (!ratings[r.id]) {
        ratings[r.id] = { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA, wins: 0, losses: 0, display_name: playerInfo?.persona_name || r.id };
      }
      ratings[r.id].mu = r.mu;
      ratings[r.id].sigma = r.sigma;
      ratings[r.id].mmr = r.mmr;
      if (won) ratings[r.id].wins++;
      else ratings[r.id].losses++;
      if (playerInfo?.persona_name) ratings[r.id].display_name = playerInfo.persona_name;
    }
  }

  return { ratings, accountToCanonical };
}

// Build the canonical-account map used by V3 (lowercase-nickname collisions are
// merged onto the lowest raw account id). Returns a getCanonical(rawId) helper.
async function _v3BuildCanonicalResolver(p) {
  const nickRes = await p.query('SELECT account_id, nickname FROM nicknames');
  const nicknameToIds = {};
  for (const row of nickRes.rows) {
    const aid = row.account_id.toString();
    const nick = row.nickname.toLowerCase();
    if (!nicknameToIds[nick]) nicknameToIds[nick] = [];
    nicknameToIds[nick].push(aid);
  }
  const accountToCanonical = {};
  for (const ids of Object.values(nicknameToIds)) {
    if (ids.length < 2) continue;
    ids.sort();
    const canonical = ids[0];
    for (const id of ids) accountToCanonical[id] = canonical;
  }
  return {
    accountToCanonical,
    getCanonical: (id) => accountToCanonical[String(id)] || String(id),
  };
}

function _v3StatsFromRow(row) {
  return {
    kills:       Number(row.kills) || 0,
    deaths:      Number(row.deaths) || 0,
    assists:     Number(row.assists) || 0,
    gpm:         Number(row.gpm) || 0,
    xpm:         Number(row.xpm) || 0,
    hero_dmg:    Number(row.hero_damage) || 0,
    tower_dmg:   Number(row.tower_damage) || 0,
    healing:     Number(row.hero_healing) || 0,
    obs:         Number(row.obs_placed) || 0,
    sen:         Number(row.sen_placed) || 0,
    dewards:     Number(row.wards_killed) || 0,
    obs_dewards: Number(row.obs_dewarded_count) || 0,
    sen_dewards: Number(row.sen_dewarded_count) || 0,
    camps:       Number(row.camps_stacked) || 0,
  };
}

function _v3HasMeaningfulStats(entries) {
  return entries.some(e => {
    const s = e.stats;
    return (
      s.kills + s.deaths + s.assists + s.gpm + s.xpm +
      s.hero_dmg + s.tower_dmg + s.healing +
      s.obs + s.sen + s.dewards + s.camps
    ) > 0;
  });
}

// Per-match V3 modifier breakdown for every player in the match. Returns an
// entry per raw account_id (post-merge canonical id is also included so the
// frontend can de-dupe across merged accounts). Mirrors exactly the math used
// inside computeSeasonTrueSkillV3 so what's shown to the player matches the
// rating update they actually received.
async function getMatchV3Modifiers(matchId, _poolForTest = null) {
  const p = _poolForTest || getPool();
  const { getCanonical } = await _v3BuildCanonicalResolver(p);

  const rows = await p.query(
    `SELECT m.match_id, m.radiant_win,
            ps.account_id, ps.persona_name, ps.team,
            ps.kills, ps.deaths, ps.assists,
            ps.gpm, ps.xpm,
            ps.hero_damage, ps.tower_damage, ps.hero_healing,
            ps.obs_placed, ps.sen_placed, ps.wards_killed, ps.camps_stacked,
            ps.obs_dewarded_count, ps.sen_dewarded_count
     FROM matches m
     JOIN player_stats ps ON ps.match_id = m.match_id
     WHERE m.match_id = $1`,
    [matchId]
  );
  if (rows.rows.length === 0) return { modifiers: [], hasStats: false, radiantWin: null };

  const radiantWin = rows.rows[0].radiant_win;
  const allEntries = [];
  for (const row of rows.rows) {
    const rawId = row.account_id > 0 ? row.account_id.toString() : null;
    if (!rawId) continue;
    allEntries.push({
      rawId,
      canonicalId: getCanonical(rawId),
      persona: row.persona_name,
      team: row.team,
      stats: _v3StatsFromRow(row),
    });
  }

  const hasStats = _v3HasMeaningfulStats(allEntries);

  // Per-canonical score (and breakdown) — when a canonical id appears twice
  // because of merged accounts in the same match, keep the higher-scoring one
  // (matches computeSeasonTrueSkillV3's behaviour).
  const scoreByCanon = {};
  const breakdownByCanon = {};
  for (const e of allEntries) {
    const won = (e.team === 'radiant') === radiantWin;
    const bd = _v3PerfScoreBreakdown(e.stats, won);
    if (scoreByCanon[e.canonicalId] == null || bd.total > scoreByCanon[e.canonicalId]) {
      scoreByCanon[e.canonicalId] = bd.total;
      breakdownByCanon[e.canonicalId] = bd;
    }
  }
  const modByCanon = hasStats ? _v3ScoresToModifiers(scoreByCanon) : {};

  const modifiers = allEntries.map(e => {
    const won = (e.team === 'radiant') === radiantWin;
    return {
      account_id: e.rawId,
      canonical_id: e.canonicalId,
      persona_name: e.persona,
      team: e.team,
      won,
      has_stats: hasStats,
      modifier: hasStats ? (modByCanon[e.canonicalId] ?? 1.0) : 1.0,
      score: hasStats ? (scoreByCanon[e.canonicalId] ?? 0) : 0,
      components: hasStats ? (breakdownByCanon[e.canonicalId]?.parts ?? null) : null,
    };
  });

  return { modifiers, hasStats, radiantWin };
}

// Per-match V3 modifier history for a single player (across all matches they
// played). One DB round-trip pulls every player_stats row for every match the
// player participated in; modifiers are then computed in memory using the same
// math as computeSeasonTrueSkillV3. Lobby-only matches with no detailed stats
// are included with modifier=1.0 and has_stats=false, mirroring the way V3
// actually treats them (no per-match scaling) so the player's profile chart
// shows every game they played.
async function getPlayerV3ModifierHistory(accountId, _poolForTest = null) {
  const p = _poolForTest || getPool();
  const ids = _poolForTest
    ? [parseInt(accountId)].filter(Number.isFinite)
    : await getMergedAccountIds(accountId);
  if (!ids || ids.length === 0) return [];
  const idsAsBigint = ids.map(id => parseInt(id)).filter(Number.isFinite);
  if (idsAsBigint.length === 0) return [];

  const { getCanonical } = await _v3BuildCanonicalResolver(p);
  const playerCanonical = getCanonical(String(idsAsBigint[0]));

  const matchIdsRes = await p.query(
    `SELECT DISTINCT match_id FROM player_stats WHERE account_id = ANY($1::bigint[])`,
    [idsAsBigint]
  );
  const matchIds = matchIdsRes.rows.map(r => r.match_id);
  if (matchIds.length === 0) return [];

  const rows = await p.query(
    `SELECT m.match_id, m.date, m.radiant_win,
            ps.account_id, ps.team,
            ps.kills, ps.deaths, ps.assists,
            ps.gpm, ps.xpm,
            ps.hero_damage, ps.tower_damage, ps.hero_healing,
            ps.obs_placed, ps.sen_placed, ps.wards_killed, ps.camps_stacked,
            ps.obs_dewarded_count, ps.sen_dewarded_count
     FROM matches m
     JOIN player_stats ps ON ps.match_id = m.match_id
     WHERE m.match_id = ANY($1)
     ORDER BY m.date ASC, m.match_id ASC`,
    [matchIds]
  );

  const byMatch = new Map();
  for (const row of rows.rows) {
    if (!byMatch.has(row.match_id)) {
      byMatch.set(row.match_id, { date: row.date, radiantWin: row.radiant_win, entries: [] });
    }
    const rawId = row.account_id > 0 ? row.account_id.toString() : null;
    if (!rawId) continue;
    byMatch.get(row.match_id).entries.push({
      rawId,
      canonicalId: getCanonical(rawId),
      team: row.team,
      stats: _v3StatsFromRow(row),
    });
  }

  const out = [];
  for (const [matchId, m] of byMatch) {
    const playerEntry = m.entries.find(e => e.canonicalId === playerCanonical);
    if (!playerEntry) continue;
    const won = (playerEntry.team === 'radiant') === m.radiantWin;
    const hasStats = _v3HasMeaningfulStats(m.entries);

    if (!hasStats) {
      // Lobby-only match: V3 applies a 1.00× modifier (no penalty), so we
      // surface it here as well so profile history truly reflects every
      // played match — explaining why MMR moved with no per-match scaling.
      out.push({
        match_id: matchId,
        date: m.date,
        modifier: 1.0,
        score: 0,
        won,
        has_stats: false,
      });
      continue;
    }

    const scoreByCanon = {};
    for (const e of m.entries) {
      const eWon = (e.team === 'radiant') === m.radiantWin;
      const sc = _v3PerfScore(e.stats, eWon);
      scoreByCanon[e.canonicalId] = scoreByCanon[e.canonicalId] != null
        ? Math.max(scoreByCanon[e.canonicalId], sc)
        : sc;
    }
    const mods = _v3ScoresToModifiers(scoreByCanon);
    out.push({
      match_id: matchId,
      date: m.date,
      modifier: mods[playerCanonical] ?? 1.0,
      score: scoreByCanon[playerCanonical] ?? 0,
      won,
      has_stats: true,
    });
  }

  out.sort((a, b) => new Date(a.date) - new Date(b.date));
  return out;
}

// ── TrueSkill 2 (experimental) ──────────────────────────────────────────────
// Runs both TS1 and TS2 from scratch in one pass and returns a comparison
// leaderboard. TS2 differs from TS1 in that the μ update for each player is
// scaled by a per-match performance modifier derived from their K/D/A relative
// to the other nine players in that match. σ reduction is identical to TS1.
//
// Modifier range: 0.65× (very poor game) → 1.35× (standout game).
// If a match has no K/D/A data (lobby-only) the modifier defaults to 1.0.
async function computeTS2Leaderboard(seasonId = null) {
  const p = getPool();
  const { getStatsService } = require('../stats/statsService');
  const statsService = getStatsService();

  // ── Canonical ID map (nickname merging) ──────────────────────────────────
  const nickRes = await p.query('SELECT account_id, nickname FROM nicknames');
  const nicknameToIds = {};
  for (const row of nickRes.rows) {
    const aid = row.account_id.toString();
    const nick = row.nickname.toLowerCase();
    if (!nicknameToIds[nick]) nicknameToIds[nick] = [];
    nicknameToIds[nick].push(aid);
  }
  const accountToCanonical = {};
  for (const ids of Object.values(nicknameToIds)) {
    if (ids.length < 2) continue;
    ids.sort();
    const canonical = ids[0];
    for (const id of ids) accountToCanonical[id] = canonical;
  }
  const getCanonical = (id) => accountToCanonical[id] || id;

  // ── Season / legacy filter ────────────────────────────────────────────────
  const params = [];
  let matchWhere;
  if (seasonId === 'legacy') {
    matchWhere = 'WHERE m.is_legacy = true';
  } else if (seasonId !== null && seasonId !== undefined) {
    params.push(parseInt(seasonId));
    matchWhere = `WHERE m.season_id = $${params.length}`;
  } else {
    matchWhere = 'WHERE m.is_legacy = false';
  }

  // Pull matches + per-player K/D/A for the performance signal
  const rows = await p.query(
    `SELECT m.match_id, m.date, m.radiant_win,
            ps.account_id, ps.persona_name, ps.team,
            ps.kills, ps.deaths, ps.assists
     FROM matches m
     JOIN player_stats ps ON ps.match_id = m.match_id
     ${matchWhere}
     ORDER BY m.date ASC, m.match_id ASC`,
    params
  );

  // Group rows into match map
  const matchMap = new Map();
  for (const row of rows.rows) {
    if (!matchMap.has(row.match_id)) {
      matchMap.set(row.match_id, { radiantWin: row.radiant_win, radiant: [], dire: [] });
    }
    const rawId = row.account_id > 0 ? row.account_id.toString() : null;
    if (!rawId) continue;
    const id = getCanonical(rawId);
    const entry = {
      id,
      persona_name: row.persona_name,
      kills: parseInt(row.kills) || 0,
      deaths: parseInt(row.deaths) || 0,
      assists: parseInt(row.assists) || 0,
    };
    if (row.team === 'radiant') matchMap.get(row.match_id).radiant.push(entry);
    else matchMap.get(row.match_id).dire.push(entry);
  }

  // ── Performance modifier: z-score within match, mapped to [0.65, 1.35] ───
  function buildModifiers(all10) {
    const hasStats = all10.some(p => p.kills + p.assists + p.deaths > 0);
    if (!hasStats || all10.length < 2) {
      const m = {}; all10.forEach(p => { m[p.id] = 1.0; }); return m;
    }
    const radiantKills = all10.filter(p => p._team === 'radiant').reduce((s, p) => s + p.kills, 0);
    const direKills    = all10.filter(p => p._team === 'dire').reduce((s, p) => s + p.kills, 0);
    const scores = all10.map(p => {
      const teamK = p._team === 'radiant' ? radiantKills : direKills;
      const ki  = teamK > 0 ? (p.kills + p.assists) / teamK : 0;
      const eff = (p.kills + p.assists * 1.35) / Math.pow(p.deaths + 3, 0.85);
      return { id: p.id, raw: ki * 0.5 + eff * 0.5 };
    });
    const vals = scores.map(s => s.raw);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std  = Math.sqrt(vals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / vals.length) || 1;
    const mods = {};
    for (const s of scores) {
      const z = Math.max(-2, Math.min(2, (s.raw - mean) / std));
      mods[s.id] = 1.0 + z * 0.175; // z=±2 → modifier ≈ [0.65, 1.35]
    }
    return mods;
  }

  const DEFAULT_MU = 25, DEFAULT_SIGMA = 8.333;
  const MMR_OFFSET = 5000;
  // Two separate rating stores — both start from the same blank slate
  const ts1 = {}; // pure TrueSkill 1
  const ts2 = {}; // TrueSkill 2 (performance-scaled μ)

  const dedup = (team) => {
    const seen = new Set();
    return team.filter(pl => seen.has(pl.id) ? false : seen.add(pl.id));
  };

  for (const [, match] of matchMap) {
    if (match.radiant.length === 0 || match.dire.length === 0) continue;

    const radiant = dedup(match.radiant);
    const dire    = dedup(match.dire);
    const all10   = [
      ...radiant.map(p => ({ ...p, _team: 'radiant' })),
      ...dire.map(p => ({ ...p, _team: 'dire' })),
    ];
    const modifiers = buildModifiers(all10);

    // Build TS input from current TS2 state (so TS2 diverges naturally over time)
    const rInput = radiant.map(pl => ({
      id: pl.id,
      mu:    ts2[pl.id]?.mu    ?? DEFAULT_MU,
      sigma: ts2[pl.id]?.sigma ?? DEFAULT_SIGMA,
    }));
    const dInput = dire.map(pl => ({
      id: pl.id,
      mu:    ts2[pl.id]?.mu    ?? DEFAULT_MU,
      sigma: ts2[pl.id]?.sigma ?? DEFAULT_SIGMA,
    }));

    // TS1 input from ts1 store
    const rInput1 = radiant.map(pl => ({
      id: pl.id,
      mu:    ts1[pl.id]?.mu    ?? DEFAULT_MU,
      sigma: ts1[pl.id]?.sigma ?? DEFAULT_SIGMA,
    }));
    const dInput1 = dire.map(pl => ({
      id: pl.id,
      mu:    ts1[pl.id]?.mu    ?? DEFAULT_MU,
      sigma: ts1[pl.id]?.sigma ?? DEFAULT_SIGMA,
    }));

    const ts1New = statsService.calculateNewRatings(rInput1, dInput1, match.radiantWin);
    const ts2Raw = statsService.calculateNewRatings(rInput,  dInput,  match.radiantWin);

    for (let i = 0; i < ts1New.length; i++) {
      const r1 = ts1New[i];
      const r2 = ts2Raw[i];
      const id = r1.id;
      const isRad = radiant.some(pl => pl.id === id);
      const won   = isRad ? match.radiantWin : !match.radiantWin;
      const dn    = all10.find(p => p.id === id)?.persona_name || id;

      // TS1 — plain update
      if (!ts1[id]) ts1[id] = { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA, wins: 0, losses: 0, display_name: dn };
      ts1[id].mu    = r1.mu;
      ts1[id].sigma = r1.sigma;
      ts1[id].mmr   = r1.mmr;
      if (won) ts1[id].wins++; else ts1[id].losses++;
      if (dn) ts1[id].display_name = dn;

      // TS2 — scale the μ delta by performance modifier, keep σ from TS1
      const oldMu  = ts2[id]?.mu ?? DEFAULT_MU;
      const deltaMu = r2.mu - oldMu;
      const mod     = modifiers[id] ?? 1.0;
      const newMu   = oldMu + deltaMu * mod;
      const newSigma = r2.sigma; // same info gain as TS1
      const newMmr   = Math.round((newMu - 3 * newSigma) * 100) + MMR_OFFSET;

      if (!ts2[id]) ts2[id] = { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA, wins: 0, losses: 0, display_name: dn };
      ts2[id].mu    = newMu;
      ts2[id].sigma = newSigma;
      ts2[id].mmr   = newMmr;
      if (won) ts2[id].wins++; else ts2[id].losses++;
      if (dn) ts2[id].display_name = dn;
    }
  }

  // Build comparison leaderboard sorted by TS2 MMR
  const leaderboard = Object.keys(ts2).map(id => {
    const t2 = ts2[id];
    const t1 = ts1[id];
    return {
      player_id:    id,
      display_name: t2.display_name,
      ts2_mmr:      t2.mmr,
      ts2_mu:       parseFloat(t2.mu.toFixed(3)),
      ts2_sigma:    parseFloat(t2.sigma.toFixed(3)),
      ts1_mmr:      t1?.mmr ?? 5000,
      delta:        t2.mmr - (t1?.mmr ?? 5000),
      wins:         t2.wins,
      losses:       t2.losses,
      games:        t2.wins + t2.losses,
    };
  });
  leaderboard.sort((a, b) => b.ts2_mmr - a.ts2_mmr);
  return leaderboard;
}

// ── Impact Score helpers ────────────────────────────────────────────────────
// Position-neutral formula — Google Sheet =LET() adaptation by Grok.
// Inputs: per-game averages + kill involvement fraction (0–1).
// avgKills/avgDeaths/avgAssists are per-game averages.
// killInvolvement is a 0–1 fraction: avg((kills+assists)/team_kills) per game.
function _computeImpactRaw(games, wins, avgKills, avgDeaths, avgAssists, killInvolvement) {
  if (!games || games <= 0) return null;
  const losses  = games - wins;
  const winrate = wins / games;

  // Adjusted efficiency: assists boosted (supports get credit), deaths softened.
  // ^0.85 applied to the whole expression, matching the spreadsheet =LET formula.
  const inner      = avgDeaths === 0 ? 8 : (avgKills + avgAssists * 1.35) / (avgDeaths + 3);
  const efficiency = Math.pow(inner, 0.85);

  // Main base score
  const base = (winrate * 520)
    + (killInvolvement * 340)
    + (efficiency * 28)
    + (games * 5.5)
    - (losses * 4.2)
    - (Math.pow(1 - winrate, 1.12) * 265)
    - (wins === 0 ? 310 : 0);

  // Volume multiplier — LOG is base-10 (matches Google Sheets LOG)
  const volMult = Math.min(Math.log10(games + 3.5), 1.15);

  // Role-neutral bonuses
  const bonuses =
    (winrate === 1 && games >= 3                     ? 165 : 0) +
    (winrate >= 0.75 && winrate < 1 && games >= 3   ? 105 : 0) +
    (winrate >= 0.60 && winrate < 0.75 && games >= 3 ?  65 : 0) +
    (efficiency > 3.8                                ?  28 : 0) +
    (efficiency > 6.0                                ?  14 : 0);

  if (games < 3) {
    return Math.min(base * 0.85, 520) + bonuses;
  } else {
    return base * volMult + bonuses;
  }
}

// Rank a player's raw score among all players and return a 1–10 tier.
// Percentile breakpoints mirror the Google Sheet column N formula.
function _computeImpactTier(rawScore, allRawScores) {
  const total = allRawScores.length;
  if (total === 0) return null;
  // Rank = number of players with a strictly higher raw score + 1 (1 = best)
  const rank = allRawScores.filter(s => s > rawScore).length + 1;
  const pct  = rank / total;
  if (pct <= 0.075) return 10;
  if (pct <= 0.15)  return 9;
  if (pct <= 0.30)  return 8;
  if (pct <= 0.45)  return 7;
  if (pct <= 0.60)  return 6;
  if (pct <= 0.70)  return 5;
  if (pct <= 0.80)  return 4;
  if (pct <= 0.90)  return 3;
  if (pct <= 0.97)  return 2;
  return 1;
}
// ────────────────────────────────────────────────────────────────────────────

async function getComputedLeaderboard(seasonId = null) {
  const p = getPool();

  // TrueSkill V3 is the sole production rating engine (V1 removed in v5.95).
  const { ratings } = await computeSeasonTrueSkillV3(seasonId);

  // Fetch nicknames and build canonical-account mapping
  const nicknamesRes = await p.query(
    'SELECT account_id, nickname, dota_rank_tier, dota_leaderboard_rank, dota_rank_source FROM nicknames'
  );
  const nicknames = {};
  const nicknameToIds = {};
  const rankByAccount = {};
  for (const n of nicknamesRes.rows) {
    const aid = n.account_id.toString();
    nicknames[aid] = n.nickname;
    rankByAccount[aid] = {
      dota_rank_tier: n.dota_rank_tier ?? null,
      dota_leaderboard_rank: n.dota_leaderboard_rank ?? null,
      dota_rank_source: n.dota_rank_source ?? null,
    };
    const nick = n.nickname.toLowerCase();
    if (!nicknameToIds[nick]) nicknameToIds[nick] = [];
    nicknameToIds[nick].push(aid);
  }
  // canonical → all account IDs in the group (for rank lookup across merged accounts)
  const canonicalToAll = {};
  const accountToCanonical = {};
  for (const ids of Object.values(nicknameToIds)) {
    ids.sort();
    const canonical = ids[0];
    canonicalToAll[canonical] = ids;
    if (ids.length < 2) continue;
    for (const id of ids) accountToCanonical[id] = canonical;
  }
  // For any solo account not in a merge group, register it too
  for (const aid of Object.keys(rankByAccount)) {
    if (!canonicalToAll[aid] && !accountToCanonical[aid]) {
      canonicalToAll[aid] = [aid];
    }
  }
  const getCanonical = (id) => accountToCanonical[id.toString()] || id.toString();

  // Pick the best rank data across all merged accounts for a canonical player ID.
  // "Best" = highest dota_rank_tier among the group's accounts (higher number = higher rank).
  const getRankForCanonical = (canonicalId) => {
    const ids = canonicalToAll[canonicalId] || [canonicalId];
    let best = null;
    for (const id of ids) {
      const r = rankByAccount[id];
      if (r && r.dota_rank_tier != null) {
        if (!best || r.dota_rank_tier > best.dota_rank_tier) best = r;
      }
    }
    return best || { dota_rank_tier: null, dota_leaderboard_rank: null, dota_rank_source: null };
  };

  // Fetch season-scoped per-game averages + kill involvement from player_stats.
  // Kill involvement = avg per-game fraction of team kills a player participated in.
  // Uses a window function to compute team kills per match/team.
  const statsParams = [];
  let statsWhere;
  if (seasonId === 'legacy') {
    statsWhere = 'AND m.is_legacy = true';
  } else if (seasonId !== null && seasonId !== undefined) {
    statsParams.push(parseInt(seasonId));
    statsWhere = `AND m.season_id = $${statsParams.length}`;
  } else {
    statsWhere = 'AND m.is_legacy = false';
  }
  const statsRows = await p.query(
    `WITH per_game AS (
       SELECT
         ps.account_id,
         ps.kills,
         ps.deaths,
         ps.assists,
         SUM(ps.kills) OVER (PARTITION BY ps.match_id, ps.team) AS team_kills
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id != 0 ${statsWhere}
     )
     SELECT
       account_id::text                                               AS account_id,
       COUNT(*)                                                       AS game_count,
       AVG(kills)                                                     AS avg_kills,
       AVG(deaths)                                                    AS avg_deaths,
       AVG(assists)                                                   AS avg_assists,
       AVG(CASE WHEN team_kills > 0
                THEN (kills + assists)::float / team_kills
                ELSE 0 END)                                          AS avg_ki
     FROM per_game
     GROUP BY account_id`,
    statsParams
  );

  // Merge stats by canonical player_id (weighted average for merged accounts)
  const statsAgg = {};
  for (const row of statsRows.rows) {
    const cid   = getCanonical(row.account_id);
    const gc    = parseFloat(row.game_count) || 0;
    if (!statsAgg[cid]) statsAgg[cid] = { sumKills: 0, sumDeaths: 0, sumAssists: 0, sumKi: 0, games: 0 };
    statsAgg[cid].sumKills   += parseFloat(row.avg_kills)   * gc;
    statsAgg[cid].sumDeaths  += parseFloat(row.avg_deaths)  * gc;
    statsAgg[cid].sumAssists += parseFloat(row.avg_assists) * gc;
    statsAgg[cid].sumKi      += parseFloat(row.avg_ki)      * gc;
    statsAgg[cid].games      += gc;
  }
  // Resolve weighted averages
  for (const cid of Object.keys(statsAgg)) {
    const s = statsAgg[cid];
    const g = s.games || 1;
    s.avgKills   = s.sumKills   / g;
    s.avgDeaths  = s.sumDeaths  / g;
    s.avgAssists = s.sumAssists / g;
    s.avgKi      = s.sumKi      / g;
  }

  // Build sorted leaderboard array
  const leaderboard = Object.entries(ratings).map(([player_id, r]) => {
    const rank = getRankForCanonical(player_id);
    return {
      player_id,
      display_name: decodeByteString(r.display_name || player_id),
      nickname: nicknames[player_id] || null,
      mu: r.mu,
      sigma: r.sigma,
      mmr: r.mmr ?? Math.round((r.mu - 3 * r.sigma) * 100) + 5000,
      wins: r.wins,
      losses: r.losses,
      games_played: r.wins + r.losses,
      dota_rank_tier: rank.dota_rank_tier,
      dota_leaderboard_rank: rank.dota_leaderboard_rank,
      dota_rank_source: rank.dota_rank_source,
    };
  });

  // v5.86 — fetch persisted PERF (Positive Impact Score) per account for the
  // leaderboard's "Avg PERF" column. Same season scoping as the stats query.
  const perfRows = await p.query(
    `SELECT ps.account_id::text AS account_id,
            AVG(ps.perf)::float AS avg_perf,
            COUNT(ps.perf)::int  AS perf_games
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
      WHERE ps.account_id != 0 AND ps.perf IS NOT NULL ${statsWhere}
      GROUP BY ps.account_id`,
    statsParams
  );
  // Merge by canonical (handles nickname-merged accounts) using a weighted avg.
  const perfAgg = {};
  for (const row of perfRows.rows) {
    const cid = getCanonical(row.account_id);
    const games = parseInt(row.perf_games, 10) || 0;
    const avg   = parseFloat(row.avg_perf);
    if (!games || !Number.isFinite(avg)) continue;
    if (!perfAgg[cid]) perfAgg[cid] = { sum: 0, games: 0 };
    perfAgg[cid].sum   += avg * games;
    perfAgg[cid].games += games;
  }

  // Compute raw impact scores using per-game averages + kill involvement
  for (const player of leaderboard) {
    const s = statsAgg[player.player_id];
    if (!s || !player.games_played) { player.impact_raw = null; }
    else {
      player.impact_raw = _computeImpactRaw(
        player.games_played, player.wins,
        s.avgKills, s.avgDeaths, s.avgAssists, s.avgKi
      );
    }
    // Attach Avg PERF (rounded to 1 dp). Null when no PERF rows exist yet.
    const pa = perfAgg[player.player_id];
    if (pa && pa.games > 0) {
      player.avg_perf   = Math.round((pa.sum / pa.games) * 10) / 10;
      player.perf_games = pa.games;
    } else {
      player.avg_perf   = null;
      player.perf_games = 0;
    }
  }

  // Rank into 1–10 tiers (only among players who have a raw score)
  const withRaw = leaderboard.filter(p => p.impact_raw != null);
  const rawScores = withRaw.map(p => p.impact_raw);
  for (const player of withRaw) {
    player.impact_score = _computeImpactTier(player.impact_raw, rawScores);
  }

  leaderboard.sort((a, b) => b.mmr - a.mmr);
  return leaderboard;
}

// Lightweight wrapper — reuses getComputedLeaderboard to extract impact scores.
// Returns { [player_id]: { score: 1-10, raw: number } } — expanded for all merged account IDs.
async function getImpactScores(seasonId = null) {
  const leaderboard = await getComputedLeaderboard(seasonId);
  const map = {};
  for (const p of leaderboard) {
    if (p.impact_score != null) {
      map[String(p.player_id)] = { score: p.impact_score, raw: Math.round(p.impact_raw || 0) };
    }
  }
  // Expand to merged account IDs: if any sibling account has a score, propagate it.
  const pool = getPool();
  const nickRows = await pool.query(
    `SELECT account_id, LOWER(nickname) AS nick FROM nicknames WHERE nickname IS NOT NULL AND TRIM(nickname) <> ''`
  );
  const byNick = {};
  for (const r of nickRows.rows) {
    if (!byNick[r.nick]) byNick[r.nick] = [];
    byNick[r.nick].push(String(r.account_id));
  }
  for (const ids of Object.values(byNick)) {
    if (ids.length < 2) continue;
    const found = ids.find(id => map[id] != null);
    if (found) {
      for (const id of ids) {
        if (map[id] == null) map[id] = map[found];
      }
    }
  }
  return map;
}

async function updateRating(playerId, discordId, displayName, mu, sigma, mmr, won, matchId = null) {
  displayName = decodeByteString(displayName);
  const p = getPool();
  await p.query(
    `INSERT INTO ratings (player_id, discord_id, display_name, mu, sigma, mmr, wins, losses, games_played, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW())
     ON CONFLICT (player_id) DO UPDATE SET
       mu = $4,
       sigma = $5,
       mmr = $6,
       wins = ratings.wins + $7,
       losses = ratings.losses + $8,
       games_played = ratings.games_played + 1,
       last_updated = NOW(),
       discord_id = COALESCE(NULLIF($2, ''), ratings.discord_id),
       display_name = COALESCE(NULLIF($3, ''), ratings.display_name)`,
    [playerId, discordId || '', displayName || '', mu, sigma, mmr, won ? 1 : 0, won ? 0 : 1]
  );
  const numericPid = /^\d+$/.test(String(playerId)) ? parseInt(playerId) : null;
  if (numericPid) {
    await p.query(
      `INSERT INTO rating_history (player_id, mmr, mu, sigma, match_id) VALUES ($1, $2, $3, $4, $5)`,
      [numericPid, mmr, mu, sigma, matchId]
    );
  }
}

async function getPlayerRating(playerId) {
  const p = getPool();
  const result = await p.query(
    'SELECT * FROM ratings WHERE player_id::text = $1 OR discord_id = $1 LIMIT 1',
    [playerId]
  );
  return result.rows[0] || null;
}

async function getPlayerStats(accountId, seasonId = null) {
  const p = getPool();
  const isNumeric = /^\d+$/.test(accountId);
  const isRealAccount = isNumeric && accountId !== '0';

  const param = isRealAccount ? parseInt(accountId) : decodeURIComponent(accountId);

  const ratingResult = await p.query(
    'SELECT * FROM ratings WHERE player_id::text = $1 LIMIT 1',
    [isRealAccount ? accountId.toString() : `anon_${param}`]
  );

  let nicknameResult = { rows: [] };
  let mergedAccountIds = null;
  if (isRealAccount) {
    nicknameResult = await p.query(
      'SELECT nickname FROM nicknames WHERE account_id = $1 LIMIT 1',
      [parseInt(accountId)]
    );
    const nick = nicknameResult.rows[0]?.nickname;
    if (nick) {
      const siblingRes = await p.query(
        'SELECT account_id FROM nicknames WHERE LOWER(nickname) = LOWER($1)',
        [nick]
      );
      const ids = siblingRes.rows.map(r => parseInt(r.account_id));
      if (ids.length > 1) mergedAccountIds = ids;
    }
  }

  let whereClause, scParam;
  if (mergedAccountIds) {
    whereClause = 'ps.account_id = ANY($1::bigint[])';
    scParam = mergedAccountIds;
  } else if (isRealAccount) {
    whereClause = 'ps.account_id = $1';
    scParam = param;
  } else {
    whereClause = 'ps.persona_name = $1';
    scParam = param;
  }

  // Build season clause for queries that join matches
  const scParams = [scParam];
  const sc = _sc(seasonId, scParams, 'm');

  const recentMatches = await p.query(
    `SELECT ps.*, m.date, m.duration, m.radiant_win, m.lobby_name,
       -- 1.5: MVP-per-match — true if this player got the most MVP votes for the match
       (
         SELECT mvp_winner.rated_account_id
           FROM (
             SELECT rated_account_id, COUNT(*) AS votes
               FROM match_ratings
              WHERE match_id = ps.match_id
                AND is_mvp_vote = TRUE
                AND rated_account_id IS NOT NULL
              GROUP BY rated_account_id
              ORDER BY votes DESC, rated_account_id ASC
              LIMIT 1
           ) AS mvp_winner
       ) = ps.account_id AS is_mvp
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ${whereClause}${sc}
     ORDER BY m.date DESC
     LIMIT 20`,
    scParams
  );

  const avgParams = [scParam];
  const avSc = _sc(seasonId, avgParams, 'm');
  const averages = await p.query(
    `SELECT
       COUNT(*) as total_matches,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = false) OR (ps.team = 'dire' AND m.radiant_win = true) THEN 1 ELSE 0 END) as losses,
       ROUND(AVG(kills), 1) as avg_kills,
       ROUND(AVG(deaths), 1) as avg_deaths,
       ROUND(AVG(assists), 1) as avg_assists,
       ROUND(AVG(gpm), 0) as avg_gpm,
       ROUND(AVG(xpm), 0) as avg_xpm,
       ROUND(AVG(hero_damage), 0) as avg_hero_damage,
       ROUND(AVG(tower_damage), 0) as avg_tower_damage,
       ROUND(AVG(hero_healing), 0) as avg_hero_healing,
       ROUND(AVG(last_hits), 0) as avg_last_hits,
       ROUND(AVG(denies), 0) as avg_denies,
       ROUND(AVG(net_worth), 0) as avg_net_worth,
       ROUND(AVG(obs_placed), 2) as avg_obs_placed,
       ROUND(AVG(sen_placed), 2) as avg_sen_placed,
       ROUND(AVG(camps_stacked), 2) as avg_camps_stacked,
       ROUND(AVG(perf), 1) as avg_perf,
       MAX(perf) as best_perf,
       COUNT(perf) as perf_games,
       SUM(kills) as total_kills,
       SUM(deaths) as total_deaths,
       SUM(assists) as total_assists,
       SUM(firstblood_claimed) as total_firstbloods,
       ROUND(100.0 * SUM(firstblood_claimed) / NULLIF(COUNT(*), 0), 1) as fb_rate,
       SUM(CASE WHEN hero_name = 'npc_dota_hero_pudge' AND hook_attempts IS NOT NULL THEN hook_attempts ELSE 0 END) as total_hook_attempts,
       SUM(CASE WHEN hero_name = 'npc_dota_hero_pudge' AND hook_hits IS NOT NULL THEN hook_hits ELSE 0 END) as total_hook_hits,
       COUNT(CASE WHEN hero_name = 'npc_dota_hero_pudge' AND hook_attempts IS NOT NULL THEN 1 END) as pudge_games_with_hooks
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ${whereClause}${avSc}`,
    avgParams
  );

  const heroParams = [scParam];
  const heroSc = _sc(seasonId, heroParams, 'm');
  const heroes = await p.query(
    `SELECT hero_name, hero_id, COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       ROUND(AVG(ps.gpm), 0) as avg_gpm,
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ${whereClause} AND ps.hero_id > 0${heroSc}
     GROUP BY hero_name, hero_id
     ORDER BY games DESC`,
    heroParams
  );

  for (const row of recentMatches.rows) {
    row.persona_name = decodeByteString(row.persona_name);
  }

  if (ratingResult.rows[0]) {
    ratingResult.rows[0].display_name = decodeByteString(ratingResult.rows[0].display_name);
  }

  // Season-specific MMR: recalculate TrueSkill from scratch using only the
  // selected season's matches. This is the same calculation used by the leaderboard,
  // so the number shown on the profile always matches the leaderboard ranking.
  // Use the canonical ID (in case this account is merged with another under the same nickname).
  let seasonMmr = null;
  if (isRealAccount) {
    // v5.90 — V3 is the only production engine. Pulled the V1/V3 toggle so
    // profile MMR always matches the leaderboard unconditionally.
    const { ratings: seasonRatings, accountToCanonical } = await computeSeasonTrueSkillV3(seasonId);
    const canonicalId = accountToCanonical[accountId.toString()] || accountId.toString();
    const entry = seasonRatings[canonicalId];
    if (entry) {
      seasonMmr = entry.mmr ?? Math.round((entry.mu - 3 * entry.sigma) * 100) + 5000;
    }
  }

  // Expose canonical_id so the frontend can redirect merged secondary accounts
  // to the primary account profile (the one with the most rating history entries).
  let canonicalAccountId = null;
  if (mergedAccountIds && mergedAccountIds.length > 1) {
    const canonRes = await p.query(
      `SELECT player_id, COUNT(*) AS cnt FROM rating_history
       WHERE player_id = ANY($1::bigint[])
       GROUP BY player_id ORDER BY cnt DESC, player_id ASC LIMIT 1`,
      [mergedAccountIds]
    );
    const primary = canonRes.rows[0]?.player_id;
    if (primary && String(primary) !== String(accountId)) {
      canonicalAccountId = String(primary);
    }
  }

  return {
    rating: ratingResult.rows[0] || null,
    nickname: nicknameResult.rows[0]?.nickname || null,
    recentMatches: recentMatches.rows,
    averages: averages.rows[0] || null,
    heroes: heroes.rows,
    seasonMmr,
    canonical_id: canonicalAccountId,
  };
}

async function getNickname(accountId) {
  const p = getPool();
  const result = await p.query('SELECT nickname FROM nicknames WHERE account_id = $1', [accountId]);
  return result.rows[0]?.nickname || null;
}

async function getMergedAccountIds(accountId) {
  const p = getPool();
  const pid = parseInt(accountId);
  if (!pid) return [pid];
  const nickRes = await p.query('SELECT nickname FROM nicknames WHERE account_id = $1 LIMIT 1', [pid]);
  const nick = nickRes.rows[0]?.nickname;
  if (!nick) return [pid];
  const sibRes = await p.query('SELECT account_id FROM nicknames WHERE LOWER(nickname) = LOWER($1)', [nick]);
  const ids = sibRes.rows.map(r => parseInt(r.account_id));
  return ids.length > 1 ? ids : [pid];
}

async function setNickname(accountId, nickname) {
  const p = getPool();
  if (!nickname || nickname.trim() === '') {
    await p.query('DELETE FROM nicknames WHERE account_id = $1', [accountId]);
    return null;
  }
  await p.query(
    `INSERT INTO nicknames (account_id, nickname, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (account_id) DO UPDATE SET nickname = $2, updated_at = NOW()`,
    [accountId, nickname.trim()]
  );
  return nickname.trim();
}

async function setDiscordId(accountId, discordId) {
  const p = getPool();
  const existing = await p.query('SELECT id FROM nicknames WHERE account_id = $1', [accountId]);
  if (existing.rows.length === 0) {
    throw new Error('Player has no nickname entry — set a nickname first.');
  }
  await p.query(
    `UPDATE nicknames SET discord_id = $1, updated_at = NOW() WHERE account_id = $2`,
    [(discordId || '').trim(), accountId]
  );
  return (discordId || '').trim();
}

// Self-service variant of setDiscordId for the first-login onboarding modal
// (POST /api/me/link-discord). Unlike the superuser-only setDiscordId above,
// this UPSERTs a nicknames row when none exists yet — a brand-new Steam
// sign-in won't have a nicknames entry, but we still want to capture their
// Discord ID so the bot can DM them. Falls back to the player's persona name
// (or a placeholder) for the required `nickname` column.
async function linkOwnDiscordId(accountId, discordId) {
  const p = getPool();
  const cleaned = (discordId || '').trim();
  const existing = await p.query('SELECT id FROM nicknames WHERE account_id = $1', [accountId]);
  if (existing.rows.length > 0) {
    await p.query(
      `UPDATE nicknames SET discord_id = $1, updated_at = NOW() WHERE account_id = $2`,
      [cleaned, accountId]
    );
  } else {
    const personaRes = await p.query(
      `SELECT persona_name FROM player_stats WHERE account_id = $1
       ORDER BY id DESC LIMIT 1`,
      [accountId]
    );
    const fallbackName = (personaRes.rows[0]?.persona_name || `Player ${accountId}`).slice(0, 64);
    await p.query(
      `INSERT INTO nicknames (account_id, nickname, discord_id, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (account_id) DO UPDATE SET discord_id = EXCLUDED.discord_id, updated_at = NOW()`,
      [accountId, fallbackName, cleaned]
    );
  }
  return cleaned;
}

// Task 109 — self-service *unlink* for the player on /settings/profile.
// Clears nicknames.discord_id for the caller's account (sets to empty string
// to match the rest of the codebase's "not linked" sentinel — getDiscordId-
// ByAccountId etc. filter on `discord_id != ''`). Idempotent: rows that are
// already empty / missing return without error so the UI can rely on a clean
// 200. Returns true when a row was actually updated, false otherwise.
async function unlinkOwnDiscordId(accountId) {
  if (!accountId) return false;
  const p = getPool();
  const acc = accountId.toString();
  // Clear in BOTH tables: nicknames.discord_id (canonical, populated by the
  // first-login modal / OAuth / settings) AND players.discord_id (legacy,
  // populated by the old `!register` Discord command). getDiscordIdBy-
  // AccountId falls back to the players table when nicknames is empty, so
  // a legacy account would still appear linked after a nicknames-only clear
  // — which would leave needs_discord_link false and prevent the first-login
  // modal / Connect-with-Discord button from re-appearing.
  const r1 = await p.query(
    `UPDATE nicknames SET discord_id = '', updated_at = NOW()
     WHERE account_id = $1 AND discord_id IS NOT NULL AND discord_id <> ''`,
    [acc]
  );
  const r2 = await p.query(
    `UPDATE players SET discord_id = ''
     WHERE account_id_32 = $1 AND discord_id IS NOT NULL AND discord_id <> ''`,
    [acc]
  );
  return (r1.rowCount || 0) + (r2.rowCount || 0) > 0;
}

async function getNicknameByDiscordId(discordId) {
  if (!discordId) return null;
  const p = getPool();
  const r = await p.query(
    `SELECT nickname FROM nicknames WHERE TRIM(discord_id) = $1 AND discord_id != '' LIMIT 1`,
    [(discordId || '').toString().trim()]
  );
  return r.rows[0]?.nickname || null;
}

async function getDiscordIdByAccountId(accountId32) {
  if (!accountId32) return null;
  const p = getPool();
  const r = await p.query(
    `SELECT discord_id FROM nicknames WHERE account_id = $1 AND discord_id IS NOT NULL AND discord_id != '' LIMIT 1`,
    [accountId32.toString()]
  );
  if (r.rows[0]?.discord_id) return r.rows[0].discord_id;
  // Fallback: players table
  const r2 = await p.query(
    `SELECT discord_id FROM players WHERE account_id_32 = $1 AND discord_id IS NOT NULL AND discord_id != '' LIMIT 1`,
    [accountId32.toString()]
  );
  return r2.rows[0]?.discord_id || null;
}

// Task #128 — record a failed `addUserToLeagueGuild` outcome so the next-
// visit site banner can prompt the player to click *Reconnect with Discord*
// and retry the join. UPSERT by discord_id: one pending row per Discord
// user, attempts++ on every repeat failure so admins can see who's stuck.
async function recordDiscordAutoJoinFailure(discordId, accountId, code, errorText) {
  if (!discordId || !accountId) return;
  const p = getPool();
  await p.query(
    `INSERT INTO discord_autojoin_failures
       (discord_id, account_id, last_code, last_error, attempts, first_failed_at, last_failed_at)
     VALUES ($1, $2, $3, $4, 1, NOW(), NOW())
     ON CONFLICT (discord_id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       last_code = EXCLUDED.last_code,
       last_error = EXCLUDED.last_error,
       attempts = discord_autojoin_failures.attempts + 1,
       last_failed_at = NOW()`,
    [
      String(discordId),
      String(accountId),
      code ? String(code).slice(0, 64) : null,
      errorText ? String(errorText).slice(0, 500) : null,
    ]
  );
}

// Task #128 — clear the pending row(s) once the player has successfully
// joined the guild (or was already in it). Called from the OAuth callback
// after a successful `addUserToLeagueGuild`. Deletes by BOTH discord_id
// and account_id so a player who re-linked to a new Discord account
// doesn't leave a stale row from their old Discord ID still triggering
// the banner for their account. Idempotent: no-op when no row exists.
async function clearDiscordAutoJoinFailure(discordId, accountId) {
  if (!discordId && !accountId) return false;
  const p = getPool();
  const r = await p.query(
    `DELETE FROM discord_autojoin_failures
      WHERE ($1::TEXT IS NOT NULL AND discord_id = $1)
         OR ($2::TEXT IS NOT NULL AND account_id = $2)`,
    [discordId ? String(discordId) : null, accountId ? String(accountId) : null]
  );
  return (r.rowCount || 0) > 0;
}

// Task #128 — return the pending failure row (if any) for an account, used
// to populate `discord_autojoin_pending` on the `/api/auth/me` payload that
// drives the site-wide DiscordRetryBanner (the standalone banner endpoint
// was removed in Task #139). Looks up by account_id (not discord_id) so the
// lookup works directly off the session without an extra nicknames join.
async function getDiscordAutoJoinFailureForAccount(accountId) {
  if (!accountId) return null;
  const p = getPool();
  const r = await p.query(
    `SELECT discord_id, account_id, last_code, last_error, attempts,
            first_failed_at, last_failed_at
       FROM discord_autojoin_failures
      WHERE account_id = $1
      ORDER BY last_failed_at DESC
      LIMIT 1`,
    [String(accountId)]
  );
  return r.rows[0] || null;
}

// Task #138 — list every pending Discord auto-join failure row joined with
// the player's current nickname so the admin panel can render a "who's
// stuck" table without operators having to query the DB by hand. Newest
// failure first, capped at 200 so a runaway bot outage can't blow up the
// response. LEFT JOIN nicknames on account_id (BIGINT) — the discord_id
// stored on the failure row may have rotated since (re-link), so the
// account_id is the stable join key.
async function listAllDiscordAutoJoinFailures(limit = 200) {
  const p = getPool();
  const cap = Math.max(1, Math.min(1000, Number(limit) || 200));
  const r = await p.query(
    `SELECT f.discord_id, f.account_id, f.last_code, f.last_error,
            f.attempts, f.first_failed_at, f.last_failed_at,
            n.nickname
       FROM discord_autojoin_failures f
       LEFT JOIN nicknames n ON n.account_id = f.account_id::BIGINT
      ORDER BY f.last_failed_at DESC
      LIMIT $1`,
    [cap]
  );
  return r.rows.map(row => ({
    discord_id: row.discord_id || '',
    account_id: row.account_id || '',
    nickname: row.nickname || null,
    last_code: row.last_code || null,
    last_error: row.last_error || null,
    attempts: Number(row.attempts) || 0,
    first_failed_at: row.first_failed_at,
    last_failed_at: row.last_failed_at,
  }));
}

// Task #135 — append a single auto-join outcome (success or failure) to the
// persistent audit log. Best-effort: callers in the Discord bot fire-and-
// forget so a transient DB blip can never break the OAuth sign-up flow.
async function appendDiscordAutoJoinLog(entry) {
  if (!entry) return;
  const p = getPool();
  await p.query(
    `INSERT INTO discord_autojoin_log (ts, ok, code, discord_id, error)
     VALUES (to_timestamp($1::double precision / 1000.0), $2, $3, $4, $5)`,
    [
      Number(entry.ts) || Date.now(),
      Boolean(entry.ok),
      entry.code ? String(entry.code).slice(0, 64) : 'unknown',
      entry.discordId ? String(entry.discordId).slice(0, 64) : null,
      entry.error ? String(entry.error).slice(0, 500) : null,
    ]
  );
}

// Task #135 — return the recent auto-join log entries, newest first, capped
// at `limit`. Used to compute the 24h rollup and surface the last-failure
// record on the admin Site Settings panel after a bot restart.
async function getRecentDiscordAutoJoinLog(limit = 500) {
  const p = getPool();
  const cap = Math.max(1, Math.min(2000, Number(limit) || 500));
  const r = await p.query(
    `SELECT EXTRACT(EPOCH FROM ts) * 1000 AS ts_ms, ok, code, discord_id, error
       FROM discord_autojoin_log
       ORDER BY ts DESC
       LIMIT $1`,
    [cap]
  );
  return r.rows.map(row => ({
    ts: Number(row.ts_ms) || 0,
    ok: Boolean(row.ok),
    code: row.code || 'unknown',
    discordId: row.discord_id || '',
    error: row.error || null,
  }));
}

// Task #142 — per-day success/failure buckets over the last `days` days,
// for the admin auto-join health sparkline. Buckets are computed in the
// database's local time zone (UTC in prod) so day boundaries are stable.
// Days with no events are returned as zero rows so the frontend can render
// a contiguous sparkline without having to backfill missing days itself.
async function getDiscordAutoJoinDailyBuckets(days = 7) {
  const p = getPool();
  const d = Math.max(1, Math.min(30, Number(days) || 7));
  const r = await p.query(
    `WITH days AS (
       SELECT generate_series(
         date_trunc('day', NOW()) - (($1::int - 1) || ' days')::interval,
         date_trunc('day', NOW()),
         '1 day'
       ) AS day
     )
     SELECT EXTRACT(EPOCH FROM days.day) * 1000 AS day_ms,
            COALESCE(SUM(CASE WHEN l.ok THEN 1 ELSE 0 END), 0)::int AS success,
            COALESCE(SUM(CASE WHEN NOT l.ok THEN 1 ELSE 0 END), 0)::int AS failure
       FROM days
       LEFT JOIN discord_autojoin_log l
         ON date_trunc('day', l.ts) = days.day
      GROUP BY days.day
      ORDER BY days.day ASC`,
    [d]
  );
  return r.rows.map(row => ({
    day: Number(row.day_ms) || 0,
    success: Number(row.success) || 0,
    failure: Number(row.failure) || 0,
  }));
}

// Task #142 — paginated slice of failure rows over the last `days` days,
// newest first. Returns `{ total, failures }` so the admin panel can render
// "showing 1–20 of 47" and offer prev/next pagination. Read-only.
async function getDiscordAutoJoinFailuresPage({ days = 7, limit = 20, offset = 0 } = {}) {
  const p = getPool();
  const d = Math.max(1, Math.min(30, Number(days) || 7));
  const cap = Math.max(1, Math.min(200, Number(limit) || 20));
  const off = Math.max(0, Number(offset) || 0);
  // Use the same calendar-day window as getDiscordAutoJoinDailyBuckets so the
  // earliest listed failure can never fall outside the earliest sparkline
  // bucket — operators would otherwise be confused by a failure timestamped
  // on a day that no longer appears in the chart.
  const totalRes = await p.query(
    `SELECT COUNT(*)::int AS n
       FROM discord_autojoin_log
      WHERE NOT ok
        AND ts >= date_trunc('day', NOW()) - (($1::int - 1) || ' days')::interval`,
    [d]
  );
  // Task #144 — LEFT JOIN nicknames on discord_id so admins see *who* each
  // failure belongs to without having to copy the raw ID into another panel.
  // The unique partial index on TRIM(discord_id) (created in initSchema) keeps
  // this join 1:1 for linked players; unlinked failures simply return NULL
  // nickname/account_id and the frontend falls back to the raw ID.
  const r = await p.query(
    `SELECT EXTRACT(EPOCH FROM l.ts) * 1000 AS ts_ms,
            l.code, l.discord_id, l.error,
            n.nickname, n.account_id
       FROM discord_autojoin_log l
       LEFT JOIN nicknames n
         ON l.discord_id IS NOT NULL
        AND TRIM(l.discord_id) <> ''
        AND TRIM(n.discord_id) = TRIM(l.discord_id)
      WHERE NOT l.ok
        AND l.ts >= date_trunc('day', NOW()) - (($1::int - 1) || ' days')::interval
      ORDER BY l.ts DESC
      LIMIT $2 OFFSET $3`,
    [d, cap, off]
  );
  return {
    total: totalRes.rows[0]?.n || 0,
    failures: r.rows.map(row => ({
      ts: Number(row.ts_ms) || 0,
      code: row.code || 'unknown',
      discordId: row.discord_id || '',
      error: row.error || null,
      nickname: row.nickname || null,
      accountId: row.account_id != null ? String(row.account_id) : null,
    })),
  };
}

// Task #135 — drop log entries older than `days` (default 7) so the table
// never grows unbounded. Cheap to run on every insert because the index on
// ts DESC keeps the delete bounded; the bot caller throttles invocation
// to once per hour anyway.
async function pruneDiscordAutoJoinLog(days = 7) {
  const p = getPool();
  const d = Math.max(1, Math.min(365, Number(days) || 7));
  const r = await p.query(
    `DELETE FROM discord_autojoin_log WHERE ts < NOW() - ($1 || ' days')::interval`,
    [String(d)]
  );
  return r.rowCount || 0;
}

// Task #143 — drop pending auto-join failure rows older than `days` (default
// 30) where there's been no fresh failure since then. Players who never
// return after the original OAuth failure would otherwise sit in the queue
// forever, slowly polluting the admin panel and making it harder to spot
// fresh failures after a real outage. Mirrors `pruneDiscordAutoJoinLog`'s
// shape — bounded by the existing `idx_discord_autojoin_failures_account`
// index isn't useful here (we filter on last_failed_at), but the table is
// small and the bot caller throttles invocation to once per hour anyway.
//
// Also stamps `discord_autojoin_failures_last_prune` in `site_settings`
// (JSON `{ ts, days, removed }`) on every run — including no-op runs — so
// the admin panel can surface the threshold and last-prune time and
// operators can confirm the queue is auto-maintained even when nothing
// has been removed recently.
async function pruneDiscordAutoJoinFailures(days = 30) {
  const p = getPool();
  const d = Math.max(1, Math.min(365, Number(days) || 30));
  const r = await p.query(
    `DELETE FROM discord_autojoin_failures
      WHERE last_failed_at < NOW() - ($1 || ' days')::interval`,
    [String(d)]
  );
  const removed = r.rowCount || 0;
  try {
    await p.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ('discord_autojoin_failures_last_prune', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify({ ts: Date.now(), days: d, removed })]
    );
  } catch (err) {
    console.warn('[DB] pruneDiscordAutoJoinFailures: failed to record last-prune ts:', err.message);
  }
  return removed;
}

// Task #143 — read back the last-prune marker stamped by
// `pruneDiscordAutoJoinFailures` so the admin panel can render
// "auto-pruned every hour, threshold N days, last run X ago". Returns
// `null` when the row is missing (fresh DB / never pruned). Read-only.
async function getDiscordAutoJoinFailuresPruneInfo() {
  const p = getPool();
  try {
    const r = await p.query(
      `SELECT value, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_ms
         FROM site_settings
        WHERE key = 'discord_autojoin_failures_last_prune'
        LIMIT 1`
    );
    if (!r.rows[0]) return null;
    let parsed = {};
    try { parsed = JSON.parse(r.rows[0].value || '{}'); } catch { /* ignore */ }
    return {
      ts: Number(parsed.ts) || Number(r.rows[0].updated_ms) || 0,
      days: Number(parsed.days) || 0,
      removed: Number(parsed.removed) || 0,
    };
  } catch (err) {
    console.warn('[DB] getDiscordAutoJoinFailuresPruneInfo failed:', err.message);
    return null;
  }
}

// Task 103 — return every account_id currently bound to the given Discord ID.
// Used by POST/PUT /api/me/link-discord and the OAuth callback to refuse a
// link when the same Discord ID is already on a *different* player's account.
// Includes both the nicknames table (canonical) and the legacy players table
// (populated by !register) so an old !register-only link still blocks a
// hijack attempt via the modal/OAuth.
async function findAccountIdsByDiscordId(discordId) {
  if (!discordId) return [];
  const p = getPool();
  const id = (discordId || '').toString().trim();
  if (!id) return [];
  const out = new Set();
  const r = await p.query(
    `SELECT account_id FROM nicknames
     WHERE TRIM(discord_id) = $1 AND discord_id != '' AND account_id IS NOT NULL`,
    [id]
  );
  for (const row of r.rows) {
    if (row.account_id != null) out.add(String(row.account_id));
  }
  const r2 = await p.query(
    `SELECT account_id_32 AS account_id FROM players
     WHERE TRIM(discord_id) = $1 AND account_id_32 IS NOT NULL AND account_id_32 != ''`,
    [id]
  );
  for (const row of r2.rows) {
    if (row.account_id) out.add(String(row.account_id));
  }
  return Array.from(out);
}

// Task 114 — list every Discord ID currently bound to more than one
// account_id, including per-candidate metadata (nickname, last-seen match
// timestamp, current MMR) so admins can pick the canonical owner from a
// one-click UI. Pulls candidates from BOTH the canonical nicknames table and
// the legacy players table (populated by the old `!register` flow), since
// either can keep the unique partial index from being created.
async function getDiscordIdCollisions() {
  const p = getPool();
  // Build the union of (discord_id, account_id) pairs from both sources,
  // then group by trimmed discord_id and only keep groups with > 1 distinct
  // account_id. We then enrich each candidate with nickname, last-seen
  // match timestamp and current MMR.
  const groupsRes = await p.query(`
    WITH pairs AS (
      SELECT TRIM(discord_id) AS discord_id, account_id::text AS account_id, 'nicknames' AS source
        FROM nicknames
       WHERE discord_id IS NOT NULL AND TRIM(discord_id) <> '' AND account_id IS NOT NULL
      UNION
      SELECT TRIM(discord_id) AS discord_id, account_id_32::text AS account_id, 'players' AS source
        FROM players
       WHERE discord_id IS NOT NULL AND TRIM(discord_id) <> ''
         AND account_id_32 IS NOT NULL AND account_id_32 <> ''
    ),
    grouped AS (
      SELECT discord_id, ARRAY_AGG(DISTINCT account_id ORDER BY account_id) AS account_ids
        FROM pairs
       GROUP BY discord_id
       HAVING COUNT(DISTINCT account_id) > 1
    )
    SELECT discord_id, account_ids FROM grouped ORDER BY discord_id
  `);
  if (groupsRes.rows.length === 0) return [];

  // Flatten all account ids we need metadata for.
  const allIds = new Set();
  for (const row of groupsRes.rows) {
    for (const id of row.account_ids) allIds.add(id);
  }
  const idsArr = Array.from(allIds);

  // Fetch nickname rows (canonical display name + the discord_id currently
  // stored on that account, which may differ from the colliding key when
  // the legacy players table is the source of the collision).
  const nickRes = await p.query(
    `SELECT account_id::text AS account_id, nickname, TRIM(discord_id) AS discord_id
       FROM nicknames
      WHERE account_id::text = ANY($1::text[])`,
    [idsArr]
  );
  const nickByAcc = new Map();
  for (const r of nickRes.rows) nickByAcc.set(r.account_id, r);

  // Last-seen match: take the single most-recent player_stats row per
  // account, ordered by matches.start_time (NULLs last) and tie-broken by
  // ps.match_id. DISTINCT ON guarantees match_id and start_time come from
  // the same row — using MAX() independently could pair an id and a
  // timestamp from different matches.
  const lastMatchRes = await p.query(
    `SELECT DISTINCT ON (ps.account_id)
            ps.account_id::text AS account_id,
            ps.match_id::text   AS last_match_id,
            m.start_time        AS last_match_at
       FROM player_stats ps
       LEFT JOIN matches m ON m.match_id = ps.match_id
      WHERE ps.account_id::text = ANY($1::text[])
      ORDER BY ps.account_id, m.start_time DESC NULLS LAST, ps.match_id DESC`,
    [idsArr]
  );
  const lastByAcc = new Map();
  for (const r of lastMatchRes.rows) lastByAcc.set(r.account_id, r);

  // Current rating (mu/sigma based MMR) and game count.
  const ratingRes = await p.query(
    `SELECT player_id::text AS account_id, mmr, games_played
       FROM ratings
      WHERE player_id::text = ANY($1::text[])`,
    [idsArr]
  );
  const ratingByAcc = new Map();
  for (const r of ratingRes.rows) ratingByAcc.set(r.account_id, r);

  return groupsRes.rows.map(row => ({
    discord_id: row.discord_id,
    candidates: row.account_ids.map(accId => {
      const nick = nickByAcc.get(accId) || {};
      const last = lastByAcc.get(accId) || {};
      const rating = ratingByAcc.get(accId) || {};
      return {
        account_id: accId,
        nickname: nick.nickname || null,
        // True when this account currently has the colliding discord_id
        // stored on its nicknames row (vs only on the legacy players row).
        in_nicknames: nick.discord_id === row.discord_id,
        last_match_id: last.last_match_id || null,
        last_match_at: last.last_match_at || null,
        mmr: rating.mmr != null ? Number(rating.mmr) : null,
        games_played: rating.games_played != null ? Number(rating.games_played) : 0,
      };
    }),
  }));
}

// Task 114 — clear nicknames.discord_id (and players.discord_id) on every
// account currently bound to `discordId` EXCEPT `keepAccountId`. Idempotent:
// returns the list of account_ids that were actually cleared. Run as a
// transaction so a half-applied collision can never leave the index in a
// broken state.
async function resolveDiscordIdCollision(discordId, keepAccountId) {
  const id = (discordId || '').toString().trim();
  if (!id) throw new Error('discord_id required');
  const keep = (keepAccountId || '').toString().trim();
  if (!keep) throw new Error('keep_account_id required');

  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    // Confirm the keeper is actually one of the colliding accounts. Look in
    // both tables (legacy + canonical) so the check matches the listing.
    const ownerCheck = await client.query(
      `SELECT 1 WHERE EXISTS (
         SELECT 1 FROM nicknames WHERE TRIM(discord_id) = $1 AND account_id::text = $2
       ) OR EXISTS (
         SELECT 1 FROM players WHERE TRIM(discord_id) = $1 AND account_id_32::text = $2
       )`,
      [id, keep]
    );
    if (ownerCheck.rowCount === 0) {
      throw new Error('keep_account_id is not bound to this discord_id');
    }

    // Make sure the keeper actually has the discord_id on its canonical
    // nicknames row — the rest of the codebase reads from nicknames first
    // and only falls back to players. Without this, "keep" a legacy-only
    // candidate would silently leave the discord_id missing from nicknames.
    const nickRow = await client.query(
      `SELECT id, TRIM(discord_id) AS discord_id FROM nicknames WHERE account_id::text = $1`,
      [keep]
    );
    if (nickRow.rowCount === 0) {
      // Pull a fallback display name from player_stats (mirrors linkOwn
      // DiscordId's behaviour) so we can satisfy the NOT NULL nickname.
      const personaRes = await client.query(
        `SELECT persona_name FROM player_stats WHERE account_id::text = $1
          ORDER BY id DESC LIMIT 1`,
        [keep]
      );
      const fallbackName = (personaRes.rows[0]?.persona_name || `Player ${keep}`).slice(0, 64);
      await client.query(
        `INSERT INTO nicknames (account_id, nickname, discord_id, updated_at)
              VALUES ($1, $2, $3, NOW())`,
        [keep, fallbackName, id]
      );
    } else if (nickRow.rows[0].discord_id !== id) {
      await client.query(
        `UPDATE nicknames SET discord_id = $1, updated_at = NOW() WHERE id = $2`,
        [id, nickRow.rows[0].id]
      );
    }

    // Clear the loser rows in BOTH tables (the unique index only spans
    // nicknames, but a stale legacy players row would hijack the link
    // again on the next login via the players-table fallback in
    // getDiscordIdByAccountId).
    const r1 = await client.query(
      `UPDATE nicknames
          SET discord_id = '', updated_at = NOW()
        WHERE TRIM(discord_id) = $1
          AND account_id::text <> $2
        RETURNING account_id::text AS account_id`,
      [id, keep]
    );
    const r2 = await client.query(
      `UPDATE players
          SET discord_id = ''
        WHERE TRIM(discord_id) = $1
          AND account_id_32::text <> $2
        RETURNING account_id_32::text AS account_id`,
      [id, keep]
    );

    await client.query('COMMIT');

    const cleared = new Set();
    for (const row of r1.rows) cleared.add(row.account_id);
    for (const row of r2.rows) cleared.add(row.account_id);
    return { kept: keep, cleared: Array.from(cleared) };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

// Task 114 — pure read: returns whether the partial unique index already
// exists, without ever attempting to create it. Used by the GET listing
// route so a list call has no side effects.
async function getDiscordIdUniqueIndexStatus() {
  const p = getPool();
  const res = await p.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nicknames_discord_id_unique'`
  );
  return { exists: res.rowCount > 0 };
}

// Task 114 — try to (re)create the partial unique index on
// nicknames.discord_id. Returns { exists, created, error? } so the admin UI
// can show "✓ unique constraint enforced" once all collisions are cleared.
// Safe to call repeatedly — IF NOT EXISTS makes it a no-op when the index
// is already there.
async function tryEnforceDiscordIdUniqueIndex() {
  const p = getPool();
  const beforeRes = await p.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nicknames_discord_id_unique'`
  );
  const existedBefore = beforeRes.rowCount > 0;
  try {
    await p.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nicknames_discord_id_unique
        ON nicknames(TRIM(discord_id))
        WHERE discord_id IS NOT NULL AND TRIM(discord_id) <> ''
    `);
  } catch (err) {
    return { exists: existedBefore, created: false, error: err.message };
  }
  const afterRes = await p.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_nicknames_discord_id_unique'`
  );
  return { exists: afterRes.rowCount > 0, created: !existedBefore && afterRes.rowCount > 0 };
}

async function getSteamByDiscordId(discordId) {
  if (!discordId) return null;
  const p = getPool();
  const id = (discordId || '').toString().trim();
  // Check nicknames table first (preferred — includes nickname)
  const r = await p.query(
    `SELECT account_id, nickname FROM nicknames
     WHERE TRIM(discord_id) = $1 AND discord_id != '' AND account_id IS NOT NULL LIMIT 1`,
    [id]
  );
  if (r.rows[0]) return r.rows[0];
  // Fallback: check players table (populated by !register)
  const r2 = await p.query(
    `SELECT p.account_id_32::bigint AS account_id, n.nickname
     FROM players p
     LEFT JOIN nicknames n ON n.account_id::text = p.account_id_32
     WHERE TRIM(p.discord_id) = $1 AND p.account_id_32 IS NOT NULL LIMIT 1`,
    [id]
  );
  return r2.rows[0] || null;
}

async function getAllNicknames() {
  const p = getPool();
  const result = await p.query('SELECT * FROM nicknames ORDER BY updated_at DESC');
  return result.rows;
}

async function scheduleGame(scheduledAt, note, createdBy) {
  const p = getPool();
  const result = await p.query(
    `INSERT INTO scheduled_games (scheduled_at, note, created_by) VALUES ($1, $2, $3) RETURNING *`,
    [scheduledAt, note || '', createdBy || '']
  );
  return result.rows[0];
}

async function getUpcomingGames() {
  const p = getPool();
  const result = await p.query(
    `SELECT * FROM scheduled_games WHERE is_cancelled = FALSE AND scheduled_at >= NOW() - INTERVAL '2 hours' ORDER BY scheduled_at ASC`
  );
  return result.rows;
}

async function cancelGame(id) {
  const p = getPool();
  const result = await p.query(
    `UPDATE scheduled_games SET is_cancelled = TRUE WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function saveMatchRating(matchId, raterAccountId, ratedAccountId, attitudeScore, isMvpVote) {
  const p = getPool();
  await p.query(
    `INSERT INTO match_ratings (match_id, rater_account_id, rated_account_id, attitude_score, is_mvp_vote)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (match_id, rater_account_id, rated_account_id)
     DO UPDATE SET attitude_score = $4, is_mvp_vote = $5`,
    [matchId, raterAccountId, ratedAccountId, attitudeScore || null, isMvpVote || false]
  );

  // Wave 2 F3 — best-effort MVP XP grant on every MVP vote save. Idempotent
  // (UNIQUE on account_id+season+match+source). If MVP later flips to a
  // different player they also get XP — that's intentionally generous.
  if (isMvpVote) {
    try {
      const mr = await p.query(`SELECT season_id FROM matches WHERE match_id = $1`, [matchId]);
      const sid = mr.rows[0]?.season_id;
      if (sid) await grantSeasonPassXpForMatchMvp(matchId, sid);
    } catch (e) {
      console.warn(`[SeasonPass] MVP grant failed for match ${matchId}: ${e.message}`);
    }
  }
}

async function getMatchRaterIds(matchId) {
  const p = getPool();
  const result = await p.query(
    `SELECT DISTINCT rater_account_id FROM match_ratings WHERE match_id = $1`,
    [matchId]
  );
  return new Set(result.rows.map(r => String(r.rater_account_id)));
}

async function logMatchDMSent(matchId, accountId) {
  const p = getPool();
  await p.query(
    `INSERT INTO match_dm_log (match_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [matchId, accountId]
  );
}

async function getMatchDMLog(matchId) {
  const p = getPool();
  const result = await p.query(
    `SELECT account_id FROM match_dm_log WHERE match_id = $1`,
    [matchId]
  );
  return new Set(result.rows.map(r => String(r.account_id)));
}

async function getMatchRatings(matchId) {
  const p = getPool();
  const result = await p.query(
    `SELECT mr.*, n.nickname, n.discord_id FROM match_ratings mr
     LEFT JOIN nicknames n ON n.account_id = mr.rated_account_id
     WHERE mr.match_id = $1`,
    [matchId]
  );
  return result.rows;
}

async function getPlayerRatingsReceived(accountIds) {
  const p = getPool();
  const ids = (Array.isArray(accountIds) ? accountIds : [accountIds]).map(Number).filter(Boolean);
  if (!ids.length) return { mvp_wins: 0, avg_attitude: null, attitude_ratings: 0 };
  const result = await p.query(
    `WITH vote_counts AS (
       SELECT match_id, rated_account_id, COUNT(*) AS votes
       FROM match_ratings WHERE is_mvp_vote = TRUE
         AND rated_account_id = ANY($1::bigint[])
       GROUP BY match_id, rated_account_id
     ),
     match_winners AS (
       SELECT match_id, rated_account_id,
              RANK() OVER (PARTITION BY match_id ORDER BY votes DESC) AS rnk
       FROM vote_counts
     )
     SELECT
       (SELECT COUNT(*) FROM match_winners WHERE rated_account_id = ANY($1::bigint[]) AND rnk = 1) AS mvp_wins,
       ROUND(AVG(attitude_score) FILTER (WHERE attitude_score IS NOT NULL), 1) AS avg_attitude,
       COUNT(*) FILTER (WHERE attitude_score IS NOT NULL) AS attitude_ratings
     FROM match_ratings
     WHERE rated_account_id = ANY($1::bigint[])`,
    [ids]
  );
  return result.rows[0];
}

async function getBestAndFairest(seasonId = null, minRatings = 3) {
  const p = getPool();
  const params = [minRatings];
  const seasonFilter = seasonId
    ? `AND mr.match_id IN (SELECT ps.match_id FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id WHERE m.season_id = $${params.push(seasonId) && params.length})`
    : '';
  const result = await p.query(
    `SELECT
       mr.rated_account_id AS account_id,
       COALESCE(n.nickname, MAX(r.display_name)) AS display_name,
       ROUND(AVG(mr.attitude_score), 2) AS avg_attitude,
       COUNT(*) AS total_ratings
     FROM match_ratings mr
     LEFT JOIN nicknames n ON n.account_id::text = mr.rated_account_id::text
     LEFT JOIN ratings r ON r.player_id::text = mr.rated_account_id::text
     WHERE mr.attitude_score IS NOT NULL ${seasonFilter}
     GROUP BY mr.rated_account_id, n.nickname
     HAVING COUNT(*) >= $1
     ORDER BY avg_attitude DESC, total_ratings DESC
     LIMIT 10`,
    params
  );
  return result.rows;
}

async function getDiscordIdsForMatch(matchId) {
  const p = getPool();
  const result = await p.query(
    `SELECT ps.account_id, ps.persona_name, ps.team, ps.hero_name,
            COALESCE(n.nickname, ps.persona_name) as display_name,
            COALESCE(
              NULLIF(TRIM(n.discord_id), ''),
              NULLIF(TRIM(r.discord_id), ''),
              -- Fall back to any account sharing the same nickname (merged accounts)
              (SELECT NULLIF(TRIM(n2.discord_id), '')
               FROM nicknames n2
               WHERE n2.nickname = n.nickname
                 AND TRIM(COALESCE(n2.discord_id, '')) != ''
               LIMIT 1),
              -- Fall back to players table by account_id
              (SELECT NULLIF(TRIM(pl.discord_id), '')
               FROM players pl
               WHERE pl.account_id_32::bigint = ps.account_id
               LIMIT 1),
              ''
            ) as discord_id
     FROM player_stats ps
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     LEFT JOIN ratings r ON r.player_id::text = ps.account_id::text AND ps.account_id != 0
     WHERE ps.match_id = $1 AND ps.account_id != 0`,
    [matchId]
  );
  return result.rows;
}

async function getTopDuos(seasonId = null, minGames = 3) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const minParam = params.length + 1;
  params.push(minGames);
  const result = await p.query(
    `SELECT
       LEAST(ps1.account_id, ps2.account_id) as p1_id,
       GREATEST(ps1.account_id, ps2.account_id) as p2_id,
       COALESCE(MAX(n1.nickname), MAX(ps1.persona_name)) as p1_name,
       COALESCE(MAX(n2.nickname), MAX(ps2.persona_name)) as p2_name,
       COUNT(*) as games,
       SUM(CASE WHEN (ps1.team = 'radiant' AND m.radiant_win = true) OR (ps1.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins
     FROM player_stats ps1
     JOIN player_stats ps2
       ON ps2.match_id = ps1.match_id
       AND ps2.team = ps1.team
       AND ps2.account_id > ps1.account_id
       AND ps1.account_id != 0
       AND ps2.account_id != 0
     LEFT JOIN nicknames n1 ON n1.account_id = ps1.account_id
     LEFT JOIN nicknames n2 ON n2.account_id = ps2.account_id
     JOIN matches m ON m.match_id = ps1.match_id
     WHERE 1=1${sc}
     GROUP BY LEAST(ps1.account_id, ps2.account_id), GREATEST(ps1.account_id, ps2.account_id)
     HAVING COUNT(*) >= $${minParam}
     ORDER BY (SUM(CASE WHEN (ps1.team = 'radiant' AND m.radiant_win = true) OR (ps1.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END)::float / COUNT(*)) DESC, COUNT(*) DESC
     LIMIT 50`,
    params
  );
  return result.rows;
}

async function getPlayerConnections(accountId, seasonId = null) {
  const p = getPool();
  const pid = parseInt(accountId);
  const tParams = [pid];
  const tSc = _sc(seasonId, tParams, 'm');
  const oParams = [pid];
  const oSc = _sc(seasonId, oParams, 'm');

  const [teammatesRes, opponentsRes] = await Promise.all([
    p.query(
      `SELECT
         ps2.account_id as partner_id,
         COALESCE(MAX(n.nickname), MAX(ps2.persona_name)) as partner_name,
         COUNT(*) as games,
         SUM(CASE WHEN (ps1.team = 'radiant' AND m.radiant_win = true) OR (ps1.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins
       FROM player_stats ps1
       JOIN player_stats ps2 ON ps2.match_id = ps1.match_id AND ps2.team = ps1.team AND ps2.account_id != ps1.account_id AND ps2.account_id != 0
       LEFT JOIN nicknames n ON n.account_id = ps2.account_id
       JOIN matches m ON m.match_id = ps1.match_id
       WHERE ps1.account_id = $1${tSc}
       GROUP BY ps2.account_id
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      tParams
    ),
    p.query(
      `SELECT
         ps2.account_id as opp_id,
         COALESCE(MAX(n.nickname), MAX(ps2.persona_name)) as opp_name,
         COUNT(*) as games,
         SUM(CASE WHEN (ps1.team = 'radiant' AND m.radiant_win = true) OR (ps1.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins
       FROM player_stats ps1
       JOIN player_stats ps2 ON ps2.match_id = ps1.match_id AND ps2.team != ps1.team AND ps2.account_id != 0
       LEFT JOIN nicknames n ON n.account_id = ps2.account_id
       JOIN matches m ON m.match_id = ps1.match_id
       WHERE ps1.account_id = $1${oSc}
       GROUP BY ps2.account_id
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      oParams
    ),
  ]);

  return {
    teammates: teammatesRes.rows,
    opponents: opponentsRes.rows,
  };
}

async function getPlayerFormBatch(seasonId = null) {
  const p = getPool();

  const nickRes = await p.query('SELECT account_id, nickname FROM nicknames');
  const nicknameToIds = {};
  for (const row of nickRes.rows) {
    const aid = row.account_id.toString();
    const nick = row.nickname.toLowerCase();
    if (!nicknameToIds[nick]) nicknameToIds[nick] = [];
    nicknameToIds[nick].push(aid);
  }
  const accountToCanonical = {};
  for (const ids of Object.values(nicknameToIds)) {
    if (ids.length < 2) continue;
    ids.sort();
    const canonical = ids[0];
    for (const id of ids) accountToCanonical[id] = canonical;
  }
  const getCanonical = (id) => accountToCanonical[id] || id;

  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_id,
       m.match_id,
       CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 'W' ELSE 'L' END as result
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE 1=1${sc}
     ORDER BY m.match_id DESC`,
    params
  );

  const form = {};
  for (const row of result.rows) {
    const rawId = row.player_id;
    const cid = /^\d+$/.test(rawId) ? getCanonical(rawId) : rawId;
    if (!form[cid]) form[cid] = [];
    if (form[cid].length < 10) form[cid].push(row.result);
  }
  return form;
}

async function getPositionAverages(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       ps.position,
       COUNT(*) as games,
       ROUND(AVG(ps.kills), 2) as avg_kills,
       ROUND(AVG(ps.deaths), 2) as avg_deaths,
       ROUND(AVG(ps.assists), 2) as avg_assists,
       ROUND(AVG(ps.gpm), 0) as avg_gpm,
       ROUND(AVG(ps.xpm), 0) as avg_xpm,
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage,
       ROUND(AVG(ps.last_hits), 0) as avg_last_hits,
       ROUND(AVG(ps.hero_healing), 0) as avg_hero_healing,
       ROUND(AVG(ps.tower_damage), 0) as avg_tower_damage
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.position > 0${sc}
     GROUP BY ps.position
     ORDER BY ps.position`,
    params
  );
  return result.rows;
}

async function getHeroMatchups(heroId, seasonId = null) {
  const p = getPool();
  const params = [parseInt(heroId)];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       ps2.hero_id as opp_hero_id,
       ps2.hero_name as opp_hero_name,
       COUNT(*) as matchups,
       SUM(CASE WHEN (ps1.team = 'radiant' AND m.radiant_win = true) OR (ps1.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins
     FROM player_stats ps1
     JOIN player_stats ps2 ON ps2.match_id = ps1.match_id AND ps2.team != ps1.team AND ps2.hero_id > 0
     JOIN matches m ON m.match_id = ps1.match_id
     WHERE ps1.hero_id = $1${sc}
     GROUP BY ps2.hero_id, ps2.hero_name
     HAVING COUNT(*) >= 1
     ORDER BY matchups DESC, wins DESC`,
    params
  );
  return result.rows;
}

async function getAllPlayers(seasonId = null) {
  const p = getPool();
  const params1 = [];
  const sc = _sc(seasonId, params1, 'm');
  const result = await p.query(
    `SELECT
       COALESCE(MAX(NULLIF(ps.account_id, 0)), 0) as account_id,
       COALESCE(
         MAX(n.nickname),
         CASE WHEN MAX(NULLIF(ps.account_id, 0)) IS NOT NULL
           THEN MAX(NULLIF(ps.account_id, 0))::text
           ELSE MAX(ps.persona_name) END
       ) as player_key,
       MAX(ps.persona_name) as persona_name,
       MAX(n.nickname) as nickname,
       MAX(n.discord_id) as discord_id,
       COUNT(DISTINCT ps.match_id) as games_played,
       MAX(m.date) as last_played,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       ROUND(AVG(
         CASE WHEN team_kills.total_kills > 0
           THEN ((ps.kills + ps.assists)::numeric / team_kills.total_kills) * 100
           ELSE 0
         END
       ), 0) as avg_kill_involvement,
       MODE() WITHIN GROUP (ORDER BY CASE WHEN ps.position > 0 THEN ps.position ELSE NULL END) as most_played_position
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     LEFT JOIN LATERAL (
       SELECT SUM(ps2.kills) as total_kills
       FROM player_stats ps2
       WHERE ps2.match_id = ps.match_id AND ps2.team = ps.team
     ) team_kills ON true
     WHERE 1=1${sc}
     GROUP BY
       COALESCE(n.nickname, CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END)
     ORDER BY games_played DESC`,
    params1
  );

  const params2 = [];
  const sc2 = _sc(seasonId, params2, 'm');
  const posStats = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       ps.position,
       COUNT(*) as games,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.position > 0${sc2}
     GROUP BY
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       ps.position`,
    params2
  );

  const params3 = [];
  const sc3 = _scWhere(seasonId, params3, 'm');
  const teamKillsRes = await p.query(
    `SELECT ps.match_id, ps.team, SUM(ps.kills) as team_kills
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id${sc3}
     GROUP BY ps.match_id, ps.team`,
    params3
  );
  const teamKillsMap = {};
  for (const row of teamKillsRes.rows) {
    teamKillsMap[`${row.match_id}_${row.team}`] = parseInt(row.team_kills) || 0;
  }

  const params4 = [];
  const sc4 = _sc(seasonId, params4, 'm');
  const posKiData = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       ps.position, ps.match_id, ps.team, ps.kills, ps.assists
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.position > 0${sc4}`,
    params4
  );
  const kiByPlayerPos = {};
  for (const row of posKiData.rows) {
    const key = decodeByteString(row.player_key);
    const posKey = `${key}_${row.position}`;
    const tk = teamKillsMap[`${row.match_id}_${row.team}`] || 1;
    const ki = ((parseInt(row.kills) + parseInt(row.assists)) / tk) * 100;
    if (!kiByPlayerPos[posKey]) kiByPlayerPos[posKey] = [];
    kiByPlayerPos[posKey].push(ki);
  }

  const posByPlayer = {};
  for (const row of posStats.rows) {
    const key = decodeByteString(row.player_key);
    if (!posByPlayer[key]) posByPlayer[key] = [];
    const g = parseInt(row.games) || 1;
    const w = parseInt(row.wins) || 0;
    const k = parseFloat(row.avg_kills) || 0;
    const d = parseFloat(row.avg_deaths) || 1;
    const a = parseFloat(row.avg_assists) || 0;
    const kda = (k + a) / Math.max(1, d);
    const winRate = w / g;
    const posKey = `${key}_${row.position}`;
    const kis = kiByPlayerPos[posKey] || [];
    const avgKi = kis.length > 0 ? kis.reduce((x, y) => x + y, 0) / kis.length : 0;
    const score = Math.min(10, (winRate * 4.0) + Math.min(3.0, kda * 0.6) + Math.min(3.0, avgKi / 25));
    posByPlayer[key].push({ position: parseInt(row.position), score: Math.round(score * 10) / 10 });
  }

  for (const row of result.rows) {
    row.persona_name = decodeByteString(row.persona_name);
    row.player_key = decodeByteString(row.player_key);
    // posStats/posKiData are keyed by raw account_id or persona_name (no nickname merge),
    // so look up by account_id when available, otherwise persona_name.
    const posLookupKey = row.account_id && row.account_id !== 0
      ? row.account_id.toString()
      : row.persona_name;
    const positions = posByPlayer[posLookupKey] || [];
    if (positions.length > 0) {
      const best = positions.reduce((a, b) => a.score > b.score ? a : b);
      row.best_position = best.position;
      row.best_position_score = best.score;
    } else {
      row.best_position = null;
      row.best_position_score = null;
    }
  }
  return result.rows;
}

// ─── Hero Tier List & Suggestions ──────────────────────────────────────────

const HERO_TIER_DEFS = [
  { key: 'S', min: 0.58 },
  { key: 'A', min: 0.53 },
  { key: 'B', min: 0.48 },
  { key: 'C', min: 0.43 },
  { key: 'D', min: 0 },
];

function _computeHeroTier(wr) {
  for (const t of HERO_TIER_DEFS) {
    if (wr >= t.min) return t.key;
  }
  return 'D';
}

async function getHeroTierList(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');

  const heroResult = await p.query(`
    SELECT
      ps.hero_id,
      MAX(ps.hero_name) as hero_name,
      COUNT(*) as games,
      SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.hero_id > 0${sc}
    GROUP BY ps.hero_id
    HAVING COUNT(*) >= 2
    ORDER BY COUNT(*) DESC
  `, params);

  const banParams = [];
  const banSc = _sc(seasonId, banParams, 'm');
  const banResult = await p.query(`
    SELECT md.hero_id, COUNT(*) as bans
    FROM match_draft md
    JOIN matches m ON m.match_id = md.match_id
    WHERE md.is_pick = false${banSc}
    GROUP BY md.hero_id
  `, banParams);
  const banMap = {};
  for (const r of banResult.rows) banMap[parseInt(r.hero_id)] = parseInt(r.bans);

  const posParams = [];
  const posSc = _sc(seasonId, posParams, 'm');
  const posResult = await p.query(`
    SELECT ps.hero_id, ps.position, COUNT(*) as cnt
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.hero_id > 0 AND ps.position > 0${posSc}
    GROUP BY ps.hero_id, ps.position
    ORDER BY ps.hero_id, COUNT(*) DESC
  `, posParams);
  const posMap = {};
  for (const r of posResult.rows) {
    const hid = parseInt(r.hero_id);
    if (!posMap[hid]) posMap[hid] = parseInt(r.position);
  }

  const sid = seasonId && seasonId !== 'legacy' ? parseInt(seasonId) : null;
  let overrideResult;
  if (sid === null) {
    overrideResult = await p.query(`SELECT hero_id, tier FROM hero_tier_overrides WHERE season_id IS NULL`);
  } else {
    overrideResult = await p.query(`SELECT hero_id, tier FROM hero_tier_overrides WHERE season_id = $1`, [sid]);
  }
  const overrideMap = {};
  for (const r of overrideResult.rows) overrideMap[parseInt(r.hero_id)] = r.tier;

  const tiers = { S: [], A: [], B: [], C: [], D: [] };
  for (const r of heroResult.rows) {
    const games = parseInt(r.games);
    const wins = parseInt(r.wins);
    const wr = games > 0 ? wins / games : 0;
    const computed_tier = _computeHeroTier(wr);
    const heroId = parseInt(r.hero_id);
    const tier = overrideMap[heroId] || computed_tier;
    const hero = {
      hero_id: heroId,
      hero_name: r.hero_name,
      games,
      wins,
      bans: banMap[heroId] || 0,
      win_rate: wr,
      primary_position: posMap[heroId] || 0,
      tier,
      computed_tier,
      is_overridden: !!overrideMap[heroId],
    };
    (tiers[tier] || tiers.D).push(hero);
  }

  for (const key of Object.keys(tiers)) {
    tiers[key].sort((a, b) => b.win_rate - a.win_rate);
  }

  return { tiers };
}

async function getHeroTierOverrides(seasonId = null) {
  const p = getPool();
  const sid = seasonId && seasonId !== 'legacy' ? parseInt(seasonId) : null;
  let result;
  if (sid === null) {
    result = await p.query(`SELECT * FROM hero_tier_overrides WHERE season_id IS NULL ORDER BY set_at DESC`);
  } else {
    result = await p.query(`SELECT * FROM hero_tier_overrides WHERE season_id = $1 ORDER BY set_at DESC`, [sid]);
  }
  return result.rows;
}

async function setHeroTierOverride(seasonId, heroId, tier, setBy = null) {
  const p = getPool();
  const validTiers = ['S', 'A', 'B', 'C', 'D'];
  if (!validTiers.includes(tier)) throw new Error('Invalid tier: must be S, A, B, C, or D');
  const sid = seasonId && seasonId !== 'legacy' ? parseInt(seasonId) : null;
  const hid = parseInt(heroId);
  if (sid === null) {
    await p.query(`DELETE FROM hero_tier_overrides WHERE season_id IS NULL AND hero_id = $1`, [hid]);
  } else {
    await p.query(`DELETE FROM hero_tier_overrides WHERE season_id = $1 AND hero_id = $2`, [sid, hid]);
  }
  await p.query(
    `INSERT INTO hero_tier_overrides (season_id, hero_id, tier, set_by) VALUES ($1, $2, $3, $4)`,
    [sid, hid, tier, setBy]
  );
}

async function deleteHeroTierOverride(seasonId, heroId) {
  const p = getPool();
  const sid = seasonId && seasonId !== 'legacy' ? parseInt(seasonId) : null;
  const hid = parseInt(heroId);
  if (sid === null) {
    await p.query(`DELETE FROM hero_tier_overrides WHERE season_id IS NULL AND hero_id = $1`, [hid]);
  } else {
    await p.query(`DELETE FROM hero_tier_overrides WHERE season_id = $1 AND hero_id = $2`, [sid, hid]);
  }
}

async function getPlayerHeroSuggestions(accountId, seasonId = null) {
  const p = getPool();

  // Query 1: Per-player, per-hero aggregate stats for the league.
  // Co-success correlation P(WR≥50% on candidate | WR≥50% on ref hero) is computed in JS.
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const allResult = await p.query(`
    SELECT
      ps.account_id,
      ps.hero_id,
      MAX(ps.hero_name) as hero_name,
      COUNT(*) as games,
      SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true)
                 OR (ps.team = 'dire'    AND m.radiant_win = false)
               THEN 1 ELSE 0 END) as wins
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.hero_id > 0${sc}
    GROUP BY ps.account_id, ps.hero_id
    HAVING COUNT(*) >= 2
  `, params);

  // Query 2: Community-wide primary position per hero (mode across all games).
  const posParams = [];
  const posSc = _sc(seasonId, posParams, 'm');
  const posResult = await p.query(`
    SELECT ps.hero_id, ps.position, COUNT(*) as cnt
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.hero_id > 0 AND ps.position > 0${posSc}
    GROUP BY ps.hero_id, ps.position
    ORDER BY ps.hero_id, COUNT(*) DESC
  `, posParams);
  const heroPrimaryPos = {};
  for (const r of posResult.rows) {
    const hid = parseInt(r.hero_id);
    if (!heroPrimaryPos[hid]) heroPrimaryPos[hid] = parseInt(r.position);
  }

  // Build: account_id -> { hero_id -> { games, wins, wr, hero_name } }
  const leagueMap = {};
  for (const r of allResult.rows) {
    const aid = String(r.account_id);
    const hid = parseInt(r.hero_id);
    const games = parseInt(r.games);
    const wins = parseInt(r.wins);
    if (!leagueMap[aid]) leagueMap[aid] = {};
    leagueMap[aid][hid] = { games, wins, wr: games > 0 ? wins / games : 0, hero_name: r.hero_name };
  }

  const myStats = leagueMap[String(accountId)] || {};
  if (Object.keys(myStats).length === 0) return { suggestions: [] };

  // Player's top heroes by win rate (min 2 games), with their primary positions.
  const myHeroList = Object.entries(myStats)
    .map(([hid, h]) => ({ hero_id: parseInt(hid), ...h, position: heroPrimaryPos[parseInt(hid)] || 0 }))
    .filter(h => h.games >= 2)
    .sort((a, b) => b.wr - a.wr);

  const topHeroes = myHeroList.slice(0, 3);
  if (topHeroes.length === 0) return { suggestions: [] };

  const topHeroIds = new Set(topHeroes.map(h => h.hero_id));
  // Positions the player plays; used to restrict candidates to same role.
  const topPositions = new Set(topHeroes.map(h => h.position).filter(p => p > 0));

  // Co-success scoring: for each (ref_hero, candidate_hero) pair, count other players who
  // have ≥50% WR on the ref hero and ≥2 games on the candidate (same role), then compute
  // correlation_score = fraction of those players who also achieve ≥50% WR on the candidate.
  const pairScores = {};

  for (const [playerId, heroMap] of Object.entries(leagueMap)) {
    if (String(playerId) === String(accountId)) continue;

    for (const topHero of topHeroes) {
      const refStats = heroMap[topHero.hero_id];
      if (!refStats || refStats.wr < 0.50) continue;

      for (const [hidStr, cStats] of Object.entries(heroMap)) {
        const candidateHeroId = parseInt(hidStr);
        if (topHeroIds.has(candidateHeroId)) continue;

        // Only suggest heroes in the same position(s) as the player's top heroes.
        const candidatePos = heroPrimaryPos[candidateHeroId] || 0;
        if (topPositions.size > 0 && candidatePos > 0 && !topPositions.has(candidatePos)) continue;

        const myGamesOnCandidate = myStats[candidateHeroId]?.games || 0;
        if (myGamesOnCandidate >= 5) continue;

        const key = `${candidateHeroId}:${topHero.hero_id}`;
        if (!pairScores[key]) {
          pairScores[key] = {
            hero_id: candidateHeroId,
            hero_name: cStats.hero_name,
            position: candidatePos,
            ref_hero_id: topHero.hero_id,
            shared_players: 0,
            good_at_candidate: 0,
            total_wr: 0,
          };
        }
        pairScores[key].shared_players++;
        pairScores[key].total_wr += cStats.wr;
        if (cStats.wr >= 0.50) pairScores[key].good_at_candidate++;
      }
    }
  }

  // Rank by correlation score; require ≥2 shared data points and ≥50% correlation.
  const ranked = Object.values(pairScores)
    .filter(c => c.shared_players >= 2)
    .map(c => ({
      ...c,
      correlation_score: c.good_at_candidate / c.shared_players,
      avg_wr_on_candidate: c.total_wr / c.shared_players,
    }))
    .filter(c => c.correlation_score >= 0.50)
    .sort((a, b) => b.correlation_score - a.correlation_score || b.avg_wr_on_candidate - a.avg_wr_on_candidate);

  const seen = new Set();
  const suggestions = [];
  for (const c of ranked) {
    if (seen.has(c.hero_id)) continue;
    seen.add(c.hero_id);
    const refHero = topHeroes.find(h => h.hero_id === c.ref_hero_id);
    suggestions.push({
      hero_id: c.hero_id,
      hero_name: c.hero_name,
      position: c.position,
      player_games: myStats[c.hero_id]?.games || 0,
      community_win_rate: c.avg_wr_on_candidate,
      correlation_score: c.correlation_score,
      similar_players_count: c.shared_players,
      based_on_hero_id: c.ref_hero_id,
      based_on_hero_name: refHero?.hero_name || null,
      based_on_hero_wr: refHero ? refHero.wr : null,
    });
    if (suggestions.length >= 5) break;
  }

  return { suggestions };
}

async function getHeroStats(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const sc2 = _sc(seasonId, params, 'm2');
  const result = await p.query(
    `SELECT
       ps.hero_id,
       ps.hero_name,
       COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       ROUND(AVG(ps.gpm), 0) as avg_gpm,
       ROUND(AVG(ps.xpm), 0) as avg_xpm,
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage,
       ROUND(AVG(ps.tower_damage), 0) as avg_tower_damage,
       ROUND(AVG(ps.hero_healing), 0) as avg_hero_healing,
       ROUND(AVG(ps.last_hits), 0) as avg_last_hits,
       COALESCE((
         SELECT COUNT(*) FROM match_draft md
         JOIN matches m2 ON m2.match_id = md.match_id
         WHERE md.hero_id = ps.hero_id AND md.is_pick = false${sc2}
       ), 0) as bans
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.hero_id > 0${sc}
     GROUP BY ps.hero_id, ps.hero_name
     ORDER BY games DESC`,
    params
  );

  const params3 = [];
  const sc3 = _scNoAlias(seasonId, params3);
  const totalResult = await p.query(`SELECT COUNT(*) as total FROM matches WHERE 1=1${sc3}`, params3);

  const params4 = [];
  const sc4 = _sc(seasonId, params4, 'm');
  const draftResult = await p.query(
    `SELECT COUNT(DISTINCT md.match_id) as draft_total FROM match_draft md JOIN matches m ON m.match_id = md.match_id WHERE 1=1${sc4}`,
    params4
  );

  return {
    heroes: result.rows,
    totalMatches: parseInt(totalResult.rows[0].total) || 0,
    draftMatches: parseInt(draftResult.rows[0].draft_total) || 0,
  };
}

async function getOverallStats(seasonId = null) {
  const p = getPool();
  const params1 = [];
  const sc1 = _sc(seasonId, params1, 'm');
  const result = await p.query(
    `SELECT
       COALESCE(n.nickname, CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END) as player_key,
       MAX(ps.account_id) as account_id,
       MAX(ps.persona_name) as persona_name,
       MAX(n.nickname) as nickname,
       COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = false) OR (team = 'dire' AND m.radiant_win = true) THEN 1 ELSE 0 END) as losses,
       SUM(ps.kills) as total_kills,
       SUM(ps.deaths) as total_deaths,
       SUM(ps.assists) as total_assists,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       ROUND(AVG(ps.gpm), 0) as avg_gpm,
       ROUND(AVG(ps.xpm), 0) as avg_xpm,
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage,
       ROUND(AVG(ps.tower_damage), 0) as avg_tower_damage,
       ROUND(AVG(ps.hero_healing), 0) as avg_hero_healing,
       ROUND(AVG(ps.damage_taken), 0) as avg_damage_taken,
       ROUND(AVG(ps.last_hits), 0) as avg_last_hits,
       ROUND(AVG(ps.denies), 0) as avg_denies,
       ROUND(AVG(ps.camps_stacked), 1) as avg_stacks,
       SUM(CASE WHEN ps.is_captain THEN 1 ELSE 0 END) as captain_games,
       SUM(CASE WHEN ps.is_captain AND ((team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false)) THEN 1 ELSE 0 END) as captain_wins
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE 1=1${sc1}
     GROUP BY
       COALESCE(n.nickname, CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END)
     ORDER BY games DESC`,
    params1
  );

  const params2 = [];
  const sc2 = _scWhere(seasonId, params2, 'm');
  const teamKills = await p.query(
    `SELECT ps.match_id, ps.team, SUM(ps.kills) as team_kills
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id${sc2}
     GROUP BY ps.match_id, ps.team`,
    params2
  );
  const teamKillsMap = {};
  for (const row of teamKills.rows) {
    teamKillsMap[`${row.match_id}_${row.team}`] = parseInt(row.team_kills) || 0;
  }

  const params3 = [];
  const sc3 = _sc(seasonId, params3, 'm');
  const kiData = await p.query(
    `SELECT
       COALESCE(n.nickname, CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END) as player_key,
       ps.match_id, ps.team, ps.kills, ps.assists
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE 1=1${sc3}`,
    params3
  );
  const kiByPlayer = {};
  for (const row of kiData.rows) {
    const key = decodeByteString(row.player_key);
    const tk = teamKillsMap[`${row.match_id}_${row.team}`] || 1;
    const ki = ((parseInt(row.kills) + parseInt(row.assists)) / tk) * 100;
    if (!kiByPlayer[key]) kiByPlayer[key] = [];
    kiByPlayer[key].push(ki);
  }

  for (const row of result.rows) {
    row.persona_name = decodeByteString(row.persona_name);
    row.player_key = decodeByteString(row.player_key);
    const kis = kiByPlayer[row.player_key] || [];
    row.avg_kill_involvement = kis.length > 0 ? Math.round(kis.reduce((a, b) => a + b, 0) / kis.length) : 0;
  }

  const paramsBP1 = [];
  const scBP1 = _sc(seasonId, paramsBP1, 'm');
  const posStats = await p.query(
    `SELECT
       ps.account_id::text as player_key,
       ps.position,
       COUNT(*) as games,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.account_id != 0 AND ps.position > 0${scBP1}
     GROUP BY ps.account_id, ps.position`,
    paramsBP1
  );

  const paramsBP2 = [];
  const scBP2 = _sc(seasonId, paramsBP2, 'm');
  const posKiData = await p.query(
    `SELECT ps.account_id::text as player_key, ps.position, ps.match_id, ps.team, ps.kills, ps.assists
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.account_id != 0 AND ps.position > 0${scBP2}`,
    paramsBP2
  );
  const kiByPlayerPos = {};
  for (const row of posKiData.rows) {
    const posKey = `${row.player_key}_${row.position}`;
    const tk = teamKillsMap[`${row.match_id}_${row.team}`] || 1;
    const ki = ((parseInt(row.kills) + parseInt(row.assists)) / tk) * 100;
    if (!kiByPlayerPos[posKey]) kiByPlayerPos[posKey] = [];
    kiByPlayerPos[posKey].push(ki);
  }

  const posByPlayer = {};
  for (const row of posStats.rows) {
    const key = row.player_key;
    if (!posByPlayer[key]) posByPlayer[key] = [];
    const g = parseInt(row.games) || 1;
    const w = parseInt(row.wins) || 0;
    const k = parseFloat(row.avg_kills) || 0;
    const d = parseFloat(row.avg_deaths) || 1;
    const a = parseFloat(row.avg_assists) || 0;
    const kda = (k + a) / Math.max(1, d);
    const winRate = w / g;
    const posKey = `${key}_${row.position}`;
    const kis = kiByPlayerPos[posKey] || [];
    const avgKi = kis.length > 0 ? kis.reduce((x, y) => x + y, 0) / kis.length : 0;
    const score = Math.min(10, (winRate * 4.0) + Math.min(3.0, kda * 0.6) + Math.min(3.0, avgKi / 25));
    posByPlayer[key].push({ position: parseInt(row.position), score: Math.round(score * 10) / 10 });
  }

  for (const row of result.rows) {
    const key = row.account_id?.toString();
    const positions = key ? (posByPlayer[key] || []) : [];
    if (positions.length > 0) {
      const best = positions.reduce((a, b) => a.score > b.score ? a : b);
      row.best_position = best.position;
      row.best_position_score = best.score;
    } else {
      row.best_position = null;
      row.best_position_score = null;
    }
  }

  return result.rows;
}

function computeMatchLaneOutcomes(players) {
  const getLane = (p) => {
    if (p.laning_nw == null) return null;
    const pos = parseInt(p.position);
    const team = p.team;
    if (pos === 1 || pos === 5) return team === 'radiant' ? 'safe_radiant' : 'off_dire';
    if (pos === 3 || pos === 4) return team === 'radiant' ? 'off_radiant' : 'safe_dire';
    if (pos === 2) return team === 'radiant' ? 'mid_radiant' : 'mid_dire';
    return null;
  };
  const getLaneResult = (adv) => {
    if (adv > 2000) return 'W';
    if (adv > 500) return 'w';
    if (adv < -2000) return 'L';
    if (adv < -500) return 'l';
    return '~';
  };
  const groups = { safe_radiant: [], off_die: [], off_radiant: [], safe_dire: [], mid_radiant: [], mid_dire: [], off_dire: [] };
  for (const p of players) {
    const lane = getLane(p);
    if (lane && groups[lane]) groups[lane].push(p);
  }
  const sumNW = (grp) => grp.reduce((s, p) => s + (parseInt(p.laning_nw) || 0), 0);
  const outcomes = {};
  const applyLane = (radGroup, direGroup) => {
    if (radGroup.length === 0 && direGroup.length === 0) return;
    const adv = sumNW(radGroup) - sumNW(direGroup);
    for (const p of radGroup) outcomes[p.slot] = getLaneResult(adv);
    for (const p of direGroup) outcomes[p.slot] = getLaneResult(-adv);
  };
  applyLane(groups.safe_radiant, groups.off_dire);
  applyLane(groups.off_radiant, groups.safe_dire);
  applyLane(groups.mid_radiant, groups.mid_dire);
  return outcomes;
}

async function getPositionStats(position, minGames = 1, seasonId = null) {
  const p = getPool();
  const params1 = [position, minGames];
  const sc1 = _sc(seasonId, params1, 'm');
  const result = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       COALESCE(NULLIF(ps.account_id, 0), 0) as account_id,
       MAX(ps.persona_name) as persona_name,
       n.nickname,
       COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = false) OR (team = 'dire' AND m.radiant_win = true) THEN 1 ELSE 0 END) as losses,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       ROUND(AVG(ps.gpm), 0) as avg_gpm,
       ROUND(AVG(ps.xpm), 0) as avg_xpm,
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage,
       ROUND(AVG(ps.damage_taken), 0) as avg_damage_taken,
       ROUND(AVG(ps.obs_placed + ps.sen_placed), 0) as avg_support_gold,
       ROUND(AVG(ps.camps_stacked), 1) as avg_stacks
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE ps.position = $1${sc1}
     GROUP BY
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       COALESCE(NULLIF(ps.account_id, 0), 0),
       n.nickname
     HAVING COUNT(*) >= $2
     ORDER BY SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END)::float / GREATEST(COUNT(*), 1) DESC, COUNT(*) DESC`,
    params1
  );

  const params2 = [];
  const sc2 = _scWhere(seasonId, params2, 'm');
  const teamKills = await p.query(
    `SELECT ps.match_id, ps.team, SUM(ps.kills) as team_kills
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id${sc2}
     GROUP BY ps.match_id, ps.team`,
    params2
  );
  const teamKillsMap = {};
  for (const row of teamKills.rows) {
    teamKillsMap[`${row.match_id}_${row.team}`] = parseInt(row.team_kills) || 0;
  }

  const params3 = [position];
  const sc3 = _sc(seasonId, params3, 'm');
  const kiData = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       ps.match_id, ps.team, ps.kills, ps.assists
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.position = $1${sc3}`,
    params3
  );
  const kiByPlayer = {};
  for (const row of kiData.rows) {
    const key = decodeByteString(row.player_key);
    const tk = teamKillsMap[`${row.match_id}_${row.team}`] || 1;
    const ki = ((parseInt(row.kills) + parseInt(row.assists)) / tk) * 100;
    if (!kiByPlayer[key]) kiByPlayer[key] = [];
    kiByPlayer[key].push(ki);
  }

  const params4 = [];
  const sc4 = _sc(seasonId, params4, 'm');
  const laningData = await p.query(
    `SELECT ps.match_id, ps.slot,
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       ps.position, ps.team, ps.laning_nw
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.laning_nw IS NOT NULL${sc4}`,
    params4
  );
  const matchPlayersForLane = {};
  for (const row of laningData.rows) {
    if (!matchPlayersForLane[row.match_id]) matchPlayersForLane[row.match_id] = [];
    matchPlayersForLane[row.match_id].push(row);
  }
  const laneByPlayer = {};
  for (const players of Object.values(matchPlayersForLane)) {
    const outcomes = computeMatchLaneOutcomes(players);
    for (const p of players) {
      if (parseInt(p.position) !== position) continue;
      const outcome = outcomes[p.slot];
      if (!outcome) continue;
      const key = decodeByteString(p.player_key);
      if (!laneByPlayer[key]) laneByPlayer[key] = { wins: 0, losses: 0, games: 0 };
      laneByPlayer[key].games++;
      if (outcome === 'W' || outcome === 'w') laneByPlayer[key].wins++;
      else if (outcome === 'L' || outcome === 'l') laneByPlayer[key].losses++;
    }
  }

  for (const row of result.rows) {
    row.persona_name = decodeByteString(row.persona_name);
    row.player_key = decodeByteString(row.player_key);
    const kis = kiByPlayer[row.player_key] || [];
    row.avg_kill_involvement = kis.length > 0 ? Math.round(kis.reduce((a, b) => a + b, 0) / kis.length) : 0;
    const lane = laneByPlayer[row.player_key] || { wins: 0, losses: 0, games: 0 };
    row.lane_wins = lane.wins;
    row.lane_losses = lane.losses;
    row.lane_games = lane.games;
  }

  return result.rows;
}

async function getSynergyMatrix(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       ps1.persona_name as player_a,
       COALESCE(NULLIF(ps1.account_id, 0), 0) as account_id_a,
       ps2.persona_name as player_b,
       COALESCE(NULLIF(ps2.account_id, 0), 0) as account_id_b,
       ps1.team = ps2.team as same_team,
       CASE WHEN (ps1.team = 'radiant' AND m.radiant_win = true) OR (ps1.team = 'dire' AND m.radiant_win = false) THEN true ELSE false END as player_a_won
     FROM player_stats ps1
     JOIN player_stats ps2 ON ps1.match_id = ps2.match_id AND ps1.id != ps2.id
     JOIN matches m ON m.match_id = ps1.match_id
     WHERE ps1.persona_name != '' AND ps2.persona_name != ''${sc}`,
    params
  );

  const teammate = {};
  const opponent = {};

  for (const row of result.rows) {
    row.player_a = decodeByteString(row.player_a);
    row.player_b = decodeByteString(row.player_b);
    const keyA = row.account_id_a > 0 ? row.account_id_a.toString() : row.player_a;
    const keyB = row.account_id_b > 0 ? row.account_id_b.toString() : row.player_b;

    if (keyA >= keyB) continue;

    if (row.same_team) {
      const k = `${keyA}|${keyB}`;
      if (!teammate[k]) teammate[k] = { playerA: row.player_a, playerB: row.player_b, accountIdA: row.account_id_a, accountIdB: row.account_id_b, wins: 0, games: 0 };
      teammate[k].games++;
      if (row.player_a_won) teammate[k].wins++;
    } else {
      const k = `${keyA}|${keyB}`;
      if (!opponent[k]) opponent[k] = { playerA: row.player_a, playerB: row.player_b, accountIdA: row.account_id_a, accountIdB: row.account_id_b, winsA: 0, winsB: 0, games: 0 };
      opponent[k].games++;
      if (row.player_a_won) opponent[k].winsA++;
      else opponent[k].winsB++;
    }
  }

  const minGames = seasonId ? 1 : 3;
  return {
    teammate: Object.values(teammate).filter(r => r.games >= minGames),
    opponent: Object.values(opponent).filter(r => r.games >= minGames),
  };
}

async function getPlayerHeroes(playerKey) {
  const p = getPool();
  const isNumeric = /^\d+$/.test(playerKey);
  const whereClause = isNumeric && playerKey !== '0'
    ? 'ps.account_id = $1'
    : 'ps.persona_name = $1';
  const param = isNumeric && playerKey !== '0' ? parseInt(playerKey) : playerKey;

  const result = await p.query(
    `SELECT
       ps.hero_id, ps.hero_name,
       COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       ROUND(AVG(ps.gpm), 0) as avg_gpm,
       ROUND(AVG(ps.xpm), 0) as avg_xpm,
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage,
       ROUND(AVG(ps.tower_damage), 0) as avg_tower_damage,
       ROUND(AVG(ps.hero_healing), 0) as avg_hero_healing,
       SUM(CASE WHEN team = 'dire' AND ((team = 'dire' AND m.radiant_win = false)) THEN 1 ELSE 0 END) as dire_wins,
       SUM(CASE WHEN team = 'dire' THEN 1 ELSE 0 END) as dire_games,
       SUM(CASE WHEN team = 'radiant' AND ((team = 'radiant' AND m.radiant_win = true)) THEN 1 ELSE 0 END) as radiant_wins,
       SUM(CASE WHEN team = 'radiant' THEN 1 ELSE 0 END) as radiant_games
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ${whereClause} AND ps.hero_id > 0
     GROUP BY ps.hero_id, ps.hero_name
     ORDER BY games DESC`,
    [param]
  );
  return result.rows;
}

async function getPlayerPositions(playerKey, seasonId = null, mergedIds = null) {
  const p = getPool();
  const isNumeric = /^\d+$/.test(String(playerKey));
  let whereClause, param;
  if (mergedIds && mergedIds.length > 1) {
    whereClause = 'ps.account_id = ANY($1::bigint[])';
    param = mergedIds;
  } else if (isNumeric && playerKey !== '0') {
    whereClause = 'ps.account_id = $1';
    param = parseInt(playerKey);
  } else {
    whereClause = 'ps.persona_name = $1';
    param = playerKey;
  }
  const params = [param];
  const sc = _sc(seasonId, params, 'm');

  const result = await p.query(
    `SELECT
       ps.position,
       COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       ROUND(AVG(ps.gpm), 0) as avg_gpm,
       ROUND(AVG(ps.xpm), 0) as avg_xpm,
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage,
       ROUND(AVG(ps.last_hits), 0) as avg_last_hits,
       ROUND(AVG(ps.hero_healing), 0) as avg_hero_healing,
       ROUND(AVG(ps.tower_damage), 0) as avg_tower_damage
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ${whereClause} AND ps.position > 0${sc}
     GROUP BY ps.position
     ORDER BY games DESC`,
    params
  );
  return result.rows;
}

async function getHeroPlayers(heroId, seasonId = null) {
  const p = getPool();
  const params = [heroId];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       COALESCE(NULLIF(ps.account_id, 0), 0) as account_id,
       MAX(ps.persona_name) as persona_name,
       n.nickname,
       COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       ROUND(AVG(ps.gpm), 0) as avg_gpm,
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage,
       SUM(ps.hook_attempts) FILTER (WHERE ps.hook_attempts IS NOT NULL) as total_hook_attempts,
       SUM(ps.hook_hits) FILTER (WHERE ps.hook_hits IS NOT NULL) as total_hook_hits
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE ps.hero_id = $1${sc}
     GROUP BY
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       COALESCE(NULLIF(ps.account_id, 0), 0),
       n.nickname
     ORDER BY games DESC`,
    params
  );
  for (const row of result.rows) {
    row.persona_name = decodeByteString(row.persona_name);
    row.player_key = decodeByteString(row.player_key);
  }
  return result.rows;
}

async function registerPlayer(discordId, discordName, steamId64) {
  const p = getPool();
  const accountId32 = (BigInt(steamId64) - BigInt('76561197960265728')).toString();
  await p.query(
    `INSERT INTO players (discord_id, discord_name, steam_id_64, account_id_32)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) DO UPDATE SET
       discord_name = $2, steam_id_64 = $3, account_id_32 = $4`,
    [discordId, discordName, steamId64, accountId32]
  );
  // Ensure a nicknames row exists for this account so the Discord ID is linked
  // even before an admin manually sets a display name via the web panel.
  await p.query(
    `INSERT INTO nicknames (account_id, discord_id, nickname, updated_at)
     VALUES ($2::bigint, $1, $3, NOW())
     ON CONFLICT (account_id) DO UPDATE SET
       discord_id = CASE WHEN TRIM(nicknames.discord_id) = '' OR nicknames.discord_id IS NULL
                         THEN $1 ELSE nicknames.discord_id END,
       updated_at = NOW()`,
    [discordId, accountId32, discordName]
  );
  return { accountId32 };
}

async function getRegisteredPlayers() {
  const p = getPool();
  const result = await p.query('SELECT * FROM players ORDER BY registered_at DESC');
  return result.rows;
}

async function getMatchHistory(limit = 10) {
  const p = getPool();
  const result = await p.query(
    'SELECT * FROM matches ORDER BY date DESC LIMIT $1',
    [limit]
  );
  return result.rows.map(r => ({
    matchId: r.match_id,
    date: r.date,
    duration: r.duration,
    radiantWin: r.radiant_win,
    lobbyName: r.lobby_name,
  }));
}

async function recalculateAllRatings() {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ratings');
    await client.query('DELETE FROM rating_history');

    const matches = await client.query(
      'SELECT match_id FROM matches ORDER BY date ASC'
    );

    const { getStatsService } = require('../stats/statsService');
    const statsService = getStatsService();

    for (const match of matches.rows) {
      const players = await client.query(
        'SELECT * FROM player_stats WHERE match_id = $1',
        [match.match_id]
      );
      const matchData = await client.query(
        'SELECT radiant_win FROM matches WHERE match_id = $1',
        [match.match_id]
      );
      const radiantWin = matchData.rows[0]?.radiant_win;

      const radiantPlayers = players.rows.filter(p => p.team === 'radiant');
      const direPlayers = players.rows.filter(p => p.team === 'dire');

      const radiant = [];
      const dire = [];

      for (const p of radiantPlayers) {
        const id = p.account_id > 0 ? p.account_id.toString() : `anon_${p.persona_name}`;
        if (id === '0') continue;
        const existing = await client.query(
          'SELECT mu, sigma FROM ratings WHERE player_id::text = $1',
          [id]
        );
        radiant.push({
          id,
          mu: existing.rows[0]?.mu || 25,
          sigma: existing.rows[0]?.sigma || 8.333,
        });
      }

      for (const p of direPlayers) {
        const id = p.account_id > 0 ? p.account_id.toString() : `anon_${p.persona_name}`;
        if (id === '0') continue;
        const existing = await client.query(
          'SELECT mu, sigma FROM ratings WHERE player_id::text = $1',
          [id]
        );
        dire.push({
          id,
          mu: existing.rows[0]?.mu || 25,
          sigma: existing.rows[0]?.sigma || 8.333,
        });
      }

      if (radiant.length > 0 && dire.length > 0) {
        const newRatings = statsService.calculateNewRatings(radiant, dire, radiantWin);
        for (const r of newRatings) {
          const isRadiant = radiant.some(p => p.id === r.id);
          const won = isRadiant ? radiantWin : !radiantWin;
          const player = players.rows.find(p =>
            (p.account_id > 0 ? p.account_id.toString() : `anon_${p.persona_name}`) === r.id
          );
          await client.query(
            `INSERT INTO ratings (player_id, discord_id, display_name, mu, sigma, mmr, wins, losses, games_played, last_updated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW())
             ON CONFLICT (player_id) DO UPDATE SET
               mu = $4, sigma = $5, mmr = $6,
               wins = ratings.wins + $7, losses = ratings.losses + $8,
               games_played = ratings.games_played + 1,
               last_updated = NOW(),
               display_name = COALESCE(NULLIF($3, ''), ratings.display_name)`,
            [r.id, '', player?.persona_name || r.id, r.mu, r.sigma, r.mmr, won ? 1 : 0, won ? 0 : 1]
          );
          const numericPid = /^\d+$/.test(String(r.id)) ? parseInt(r.id) : null;
          if (numericPid) {
            await client.query(
              `INSERT INTO rating_history (player_id, mmr, mu, sigma, match_id) VALUES ($1, $2, $3, $4, $5)`,
              [numericPid, r.mmr, r.mu, r.sigma, match.match_id]
            );
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log('[DB] Ratings and rating_history recalculated from all matches.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updatePlayerPosition(matchId, slot, position) {
  const p = getPool();
  await p.query(
    'UPDATE player_stats SET position = $1 WHERE match_id = $2 AND slot = $3',
    [position, matchId, slot]
  );
}

async function getSynergyHeatmap(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       ps1.persona_name as player_a,
       COALESCE(NULLIF(ps1.account_id, 0), 0) as account_id_a,
       n1.nickname as nickname_a,
       ps2.persona_name as player_b,
       COALESCE(NULLIF(ps2.account_id, 0), 0) as account_id_b,
       n2.nickname as nickname_b,
       ps1.team = ps2.team as same_team,
       CASE WHEN (ps1.team = 'radiant' AND m.radiant_win = true) OR (ps1.team = 'dire' AND m.radiant_win = false) THEN true ELSE false END as player_a_won
     FROM player_stats ps1
     JOIN player_stats ps2 ON ps1.match_id = ps2.match_id AND ps1.id != ps2.id
     JOIN matches m ON m.match_id = ps1.match_id
     LEFT JOIN nicknames n1 ON n1.account_id = ps1.account_id AND ps1.account_id != 0
     LEFT JOIN nicknames n2 ON n2.account_id = ps2.account_id AND ps2.account_id != 0
     WHERE ps1.persona_name != '' AND ps2.persona_name != ''${sc}`,
    params
  );

  const playerNames = {};
  const teammate = {};

  for (const row of result.rows) {
    row.player_a = decodeByteString(row.player_a);
    row.player_b = decodeByteString(row.player_b);
    const nameA = row.nickname_a || row.player_a;
    const nameB = row.nickname_b || row.player_b;
    const keyA = row.nickname_a || (row.account_id_a > 0 ? row.account_id_a.toString() : row.player_a);
    const keyB = row.nickname_b || (row.account_id_b > 0 ? row.account_id_b.toString() : row.player_b);

    playerNames[keyA] = nameA;
    playerNames[keyB] = nameB;

    if (!row.same_team) continue;
    if (keyA === keyB) continue;

    const pairKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    if (!teammate[pairKey]) {
      const orderedA = keyA < keyB ? keyA : keyB;
      const orderedB = keyA < keyB ? keyB : keyA;
      teammate[pairKey] = { keyA: orderedA, keyB: orderedB, wins: 0, games: 0 };
    }
    teammate[pairKey].games += 0.5;
    if (row.player_a_won) teammate[pairKey].wins += 0.5;
  }

  const allPlayerKeys = Object.keys(playerNames).sort((a, b) =>
    playerNames[a].toLowerCase().localeCompare(playerNames[b].toLowerCase())
  );

  const players = allPlayerKeys.map(k => ({ key: k, name: playerNames[k] }));

  const matrix = {};
  for (const pair of Object.values(teammate)) {
    const g = Math.round(pair.games);
    const w = Math.round(pair.wins);
    if (g < 2) continue;
    if (!matrix[pair.keyA]) matrix[pair.keyA] = {};
    if (!matrix[pair.keyB]) matrix[pair.keyB] = {};
    matrix[pair.keyA][pair.keyB] = { games: g, wins: w };
    matrix[pair.keyB][pair.keyA] = { games: g, wins: w };
  }

  return { players, matrix };
}

async function getMatchDraft(matchId) {
  const p = getPool();
  const result = await p.query(
    `SELECT hero_id, is_pick, order_num, team FROM match_draft WHERE match_id = $1 ORDER BY order_num ASC`,
    [matchId]
  );
  return result.rows;
}

async function updateMatchDraft(matchId, entries) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM match_draft WHERE match_id = $1`, [matchId]);
    for (const entry of entries) {
      await client.query(
        `INSERT INTO match_draft (match_id, hero_id, is_pick, order_num, team) VALUES ($1, $2, $3, $4, $5)`,
        [matchId, parseInt(entry.hero_id) || 0, !!entry.is_pick, parseInt(entry.order_num), parseInt(entry.team)]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function clearMatchFileHash(matchId) {
  const p = getPool();
  await p.query(`UPDATE matches SET file_hash = NULL WHERE match_id = $1`, [matchId]);
}

async function getEnemySynergyHeatmap(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       ps1.persona_name as player_a,
       COALESCE(NULLIF(ps1.account_id, 0), 0) as account_id_a,
       n1.nickname as nickname_a,
       ps2.persona_name as player_b,
       COALESCE(NULLIF(ps2.account_id, 0), 0) as account_id_b,
       n2.nickname as nickname_b,
       ps1.team != ps2.team as diff_team,
       CASE WHEN (ps1.team = 'radiant' AND m.radiant_win = true) OR (ps1.team = 'dire' AND m.radiant_win = false) THEN true ELSE false END as player_a_won
     FROM player_stats ps1
     JOIN player_stats ps2 ON ps1.match_id = ps2.match_id AND ps1.id != ps2.id
     JOIN matches m ON m.match_id = ps1.match_id
     LEFT JOIN nicknames n1 ON n1.account_id = ps1.account_id AND ps1.account_id != 0
     LEFT JOIN nicknames n2 ON n2.account_id = ps2.account_id AND ps2.account_id != 0
     WHERE ps1.persona_name != '' AND ps2.persona_name != ''${sc}`,
    params
  );

  const playerNames = {};
  const versus = {};

  for (const row of result.rows) {
    row.player_a = decodeByteString(row.player_a);
    row.player_b = decodeByteString(row.player_b);
    const nameA = row.nickname_a || row.player_a;
    const nameB = row.nickname_b || row.player_b;
    const keyA = row.nickname_a || (row.account_id_a > 0 ? row.account_id_a.toString() : row.player_a);
    const keyB = row.nickname_b || (row.account_id_b > 0 ? row.account_id_b.toString() : row.player_b);

    playerNames[keyA] = nameA;
    playerNames[keyB] = nameB;

    if (!row.diff_team) continue;
    if (keyA === keyB) continue;

    const pairKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    const isAFirst = keyA < keyB;
    if (!versus[pairKey]) {
      const orderedA = isAFirst ? keyA : keyB;
      const orderedB = isAFirst ? keyB : keyA;
      versus[pairKey] = { keyA: orderedA, keyB: orderedB, winsA: 0, winsB: 0, games: 0 };
    }
    versus[pairKey].games += 0.5;
    // Only ONE of the two row-pair perspectives captures the win (the winner's row),
    // so we add 1.0 (not 0.5) to keep wins proportional to the 0.5-per-row game count.
    if (isAFirst) {
      if (row.player_a_won) versus[pairKey].winsA += 1.0;
    } else {
      if (row.player_a_won) versus[pairKey].winsB += 1.0;
    }
  }

  const allPlayerKeys = Object.keys(playerNames).sort((a, b) =>
    playerNames[a].toLowerCase().localeCompare(playerNames[b].toLowerCase())
  );

  const players = allPlayerKeys.map(k => ({ key: k, name: playerNames[k] }));

  const matrix = {};
  for (const pair of Object.values(versus)) {
    const g = Math.round(pair.games);
    if (g < 2) continue;
    const wA = Math.round(pair.winsA);
    const wB = Math.round(pair.winsB);
    if (!matrix[pair.keyA]) matrix[pair.keyA] = {};
    if (!matrix[pair.keyB]) matrix[pair.keyB] = {};
    matrix[pair.keyA][pair.keyB] = { games: g, wins: wA };
    matrix[pair.keyB][pair.keyA] = { games: g, wins: wB };
  }

  return { players, matrix };
}

async function getPlayerPositionProfiles(seasonId = null) {
  const p = getPool();
  const params1 = [];
  const sc1 = _sc(seasonId, params1, 'm');
  const result = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       COALESCE(NULLIF(ps.account_id, 0), 0) as account_id,
       MAX(ps.persona_name) as persona_name,
       n.nickname,
       COUNT(*) as total_games,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as total_wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE 1=1${sc1}
     GROUP BY
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       COALESCE(NULLIF(ps.account_id, 0), 0),
       n.nickname
     ORDER BY total_games DESC`,
    params1
  );

  const params2 = [];
  const sc2 = _sc(seasonId, params2, 'm');
  const posBreakdown = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       ps.position,
       COUNT(*) as games,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.position > 0${sc2}
     GROUP BY
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       ps.position
     ORDER BY ps.position`,
    params2
  );

  const breakdownByPlayer = {};
  for (const row of posBreakdown.rows) {
    const key = decodeByteString(row.player_key);
    if (!breakdownByPlayer[key]) breakdownByPlayer[key] = [];
    breakdownByPlayer[key].push({
      position: parseInt(row.position),
      games: parseInt(row.games),
      wins: parseInt(row.wins),
      avg_kills: parseFloat(row.avg_kills),
      avg_deaths: parseFloat(row.avg_deaths),
      avg_assists: parseFloat(row.avg_assists),
    });
  }

  const players = result.rows.map(row => {
    row.persona_name = decodeByteString(row.persona_name);
    row.player_key = decodeByteString(row.player_key);
    return {
      player_key: row.player_key,
      account_id: parseInt(row.account_id),
      persona_name: row.persona_name,
      nickname: row.nickname,
      total_games: parseInt(row.total_games),
      total_wins: parseInt(row.total_wins),
      avg_kills: parseFloat(row.avg_kills),
      avg_deaths: parseFloat(row.avg_deaths),
      avg_assists: parseFloat(row.avg_assists),
      positions: breakdownByPlayer[row.player_key] || [],
    };
  });

  return players;
}

async function getPlayerHeroProfiles(seasonId = null) {
  const p = getPool();
  const params1 = [];
  const sc1 = _sc(seasonId, params1, 'm');
  const result = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       COALESCE(NULLIF(ps.account_id, 0), 0) as account_id,
       MAX(ps.persona_name) as persona_name,
       n.nickname,
       COUNT(*) as total_games,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as total_wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       COUNT(DISTINCT CASE WHEN ps.hero_id > 0 THEN ps.hero_id ELSE NULL END) as unique_heroes
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE 1=1${sc1}
     GROUP BY
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       COALESCE(NULLIF(ps.account_id, 0), 0),
       n.nickname
     ORDER BY total_games DESC`,
    params1
  );

  const params2 = [];
  const sc2 = _sc(seasonId, params2, 'm');
  const heroBreakdown = await p.query(
    `SELECT
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       ps.hero_id,
       ps.hero_name,
       COUNT(*) as games,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true) OR (ps.team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(ps.kills), 1) as avg_kills,
       ROUND(AVG(ps.deaths), 1) as avg_deaths,
       ROUND(AVG(ps.assists), 1) as avg_assists,
       SUM(CASE WHEN ps.team = 'dire' THEN 1 ELSE 0 END) as dire_games,
       SUM(CASE WHEN ps.team = 'dire' AND ((ps.team = 'dire' AND m.radiant_win = false)) THEN 1 ELSE 0 END) as dire_wins,
       SUM(CASE WHEN ps.team = 'radiant' THEN 1 ELSE 0 END) as radiant_games,
       SUM(CASE WHEN ps.team = 'radiant' AND m.radiant_win = true THEN 1 ELSE 0 END) as radiant_wins
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.hero_id > 0${sc2}
     GROUP BY
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       ps.hero_id, ps.hero_name
     ORDER BY ps.hero_name`,
    params2
  );

  const params3 = [];
  const sc3 = _sc(seasonId, params3, 'm');
  const heroLaningData = await p.query(
    `SELECT ps.match_id, ps.slot, ps.hero_id,
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       ps.position, ps.team, ps.laning_nw
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.laning_nw IS NOT NULL${sc3}`,
    params3
  );
  const matchPlayersHero = {};
  for (const row of heroLaningData.rows) {
    if (!matchPlayersHero[row.match_id]) matchPlayersHero[row.match_id] = [];
    matchPlayersHero[row.match_id].push(row);
  }
  const laneByPlayerHero = {};
  for (const players of Object.values(matchPlayersHero)) {
    const outcomes = computeMatchLaneOutcomes(players);
    for (const p of players) {
      const outcome = outcomes[p.slot];
      if (!outcome || !p.hero_id) continue;
      const key = `${decodeByteString(p.player_key)}::${p.hero_id}`;
      if (!laneByPlayerHero[key]) laneByPlayerHero[key] = { wins: 0, losses: 0, games: 0 };
      laneByPlayerHero[key].games++;
      if (outcome === 'W' || outcome === 'w') laneByPlayerHero[key].wins++;
      else if (outcome === 'L' || outcome === 'l') laneByPlayerHero[key].losses++;
    }
  }

  const heroByPlayer = {};
  for (const row of heroBreakdown.rows) {
    const key = decodeByteString(row.player_key);
    if (!heroByPlayer[key]) heroByPlayer[key] = [];
    const laneKey = `${key}::${row.hero_id}`;
    const lane = laneByPlayerHero[laneKey] || { wins: 0, losses: 0, games: 0 };
    heroByPlayer[key].push({
      hero_id: parseInt(row.hero_id),
      hero_name: row.hero_name,
      games: parseInt(row.games),
      wins: parseInt(row.wins),
      avg_kills: parseFloat(row.avg_kills),
      avg_deaths: parseFloat(row.avg_deaths),
      avg_assists: parseFloat(row.avg_assists),
      dire_games: parseInt(row.dire_games),
      dire_wins: parseInt(row.dire_wins),
      radiant_games: parseInt(row.radiant_games),
      radiant_wins: parseInt(row.radiant_wins),
      lane_wins: lane.wins,
      lane_losses: lane.losses,
      lane_games: lane.games,
    });
  }

  const players = result.rows.map(row => {
    row.persona_name = decodeByteString(row.persona_name);
    row.player_key = decodeByteString(row.player_key);
    return {
      player_key: row.player_key,
      account_id: parseInt(row.account_id),
      persona_name: row.persona_name,
      nickname: row.nickname,
      total_games: parseInt(row.total_games),
      total_wins: parseInt(row.total_wins),
      avg_kills: parseFloat(row.avg_kills),
      avg_deaths: parseFloat(row.avg_deaths),
      avg_assists: parseFloat(row.avg_assists),
      unique_heroes: parseInt(row.unique_heroes),
      heroes: heroByPlayer[row.player_key] || [],
    };
  });

  return players;
}

async function getPlayerRatingHistory(accountId) {
  const p = getPool();
  const ids = await getMergedAccountIds(accountId);
  const result = await p.query(
    `SELECT mmr, mu, sigma, match_id, recorded_at
     FROM rating_history
     WHERE player_id = ANY($1::bigint[])
     ORDER BY recorded_at ASC
     LIMIT 200`,
    [ids]
  );
  return result.rows;
}

async function getPlayerRecentRatingHistory(accountId, limit = 20) {
  const p = getPool();
  const ids = await getMergedAccountIds(accountId);
  const result = await p.query(
    `SELECT mmr, mu, sigma, match_id, recorded_at
     FROM rating_history
     WHERE player_id = ANY($1::bigint[])
     ORDER BY recorded_at DESC
     LIMIT $2`,
    [ids, limit]
  );
  return result.rows.reverse();
}

async function getPlayerStreaks(seasonId = null) {
  const p = getPool();

  const nickRes = await p.query('SELECT account_id, nickname FROM nicknames');
  const nicknameToIds = {};
  for (const row of nickRes.rows) {
    const aid = row.account_id.toString();
    const nick = row.nickname.toLowerCase();
    if (!nicknameToIds[nick]) nicknameToIds[nick] = [];
    nicknameToIds[nick].push(aid);
  }
  const accountToCanonical = {};
  for (const ids of Object.values(nicknameToIds)) {
    if (ids.length < 2) continue;
    ids.sort();
    const canonical = ids[0];
    for (const id of ids) accountToCanonical[id] = canonical;
  }
  const getCanonical = (id) => accountToCanonical[id] || id;

  let whereClause = 'WHERE ps.account_id > 0';
  const params = [];
  if (seasonId === 'legacy') {
    whereClause += ' AND m.is_legacy = true';
  } else if (seasonId) {
    params.push(parseInt(seasonId));
    whereClause += ` AND m.season_id = $${params.length}`;
  } else {
    whereClause += ' AND m.is_legacy = false';
  }
  const result = await p.query(
    `SELECT ps.account_id::text as account_id, m.match_id, ps.team, m.radiant_win
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     ${whereClause}
     ORDER BY m.match_id DESC`,
    params
  );
  const byPlayer = {};
  for (const row of result.rows) {
    const cid = getCanonical(row.account_id);
    if (!byPlayer[cid]) byPlayer[cid] = [];
    if (byPlayer[cid].length < 30) byPlayer[cid].push(row);
  }
  const streaks = {};
  for (const [id, matches] of Object.entries(byPlayer)) {
    let streak = 0;
    for (const m of matches) {
      const won = (m.team === 'radiant' && m.radiant_win) || (m.team === 'dire' && !m.radiant_win);
      if (streak === 0) { streak = won ? 1 : -1; }
      else if (streak > 0 && won) streak++;
      else if (streak < 0 && !won) streak--;
      else break;
    }
    streaks[id] = streak;
  }
  return streaks;
}

async function getHeadToHead(playerA, playerB, seasonId = null) {
  const p = getPool();
  const params = [parseInt(playerA), parseInt(playerB)];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
  const result = await p.query(
    `SELECT
       m.match_id, m.date, m.radiant_win, m.duration,
       a.team as a_team, a.kills as a_kills, a.deaths as a_deaths,
       a.assists as a_assists, a.gpm as a_gpm, a.hero_name as a_hero, a.hero_id as a_hero_id,
       b.kills as b_kills, b.deaths as b_deaths, b.assists as b_assists,
       b.gpm as b_gpm, b.hero_name as b_hero, b.hero_id as b_hero_id
     FROM player_stats a
     JOIN player_stats b ON b.match_id = a.match_id AND b.account_id = $2 AND b.team != a.team
     JOIN matches m ON m.match_id = a.match_id
     WHERE a.account_id = $1${sc}
     ORDER BY m.date DESC`,
    params
  );
  const matches = result.rows;
  const aWins = matches.filter(m =>
    (m.a_team === 'radiant' && m.radiant_win) || (m.a_team === 'dire' && !m.radiant_win)
  ).length;
  return {
    total: matches.length,
    a_wins: aWins,
    b_wins: matches.length - aWins,
    matches,
  };
}

async function getPlayerComparison(playerA, playerB, seasonId = null) {
  const p = getPool();
  async function fetchStats(accountId) {
    const params = [parseInt(accountId)];
    const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
    const r = await p.query(
      `SELECT
         COUNT(*) as games,
         SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win=true) OR (ps.team='dire' AND m.radiant_win=false) THEN 1 ELSE 0 END) as wins,
         AVG(ps.kills) as avg_kills, AVG(ps.deaths) as avg_deaths, AVG(ps.assists) as avg_assists,
         AVG(ps.gpm) as avg_gpm, AVG(ps.xpm) as avg_xpm,
         AVG(ps.hero_damage) as avg_hero_damage, AVG(ps.damage_taken) as avg_damage_taken,
         AVG(ps.camps_stacked) as avg_camps_stacked,
         COUNT(DISTINCT ps.hero_id) as unique_heroes
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = $1${sc}`,
      params
    );
    const rr = await p.query(`SELECT * FROM ratings WHERE player_id = $1`, [parseInt(accountId)]);
    const nn = await p.query(`SELECT nickname FROM nicknames WHERE account_id = $1`, [parseInt(accountId)]);
    const row = r.rows[0] || {};
    const rating = rr.rows[0] || {};
    return {
      account_id: accountId,
      display_name: nn.rows[0]?.nickname || rating.display_name || `Player ${accountId}`,
      mmr: rating.mmr || 0,
      games: parseInt(row.games) || 0,
      wins: parseInt(row.wins) || 0,
      avg_kills: parseFloat(row.avg_kills) || 0,
      avg_deaths: parseFloat(row.avg_deaths) || 0,
      avg_assists: parseFloat(row.avg_assists) || 0,
      avg_gpm: parseFloat(row.avg_gpm) || 0,
      avg_xpm: parseFloat(row.avg_xpm) || 0,
      avg_hero_damage: parseFloat(row.avg_hero_damage) || 0,
      avg_damage_taken: parseFloat(row.avg_damage_taken) || 0,
      avg_camps_stacked: parseFloat(row.avg_camps_stacked) || 0,
      unique_heroes: parseInt(row.unique_heroes) || 0,
    };
  }
  const [a, b] = await Promise.all([fetchStats(playerA), fetchStats(playerB)]);
  return { a, b };
}

const { ACHIEVEMENTS_CATALOGUE } = require('../data/achievements');

/**
 * Queries all aggregate stats required by the achievement catalogue check functions.
 * Returns a flat stats object.  Heavy but idempotent — only called by the grant engine.
 */
async function _getPlayerAggregateStats(accountIds) {
  const p = getPool();
  const pid = Array.isArray(accountIds) ? accountIds.map(Number) : [Number(accountIds)];

  const [gamesRes, heroesRes, captainRes, positionsRes, gameHistoryRes] = await Promise.all([
    p.query(
      `SELECT COUNT(*) as games,
              SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN ps.deaths = 0 AND ((ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win)) THEN 1 ELSE 0 END) as deathless_wins
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT COUNT(DISTINCT ps.hero_id) as unique_heroes,
              MAX(cnt) as max_on_one_hero
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id,
       LATERAL (SELECT COUNT(*) as cnt FROM player_stats ps2
                JOIN matches m2 ON m2.match_id = ps2.match_id
                WHERE ps2.account_id = ANY($1::bigint[]) AND ps2.hero_id = ps.hero_id AND m2.is_legacy = false) sub
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT COUNT(*) as captain_games FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND ps.is_captain = true AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT COUNT(DISTINCT ps.position) as positions_played,
              COUNT(*) FILTER (WHERE ps.position = 1) as carry_games,
              COUNT(*) FILTER (WHERE ps.position IN (4,5)) as support_games
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND ps.position > 0 AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT ps.team, ps.firstblood_claimed, m.radiant_win, m.date FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false ORDER BY m.date ASC`,
      [pid]
    ),
  ]);

  const games = parseInt(gamesRes.rows[0]?.games) || 0;
  const totalWins = parseInt(gamesRes.rows[0]?.wins) || 0;
  const deathlessWins = parseInt(gamesRes.rows[0]?.deathless_wins) || 0;
  const uniqueHeroes = parseInt(heroesRes.rows[0]?.unique_heroes) || 0;
  const maxOnOneHero = parseInt(heroesRes.rows[0]?.max_on_one_hero) || 0;
  const captainGames = parseInt(captainRes.rows[0]?.captain_games) || 0;
  const positionsPlayed = parseInt(positionsRes.rows[0]?.positions_played) || 0;
  const carryGames = parseInt(positionsRes.rows[0]?.carry_games) || 0;
  const supportGames = parseInt(positionsRes.rows[0]?.support_games) || 0;
  const winRate = games >= 20 ? totalWins / games : 0;

  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  let maxConsecFb = 0, curConsecFb = 0;
  for (const r of gameHistoryRes.rows) {
    const won = (r.team === 'radiant' && r.radiant_win) || (r.team === 'dire' && !r.radiant_win);
    if (won) { curWin++; curLoss = 0; } else { curLoss++; curWin = 0; }
    if (curWin > maxWinStreak) maxWinStreak = curWin;
    if (curLoss > maxLossStreak) maxLossStreak = curLoss;
    const gotFb = parseInt(r.firstblood_claimed) > 0;
    if (gotFb) { curConsecFb++; } else { curConsecFb = 0; }
    if (curConsecFb > maxConsecFb) maxConsecFb = curConsecFb;
  }

  const [mkRes, fbRes, wardRes, singleGameRes, totalsRes, kdaRes, healRes, towerRes,
         heroWrRes, heroMasteryWinsRes, mvpRecvRes, mvpSentRes, attitudeRes, secretRes] = await Promise.all([
    p.query(
      `SELECT SUM(rampages) AS rampages, SUM(ultra_kills) AS ultra_kills,
              SUM(triple_kills) AS triple_kills, SUM(double_kills) AS double_kills,
              MAX(kills) AS max_kills
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT SUM(firstblood_claimed) AS fbs FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT SUM(obs_placed + sen_placed) AS wards_placed, SUM(wards_killed) AS wards_killed
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT MAX(hero_damage) AS max_damage, MAX(gpm) AS max_gpm, MAX(hero_healing) AS max_healing,
              MAX(tower_damage) AS max_tower_damage, MAX(last_hits) AS max_last_hits,
              SUM(courier_kills) AS total_courier_kills
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT SUM(kills) AS total_kills, SUM(assists) AS total_assists, SUM(last_hits) AS total_lh
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT AVG(CASE WHEN deaths > 0 THEN (kills + assists)::float / deaths ELSE kills + assists END) AS avg_kda
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT SUM(hero_healing) AS total_healing, MAX(hero_healing) AS max_healing
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT SUM(tower_damage) AS total_tower_damage
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT ps.hero_id, COUNT(*) AS hero_games,
              SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) AS hero_wins
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false AND ps.hero_id > 0
       GROUP BY ps.hero_id
       HAVING COUNT(*) >= 10`,
      [pid]
    ),
    p.query(
      `SELECT MAX(hero_wins) AS max_hero_wins FROM (
         SELECT SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) AS hero_wins
         FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
         WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false AND ps.hero_id > 0
         GROUP BY ps.hero_id
       ) sub`,
      [pid]
    ).catch(() => ({ rows: [{ max_hero_wins: 0 }] })),
    // Count matches where the player received the MOST mvp votes (i.e. actually won MVP)
    p.query(
      `WITH per_match_winner AS (
         SELECT match_id, rated_account_id AS winner_id
         FROM (
           SELECT match_id, rated_account_id,
                  RANK() OVER (PARTITION BY match_id ORDER BY COUNT(*) DESC, rated_account_id ASC) AS rk
           FROM match_ratings
           WHERE is_mvp_vote = TRUE AND rated_account_id IS NOT NULL
           GROUP BY match_id, rated_account_id
         ) sub
         WHERE rk = 1
       )
       SELECT COUNT(*) AS mvp_wins
       FROM per_match_winner
       WHERE winner_id = ANY($1::bigint[])`,
      [pid]
    ).catch(() => ({ rows: [{ mvp_wins: 0 }] })),
    p.query(
      `SELECT COUNT(*) AS votes_sent FROM match_ratings
       WHERE is_mvp_vote = TRUE AND rater_account_id = ANY($1::bigint[])`,
      [pid]
    ).catch(() => ({ rows: [{ votes_sent: 0 }] })),
    p.query(
      `SELECT ROUND(AVG(attitude_score) FILTER (WHERE attitude_score IS NOT NULL), 2) AS avg_attitude,
              COUNT(attitude_score) FILTER (WHERE attitude_score IS NOT NULL) AS attitude_count
       FROM match_ratings WHERE rated_account_id = ANY($1::bigint[])`,
      [pid]
    ).catch(() => ({ rows: [{ avg_attitude: null, attitude_count: 0 }] })),
    p.query(
      `SELECT
         MAX(CASE WHEN kills=0 AND deaths=0 AND assists>=10 AND ((ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win)) THEN 1 ELSE 0 END) AS has_perfect_support,
         MAX(CASE WHEN m.duration < 1500 AND ((ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win)) THEN 1 ELSE 0 END) AS has_early_bird,
         MAX(CASE WHEN m.duration > 4200 AND ((ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win)) THEN 1 ELSE 0 END) AS has_marathon,
         MAX(CASE WHEN kills >= 20 AND deaths = 0 THEN 1 ELSE 0 END) AS has_ghost_rampage,
         MAX(CASE WHEN ps.position IN (4,5) AND kills > deaths AND kills >= 5 THEN 1 ELSE 0 END) AS has_support_carry
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ).catch(() => ({ rows: [{}] })),
  ]);

  let bestHeroWr = 0;
  for (const r of heroWrRes.rows) {
    const wr = parseInt(r.hero_wins) / parseInt(r.hero_games);
    if (wr > bestHeroWr) bestHeroWr = wr;
  }

  const secRow = secretRes.rows[0] || {};
  return {
    games,
    totalWins,
    deathlessWins,
    uniqueHeroes,
    maxOnOneHero,
    captainGames,
    positionsPlayed,
    carryGames,
    supportGames,
    winRate,
    maxWinStreak,
    maxLossStreak,
    maxConsecFb,
    rampages:   parseInt(mkRes.rows[0]?.rampages) || 0,
    ultraKills: parseInt(mkRes.rows[0]?.ultra_kills) || 0,
    tripleKills:parseInt(mkRes.rows[0]?.triple_kills) || 0,
    doubleKills:parseInt(mkRes.rows[0]?.double_kills) || 0,
    maxKills:   parseInt(mkRes.rows[0]?.max_kills) || 0,
    firstBloods:parseInt(fbRes.rows[0]?.fbs) || 0,
    wardsPlaced:parseInt(wardRes.rows[0]?.wards_placed) || 0,
    wardsKilled:parseInt(wardRes.rows[0]?.wards_killed) || 0,
    maxDamage:      parseInt(singleGameRes.rows[0]?.max_damage) || 0,
    maxGpm:         parseInt(singleGameRes.rows[0]?.max_gpm) || 0,
    maxHealing:     parseInt(singleGameRes.rows[0]?.max_healing) || 0,
    maxTowerDamage: parseInt(singleGameRes.rows[0]?.max_tower_damage) || 0,
    maxLastHits:    parseInt(singleGameRes.rows[0]?.max_last_hits) || 0,
    totalCourierKills: parseInt(singleGameRes.rows[0]?.total_courier_kills) || 0,
    totalKills:   parseInt(totalsRes.rows[0]?.total_kills) || 0,
    totalAssists: parseInt(totalsRes.rows[0]?.total_assists) || 0,
    totalLh:      parseInt(totalsRes.rows[0]?.total_lh) || 0,
    avgKda:       parseFloat(kdaRes.rows[0]?.avg_kda) || 0,
    totalHealing:     parseInt(healRes.rows[0]?.total_healing) || 0,
    totalTowerDamage: parseInt(towerRes.rows[0]?.total_tower_damage) || 0,
    bestHeroWr,
    maxHeroWins: parseInt(heroMasteryWinsRes.rows[0]?.max_hero_wins) || 0,
    mvpWins:       parseInt(mvpRecvRes.rows[0]?.mvp_wins) || 0,
    votesSent:     parseInt(mvpSentRes.rows[0]?.votes_sent) || 0,
    avgAttitude:   parseFloat(attitudeRes.rows[0]?.avg_attitude) || 0,
    attitudeCount: parseInt(attitudeRes.rows[0]?.attitude_count) || 0,
    hasPerfectSupport: parseInt(secRow.has_perfect_support) > 0,
    hasEarlyBird:      parseInt(secRow.has_early_bird) > 0,
    hasMarathon:       parseInt(secRow.has_marathon) > 0,
    hasGhostRampage:   parseInt(secRow.has_ghost_rampage) > 0,
    hasSupportCarry:   parseInt(secRow.has_support_carry) > 0,
    referrals: await (async () => {
      try {
        const r = await p.query(
          `SELECT COUNT(DISTINCT source) AS cnt FROM season_pass_xp_events
           WHERE account_id = ANY($1::bigint[]) AND source LIKE 'referral_%'`,
          [pid]
        );
        return parseInt(r.rows[0]?.cnt) || 0;
      } catch (_) { return 0; }
    })(),
  };
}

/**
 * Returns the full achievement list for a player, with earned/unlock_date
 * derived from the persisted `achievements` table rows.
 * Secret achievements reveal their real label/desc once earned.
 */
async function getPlayerAchievements(accountId) {
  const p = getPool();
  const pid = Array.isArray(accountId) ? accountId.map(Number) : [parseInt(accountId)];

  let earnedMap = {};
  try {
    const rows = await p.query(
      `SELECT achievement_key, achieved_at FROM achievements WHERE player_id = ANY($1::bigint[])`,
      [pid]
    );
    for (const r of rows.rows) earnedMap[r.achievement_key] = r.achieved_at;
  } catch (_) {}

  return ACHIEVEMENTS_CATALOGUE.map(a => {
    const earned = Object.prototype.hasOwnProperty.call(earnedMap, a.key);
    return {
      key: a.key,
      label: (a.secret && !earned) ? '???' : a.label,
      desc:  (a.secret && !earned) ? 'Secret achievement' : a.desc,
      icon:  a.icon,
      group: a.group,
      secret: a.secret,
      earned,
      achieved_at: earnedMap[a.key] || null,
    };
  });
}

async function checkAndGrantAchievements(accountIds, matchId) {
  const p = getPool();
  const pid = Array.isArray(accountIds) ? accountIds.map(Number) : [Number(accountIds)];
  if (!pid.length || pid[0] === 0) return [];
  const primaryId = pid[0];

  try {
    const [existingRes, stats] = await Promise.all([
      p.query(
        `SELECT achievement_key FROM achievements WHERE player_id = ANY($1::bigint[])`,
        [pid]
      ),
      _getPlayerAggregateStats(pid),
    ]);
    const existingKeys = new Set(existingRes.rows.map(r => r.achievement_key));

    const newlyEarned = [];
    for (const entry of ACHIEVEMENTS_CATALOGUE) {
      if (existingKeys.has(entry.key)) continue;
      let qualifies = false;
      try { qualifies = entry.check(stats); } catch (_) {}
      if (!qualifies) continue;

      await p.query(
        `INSERT INTO achievements (player_id, achievement_key, achieved_at, match_id)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (player_id, achievement_key) DO NOTHING`,
        [primaryId, entry.key, matchId || null]
      );
      newlyEarned.push({ ...entry, achieved_at: new Date().toISOString(), earned: true });
    }
    return newlyEarned;
  } catch (err) {
    console.warn(`[Achievements] checkAndGrant failed for player ${primaryId}: ${err.message}`);
    return [];
  }
}

async function getAchievementLeaderboard(limit = 10) {
  const p = getPool();
  try {
    const result = await p.query(
      `SELECT
         a.player_id,
         COALESCE(n.nickname, ps_name.persona_name, a.player_id::text) AS display_name,
         COUNT(*) AS achievement_count
       FROM achievements a
       LEFT JOIN nicknames n ON n.account_id = a.player_id
       LEFT JOIN LATERAL (
         SELECT persona_name FROM player_stats
         WHERE account_id = a.player_id
         ORDER BY match_id DESC LIMIT 1
       ) ps_name ON TRUE
       GROUP BY a.player_id, n.nickname, ps_name.persona_name
       ORDER BY achievement_count DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (err) {
    console.warn(`[Achievements] getLeaderboard failed: ${err.message}`);
    return [];
  }
}

async function getReferralLeaderboard(limit = 10) {
  const p = getPool();
  try {
    const result = await p.query(
      `SELECT
         ref.account_id_32 AS account_id,
         COALESCE(NULLIF(n.nickname, ''), NULLIF(ps_name.persona_name, ''), NULLIF(ref.discord_name, ''), ref.account_id_32::text) AS display_name,
         COUNT(referred.account_id_32) AS referral_count
       FROM players ref
       JOIN players referred ON referred.referred_by = ref.account_id_32::bigint
       LEFT JOIN nicknames n ON n.account_id = ref.account_id_32::bigint
       LEFT JOIN LATERAL (
         SELECT persona_name FROM player_stats
         WHERE account_id = ref.account_id_32::bigint
         ORDER BY match_id DESC LIMIT 1
       ) ps_name ON TRUE
       GROUP BY ref.account_id_32, ref.discord_name, n.nickname, ps_name.persona_name
       HAVING COUNT(referred.account_id_32) > 0
       ORDER BY referral_count DESC, display_name ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (err) {
    console.warn(`[DB] getReferralLeaderboard failed: ${err.message}`);
    return [];
  }
}

async function recomputeAllAchievements() {
  const p = getPool();
  const players = await p.query(
    `SELECT DISTINCT account_id FROM player_stats WHERE account_id > 0`
  );
  let granted = 0;
  let processed = 0;
  for (const row of players.rows) {
    try {
      const ids = [parseInt(row.account_id)];
      const newOnes = await checkAndGrantAchievements(ids, null);
      granted += newOnes.length;
      processed++;
    } catch (e) {
      console.warn(`[Achievements] recompute failed for ${row.account_id}: ${e.message}`);
    }
  }
  console.log(`[Achievements] Recompute complete: ${processed} players, ${granted} new achievements granted`);
  return { players: processed, granted };
}

async function getPredictions(seasonId) {
  const p = getPool();
  const result = await p.query(
    `SELECT predictor_name, predictions, created_at FROM season_predictions WHERE season_id = $1 ORDER BY created_at ASC`,
    [parseInt(seasonId)]
  );
  return result.rows;
}

async function savePrediction(seasonId, predictorName, predictions) {
  const p = getPool();
  await p.query(
    `INSERT INTO season_predictions (season_id, predictor_name, predictions)
     VALUES ($1, $2, $3)
     ON CONFLICT (season_id, predictor_name) DO UPDATE SET predictions = $3`,
    [parseInt(seasonId), predictorName, JSON.stringify(predictions)]
  );
}

async function getPlayerByDiscordId(discordId) {
  const p = getPool();
  const result = await p.query('SELECT * FROM players WHERE discord_id = $1 LIMIT 1', [discordId]);
  return result.rows[0] || null;
}

async function getPatchNotes() {
  const p = getPool();
  // Sort by version numerically (major DESC, minor DESC) so versions with the
  // same published_at date are always in the correct order (e.g. 4.1 > 3.3 > 3.2).
  const res = await p.query(`
    SELECT * FROM patch_notes
    ORDER BY
      split_part(version, '.', 1)::int DESC,
      split_part(version, '.', 2)::int DESC
  `);
  return res.rows;
}

async function getPatchNote(id) {
  const p = getPool();
  const res = await p.query(`SELECT * FROM patch_notes WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function createPatchNote({ version, title, content, author }) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO patch_notes (version, title, content, author) VALUES ($1, $2, $3, $4) RETURNING *`,
    [version, title, content, author || null]
  );
  return res.rows[0];
}

async function updatePatchNote(id, { version, title, content, author }) {
  const p = getPool();
  const res = await p.query(
    `UPDATE patch_notes SET version=$1, title=$2, content=$3, author=$4 WHERE id=$5 RETURNING *`,
    [version, title, content, author || null, id]
  );
  return res.rows[0] || null;
}

async function deletePatchNote(id) {
  const p = getPool();
  await p.query(`DELETE FROM patch_notes WHERE id = $1`, [id]);
}

async function seedPatchNotes(notes) {
  const p = getPool();

  // Guard: ensure seed array is in strictly ascending version order.
  // Versions are dotted numeric strings ("major.minor" or "major.minor.patch")
  // — compare numerically, padding to 3 components so e.g. 5.74.1 sorts strictly
  // after 5.74 and strictly before 5.74.2 instead of being treated as equal.
  const parseVer = v => {
    const [maj = 0, min = 0, patch = 0] = String(v).split('.').map(Number);
    return maj * 1_000_000 + min * 1000 + patch;
  };
  for (let i = 1; i < notes.length; i++) {
    const aNum = parseVer(notes[i - 1].version);
    const bNum = parseVer(notes[i].version);
    if (bNum <= aNum) {
      throw new Error(
        `[DB] patchNotes.js is out of order: v${notes[i - 1].version} appears before v${notes[i].version}. ` +
        `Fix the order in src/data/patchNotes.js before starting the bot.`
      );
    }
  }

  // Upsert by version — preserves user-created notes and sets correct historical dates.
  // New rows get announced_at = NULL so the Discord bot can detect and announce them.
  // ON CONFLICT (existing row): update title/content/author/published_at but DON'T
  // touch announced_at — that would re-announce already-posted notes.
  for (const note of notes) {
    await p.query(`
      INSERT INTO patch_notes (version, title, content, author, published_at, announced_at)
      VALUES ($1, $2, $3, $4, $5, NULL)
      ON CONFLICT (version) DO UPDATE SET
        title        = EXCLUDED.title,
        content      = EXCLUDED.content,
        author       = EXCLUDED.author,
        published_at = EXCLUDED.published_at
      WHERE patch_notes.author = 'System'
    `, [note.version, note.title, note.content, note.author || 'System', note.published_at]);
  }
  console.log(`[DB] Patch notes seeded/updated (${notes.length} entries).`);
}

async function getUnannouncedPatchNotes() {
  const p = getPool();
  const res = await p.query(
    `SELECT * FROM patch_notes WHERE announced_at IS NULL ORDER BY published_at ASC`
  );
  return res.rows;
}

async function markPatchNoteAnnounced(id) {
  const p = getPool();
  await p.query(`UPDATE patch_notes SET announced_at = NOW() WHERE id = $1`, [id]);
}

async function getPlayerNemesis(accountId) {
  const p = getPool();
  // Aggregate the killed_by JSONB across all non-legacy matches for this player
  // Returns the top killer(s) by total kills
  const res = await p.query(`
    SELECT
      killer_key AS killer_account_id,
      SUM((killed_by -> killer_key)::int) AS total_kills,
      COALESCE(n.nickname, pl.persona_name) AS killer_name,
      pl.hero_name AS last_hero
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id AND m.is_legacy = false,
    LATERAL jsonb_object_keys(ps.killed_by) AS killer_key
    LEFT JOIN LATERAL (
      SELECT persona_name, hero_name
      FROM player_stats ps2
      JOIN matches m2 ON m2.match_id = ps2.match_id
      WHERE ps2.account_id::text = killer_key
      ORDER BY m2.date DESC LIMIT 1
    ) pl ON true
    LEFT JOIN nicknames n ON n.account_id::text = killer_key
    WHERE ps.account_id = $1
      AND (killed_by -> killer_key)::int > 0
    GROUP BY killer_key, n.nickname, pl.persona_name, pl.hero_name
    ORDER BY total_kills DESC
    LIMIT 3
  `, [accountId]);
  return res.rows;
}

async function getPlayerRecentResults(accountId, limit = 10) {
  const p = getPool();
  const res = await p.query(`
    SELECT (ps.team = 'radiant') = m.radiant_win AS won
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.account_id = $1 AND m.is_legacy = false
    ORDER BY m.match_id DESC
    LIMIT $2
  `, [accountId, limit]);
  return res.rows;
}

async function getPlayerCurrentStreak(accountIds) {
  const p = getPool();
  const ids = Array.isArray(accountIds) ? accountIds : [accountIds];
  const res = await p.query(`
    SELECT ps.team, m.radiant_win
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false
    ORDER BY m.match_id DESC
    LIMIT 15
  `, [ids]);

  if (!res.rows.length) return 0;

  const firstWon = (res.rows[0].team === 'radiant') === res.rows[0].radiant_win;
  let streak = 0;
  for (const row of res.rows) {
    const won = (row.team === 'radiant') === row.radiant_win;
    if (won === firstWon) streak++;
    else break;
  }
  return firstWon ? streak : -streak;
}

async function getFunRecapStats(seasonId = null, intervalDays = 7) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
  const timeFilter = ` AND m.date >= NOW() - INTERVAL '${intervalDays} days'`;
  const baseWhere = `WHERE 1=1${sc}${timeFilter}`;

  const playerSelect = `COALESCE(n.nickname, ps.persona_name) as name,
    ps.match_id, ps.kills, ps.deaths, ps.assists, ps.account_id`;
  const playerJoins = `FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0`;

  const [
    highKDA, mostKills, mostDeaths, highestGPM, bloodbath, fastGame, slowGame,
    mostWards, mostHealing, mostTowerDmg, mostStuns, mostStacks, rampage,
    deathless, bestKI, mostWardKills,
  ] = await Promise.all([
    // Best KDA single game
    p.query(`SELECT ${playerSelect}, ps.gpm,
      CASE WHEN ps.deaths > 0 THEN ROUND((ps.kills + ps.assists)::numeric / ps.deaths, 2) ELSE (ps.kills + ps.assists) END as kda
      ${playerJoins} ${baseWhere} ORDER BY kda DESC LIMIT 1`, params),

    // Most kills single game
    p.query(`SELECT ${playerSelect}, ps.hero_name ${playerJoins} ${baseWhere} ORDER BY ps.kills DESC LIMIT 1`, params),

    // Most deaths single game
    p.query(`SELECT ${playerSelect}, ps.hero_name ${playerJoins} ${baseWhere} ORDER BY ps.deaths DESC LIMIT 1`, params),

    // Highest GPM single game
    p.query(`SELECT ${playerSelect}, ps.gpm, ps.hero_name ${playerJoins} ${baseWhere} ORDER BY ps.gpm DESC LIMIT 1`, params),

    // Bloodbath match (most total kills)
    p.query(`SELECT m.match_id, SUM(ps.kills) as total_kills, m.duration
      FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
      ${baseWhere.replace('WHERE 1=1', 'WHERE 1=1')} GROUP BY m.match_id, m.duration ORDER BY total_kills DESC LIMIT 1`, params),

    // Fastest game
    p.query(`SELECT match_id, duration, lobby_name FROM matches m WHERE duration IS NOT NULL${sc}${timeFilter} ORDER BY duration ASC LIMIT 1`, params),

    // Longest game
    p.query(`SELECT match_id, duration, lobby_name FROM matches m WHERE duration IS NOT NULL${sc}${timeFilter} ORDER BY duration DESC LIMIT 1`, params),

    // Most wards placed (obs + sentry) — support highlight
    p.query(`SELECT ${playerSelect}, ps.obs_placed, ps.sen_placed, (ps.obs_placed + ps.sen_placed) as total_wards
      ${playerJoins} ${baseWhere} ORDER BY total_wards DESC LIMIT 1`, params),

    // Most healing — healer highlight
    p.query(`SELECT ${playerSelect}, ps.hero_healing, ps.hero_name
      ${playerJoins} ${baseWhere} AND ps.hero_healing > 0 ORDER BY ps.hero_healing DESC LIMIT 1`, params),

    // Most tower damage — pusher highlight
    p.query(`SELECT ${playerSelect}, ps.tower_damage, ps.hero_name
      ${playerJoins} ${baseWhere} AND ps.tower_damage > 0 ORDER BY ps.tower_damage DESC LIMIT 1`, params),

    // Highest stun duration — initiator highlight
    p.query(`SELECT ${playerSelect}, ps.stun_duration, ps.hero_name
      ${playerJoins} ${baseWhere} AND ps.stun_duration > 0 ORDER BY ps.stun_duration DESC LIMIT 1`, params),

    // Most camps stacked — support/offlane highlight
    p.query(`SELECT ${playerSelect}, ps.camps_stacked
      ${playerJoins} ${baseWhere} AND ps.camps_stacked > 0 ORDER BY ps.camps_stacked DESC LIMIT 1`, params),

    // Rampage — carry moment highlight
    p.query(`SELECT ${playerSelect}, ps.hero_name, ps.rampages
      ${playerJoins} ${baseWhere} AND ps.rampages > 0 ORDER BY ps.rampages DESC, ps.kills DESC LIMIT 1`, params),

    // Deathless performance (0 deaths, 5+ kill involvement)
    p.query(`SELECT ${playerSelect}, ps.hero_name, ps.gpm,
      (ps.kills + ps.assists) as involvement
      ${playerJoins} ${baseWhere} AND ps.deaths = 0 AND (ps.kills + ps.assists) >= 5
      ORDER BY involvement DESC LIMIT 1`, params),

    // Best kill involvement single game (excluding outliers with <3 team kills)
    p.query(`SELECT ps.account_id, COALESCE(n.nickname, ps.persona_name) as name, ps.match_id,
      ps.kills, ps.assists, ps.deaths, ps.hero_name,
      ROUND(((ps.kills + ps.assists)::numeric / NULLIF(tk.team_kills, 0)) * 100, 0) as ki_pct
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
      LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
      JOIN LATERAL (
        SELECT SUM(kills) as team_kills FROM player_stats ps2
        WHERE ps2.match_id = ps.match_id AND ps2.team = ps.team
      ) tk ON true
      ${baseWhere.replace('WHERE 1=1', 'WHERE tk.team_kills >= 3')} AND ps.kills + ps.assists >= 5
      ORDER BY ki_pct DESC LIMIT 1`, params),

    // Most wards killed — anti-support highlight
    p.query(`SELECT ${playerSelect}, ps.wards_killed
      ${playerJoins} ${baseWhere} AND ps.wards_killed > 0 ORDER BY ps.wards_killed DESC LIMIT 1`, params),
  ]);

  return {
    highKDA: highKDA.rows[0] || null,
    mostKills: mostKills.rows[0] || null,
    mostDeaths: mostDeaths.rows[0] || null,
    highestGPM: highestGPM.rows[0] || null,
    bloodbath: bloodbath.rows[0] || null,
    fastGame: fastGame.rows[0] || null,
    slowGame: slowGame.rows[0] || null,
    mostWards: mostWards.rows[0] || null,
    mostHealing: mostHealing.rows[0] || null,
    mostTowerDmg: mostTowerDmg.rows[0] || null,
    mostStuns: mostStuns.rows[0] || null,
    mostStacks: mostStacks.rows[0] || null,
    rampage: rampage.rows[0] || null,
    deathless: deathless.rows[0] || null,
    bestKI: bestKI.rows[0] || null,
    mostWardKills: mostWardKills.rows[0] || null,
  };
}

async function getWeeklyRecap(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
  const matchesRes = await p.query(
    `SELECT m.match_id, m.date, m.radiant_win, m.duration, m.lobby_name
     FROM matches m
     WHERE m.date >= NOW() - INTERVAL '7 days'${sc}
     ORDER BY m.date DESC`,
    params
  );
  const params2 = [];
  const sc2 = seasonId ? ` AND m.season_id = $${params2.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
  const topPerformersRes = await p.query(
    `SELECT
       COALESCE(n.nickname, ps.persona_name) as player_name,
       ps.account_id,
       AVG(ps.kills) as avg_kills,
       AVG(ps.gpm) as avg_gpm,
       AVG(CASE WHEN ps.deaths > 0 THEN (ps.kills + ps.assists)::float / ps.deaths ELSE ps.kills + ps.assists END) as avg_kda,
       COUNT(*) as games
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE m.date >= NOW() - INTERVAL '7 days'${sc2}
     GROUP BY COALESCE(n.nickname, ps.persona_name), ps.account_id
     HAVING COUNT(*) >= 2
     ORDER BY avg_kda DESC LIMIT 10`,
    params2
  );
  return {
    matches: matchesRes.rows,
    top_performers: topPerformersRes.rows,
    period: '7 days',
  };
}

async function getDraftSuggestions(allyHeroIds, enemyHeroIds, bannedHeroIds, position, seasonId = null) {
  const p = getPool();
  const excludeIds = [...allyHeroIds, ...enemyHeroIds, ...bannedHeroIds].filter(Boolean);
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const baseQuery = `
    SELECT ps.hero_id, COUNT(*) as games,
           SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) as wins
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.hero_id > 0${excludeIds.length ? ` AND ps.hero_id != ALL($${params.push(excludeIds)})` : ''}
    ${position ? ` AND ps.position = $${params.push(parseInt(position))}` : ''}
    ${sc}
    GROUP BY ps.hero_id
    HAVING COUNT(*) >= 1
  `;
  const baseRes = await p.query(baseQuery, params);

  let synergyBonus = {};
  if (allyHeroIds.length > 0) {
    const sp = [allyHeroIds];
    const ssc = seasonId ? ` AND m.season_id = $${sp.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
    const sRes = await p.query(
      `SELECT ps.hero_id,
              COUNT(*) as games,
              SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) as wins
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.hero_id > 0
         AND EXISTS (
           SELECT 1 FROM player_stats ps2
           WHERE ps2.match_id = ps.match_id AND ps2.team = ps.team AND ps2.hero_id = ANY($1)
         )${ssc}
       GROUP BY ps.hero_id HAVING COUNT(*) >= 1`,
      sp
    );
    for (const r of sRes.rows) {
      synergyBonus[r.hero_id] = parseInt(r.wins) / Math.max(parseInt(r.games), 1);
    }
  }

  let counterBonus = {};
  if (enemyHeroIds.length > 0) {
    const ep = [enemyHeroIds];
    const esc = seasonId ? ` AND m.season_id = $${ep.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
    const eRes = await p.query(
      `SELECT ps.hero_id,
              COUNT(*) as games,
              SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) as wins
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.hero_id > 0
         AND EXISTS (
           SELECT 1 FROM player_stats ps2
           WHERE ps2.match_id = ps.match_id AND ps2.team != ps.team AND ps2.hero_id = ANY($1)
         )${esc}
       GROUP BY ps.hero_id HAVING COUNT(*) >= 1`,
      ep
    );
    for (const r of eRes.rows) {
      counterBonus[r.hero_id] = parseInt(r.wins) / Math.max(parseInt(r.games), 1);
    }
  }

  return baseRes.rows.map(r => {
    const heroId = r.hero_id;
    const games = parseInt(r.games);
    const wins = parseInt(r.wins);
    const baseWr = games > 0 ? wins / games : 0.5;
    const syn = synergyBonus[heroId] ?? baseWr;
    const ctr = counterBonus[heroId] ?? baseWr;
    const score = (baseWr * 0.4) + (syn * 0.35) + (ctr * 0.25);
    return { hero_id: heroId, games, wins, base_wr: baseWr, synergy_wr: syn, counter_wr: ctr, score };
  }).sort((a, b) => b.score - a.score).slice(0, 30);
}

async function getHomeStats(seasonId = null) {
  const p = getPool();

  // Inline season condition without parameterized queries (safe — seasonId is validated as integer or null/string)
  let matchSc; // condition for the matches table (no alias)
  let matchScM; // condition with m. alias
  if (!seasonId) { matchSc = 'is_legacy = false'; matchScM = 'm.is_legacy = false'; }
  else if (seasonId === 'legacy') { matchSc = 'is_legacy = true'; matchScM = 'm.is_legacy = true'; }
  else { const id = parseInt(seasonId); matchSc = `season_id = ${id}`; matchScM = `m.season_id = ${id}`; }

  const [totals, recentMatches] = await Promise.all([
    p.query(`
      SELECT
        (SELECT COUNT(*) FROM matches WHERE ${matchSc})::int AS total_matches,
        (SELECT COUNT(DISTINCT ps.account_id) FROM player_stats ps
          JOIN matches m ON m.match_id = ps.match_id
          WHERE ${matchScM} AND ps.account_id != 0)::int AS total_players,
        (SELECT COUNT(*) FROM matches WHERE ${matchSc} AND date >= NOW() - INTERVAL '7 days')::int AS matches_this_week,
        (SELECT ps2.hero_name FROM player_stats ps2
          JOIN matches m2 ON m2.match_id = ps2.match_id
          WHERE ${matchScM.replace('m.', 'm2.')} AND ps2.hero_name IS NOT NULL
          GROUP BY ps2.hero_name ORDER BY COUNT(*) DESC LIMIT 1) AS most_played_hero
    `),
    p.query(`
      SELECT
        m.match_id, m.date, m.radiant_win, m.duration, m.lobby_name,
        (SELECT SUM(ps2.kills) FROM player_stats ps2 WHERE ps2.match_id = m.match_id)::int AS total_kills,
        (SELECT COALESCE(SUM(psr.kills), 0) FROM player_stats psr
          WHERE psr.match_id = m.match_id AND psr.team = 'radiant')::int AS radiant_score,
        (SELECT COALESCE(SUM(psd.kills), 0) FROM player_stats psd
          WHERE psd.match_id = m.match_id AND psd.team = 'dire')::int AS dire_score,
        (SELECT ps3.persona_name FROM player_stats ps3
          WHERE ps3.match_id = m.match_id AND ps3.kills IS NOT NULL
          ORDER BY ps3.kills DESC LIMIT 1) AS top_killer,
        (SELECT ps4.kills FROM player_stats ps4
          WHERE ps4.match_id = m.match_id AND ps4.kills IS NOT NULL
          ORDER BY ps4.kills DESC LIMIT 1)::int AS top_kills,
        (SELECT ps5.hero_name FROM player_stats ps5
          WHERE ps5.match_id = m.match_id AND ps5.kills IS NOT NULL
          ORDER BY ps5.kills DESC LIMIT 1) AS top_killer_hero
      FROM matches m
      WHERE ${matchScM}
      ORDER BY m.date DESC
      LIMIT 5
    `),
  ]);
  return {
    totals: totals.rows[0] || {},
    recentMatches: recentMatches.rows,
  };
}

async function saveWeeklyRecap({ matchesCount, aiBlurb, topPerformers, funHighlights, periodStart, periodEnd }) {
  const p = getPool();
  await p.query(`
    INSERT INTO weekly_recaps (matches_count, ai_blurb, top_performers, fun_highlights, period_start, period_end)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [matchesCount, aiBlurb, JSON.stringify(topPerformers), JSON.stringify(funHighlights), periodStart, periodEnd]);
}

async function getLatestWeeklyRecap() {
  const p = getPool();
  const res = await p.query(`
    SELECT * FROM weekly_recaps ORDER BY generated_at DESC LIMIT 1
  `);
  return res.rows[0] || null;
}

async function findDuplicateMatches() {
  const p = getPool();
  const result = await p.query(`
    WITH match_fingerprints AS (
      SELECT
        ps.match_id,
        STRING_AGG(ps.hero_id::text, ',' ORDER BY ps.hero_id)          AS hero_fingerprint,
        STRING_AGG(
          COALESCE(ps.account_id::text, 'anon_' || ps.persona_name),
          ',' ORDER BY COALESCE(ps.account_id::text, 'anon_' || ps.persona_name)
        )                                                               AS player_fingerprint,
        SUM(ps.kills)                                                   AS total_kills,
        SUM(ps.deaths)                                                  AS total_deaths,
        SUM(ps.assists)                                                 AS total_assists,
        SUM(ps.net_worth)                                               AS total_net_worth,
        COUNT(*)                                                        AS player_count
      FROM player_stats ps
      WHERE ps.hero_id > 0
      GROUP BY ps.match_id
      HAVING COUNT(*) >= 8
    ),
    match_info AS (
      SELECT
        m.match_id,
        m.date,
        m.radiant_win,
        m.duration,
        m.lobby_name,
        mf.hero_fingerprint,
        mf.player_fingerprint,
        mf.total_kills,
        mf.total_deaths,
        mf.total_assists,
        mf.total_net_worth
      FROM matches m
      JOIN match_fingerprints mf ON m.match_id = mf.match_id
    )
    SELECT
      a.match_id           AS match_id_1,
      b.match_id           AS match_id_2,
      a.date               AS date_1,
      b.date               AS date_2,
      a.radiant_win,
      a.duration           AS duration_1,
      b.duration           AS duration_2,
      a.total_kills        AS kills_1,
      b.total_kills        AS kills_2,
      a.total_deaths       AS deaths_1,
      b.total_deaths       AS deaths_2,
      a.total_net_worth    AS nw_1,
      b.total_net_worth    AS nw_2,
      ABS(a.duration - b.duration)                          AS duration_diff,
      ABS(EXTRACT(EPOCH FROM (a.date - b.date)))            AS date_diff_seconds,
      (a.hero_fingerprint = b.hero_fingerprint)             AS same_heroes,
      (a.player_fingerprint = b.player_fingerprint)         AS same_players,
      (a.total_kills = b.total_kills AND
       a.total_deaths = b.total_deaths AND
       a.total_assists = b.total_assists)                   AS same_totals,
      (a.total_net_worth = b.total_net_worth)               AS same_nw
    FROM match_info a
    JOIN match_info b
      ON a.match_id < b.match_id
     AND a.radiant_win = b.radiant_win
     AND a.hero_fingerprint = b.hero_fingerprint
    ORDER BY
      (a.player_fingerprint = b.player_fingerprint) DESC,
      ABS(a.duration - b.duration) ASC,
      a.match_id, b.match_id
  `);
  return result.rows;
}

async function getMultiKillStats(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(`
    SELECT
      ps.account_id,
      COALESCE(n.nickname, MAX(ps.persona_name)) AS display_name,
      SUM(ps.double_kills)  AS double_kills,
      SUM(ps.triple_kills)  AS triple_kills,
      SUM(ps.ultra_kills)   AS ultra_kills,
      SUM(ps.rampages)      AS rampages,
      COUNT(ps.match_id)    AS games_played,
      SUM(ps.double_kills + ps.triple_kills + ps.ultra_kills + ps.rampages) AS total_multikills
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    LEFT JOIN nicknames n ON n.account_id = ps.account_id
    WHERE ps.account_id > 0${sc}
    GROUP BY ps.account_id, n.nickname
    HAVING SUM(ps.double_kills + ps.triple_kills + ps.ultra_kills + ps.rampages) > 0
    ORDER BY rampages DESC, ultra_kills DESC, triple_kills DESC, double_kills DESC
  `, params);
  return result.rows;
}

async function getMostImproved(days = 30, seasonId = null) {
  const p = getPool();
  let result;
  if (seasonId) {
    result = await p.query(`
      WITH season_matches AS (
        SELECT match_id FROM matches WHERE season_id = $1
      ),
      latest AS (
        SELECT DISTINCT ON (rh.player_id) rh.player_id, rh.mu, rh.sigma, rh.recorded_at
        FROM rating_history rh
        WHERE rh.match_id IN (SELECT match_id FROM season_matches)
        ORDER BY rh.player_id, rh.recorded_at DESC
      ),
      earliest AS (
        SELECT DISTINCT ON (rh.player_id) rh.player_id, rh.mu, rh.sigma, rh.recorded_at
        FROM rating_history rh
        WHERE rh.match_id IN (SELECT match_id FROM season_matches)
        ORDER BY rh.player_id, rh.recorded_at ASC
      )
      SELECT
        l.player_id AS account_id,
        COALESCE(n.nickname, MAX(ps.persona_name)) AS display_name,
        ROUND((l.mu - 3*l.sigma)*100 + 5000) AS current_mmr,
        ROUND((e.mu - 3*e.sigma)*100 + 5000) AS start_mmr,
        ROUND(((l.mu - 3*l.sigma) - (e.mu - 3*e.sigma))*100) AS mmr_delta,
        COUNT(ps.match_id) AS games_in_period
      FROM latest l
      JOIN earliest e ON e.player_id = l.player_id
      LEFT JOIN nicknames n ON n.account_id = l.player_id
      LEFT JOIN player_stats ps ON ps.account_id = l.player_id
      LEFT JOIN matches m ON m.match_id = ps.match_id AND m.season_id = $1
      GROUP BY l.player_id, l.mu, l.sigma, e.mu, e.sigma, n.nickname
      HAVING ROUND(((l.mu - 3*l.sigma) - (e.mu - 3*e.sigma))*100) > 0
      ORDER BY mmr_delta DESC
      LIMIT 10`, [seasonId]);
  } else {
  const daysInt = parseInt(days) || 30;
  result = await p.query(`
    WITH latest AS (
      SELECT DISTINCT ON (player_id) player_id, mu, sigma, recorded_at
      FROM rating_history
      ORDER BY player_id, recorded_at DESC
    ),
    earliest AS (
      SELECT DISTINCT ON (player_id) player_id, mu, sigma, recorded_at
      FROM rating_history
      WHERE recorded_at >= NOW() - INTERVAL '1 day' * $1
      ORDER BY player_id, recorded_at ASC
    )
    SELECT
      l.player_id AS account_id,
      COALESCE(n.nickname, MAX(ps.persona_name)) AS display_name,
      ROUND((l.mu - 3*l.sigma)*100 + 5000) AS current_mmr,
      ROUND((e.mu - 3*e.sigma)*100 + 5000) AS start_mmr,
      ROUND(((l.mu - 3*l.sigma) - (e.mu - 3*e.sigma))*100) AS mmr_delta,
      COUNT(ps.match_id) AS games_in_period
    FROM latest l
    JOIN earliest e ON e.player_id = l.player_id
    LEFT JOIN nicknames n ON n.account_id = l.player_id
    LEFT JOIN player_stats ps ON ps.account_id = l.player_id
    LEFT JOIN matches m ON m.match_id = ps.match_id AND m.date >= NOW() - INTERVAL '1 day' * $1
    GROUP BY l.player_id, l.mu, l.sigma, e.mu, e.sigma, n.nickname
    HAVING ROUND(((l.mu - 3*l.sigma) - (e.mu - 3*e.sigma))*100) > 0
    ORDER BY mmr_delta DESC
    LIMIT 10
  `, [daysInt]);
  }
  return result.rows;
}

async function getHeroMetaByPosition(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(`
    SELECT
      ps.hero_id,
      ps.hero_name,
      ps.position,
      COUNT(*) AS games,
      SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) AS wins,
      ROUND(
        100.0 * SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0)
      , 1) AS win_rate
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.hero_id > 0 AND ps.position BETWEEN 1 AND 5 AND m.is_legacy = false${sc}
    GROUP BY ps.hero_id, ps.hero_name, ps.position
    HAVING COUNT(*) >= 2
    ORDER BY ps.position ASC, games DESC
  `, params);
  return result.rows;
}

async function getMatchPredictions(matchId) {
  const p = getPool();
  const result = await p.query(
    `SELECT predictor_account_id, predictor_name, predicted_winner, resolved, correct, created_at
     FROM match_predictions WHERE match_id = $1 ORDER BY created_at ASC`,
    [parseInt(matchId)]
  );
  return result.rows;
}

async function upsertMatchPrediction(matchId, predictorAccountId, predictorName, predictedWinner) {
  const p = getPool();
  const result = await p.query(
    `INSERT INTO match_predictions (match_id, predictor_account_id, predictor_name, predicted_winner)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (match_id, predictor_account_id) DO UPDATE
       SET predicted_winner = $4, resolved = false, correct = null
     RETURNING *`,
    [parseInt(matchId), predictorAccountId ? parseInt(predictorAccountId) : null, predictorName, predictedWinner]
  );
  return result.rows[0];
}

async function resolveMatchPredictions(matchId, winnerTeam) {
  const p = getPool();
  await p.query(
    `UPDATE match_predictions
     SET resolved = true,
         correct = CASE WHEN predicted_winner = $2 THEN true ELSE false END
     WHERE match_id = $1`,
    [parseInt(matchId), winnerTeam]
  );
}

async function getPlayerPredictionStats(accountId) {
  const p = getPool();
  const result = await p.query(
    `SELECT
       COUNT(*) FILTER (WHERE resolved) AS total,
       COUNT(*) FILTER (WHERE resolved AND correct) AS correct_count
     FROM match_predictions
     WHERE predictor_account_id = $1`,
    [parseInt(accountId)]
  );
  return result.rows[0] || { total: 0, correct_count: 0 };
}

async function getOpenPrediction() {
  const p = getPool();
  const result = await p.query(
    `SELECT * FROM match_predictions WHERE resolved = false ORDER BY created_at DESC LIMIT 1`
  );
  if (!result.rows.length) return null;
  const matchId = result.rows[0].match_id;
  const all = await p.query(
    `SELECT predictor_name, predicted_winner, created_at FROM match_predictions WHERE match_id = $1 AND resolved = false ORDER BY created_at ASC`,
    [matchId]
  );
  return { match_id: matchId, predictions: all.rows };
}

async function getPlayerWardPlacements(accountIds, seasonId = null) {
  const p = getPool();
  const ids = Array.isArray(accountIds) ? accountIds : [accountIds];
  const params = [ids];
  let sc = '';
  if (!seasonId) sc = ` AND m.is_legacy = false`;
  else if (seasonId === 'legacy') sc = ` AND m.is_legacy = true`;
  else { params.push(parseInt(seasonId)); sc = ` AND m.season_id = $${params.length}`; }

  const res = await p.query(`
    SELECT ps.ward_placements, ps.persona_name, ps.hero_id, ps.hero_name, m.match_id, m.date
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.account_id = ANY($1::bigint[])
      AND ps.ward_placements IS NOT NULL
      AND ps.ward_placements != '[]'::jsonb
      ${sc}
    ORDER BY m.date DESC
  `, params);

  const allPlacements = { obs: [], sen: [] };
  for (const row of res.rows) {
    const placements = row.ward_placements || [];
    for (const p of placements) {
      if (p.type === 'obs') allPlacements.obs.push({ x: p.x, y: p.y, t: p.t, matchId: row.match_id });
      else if (p.type === 'sen') allPlacements.sen.push({ x: p.x, y: p.y, t: p.t, matchId: row.match_id });
    }
  }
  return allPlacements;
}

async function getAllPlayersWardPlacements(seasonId = null) {
  const p = getPool();
  const params = [];
  let sc = '';
  if (!seasonId) sc = ` AND m.is_legacy = false`;
  else if (seasonId === 'legacy') sc = ` AND m.is_legacy = true`;
  else { params.push(parseInt(seasonId)); sc = ` AND m.season_id = $${params.length}`; }

  const res = await p.query(`
    SELECT ps.account_id, ps.persona_name, n.nickname, ps.ward_placements
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
    WHERE ps.ward_placements IS NOT NULL
      AND ps.ward_placements != '[]'::jsonb
      AND ps.account_id != 0
      ${sc}
    ORDER BY ps.account_id
  `, params);

  const byPlayer = {};
  for (const row of res.rows) {
    const id = String(row.account_id);
    if (!byPlayer[id]) {
      byPlayer[id] = {
        accountId: row.account_id,
        name: row.nickname || row.persona_name || `Player ${id}`,
        obs: [], sen: [],
      };
    }
    for (const wp of (row.ward_placements || [])) {
      if (wp.type === 'obs') byPlayer[id].obs.push({ x: wp.x, y: wp.y });
      else if (wp.type === 'sen') byPlayer[id].sen.push({ x: wp.x, y: wp.y });
    }
  }

  // Merge accounts that share the same nickname (multi-account players)
  const byName = {};
  for (const entry of Object.values(byPlayer)) {
    const key = entry.name;
    if (!byName[key]) {
      byName[key] = { ...entry };
    } else {
      byName[key].obs = byName[key].obs.concat(entry.obs);
      byName[key].sen = byName[key].sen.concat(entry.sen);
    }
  }
  return Object.values(byName);
}

async function getPlayerHeroCounters(accountIds, seasonId = null) {
  const p = getPool();
  const ids = Array.isArray(accountIds) ? accountIds : [accountIds];
  const params = [ids];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const res = await p.query(`
    WITH my_matches AS (
      SELECT ps.match_id, ps.team, m.radiant_win
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
      WHERE ps.account_id = ANY($1::bigint[])${sc}
    ),
    enemy_picks AS (
      SELECT
        mm.match_id,
        ps.hero_name, ps.hero_id,
        COALESCE(n.nickname, ps.persona_name) AS enemy_name,
        ps.account_id AS enemy_account_id,
        (mm.team != ps.team) AS is_enemy,
        CASE WHEN mm.team = 'radiant' THEN mm.radiant_win ELSE NOT mm.radiant_win END AS i_won
      FROM my_matches mm
      JOIN player_stats ps ON ps.match_id = mm.match_id AND ps.account_id != ALL($1::bigint[])
      LEFT JOIN nicknames n ON n.account_id = ps.account_id
    )
    SELECT
      hero_name, hero_id,
      COUNT(*) FILTER (WHERE is_enemy) AS games_against,
      SUM(CASE WHEN is_enemy AND i_won THEN 1 ELSE 0 END) AS wins_against,
      COUNT(*) FILTER (WHERE NOT is_enemy) AS games_with,
      SUM(CASE WHEN NOT is_enemy AND i_won THEN 1 ELSE 0 END) AS wins_with
    FROM enemy_picks
    GROUP BY hero_name, hero_id
    HAVING COUNT(*) FILTER (WHERE is_enemy) >= 2 OR COUNT(*) FILTER (WHERE NOT is_enemy) >= 2
    ORDER BY games_against DESC
    LIMIT 30
  `, params);
  return res.rows;
}

async function getDraftStats(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const picks = await p.query(`
    SELECT
      md.hero_id, md.hero_name,
      COUNT(*) FILTER (WHERE md.is_pick) AS pick_count,
      COUNT(*) FILTER (WHERE NOT md.is_pick) AS ban_count,
      SUM(CASE WHEN md.is_pick AND ((md.team = 'radiant' AND m.radiant_win) OR (md.team = 'dire' AND NOT m.radiant_win)) THEN 1 ELSE 0 END) AS pick_wins,
      SUM(CASE WHEN md.is_pick THEN 1 ELSE 0 END) AS pick_games,
      COUNT(DISTINCT md.match_id) FILTER (WHERE md.is_pick) AS matches_picked
    FROM match_draft md
    JOIN matches m ON m.match_id = md.match_id
    WHERE 1=1${sc}
    GROUP BY md.hero_id, md.hero_name
    ORDER BY pick_count DESC
  `, params);

  const totalMatches = await p.query(`
    SELECT COUNT(*) AS cnt FROM matches WHERE 1=1${sc.replace('m.', '')}
  `, params);

  return { heroes: picks.rows, totalMatches: parseInt(totalMatches.rows[0]?.cnt || 0) };
}

async function getPersonalRecords(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const rows = await p.query(`
    SELECT
      ps.account_id, ps.persona_name,
      n.nickname,
      ps.hero_name,
      ps.kills, ps.deaths, ps.assists, ps.gpm, ps.xpm,
      ps.hero_damage, ps.hero_healing, ps.tower_damage, ps.net_worth,
      ps.last_hits, ps.denies, ps.courier_kills, ps.buybacks,
      m.match_id, m.date, m.duration
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    LEFT JOIN nicknames n ON n.account_id = ps.account_id
    WHERE ps.account_id > 0 ${sc}
  `, params);

  const records = {};
  const categories = [
    { key: 'kills', label: 'Most Kills', asc: false },
    { key: 'deaths', label: 'Most Deaths', asc: false },
    { key: 'assists', label: 'Most Assists', asc: false },
    { key: 'gpm', label: 'Highest GPM', asc: false },
    { key: 'xpm', label: 'Highest XPM', asc: false },
    { key: 'hero_damage', label: 'Most Hero Damage', asc: false },
    { key: 'hero_healing', label: 'Most Healing', asc: false },
    { key: 'tower_damage', label: 'Most Tower Damage', asc: false },
    { key: 'net_worth', label: 'Highest Net Worth', asc: false },
    { key: 'last_hits', label: 'Most Last Hits', asc: false },
    { key: 'denies', label: 'Most Denies', asc: false },
    { key: 'courier_kills', label: 'Most Courier Kills', asc: false },
    { key: 'buybacks', label: 'Most Buybacks', asc: false },
  ];

  for (const cat of categories) {
    const sorted = [...rows.rows]
      .filter(r => r[cat.key] != null && parseFloat(r[cat.key]) > 0)
      .sort((a, b) => cat.asc
        ? parseFloat(a[cat.key]) - parseFloat(b[cat.key])
        : parseFloat(b[cat.key]) - parseFloat(a[cat.key]));
    if (sorted.length) {
      const r = sorted[0];
      records[cat.key] = {
        label: cat.label,
        value: parseFloat(r[cat.key]),
        account_id: r.account_id,
        persona_name: r.nickname || r.persona_name,
        hero_name: r.hero_name,
        match_id: r.match_id,
        date: r.date,
        duration: r.duration,
      };
    }
  }
  return records;
}

async function getFirstBloodStats(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const rows = await p.query(`
    SELECT
      ps.account_id,
      COALESCE(n.nickname, ps.persona_name) AS display_name,
      SUM(ps.firstblood_claimed) AS fb_count,
      COUNT(*) AS games,
      ROUND(100.0 * SUM(ps.firstblood_claimed) / NULLIF(COUNT(*), 0), 1) AS fb_rate
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    LEFT JOIN nicknames n ON n.account_id = ps.account_id
    WHERE ps.account_id > 0 ${sc}
    GROUP BY ps.account_id, display_name
    HAVING COUNT(*) >= 5
    ORDER BY fb_count DESC
    LIMIT 20
  `, params);

  return rows.rows;
}

async function getHeroSkillBuilds(heroId, seasonId = null) {
  const p = getPool();
  const params = [parseInt(heroId)];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const builds = await p.query(`
    SELECT
      pa.ability_name,
      pa.ability_level,
      ROUND(AVG(pa.time)) AS avg_time,
      COUNT(*) AS occurrences
    FROM player_abilities pa
    JOIN player_stats ps ON ps.match_id = pa.match_id AND ps.slot = pa.slot
    JOIN matches m ON m.match_id = pa.match_id
    WHERE ps.hero_id = $1 ${sc}
      AND pa.ability_name NOT LIKE '%attribute_bonus%'
    GROUP BY pa.ability_name, pa.ability_level
    ORDER BY pa.ability_level, occurrences DESC
  `, params);

  const heroNameRow = await p.query(
    `SELECT DISTINCT hero_name FROM player_stats WHERE hero_id = $1 LIMIT 1`, [parseInt(heroId)]
  );

  const totalGames = await p.query(`
    SELECT COUNT(DISTINCT pa.match_id) AS games
    FROM player_abilities pa
    JOIN player_stats ps ON ps.match_id = pa.match_id AND ps.slot = pa.slot
    JOIN matches m ON m.match_id = pa.match_id
    WHERE ps.hero_id = $1 ${sc}
  `, params);

  return {
    heroId,
    heroName: heroNameRow.rows[0]?.hero_name || '',
    totalGames: parseInt(totalGames.rows[0]?.games || 0),
    builds: builds.rows,
  };
}

async function getPlayerGameDurationStats(accountIds, seasonId = null) {
  const p = getPool();
  const ids = Array.isArray(accountIds) ? accountIds : [parseInt(accountIds)];
  const params = [ids];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const rows = await p.query(`
    SELECT
      CASE
        WHEN m.duration < 1500 THEN '<25m'
        WHEN m.duration < 2100 THEN '25-35m'
        WHEN m.duration < 2700 THEN '35-45m'
        ELSE '>45m'
      END AS bracket,
      COUNT(*) AS games,
      SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) AS wins,
      ROUND(AVG(ps.kills),1) AS avg_kills,
      ROUND(AVG(ps.gpm),0) AS avg_gpm,
      ROUND(AVG(ps.hero_damage),0) AS avg_damage
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.account_id = ANY($1::bigint[]) ${sc}
    GROUP BY bracket
    ORDER BY MIN(m.duration)
  `, params);

  return rows.rows;
}

async function getComebackMatches(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const rows = await p.query(`
    SELECT
      m.match_id, m.date, m.duration, m.radiant_win,
      m.game_timeline
    FROM matches m
    WHERE m.game_timeline IS NOT NULL
      AND m.game_timeline->'players' IS NOT NULL
      ${sc}
    ORDER BY m.date DESC
  `, params);

  const comebacks = [];
  for (const row of rows.rows) {
    try {
      const players = row.game_timeline?.players;
      if (!Array.isArray(players) || players.length < 2) continue;
      const radiantPlayers = players.filter(pl => pl.team === 'radiant');
      const direPlayers = players.filter(pl => pl.team === 'dire');
      if (radiantPlayers.length === 0 || direPlayers.length === 0) continue;
      const numSamples = Math.max(...players.map(pl => pl.samples?.length || 0));
      if (numSamples < 10) continue;
      const values = [];
      for (let i = 0; i < numSamples; i++) {
        let radiantNw = 0, direNw = 0;
        for (const pl of radiantPlayers) { radiantNw += pl.samples?.[i]?.nw || 0; }
        for (const pl of direPlayers) { direNw += pl.samples?.[i]?.nw || 0; }
        values.push(radiantNw - direNw);
      }
      const maxLead = Math.max(...values);
      const minLead = Math.min(...values);
      const finalLead = values[values.length - 1];

      let comebackSize = 0;
      let comebackTeam = null;

      if (!row.radiant_win && maxLead > 5000) {
        comebackSize = maxLead;
        comebackTeam = 'dire';
      } else if (row.radiant_win && minLead < -5000) {
        comebackSize = Math.abs(minLead);
        comebackTeam = 'radiant';
      }

      if (comebackSize >= 5000) {
        const radiantNames = [];
        const direNames = [];
        try {
          const ps = await p.query(
            `SELECT COALESCE(n.nickname, ps.persona_name) AS name, ps.team FROM player_stats ps LEFT JOIN nicknames n ON n.account_id = ps.account_id WHERE ps.match_id = $1 ORDER BY ps.slot`,
            [row.match_id]
          );
          for (const pr of ps.rows) {
            if (pr.team === 'radiant') radiantNames.push(pr.name);
            else direNames.push(pr.name);
          }
        } catch (_) {}

        comebacks.push({
          match_id: row.match_id,
          date: row.date,
          duration: row.duration,
          radiant_win: row.radiant_win,
          comeback_team: comebackTeam,
          max_deficit: Math.round(comebackSize),
          radiant_players: radiantNames,
          dire_players: direNames,
        });
      }
    } catch (_) {}
  }

  comebacks.sort((a, b) => b.max_deficit - a.max_deficit);
  return comebacks.slice(0, 20);
}

async function createManualMatch({ date, duration, radiantWin, players, lobbyName, patch, seasonId, createdBy }) {
  const p = getPool();
  const matchId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO matches (match_id, date, duration, game_mode, radiant_win, lobby_name, recorded_by, parse_method, patch, season_id)
       VALUES ($1, $2, $3, 0, $4, $5, $6, 'manual', $7, $8)`,
      [matchId, date || new Date().toISOString(), duration || 0, radiantWin, lobbyName || 'Manual Entry', createdBy || 'admin', patch || null, seasonId || null]
    );
    let radiantSlot = 0;
    let direSlot = 5;
    for (const player of players) {
      const slot = player.team === 'radiant' ? radiantSlot++ : direSlot++;
      await client.query(
        `INSERT INTO player_stats (match_id, account_id, persona_name, hero_id, hero_name, team, kills, deaths, assists, position, slot, gpm, xpm, net_worth, hero_damage, hero_healing, last_hits, level, damage_taken, obs_placed, sen_placed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
        [matchId, player.accountId || 0, player.personaName || '', player.heroId || 0, player.heroName || '', player.team, player.kills || 0, player.deaths || 0, player.assists || 0, player.position || 0, slot]
      );
    }
    await client.query('COMMIT');
    return matchId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function logServerError(level, source, message, details = null) {
  try {
    const p = getPool();
    await p.query(
      `INSERT INTO server_logs (level, source, message, details) VALUES ($1, $2, $3, $4)`,
      [level || 'error', source || 'server', message, details ? JSON.stringify(details) : null]
    );
  } catch (_) {}
}

async function getServerLogs(limit = 200, level = null) {
  const p = getPool();
  const params = [limit];
  const levelClause = level ? ` AND level = $2` : '';
  if (level) params.push(level);
  const result = await p.query(
    `SELECT id, level, source, message, details, created_at
     FROM server_logs
     WHERE 1=1${levelClause}
     ORDER BY created_at DESC
     LIMIT $1`,
    params
  );
  return result.rows;
}

// Re-parse a match from updated stats, preserving season, match ID, created_at, and lobby name.
// Saves and restores manually-set player positions.
async function reparseMatchFromStats(matchId, matchStats, patch) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    // Preserve season_id and lobby_name from the existing match
    const existing = await client.query(
      `SELECT season_id, lobby_name, recorded_by FROM matches WHERE match_id = $1`,
      [matchId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const { season_id, lobby_name, recorded_by } = existing.rows[0];

    // Preserve manually-set player positions (slot -> position)
    const posResult = await client.query(
      `SELECT slot, position FROM player_stats WHERE match_id = $1`,
      [matchId]
    );
    const savedPositions = {};
    for (const row of posResult.rows) {
      if (row.position && row.position > 0) savedPositions[row.slot] = row.position;
    }

    // Clear old data for this match
    await client.query(`DELETE FROM player_stats WHERE match_id = $1`, [matchId]);
    await client.query(`DELETE FROM player_items WHERE match_id = $1`, [matchId]);
    await client.query(`DELETE FROM player_abilities WHERE match_id = $1`, [matchId]);
    await client.query(`DELETE FROM match_draft WHERE match_id = $1`, [matchId]);

    // Update match-level fields (keep season_id, lobby_name)
    await client.query(
      `UPDATE matches SET
         duration = $1, game_mode = $2, radiant_win = $3,
         parse_method = $4, patch = COALESCE($5, patch),
         game_timeline = COALESCE($6, game_timeline),
         lane_outcomes = COALESCE($7, lane_outcomes),
         team_abilities = COALESCE($8, team_abilities),
         recorded_by = $9
       WHERE match_id = $10`,
      [
        matchStats.duration || 0,
        matchStats.gameMode || 0,
        matchStats.radiantWin,
        (matchStats.parseMethod || 'replay-reparse') + ' [reparsed]',
        patch || null,
        matchStats.gameTimeline ? JSON.stringify(matchStats.gameTimeline) : null,
        matchStats.laneOutcomes ? JSON.stringify(matchStats.laneOutcomes) : null,
        matchStats.teamAbilities ? JSON.stringify(matchStats.teamAbilities) : null,
        recorded_by ? `${recorded_by} [reparsed]` : 'reparse',
        matchId,
      ]
    );

    // Re-insert player stats
    for (const player of matchStats.players) {
      const slot = player.slot || 0;
      const restoredPosition = savedPositions[slot] || player.position || 0;
      await client.query(
        `INSERT INTO player_stats (match_id, account_id, discord_id, persona_name, hero_id, hero_name, team, kills, deaths, assists, last_hits, denies, gpm, xpm, hero_damage, tower_damage, hero_healing, level, net_worth, position, is_captain, obs_placed, sen_placed, creeps_stacked, camps_stacked, damage_taken, slot, rune_pickups, stun_duration, towers_killed, roshans_killed, teamfight_participation, firstblood_claimed, wards_killed, obs_purchased, sen_purchased, buybacks, courier_kills, tp_scrolls_used, double_kills, triple_kills, ultra_kills, rampages, kill_streak, smoke_kills, first_death, lane_cs_10min, has_scepter, has_shard, laning_nw, support_gold_spent, killed_by, ward_placements, nemesis_hero_name, nemesis_kills, hook_attempts, hook_hits, evasion_count, long_range_kills, heal_saves, lifesteal_healing, dusts_used, pull_count, ward_dewarded_count, ward_avg_lifespan, obs_dewarded_count, obs_avg_lifespan, sen_dewarded_count, sen_avg_lifespan, dead_time_seconds, hook_cast_times, hook_cast_log, dieback_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73)`,
        [
          matchId, player.accountId || 0, player.discordId || '', player.personaname || '',
          player.heroId || 0, player.heroName || '', player.team || 'radiant',
          player.kills || 0, player.deaths || 0, player.assists || 0,
          player.lastHits || 0, player.denies || 0, player.goldPerMin || 0, player.xpPerMin || 0,
          player.heroDamage || 0, player.towerDamage || 0, player.heroHealing || 0,
          player.level || 0, player.netWorth || 0, restoredPosition,
          player.isCaptain || false, player.obsPlaced || 0, player.senPlaced || 0,
          player.creepsStacked || 0, player.campsStacked || 0, player.damageTaken || 0,
          slot, player.runePickups || 0, player.stunDuration || 0,
          player.towersKilled || 0, player.roshansKilled || 0,
          player.teamfightParticipation || 0, player.firstbloodClaimed || 0,
          player.wardsKilled || 0, player.obsPurchased || 0, player.senPurchased || 0,
          player.buybacks || 0, player.courierKills || 0, player.tpScrollsUsed || 0,
          player.doubleKills || 0, player.tripleKills || 0, player.ultraKills || 0,
          player.rampages || 0, player.killStreak || 0, player.smokeKills || 0,
          player.firstDeath || 0, player.laneCs10min || 0,
          player.hasScepter || false, player.hasShard || false,
          player.laningNw != null ? player.laningNw : null,
          player.supportGoldSpent || 0,
          JSON.stringify(player.killedBy || {}),
          JSON.stringify(player.wardPlacements || []),
          player.nemesisHeroName || '', player.nemesisKills || 0,
          player.hookAttempts != null ? player.hookAttempts : null,
          player.hookHits != null ? player.hookHits : null,
          player.evasionCount || 0, player.longRangeKills || 0,
          player.healSaves || 0, player.lifestealHealing || 0,
          player.dustsUsed || 0, player.pullCount || 0,
          player.wardDewardedCount || 0, player.wardAvgLifespan || null,
          player.obsDewardedCount || 0, player.obsAvgLifespan || null,
          player.senDewardedCount || 0, player.senAvgLifespan || null,
          player.deadTimeSeconds != null ? player.deadTimeSeconds : null,
          player.hookCastTimes ? JSON.stringify(player.hookCastTimes) : null,
          player.hookCastLog ? JSON.stringify(player.hookCastLog) : null,
          player.diebackCount || 0,
        ]
      );

      if (player.damagePhysical || player.damageMagical || player.damagePure) {
        await client.query(
          `UPDATE player_stats SET damage_physical=$1, damage_magical=$2, damage_pure=$3
           WHERE match_id=$4 AND slot=$5`,
          [player.damagePhysical || 0, player.damageMagical || 0, player.damagePure || 0, matchId, slot]
        );
      }

      if (player.items && player.items.length > 0) {
        for (const item of player.items) {
          await client.query(
            `INSERT INTO player_items (match_id, slot, item_slot, item_id, item_name, purchase_time, enhancement_level)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (match_id, slot, item_slot) DO UPDATE SET
               item_id = EXCLUDED.item_id, item_name = EXCLUDED.item_name,
               purchase_time = EXCLUDED.purchase_time, enhancement_level = EXCLUDED.enhancement_level`,
            [matchId, slot, item.slot, item.itemId || 0, item.itemName || '', item.purchaseTime || 0, item.enhancementLevel || 0]
          );
        }
      }

      if (player.abilities && player.abilities.length > 0) {
        for (const ability of player.abilities) {
          await client.query(
            `INSERT INTO player_abilities (match_id, slot, ability_name, ability_level, time)
             VALUES ($1, $2, $3, $4, $5)`,
            [matchId, slot, ability.abilityName || '', ability.abilityLevel || 0, ability.time || 0]
          );
        }
      }
    }

    if (matchStats.draft && matchStats.draft.length > 0) {
      for (const d of matchStats.draft) {
        if (!d.heroId || d.heroId <= 0) continue;
        await client.query(
          `INSERT INTO match_draft (match_id, hero_id, is_pick, order_num, team)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (match_id, order_num) DO UPDATE SET hero_id=EXCLUDED.hero_id, is_pick=EXCLUDED.is_pick, team=EXCLUDED.team`,
          [matchId, d.heroId, d.isPick, d.order || 0, typeof d.team === 'string' ? (d.team === 'radiant' ? 0 : 1) : (d.team === 2 ? 0 : d.team === 3 ? 1 : (d.team || 0))]
        );
      }
    }

    await client.query('COMMIT');
    console.log(`[DB] Match ${matchId} reparsed successfully.`);
    return { matchId, radiantWin: matchStats.radiantWin, seasonId: season_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function setMatchWinner(matchId, radiantWin, correctedBy) {
  const p = getPool();
  const result = await p.query(
    `UPDATE matches SET radiant_win = $1, recorded_by = recorded_by || ' [winner corrected by ' || $2 || ']'
     WHERE match_id = $3 RETURNING match_id, radiant_win`,
    [radiantWin, correctedBy || 'admin', matchId]
  );
  if (result.rows.length === 0) return null;

  // Also flip the player team win/loss in rating_history for this match
  // (we don't retroactively recalculate TrueSkill, but we can note it was corrected)
  console.log(`[DB] Winner corrected for match ${matchId}: radiant_win=${radiantWin} by ${correctedBy}`);
  return result.rows[0];
}

async function getSeasonPlayerRecords(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId
    ? ` AND m.season_id = $${params.push(parseInt(seasonId))}`
    : ' AND m.is_legacy = false';

  // Aggregate stats per player
  const aggRes = await p.query(`
    SELECT
      ps.account_id,
      COALESCE(n.nickname, MAX(ps.persona_name)) as display_name,
      COUNT(*)::int as games_played,
      SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int as wins,
      SUM(CASE WHEN NOT((ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win)) THEN 1 ELSE 0 END)::int as losses,
      SUM(ps.kills)::int   as total_kills,
      SUM(ps.deaths)::int  as total_deaths,
      SUM(ps.assists)::int as total_assists,
      ROUND(AVG(ps.gpm))::int as avg_gpm,
      SUM(ps.hero_damage)::bigint as total_damage,
      SUM(ps.hero_healing)::bigint as total_healing,
      SUM(ps.rampages)::int as total_rampages,
      SUM(ps.obs_placed + ps.sen_placed)::int as total_wards_placed,
      ROUND(SUM(ps.stun_duration))::int as total_stun_duration,
      SUM(ps.roshans_killed)::int as total_roshans,
      SUM(ps.camps_stacked)::int as total_stacks,
      SUM(ps.wards_killed)::int as total_wards_killed,
      SUM(ps.tower_damage)::bigint as total_tower_damage,
      SUM(ps.towers_killed)::int as total_towers_killed,
      SUM(ps.firstblood_claimed)::int as total_firstbloods,
      SUM(ps.buybacks)::int as total_buybacks,
      ROUND(SUM(COALESCE(ps.dead_time_seconds, 0)) / 60.0)::int as total_dead_minutes,
      SUM(ps.dieback_count)::int as total_diebacks,
      ROUND(AVG(ps.deaths), 2) as avg_deaths_per_game,
      -- Obs ward lifespan: average across games where wards were dewarded (lower = worse placement)
      ROUND(AVG(CASE WHEN ps.obs_dewarded_count > 0 THEN ps.obs_avg_lifespan ELSE NULL END))::int as avg_obs_lifespan,
      SUM(CASE WHEN ps.obs_dewarded_count > 0 THEN ps.obs_dewarded_count ELSE 0 END)::int as total_obs_dewarded
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    LEFT JOIN nicknames n ON n.account_id = ps.account_id
    WHERE ps.account_id > 0 ${sc}
    GROUP BY ps.account_id, n.nickname
    HAVING COUNT(*) >= 1
  `, params);

  // Streak calculation — gaps-and-islands technique, ordered by match_id (game sequence)
  const streakRes = await p.query(`
    WITH ordered AS (
      SELECT
        ps.account_id,
        COALESCE(n.nickname, ps.persona_name) as display_name,
        m.match_id,
        CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END as won,
        ROW_NUMBER() OVER (PARTITION BY ps.account_id ORDER BY m.match_id) as rn
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
      LEFT JOIN nicknames n ON n.account_id = ps.account_id
      WHERE ps.account_id > 0 ${sc}
    ),
    grouped AS (
      SELECT *, rn - ROW_NUMBER() OVER (PARTITION BY account_id, won ORDER BY rn) as grp
      FROM ordered
    ),
    streaks AS (
      SELECT account_id, display_name, won, COUNT(*)::int as streak_len
      FROM grouped
      GROUP BY account_id, display_name, won, grp
    )
    SELECT account_id, display_name, won, MAX(streak_len)::int as max_streak
    FROM streaks
    GROUP BY account_id, display_name, won
  `, params);

  const agg = aggRes.rows;
  const streaks = streakRes.rows;

  const minGamesForRate = 5;

  const pickBest = (rows, field, ascending = false) => {
    const sorted = [...rows].filter(r => r[field] != null && parseInt(r[field]) > 0)
      .sort((a, b) => ascending
        ? parseInt(a[field]) - parseInt(b[field])
        : parseInt(b[field]) - parseInt(a[field]));
    return sorted[0] || null;
  };

  const pickBestWinRate = (rows, ascending = false) => {
    const eligible = rows.filter(r => r.games_played >= minGamesForRate);
    const sorted = [...eligible].sort((a, b) => {
      const rateA = a.wins / a.games_played;
      const rateB = b.wins / b.games_played;
      return ascending ? rateA - rateB : rateB - rateA;
    });
    const r = sorted[0];
    if (!r) return null;
    return { ...r, win_rate: Math.round((r.wins / r.games_played) * 100) };
  };

  const pickBestStreak = (rows, won) => {
    const filtered = rows.filter(r => r.won === won);
    const sorted = [...filtered].sort((a, b) => b.max_streak - a.max_streak);
    return sorted[0] || null;
  };

  // Worst obs ward efficiency: ascending avg_obs_lifespan, min 3 wards dewarded
  const pickWorstObsEfficiency = (rows) => {
    const eligible = rows.filter(r => r.total_obs_dewarded >= 3 && r.avg_obs_lifespan != null);
    const sorted = [...eligible].sort((a, b) => parseInt(a.avg_obs_lifespan) - parseInt(b.avg_obs_lifespan));
    return sorted[0] || null;
  };

  // Worst avg deaths per game: ascending, min games threshold
  const pickWorstAvgDeaths = (rows) => {
    const eligible = rows.filter(r => r.games_played >= minGamesForRate);
    const sorted = [...eligible].sort((a, b) => parseFloat(b.avg_deaths_per_game) - parseFloat(a.avg_deaths_per_game));
    const r = sorted[0];
    if (!r) return null;
    return { ...r, avg_deaths_display: parseFloat(r.avg_deaths_per_game).toFixed(1) };
  };

  // Lowest avg GPM: ascending, min games threshold
  const pickLowestAvgGpm = (rows) => {
    const eligible = rows.filter(r => r.games_played >= minGamesForRate && r.avg_gpm > 0);
    const sorted = [...eligible].sort((a, b) => parseInt(a.avg_gpm) - parseInt(b.avg_gpm));
    return sorted[0] || null;
  };

  return {
    positive: {
      most_wins:            pickBest(agg, 'wins'),
      most_kills:           pickBest(agg, 'total_kills'),
      most_assists:         pickBest(agg, 'total_assists'),
      most_damage:          pickBest(agg, 'total_damage'),
      most_healing:         pickBest(agg, 'total_healing'),
      best_win_rate:        pickBestWinRate(agg, false),
      longest_win_streak:   pickBestStreak(streaks, 1),
      most_games:           pickBest(agg, 'games_played'),
      most_rampages:        pickBest(agg, 'total_rampages'),
      vision_king:          pickBest(agg, 'total_wards_placed'),
      most_stun_duration:   pickBest(agg, 'total_stun_duration'),
      most_roshans:         pickBest(agg, 'total_roshans'),
      stack_god:            pickBest(agg, 'total_stacks'),
      ward_hunter:          pickBest(agg, 'total_wards_killed'),
      most_tower_damage:    pickBest(agg, 'total_tower_damage'),
      most_towers_killed:   pickBest(agg, 'total_towers_killed'),
      most_firstbloods:     pickBest(agg, 'total_firstbloods'),
    },
    negative: {
      most_deaths:            pickBest(agg, 'total_deaths'),
      most_losses:            pickBest(agg, 'losses'),
      worst_win_rate:         pickBestWinRate(agg, true),
      longest_loss_streak:    pickBestStreak(streaks, 0),
      most_buybacks:          pickBest(agg, 'total_buybacks'),
      most_dead_time:         pickBest(agg, 'total_dead_minutes'),
      most_diebacks:          pickBest(agg, 'total_diebacks'),
      worst_avg_deaths:       pickWorstAvgDeaths(agg),
      worst_obs_efficiency:   pickWorstObsEfficiency(agg),
      lowest_avg_gpm:         pickLowestAvgGpm(agg),
    },
  };
}

async function getMatchNotes(matchId) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, match_id, content, added_by, created_at FROM match_notes WHERE match_id = $1 ORDER BY created_at ASC`,
    [matchId]
  );
  return res.rows;
}

async function addMatchNote(matchId, content, addedBy) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO match_notes (match_id, content, added_by) VALUES ($1, $2, $3) RETURNING *`,
    [matchId, content, addedBy || 'admin']
  );
  return res.rows[0];
}

async function deleteMatchNote(noteId) {
  const p = getPool();
  await p.query(`DELETE FROM match_notes WHERE id = $1`, [noteId]);
}

async function createSignupRequest({ discordUsername, steamUrl, preferredName, preferredPositions, message, mmr, referral }) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO signup_requests (discord_username, steam_url, preferred_name, preferred_positions, message, mmr, referral)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [discordUsername, steamUrl || null, preferredName || null, preferredPositions || [], message || null, mmr || null, referral || null]
  );
  return res.rows[0];
}

async function getSignupRequests(status = null) {
  const p = getPool();
  const params = [];
  const where = status ? `WHERE status = $${params.push(status)}` : '';
  const res = await p.query(
    `SELECT * FROM signup_requests ${where} ORDER BY submitted_at DESC`,
    params
  );
  return res.rows;
}

async function updateSignupRequest(id, { status, adminNotes, reviewedBy }) {
  const p = getPool();
  await p.query(
    `UPDATE signup_requests SET status = $2, admin_notes = $3, reviewed_by = $4, reviewed_at = NOW()
     WHERE id = $1`,
    [parseInt(id), status, adminNotes || null, reviewedBy || 'admin']
  );
}

// ============================================================
// Inhouse Sessions (FACEIT-style match accept + draft + DS flow)
// ============================================================

async function createInhouseSession({ captainMode = 'highest_rank', createdBy = null, notes = null, acceptPhaseSeconds = 60, minPlayers = 10, lobbyFillSeconds = 30, draftPickSeconds = 30 } = {}) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO inhouse_sessions (captain_mode, created_by, notes, accept_phase_seconds, min_players, lobby_fill_seconds, draft_pick_seconds)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [captainMode, createdBy, notes, acceptPhaseSeconds, minPlayers, lobbyFillSeconds, draftPickSeconds]
  );
  return r.rows[0];
}

async function getInhouseSession(id) {
  const p = getPool();
  const r = await p.query(`SELECT * FROM inhouse_sessions WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function listInhouseSessions({ status = null, limit = 50 } = {}) {
  const p = getPool();
  if (status) {
    const r = await p.query(`SELECT * FROM inhouse_sessions WHERE status = $1 ORDER BY created_at DESC LIMIT $2`, [status, limit]);
    return r.rows;
  }
  const r = await p.query(`SELECT * FROM inhouse_sessions ORDER BY created_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

async function getActiveInhouseSession() {
  const p = getPool();
  const r = await p.query(
    `SELECT * FROM inhouse_sessions WHERE status IN ('open','accepting','drafting','server_failed','in_progress') ORDER BY created_at DESC LIMIT 1`
  );
  return r.rows[0] || null;
}

// v6.03 — Idempotent open-session getter for the auto-running lobby. If a
// joinable (`open` or `accepting`) session already exists we return it; only
// otherwise do we INSERT a fresh one with sensible defaults. Wrapped in an
// advisory transaction lock so two concurrent first-joiners can't race two
// sessions into existence. `created` is true iff this call was the one that
// inserted the row, so the caller can log/announce only on the real creation.
async function getOrCreateOpenInhouseSession(defaults = {}) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    // Per-key advisory lock — global to the inhouse-create namespace, scoped
    // to the transaction so a crashing client doesn't permanently hold it.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('inhouse_session_create_v603'))");
    const existing = await client.query(
      `SELECT * FROM inhouse_sessions
        WHERE status IN ('open','accepting','drafting','server_failed','in_progress')
        ORDER BY created_at DESC LIMIT 1`
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { session: existing.rows[0], created: false };
    }
    const r = await client.query(
      `INSERT INTO inhouse_sessions
         (captain_mode, created_by, accept_phase_seconds, min_players, lobby_fill_seconds, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        defaults.captainMode || 'highest_rank',
        defaults.createdBy || 'auto',
        Number.isFinite(defaults.acceptPhaseSeconds) ? defaults.acceptPhaseSeconds : 60,
        Number.isFinite(defaults.minPlayers) ? defaults.minPlayers : 10,
        Number.isFinite(defaults.lobbyFillSeconds) ? defaults.lobbyFillSeconds : 30,
        defaults.notes || null,
      ]
    );
    await client.query('COMMIT');
    return { session: r.rows[0], created: true };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// v6.03 — captain-mode poll helpers. Votes live in inhouse_sessions.captain_mode_votes
// as a JSONB map { "<accountId>": "<mode>" } so each player gets exactly one vote
// (re-voting overwrites). Tally + winner resolution are pure functions so the
// autoStartTicker and the API tally endpoint share the same outcome.
const CAPTAIN_VOTE_MODES = ['highest_rank','random','auto_balance','volunteer'];

async function setCaptainModeVote(sessionId, accountId, mode) {
  if (!CAPTAIN_VOTE_MODES.includes(mode)) {
    const err = new Error('Invalid captain mode');
    err.code = 'invalid_mode';
    throw err;
  }
  const p = getPool();
  const r = await p.query(
    `UPDATE inhouse_sessions
        SET captain_mode_votes = COALESCE(captain_mode_votes, '{}'::jsonb)
                                 || jsonb_build_object($2::text, $3::text)
      WHERE id = $1
      RETURNING captain_mode_votes`,
    [sessionId, String(accountId), mode]
  );
  return (r.rows[0] && r.rows[0].captain_mode_votes) || {};
}

async function clearCaptainModeVote(sessionId, accountId) {
  const p = getPool();
  const r = await p.query(
    `UPDATE inhouse_sessions
        SET captain_mode_votes = COALESCE(captain_mode_votes, '{}'::jsonb) - $2::text
      WHERE id = $1
      RETURNING captain_mode_votes`,
    [sessionId, String(accountId)]
  );
  return (r.rows[0] && r.rows[0].captain_mode_votes) || {};
}

async function getCaptainModeVotes(sessionId) {
  const p = getPool();
  const r = await p.query(`SELECT captain_mode_votes FROM inhouse_sessions WHERE id = $1`, [sessionId]);
  return (r.rows[0] && r.rows[0].captain_mode_votes) || {};
}

// v6.03 — Filter the raw vote map down to a set of currently-eligible
// account IDs so a player who voted and then left/was-kicked can't keep
// influencing the outcome. Pass null/undefined to skip filtering (used by
// pure-function unit tests). Caller normally passes the live lobby roster.
function filterVotesToMembers(votesObj, validAccountIdSet) {
  if (!votesObj || typeof votesObj !== 'object') return {};
  if (!validAccountIdSet) return votesObj;
  const out = {};
  for (const [acct, mode] of Object.entries(votesObj)) {
    if (validAccountIdSet.has(String(acct))) out[acct] = mode;
  }
  return out;
}

function tallyCaptainModeVotes(votesObj, validAccountIdSet = null) {
  const tally = { highest_rank: 0, random: 0, auto_balance: 0, volunteer: 0 };
  const filtered = filterVotesToMembers(votesObj, validAccountIdSet);
  for (const v of Object.values(filtered)) {
    if (Object.prototype.hasOwnProperty.call(tally, v)) tally[v] += 1;
  }
  return tally;
}

function resolveWinningCaptainMode(votesObj, validAccountIdSet = null) {
  const tally = tallyCaptainModeVotes(votesObj, validAccountIdSet);
  const max = Math.max(...Object.values(tally));
  if (max === 0) return 'highest_rank'; // zero votes → default
  const winners = Object.entries(tally).filter(([, c]) => c === max).map(([k]) => k);
  // v6.03 — task spec: ANY tie (regardless of which modes are tied) AND
  // any zero-vote session falls back to Highest Rank. Only a single clear
  // winner with strictly more votes than every other mode is allowed to
  // override the default.
  if (winners.length > 1) return 'highest_rank';
  return winners[0];
}

// Task #119 — captain volunteer helpers. Stored as JSONB { "<accountId>": true }
// on inhouse_sessions.captain_volunteers. Only meaningful when captain_mode is
// 'volunteer'; the route filters volunteers to currently-accepted players at
// resolve time and falls back to Highest Rank if there are 0 or 1 volunteers.
async function setCaptainVolunteer(sessionId, accountId, volunteer) {
  const p = getPool();
  if (volunteer) {
    const r = await p.query(
      `UPDATE inhouse_sessions
          SET captain_volunteers = COALESCE(captain_volunteers, '{}'::jsonb)
                                   || jsonb_build_object($2::text, true)
        WHERE id = $1
        RETURNING captain_volunteers`,
      [sessionId, String(accountId)]
    );
    return (r.rows[0] && r.rows[0].captain_volunteers) || {};
  }
  const r = await p.query(
    `UPDATE inhouse_sessions
        SET captain_volunteers = COALESCE(captain_volunteers, '{}'::jsonb) - $2::text
      WHERE id = $1
      RETURNING captain_volunteers`,
    [sessionId, String(accountId)]
  );
  return (r.rows[0] && r.rows[0].captain_volunteers) || {};
}

async function getCaptainVolunteers(sessionId) {
  const p = getPool();
  const r = await p.query(`SELECT captain_volunteers FROM inhouse_sessions WHERE id = $1`, [sessionId]);
  return (r.rows[0] && r.rows[0].captain_volunteers) || {};
}

function listVolunteerAccountIds(volunteersObj, validAccountIdSet = null) {
  if (!volunteersObj || typeof volunteersObj !== 'object') return [];
  const out = [];
  for (const [acct, v] of Object.entries(volunteersObj)) {
    if (!v) continue;
    if (validAccountIdSet && !validAccountIdSet.has(String(acct))) continue;
    out.push(String(acct));
  }
  return out;
}

async function updateInhouseSession(id, fields) {
  const p = getPool();
  const allowed = ['status','captain_mode','match_password','server_ip','server_port','match_id','captain1_account_id','captain2_account_id','team1_is_radiant','accept_phase_starts_at','accept_phase_seconds','started_at','completed_at','notes','min_players','lobby_fill_seconds','auto_start_at','captain_mode_votes','captain_volunteers','auto_balance_meta','draft_pick_seconds','draft_pick_deadline_at'];
  const sets = [];
  const vals = [];
  for (const k of Object.keys(fields)) {
    if (!allowed.includes(k)) continue;
    vals.push(fields[k]);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) return getInhouseSession(id);
  vals.push(id);
  const r = await p.query(`UPDATE inhouse_sessions SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  return r.rows[0] || null;
}

async function deleteInhouseSession(id) {
  const p = getPool();
  await p.query(`DELETE FROM inhouse_sessions WHERE id = $1`, [id]);
}

async function joinInhouseSession(sessionId, accountId, preferredPositions = null) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO inhouse_session_players (session_id, account_id, preferred_positions)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id, account_id)
     DO UPDATE SET preferred_positions = COALESCE(EXCLUDED.preferred_positions, inhouse_session_players.preferred_positions)
     RETURNING *`,
    [sessionId, accountId, preferredPositions]
  );
  return r.rows[0];
}

async function leaveInhouseSession(sessionId, accountId) {
  const p = getPool();
  await p.query(`DELETE FROM inhouse_session_players WHERE session_id = $1 AND account_id = $2`, [sessionId, accountId]);
  // v6.03 — also drop the player's captain-mode vote so a leaver can't keep
  // skewing the poll after they're gone (defence-in-depth alongside the
  // membership filter applied at tally/resolve time).
  // Task #119 — same defence-in-depth for captain volunteer signups.
  await p.query(
    `UPDATE inhouse_sessions
        SET captain_mode_votes = COALESCE(captain_mode_votes, '{}'::jsonb) - $2::text,
            captain_volunteers = COALESCE(captain_volunteers, '{}'::jsonb) - $2::text
      WHERE id = $1`,
    [sessionId, String(accountId)]
  ).catch(() => {});
}

// v5.88 — when a player signs out of the site, drop them from any
// open/accepting inhouse session they were registered in so a logged-out
// browser doesn't keep their slot warm. Returns the number of session
// memberships removed (0 if they weren't in anything).
async function leaveAllJoinableInhouseSessions(accountId) {
  if (!accountId) return 0;
  const p = getPool();
  const r = await p.query(
    `DELETE FROM inhouse_session_players
       WHERE account_id = $1
         AND session_id IN (
           SELECT id FROM inhouse_sessions WHERE status IN ('open','accepting')
         )`,
    [accountId]
  );
  return r.rowCount || 0;
}

// Task #136 — bump every joinable-session row this account owns so the
// stale-player sweep treats them as live. Returns the number of rows
// touched (0 if the account isn't currently in any open/accepting
// session). Cheap enough to call from a 15s frontend poll.
async function touchInhousePlayerHeartbeat(accountId, sessionIdToken = null) {
  if (!accountId) return 0;
  const p = getPool();
  const r = await p.query(
    `UPDATE inhouse_session_players
        SET last_seen_at = NOW(),
            last_session_id = COALESCE($2, last_session_id)
       WHERE account_id = $1
         AND session_id IN (
           SELECT id FROM inhouse_sessions WHERE status IN ('open','accepting')
         )`,
    [accountId, sessionIdToken]
  );
  return r.rowCount || 0;
}

// Task #136 — list active (open/accepting) inhouse seats together with the
// last express-session id we saw them on. The sweep tick uses this to drop
// any seat whose underlying Steam session has gone away (logout, cookie
// expiry, store eviction) without waiting for the heartbeat-staleness
// window. Bot/demo seats (last_session_id IS NULL) are skipped.
async function listInhousePlayerSessionTokens() {
  const p = getPool();
  const r = await p.query(
    `SELECT isp.session_id, isp.account_id, isp.last_session_id
       FROM inhouse_session_players isp
       JOIN inhouse_sessions s ON s.id = isp.session_id
      WHERE s.status IN ('open','accepting')
        AND isp.last_session_id IS NOT NULL`
  );
  return r.rows || [];
}

// Task #136 — drop a single seat. Used by the session-validity sweep when
// the express-session token attached to a seat is no longer in the store.
async function dropInhousePlayerSeat(sessionId, accountId) {
  const p = getPool();
  const r = await p.query(
    `DELETE FROM inhouse_session_players
       WHERE session_id = $1 AND account_id = $2
       RETURNING session_id, account_id`,
    [sessionId, accountId]
  );
  return r.rows[0] || null;
}

// Task #136 — sweep tick. Drops any player from an open/accepting session
// whose last_seen_at is older than `thresholdSeconds`. Runs on the same
// tick cadence as autoStartTicker so leavers free their slot quickly.
// Returns an array of { session_id, account_id } rows that were removed
// so the caller can log / re-tally.
async function pruneStaleInhousePlayers(thresholdSeconds = 45) {
  const p = getPool();
  const r = await p.query(
    `DELETE FROM inhouse_session_players
       WHERE session_id IN (
         SELECT id FROM inhouse_sessions WHERE status IN ('open','accepting')
       )
       AND last_seen_at < NOW() - ($1 || ' seconds')::interval
       RETURNING session_id, account_id`,
    [String(thresholdSeconds)]
  );
  return r.rows || [];
}

async function getInhouseSessionPlayers(sessionId) {
  const p = getPool();
  const r = await p.query(
    `SELECT isp.*,
            n.nickname AS nickname,
            isp.account_id AS steam_account_id,
            COALESCE(r.mu, 25.0) AS mu,
            COALESCE(r.sigma, 8.333) AS sigma,
            (COALESCE(r.mu, 25.0) - 3*COALESCE(r.sigma, 8.333)) AS trueskill_mmr,
            COALESCE(r.games_played, 0) AS games_played,
            n.dota_rank_tier AS dota_rank_tier,
            n.dota_leaderboard_rank AS dota_leaderboard_rank,
            r.discord_id AS discord_id
       FROM inhouse_session_players isp
       LEFT JOIN ratings r ON r.player_id = isp.account_id
       LEFT JOIN nicknames n ON n.account_id = isp.account_id
      WHERE isp.session_id = $1
      ORDER BY isp.registered_at ASC`,
    [sessionId]
  );
  return r.rows;
}

async function updateInhouseSessionPlayer(sessionId, accountId, fields) {
  const p = getPool();
  const allowed = ['status','team','pick_order','preferred_positions','roll','accepted_at','voice_verified','not_in_dota','joined_server'];
  const sets = [];
  const vals = [];
  for (const k of Object.keys(fields)) {
    if (!allowed.includes(k)) continue;
    vals.push(fields[k]);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) return null;
  vals.push(sessionId, accountId);
  const r = await p.query(
    `UPDATE inhouse_session_players SET ${sets.join(', ')} WHERE session_id = $${vals.length-1} AND account_id = $${vals.length} RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

async function setInhousePlayerAccepted(sessionId, accountId) {
  return updateInhouseSessionPlayer(sessionId, accountId, { status: 'accepted', accepted_at: new Date() });
}

async function setInhousePlayerDeclined(sessionId, accountId) {
  // Task #119 — declining drops any captain volunteer signup so a player who
  // volunteered then declined can't be picked as captain.
  const p = getPool();
  await p.query(
    `UPDATE inhouse_sessions
        SET captain_volunteers = COALESCE(captain_volunteers, '{}'::jsonb) - $2::text
      WHERE id = $1`,
    [sessionId, String(accountId)]
  ).catch(() => {});
  return updateInhouseSessionPlayer(sessionId, accountId, { status: 'declined' });
}

async function setInhousePlayerRoll(sessionId, accountId, roll) {
  return updateInhouseSessionPlayer(sessionId, accountId, { roll });
}

async function assignInhouseTeams(sessionId, assignments) {
  // assignments = [{accountId, team, pickOrder}]
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    for (const a of assignments) {
      await client.query(
        `UPDATE inhouse_session_players SET team = $1, pick_order = $2 WHERE session_id = $3 AND account_id = $4`,
        [a.team, a.pickOrder ?? null, sessionId, a.accountId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// =====================================================================
// Inhouse queue helpers
// =====================================================================

async function addToQueue(discordId, accountId, mmr, nickname) {
  const p = getPool();
  await p.query(
    `INSERT INTO inhouse_queue (discord_id, account_id, mmr, nickname)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) DO UPDATE SET
       account_id = EXCLUDED.account_id,
       mmr = EXCLUDED.mmr,
       nickname = EXCLUDED.nickname,
       joined_at = NOW()`,
    [discordId, accountId, mmr || 2600, nickname || null]
  );
}

async function removeFromQueue(discordId) {
  const p = getPool();
  await p.query(`DELETE FROM inhouse_queue WHERE discord_id = $1`, [discordId]);
}

async function clearQueue() {
  const p = getPool();
  await p.query(`DELETE FROM inhouse_queue`);
}

async function getQueue() {
  const p = getPool();
  const r = await p.query(`SELECT * FROM inhouse_queue ORDER BY joined_at ASC`);
  return r.rows;
}

// =====================================================================
// Wave 2 / 3 helpers — F1 hero_meta_v2, F2 draft_assistant_v2,
// F3 season_pass_s10, F4 notification_prefs, F5 tournament_live_v2,
// F6 mvp_attitude_analytics, F7 web_push.
// All preview-flag-gated at the route layer.
// =====================================================================

// ---------- F1: Hero Meta V2 ----------
// Returns one row per hero with overall pick/win counts plus a per-position
// breakdown (positions 1..5) and a per-tier pick distribution. Optional
// `tier` filter narrows by season_tier_players.tier_number for the given
// season; `season` narrows by matches.season_id (pass null to use all
// non-legacy matches). Result is suitable for a "hero meta" overview panel
// or a per-hero detail panel (clients can pull the relevant row).
async function getHeroMetaV2({ tier = null, season = null } = {}) {
  const p = getPool();
  const params = [];
  let matchSc;
  if (!season) matchSc = ' AND m.is_legacy = false';
  else if (season === 'legacy') matchSc = ' AND m.is_legacy = true';
  else { params.push(parseInt(season)); matchSc = ` AND m.season_id = $${params.length}`; }

  // Tier filter joins season_tier_players on the player + season. When
  // tier is provided we must also know which season's tier placement to
  // use — we use the match's season unless caller passed a season.
  let tierJoin = '';
  let tierWhere = '';
  if (tier !== null && tier !== undefined && tier !== '') {
    params.push(parseInt(tier));
    tierWhere = ` AND stp.tier_number = $${params.length}`;
    tierJoin = ` LEFT JOIN season_tier_players stp
                   ON stp.account_id = ps.account_id
                  AND stp.season_id = m.season_id`;
  }

  // Overall row per hero
  const overall = await p.query(`
    SELECT ps.hero_id,
           MIN(ps.hero_name) AS hero_name,
           COUNT(*)::int AS picks,
           SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int AS wins
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    ${tierJoin}
    WHERE ps.hero_id > 0 ${matchSc} ${tierWhere}
    GROUP BY ps.hero_id
    HAVING COUNT(*) >= 1
    ORDER BY picks DESC
  `, params);

  // Per-position breakdown
  const byPos = await p.query(`
    SELECT ps.hero_id, ps.position::int AS position,
           COUNT(*)::int AS picks,
           SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int AS wins
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    ${tierJoin}
    WHERE ps.hero_id > 0 AND ps.position BETWEEN 1 AND 5 ${matchSc} ${tierWhere}
    GROUP BY ps.hero_id, ps.position
  `, params);

  // Per-tier breakdown (always — we ignore the tier filter here so the
  // panel can show "this hero is most picked by Tier 2 players" even when
  // the user is filtering to a specific tier elsewhere).
  const tierParams = [];
  let tierMatchSc;
  if (!season) tierMatchSc = ' AND m.is_legacy = false';
  else if (season === 'legacy') tierMatchSc = ' AND m.is_legacy = true';
  else { tierParams.push(parseInt(season)); tierMatchSc = ` AND m.season_id = $${tierParams.length}`; }

  const byTier = await p.query(`
    SELECT ps.hero_id, stp.tier_number::int AS tier_number,
           COUNT(*)::int AS picks,
           SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int AS wins
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    JOIN season_tier_players stp
      ON stp.account_id = ps.account_id
     AND stp.season_id = m.season_id
    WHERE ps.hero_id > 0 ${tierMatchSc}
    GROUP BY ps.hero_id, stp.tier_number
  `, tierParams);

  // Per-hero counter: opponent heroes faced, sorted by their WR against us.
  // Limited to a top-5 list per hero to keep the payload small.
  const counters = await p.query(`
    SELECT ps_us.hero_id AS hero_id,
           ps_them.hero_id AS opp_hero_id,
           MIN(ps_them.hero_name) AS opp_hero_name,
           COUNT(*)::int AS games,
           SUM(CASE WHEN (ps_them.team='radiant' AND m.radiant_win) OR (ps_them.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int AS opp_wins
    FROM player_stats ps_us
    JOIN player_stats ps_them ON ps_them.match_id = ps_us.match_id AND ps_them.team != ps_us.team
    JOIN matches m ON m.match_id = ps_us.match_id
    WHERE ps_us.hero_id > 0 AND ps_them.hero_id > 0 ${tierMatchSc}
    GROUP BY ps_us.hero_id, ps_them.hero_id
    HAVING COUNT(*) >= 3
  `, tierParams);

  const byHero = new Map();
  for (const row of overall.rows) {
    byHero.set(row.hero_id, {
      hero_id: row.hero_id,
      hero_name: row.hero_name,
      picks: row.picks,
      wins: row.wins,
      win_rate: row.picks > 0 ? row.wins / row.picks : 0,
      by_position: [],
      by_tier: [],
      worst_matchups: [],
      // UI-friendly: { 1..5 -> win_rate } populated below
      lane_wr: {},
      lane_picks: {},
    });
  }
  for (const row of byPos.rows) {
    const h = byHero.get(row.hero_id); if (!h) continue;
    const wr = row.picks > 0 ? row.wins / row.picks : 0;
    h.by_position.push({
      position: row.position, picks: row.picks, wins: row.wins,
      win_rate: wr,
    });
    h.lane_wr[row.position] = wr;
    h.lane_picks[row.position] = row.picks;
  }
  for (const row of byTier.rows) {
    const h = byHero.get(row.hero_id); if (!h) continue;
    h.by_tier.push({
      tier_number: row.tier_number, picks: row.picks, wins: row.wins,
      win_rate: row.picks > 0 ? row.wins / row.picks : 0,
    });
  }
  // Sort + truncate counters per hero to top 5 worst matchups for that hero.
  const counterByHero = new Map();
  for (const row of counters.rows) {
    if (!counterByHero.has(row.hero_id)) counterByHero.set(row.hero_id, []);
    counterByHero.get(row.hero_id).push({
      opp_hero_id: row.opp_hero_id,
      opp_hero_name: row.opp_hero_name,
      games: row.games,
      opp_win_rate: row.games > 0 ? row.opp_wins / row.games : 0,
    });
  }
  for (const [heroId, list] of counterByHero) {
    list.sort((a, b) => b.opp_win_rate - a.opp_win_rate);
    const h = byHero.get(heroId);
    if (h) h.worst_matchups = list.slice(0, 5);
  }

  return Array.from(byHero.values()).sort((a, b) => b.picks - a.picks);
}

// ---------- F2: Draft Assistant V2 ----------
// Returns suggestions with a per-pick breakdown:
//   {hero_id, hero_name, score, base_wr, synergy: [{ally_hero_id, win_rate, games}],
//    counter: [{enemy_hero_id, opp_win_rate, games}]}
// `side` is 'radiant'|'dire' — used to weight base WR by side advantage.
// Score = 0.4 * base_wr + 0.35 * avg(synergy) + 0.25 * (1 - avg(opp_win_rate)).
async function getDraftSuggestionsV2({ allies = [], enemies = [], banned = [], side = null, season = null } = {}) {
  const p = getPool();
  const excluded = [...allies, ...enemies, ...banned].filter(Boolean);
  const params = [];
  let sc;
  if (!season) sc = ' AND m.is_legacy = false';
  else if (season === 'legacy') sc = ' AND m.is_legacy = true';
  else { params.push(parseInt(season)); sc = ` AND m.season_id = $${params.length}`; }

  // Base WR per hero (overall).
  const baseRes = await p.query(`
    SELECT ps.hero_id, MIN(ps.hero_name) AS hero_name,
           COUNT(*)::int AS games,
           SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int AS wins
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.hero_id > 0 ${excluded.length ? ` AND ps.hero_id != ALL($${params.push(excluded)})` : ''} ${sc}
    GROUP BY ps.hero_id
    HAVING COUNT(*) >= 3
  `, params);

  // Synergy with each ally hero
  const synergyByPair = new Map(); // key `${candidate}-${ally}` -> {games, wins}
  for (const allyId of allies) {
    const ap = [allyId];
    let asc;
    if (!season) asc = ' AND m.is_legacy = false';
    else if (season === 'legacy') asc = ' AND m.is_legacy = true';
    else { ap.push(parseInt(season)); asc = ` AND m.season_id = $${ap.length}`; }
    const r = await p.query(`
      SELECT ps.hero_id,
             COUNT(*)::int AS games,
             SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int AS wins
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
      WHERE ps.hero_id > 0
        AND EXISTS (SELECT 1 FROM player_stats ps2
                     WHERE ps2.match_id = ps.match_id AND ps2.team = ps.team AND ps2.hero_id = $1) ${asc}
      GROUP BY ps.hero_id
      HAVING COUNT(*) >= 1
    `, ap);
    for (const row of r.rows) {
      synergyByPair.set(`${row.hero_id}-${allyId}`, { games: row.games, wins: row.wins });
    }
  }

  // Counter against each enemy hero (we want enemy WIN rate vs candidate — lower is better for us)
  const counterByPair = new Map(); // key `${candidate}-${enemy}` -> {games, opp_wins}
  for (const enemyId of enemies) {
    const ep = [enemyId];
    let esc;
    if (!season) esc = ' AND m.is_legacy = false';
    else if (season === 'legacy') esc = ' AND m.is_legacy = true';
    else { ep.push(parseInt(season)); esc = ` AND m.season_id = $${ep.length}`; }
    const r = await p.query(`
      SELECT ps.hero_id,
             COUNT(*)::int AS games,
             SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END)::int AS wins,
             SUM(CASE WHEN (ps.team='radiant' AND NOT m.radiant_win) OR (ps.team='dire' AND m.radiant_win) THEN 1 ELSE 0 END)::int AS losses
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
      WHERE ps.hero_id > 0
        AND EXISTS (SELECT 1 FROM player_stats ps2
                     WHERE ps2.match_id = ps.match_id AND ps2.team != ps.team AND ps2.hero_id = $1) ${esc}
      GROUP BY ps.hero_id
      HAVING COUNT(*) >= 1
    `, ep);
    for (const row of r.rows) {
      // opp_win_rate from candidate's perspective = losses / games
      counterByPair.set(`${row.hero_id}-${enemyId}`, { games: row.games, opp_wins: row.losses });
    }
  }

  return baseRes.rows.map(r => {
    const candidateId = r.hero_id;
    const games = r.games;
    const wins = r.wins;
    const baseWr = games > 0 ? wins / games : 0.5;

    const synergy = allies.map(a => {
      const v = synergyByPair.get(`${candidateId}-${a}`) || { games: 0, wins: 0 };
      return {
        ally_hero_id: a,
        games: v.games,
        win_rate: v.games > 0 ? v.wins / v.games : baseWr,
      };
    });
    const counter = enemies.map(e => {
      const v = counterByPair.get(`${candidateId}-${e}`) || { games: 0, opp_wins: 0 };
      return {
        enemy_hero_id: e,
        games: v.games,
        opp_win_rate: v.games > 0 ? v.opp_wins / v.games : 0.5,
      };
    });
    const avgSyn = synergy.length > 0
      ? synergy.reduce((s, x) => s + x.win_rate, 0) / synergy.length : baseWr;
    const avgCtr = counter.length > 0
      ? counter.reduce((s, x) => s + x.opp_win_rate, 0) / counter.length : 0.5;
    const score = 0.4 * baseWr + 0.35 * avgSyn + 0.25 * (1 - avgCtr);

    return {
      hero_id: candidateId,
      hero_name: r.hero_name,
      games,
      wins,
      base_wr: baseWr,
      avg_synergy_wr: avgSyn,
      avg_counter_opp_wr: avgCtr,
      score,
      synergy,
      counter,
    };
  }).sort((a, b) => b.score - a.score).slice(0, 30);
}

// ---------- F3: Season Pass ----------
const SEASON_PASS_TIERS = [
  { name: 'Bronze',   min_xp: 0 },
  { name: 'Silver',   min_xp: 100 },
  { name: 'Gold',     min_xp: 300 },
  { name: 'Platinum', min_xp: 700 },
  { name: 'Diamond',  min_xp: 1500 },
  { name: 'Master',   min_xp: 3000 },
];
const SEASON_PASS_XP = {
  win: 30,
  loss: 10,
  mvp: 20,
  hot_streak_5: 50,
  hot_streak_10: 100,
};

function _seasonPassTierFor(xp) {
  let current = SEASON_PASS_TIERS[0];
  let next = null;
  for (let i = 0; i < SEASON_PASS_TIERS.length; i++) {
    if (xp >= SEASON_PASS_TIERS[i].min_xp) {
      current = SEASON_PASS_TIERS[i];
      next = SEASON_PASS_TIERS[i + 1] || null;
    }
  }
  const tierStart = current.min_xp;
  const tierEnd = next ? next.min_xp : current.min_xp;
  const span = Math.max(tierEnd - tierStart, 1);
  const into = Math.max(xp - tierStart, 0);
  return {
    tier_name: current.name,
    tier_min_xp: tierStart,
    next_tier_name: next ? next.name : null,
    next_tier_min_xp: next ? next.min_xp : null,
    progress_pct: next ? Math.min(100, Math.round((into / span) * 100)) : 100,
    xp_into_tier: into,
    xp_to_next: next ? Math.max(0, next.min_xp - xp) : 0,
  };
}

async function awardSeasonPassXp({ accountId, seasonNumber, matchId, source, xpDelta, notes = null }) {
  if (!accountId || !seasonNumber || !source || typeof xpDelta !== 'number') return false;
  const p = getPool();
  // Idempotent insert via UNIQUE (account_id, season_number, match_id, source).
  // matchId may be null for non-match XP sources (none currently, but reserved).
  const r = await p.query(
    `INSERT INTO season_pass_xp_events (account_id, season_number, match_id, source, xp_delta, notes)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (account_id, season_number, match_id, source) DO NOTHING
     RETURNING id`,
    [accountId, seasonNumber, matchId || null, source, xpDelta, notes]
  );
  return r.rowCount > 0;
}

// Grant win/loss + hot-streak XP for every player in a freshly-recorded match.
// Hot streaks are awarded when the player's rolling win streak reaches a
// 5- or 10-game threshold for the first time in this season (idempotent
// via UNIQUE constraint on source).
async function grantSeasonPassXpForMatch(matchId, seasonId) {
  if (!matchId || !seasonId) return { granted: 0 };
  const p = getPool();
  const psRes = await p.query(`
    SELECT ps.account_id, ps.team, m.radiant_win
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.match_id = $1 AND ps.account_id != 0
  `, [matchId]);

  let granted = 0;
  for (const row of psRes.rows) {
    const won = (row.team === 'radiant') === row.radiant_win;
    const src = won ? 'win' : 'loss';
    const xp = won ? SEASON_PASS_XP.win : SEASON_PASS_XP.loss;
    if (await awardSeasonPassXp({ accountId: row.account_id, seasonNumber: seasonId, matchId, source: src, xpDelta: xp })) granted++;

    if (won) {
      try {
        const streak = await getPlayerCurrentStreak([row.account_id]);
        // Only fire once per match for the first time the streak hits each milestone.
        // Idempotency comes from the UNIQUE (account_id, season, match_id, source) constraint
        // — if streak hits 7 then 8, hot_streak_5 was already inserted for the *match where it
        // first hit 5*, not this match. So we only grant when streak === 5 or === 10 exactly.
        if (streak === 5) {
          if (await awardSeasonPassXp({ accountId: row.account_id, seasonNumber: seasonId, matchId, source: 'hot_streak_5', xpDelta: SEASON_PASS_XP.hot_streak_5 })) granted++;
        } else if (streak === 10) {
          if (await awardSeasonPassXp({ accountId: row.account_id, seasonNumber: seasonId, matchId, source: 'hot_streak_10', xpDelta: SEASON_PASS_XP.hot_streak_10 })) granted++;
        }
      } catch (e) {
        // Streak detection is best-effort — never block XP grant on it.
      }
    }
  }
  return { granted };
}

// Grant MVP XP for the current MVP of a match (whoever has the most votes).
// Called from saveMatchRating after each MVP vote insert; idempotent.
async function grantSeasonPassXpForMatchMvp(matchId, seasonId) {
  if (!matchId || !seasonId) return false;
  const p = getPool();
  const r = await p.query(
    `SELECT rated_account_id
       FROM match_ratings
      WHERE match_id = $1 AND is_mvp_vote = TRUE AND rated_account_id IS NOT NULL
      GROUP BY rated_account_id
      ORDER BY COUNT(*) DESC, rated_account_id ASC
      LIMIT 1`,
    [matchId]
  );
  if (!r.rows[0]) return false;
  return await awardSeasonPassXp({
    accountId: r.rows[0].rated_account_id,
    seasonNumber: seasonId,
    matchId,
    source: 'mvp',
    xpDelta: SEASON_PASS_XP.mvp,
  });
}

async function getSeasonPassProgress(accountId, seasonNumber) {
  const p = getPool();
  // Resolve season — fall back to current active season if not provided.
  let season = seasonNumber;
  if (!season) {
    const a = await getActiveSeason();
    if (!a) return null;
    season = a.id;
  }
  const totalRes = await p.query(
    `SELECT COALESCE(SUM(xp_delta),0)::int AS total_xp,
            COUNT(*)::int AS event_count
       FROM season_pass_xp_events
      WHERE account_id = $1 AND season_number = $2`,
    [accountId, season]
  );
  const recentRes = await p.query(
    `SELECT match_id, source, xp_delta, notes, created_at
       FROM season_pass_xp_events
      WHERE account_id = $1 AND season_number = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 20`,
    [accountId, season]
  );
  const totalXp = totalRes.rows[0]?.total_xp || 0;
  const tier = _seasonPassTierFor(totalXp);
  return {
    account_id: String(accountId),
    season_number: season,
    total_xp: totalXp,
    event_count: totalRes.rows[0]?.event_count || 0,
    tier,
    tiers: SEASON_PASS_TIERS,
    xp_rules: SEASON_PASS_XP,
    recent_events: recentRes.rows,
  };
}

async function getSeasonPassLeaderboard(seasonNumber = null, limit = 50) {
  const p = getPool();
  let season = seasonNumber;
  if (!season) {
    const a = await getActiveSeason();
    if (!a) return [];
    season = a.id;
  }
  const res = await p.query(`
    SELECT spxp.account_id,
           COALESCE(NULLIF(n.nickname, ''), 'Unknown') AS nickname,
           COALESCE(SUM(spxp.xp_delta), 0)::int AS total_xp,
           COUNT(*)::int AS event_count
      FROM season_pass_xp_events spxp
      LEFT JOIN nicknames n ON n.account_id = spxp.account_id
     WHERE spxp.season_number = $1
     GROUP BY spxp.account_id, n.nickname
     ORDER BY total_xp DESC
     LIMIT $2
  `, [season, limit]);
  return res.rows.map(r => ({
    ...r,
    account_id: String(r.account_id),
    tier: _seasonPassTierFor(r.total_xp),
  }));
}

// Backfill all season-pass events for a season from match history.
// Safe to re-run — every insert is idempotent. Returns count of newly inserted events.
async function recomputeSeasonPassFromHistory(seasonNumber = null) {
  const p = getPool();
  let season = seasonNumber;
  if (!season) {
    const a = await getActiveSeason();
    if (!a) return { granted: 0, processed_matches: 0 };
    season = a.id;
  }
  const matchesRes = await p.query(
    `SELECT match_id FROM matches WHERE season_id = $1 AND is_legacy = false ORDER BY match_id ASC`,
    [season]
  );
  let total = 0;
  for (const m of matchesRes.rows) {
    const r = await grantSeasonPassXpForMatch(m.match_id, season);
    total += r.granted;
    // MVP grant — best effort
    await grantSeasonPassXpForMatchMvp(m.match_id, season).catch(() => {});
  }
  return { granted: total, processed_matches: matchesRes.rows.length };
}

// ---------- F4: Notification preferences ----------
const NOTIFICATION_CATEGORIES = [
  { key: 'post_match_dm',     label: 'Post-match report DM',          default: true },
  { key: 'mvp_vote',          label: 'MVP vote prompt',               default: true },
  { key: 'attitude_vote',     label: 'Teammate attitude vote prompt', default: true },
  { key: 'hot_streak',        label: 'Hot streak announcement DM',    default: true },
  { key: 'schedule_reminder', label: 'Game schedule reminder DM',     default: true },
  { key: 'weekly_recap',      label: 'Weekly recap DM',               default: true },
  // Coaching marketplace categories — only meaningful while
  // `coaching_marketplace` flag is on, but registered here so they show up
  // in the existing notification settings page once the flag flips.
  { key: 'coaching_booking_confirmed', label: 'Coaching: booking confirmed DM', default: true },
  { key: 'coaching_session_reminder',  label: 'Coaching: 1-hour session reminder DM', default: true },
  { key: 'coaching_review_request',    label: 'Coaching: post-session review prompt DM', default: true },
];

async function isNotificationEnabled(accountId, category) {
  if (!accountId || !category) return true; // fail-open
  const p = getPool();
  try {
    const r = await p.query(
      `SELECT enabled FROM notification_prefs WHERE account_id = $1 AND category = $2`,
      [accountId, category]
    );
    if (!r.rows.length) return true; // no row = default enabled
    return !!r.rows[0].enabled;
  } catch (e) {
    return true; // never block a DM on a pref-table failure
  }
}

async function getNotificationPrefs(accountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT category, enabled FROM notification_prefs WHERE account_id = $1`,
    [accountId]
  );
  const map = {};
  for (const row of r.rows) map[row.category] = !!row.enabled;
  return NOTIFICATION_CATEGORIES.map(c => ({
    key: c.key,
    label: c.label,
    enabled: c.key in map ? map[c.key] : c.default,
  }));
}

async function setNotificationPref(accountId, category, enabled) {
  const p = getPool();
  const known = NOTIFICATION_CATEGORIES.find(c => c.key === category);
  if (!known) throw new Error(`Unknown notification category: ${category}`);
  await p.query(
    `INSERT INTO notification_prefs (account_id, category, enabled, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (account_id, category)
     DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
    [accountId, category, !!enabled]
  );
  return true;
}

// ---------- F5: Tournament live ----------
async function getTournamentLive(tournamentId) {
  const p = getPool();
  const t = await p.query(`SELECT * FROM tournaments WHERE id = $1`, [tournamentId]);
  if (!t.rows[0]) return null;
  const tournament = t.rows[0];

  // All bracket matches plus the linked recorded match outcome (if any)
  const matchesRes = await p.query(`
    SELECT tm.id AS bracket_match_id, tm.round, tm.position, tm.winner_id,
           tm.player1_id AS p1_account_id, tm.player2_id AS p2_account_id,
           tm.match_id AS recorded_match_id,
           m.radiant_win, m.start_time, m.duration,
           n1.nickname AS p1_nickname, n2.nickname AS p2_nickname
      FROM tournament_matches tm
      LEFT JOIN matches m ON m.match_id = tm.match_id
      LEFT JOIN nicknames n1 ON n1.account_id = tm.player1_id
      LEFT JOIN nicknames n2 ON n2.account_id = tm.player2_id
     WHERE tm.tournament_id = $1
     ORDER BY tm.round ASC, tm.position ASC
  `, [tournamentId]);

  // Standings — wins per participant
  const standingsRes = await p.query(`
    SELECT tp.account_id,
           COALESCE(NULLIF(n.nickname,''), 'Unknown') AS nickname,
           COALESCE(SUM(CASE WHEN tm.winner_id = tp.account_id THEN 1 ELSE 0 END), 0)::int AS wins,
           COALESCE(SUM(CASE WHEN tm.winner_id IS NOT NULL
                              AND (tm.player1_id = tp.account_id OR tm.player2_id = tp.account_id)
                              AND tm.winner_id != tp.account_id THEN 1 ELSE 0 END), 0)::int AS losses
      FROM tournament_participants tp
      LEFT JOIN nicknames n ON n.account_id = tp.account_id
      LEFT JOIN tournament_matches tm ON tm.tournament_id = tp.tournament_id
                                      AND (tm.player1_id = tp.account_id OR tm.player2_id = tp.account_id)
     WHERE tp.tournament_id = $1
     GROUP BY tp.account_id, n.nickname
     ORDER BY wins DESC, losses ASC
  `, [tournamentId]);

  // Prize split distribution
  const split = Array.isArray(tournament.prize_split) ? tournament.prize_split : [50, 30, 20];
  const pool = parseFloat(tournament.prize_pool || 0);
  const standings = standingsRes.rows;
  const distribution = split.map((pct, idx) => ({
    place: idx + 1,
    pct,
    amount: Math.round(pool * (pct / 100) * 100) / 100,
    account_id: standings[idx] ? String(standings[idx].account_id) : null,
    nickname: standings[idx] ? standings[idx].nickname : null,
  }));

  // UI-friendly alias: only matches that have a recorded match outcome, sorted newest first.
  const recentMatches = matchesRes.rows
    .filter(r => r.recorded_match_id != null)
    .sort((a, b) => {
      const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
      const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 20)
    .map(r => ({
      match_id: r.recorded_match_id,
      radiant_win: r.radiant_win,
      match_date: r.start_time,
      duration: r.duration,
    }));

  return {
    tournament: {
      ...tournament,
      account_id: tournament.account_id ? String(tournament.account_id) : null,
    },
    matches: matchesRes.rows,
    recent_matches: recentMatches,
    standings: standings.map(s => ({ ...s, account_id: String(s.account_id) })),
    prize_pool: pool,
    prize_split: split,
    prize_distribution: distribution,
    refreshed_at: new Date().toISOString(),
  };
}

async function setTournamentPrizeSplit(tournamentId, splitArray) {
  if (!Array.isArray(splitArray) || splitArray.length === 0) {
    throw new Error('prize_split must be a non-empty array of percentages');
  }
  const cleaned = splitArray.map(n => Math.max(0, Math.min(100, parseFloat(n) || 0)));
  const sum = cleaned.reduce((s, x) => s + x, 0);
  if (Math.abs(sum - 100) > 0.5) {
    throw new Error(`prize_split percentages must sum to 100 (got ${sum})`);
  }
  const p = getPool();
  await p.query(
    `UPDATE tournaments SET prize_split = $1::jsonb WHERE id = $2`,
    [JSON.stringify(cleaned), tournamentId]
  );
  return cleaned;
}

// ---------- F6: MVP / attitude trends ----------
// Rolling windowed stats per match for an account, used for a trend chart.
// Each row = "after this match, the player's last N MVP rate + avg attitude".
async function getMvpAttitudeTrends(accountId, windowSize = 10) {
  const p = getPool();
  const matchesRes = await p.query(`
    SELECT ps.match_id, m.start_time
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.account_id = $1 AND m.is_legacy = false
     ORDER BY m.start_time ASC NULLS LAST, ps.match_id ASC
  `, [accountId]);

  if (!matchesRes.rows.length) return { points: [], window_size: windowSize };

  const matchIds = matchesRes.rows.map(r => r.match_id);

  // For each match, was this account the MVP?
  const mvpRes = await p.query(`
    SELECT match_id, rated_account_id, COUNT(*)::int AS votes
      FROM match_ratings
     WHERE match_id = ANY($1) AND is_mvp_vote = TRUE AND rated_account_id IS NOT NULL
     GROUP BY match_id, rated_account_id
  `, [matchIds]);
  const mvpMap = new Map(); // match_id -> winner account id
  const mvpWinners = {};
  for (const r of mvpRes.rows) {
    const cur = mvpWinners[r.match_id];
    if (!cur || r.votes > cur.votes || (r.votes === cur.votes && String(r.rated_account_id) < String(cur.account))) {
      mvpWinners[r.match_id] = { account: String(r.rated_account_id), votes: r.votes };
    }
  }
  for (const [mid, v] of Object.entries(mvpWinners)) mvpMap.set(mid, v.account);

  // Average attitude received per match (from teammates that rated them)
  const attRes = await p.query(`
    SELECT match_id, ROUND(AVG(attitude_score)::numeric, 2) AS avg_attitude, COUNT(*)::int AS rating_count
      FROM match_ratings
     WHERE match_id = ANY($1) AND rated_account_id = $2 AND attitude_score IS NOT NULL
     GROUP BY match_id
  `, [matchIds, accountId]);
  const attMap = new Map();
  for (const r of attRes.rows) attMap.set(r.match_id, { avg: r.avg_attitude, n: r.rating_count });

  // Walk forward, maintain window
  const window = []; // [{ wasMvp: 0|1, attitude: number|null }]
  const points = [];
  for (const m of matchesRes.rows) {
    const wasMvp = mvpMap.get(m.match_id) === String(accountId) ? 1 : 0;
    const att = attMap.get(m.match_id);
    window.push({ wasMvp, attitude: att ? parseFloat(att.avg) : null });
    if (window.length > windowSize) window.shift();

    const mvpRate = window.reduce((s, x) => s + x.wasMvp, 0) / window.length;
    const attVals = window.map(x => x.attitude).filter(v => v !== null);
    const attAvg = attVals.length ? attVals.reduce((s, x) => s + x, 0) / attVals.length : null;

    points.push({
      match_id: m.match_id,
      start_time: m.start_time,
      mvp_rate: Math.round(mvpRate * 1000) / 1000,
      avg_attitude: attAvg !== null ? Math.round(attAvg * 100) / 100 : null,
      window_size: window.length,
    });
  }

  // Aggregate aliases for the UI — total counts + the latest rolling-window values.
  const mvpCount = points.reduce((s, pt, i) => {
    const isMvp = mvpMap.get(matchesRes.rows[i].match_id) === String(accountId);
    return s + (isMvp ? 1 : 0);
  }, 0);
  const last = points[points.length - 1] || null;

  return {
    account_id: String(accountId),
    mvp_count: mvpCount,
    mvp_rate: last ? last.mvp_rate : null,
    attitude_avg: last ? last.avg_attitude : null,
    window_size: windowSize,
    total_matches: matchesRes.rows.length,
    points,
  };
}

// ---------- F7: Web push ----------
async function addPushSubscription({ accountId, endpoint, p256dh, auth, userAgent = null }) {
  if (!accountId || !endpoint || !p256dh || !auth) {
    throw new Error('addPushSubscription: missing required field');
  }
  const p = getPool();
  await p.query(
    `INSERT INTO web_push_subscriptions (account_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET account_id = EXCLUDED.account_id,
           p256dh     = EXCLUDED.p256dh,
           auth       = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent`,
    [accountId, endpoint, p256dh, auth, userAgent]
  );
  return true;
}

async function removePushSubscriptionByEndpoint(endpoint) {
  const p = getPool();
  const r = await p.query(`DELETE FROM web_push_subscriptions WHERE endpoint = $1`, [endpoint]);
  return r.rowCount;
}

async function getPushSubscriptionsForAccount(accountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT id, endpoint, p256dh, auth, user_agent, created_at, last_used_at
       FROM web_push_subscriptions WHERE account_id = $1`,
    [accountId]
  );
  return r.rows;
}

async function getPushSubscriptionsForAccounts(accountIds) {
  if (!Array.isArray(accountIds) || !accountIds.length) return [];
  const p = getPool();
  const r = await p.query(
    `SELECT id, account_id, endpoint, p256dh, auth, user_agent
       FROM web_push_subscriptions WHERE account_id = ANY($1::bigint[])`,
    [accountIds]
  );
  return r.rows;
}

async function touchPushSubscription(endpoint) {
  const p = getPool();
  await p.query(`UPDATE web_push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1`, [endpoint]);
}

// ---------- Profile customization (`profile_customization`) ----------
// One row per account. Returns null when the player has never customized.
async function getPlayerProfileCustomization(accountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT id, account_id, bio, custom_title, theme_accent,
            pinned_hero_id, pinned_hero_caption, pinned_match_id,
            profile_frame, extras, created_at, updated_at
       FROM player_profiles
      WHERE account_id = $1`,
    [accountId]
  );
  return r.rows[0] || null;
}

// Upsert. All fields are optional; pass null to clear an individual field.
// The route handler validates premium-gated values BEFORE calling this.
async function setPlayerProfileCustomization(accountId, fields = {}) {
  if (!accountId) throw new Error('setPlayerProfileCustomization: account_id required');
  const p = getPool();
  const {
    bio = null,
    custom_title = null,
    theme_accent = null,
    pinned_hero_id = null,
    pinned_hero_caption = null,
    pinned_match_id = null,
    profile_frame = null,
    extras = null,
  } = fields;
  const r = await p.query(
    `INSERT INTO player_profiles
       (account_id, bio, custom_title, theme_accent,
        pinned_hero_id, pinned_hero_caption, pinned_match_id, profile_frame, extras, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::jsonb, '{}'::jsonb), NOW())
     ON CONFLICT (account_id) DO UPDATE
       SET bio = EXCLUDED.bio,
           custom_title = EXCLUDED.custom_title,
           theme_accent = EXCLUDED.theme_accent,
           pinned_hero_id = EXCLUDED.pinned_hero_id,
           pinned_hero_caption = EXCLUDED.pinned_hero_caption,
           pinned_match_id = EXCLUDED.pinned_match_id,
           profile_frame = EXCLUDED.profile_frame,
           extras = EXCLUDED.extras,
           updated_at = NOW()
     RETURNING id, account_id, bio, custom_title, theme_accent,
               pinned_hero_id, pinned_hero_caption, pinned_match_id,
               profile_frame, extras, created_at, updated_at`,
    [accountId, bio, custom_title, theme_accent, pinned_hero_id, pinned_hero_caption, pinned_match_id, profile_frame, extras ? JSON.stringify(extras) : null]
  );
  return r.rows[0];
}

// ---------- Onboarding ----------
async function getOnboardingStatus(accountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT onboarding_complete FROM player_profiles WHERE account_id = $1`,
    [accountId]
  );
  if (!r.rows[0]) return false;
  return !!r.rows[0].onboarding_complete;
}

async function setOnboardingComplete(accountId, complete = true) {
  const p = getPool();
  await p.query(
    `INSERT INTO player_profiles (account_id, onboarding_complete, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (account_id) DO UPDATE
       SET onboarding_complete = EXCLUDED.onboarding_complete,
           updated_at = NOW()`,
    [accountId, !!complete]
  );
  return true;
}

// ---------- Personalised home data ----------
async function getPlayerHomeData(accountId) {
  const p = getPool();

  const [ratingRes, recentRes, streakRes, heroRes, scheduleRes, activeSessionRes, playerInSessionRes] = await Promise.all([
    // MMR + record
    p.query(
      `SELECT mmr, wins, losses, games_played, mu, sigma
         FROM ratings WHERE player_id = $1`,
      [accountId]
    ),
    // Last 3 matches with player's own row
    p.query(
      `SELECT m.match_id, m.date, m.radiant_win, m.duration,
              ps.hero_id, ps.hero_name, ps.kills, ps.deaths, ps.assists, ps.team,
              CASE WHEN (ps.team = 'radiant' AND m.radiant_win)
                     OR (ps.team = 'dire' AND NOT m.radiant_win)
                   THEN true ELSE false END AS won
         FROM player_stats ps
         JOIN matches m ON m.match_id = ps.match_id
        WHERE ps.account_id = $1 AND m.is_legacy = false
        ORDER BY m.date DESC, m.match_id DESC
        LIMIT 3`,
      [accountId]
    ),
    // Current streak
    p.query(
      `SELECT ps.team, m.radiant_win
         FROM player_stats ps
         JOIN matches m ON m.match_id = ps.match_id
        WHERE ps.account_id = $1 AND m.is_legacy = false
        ORDER BY m.date DESC, m.match_id DESC
        LIMIT 15`,
      [accountId]
    ),
    // Top hero from last 7 days
    p.query(
      `SELECT ps.hero_id, ps.hero_name, COUNT(*) AS picks,
              SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win)
                            OR (ps.team = 'dire' AND NOT m.radiant_win)
                       THEN 1 ELSE 0 END) AS wins
         FROM player_stats ps
         JOIN matches m ON m.match_id = ps.match_id
        WHERE ps.account_id = $1
          AND m.date >= NOW() - INTERVAL '7 days'
          AND m.is_legacy = false
        GROUP BY ps.hero_id, ps.hero_name
        ORDER BY picks DESC, wins DESC
        LIMIT 1`,
      [accountId]
    ),
    // Next upcoming scheduled game
    p.query(
      `SELECT id, scheduled_at, note
         FROM scheduled_games
        WHERE scheduled_at > NOW() AND is_cancelled = false
        ORDER BY scheduled_at ASC
        LIMIT 1`
    ),
    // Active inhouse lobby/session
    p.query(
      `SELECT id, status, captain_mode, notes, created_at, accept_phase_seconds
         FROM inhouse_sessions
        WHERE status IN ('open','accepting','drafting','server_failed','in_progress')
        ORDER BY created_at DESC
        LIMIT 1`
    ),
    // Is this player already in the active session?
    p.query(
      `SELECT isp.account_id, isp.team, isp.status AS player_status, isp.accepted_at
         FROM inhouse_session_players isp
         JOIN inhouse_sessions s ON s.id = isp.session_id
        WHERE isp.account_id = $1
          AND s.status IN ('open','accepting','drafting','server_failed','in_progress')
        LIMIT 1`,
      [accountId]
    ),
  ]);

  const rating = ratingRes.rows[0] || null;
  const lastMatches = recentRes.rows;

  // Compute streak
  let streak = 0;
  const streakRows = streakRes.rows;
  if (streakRows.length > 0) {
    const firstWon = (streakRows[0].team === 'radiant') === streakRows[0].radiant_win;
    let count = 0;
    for (const row of streakRows) {
      const won = (row.team === 'radiant') === row.radiant_win;
      if (won === firstWon) count++;
      else break;
    }
    streak = firstWon ? count : -count;
  }

  const activeSession = activeSessionRes.rows[0] || null;
  const playerInSession = playerInSessionRes.rows[0] || null;

  return {
    mmr: rating ? Math.round(parseFloat(rating.mmr)) : null,
    wins: rating ? rating.wins : null,
    losses: rating ? rating.losses : null,
    games_played: rating ? rating.games_played : null,
    last_matches: lastMatches,
    streak,
    top_hero: heroRes.rows[0] || null,
    upcoming_game: scheduleRes.rows[0] || null,
    active_session: activeSession
      ? {
          id: activeSession.id,
          status: activeSession.status,
          captain_mode: activeSession.captain_mode,
          notes: activeSession.notes,
          created_at: activeSession.created_at,
          player_joined: !!playerInSession,
          player_team: playerInSession?.team || null,
          player_accepted: playerInSession
            ? (playerInSession.player_status === 'accepted' || !!playerInSession.accepted_at)
            : null,
        }
      : null,
  };
}

// Public read for PlayerProfile rendering — denormalizes the pinned match
// (winner + duration + start_time) and the player's row in that match (hero +
// kills/deaths/assists) so the card can render without a second round trip.
// Returns null if the player has never customized; safe to call without the
// flag check (the route gates first).
async function getPlayerProfileCard(accountId) {
  const p = getPool();
  const base = await getPlayerProfileCustomization(accountId);
  if (!base) return null;

  let pinnedMatch = null;
  if (base.pinned_match_id) {
    const mres = await p.query(
      `SELECT m.match_id, m.radiant_win, m.duration, m.start_time
         FROM matches m
        WHERE m.match_id = $1`,
      [base.pinned_match_id]
    );
    if (mres.rows[0]) {
      const m = mres.rows[0];
      // Pull the player's own row in that match for KDA + hero context.
      const pres = await p.query(
        `SELECT hero_id, hero, kills, deaths, assists, player_slot
           FROM player_stats
          WHERE match_id = $1 AND account_id = $2
          LIMIT 1`,
        [base.pinned_match_id, accountId]
      );
      const ps = pres.rows[0] || null;
      const isRadiant = ps?.player_slot != null ? ps.player_slot < 128 : null;
      pinnedMatch = {
        match_id: m.match_id,
        radiant_win: m.radiant_win,
        duration: m.duration,
        start_time: m.start_time,
        player_won: isRadiant != null ? (isRadiant === m.radiant_win) : null,
        hero_id: ps?.hero_id || null,
        hero: ps?.hero || null,
        kills: ps?.kills ?? null,
        deaths: ps?.deaths ?? null,
        assists: ps?.assists ?? null,
      };
    }
  }

  return {
    ...base,
    pinned_match: pinnedMatch,
  };
}

// ---------- Gift purchases ----------
// Tracks gift checkouts for Pro and season-pass gifts. On webhook
// completion the recipient is activated. Gifter name is stored for the
// Discord DM notification.
async function createGiftCheckout({ gifterAccountId, recipientAccountId, giftType, stripeSessionId, amountCents, currency }) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO gift_purchases
       (gifter_account_id, recipient_account_id, gift_type, stripe_session_id, amount_cents, currency, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
     RETURNING *`,
    [gifterAccountId, recipientAccountId, giftType, stripeSessionId, amountCents, currency || 'aud']
  );
  return r.rows[0];
}

async function confirmGiftCheckout(stripeSessionId) {
  const p = getPool();
  // Mark pending → completed, but ALSO return already-completed rows so that
  // Stripe webhook retries can still retrieve the gift and re-check whether the
  // entitlement was granted (idempotent fulfillment pattern).
  const r = await p.query(
    `UPDATE gift_purchases
     SET status = CASE WHEN status = 'pending' THEN 'completed' ELSE status END,
         completed_at = COALESCE(completed_at, NOW())
     WHERE stripe_session_id = $1
     RETURNING *`,
    [stripeSessionId]
  );
  return r.rows[0] || null;
}

async function getGiftHistory(accountId) {
  const p = getPool();
  const id = parseInt(accountId, 10);
  const [sentRes, receivedRes] = await Promise.all([
    p.query(
      `SELECT gp.id, gp.gift_type, gp.amount_cents, gp.currency, gp.status,
              gp.created_at, gp.completed_at,
              n.nickname AS recipient_name, gp.recipient_account_id
         FROM gift_purchases gp
         LEFT JOIN nicknames n ON n.account_id = gp.recipient_account_id
        WHERE gp.gifter_account_id = $1
        ORDER BY gp.created_at DESC`,
      [id]
    ),
    p.query(
      `SELECT gp.id, gp.gift_type, gp.amount_cents, gp.currency, gp.status,
              gp.created_at, gp.completed_at,
              n.nickname AS gifter_name, gp.gifter_account_id
         FROM gift_purchases gp
         LEFT JOIN nicknames n ON n.account_id = gp.gifter_account_id
        WHERE gp.recipient_account_id = $1
        ORDER BY gp.created_at DESC`,
      [id]
    ),
  ]);
  return { sent: sentRes.rows, received: receivedRes.rows };
}

// ---------- Frame purchases ----------
async function createFrameCheckout({ accountId, frameId, stripeSessionId, amountCents, currency }) {
  const p = getPool();
  // On conflict by session ID (exact duplicate) → fetch existing row.
  // On conflict by (account_id, frame_id) with a pending row (abandoned checkout)
  // → update the stripe_session_id to the new one so the new checkout can complete.
  const r = await p.query(
    `INSERT INTO frame_purchases (account_id, frame_id, stripe_session_id, amount_cents, currency, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
     ON CONFLICT (account_id, frame_id) DO UPDATE
       SET stripe_session_id = EXCLUDED.stripe_session_id,
           amount_cents = EXCLUDED.amount_cents,
           created_at = NOW()
     WHERE frame_purchases.status = 'pending'
     RETURNING *`,
    [accountId, frameId, stripeSessionId, amountCents, currency || 'aud']
  );
  // If the UPDATE was skipped (frame already active), return the existing row.
  if (!r.rows[0]) {
    const existing = await p.query(
      `SELECT * FROM frame_purchases WHERE account_id = $1 AND frame_id = $2`,
      [accountId, frameId]
    );
    return existing.rows[0] || null;
  }
  return r.rows[0];
}

// confirmFramePurchase uses the Stripe session metadata (accountId, frameId)
// to activate the frame — independent of which pending stripe_session_id is
// stored in the table. This survives the race where a second checkout session
// overwrote the first session's ID; any paid session can still fulfil the frame.
// Errors propagate so the Stripe webhook returns 500 and Stripe retries.
async function confirmFramePurchase(stripeSessionId, accountId, frameId) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO frame_purchases (account_id, frame_id, stripe_session_id, status, purchased_at, created_at)
     VALUES ($1, $2, $3, 'active', NOW(), NOW())
     ON CONFLICT (account_id, frame_id) DO UPDATE
       SET status = 'active',
           purchased_at = COALESCE(frame_purchases.purchased_at, NOW()),
           stripe_session_id = EXCLUDED.stripe_session_id
     RETURNING *`,
    [accountId, frameId, stripeSessionId]
  );
  return r.rows[0] || null;
}

// Frames included in the Pro tier at no extra charge.
const PRO_BUNDLED_FRAMES = ['gold'];

async function hasFrameUnlocked(accountId, frameId, isPro = false) {
  if (isPro && PRO_BUNDLED_FRAMES.includes(frameId)) return true;
  const p = getPool();
  const r = await p.query(
    `SELECT 1 FROM frame_purchases WHERE account_id = $1 AND frame_id = $2 AND status = 'active' LIMIT 1`,
    [accountId, frameId]
  );
  return r.rows.length > 0;
}

async function getOwnedFrames(accountId, isPro = false) {
  const p = getPool();
  const r = await p.query(
    `SELECT frame_id FROM frame_purchases WHERE account_id = $1 AND status = 'active'`,
    [accountId]
  );
  const purchased = r.rows.map(row => row.frame_id);
  if (isPro) {
    for (const f of PRO_BUNDLED_FRAMES) {
      if (!purchased.includes(f)) purchased.push(f);
    }
  }
  return purchased;
}

// ---------- Season pass purchases (entitlement) ----------
async function grantSeasonPassActivation({ accountId, seasonNumber, giftStripeSessionId }) {
  const p = getPool();
  // Idempotent: ON CONFLICT (account_id, season_number) DO NOTHING so retries are safe.
  const r = await p.query(
    `INSERT INTO season_pass_purchases
       (account_id, season_number, gift_stripe_session_id, source, status, purchased_at)
     VALUES ($1, $2, $3, 'gift', 'active', NOW())
     ON CONFLICT (account_id, season_number) DO NOTHING
     RETURNING *`,
    [accountId, seasonNumber, giftStripeSessionId]
  );
  return r.rows[0] || null;
}

async function hasSeasonPassActivation(accountId, seasonNumber) {
  const p = getPool();
  const r = await p.query(
    `SELECT 1 FROM season_pass_purchases WHERE account_id = $1 AND season_number = $2 AND status = 'active' LIMIT 1`,
    [accountId, seasonNumber]
  );
  return r.rows.length > 0;
}

async function grantSeasonPassXpGift({ recipientAccountId, seasonId, xpAmount, stripeSessionId }) {
  return awardSeasonPassXp({
    accountId: recipientAccountId,
    seasonNumber: seasonId,
    matchId: null,
    source: `gift_${stripeSessionId?.slice(-8) || 'unknown'}`,
    xpDelta: xpAmount,
    notes: 'Gift purchase',
  });
}

// ---------- Pro Tier (`pro_tier`) ----------
// Lifetime-unlock paid feature. One row per Stripe checkout. Active rows
// grant Pro membership; refunded rows revoke it. The route layer caches
// isProMember() results briefly so we don't hammer the DB on every gated
// request.
async function isProMember(accountId) {
  if (!accountId) return false;
  const p = getPool();
  const r = await p.query(
    `SELECT 1 FROM pro_subscriptions
      WHERE account_id = $1 AND status = 'active'
      LIMIT 1`,
    [accountId]
  );
  return r.rows.length > 0;
}

// Returns the most-relevant subscription row for the player (active wins,
// then most recent pending, then most recent refunded). Used to render the
// settings/billing page so the player can see receipt details.
async function getProSubscription(accountId) {
  if (!accountId) return null;
  const p = getPool();
  const r = await p.query(
    `SELECT id, account_id, plan_type, status, stripe_session_id,
            stripe_payment_intent, amount_cents, currency,
            purchased_at, refunded_at, created_at, updated_at
       FROM pro_subscriptions
      WHERE account_id = $1
      ORDER BY (status = 'active') DESC,
               (status = 'pending') DESC,
               created_at DESC
      LIMIT 1`,
    [accountId]
  );
  return r.rows[0] || null;
}

// Insert a pending checkout row. Called from POST /api/pro/checkout.
async function createProCheckout({ accountId, stripeSessionId, planType = 'lifetime', amountCents = null, currency = 'aud' }) {
  if (!accountId) throw new Error('createProCheckout: accountId required');
  if (!stripeSessionId) throw new Error('createProCheckout: stripeSessionId required');
  const p = getPool();
  const r = await p.query(
    `INSERT INTO pro_subscriptions
       (account_id, plan_type, status, stripe_session_id, amount_cents, currency)
     VALUES ($1, $2, 'pending', $3, $4, $5)
     ON CONFLICT (stripe_session_id) DO UPDATE
       SET updated_at = NOW()
     RETURNING id, account_id, status, stripe_session_id`,
    [accountId, planType, stripeSessionId, amountCents, currency]
  );
  return r.rows[0];
}

// Confirm a pending checkout via webhook. Idempotent: if the row is already
// active, this is a no-op. Stamps purchased_at + the payment_intent so we
// can match later charge.refunded events back to the right row.
async function confirmProPurchase({ stripeSessionId, stripePaymentIntent = null, amountCents = null, currency = null }) {
  if (!stripeSessionId) throw new Error('confirmProPurchase: stripeSessionId required');
  const p = getPool();
  const r = await p.query(
    `UPDATE pro_subscriptions
        SET status = 'active',
            stripe_payment_intent = COALESCE($2, stripe_payment_intent),
            amount_cents = COALESCE($3, amount_cents),
            currency = COALESCE($4, currency),
            purchased_at = COALESCE(purchased_at, NOW()),
            updated_at = NOW()
      WHERE stripe_session_id = $1
      RETURNING id, account_id, status, purchased_at`,
    [stripeSessionId, stripePaymentIntent, amountCents, currency]
  );
  return r.rows[0] || null;
}

// Stripe `charge.refunded` handler. Marks any active row with the matching
// payment_intent as refunded. Returns the affected row (if any).
async function markProRefunded(stripePaymentIntent) {
  if (!stripePaymentIntent) return null;
  const p = getPool();
  const r = await p.query(
    `UPDATE pro_subscriptions
        SET status = 'refunded',
            refunded_at = NOW(),
            updated_at = NOW()
      WHERE stripe_payment_intent = $1 AND status = 'active'
      RETURNING id, account_id, status, refunded_at`,
    [stripePaymentIntent]
  );
  return r.rows[0] || null;
}

// Admin / debug listing of all active Pro members. Used by the admin panel.
async function listProMembers() {
  const p = getPool();
  const r = await p.query(
    `SELECT ps.id, ps.account_id, ps.plan_type, ps.amount_cents, ps.currency,
            ps.purchased_at, COALESCE(rp.display_name, ps.account_id::text) AS display_name
       FROM pro_subscriptions ps
       LEFT JOIN registered_players rp ON rp.account_id = ps.account_id
      WHERE ps.status = 'active'
      ORDER BY ps.purchased_at DESC NULLS LAST, ps.id DESC`
  );
  return r.rows;
}

// =============================================================================
// Coaching Marketplace (`coaching_marketplace`) helpers.
// All mutations are best-effort idempotent; status transitions are enforced
// in the route layer (so admin overrides remain possible). Eligibility is
// recomputed on every onboarding attempt — no caching beyond the request.
// =============================================================================

// Eligibility = top 5 of the all-time leaderboard OR Immortal+ Steam rank.
// Immortal in Valve's tier scheme is rank tier 80+. Returns boolean.
// Superusers / admins should bypass this in the route layer.
async function isCoachEligible(accountId) {
  if (!accountId) return false;
  const p = getPool();
  // Eligibility path 1: top-5 of the CURRENT season's computed leaderboard.
  // We deliberately use the active-season leaderboard rather than the
  // all-time `getLeaderboard()` so the eligibility set rolls over with the
  // ladder every season — a coach who was top-5 two seasons ago but has
  // since dropped off shouldn't keep selling sessions on stale credibility.
  // Falls back to the all-time leaderboard only if there's no active
  // season (boot/install case) so eligibility never breaks during season
  // transitions.
  try {
    const aidStr = String(accountId);
    const activeSeason = await getActiveSeason().catch(() => null);
    let top;
    if (activeSeason?.id) {
      const board = await getComputedLeaderboard(activeSeason.id).catch(() => []);
      top = board.slice(0, 5);
    } else {
      top = await getLeaderboard(5).catch(() => []);
    }
    if (top.some(r => String(r.player_id) === aidStr)) return true;
  } catch (_) { /* fall through to rank check */ }
  try {
    const r = await p.query(
      `SELECT dota_rank_tier FROM nicknames WHERE account_id = $1`,
      [accountId]
    );
    const tier = r.rows[0]?.dota_rank_tier;
    if (tier != null && Number(tier) >= 80) return true;
  } catch (_) { /* ignore */ }
  return false;
}

async function getCoach(accountId) {
  if (!accountId) return null;
  const p = getPool();
  const r = await p.query(`SELECT * FROM coaches WHERE account_id = $1`, [accountId]);
  return r.rows[0] || null;
}

async function getCoachById(id) {
  const p = getPool();
  const r = await p.query(`SELECT * FROM coaches WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

// Insert-on-first-call coach row used by Stripe Connect onboarding. After
// the row exists, subsequent updateCoach() calls patch fields. The Stripe
// account id is set once and never overwritten.
async function createCoachRow({ accountId, stripeAccountId = null, country = 'AU' }) {
  if (!accountId) throw new Error('createCoachRow: accountId required');
  const p = getPool();
  const r = await p.query(
    `INSERT INTO coaches (account_id, stripe_account_id, country)
     VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE
       SET stripe_account_id = COALESCE(coaches.stripe_account_id, EXCLUDED.stripe_account_id),
           updated_at = NOW()
     RETURNING *`,
    [accountId, stripeAccountId, country]
  );
  return r.rows[0];
}

// Patch arbitrary editable fields. Whitelist enforced here so the route
// handler can pass req.body straight through.
const COACH_EDITABLE_FIELDS = new Set([
  'hourly_rate_cents', 'currency', 'bio', 'languages', 'taught_roles',
  'taught_heroes', 'intro_video_url', 'sample_replays', 'response_time_hours',
]);
async function updateCoach(accountId, patch) {
  if (!accountId) throw new Error('updateCoach: accountId required');
  const sets = [];
  const args = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch || {})) {
    if (!COACH_EDITABLE_FIELDS.has(k)) continue;
    sets.push(`${k} = $${i++}`);
    args.push(v);
  }
  if (!sets.length) return getCoach(accountId);
  args.push(accountId);
  const p = getPool();
  const r = await p.query(
    `UPDATE coaches SET ${sets.join(', ')}, updated_at = NOW()
      WHERE account_id = $${i} RETURNING *`,
    args
  );
  return r.rows[0] || null;
}

// Stripe `account.updated` webhook flips this when charges_enabled goes true.
// Status only advances 'kyc_pending' → 'active'; never overwrites a
// 'suspended' or 'delisted' row (admin sanctions take priority).
async function setCoachKycActive(stripeAccountId) {
  if (!stripeAccountId) return null;
  const p = getPool();
  const r = await p.query(
    `UPDATE coaches
        SET status = 'active', updated_at = NOW()
      WHERE stripe_account_id = $1 AND status = 'kyc_pending'
      RETURNING *`,
    [stripeAccountId]
  );
  return r.rows[0] || null;
}

async function setCoachStatus(accountId, status) {
  if (!['kyc_pending', 'active', 'suspended', 'delisted'].includes(status)) {
    throw new Error(`setCoachStatus: invalid status ${status}`);
  }
  const p = getPool();
  const r = await p.query(
    `UPDATE coaches SET status = $2, updated_at = NOW()
      WHERE account_id = $1 RETURNING *`,
    [accountId, status]
  );
  return r.rows[0] || null;
}

// Public browse listing — only active coaches. Filters narrow further.
async function listActiveCoaches({ language, role, hero, maxPriceCents } = {}) {
  const p = getPool();
  const conds = [`c.status = 'active'`];
  const args = [];
  let i = 1;
  if (language) { conds.push(`c.languages ILIKE $${i++}`); args.push(`%${language}%`); }
  if (role)     { conds.push(`c.taught_roles ILIKE $${i++}`); args.push(`%${role}%`); }
  if (hero)     { conds.push(`c.taught_heroes ILIKE $${i++}`); args.push(`%${hero}%`); }
  if (maxPriceCents != null) { conds.push(`c.hourly_rate_cents <= $${i++}`); args.push(maxPriceCents); }
  const r = await p.query(
    `SELECT c.id, c.account_id, c.hourly_rate_cents, c.currency, c.bio,
            c.languages, c.taught_roles, c.taught_heroes, c.intro_video_url,
            c.response_time_hours, c.country, c.created_at,
            COALESCE(n.nickname, c.account_id::text) AS display_name,
            (SELECT ROUND(AVG(rating)::numeric, 2) FROM coaching_reviews WHERE coach_account_id = c.account_id) AS avg_rating,
            (SELECT COUNT(*)::int FROM coaching_reviews WHERE coach_account_id = c.account_id) AS review_count,
            -- Inhouse credibility stats joined from ratings so the browse
            -- card can show MMR / W-L / win rate without an N+1 fetch.
            (SELECT MAX(mmr)::int FROM ratings WHERE player_id::text = c.account_id::text) AS mmr,
            (SELECT COALESCE(SUM(wins), 0)::int  FROM ratings WHERE player_id::text = c.account_id::text) AS wins,
            (SELECT COALESCE(SUM(losses), 0)::int FROM ratings WHERE player_id::text = c.account_id::text) AS losses,
            (SELECT COALESCE(SUM(games_played), 0)::int FROM ratings WHERE player_id::text = c.account_id::text) AS games_played,
            -- Top hero from full match history. LATERAL keeps it to one row
            -- per coach so the outer query stays a flat list.
            top_hero.hero_id  AS top_hero_id,
            top_hero.games    AS top_hero_games
       FROM coaches c
       LEFT JOIN LATERAL (
         SELECT hero_id, COUNT(*)::int AS games
           FROM player_stats
          WHERE account_id::text = c.account_id::text AND hero_id IS NOT NULL
          GROUP BY hero_id ORDER BY games DESC LIMIT 1
       ) top_hero ON TRUE
       LEFT JOIN nicknames n ON n.account_id = c.account_id
      WHERE ${conds.join(' AND ')}
      ORDER BY c.created_at DESC`,
    args
  );
  return r.rows;
}

// Lightweight credibility stats for a single coach — MMR, win/loss totals,
// and the most-played hero from match history. Used by /coaches/:id to
// surface the same context the browse page shows.
async function getCoachCredibilityStats(accountId) {
  if (!accountId) return null;
  const p = getPool();
  const ratings = await p.query(
    `SELECT MAX(mmr)::int AS mmr,
            COALESCE(SUM(wins), 0)::int AS wins,
            COALESCE(SUM(losses), 0)::int AS losses,
            COALESCE(SUM(games_played), 0)::int AS games_played
       FROM ratings WHERE player_id::text = $1::text`,
    [String(accountId)]
  );
  const topHero = await p.query(
    `SELECT hero_id, COUNT(*)::int AS games
       FROM player_stats
      WHERE account_id::text = $1::text AND hero_id IS NOT NULL
      GROUP BY hero_id ORDER BY games DESC LIMIT 1`,
    [String(accountId)]
  ).catch(() => ({ rows: [] }));
  return {
    ...(ratings.rows[0] || { mmr: null, wins: 0, losses: 0, games_played: 0 }),
    top_hero_id: topHero.rows[0]?.hero_id || null,
    top_hero_games: topHero.rows[0]?.games || 0,
  };
}

// Admin listing — every coach regardless of status. Used by the Coaching
// admin panel for KYC / sanction overview.
async function listAllCoaches() {
  const p = getPool();
  const r = await p.query(
    `SELECT c.*, COALESCE(n.nickname, c.account_id::text) AS display_name
       FROM coaches c
       LEFT JOIN nicknames n ON n.account_id = c.account_id
      ORDER BY c.created_at DESC`
  );
  return r.rows;
}

async function getCoachAvailability(coachAccountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT id, day_of_week, start_time, end_time, timezone
       FROM coach_availability_slots
      WHERE coach_account_id = $1
      ORDER BY day_of_week ASC, start_time ASC`,
    [coachAccountId]
  );
  return r.rows;
}

// Replace-all semantics: drop every existing slot for the coach and reinsert.
// Keeps the editor simple — no per-slot diffing in the API.
async function setCoachAvailability(coachAccountId, slots) {
  if (!coachAccountId) throw new Error('setCoachAvailability: coachAccountId required');
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM coach_availability_slots WHERE coach_account_id = $1`, [coachAccountId]);
    for (const s of (slots || [])) {
      const day = parseInt(s.day_of_week);
      if (Number.isNaN(day) || day < 0 || day > 6) continue;
      const start = String(s.start_time || '').slice(0, 5);
      const end   = String(s.end_time || '').slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) continue;
      const tz = String(s.timezone || 'Australia/Sydney').slice(0, 64);
      await client.query(
        `INSERT INTO coach_availability_slots
           (coach_account_id, day_of_week, start_time, end_time, timezone)
         VALUES ($1, $2, $3, $4, $5)`,
        [coachAccountId, day, start, end, tz]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return getCoachAvailability(coachAccountId);
}

// Booking creation. Called from POST /api/coach/:id/book BEFORE the Stripe
// Payment Intent is created — the row sits in 'pending' until the webhook.
async function createBooking({
  coachAccountId, studentAccountId, slotStartAt, durationMinutes = 60,
  amountCents, platformFeeCents, currency = 'aud', stripeSessionId = null,
  stripePaymentIntent = null,
}) {
  if (!coachAccountId || !studentAccountId) throw new Error('createBooking: coach + student required');
  if (!slotStartAt) throw new Error('createBooking: slotStartAt required');
  if (amountCents == null || platformFeeCents == null) throw new Error('createBooking: amounts required');
  const p = getPool();
  const r = await p.query(
    `INSERT INTO coaching_bookings
       (coach_account_id, student_account_id, slot_start_at, duration_minutes,
        amount_cents, platform_fee_cents, currency, stripe_session_id,
        stripe_payment_intent, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
     RETURNING *`,
    [coachAccountId, studentAccountId, slotStartAt, durationMinutes,
     amountCents, platformFeeCents, currency, stripeSessionId, stripePaymentIntent]
  );
  return r.rows[0];
}

async function getBooking(id) {
  const p = getPool();
  const r = await p.query(
    `SELECT b.*, COALESCE(nc.nickname, b.coach_account_id::text) AS coach_name,
            COALESCE(ns.nickname, b.student_account_id::text) AS student_name
       FROM coaching_bookings b
       LEFT JOIN nicknames nc ON nc.account_id = b.coach_account_id
       LEFT JOIN nicknames ns ON ns.account_id = b.student_account_id
      WHERE b.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function listCoachBookings(coachAccountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT b.*, COALESCE(ns.nickname, b.student_account_id::text) AS student_name
       FROM coaching_bookings b
       LEFT JOIN nicknames ns ON ns.account_id = b.student_account_id
      WHERE b.coach_account_id = $1
      ORDER BY b.slot_start_at DESC`,
    [coachAccountId]
  );
  return r.rows;
}

async function listStudentBookings(studentAccountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT b.*, COALESCE(nc.nickname, b.coach_account_id::text) AS coach_name
       FROM coaching_bookings b
       LEFT JOIN nicknames nc ON nc.account_id = b.coach_account_id
      WHERE b.student_account_id = $1
      ORDER BY b.slot_start_at DESC`,
    [studentAccountId]
  );
  return r.rows;
}

// Webhook handlers — keyed by stripe_session_id (checkout) or
// stripe_payment_intent (payment_intent.succeeded fallback).
async function markBookingPaidBySession(stripeSessionId, paymentIntent = null, chargeId = null) {
  if (!stripeSessionId) return null;
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'paid',
            stripe_payment_intent = COALESCE($2, stripe_payment_intent),
            stripe_charge_id = COALESCE($3, stripe_charge_id),
            updated_at = NOW()
      WHERE stripe_session_id = $1 AND status = 'pending'
      RETURNING *`,
    [stripeSessionId, paymentIntent, chargeId]
  );
  return r.rows[0] || null;
}

// Abandoned checkout cleanup. Stripe fires `checkout.session.expired`
// when the student walks away from the Stripe-hosted page. We flip the
// row to 'cancelled' so the slot frees up for other students — without
// this the row stays 'pending' forever and validateBookingSlot's
// double-booking check (which treats 'pending' as live) would block all
// future bookings on the same time. Status guard (`status='pending'`)
// makes it idempotent against a session that paid right before expiry.
async function markBookingCancelledBySession(stripeSessionId) {
  if (!stripeSessionId) return null;
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'cancelled',
            updated_at = NOW()
      WHERE stripe_session_id = $1 AND status = 'pending'
      RETURNING *`,
    [stripeSessionId]
  );
  return r.rows[0] || null;
}

async function markBookingPaidByIntent(paymentIntent, chargeId = null) {
  if (!paymentIntent) return null;
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'paid',
            stripe_charge_id = COALESCE($2, stripe_charge_id),
            updated_at = NOW()
      WHERE stripe_payment_intent = $1 AND status = 'pending'
      RETURNING *`,
    [paymentIntent, chargeId]
  );
  return r.rows[0] || null;
}

// Stamp a side's confirmation timestamp (idempotent — re-stamps preserve
// the original time via COALESCE). Returns the row + a derived
// `both_confirmed` flag so the caller can decide whether to call Stripe
// capture and then markBookingCompleted(). Critically does NOT auto-flip
// to 'completed' anymore — funds are still authorized-but-uncaptured at
// this point and the financial transition belongs in the caller alongside
// the Stripe API call so we never set DB ahead of money.
async function confirmBookingSide(id, side) {
  if (!['coach', 'student'].includes(side)) throw new Error('confirmBookingSide: invalid side');
  const col = side === 'coach' ? 'coach_confirmed_at' : 'student_confirmed_at';
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET ${col} = COALESCE(${col}, NOW()),
            updated_at = NOW()
      WHERE id = $1 AND status IN ('paid', 'disputed')
      RETURNING *`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    both_confirmed: !!(row.coach_confirmed_at && row.student_confirmed_at) && row.status === 'paid',
  };
}

// Synchronous "you've already captured the funds via Stripe — flip the row"
// transition. Idempotent and race-safe: only fires when the row is still in
// 'paid' (i.e. authorized & uncaptured) so a webhook arriving after we've
// already moved the row is a no-op. Returns the updated row or null.
async function markBookingCompletedById(id) {
  if (!id) throw new Error('markBookingCompletedById: id required');
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
      WHERE id = $1 AND status = 'paid'
      RETURNING *`,
    [id]
  );
  return r.rows[0] || null;
}

// Backup webhook path: payment_intent.succeeded only fires AFTER a
// capture call lands, so by the time it arrives the route handler has
// usually already marked the booking 'completed' synchronously. This is
// the idempotent safety net for the rare case where the capture call
// succeeded but the route then failed before updating the DB.
async function markBookingCompletedByIntent(paymentIntent) {
  if (!paymentIntent) return null;
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
      WHERE stripe_payment_intent = $1 AND status = 'paid'
      RETURNING *`,
    [paymentIntent]
  );
  return r.rows[0] || null;
}

// Auto-release a paid booking after the 48h grace window has passed without
// either side raising a dispute. Idempotent — re-running is a no-op once the
// row is no longer 'paid'. Returns the updated row or null if it was
// already past the 'paid' state (e.g. someone disputed mid-cron).
async function autoReleaseBooking(id) {
  if (!id) throw new Error('autoReleaseBooking: id required');
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'completed',
            completed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND status = 'paid'
      RETURNING *`,
    [id]
  );
  return r.rows[0] || null;
}

async function raiseBookingDispute(id, reason) {
  if (!id) throw new Error('raiseBookingDispute: id required');
  const p = getPool();
  // Disputes are only valid while funds are still held (status='paid' =
  // authorized but not captured). Once the booking is 'completed' the funds
  // have already been released to the coach via Stripe capture and the
  // student must use Stripe's chargeback flow instead — admin re-capture
  // would fail with `payment_intent_unexpected_state`. Locking the state
  // machine here at the DB layer prevents that whole class of inconsistency.
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'disputed',
            dispute_reason = $2,
            disputed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND status = 'paid'
      RETURNING *`,
    [id, String(reason || '').slice(0, 1000)]
  );
  return r.rows[0] || null;
}

// Coach signals "I've arrived at the session" — locks out the student-side
// no-show auto-refund. Idempotent: only the first call within the slot
// window stamps the timestamp; subsequent calls return the same row.
// Caller must verify `coachAccountId` matches the booking owner.
async function markCoachArrived(bookingId, coachAccountId) {
  if (!bookingId || !coachAccountId) {
    throw new Error('markCoachArrived: bookingId + coachAccountId required');
  }
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET coach_arrived_at = COALESCE(coach_arrived_at, NOW()),
            updated_at = NOW()
      WHERE id = $1 AND coach_account_id = $2 AND status = 'paid'
      RETURNING *`,
    [bookingId, coachAccountId]
  );
  return r.rows[0] || null;
}

// Used by both no-show auto-refund and admin manual refund. The actual
// Stripe refund call happens in the route layer; this only mutates state.
async function markBookingRefunded(id) {
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'refunded', refunded_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id]
  );
  return r.rows[0] || null;
}

// charge.refunded webhook fallback — match by payment_intent.
async function markBookingRefundedByIntent(paymentIntent) {
  if (!paymentIntent) return null;
  const p = getPool();
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'refunded', refunded_at = NOW(), updated_at = NOW()
      WHERE stripe_payment_intent = $1 AND status <> 'refunded'
      RETURNING *`,
    [paymentIntent]
  );
  return r.rows[0] || null;
}

async function listOpenDisputes() {
  const p = getPool();
  const r = await p.query(
    `SELECT b.*, COALESCE(nc.nickname, b.coach_account_id::text) AS coach_name,
            COALESCE(ns.nickname, b.student_account_id::text) AS student_name
       FROM coaching_bookings b
       LEFT JOIN nicknames nc ON nc.account_id = b.coach_account_id
       LEFT JOIN nicknames ns ON ns.account_id = b.student_account_id
      WHERE b.status = 'disputed'
      ORDER BY b.disputed_at DESC NULLS LAST`
  );
  return r.rows;
}

// Bookings that have started + 1h ago, are still 'paid', and neither side
// has raised a dispute. Used by the 48h auto-release cron (route layer).
async function listAutoReleasableBookings(graceHours = 48) {
  const p = getPool();
  const r = await p.query(
    `SELECT * FROM coaching_bookings
      WHERE status = 'paid'
        AND slot_start_at + (duration_minutes || ' minutes')::interval + ($1 || ' hours')::interval < NOW()`,
    [graceHours]
  );
  return r.rows;
}

// Reminder cron query — bookings starting in [55min, 65min] window that
// have not yet had a reminder sent. The route handler stamps reminder_sent_at
// after dispatch.
async function listBookingsDueForReminder() {
  const p = getPool();
  const r = await p.query(
    `SELECT * FROM coaching_bookings
      WHERE status = 'paid'
        AND reminder_sent_at IS NULL
        AND slot_start_at BETWEEN NOW() + INTERVAL '55 minutes' AND NOW() + INTERVAL '65 minutes'`
  );
  return r.rows;
}

async function stampBookingReminderSent(id) {
  const p = getPool();
  await p.query(
    `UPDATE coaching_bookings SET reminder_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

// Validate a proposed booking slot against the coach's published weekly
// availability (in the coach's own timezone) AND ensure it doesn't overlap
// any existing live booking. Returns { ok: true } or { ok: false, reason }.
//
// The coach declares slots like "Mon 18:00–22:00 Australia/Sydney"; we
// project the requested UTC slot_start_at into that timezone using
// Intl.DateTimeFormat (no timezone tables in PG needed) and check that
// [start, start+duration] fits inside one published window.
async function validateBookingSlot(coachAccountId, slotStartIso, durationMinutes) {
  if (!coachAccountId) return { ok: false, reason: 'coachAccountId required' };
  const slotStart = new Date(slotStartIso);
  if (isNaN(slotStart.getTime())) return { ok: false, reason: 'invalid slot_start_at' };
  const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

  // Booking horizon cap — Stripe authorization holds for manual-capture
  // PaymentIntents expire after ~7 days for most card networks (some
  // networks shorter). Because this implementation auths the card at
  // checkout time and only captures post-session, allowing bookings further
  // out than the auth window guarantees the capture call will fail with
  // `payment_intent_unexpected_state`. We cap at 6 days to keep one full
  // day of safety margin. Coaches can publish recurring weekly slots; the
  // student just has to (re-)book within the 6-day window. This matches the
  // pattern used by other Stripe-Connect marketplaces with manual capture.
  const HORIZON_DAYS = 6;
  if (slotStart.getTime() > Date.now() + HORIZON_DAYS * 86_400_000) {
    return {
      ok: false,
      reason: `Bookings are limited to ${HORIZON_DAYS} days in advance (Stripe authorization holds expire after that). Please come back closer to the date.`,
    };
  }
  if (slotStart.getTime() < Date.now()) {
    return { ok: false, reason: 'Cannot book a slot in the past.' };
  }

  const slots = await getCoachAvailability(coachAccountId);
  if (!slots.length) return { ok: false, reason: 'Coach has not published any availability slots.' };

  // Project the UTC instant into each slot's timezone and check fit.
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const localizeMinutes = (date, tz) => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const wd = parts.find(p => p.type === 'weekday')?.value;
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    return { dow: dowMap[wd], minutes: h * 60 + m };
  };
  const toMinutes = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(n => parseInt(n, 10));
    return (h || 0) * 60 + (m || 0);
  };

  let fitsAnySlot = false;
  for (const s of slots) {
    let tz = 'Australia/Sydney';
    try { new Intl.DateTimeFormat('en-US', { timeZone: s.timezone }); tz = s.timezone; } catch (_) { /* fall back */ }
    const startLocal = localizeMinutes(slotStart, tz);
    const endLocal = localizeMinutes(slotEnd, tz);
    const slotStartMins = toMinutes(s.start_time);
    const slotEndMins = toMinutes(s.end_time);
    // Both endpoints must land on the same published day_of_week within the
    // window — short-circuits sessions that straddle midnight or fall outside
    // the published hours.
    if (
      startLocal.dow === s.day_of_week &&
      endLocal.dow === s.day_of_week &&
      startLocal.minutes >= slotStartMins &&
      endLocal.minutes <= slotEndMins
    ) {
      fitsAnySlot = true;
      break;
    }
  }
  if (!fitsAnySlot) return { ok: false, reason: 'Selected time is outside the coach\'s published availability.' };

  // Double-booking check — anything live (paid/disputed/completed) on the
  // same slot for the same coach blocks the request. 'pending' rows only
  // block while their 30-minute Stripe checkout session could still pay
  // (we treat anything older than 35 min — 30 min checkout window + a 5
  // min webhook-delivery margin — as effectively dead). Without this
  // grace, an abandoned checkout where the `checkout.session.expired`
  // webhook was missed/delayed would lock the slot indefinitely.
  // Refunded/cancelled bookings free the slot back up immediately.
  const p = getPool();
  const conflict = await p.query(
    `SELECT 1 FROM coaching_bookings
      WHERE coach_account_id = $1
        AND (
          status IN ('paid', 'disputed', 'completed')
          OR (status = 'pending' AND created_at > NOW() - INTERVAL '35 minutes')
        )
        AND tstzrange(slot_start_at, slot_start_at + (duration_minutes || ' minutes')::interval, '[)')
            && tstzrange($2::timestamptz, $2::timestamptz + ($3 || ' minutes')::interval, '[)')
      LIMIT 1`,
    [coachAccountId, slotStart.toISOString(), durationMinutes],
  );
  if (conflict.rows.length) return { ok: false, reason: 'That slot is already booked.' };

  return { ok: true };
}

// ---------- Reviews ----------
// One review per booking max (UNIQUE constraint). Caller must verify that the
// booking is 'completed' AND owned by the student before invoking.
async function createCoachingReview({ bookingId, studentAccountId, coachAccountId, rating, writtenReview }) {
  if (!bookingId || !studentAccountId || !coachAccountId) {
    throw new Error('createCoachingReview: ids required');
  }
  const r = parseInt(rating);
  if (!Number.isFinite(r) || r < 1 || r > 5) throw new Error('createCoachingReview: rating must be 1–5');
  const p = getPool();
  const result = await p.query(
    `INSERT INTO coaching_reviews
       (booking_id, student_account_id, coach_account_id, rating, written_review)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (booking_id) DO NOTHING
     RETURNING *`,
    [bookingId, studentAccountId, coachAccountId, r, String(writtenReview || '').slice(0, 2000) || null]
  );
  return result.rows[0] || null;
}

async function getCoachReviews(coachAccountId, limit = 50) {
  const p = getPool();
  const r = await p.query(
    `SELECT cr.id, cr.rating, cr.written_review, cr.created_at,
            COALESCE(ns.nickname, cr.student_account_id::text) AS student_name
       FROM coaching_reviews cr
       LEFT JOIN nicknames ns ON ns.account_id = cr.student_account_id
      WHERE cr.coach_account_id = $1
      ORDER BY cr.created_at DESC
      LIMIT $2`,
    [coachAccountId, Math.min(limit, 200)]
  );
  return r.rows;
}

async function getCoachAggregateRating(coachAccountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS review_count
       FROM coaching_reviews WHERE coach_account_id = $1`,
    [coachAccountId]
  );
  return r.rows[0] || { avg_rating: null, review_count: 0 };
}

// ---------- Sanctions ----------
async function applyCoachSanction({ coachAccountId, severity, reason, adminId = null, expiresAt = null }) {
  if (!coachAccountId) throw new Error('applyCoachSanction: coachAccountId required');
  if (!['warning', 'suspended', 'delisted'].includes(severity)) throw new Error('applyCoachSanction: invalid severity');
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO coach_sanctions
         (coach_account_id, severity, reason, applied_by_admin_id, expires_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [coachAccountId, severity, String(reason || '').slice(0, 1000), adminId, expiresAt]
    );
    if (severity === 'suspended' || severity === 'delisted') {
      await client.query(
        `UPDATE coaches SET status = $2, updated_at = NOW() WHERE account_id = $1`,
        [coachAccountId, severity]
      );
    }
    await client.query('COMMIT');
    return r.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listCoachSanctions(coachAccountId = null) {
  const p = getPool();
  const r = coachAccountId
    ? await p.query(
        `SELECT * FROM coach_sanctions WHERE coach_account_id = $1 ORDER BY applied_at DESC`,
        [coachAccountId])
    : await p.query(
        `SELECT cs.*, COALESCE(n.nickname, cs.coach_account_id::text) AS coach_name
           FROM coach_sanctions cs
           LEFT JOIN nicknames n ON n.account_id = cs.coach_account_id
          ORDER BY cs.applied_at DESC LIMIT 200`);
  return r.rows;
}

// Lifetime platform revenue = sum of platform_fee_cents on completed bookings.
async function getCoachingPlatformRevenue() {
  const p = getPool();
  const r = await p.query(
    `SELECT COALESCE(SUM(platform_fee_cents), 0)::bigint AS total_cents,
            COUNT(*)::int AS completed_bookings
       FROM coaching_bookings WHERE status = 'completed'`
  );
  return r.rows[0] || { total_cents: 0, completed_bookings: 0 };
}

async function getCachedScoutingReport(accountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT report, generated_at FROM scouting_reports
     WHERE account_id = $1
       AND generated_at > NOW() - INTERVAL '24 hours'`,
    [accountId]
  );
  if (!r.rows.length) return null;
  return { ...r.rows[0].report, generated_at: r.rows[0].generated_at };
}

async function upsertScoutingReport(accountId, report) {
  const p = getPool();
  await p.query(
    `INSERT INTO scouting_reports (account_id, report, generated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (account_id) DO UPDATE
       SET report = EXCLUDED.report,
           generated_at = NOW()`,
    [accountId, JSON.stringify(report)]
  );
}

// Task #157 — Magazine v3 helpers are produced by a factory that closes over
// `getPool` so they share the same pool as everything else in this file.
const _magV3 = require('../monetization/magazineV3').createMagazineV3Db({ getPool });

module.exports = {
  init,
  getPool,
  // Magazine v3 (Task #157) — exposed via the same shape as the rest of `db`.
  magV3: _magV3,
  recordMatch,
  isMatchRecorded,
  isFileHashRecorded,
  getMatches,
  getMatchCount,
  getMatch,
  deleteMatch,
  setMatchWinner,
  getLeaderboard,
  getComputedLeaderboard,
  getImpactScores,
  computeTS2Leaderboard,
  computeSeasonTrueSkillV3,
  getMatchV3Modifiers,
  getPlayerV3ModifierHistory,
  _v3PerfScore,
  _v3PerfScoreBreakdown,
  _v3ScoresToModifiers,
  _v3HasCrossTeamCollision,
  getSetting,
  getAllSettings,
  setSetting,
  getAllFeatureFlags,
  getFeatureFlag,
  setFeatureFlag,
  getResolvedFeatureFlags,
  flipPreviewFlagsToOn,
  executeSeason10Launch,
  getSeasonTiers,
  ensureSeasonTiers,
  updateSeasonTier,
  placeAllPlayersInSeasonTiers,
  overridePlayerTier,
  getPlayerSeasonTier,
  getSeasonTierPlayers,
  DEFAULT_S10_TIERS,
  updateRating,
  getPlayerRating,
  getPlayerStats,
  getNickname,
  getMergedAccountIds,
  setNickname,
  setDiscordId,
  linkOwnDiscordId,
  unlinkOwnDiscordId,
  getNicknameByDiscordId,
  getDiscordIdByAccountId,
  getSteamByDiscordId,
  findAccountIdsByDiscordId,
  recordDiscordAutoJoinFailure,
  clearDiscordAutoJoinFailure,
  getDiscordAutoJoinFailureForAccount,
  listAllDiscordAutoJoinFailures,
  appendDiscordAutoJoinLog,
  getRecentDiscordAutoJoinLog,
  getDiscordAutoJoinDailyBuckets,
  getDiscordAutoJoinFailuresPage,
  pruneDiscordAutoJoinLog,
  pruneDiscordAutoJoinFailures,
  getDiscordAutoJoinFailuresPruneInfo,
  getDiscordIdCollisions,
  resolveDiscordIdCollision,
  tryEnforceDiscordIdUniqueIndex,
  getDiscordIdUniqueIndexStatus,
  getAllNicknames,
  scheduleGame,
  getUpcomingGames,
  getUpcomingGamesWithRsvps,
  cancelGame,
  saveMatchRating,
  getMatchRaterIds,
  logMatchDMSent,
  getMatchDMLog,
  getMatchRatings,
  getPlayerRatingsReceived,
  getDiscordIdsForMatch,
  getTopDuos,
  getPlayerConnections,
  getPlayerFormBatch,
  getPositionAverages,
  getHeroMatchups,
  getAllPlayers,
  getHeroStats,
  getOverallStats,
  getPositionStats,
  getSynergyMatrix,
  getSynergyHeatmap,
  getPlayerHeroes,
  getPlayerPositions,
  getHeroPlayers,
  getPlayerPositionProfiles,
  getPlayerHeroProfiles,
  registerPlayer,
  getRegisteredPlayers,
  getMatchHistory,
  recalculateAllRatings,
  updatePlayerPosition,
  deleteSeason,
  setSeasonEndConditions,
  getSeasonSummary,
  getSeasonPayouts,
  addSeasonPayout,
  deleteSeasonPayout,
  setPayoutWinner,
  setSeasonBuyinAmount,
  createBuyin,
  confirmBuyin,
  getBuyinBySession,
  getSeasonBuyins,
  getSeasons,
  getActiveSeason,
  createSeason,
  setActiveSeason,
  archiveSeason,
  updateMatchMeta,
  updateMatchDetails,
  updatePlayerStats,
  getMatchDraft,
  updateMatchDraft,
  clearMatchFileHash,
  getEnemySynergyHeatmap,
  getPlayerRatingHistory,
  getPlayerRecentRatingHistory,
  getPlayerStreaks,
  getHeadToHead,
  getPlayerComparison,
  getPlayerAchievements,
  checkAndGrantAchievements,
  getAchievementLeaderboard,
  getReferralLeaderboard,
  recomputeAllAchievements,
  getPredictions,
  savePrediction,
  getWeeklyRecap,
  getFunRecapStats,
  getPlayerByDiscordId,
  getDraftSuggestions,
  findDuplicateMatches,
  getPlayerRecentResults,
  getPlayerCurrentStreak,
  // Wave 2 / 3
  getHeroMetaV2,
  getDraftSuggestionsV2,
  awardSeasonPassXp,
  grantSeasonPassXpForMatch,
  grantSeasonPassXpForMatchMvp,
  getSeasonPassProgress,
  getSeasonPassLeaderboard,
  recomputeSeasonPassFromHistory,
  SEASON_PASS_TIERS,
  SEASON_PASS_XP,
  NOTIFICATION_CATEGORIES,
  isNotificationEnabled,
  getNotificationPrefs,
  setNotificationPref,
  getTournamentLive,
  setTournamentPrizeSplit,
  getMvpAttitudeTrends,
  getPlayerProfileCustomization,
  setPlayerProfileCustomization,
  getPlayerProfileCard,
  createGiftCheckout,
  confirmGiftCheckout,
  getGiftHistory,
  grantSeasonPassXpGift,
  createFrameCheckout,
  confirmFramePurchase,
  hasFrameUnlocked,
  getOwnedFrames,
  grantSeasonPassActivation,
  hasSeasonPassActivation,
  getOnboardingStatus,
  setOnboardingComplete,
  getPlayerHomeData,
  isProMember,
  getProSubscription,
  createProCheckout,
  confirmProPurchase,
  markProRefunded,
  listProMembers,
  // Coaching marketplace
  isCoachEligible,
  getCoach,
  getCoachById,
  createCoachRow,
  updateCoach,
  setCoachKycActive,
  setCoachStatus,
  listActiveCoaches,
  listAllCoaches,
  getCoachAvailability,
  setCoachAvailability,
  createBooking,
  getBooking,
  listCoachBookings,
  listStudentBookings,
  markBookingPaidBySession,
  markBookingCancelledBySession,
  markBookingPaidByIntent,
  confirmBookingSide,
  raiseBookingDispute,
  markCoachArrived,
  markBookingRefunded,
  markBookingRefundedByIntent,
  listOpenDisputes,
  listAutoReleasableBookings,
  validateBookingSlot,
  autoReleaseBooking,
  markBookingCompletedById,
  markBookingCompletedByIntent,
  getCoachCredibilityStats,
  listBookingsDueForReminder,
  stampBookingReminderSent,
  createCoachingReview,
  getCoachReviews,
  getCoachAggregateRating,
  applyCoachSanction,
  listCoachSanctions,
  getCoachingPlatformRevenue,
  addPushSubscription,
  removePushSubscriptionByEndpoint,
  getPushSubscriptionsForAccount,
  getPushSubscriptionsForAccounts,
  touchPushSubscription,
  getPlayerNemesis,
  getHomeStats,
  saveWeeklyRecap,
  getLatestWeeklyRecap,
  getPatchNotes,
  getPatchNote,
  createPatchNote,
  seedPatchNotes,
  updatePatchNote,
  deletePatchNote,
  getMultiKillStats,
  getMostImproved,
  getBestAndFairest,
  getHeroMetaByPosition,
  getMatchPredictions,
  upsertMatchPrediction,
  resolveMatchPredictions,
  getPlayerPredictionStats,
  getOpenPrediction,
  getPlayerWardPlacements,
  getAllPlayersWardPlacements,
  getPlayerHeroCounters,
  getDraftStats,
  getPersonalRecords,
  getSeasonPlayerRecords,
  getFirstBloodStats,
  getHeroSkillBuilds,
  getPlayerGameDurationStats,
  getComebackMatches,
  createManualMatch,
  getPudgeStats,
  getPudgeGames,
  setReplayFilePath,
  getReplayFilePath,
  expireOldReplayFiles,
  setReplayPath,
  getReplayPath,
  getMatchesWithReplayStatus,
  addToQueue,
  removeFromQueue,
  clearQueue,
  getQueue,
  logServerError,
  getServerLogs,
  reparseMatchFromStats,
  getMatchNotes,
  addMatchNote,
  deleteMatchNote,
  createSignupRequest,
  getSignupRequests,
  createInhouseSession,
  getOrCreateOpenInhouseSession,
  setCaptainModeVote,
  clearCaptainModeVote,
  getCaptainModeVotes,
  tallyCaptainModeVotes,
  resolveWinningCaptainMode,
  filterVotesToMembers,
  setCaptainVolunteer,
  getCaptainVolunteers,
  listVolunteerAccountIds,
  CAPTAIN_VOTE_MODES,
  getInhouseSession,
  listInhouseSessions,
  getActiveInhouseSession,
  updateInhouseSession,
  deleteInhouseSession,
  joinInhouseSession,
  leaveInhouseSession,
  leaveAllJoinableInhouseSessions,
  touchInhousePlayerHeartbeat,
  pruneStaleInhousePlayers,
  listInhousePlayerSessionTokens,
  dropInhousePlayerSeat,
  getInhouseSessionPlayers,
  updateInhouseSessionPlayer,
  setInhousePlayerAccepted,
  setInhousePlayerDeclined,
  setInhousePlayerRoll,
  assignInhouseTeams,
  updateSignupRequest,
  getUnannouncedPatchNotes,
  markPatchNoteAnnounced,
  getHeroMetaWeek,
  getLastMatchPlayers,
  getCurseOfWeek,
  getPlayerOfWeek,
  addScheduleRsvp,
  removeScheduleRsvp,
  getScheduleRsvps,
  getScheduledGameByRsvpMessage,
  saveRsvpMessageId,
  addScheduleRsvpBySteam,
  removeScheduleRsvpBySteam,
  getGamesNeedingReminders,
  markReminder24hSent,
  markReminder1hSent,
  markReminder10mSent,
  getRsvpSteamAccountIds,
  setPlayerRank,
  getAllPlayerRanks,
  getUnregisteredPlayers,
  getAllSteamAccountIds,
  getGamesNeedingLobby,
  markLobbyCreated,
  isDiscordRegistered,
  getPlayerReportCardOptOut,
  setPlayerReportCardOptOut,
  getPlayerRatingsOptOut,
  setPlayerRatingsOptOut,
  getPlayerAlly,
  getPlayerWinRateHistory,
  getPlayerMatchStatsHistory,
  getHallOfFameCareerStats,
  getPlayerBenchmarkAverages,
  getTournaments,
  getTournamentById,
  createTournament,
  getTournamentEntries,
  getTournamentEntry,
  createTournamentEntry,
  markTournamentEntryPaid,
  markTournamentEntryRefunded,
  getTournamentPaidEntryCount,
  isPlayerEligibleForTournament,
  recomputeTournamentPrizePool,
  updateTournamentStatus,
  deleteTournament,
  getTournamentParticipants,
  addTournamentParticipant,
  removeTournamentParticipant,
  reseedTournamentParticipants,
  generateTournamentBracket,
  getTournamentMatches,
  setTournamentMatchWinner,
  clearTournamentMatchWinner,
  linkTournamentMatch,
  createWeekendTournament,
  getWeekendTournaments,
  getWeekendTournamentById,
  updateWeekendTournament,
  getWeekendTournamentScores,
  checkAndUpdateMatchRecords,
  getPlayerMatchCount,
  getPlayerReferrals,
  setPlayerReferredBy,
  grantReferralXp,
  getLeaderboardForImage,
  getPlayerMmrWeekAgo,
  getHeroTierList,
  getHeroTierOverrides,
  setHeroTierOverride,
  deleteHeroTierOverride,
  getPlayerHeroSuggestions,
  getCachedScoutingReport,
  upsertScoutingReport,
};

const RECORD_STAT_KEYS = ['kills', 'gpm', 'assists', 'hero_damage', 'tower_damage', 'last_hits'];

/**
 * Check per-match player stats against all-time records.
 * Returns an array of broken records:
 *   { statKey, newValue, oldValue, oldHolder, newHolder, newHolderName, matchId }
 * Also persists any broken records to the match_records table.
 */
async function checkAndUpdateMatchRecords(matchId) {
  if (!matchId) return [];
  const p = getPool();

  // Fetch all players in this match with the stats we care about
  const psRes = await p.query(`
    SELECT ps.account_id, ps.kills, ps.gpm, ps.assists, ps.hero_damage,
           ps.tower_damage, ps.last_hits,
           COALESCE(n.nickname, ps.persona_name) AS display_name
      FROM player_stats ps
      LEFT JOIN nicknames n ON n.account_id = ps.account_id
     WHERE ps.match_id = $1 AND ps.account_id > 0
  `, [matchId]);

  if (psRes.rows.length === 0) return [];

  const broken = [];
  for (const statKey of RECORD_STAT_KEYS) {
    // Find the best value in this match for this stat
    const best = psRes.rows.reduce((top, row) => {
      const val = parseFloat(row[statKey]) || 0;
      return val > (top ? top.val : -1) ? { val, row } : top;
    }, null);
    if (!best || best.val <= 0) continue;

    // Load current all-time record
    const recRes = await p.query(
      `SELECT account_id, value, player_name FROM match_records WHERE stat_key = $1`,
      [statKey]
    );
    const current = recRes.rows[0];

    if (!current || best.val > parseFloat(current.value)) {
      // Conditional upsert — only update when the incoming value is strictly
      // higher than the stored one, so concurrent match processing cannot
      // overwrite a higher record with a lower one.
      const upsertRes = await p.query(`
        INSERT INTO match_records (stat_key, account_id, value, match_id, player_name, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (stat_key) DO UPDATE
          SET account_id  = EXCLUDED.account_id,
              value       = EXCLUDED.value,
              match_id    = EXCLUDED.match_id,
              player_name = EXCLUDED.player_name,
              updated_at  = NOW()
          WHERE match_records.value < EXCLUDED.value
        RETURNING value
      `, [statKey, best.row.account_id, best.val, matchId, best.row.display_name || null]);
      if (upsertRes.rowCount === 0) continue;

      broken.push({
        statKey,
        newValue: best.val,
        oldValue: current ? parseFloat(current.value) : null,
        oldHolderName: current ? current.player_name : null,
        newHolderAccountId: best.row.account_id,
        newHolderName: best.row.display_name,
        matchId,
      });
    }
  }
  return broken;
}

/**
 * Get the total number of matches a player has played (all-time).
 */
async function getPlayerMatchCount(accountId) {
  if (!accountId) return 0;
  const p = getPool();
  const r = await p.query(
    `SELECT COUNT(*)::int AS cnt FROM player_stats WHERE account_id = $1`,
    [accountId]
  );
  return r.rows[0]?.cnt || 0;
}

async function getPlayerReferrals(accountId) {
  if (!accountId) return { count: 0, totalXp: 0, referrals: [] };
  const p = getPool();
  const referred = await p.query(
    `SELECT p.account_id_32, p.discord_name, p.registered_at,
            COALESCE(n.nickname, p.discord_name) AS display_name
     FROM players p
     LEFT JOIN nicknames n ON n.account_id = p.account_id_32::bigint
     WHERE p.referred_by = $1::bigint
     ORDER BY p.registered_at ASC`,
    [accountId]
  );
  const xpResult = await p.query(
    `SELECT COALESCE(SUM(xp_delta), 0) AS total_xp
     FROM season_pass_xp_events
     WHERE account_id = $1::bigint AND source LIKE 'referral_%'`,
    [accountId]
  );
  const totalXp = parseInt(xpResult.rows[0]?.total_xp) || 0;
  return {
    count: referred.rows.length,
    totalXp,
    referrals: referred.rows.map(r => ({
      accountId: r.account_id_32,
      displayName: r.display_name || r.discord_name || 'Unknown',
      joinedAt: r.registered_at,
    })),
  };
}

async function setPlayerReferredBy(accountId, referredByAccountId) {
  if (!accountId || !referredByAccountId) return false;
  if (String(accountId) === String(referredByAccountId)) return false;
  const p = getPool();
  const r = await p.query(
    `UPDATE players SET referred_by = $1
      WHERE account_id_32 = $2
        AND referred_by IS NULL
        AND EXISTS (SELECT 1 FROM players WHERE account_id_32 = $1::text)`,
    [referredByAccountId, accountId]
  );
  return r.rowCount > 0;
}

async function grantReferralXp(referrerAccountId, referredAccountId, seasonId, xpAmount = 50) {
  if (!referrerAccountId || !seasonId) return false;
  const p = getPool();
  const source = `referral_${referredAccountId}`;
  // ON CONFLICT DO NOTHING does not deduplicate NULL match_id rows under the
  // standard multi-column unique constraint, so we check for an existing row
  // before inserting.
  const existing = await p.query(
    `SELECT id FROM season_pass_xp_events
      WHERE account_id = $1 AND season_number = $2 AND match_id IS NULL AND source = $3
      LIMIT 1`,
    [referrerAccountId, seasonId, source]
  );
  if (existing.rows.length > 0) return false;
  const r = await p.query(
    `INSERT INTO season_pass_xp_events (account_id, season_number, match_id, source, xp_delta, notes)
     VALUES ($1, $2, NULL, $3, $4, $5)
     RETURNING id`,
    [referrerAccountId, seasonId, source, xpAmount, `Referral bonus for inviting account ${referredAccountId}`]
  );
  return r.rowCount > 0;
}

/**
 * Get the current MMR leaderboard (top N) — used for the weekly leaderboard image.
 */
async function getLeaderboardForImage(limit = 10) {
  const p = getPool();
  const res = await p.query(`
    SELECT r.player_id AS account_id,
           COALESCE(n.nickname, r.display_name) AS display_name,
           r.mmr,
           r.wins,
           r.losses,
           r.games_played
      FROM ratings r
      LEFT JOIN nicknames n ON n.account_id = r.player_id
     WHERE r.games_played >= 1
     ORDER BY r.mmr DESC
     LIMIT $1
  `, [limit]);
  return res.rows;
}

/**
 * Get the MMR for a player 7 days ago (used for weekly delta in leaderboard image).
 * Falls back to null if no history exists.
 */
async function getPlayerMmrWeekAgo(accountId) {
  if (!accountId) return null;
  const p = getPool();
  const r = await p.query(`
    SELECT mmr FROM rating_history
     WHERE player_id = $1 AND recorded_at <= NOW() - INTERVAL '7 days'
     ORDER BY recorded_at DESC
     LIMIT 1
  `, [accountId]);
  return r.rows[0]?.mmr ?? null;
}

async function getPudgeStats(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       MAX(ps.account_id) AS account_id,
       COALESCE(MAX(n.nickname), MAX(ps.persona_name)) AS display_name,
       COUNT(*) AS pudge_games,
       SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true)
                  OR (ps.team = 'dire'    AND m.radiant_win = false) THEN 1 ELSE 0 END) AS wins,
       SUM(ps.kills)   AS total_kills,
       SUM(ps.deaths)  AS total_deaths,
       SUM(ps.assists) AS total_assists,
       ROUND(AVG(ps.kills),   1) AS avg_kills,
       ROUND(AVG(ps.deaths),  1) AS avg_deaths,
       ROUND(AVG(ps.assists), 1) AS avg_assists,
       COUNT(CASE WHEN ps.hook_attempts IS NOT NULL THEN 1 END)  AS games_with_hooks,
       SUM(CASE WHEN ps.hook_attempts IS NOT NULL THEN ps.hook_attempts ELSE 0 END) AS total_hook_attempts,
       SUM(CASE WHEN ps.hook_hits IS NOT NULL THEN ps.hook_hits ELSE 0 END)         AS total_hook_hits,
       ROUND(100.0 * SUM(CASE WHEN ps.hook_hits IS NOT NULL THEN ps.hook_hits ELSE 0 END)
             / NULLIF(SUM(CASE WHEN ps.hook_attempts IS NOT NULL THEN ps.hook_attempts ELSE 0 END), 0), 1)
             AS hook_accuracy,
       ROUND((AVG(ps.hook_hits) FILTER (WHERE ps.hook_hits IS NOT NULL))::NUMERIC, 1)     AS avg_hook_hits_per_game,
       ROUND((AVG(ps.hook_attempts) FILTER (WHERE ps.hook_attempts IS NOT NULL))::NUMERIC, 1) AS avg_hook_attempts_per_game,
       SUM(ps.rampages)     AS total_rampages,
       SUM(ps.firstblood_claimed) AS total_firstbloods,
       ROUND(AVG(ps.hero_damage), 0) AS avg_hero_damage,
       ROUND(AVG(ps.gpm), 0)         AS avg_gpm
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id
     WHERE ps.hero_name = 'npc_dota_hero_pudge'
       AND ps.account_id != 0${sc}
     GROUP BY COALESCE(n.nickname, ps.account_id::text)
     HAVING COUNT(*) > 0
     ORDER BY total_hook_attempts DESC NULLS LAST, pudge_games DESC`,
    params
  );
  for (const row of result.rows) {
    row.display_name = decodeByteString(row.display_name);
  }
  return result.rows;
}

async function getPudgeGames(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       ps.match_id,
       m.date AS start_time,
       COALESCE(n.nickname, ps.persona_name) AS display_name,
       ps.account_id,
       ps.kills,
       ps.deaths,
       ps.assists,
       ps.gpm,
       CASE WHEN (ps.team = 'radiant' AND m.radiant_win) OR (ps.team = 'dire' AND NOT m.radiant_win)
            THEN true ELSE false END AS won,
       ps.hook_attempts,
       ps.hook_hits,
       CASE WHEN ps.hook_attempts > 0
            THEN ROUND(100.0 * ps.hook_hits / ps.hook_attempts, 1)
            ELSE NULL END AS accuracy
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
     WHERE ps.hero_name = 'npc_dota_hero_pudge'
       AND ps.account_id != 0
       AND ps.hook_attempts IS NOT NULL${sc}
     ORDER BY m.date DESC`,
    params
  );
  for (const row of result.rows) {
    row.display_name = decodeByteString(row.display_name);
  }
  return result.rows;
}

async function setReplayFilePath(matchId, filePath, expiresAt) {
  const p = getPool();
  await p.query(
    `UPDATE matches SET replay_file_path = $1, replay_file_expires_at = $2 WHERE match_id = $3`,
    [filePath, expiresAt, matchId]
  );
}

async function getReplayFilePath(matchId) {
  const p = getPool();
  const res = await p.query(
    `SELECT replay_file_path, replay_file_expires_at FROM matches WHERE match_id = $1`,
    [matchId]
  );
  return res.rows[0] || null;
}

async function setReplayPath(matchId, remotePath) {
  const p = getPool();
  await p.query(
    `UPDATE matches SET replay_path = $1 WHERE match_id = $2`,
    [remotePath || null, matchId]
  );
}

async function getReplayPath(matchId) {
  const p = getPool();
  const res = await p.query(
    `SELECT replay_path FROM matches WHERE match_id = $1`,
    [matchId]
  );
  return res.rows[0] || null;
}

async function getMatchesWithReplayStatus(limit = 100, offset = 0) {
  const p = getPool();
  const res = await p.query(
    `SELECT match_id, date, replay_path, replay_file_path
     FROM matches
     ORDER BY date DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.rows;
}

async function expireOldReplayFiles() {
  const p = getPool();
  const res = await p.query(
    `UPDATE matches SET replay_file_path = NULL, replay_file_expires_at = NULL
     WHERE replay_file_expires_at IS NOT NULL AND replay_file_expires_at < NOW()
     RETURNING match_id, replay_file_path`
  );
  return res.rows;
}

async function getHeroMetaWeek(days = 7) {
  const p = getPool();
  const result = await p.query(`
    SELECT
      ps.hero_name,
      ps.hero_id,
      COUNT(*) as picks,
      SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win) OR (ps.team = 'dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) as wins
    FROM player_stats ps
    JOIN matches m ON m.match_id::text = ps.match_id::text
    WHERE m.date >= NOW() - ($1 * INTERVAL '1 day')
      AND ps.hero_name IS NOT NULL AND ps.hero_name != ''
    GROUP BY ps.hero_name, ps.hero_id
    ORDER BY picks DESC
    LIMIT 15
  `, [days]);
  return result.rows;
}

async function getLastMatchPlayers() {
  const p = getPool();
  const matchRes = await p.query(`SELECT match_id FROM matches ORDER BY date DESC LIMIT 1`);
  if (matchRes.rows.length === 0) return null;
  const matchId = matchRes.rows[0].match_id;
  const playersRes = await p.query(`
    SELECT ps.account_id, ps.persona_name, ps.team,
           COALESCE(n.nickname, ps.persona_name) as display_name
    FROM player_stats ps
    LEFT JOIN nicknames n ON n.account_id::text = ps.account_id::text AND ps.account_id::text != '0'
    WHERE ps.match_id::text = $1::text
  `, [matchId]);
  return { matchId, players: playersRes.rows };
}

async function getCurseOfWeek(days = 7) {
  const p = getPool();
  const result = await p.query(`
    SELECT
      COALESCE(MAX(n.nickname), MAX(ps.persona_name)) as player_name,
      SUM(ps.deaths) as total_deaths,
      COUNT(DISTINCT ps.match_id) as games
    FROM player_stats ps
    JOIN matches m ON m.match_id::text = ps.match_id::text
    LEFT JOIN nicknames n ON n.account_id::text = ps.account_id::text AND ps.account_id::text != '0'
    WHERE m.date >= NOW() - ($1 * INTERVAL '1 day')
      AND ps.account_id::text != '0'
    GROUP BY COALESCE(n.nickname, ps.persona_name)
    ORDER BY total_deaths DESC
    LIMIT 1
  `, [days]);
  return result.rows[0] || null;
}

async function getPlayerOfWeek(days = 7) {
  const p = getPool();
  const result = await p.query(`
    SELECT
      COALESCE(MAX(n.nickname), MAX(ps.persona_name)) as player_name,
      COUNT(DISTINCT ps.match_id) as games,
      SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win) OR (ps.team = 'dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) as wins,
      ROUND(AVG(CASE WHEN ps.deaths > 0 THEN (ps.kills + ps.assists)::float / ps.deaths ELSE (ps.kills + ps.assists)::float END), 2) as avg_kda
    FROM player_stats ps
    JOIN matches m ON m.match_id::text = ps.match_id::text
    LEFT JOIN nicknames n ON n.account_id::text = ps.account_id::text AND ps.account_id::text != '0'
    WHERE m.date >= NOW() - ($1 * INTERVAL '1 day')
      AND ps.account_id::text != '0'
    GROUP BY COALESCE(n.nickname, ps.persona_name)
    HAVING COUNT(DISTINCT ps.match_id) >= 2
    ORDER BY wins DESC, avg_kda DESC
    LIMIT 1
  `, [days]);
  return result.rows[0] || null;
}

async function addScheduleRsvp(gameId, discordId, username, status) {
  const p = getPool();
  await p.query(`
    INSERT INTO schedule_rsvps (game_id, discord_id, username, status)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (game_id, discord_id) DO UPDATE SET status = $4, username = $3, updated_at = NOW()
  `, [gameId, discordId, username, status]);
}

async function removeScheduleRsvp(gameId, discordId) {
  const p = getPool();
  await p.query(`DELETE FROM schedule_rsvps WHERE game_id = $1 AND discord_id = $2`, [gameId, discordId]);
}

async function getScheduleRsvps(gameId) {
  const p = getPool();
  const result = await p.query(`SELECT * FROM schedule_rsvps WHERE game_id = $1 ORDER BY updated_at ASC`, [gameId]);
  return result.rows;
}

async function getScheduledGameByRsvpMessage(messageId) {
  const p = getPool();
  const result = await p.query(`SELECT * FROM scheduled_games WHERE rsvp_message_id = $1`, [messageId]);
  return result.rows[0] || null;
}

async function saveRsvpMessageId(gameId, messageId, channelId) {
  const p = getPool();
  await p.query(`UPDATE scheduled_games SET rsvp_message_id = $2, rsvp_channel_id = $3 WHERE id = $1`, [gameId, messageId, channelId]);
}

async function isDiscordRegistered(discordId) {
  const p = getPool();
  const id = (discordId || '').toString().trim();
  if (!id) return false;
  // Check players table first
  const playersRes = await p.query(
    `SELECT 1 FROM players WHERE TRIM(discord_id) = $1 AND discord_id != '' LIMIT 1`,
    [id]
  );
  if (playersRes.rows.length > 0) return true;
  // Check nicknames table (Discord IDs linked via admin panel)
  const nicknamesRes = await p.query(
    `SELECT 1 FROM nicknames WHERE TRIM(discord_id) = $1 AND discord_id != '' AND discord_id IS NOT NULL LIMIT 1`,
    [id]
  );
  return nicknamesRes.rows.length > 0;
}

async function addScheduleRsvpBySteam(gameId, accountId, displayName, status) {
  const p = getPool();
  const webId = `web:${accountId}`;
  await p.query(`
    INSERT INTO schedule_rsvps (game_id, discord_id, username, status)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (game_id, discord_id) DO UPDATE SET status = $4, username = $3, updated_at = NOW()
  `, [gameId, webId, displayName || 'Unknown', status]);
}

async function removeScheduleRsvpBySteam(gameId, accountId) {
  const p = getPool();
  const webId = `web:${accountId}`;
  await p.query(`DELETE FROM schedule_rsvps WHERE game_id = $1 AND discord_id = $2`, [gameId, webId]);
}

async function getUpcomingGamesWithRsvps() {
  const p = getPool();
  const result = await p.query(`
    SELECT g.*,
      COALESCE(SUM(CASE WHEN r.status = 'yes' THEN 1 ELSE 0 END), 0)::int AS rsvp_yes,
      COALESCE(SUM(CASE WHEN r.status = 'no' THEN 1 ELSE 0 END), 0)::int AS rsvp_no
    FROM scheduled_games g
    LEFT JOIN schedule_rsvps r ON r.game_id = g.id
    WHERE g.is_cancelled = FALSE AND g.scheduled_at >= NOW() - INTERVAL '2 hours'
    GROUP BY g.id
    ORDER BY g.scheduled_at ASC
  `);
  return result.rows;
}

async function getGamesNeedingReminders() {
  const p = getPool();
  const result = await p.query(`
    SELECT * FROM scheduled_games
    WHERE is_cancelled = FALSE
      AND scheduled_at > NOW()
      AND (
        (reminder_24h_sent = FALSE AND scheduled_at BETWEEN NOW() + INTERVAL '23 hours 30 minutes' AND NOW() + INTERVAL '24 hours 30 minutes')
        OR
        (reminder_1h_sent = FALSE AND scheduled_at BETWEEN NOW() + INTERVAL '45 minutes' AND NOW() + INTERVAL '75 minutes')
        OR
        (reminder_10m_sent = FALSE AND scheduled_at BETWEEN NOW() + INTERVAL '5 minutes' AND NOW() + INTERVAL '15 minutes')
      )
    ORDER BY scheduled_at ASC
  `);
  return result.rows;
}

async function markReminder24hSent(id) {
  const p = getPool();
  await p.query(`UPDATE scheduled_games SET reminder_24h_sent = TRUE WHERE id = $1`, [id]);
}

async function markReminder1hSent(id) {
  const p = getPool();
  await p.query(`UPDATE scheduled_games SET reminder_1h_sent = TRUE WHERE id = $1`, [id]);
}

async function markReminder10mSent(id) {
  const p = getPool();
  await p.query(`UPDATE scheduled_games SET reminder_10m_sent = TRUE WHERE id = $1`, [id]);
}

async function getGamesNeedingLobby() {
  const p = getPool();
  const result = await p.query(`
    SELECT g.*,
      (SELECT COUNT(*) FROM scheduled_games g2
        WHERE g2.is_cancelled = FALSE AND g2.scheduled_at <= g.scheduled_at) AS game_number
    FROM scheduled_games g
    WHERE g.is_cancelled = FALSE
      AND g.lobby_created = FALSE
      AND g.scheduled_at BETWEEN NOW() - INTERVAL '2 minutes' AND NOW() + INTERVAL '5 minutes'
    ORDER BY g.scheduled_at ASC
  `);
  return result.rows;
}

async function markLobbyCreated(id) {
  const p = getPool();
  await p.query(`UPDATE scheduled_games SET lobby_created = TRUE WHERE id = $1`, [id]);
}

async function setPlayerRank(accountId, rankTier, leaderboardRank, source) {
  const p = getPool();
  await p.query(
    `UPDATE nicknames SET dota_rank_tier=$1, dota_leaderboard_rank=$2, dota_rank_source=$3, dota_rank_updated_at=NOW()
     WHERE account_id=$4`,
    [rankTier || null, leaderboardRank || null, source, parseInt(accountId)]
  );
}

// Returns players who have match history but no nickname (= unregistered).
// Also flags potential duplicates: accounts sharing the same persona_name.
// Results ordered by game count so the most active unregistered players surface first.
async function getUnregisteredPlayers() {
  const p = getPool();
  const result = await p.query(`
    SELECT
      ps.account_id,
      MAX(ps.persona_name) as persona_name,
      COUNT(DISTINCT ps.match_id) as games,
      MAX(m.date) as last_played
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    LEFT JOIN nicknames n ON n.account_id = ps.account_id AND ps.account_id != 0
    WHERE ps.account_id != 0
      AND n.account_id IS NULL
    GROUP BY ps.account_id
    HAVING COUNT(DISTINCT ps.match_id) >= 2
    ORDER BY games DESC
    LIMIT 30
  `);

  const rows = result.rows.map(r => ({
    account_id: r.account_id,
    persona_name: r.persona_name,
    games: parseInt(r.games),
    last_played: r.last_played,
  }));

  // Flag potential duplicates: same persona_name appears in more than one row above,
  // OR same persona_name exists on a REGISTERED account too.
  const allNames = rows.map(r => r.persona_name.toLowerCase().trim());
  const nameCounts = {};
  for (const n of allNames) nameCounts[n] = (nameCounts[n] || 0) + 1;

  // Also check if any persona_name in our list matches a registered player's persona_name
  const names = rows.map(r => `'${r.persona_name.replace(/'/g, "''")}'`).join(',');
  const regCheck = names.length > 0 ? await p.query(`
    SELECT DISTINCT MAX(ps2.persona_name) as persona_name
    FROM player_stats ps2
    JOIN nicknames n2 ON n2.account_id = ps2.account_id AND ps2.account_id != 0
    WHERE LOWER(ps2.persona_name) = ANY(ARRAY[${rows.map((_, i) => `$${i + 1}`).join(',')}])
    GROUP BY LOWER(ps2.persona_name)
  `, rows.map(r => r.persona_name.toLowerCase())) : { rows: [] };
  const registeredNames = new Set(regCheck.rows.map(r => r.persona_name.toLowerCase().trim()));

  return rows.map(r => ({
    ...r,
    possible_duplicate: nameCounts[r.persona_name.toLowerCase().trim()] > 1 || registeredNames.has(r.persona_name.toLowerCase().trim()),
  }));
}

async function getAllPlayerRanks() {
  const p = getPool();
  const result = await p.query(
    `SELECT account_id, nickname, dota_rank_tier, dota_leaderboard_rank, dota_rank_source, dota_rank_updated_at
     FROM nicknames WHERE account_id IS NOT NULL ORDER BY nickname`
  );
  const rows = result.rows;

  // Group by lower-cased nickname and resolve the BEST rank across all accounts that share
  // the same nickname. This mirrors the leaderboard's merged-account logic, so viewing any
  // of a player's secondary accounts still shows the correct Dota rank badge on the profile.
  const byNick = {};
  for (const row of rows) {
    const nick = row.nickname ? row.nickname.toLowerCase() : null;
    if (!nick) continue;
    if (!byNick[nick]) byNick[nick] = [];
    byNick[nick].push(row);
  }

  const expanded = [];
  for (const group of Object.values(byNick)) {
    const best = group.reduce((b, r) => {
      if (r.dota_rank_tier == null) return b;
      if (b == null || r.dota_rank_tier > b.dota_rank_tier) return r;
      return b;
    }, null);
    for (const row of group) {
      expanded.push({
        ...row,
        dota_rank_tier: best?.dota_rank_tier ?? null,
        dota_leaderboard_rank: best?.dota_leaderboard_rank ?? null,
        dota_rank_source: best?.dota_rank_source ?? null,
      });
    }
  }
  // Include accounts that have no nickname — these can't be merged, kept as-is.
  for (const row of rows) {
    if (!row.nickname) expanded.push(row);
  }

  return expanded;
}

async function getAllSteamAccountIds() {
  const p = getPool();
  const result = await p.query(
    `SELECT DISTINCT account_id FROM nicknames WHERE account_id IS NOT NULL AND account_id > 0`
  );
  return result.rows.map(r => BigInt(r.account_id));
}

/**
 * Returns account_id_32 values for all ✅ RSVP'd players for a game.
 * Resolves web RSVPs (web:<accountId>) directly, Discord RSVPs via the nicknames table.
 */
async function getRsvpSteamAccountIds(gameId) {
  const p = getPool();
  const result = await p.query(`
    SELECT
      r.discord_id,
      CASE
        WHEN r.discord_id LIKE 'web:%' THEN CAST(SPLIT_PART(r.discord_id, ':', 2) AS BIGINT)
        ELSE n.account_id::BIGINT
      END AS account_id_32
    FROM schedule_rsvps r
    LEFT JOIN nicknames n
      ON TRIM(n.discord_id) = r.discord_id
      AND r.discord_id NOT LIKE 'web:%'
      AND n.discord_id != ''
    WHERE r.game_id = $1 AND r.status = 'yes'
  `, [gameId]);
  return result.rows
    .filter(r => r.account_id_32 != null && String(r.account_id_32) !== '0')
    .map(r => BigInt(r.account_id_32));
}

async function getPlayerReportCardOptOut(discordId) {
  const p = getPool();
  const result = await p.query(`SELECT report_card_optin FROM player_preferences WHERE discord_id = $1`, [discordId]);
  return result.rows[0]?.report_card_optin || false;
}

async function setPlayerReportCardOptOut(discordId, optIn) {
  const p = getPool();
  await p.query(`
    INSERT INTO player_preferences (discord_id, report_card_optin)
    VALUES ($1, $2)
    ON CONFLICT (discord_id) DO UPDATE SET report_card_optin = $2, updated_at = NOW()
  `, [discordId, optIn]);
}

async function getPlayerRatingsOptOut(discordId) {
  const p = getPool();
  const result = await p.query(`SELECT ratings_optout FROM player_preferences WHERE discord_id = $1`, [discordId]);
  return result.rows[0]?.ratings_optout || false;
}

async function setPlayerRatingsOptOut(discordId, optOut) {
  const p = getPool();
  await p.query(`
    INSERT INTO player_preferences (discord_id, ratings_optout)
    VALUES ($1, $2)
    ON CONFLICT (discord_id) DO UPDATE SET ratings_optout = $2, updated_at = NOW()
  `, [discordId, optOut]);
}

async function getPlayerAlly(accountId, seasonId = null) {
  const p = getPool();
  const params = [accountId];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
  const result = await p.query(`
    SELECT
      ally.account_id,
      COALESCE(MAX(n.nickname), MAX(ally.persona_name)) AS display_name,
      COUNT(DISTINCT ps.match_id) AS games_together,
      SUM(CASE
        WHEN (ps.team = 'radiant' AND m.radiant_win) OR (ps.team = 'dire' AND NOT m.radiant_win)
        THEN 1 ELSE 0
      END) AS wins_together
    FROM player_stats ps
    JOIN matches m ON m.match_id::text = ps.match_id::text
    JOIN player_stats ally ON ally.match_id::text = ps.match_id::text
      AND ally.team = ps.team
      AND ally.account_id::text != ps.account_id::text
      AND ally.account_id::text != '0'
    LEFT JOIN nicknames n ON n.account_id::text = ally.account_id::text
    WHERE ps.account_id::text = $1::text${sc}
    GROUP BY ally.account_id
    HAVING COUNT(DISTINCT ps.match_id) >= 3
    ORDER BY wins_together DESC, games_together DESC
    LIMIT 5
  `, params);
  return result.rows;
}

async function getPlayerWinRateHistory(accountId, seasonId = null) {
  const p = getPool();
  const params = [accountId];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
  const result = await p.query(`
    SELECT
      m.match_id,
      m.date,
      CASE WHEN (ps.team = 'radiant' AND m.radiant_win) OR (ps.team = 'dire' AND NOT m.radiant_win)
        THEN 1 ELSE 0
      END AS won
    FROM player_stats ps
    JOIN matches m ON m.match_id::text = ps.match_id::text
    WHERE ps.account_id::text = $1::text${sc}
    ORDER BY m.date ASC
  `, params);
  return result.rows;
}

// 1.4 — Per-match stats timeseries for the player's own profile chart v2.
// Returns up to 100 most-recent matches with K/D/A, GPM, hero damage and a
// rolling K/D/A tracked client-side. Cheap query — single index lookup on
// player_stats.account_id then a join.
async function getPlayerMatchStatsHistory(accountId, seasonId = null) {
  const p = getPool();
  const params = [accountId];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
  const result = await p.query(`
    SELECT
      m.match_id,
      m.date,
      ps.kills,
      ps.deaths,
      ps.assists,
      ps.gpm,
      ps.xpm,
      ps.hero_damage,
      ps.hero_id,
      CASE WHEN (ps.team = 'radiant' AND m.radiant_win) OR (ps.team = 'dire' AND NOT m.radiant_win)
        THEN 1 ELSE 0
      END AS won
    FROM player_stats ps
    JOIN matches m ON m.match_id::text = ps.match_id::text
    WHERE ps.account_id::text = $1::text${sc}
    ORDER BY m.date DESC
    LIMIT 100
  `, params);
  // Reverse so caller gets oldest -> newest for charting.
  return result.rows.reverse();
}

async function getHallOfFameCareerStats(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';
  const result = await p.query(`
    SELECT
      ps.account_id,
      COALESCE(n.nickname, ps.persona_name) AS display_name,
      COUNT(DISTINCT ps.match_id) AS games,
      SUM(CASE WHEN (ps.team = 'radiant' AND m.radiant_win) OR (ps.team = 'dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN (ps.team = 'radiant' AND NOT m.radiant_win) OR (ps.team = 'dire' AND m.radiant_win) THEN 1 ELSE 0 END) AS losses,
      ROUND(AVG(CASE WHEN ps.deaths > 0 THEN (ps.kills + ps.assists)::float / ps.deaths ELSE (ps.kills + ps.assists)::float END), 2) AS avg_kda,
      ROUND(AVG(ps.gpm)) AS avg_gpm,
      SUM(ps.kills) AS total_kills,
      (SELECT COUNT(*) FROM achievements a WHERE a.player_id = ps.account_id) AS achievement_count
    FROM player_stats ps
    JOIN matches m ON m.match_id::text = ps.match_id::text
    LEFT JOIN nicknames n ON n.account_id::text = ps.account_id::text
    WHERE ps.account_id::text != '0'${sc}
    GROUP BY ps.account_id, COALESCE(n.nickname, ps.persona_name)
    HAVING COUNT(DISTINCT ps.match_id) >= 1
    ORDER BY wins DESC, games DESC
  `, params);
  return result.rows;
}

async function getPlayerBenchmarkAverages(seasonId = null) {
  const p = getPool();
  const params = [];
  const seasonClause = seasonId
    ? ` AND ps.match_id IN (SELECT match_id FROM matches WHERE season_id = $${params.push(parseInt(seasonId))})`
    : '';
  const result = await p.query(`
    SELECT
      CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END AS account_id,
      COALESCE(MAX(n.nickname), MAX(ps.persona_name)) AS display_name,
      COUNT(DISTINCT ps.match_id) AS games,
      ROUND(AVG(ps.kills)::numeric, 2) AS avg_kills,
      ROUND(AVG(ps.deaths)::numeric, 2) AS avg_deaths,
      ROUND(AVG(ps.assists)::numeric, 2) AS avg_assists,
      ROUND(AVG(ps.gpm)::numeric) AS avg_gpm,
      ROUND(AVG(ps.xpm)::numeric) AS avg_xpm,
      ROUND(AVG(ps.hero_damage)::numeric) AS avg_hero_damage,
      ROUND(AVG(ps.tower_damage)::numeric) AS avg_tower_damage,
      ROUND(AVG(ps.hero_healing)::numeric) AS avg_healing,
      ROUND(AVG(ps.last_hits)::numeric) AS avg_last_hits,
      ROUND(AVG(CASE WHEN ps.deaths > 0 THEN (ps.kills + ps.assists)::numeric / ps.deaths ELSE (ps.kills + ps.assists)::numeric END), 2) AS avg_kda
    FROM player_stats ps
    LEFT JOIN nicknames n ON n.account_id::text = ps.account_id::text
    WHERE (ps.account_id != 0 OR (ps.persona_name IS NOT NULL AND ps.persona_name != ''))${seasonClause}
    GROUP BY CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END
    HAVING COUNT(DISTINCT ps.match_id) >= 1
    ORDER BY games DESC
  `, params);
  return result.rows;
}

async function getTournaments(seasonId = null) {
  const p = getPool();
  const params = [];
  const where = seasonId ? `WHERE t.season_id = $${params.push(parseInt(seasonId))}` : '';
  const result = await p.query(`
    SELECT t.*, s.name AS season_name,
      (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id) AS participant_count
    FROM tournaments t
    LEFT JOIN seasons s ON s.id = t.season_id
    ${where}
    ORDER BY t.created_at DESC
  `, params);
  return result.rows;
}

async function getTournamentById(id) {
  const p = getPool();
  const parsed = parseInt(id);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[db.getTournamentById] non-numeric id received: ${JSON.stringify(id)}`);
    return null;
  }
  const result = await p.query(`
    SELECT t.*, s.name AS season_name
    FROM tournaments t
    LEFT JOIN seasons s ON s.id = t.season_id
    WHERE t.id = $1
  `, [parsed]);
  if (!result.rows[0]) {
    console.warn(`[db.getTournamentById] no tournament with id=${parsed}`);
  }
  return result.rows[0] || null;
}

async function createTournament({
  name, description, seasonId, format, createdBy,
  tierNumber = null, entryFeeCents = 0,
  signupOpenAt = null, signupCloseAt = null,
  bracketSize = null,
  maxParticipants = null, prizeSplit = null,
}) {
  const p = getPool();
  const fmt = format || 'single_elim';
  // Validate prize split server-side: array of positive numbers that sum to 100.
  let splitJson = null;
  if (prizeSplit != null) {
    if (!Array.isArray(prizeSplit) || prizeSplit.length === 0) {
      throw new Error('prizeSplit must be a non-empty array of percentages');
    }
    const nums = prizeSplit.map(v => Number(v));
    if (nums.some(n => !Number.isFinite(n) || n < 0)) {
      throw new Error('prizeSplit entries must be non-negative numbers');
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    if (Math.round(sum) !== 100) {
      throw new Error(`prizeSplit must sum to 100 (got ${sum})`);
    }
    splitJson = JSON.stringify(nums);
  }
  const result = await p.query(
    `INSERT INTO tournaments (name, description, season_id, format, bracket_type, bracket_size, status, created_by,
       tier_number, entry_fee_cents, signup_open_at, signup_close_at, max_participants, prize_split)
     VALUES ($1, $2, $3, $4, $5, $6, 'upcoming', $7, $8, $9, $10, $11, $12,
             COALESCE($13::jsonb, '[50,30,20]'::jsonb))
     RETURNING *`,
    [
      name,
      description || null,
      seasonId ? parseInt(seasonId) : null,
      fmt,
      fmt === 'weekend_points' ? 'none' : fmt,
      bracketSize ? parseInt(bracketSize) : null,
      createdBy || null,
      tierNumber != null ? parseInt(tierNumber) : null,
      parseInt(entryFeeCents) || 0,
      signupOpenAt ? new Date(signupOpenAt) : null,
      signupCloseAt ? new Date(signupCloseAt) : null,
      maxParticipants != null && maxParticipants !== '' ? parseInt(maxParticipants) : null,
      splitJson,
    ]
  );
  return result.rows[0];
}

// v5.92 — paid-entry counter for capacity gate.
async function getTournamentPaidEntryCount(tournamentId) {
  const p = getPool();
  const r = await p.query(
    `SELECT COUNT(*)::int AS n FROM tournament_entries
     WHERE tournament_id = $1 AND status = 'paid'`,
    [parseInt(tournamentId)]
  );
  return r.rows[0]?.n || 0;
}

// Tournament self-signup helpers (1.7) ────────────────────────────────────────
async function getTournamentEntries(tournamentId, { paidOnly = false } = {}) {
  const p = getPool();
  const where = paidOnly ? `AND te.status = 'paid'` : '';
  const r = await p.query(
    `SELECT te.*, COALESCE(n.nickname, '') AS nickname
     FROM tournament_entries te
     LEFT JOIN nicknames n ON n.account_id::bigint = te.account_id
     WHERE te.tournament_id = $1 ${where}
     ORDER BY te.created_at ASC`,
    [parseInt(tournamentId)]
  );
  return r.rows;
}

async function getTournamentEntry(tournamentId, accountId) {
  const p = getPool();
  const r = await p.query(
    `SELECT * FROM tournament_entries
     WHERE tournament_id = $1 AND account_id = $2`,
    [parseInt(tournamentId), String(accountId)]
  );
  return r.rows[0] || null;
}

async function createTournamentEntry({
  tournamentId, accountId, steamId, stripeSessionId, amountCents = 0,
}) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO tournament_entries
       (tournament_id, account_id, steam_id, stripe_session_id, amount_cents, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (tournament_id, account_id) DO UPDATE
       SET stripe_session_id = EXCLUDED.stripe_session_id,
           amount_cents      = EXCLUDED.amount_cents,
           status            = CASE
                                 WHEN tournament_entries.status = 'paid' THEN tournament_entries.status
                                 ELSE 'pending'
                               END
     RETURNING *`,
    [parseInt(tournamentId), String(accountId), steamId || null, stripeSessionId || null, parseInt(amountCents) || 0]
  );
  return r.rows[0];
}

async function markTournamentEntryPaid(stripeSessionId, paymentIntentId = null) {
  const p = getPool();
  const r = await p.query(
    `UPDATE tournament_entries
     SET status = 'paid',
         paid_at = COALESCE(paid_at, NOW()),
         stripe_payment_intent_id = COALESCE($2, stripe_payment_intent_id)
     WHERE stripe_session_id = $1
     RETURNING *`,
    [String(stripeSessionId), paymentIntentId || null]
  );
  const entry = r.rows[0] || null;
  // v5.92 — auto-mirror paid entry into tournament_participants so the
  // bracket UI / admin participant list reflects self-signups immediately.
  // This is payment-critical: a paid entry that doesn't appear in the
  // participants list is a user-visible regression, so we let DB errors
  // bubble up to the caller (Stripe webhook will retry; /entry/confirm
  // surfaces the error so the user can re-confirm).
  if (entry) {
    await p.query(
      `INSERT INTO tournament_participants (tournament_id, account_id)
       VALUES ($1, $2) ON CONFLICT (tournament_id, account_id) DO NOTHING`,
      [entry.tournament_id, BigInt(entry.account_id)]
    );
  }
  return entry;
}

// v5.92 — refund + withdraw helper. Marks an entry refunded and removes the
// player from tournament_participants. Caller is responsible for issuing the
// Stripe refund (so the API layer can short-circuit on Stripe errors).
async function markTournamentEntryRefunded(tournamentId, accountId) {
  const p = getPool();
  const r = await p.query(
    `UPDATE tournament_entries
     SET status = 'refunded', refunded_at = NOW()
     WHERE tournament_id = $1 AND account_id = $2
     RETURNING *`,
    [parseInt(tournamentId), String(accountId)]
  );
  const entry = r.rows[0] || null;
  if (entry) {
    try {
      await p.query(
        `DELETE FROM tournament_participants WHERE tournament_id = $1 AND account_id = $2`,
        [parseInt(tournamentId), BigInt(accountId)]
      );
    } catch (_) { /* best-effort */ }
  }
  return entry;
}

// Eligibility check — returns { eligible: bool, reason: string|null, tier: int|null }
async function isPlayerEligibleForTournament(tournamentId, accountId) {
  const t = await getTournamentById(tournamentId);
  if (!t) return { eligible: false, reason: 'Tournament not found', tier: null };

  // Tier check (only applies to tournaments tagged to a season + tier — cross-
  // tier / no-season events are open to everyone). Earlier versions returned
  // immediately here, which bypassed the duplicate-entry and capacity gates
  // for non-tier tournaments. v5.92 keeps tier as an optional gate but always
  // falls through to the shared duplicate/capacity checks below.
  let tier = null;
  if (t.tier_number && t.season_id) {
    const placement = await getPlayerSeasonTier(t.season_id, accountId);
    if (!placement) {
      return { eligible: false, reason: 'You have not been placed in a season tier yet', tier: null };
    }
    if (placement.tier_number !== t.tier_number) {
      return {
        eligible: false,
        reason: `This tournament is for Tier ${t.tier_number}; you are placed in Tier ${placement.tier_number}`,
        tier: placement.tier_number,
      };
    }
    tier = placement.tier_number;
  }

  // Block double-entry across paid/pending statuses (applies to ALL tournaments).
  const existing = await getTournamentEntry(tournamentId, accountId);
  if (existing && existing.status === 'paid') {
    return { eligible: false, reason: 'Already entered', tier };
  }
  // v5.92 — capacity gate. If max_participants is set, block new sign-ups
  // once the paid-entry count reaches that cap. Existing pending row from
  // *this* player is allowed (so a checkout retry doesn't get locked out).
  if (t.max_participants && t.max_participants > 0) {
    const paidCount = await getTournamentPaidEntryCount(tournamentId);
    const isOwnPending = existing && existing.status !== 'paid';
    if (paidCount >= t.max_participants && !isOwnPending) {
      return { eligible: false, reason: 'Tournament is full', tier };
    }
  }
  return { eligible: true, reason: null, tier };
}

// Recompute and persist the prize pool from paid entries (sum of amount_cents)
// onto the season_tiers row that backs the tournament. Caller decides when.
async function recomputeTournamentPrizePool(tournamentId) {
  const p = getPool();
  const t = await getTournamentById(tournamentId);
  if (!t) return null;
  const r = await p.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total_cents
     FROM tournament_entries
     WHERE tournament_id = $1 AND status = 'paid'`,
    [parseInt(tournamentId)]
  );
  const total = r.rows[0]?.total_cents || 0;
  // v5.92 — also update the tournament-level pool so getTournamentLive() (which
  // reads tournaments.prize_pool, NUMERIC dollars) reflects paid entries
  // without a season/tier link. season_tiers stays in sync for tier-tagged
  // events because tournaments.prize_pool is the source of truth for the
  // detail-page live panel and dist calculation.
  await p.query(
    `UPDATE tournaments SET prize_pool = $1 WHERE id = $2`,
    [total / 100, parseInt(tournamentId)]
  );
  if (t.season_id && t.tier_number) {
    await p.query(
      `UPDATE season_tiers SET prize_pool_cents = $1
       WHERE season_id = $2 AND tier_number = $3`,
      [total, t.season_id, t.tier_number]
    );
  }
  return total;
}

async function updateTournamentStatus(id, status) {
  const p = getPool();
  const result = await p.query(
    `UPDATE tournaments SET status = $2 WHERE id = $1 RETURNING *`,
    [parseInt(id), status]
  );
  return result.rows[0];
}

async function deleteTournament(id) {
  const p = getPool();
  await p.query(`DELETE FROM tournaments WHERE id = $1`, [parseInt(id)]);
}

async function getTournamentParticipants(tournamentId) {
  const p = getPool();
  const result = await p.query(`
    SELECT tp.*,
      COALESCE(n.nickname, (
        SELECT ps.persona_name FROM player_stats ps
        JOIN matches m ON m.match_id = ps.match_id
        WHERE ps.account_id = tp.account_id
        ORDER BY m.date DESC LIMIT 1
      ), tp.account_id::text) AS display_name,
      r.mu, r.sigma,
      ROUND((r.mu - 3 * r.sigma) * 100 + 5000) AS mmr
    FROM tournament_participants tp
    LEFT JOIN ratings r ON r.player_id = tp.account_id
    LEFT JOIN nicknames n ON n.account_id = tp.account_id
    WHERE tp.tournament_id = $1
    ORDER BY tp.seed ASC NULLS LAST, ROUND((r.mu - 3 * r.sigma) * 100 + 5000) DESC NULLS LAST
  `, [parseInt(tournamentId)]);

  if (!result.rows.length) return [];

  const accountIds = result.rows.map(r => r.account_id);
  const formRes = await p.query(`
    SELECT ps.account_id,
           m.radiant_win,
           ps.team,
           m.date,
           ROW_NUMBER() OVER (PARTITION BY ps.account_id ORDER BY m.date DESC) AS rn
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.account_id = ANY($1) AND m.is_legacy = FALSE
  `, [accountIds]);

  const formMap = {};
  for (const row of formRes.rows) {
    if (row.rn > 5) continue;
    if (!formMap[row.account_id]) formMap[row.account_id] = [];
    const won = (row.team === 'radiant' && row.radiant_win) || (row.team === 'dire' && !row.radiant_win);
    formMap[row.account_id].push(won ? 'W' : 'L');
  }

  return result.rows.map(r => ({
    ...r,
    mmr: r.mmr ? parseInt(r.mmr) : null,
    recent_form: (formMap[r.account_id] || []).join(''),
  }));
}

async function linkTournamentMatch(matchId, inhouseMatchId) {
  const p = getPool();
  const result = await p.query(
    `UPDATE tournament_matches SET inhouse_match_id = $2 WHERE id = $1 RETURNING *`,
    [parseInt(matchId), inhouseMatchId ? String(inhouseMatchId) : null]
  );
  if (!result.rows[0]) throw new Error('Match not found');
  const bracketMatch = result.rows[0];

  // When linking a real match (not unlinking), and both bracket slots are filled,
  // attempt to auto-derive the winner from the recorded inhouse match result.
  if (inhouseMatchId && bracketMatch.p1_id && bracketMatch.p2_id) {
    const matchRes = await p.query(
      `SELECT match_id, radiant_win FROM matches WHERE match_id = $1`,
      [String(inhouseMatchId)]
    );
    const match = matchRes.rows[0];
    if (match) {
      const [p1Stats, p2Stats] = await Promise.all([
        p.query(
          `SELECT team FROM player_stats WHERE match_id = $1 AND account_id = $2 LIMIT 1`,
          [String(inhouseMatchId), bracketMatch.p1_id]
        ),
        p.query(
          `SELECT team FROM player_stats WHERE match_id = $1 AND account_id = $2 LIMIT 1`,
          [String(inhouseMatchId), bracketMatch.p2_id]
        ),
      ]);
      const p1Row = p1Stats.rows[0];
      const p2Row = p2Stats.rows[0];
      // Both bracket players must appear in the linked match on OPPOSING teams to auto-advance
      if (p1Row && p2Row && p1Row.team !== p2Row.team) {
        const p1Won =
          (p1Row.team === 'radiant' && match.radiant_win) ||
          (p1Row.team === 'dire' && !match.radiant_win);
        const winnerId = p1Won ? bracketMatch.p1_id : bracketMatch.p2_id;
        // setTournamentMatchWinner handles round advancement and bracket_data sync internally
        return setTournamentMatchWinner(matchId, winnerId);
      }
    }
  }

  // No auto-advance: just sync bracket_data to reflect the new inhouse_match_id link
  const linkedMatches = await getTournamentMatches(bracketMatch.tournament_id);
  await p.query(
    `UPDATE tournaments SET bracket_data = $2 WHERE id = $1`,
    [bracketMatch.tournament_id, JSON.stringify(linkedMatches)]
  );
  return linkedMatches;
}

async function reseedTournamentParticipants(tournamentId, orderedAccountIds) {
  const p = getPool();
  for (let i = 0; i < orderedAccountIds.length; i++) {
    await p.query(
      `UPDATE tournament_participants SET seed = $3 WHERE tournament_id = $1 AND account_id = $2`,
      [parseInt(tournamentId), BigInt(orderedAccountIds[i]), i + 1]
    );
  }
  return getTournamentParticipants(tournamentId);
}

async function addTournamentParticipant(tournamentId, accountId, seed) {
  const p = getPool();
  const result = await p.query(
    `INSERT INTO tournament_participants (tournament_id, account_id, seed)
     VALUES ($1, $2, $3) ON CONFLICT (tournament_id, account_id) DO UPDATE SET seed = EXCLUDED.seed RETURNING *`,
    [parseInt(tournamentId), BigInt(accountId), seed || null]
  );
  return result.rows[0];
}

async function removeTournamentParticipant(tournamentId, accountId) {
  const p = getPool();
  await p.query(
    `DELETE FROM tournament_participants WHERE tournament_id = $1 AND account_id = $2`,
    [parseInt(tournamentId), BigInt(accountId)]
  );
}

// Standard single-elimination bracket position array of length `size`.
// e.g. size=8 → [1,8,4,5,2,7,3,6] giving matches 1v8, 4v5, 2v7, 3v6.
function _buildBracketPositions(size) {
  let positions = [1];
  let round = 1;
  while (round < size) {
    const next = [];
    for (const pos of positions) {
      next.push(pos);
      next.push(round * 2 + 1 - pos);
    }
    positions = next;
    round *= 2;
  }
  return positions;
}

// Auto-advance generated byes: only touches round-1 matches where one slot was
// never seeded (a true bracket bye).  Later-round matches whose empty slot is
// waiting for an upstream result are NOT advanced here — that is handled inline
// in setTournamentMatchWinner via _checkAndAdvanceSingleElimBye after routing.
async function _autoAdvanceByes(tournamentId) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, COALESCE(p1_id, p2_id) AS solo_id FROM tournament_matches
     WHERE tournament_id = $1 AND round = 1 AND winner_id IS NULL
       AND ((p1_id IS NOT NULL AND p2_id IS NULL) OR (p1_id IS NULL AND p2_id IS NOT NULL))
     ORDER BY slot ASC`,
    [parseInt(tournamentId)]
  );
  for (const bye of res.rows) {
    await setTournamentMatchWinner(bye.id, bye.solo_id);
  }
}

// After routing a winner to a later-round placeholder, check whether that
// destination match is now a bye: one player present and the OTHER feeder
// match is permanently empty (p1_id IS NULL AND p2_id IS NULL — it was a
// seeding gap that never got any participant).  If so, advance immediately.
async function _checkAndAdvanceSingleElimBye(p, tournamentId, destRound, destSlot, destMatchId) {
  const destRes = await p.query(
    `SELECT * FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'W' AND round = $2 AND slot = $3`,
    [tournamentId, destRound, destSlot]
  );
  const dest = destRes.rows[0];
  if (!dest || dest.winner_id) return;

  const soloId = (dest.p1_id && !dest.p2_id) ? dest.p1_id
               : (!dest.p1_id && dest.p2_id) ? dest.p2_id
               : null;
  if (!soloId) return;

  // Determine which feeder (prev-round slot) provides the empty position.
  // p1 comes from prev-round slot (2*destSlot - 1), p2 from (2*destSlot).
  const emptyIsP2 = Boolean(dest.p1_id);
  const feederSlot = emptyIsP2 ? destSlot * 2 : destSlot * 2 - 1;
  const feederRes = await p.query(
    `SELECT * FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'W' AND round = $2 AND slot = $3`,
    [tournamentId, destRound - 1, feederSlot]
  );
  const feeder = feederRes.rows[0];
  // Only advance when the feeder is permanently empty (never had any participant).
  if (feeder && !feeder.p1_id && !feeder.p2_id && !feeder.winner_id) {
    await setTournamentMatchWinner(dest.id, soloId);
  }
}

async function generateTournamentBracket(tournamentId) {
  const p = getPool();
  await p.query(`DELETE FROM tournament_matches WHERE tournament_id = $1`, [parseInt(tournamentId)]);
  const tournamentRes = await p.query('SELECT * FROM tournaments WHERE id = $1', [parseInt(tournamentId)]);
  const tournament = tournamentRes.rows[0];
  if (!tournament) throw new Error('Tournament not found');
  const participants = await getTournamentParticipants(tournamentId);
  const n = participants.length;
  if (n < 2) throw new Error('Need at least 2 participants');

  // Determine bracket size: use the configured bracket_size if set, otherwise
  // round up to the next power of 2 that fits all participants.
  const VALID_SIZES = [4, 8, 16];
  const minSize = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
  let size;
  if (tournament.bracket_size) {
    if (!VALID_SIZES.includes(tournament.bracket_size)) {
      throw new Error('Bracket size must be 4, 8, or 16');
    }
    if (n > tournament.bracket_size) {
      throw new Error(`Too many participants (${n}) for a ${tournament.bracket_size}-player bracket`);
    }
    size = tournament.bracket_size;
  } else {
    if (n > 16) throw new Error('Maximum 16 participants supported (4/8/16-player brackets)');
    size = minSize;
  }

  const ordered = participants;
  const bracketType = tournament.format === 'double_elim' ? 'double_elim' : 'single_elim';

  const bracketPositions = _buildBracketPositions(size);
  const slots = bracketPositions.map(seedNum => ordered[seedNum - 1] || null);

  // Preserve original slot positions — do NOT skip empty pairs or swap p1/p2.
  // This keeps downstream routing correct when bracket_size > participant count.
  const pairs = [];
  for (let i = 0; i < size; i += 2) {
    pairs.push([slots[i] || null, slots[i + 1] || null]);
  }

  const seedingSnapshot = JSON.stringify(
    ordered.map(pl => ({ account_id: String(pl.account_id), display_name: pl.display_name, mmr: pl.mmr || null }))
  );
  await p.query(
    `UPDATE tournaments SET bracket_type = $2, seeding = $3 WHERE id = $1`,
    [parseInt(tournamentId), bracketType, seedingSnapshot]
  );

  if (tournament.format === 'double_elim') {
    await generateDoubleElimBracket(parseInt(tournamentId), pairs, size);
  } else {
    for (let slot = 0; slot < pairs.length; slot++) {
      const pair = pairs[slot];
      await p.query(
        `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id)
         VALUES ($1, 'W', 1, $2, $3, $4)`,
        [parseInt(tournamentId), slot + 1, pair[0]?.account_id || null, pair[1]?.account_id || null]
      );
    }
    // Pre-create placeholder rows for all future rounds so the full bracket tree
    // is visible immediately with TBD slots rather than appearing lazily.
    const numRounds = Math.log2(size);
    for (let r = 2; r <= numRounds; r++) {
      const matchCount = size / Math.pow(2, r);
      for (let s = 1; s <= matchCount; s++) {
        await p.query(
          `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id)
           VALUES ($1, 'W', $2, $3, NULL, NULL)`,
          [parseInt(tournamentId), r, s]
        );
      }
    }
    await p.query(`UPDATE tournaments SET status = 'active' WHERE id = $1`, [parseInt(tournamentId)]);
  }

  await _autoAdvanceByes(parseInt(tournamentId));

  const matches = await getTournamentMatches(tournamentId);
  await p.query(
    `UPDATE tournaments SET bracket_data = $2 WHERE id = $1`,
    [parseInt(tournamentId), JSON.stringify(matches)]
  );

  return matches;
}

async function generateDoubleElimBracket(tournamentId, pairs, size) {
  const p = getPool();
  const wbRounds = Math.log2(size);
  const lbRounds = wbRounds > 1 ? 2 * (wbRounds - 1) : 0;

  for (let s = 0; s < pairs.length; s++) {
    await p.query(
      `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id) VALUES ($1, 'W', 1, $2, $3, $4)`,
      [tournamentId, s + 1, pairs[s][0]?.account_id || null, pairs[s][1]?.account_id || null]
    );
  }

  for (let r = 2; r <= wbRounds; r++) {
    const matchCount = size / Math.pow(2, r);
    for (let s = 1; s <= matchCount; s++) {
      await p.query(
        `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id) VALUES ($1, 'W', $2, $3, NULL, NULL)`,
        [tournamentId, r, s]
      );
    }
  }

  for (let r = 1; r <= lbRounds; r++) {
    const matchCount = size / Math.pow(2, Math.floor((r + 1) / 2) + 1);
    for (let s = 1; s <= matchCount; s++) {
      await p.query(
        `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id) VALUES ($1, 'L', $2, $3, NULL, NULL)`,
        [tournamentId, r, s]
      );
    }
  }

  // GF R1: WB finalist vs LB finalist. If LB finalist wins, GF R2 (reset) is played.
  await p.query(
    `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id) VALUES ($1, 'GF', 1, 1, NULL, NULL)`,
    [tournamentId]
  );
  // GF R2 placeholder (bracket reset): only populated if LB finalist wins GF R1.
  await p.query(
    `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id) VALUES ($1, 'GF', 2, 1, NULL, NULL)`,
    [tournamentId]
  );

  await p.query(`UPDATE tournaments SET status = 'active' WHERE id = $1`, [tournamentId]);
  return getTournamentMatches(tournamentId);
}

async function getTournamentMatches(tournamentId) {
  const p = getPool();
  // ⚠️  v5.79 — DO NOT join the `players` table here. `players` has no
  // `account_id` column (it stores the 32-bit id under `account_id_32` as
  // a varchar) and no `persona_name` column. The previous joins threw
  // `column pl1.account_id does not exist` on every detail-page hit, which
  // bubbled up as HTTP 500 from /api/tournaments/:id and rendered the
  // user-facing "Tournament not found" page for *every* tournament.
  // Persona names live in `player_stats`; resolve them via a correlated
  // subquery (same trick as getTournamentParticipants), with the nickname
  // table as the preferred override.
  const result = await p.query(`
    SELECT tm.*,
      COALESCE(
        n1.nickname,
        (SELECT ps.persona_name FROM player_stats ps WHERE ps.account_id = tm.p1_id ORDER BY ps.id DESC LIMIT 1),
        tm.p1_id::text
      ) AS p1_name,
      COALESCE(
        n2.nickname,
        (SELECT ps.persona_name FROM player_stats ps WHERE ps.account_id = tm.p2_id ORDER BY ps.id DESC LIMIT 1),
        tm.p2_id::text
      ) AS p2_name,
      COALESCE(
        nw.nickname,
        (SELECT ps.persona_name FROM player_stats ps WHERE ps.account_id = tm.winner_id ORDER BY ps.id DESC LIMIT 1),
        tm.winner_id::text
      ) AS winner_name
    FROM tournament_matches tm
    LEFT JOIN nicknames n1 ON n1.account_id = tm.p1_id
    LEFT JOIN nicknames n2 ON n2.account_id = tm.p2_id
    LEFT JOIN nicknames nw ON nw.account_id = tm.winner_id
    WHERE tm.tournament_id = $1
    ORDER BY tm.round ASC, tm.slot ASC
  `, [parseInt(tournamentId)]);
  return result.rows;
}

async function setTournamentMatchWinner(matchId, winnerId) {
  const p = getPool();
  const matchRes = await p.query(`SELECT * FROM tournament_matches WHERE id = $1`, [parseInt(matchId)]);
  const match = matchRes.rows[0];
  if (!match) throw new Error('Match not found');
  // Idempotent: if already resolved (e.g. via recursive bye-advance), skip.
  if (match.winner_id) return getTournamentMatches(match.tournament_id);

  if (!winnerId) throw new Error('winnerId required');

  const tournamentRes = await p.query('SELECT * FROM tournaments WHERE id = $1', [match.tournament_id]);
  const tournament = tournamentRes.rows[0];
  const isDoubleElim = tournament?.format === 'double_elim';

  const winnerBig = BigInt(winnerId);
  await p.query(`UPDATE tournament_matches SET winner_id = $2 WHERE id = $1`, [parseInt(matchId), winnerBig]);

  // Determine loser only when both slots are occupied.
  const loserId = (match.p1_id && match.p2_id)
    ? (winnerBig === BigInt(match.p1_id) ? match.p2_id : match.p1_id)
    : null;

  if (isDoubleElim) {
    await _routeDoubleElim(p, match, BigInt(winnerId), loserId ? BigInt(loserId) : null);
  } else {
    if (loserId) {
      await p.query(`UPDATE tournament_participants SET eliminated = TRUE WHERE tournament_id = $1 AND account_id = $2`,
        [match.tournament_id, loserId]);
    }
    // Immediate slot-based routing: place the winner into the next round
    // without waiting for the rest of the current round to finish.
    const maxRoundRes = await p.query(
      `SELECT MAX(round) AS max_round FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'W'`,
      [match.tournament_id]);
    const maxWBRound = parseInt(maxRoundRes.rows[0].max_round) || 1;
    if (match.round >= maxWBRound) {
      // Grand final complete → tournament over.
      await p.query(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [match.tournament_id]);
    } else {
      const nextRound = match.round + 1;
      const nextSlot = Math.ceil(match.slot / 2);
      const position = match.slot % 2 === 1 ? 'p1' : 'p2';
      const updated = await p.query(
        `UPDATE tournament_matches SET ${position}_id = $1
         WHERE tournament_id = $2 AND bracket = 'W' AND round = $3 AND slot = $4
         RETURNING id`,
        [winnerBig, match.tournament_id, nextRound, nextSlot]
      );
      if (updated.rows.length === 0) {
        // Legacy fallback (no pre-created placeholder for this slot).
        await p.query(
          `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, ${position}_id)
           VALUES ($1, 'W', $2, $3, $4)`,
          [match.tournament_id, nextRound, nextSlot, winnerBig]
        );
      }
      // Check whether the destination match is now a bye: solo player +
      // permanently-empty feeder for the missing slot.  Advance if so.
      await _checkAndAdvanceSingleElimBye(p, match.tournament_id, nextRound, nextSlot);
    }
  }
  const finalMatches = await getTournamentMatches(match.tournament_id);
  await p.query(
    `UPDATE tournaments SET bracket_data = $2 WHERE id = $1`,
    [match.tournament_id, JSON.stringify(finalMatches)]
  );
  return finalMatches;
}

async function _routeDoubleElim(p, match, winnerId, loserId) {
  const tid = match.tournament_id;
  const bracket = match.bracket || 'W';
  const round = match.round;
  const slot = match.slot;

  const maxWBRes = await p.query(`SELECT MAX(round) as max_round FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'W'`, [tid]);
  const wbRounds = parseInt(maxWBRes.rows[0].max_round) || 1;
  const lbRounds = wbRounds > 1 ? 2 * (wbRounds - 1) : 0;

  const placePlayer = async (targetBracket, targetRound, targetSlot, position, playerId) => {
    if (!playerId) return;
    await p.query(
      `UPDATE tournament_matches SET ${position}_id = $1 WHERE tournament_id = $2 AND bracket = $3 AND round = $4 AND slot = $5`,
      [playerId, tid, targetBracket, targetRound, targetSlot]
    );
  };

  if (bracket === 'GF') {
    if (match.round === 1 && match.p1_id && loserId && loserId === BigInt(match.p1_id)) {
      // LB finalist beat the WB finalist in GF round 1.
      // WB finalist has now taken their first (and only allowed) loss.
      // Trigger a bracket reset: GF round 2 with same matchup.
      await p.query(
        `UPDATE tournament_matches SET p1_id = $2, p2_id = $3, winner_id = NULL
         WHERE tournament_id = $1 AND bracket = 'GF' AND round = 2 AND slot = 1`,
        [tid, match.p1_id, match.p2_id]
      );
    } else {
      // WB finalist won GF R1 (never lost), or someone won GF R2 (reset) → champion.
      await p.query(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [tid]);
      if (loserId) {
        await p.query(`UPDATE tournament_participants SET eliminated = TRUE WHERE tournament_id = $1 AND account_id = $2`, [tid, loserId]);
      }
    }
    return;
  }

  if (bracket === 'W') {
    if (round === wbRounds) {
      await placePlayer('GF', 1, 1, 'p1', winnerId);
      if (lbRounds === 0) {
        await placePlayer('GF', 1, 1, 'p2', loserId);
      } else {
        await placePlayer('L', lbRounds, 1, 'p2', loserId);
      }
    } else {
      const nextSlot = Math.ceil(slot / 2);
      const position = slot % 2 === 1 ? 'p1' : 'p2';
      await placePlayer('W', round + 1, nextSlot, position, winnerId);
      if (round === 1) {
        const lbSlot = Math.ceil(slot / 2);
        const lbPosition = slot % 2 === 1 ? 'p1' : 'p2';
        await placePlayer('L', 1, lbSlot, lbPosition, loserId);
        // After routing, check if the LB slot is now a true bye (one player
        // only, because the complementary WB R1 slot was a generated bye and
        // sent no loser). If so, auto-advance the single player immediately.
        const lbRes = await p.query(
          `SELECT * FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'L' AND round = 1 AND slot = $2`,
          [tid, lbSlot]);
        const lbMatch = lbRes.rows[0];
        if (lbMatch && !lbMatch.winner_id) {
          const soloId = (lbMatch.p1_id && !lbMatch.p2_id) ? lbMatch.p1_id
                       : (!lbMatch.p1_id && lbMatch.p2_id) ? lbMatch.p2_id
                       : null;
          if (soloId) {
            // Confirm by checking if the complementary WB R1 feeder was a bye.
            const feedSlots = [lbSlot * 2 - 1, lbSlot * 2];
            for (const fs of feedSlots) {
              const wbRes = await p.query(
                `SELECT * FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'W' AND round = 1 AND slot = $2`,
                [tid, fs]);
              const wbFeed = wbRes.rows[0];
              if (wbFeed && wbFeed.winner_id && !wbFeed.p2_id) {
                await setTournamentMatchWinner(lbMatch.id, soloId);
                break;
              }
            }
          }
        }
      } else {
        await placePlayer('L', 2 * (round - 1), slot, 'p2', loserId);
      }
    }
  } else if (bracket === 'L') {
    if (loserId) {
      await p.query(`UPDATE tournament_participants SET eliminated = TRUE WHERE tournament_id = $1 AND account_id = $2`, [tid, loserId]);
    }
    if (round === lbRounds) {
      await placePlayer('GF', 1, 1, 'p2', winnerId);
    } else if (round % 2 === 1) {
      await placePlayer('L', round + 1, slot, 'p1', winnerId);
    } else {
      const nextSlot = Math.ceil(slot / 2);
      const position = slot % 2 === 1 ? 'p1' : 'p2';
      await placePlayer('L', round + 1, nextSlot, position, winnerId);
    }
  }

}

// Surgically clear only the downstream bracket path starting from the winner of
// the match at (fromRound, fromSlot). Leaves matches on unaffected paths intact.
async function _clearSingleElimPath(p, tournamentId, fromRound, fromSlot, trackedPlayerId) {
  const nextRound = fromRound + 1;
  const nextSlot = Math.ceil(fromSlot / 2);
  const position = fromSlot % 2 === 1 ? 'p1' : 'p2';

  const nextRes = await p.query(
    `SELECT * FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'W' AND round = $2 AND slot = $3`,
    [tournamentId, nextRound, nextSlot]
  );
  if (!nextRes.rows.length) return;
  const nextMatch = nextRes.rows[0];

  const slotValue = position === 'p1' ? nextMatch.p1_id : nextMatch.p2_id;
  if (!slotValue || BigInt(slotValue) !== BigInt(trackedPlayerId)) return;

  if (nextMatch.winner_id) {
    // Cascade further using whoever won this downstream match.
    await _clearSingleElimPath(p, tournamentId, nextRound, nextSlot, nextMatch.winner_id);
    // Restore the loser who was eliminated when this match was played.
    const loserId = BigInt(nextMatch.winner_id) === BigInt(nextMatch.p1_id || 0)
      ? nextMatch.p2_id : nextMatch.p1_id;
    if (loserId && BigInt(loserId) !== BigInt(trackedPlayerId)) {
      await p.query(
        `UPDATE tournament_participants SET eliminated = FALSE WHERE tournament_id = $1 AND account_id = $2`,
        [tournamentId, loserId]);
    }
  }

  await p.query(
    `UPDATE tournament_matches SET ${position}_id = NULL, winner_id = NULL WHERE id = $1`,
    [nextMatch.id]
  );
}

async function clearTournamentMatchWinner(matchId) {
  const p = getPool();
  const matchRes = await p.query(`SELECT * FROM tournament_matches WHERE id = $1`, [parseInt(matchId)]);
  const match = matchRes.rows[0];
  if (!match || !match.winner_id) return;

  const tournamentRes = await p.query('SELECT * FROM tournaments WHERE id = $1', [match.tournament_id]);
  const tournament = tournamentRes.rows[0];
  const isDoubleElim = tournament?.format === 'double_elim';

  const loserId = (match.p1_id && match.p2_id)
    ? (BigInt(match.winner_id) === BigInt(match.p1_id) ? match.p2_id : match.p1_id)
    : null;
  await p.query(`UPDATE tournament_matches SET winner_id = NULL WHERE id = $1`, [parseInt(matchId)]);

  if (isDoubleElim) {
    if (loserId) {
      await p.query(`UPDATE tournament_participants SET eliminated = FALSE WHERE tournament_id = $1 AND account_id = $2`,
        [match.tournament_id, loserId]);
    }
    await p.query(`UPDATE tournament_matches SET winner_id = NULL, p1_id = NULL, p2_id = NULL WHERE tournament_id = $1 AND bracket IN ('GF') AND winner_id IS NULL`, [match.tournament_id]);
    await p.query(
      `UPDATE tournament_matches SET p1_id = CASE WHEN p1_id = $2 THEN NULL ELSE p1_id END, p2_id = CASE WHEN p2_id = $2 THEN NULL ELSE p2_id END, winner_id = NULL WHERE tournament_id = $1 AND id != $3 AND (p1_id = $2 OR p2_id = $2)`,
      [match.tournament_id, BigInt(match.winner_id), parseInt(matchId)]
    );
    if (loserId) {
      await p.query(
        `UPDATE tournament_matches SET p1_id = CASE WHEN p1_id = $2 THEN NULL ELSE p1_id END, p2_id = CASE WHEN p2_id = $2 THEN NULL ELSE p2_id END, winner_id = NULL WHERE tournament_id = $1 AND (p1_id = $2 OR p2_id = $2)`,
        [match.tournament_id, BigInt(loserId)]
      );
    }
    await p.query(`UPDATE tournaments SET status = 'active' WHERE id = $1 AND status = 'completed'`, [match.tournament_id]);
  } else {
    if (loserId) {
      await p.query(`UPDATE tournament_participants SET eliminated = FALSE WHERE tournament_id = $1 AND account_id = $2`,
        [match.tournament_id, loserId]);
    }
    // Surgically clear only the downstream path of the winner (slot-based).
    await _clearSingleElimPath(p, match.tournament_id, match.round, match.slot, BigInt(match.winner_id));
    await p.query(`UPDATE tournaments SET status = 'active' WHERE id = $1 AND status = 'completed'`, [match.tournament_id]);
  }
  const clearedMatches = await getTournamentMatches(match.tournament_id);
  await p.query(
    `UPDATE tournaments SET bracket_data = $2 WHERE id = $1`,
    [match.tournament_id, JSON.stringify(clearedMatches)]
  );
  return clearedMatches;
}

// ─── Weekend / Special Event Tournaments ───────────────────────────────────

async function createWeekendTournament({ name, description, startDate, endDate, gamesToCount = 3, prizePool = 0, buyIn = 0 }) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO weekend_tournaments (name, description, start_date, end_date, games_to_count, prize_pool, buy_in)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [name, description || null, startDate, endDate, gamesToCount, prizePool, buyIn]
  );
  return res.rows[0];
}

async function getWeekendTournaments() {
  const p = getPool();
  const res = await p.query(`SELECT * FROM weekend_tournaments ORDER BY start_date DESC`);
  return res.rows;
}

async function getWeekendTournamentById(id) {
  const p = getPool();
  const res = await p.query(`SELECT * FROM weekend_tournaments WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function updateWeekendTournament(id, fields) {
  const p = getPool();
  const allowed = ['name', 'description', 'start_date', 'end_date', 'games_to_count', 'prize_pool', 'buy_in', 'status', 'discord_announced'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
  }
  if (!sets.length) return getWeekendTournamentById(id);
  vals.push(id);
  const res = await p.query(
    `UPDATE weekend_tournaments SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  return res.rows[0];
}

async function getWeekendTournamentScores(startDate, endDate, gamesToCount = 3) {
  const p = getPool();
  const res = await p.query(
    `SELECT
       ps.account_id,
       COALESCE(MAX(n.nickname), MAX(ps.persona_name)) AS display_name,
       m.match_id,
       m.date,
       ps.kills, ps.deaths, ps.assists, ps.last_hits,
       ps.gpm, ps.xpm, ps.hero_damage, ps.tower_damage, ps.hero_healing,
       ps.obs_placed, ps.sen_placed, ps.wards_killed, ps.camps_stacked,
       m.duration,
       CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true)
                 OR (ps.team = 'dire' AND m.radiant_win = false) THEN true ELSE false END AS won,
       ROUND(
         ps.kills * 4 +
         ps.assists * 2.5 +
         ps.deaths * -3 +
         ps.last_hits * 0.04 +
         ps.gpm * 0.25 +
         ps.xpm * 0.22 +
         ps.hero_damage / 2000.0 +
         ps.tower_damage / 1000.0 +
         ps.hero_healing / 1500.0 +
         ps.camps_stacked * 7 +
         ps.obs_placed * 4 +
         ps.sen_placed * 6 +
         ps.wards_killed * 10 +
         CASE WHEN (ps.team = 'radiant' AND m.radiant_win = true)
                   OR (ps.team = 'dire' AND m.radiant_win = false)
              THEN 25 + GREATEST(0, (2100 - m.duration) / 60.0)
              ELSE 0 END
       , 1) AS game_score
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id
     WHERE ps.account_id > 0
       AND m.date >= $1 AND m.date <= $2
     GROUP BY ps.account_id, m.match_id, m.date, m.radiant_win, m.duration,
       ps.team, ps.kills, ps.deaths, ps.assists, ps.last_hits,
       ps.gpm, ps.xpm, ps.hero_damage, ps.tower_damage, ps.hero_healing,
       ps.obs_placed, ps.sen_placed, ps.wards_killed, ps.camps_stacked
     ORDER BY ps.account_id, game_score DESC`,
    [startDate, endDate]
  );

  const byPlayer = {};
  for (const row of res.rows) {
    const aid = row.account_id.toString();
    if (!byPlayer[aid]) {
      byPlayer[aid] = { account_id: aid, display_name: row.display_name, games: [] };
    }
    byPlayer[aid].games.push(row);
  }

  const leaderboard = Object.values(byPlayer).map(player => {
    const topGames = player.games.slice(0, gamesToCount);
    const total = topGames.reduce((sum, g) => sum + parseFloat(g.game_score), 0);
    return {
      account_id: player.account_id,
      display_name: player.display_name,
      total_score: Math.round(total * 10) / 10,
      games_played: player.games.length,
      games_counted: topGames.length,
      top_games: topGames,
    };
  }).sort((a, b) => b.total_score - a.total_score);

  return leaderboard;
}
