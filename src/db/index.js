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
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS replay_file_path TEXT DEFAULT NULL`);
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS replay_file_expires_at TIMESTAMPTZ DEFAULT NULL`);

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

    await p.query(`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS dota_rank_tier INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS dota_leaderboard_rank INTEGER DEFAULT NULL`);
    await p.query(`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS dota_rank_source VARCHAR(16) DEFAULT NULL`);
    await p.query(`ALTER TABLE nicknames ADD COLUMN IF NOT EXISTS dota_rank_updated_at TIMESTAMPTZ DEFAULT NULL`);

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

    // Generic key/value site settings (e.g. feature flags like use_v3_trueskill)
    await p.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await p.query(
      `INSERT INTO site_settings (key, value) VALUES ('use_v3_trueskill', 'false')
       ON CONFLICT (key) DO NOTHING`
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
         ('season_pass_s10', 'off', 'Wave 2: Season Pass — XP from games (win/loss/MVP/streak), tier rewards, progression bar'),
         ('notification_prefs', 'off', 'Wave 2: Per-user opt-in for each notification category (post-match DMs, hot streaks, schedule reminders, etc.)'),
         ('tournament_live_v2', 'off', 'Wave 3: Tournament bracket live view — match-day scoreboard + auto-updating standings + prize distribution'),
         ('mvp_attitude_analytics', 'off', 'Wave 3: MVP rate + attitude trend analytics on player profiles'),
         ('web_push', 'off', 'Wave 3: Browser web push notifications for game reminders + match completions'),
         ('profile_customization', 'off', 'Player-editable profile bio, custom title, theme accent, pinned hero + pinned match (free tier; premium cosmetics gated by Pro tier later)'),
         ('pro_tier', 'off', 'Pro Tier — paid lifetime unlock. Gates Hero Meta V2, Hero Matchups, Skill Builds, Compare/H2H, Benchmarks, premium profile cosmetics, and CSV match exports when state=on'),
         ('coaching_marketplace', 'off', 'Coaching Marketplace — paid 1:1 coaching via Stripe Connect (Express). 10% platform take rate. Eligibility = top-5 leaderboard or Immortal+ Steam rank. Sessions delivered in Discord; no built-in video.')
       ON CONFLICT (key) DO NOTHING`
    );

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
        completed_at TIMESTAMPTZ,
        dispute_reason TEXT,
        disputed_at TIMESTAMPTZ,
        refunded_at TIMESTAMPTZ,
        reminder_sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
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
    await p.query(`CREATE INDEX IF NOT EXISTS idx_inhouse_session_players_session ON inhouse_session_players (session_id)`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_inhouse_sessions_status ON inhouse_sessions (status)`);

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
  const result = await p.query(`SELECT * FROM seasons ORDER BY start_date DESC`);
  return result.rows;
}

async function getActiveSeason() {
  const p = getPool();
  const result = await p.query(`SELECT * FROM seasons WHERE active = true LIMIT 1`);
  return result.rows[0] || null;
}

async function createSeason(name) {
  const p = getPool();
  await p.query(`UPDATE seasons SET active = false`);
  const result = await p.query(
    `INSERT INTO seasons (name, active) VALUES ($1, true) RETURNING *`,
    [name]
  );
  return result.rows[0];
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
  const allowed = ['name', 'rank_floor', 'rank_ceiling', 'min_mmr', 'prize_pool_cents', 'buyin_cents'];
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
  await p.query(`UPDATE seasons SET active = false`);
  const result = await p.query(
    `UPDATE seasons SET active = true WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
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

    return matchStats.matchId;
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      console.log(`[DB] Match ${matchStats.matchId} already recorded (duplicate).`);
      return null;
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
    `SELECT
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
       MAX(r.last_updated) as last_updated
     FROM ratings r
     LEFT JOIN nicknames n ON n.account_id::text = r.player_id::text
     GROUP BY COALESCE(n.nickname, r.player_id::text)
     ORDER BY mmr DESC LIMIT $1`,
    [limit]
  );
  for (const row of result.rows) {
    row.display_name = decodeByteString(row.display_name);
  }
  return result.rows;
}

/**
 * Compute TrueSkill ratings from scratch using only the matches in the
 * specified season. Returns a plain object keyed by player_id (string).
 * This is the single source of truth for season-scoped MMR used by both
 * the leaderboard and player profile pages.
 */
async function computeSeasonTrueSkill(seasonId = null) {
  const p = getPool();
  const { getStatsService } = require('../stats/statsService');
  const statsService = getStatsService();

  // Build canonical ID map so accounts sharing a nickname are treated as one player.
  // e.g. if account 111 and account 222 are both nicknamed "Burtle", all their
  // matches feed into a single TrueSkill rating slot keyed by the lower account ID.
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
    if (ids.length < 2) continue; // no merge needed
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

  const rows = await p.query(
    `SELECT m.match_id, m.date, m.radiant_win,
            ps.account_id, ps.persona_name, ps.team
     FROM matches m
     JOIN player_stats ps ON ps.match_id = m.match_id
     ${matchWhere}
     ORDER BY m.date ASC, m.match_id ASC`,
    params
  );

  const matchMap = new Map();
  for (const row of rows.rows) {
    if (!matchMap.has(row.match_id)) {
      matchMap.set(row.match_id, { radiantWin: row.radiant_win, radiant: [], dire: [] });
    }
    const rawId = row.account_id > 0 ? row.account_id.toString() : null;
    if (!rawId) continue;
    const id = getCanonical(rawId);
    const entry = { id, persona_name: row.persona_name };
    if (row.team === 'radiant') matchMap.get(row.match_id).radiant.push(entry);
    else matchMap.get(row.match_id).dire.push(entry);
  }

  const DEFAULT_MU = 25, DEFAULT_SIGMA = 8.333;
  const ratings = {};

  for (const [, match] of matchMap) {
    if (match.radiant.length === 0 || match.dire.length === 0) continue;

    // De-duplicate within a team in case two merged accounts played the same match
    const dedup = (team) => {
      const seen = new Set();
      return team.filter(pl => seen.has(pl.id) ? false : seen.add(pl.id));
    };
    const radiant = dedup(match.radiant).map(pl => ({
      id: pl.id,
      mu: ratings[pl.id]?.mu ?? DEFAULT_MU,
      sigma: ratings[pl.id]?.sigma ?? DEFAULT_SIGMA,
    }));
    const dire = dedup(match.dire).map(pl => ({
      id: pl.id,
      mu: ratings[pl.id]?.mu ?? DEFAULT_MU,
      sigma: ratings[pl.id]?.sigma ?? DEFAULT_SIGMA,
    }));

    const newRatings = statsService.calculateNewRatings(radiant, dire, match.radiantWin);

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
// Mirrors computeSeasonTrueSkill but uses the V3 environment and a per-match,
// per-player performance modifier derived from the same scoring formula used by
// the weekend tournament. Modifier is z-scored within each match (ddof=0),
// clamped to ±2σ, then mapped to [0.80, 1.20]. Lobby-only matches (no stats)
// fall back to modifier = 1.0 for everyone.
function _v3PerfScore(s, won) {
  const winBonus = won ? 25 : 0;
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
    + (s.dewards    || 0) * 10
    + winBonus
  );
}

// Same as _v3PerfScore, but returns the per-component contributions so the UI
// can explain *why* a player's modifier landed where it did. The component sum
// equals what _v3PerfScore returns.
function _v3PerfScoreBreakdown(s, won) {
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
    dewards:      (s.dewards    || 0) * 10,
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
            ps.obs_placed, ps.sen_placed, ps.wards_killed, ps.camps_stacked
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
      obs:        Number(row.obs_placed) || 0,
      sen:        Number(row.sen_placed) || 0,
      dewards:    Number(row.wards_killed) || 0,
      camps:      Number(row.camps_stacked) || 0,
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
    kills:     Number(row.kills) || 0,
    deaths:    Number(row.deaths) || 0,
    assists:   Number(row.assists) || 0,
    gpm:       Number(row.gpm) || 0,
    xpm:       Number(row.xpm) || 0,
    hero_dmg:  Number(row.hero_damage) || 0,
    tower_dmg: Number(row.tower_damage) || 0,
    healing:   Number(row.hero_healing) || 0,
    obs:       Number(row.obs_placed) || 0,
    sen:       Number(row.sen_placed) || 0,
    dewards:   Number(row.wards_killed) || 0,
    camps:     Number(row.camps_stacked) || 0,
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
            ps.obs_placed, ps.sen_placed, ps.wards_killed, ps.camps_stacked
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
            ps.obs_placed, ps.sen_placed, ps.wards_killed, ps.camps_stacked
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

  // ── Canonical ID map (nickname merging, same as computeSeasonTrueSkill) ──
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

  // Route to V3 if the admin toggle is on, else default V1
  let useV3 = false;
  try {
    useV3 = (await getSetting('use_v3_trueskill')) === 'true';
  } catch (e) {
    useV3 = false;
  }
  const { ratings } = useV3
    ? await computeSeasonTrueSkillV3(seasonId)
    : await computeSeasonTrueSkill(seasonId);

  // Fetch nicknames and build canonical-account mapping (same logic as computeSeasonTrueSkill)
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

  // Compute raw impact scores using per-game averages + kill involvement
  for (const player of leaderboard) {
    const s = statsAgg[player.player_id];
    if (!s || !player.games_played) { player.impact_raw = null; continue; }
    player.impact_raw = _computeImpactRaw(
      player.games_played, player.wins,
      s.avgKills, s.avgDeaths, s.avgAssists, s.avgKi
    );
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
    // Honour the V1/V3 admin toggle so profile MMR always matches the leaderboard.
    let useV3 = false;
    try { useV3 = (await getSetting('use_v3_trueskill')) === 'true'; } catch { useV3 = false; }
    const { ratings: seasonRatings, accountToCanonical } = useV3
      ? await computeSeasonTrueSkillV3(seasonId)
      : await computeSeasonTrueSkill(seasonId);
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

async function getPlayerAchievements(accountId) {
  const p = getPool();
  const pid = Array.isArray(accountId) ? accountId : [parseInt(accountId)];
  const [gamesRes, heroesRes, captainRes, positionsRes] = await Promise.all([
    p.query(
      `SELECT COUNT(*) as games,
              SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN ps.deaths = 0 THEN 1 ELSE 0 END) as deathless_games
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
      `SELECT COUNT(DISTINCT ps.position) as positions_played FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND ps.position > 0 AND m.is_legacy = false`,
      [pid]
    ),
  ]);
  const games = parseInt(gamesRes.rows[0]?.games) || 0;
  const deathlessGames = parseInt(gamesRes.rows[0]?.deathless_games) || 0;
  const uniqueHeroes = parseInt(heroesRes.rows[0]?.unique_heroes) || 0;
  const maxOnOneHero = parseInt(heroesRes.rows[0]?.max_on_one_hero) || 0;
  const captainGames = parseInt(captainRes.rows[0]?.captain_games) || 0;
  const positionsPlayed = parseInt(positionsRes.rows[0]?.positions_played) || 0;

  const maxStreakRes = await p.query(
    `SELECT ps.team, m.radiant_win, m.date FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false ORDER BY m.date ASC`,
    [pid]
  );
  let maxStreak = 0, cur = 0;
  for (const r of maxStreakRes.rows) {
    const won = (r.team === 'radiant' && r.radiant_win) || (r.team === 'dire' && !r.radiant_win);
    cur = won ? cur + 1 : 0;
    if (cur > maxStreak) maxStreak = cur;
  }

  const [mkRes, fbRes, wardRes, singleGameRes, posRes, totalsRes, kdaRes, healRes, towerRes, winRateRes] = await Promise.all([
    p.query(
      `SELECT SUM(rampages) AS rampages, SUM(ultra_kills) AS ultra_kills, SUM(triple_kills) AS triple_kills,
              SUM(double_kills) AS double_kills, MAX(kills) AS max_kills
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
      `SELECT position, COUNT(*) AS cnt FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND ps.position > 0 AND m.is_legacy = false
       GROUP BY position`,
      [pid]
    ),
    p.query(
      `SELECT SUM(kills) AS total_kills, SUM(assists) AS total_assists, SUM(last_hits) AS total_lh
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT AVG(CASE WHEN deaths > 0 THEN (kills + assists)::float / deaths ELSE (kills + assists)::float END) AS avg_kda
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT SUM(hero_healing) AS total_healing, MAX(hero_healing) AS max_game_healing
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
      `SELECT
         COUNT(*) AS g,
         SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) AS w
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = ANY($1::bigint[]) AND m.is_legacy = false`,
      [pid]
    ),
  ]);

  const rampages = parseInt(mkRes.rows[0]?.rampages) || 0;
  const ultraKills = parseInt(mkRes.rows[0]?.ultra_kills) || 0;
  const tripleKills = parseInt(mkRes.rows[0]?.triple_kills) || 0;
  const doubleKills = parseInt(mkRes.rows[0]?.double_kills) || 0;
  const maxKills = parseInt(mkRes.rows[0]?.max_kills) || 0;
  const firstBloods = parseInt(fbRes.rows[0]?.fbs) || 0;
  const wardsPlaced = parseInt(wardRes.rows[0]?.wards_placed) || 0;
  const wardsKilled = parseInt(wardRes.rows[0]?.wards_killed) || 0;
  const maxDamage = parseInt(singleGameRes.rows[0]?.max_damage) || 0;
  const maxGpm = parseInt(singleGameRes.rows[0]?.max_gpm) || 0;
  const maxHealing = parseInt(singleGameRes.rows[0]?.max_healing) || 0;
  const maxTowerDamage = parseInt(singleGameRes.rows[0]?.max_tower_damage) || 0;
  const maxLastHits = parseInt(singleGameRes.rows[0]?.max_last_hits) || 0;
  const totalCourierKills = parseInt(singleGameRes.rows[0]?.total_courier_kills) || 0;
  const posCounts = {};
  for (const r of posRes.rows) posCounts[r.position] = parseInt(r.cnt) || 0;
  const carryGames = posCounts[1] || 0;
  const supportGames = (posCounts[4] || 0) + (posCounts[5] || 0);
  const totalKills = parseInt(totalsRes.rows[0]?.total_kills) || 0;
  const totalAssists = parseInt(totalsRes.rows[0]?.total_assists) || 0;
  const totalLh = parseInt(totalsRes.rows[0]?.total_lh) || 0;
  const avgKda = parseFloat(kdaRes.rows[0]?.avg_kda) || 0;
  const totalHealing = parseInt(healRes.rows[0]?.total_healing) || 0;
  const totalTowerDamage = parseInt(towerRes.rows[0]?.total_tower_damage) || 0;
  const totalG = parseInt(winRateRes.rows[0]?.g) || 0;
  const totalW = parseInt(winRateRes.rows[0]?.w) || 0;
  const winRate = totalG >= 20 ? totalW / totalG : 0;

  const ACHIEVEMENTS = [
    // Milestones
    { key: 'veteran_10',      label: 'Rookie',             desc: '10 games played',                    icon: '🎮',  earned: games >= 10,  group: 'Milestones' },
    { key: 'veteran_25',      label: 'Veteran',            desc: '25 games played',                    icon: '🎖️',  earned: games >= 25,  group: 'Milestones' },
    { key: 'veteran_50',      label: 'Battle-Hardened',    desc: '50 games played',                    icon: '⚔️',  earned: games >= 50,  group: 'Milestones' },
    { key: 'veteran_100',     label: 'Centurion',          desc: '100 games played',                   icon: '🏆',  earned: games >= 100, group: 'Milestones' },
    { key: 'veteran_200',     label: 'Elder',              desc: '200 games played',                   icon: '🌟',  earned: games >= 200, group: 'Milestones' },
    // Win rate
    { key: 'wr_55',           label: 'Above Average',      desc: '55%+ win rate (20+ games)',          icon: '📈',  earned: winRate >= 0.55, group: 'Win Rate' },
    { key: 'wr_60',           label: 'Dominant',           desc: '60%+ win rate (20+ games)',          icon: '🔝',  earned: winRate >= 0.60, group: 'Win Rate' },
    { key: 'wr_65',           label: 'Unstoppable Force',  desc: '65%+ win rate (20+ games)',          icon: '👑',  earned: winRate >= 0.65, group: 'Win Rate' },
    // Streaks
    { key: 'streak_3',        label: 'Hot',                desc: '3-game win streak',                  icon: '🌶️',  earned: maxStreak >= 3,  group: 'Streaks' },
    { key: 'streak_5',        label: 'On Fire',            desc: '5-game win streak',                  icon: '🔥',  earned: maxStreak >= 5,  group: 'Streaks' },
    { key: 'streak_10',       label: 'Unstoppable',        desc: '10-game win streak',                 icon: '💥',  earned: maxStreak >= 10, group: 'Streaks' },
    // Survivability
    { key: 'deathless',       label: 'Untouchable',        desc: 'Won a game with 0 deaths',           icon: '🛡️',  earned: deathlessGames > 0,   group: 'Survivability' },
    { key: 'deathless_5',     label: 'Ghost',              desc: '5+ deathless game wins',             icon: '👻',  earned: deathlessGames >= 5,  group: 'Survivability' },
    { key: 'deathless_10',    label: 'Phantom',            desc: '10+ deathless game wins',            icon: '💀',  earned: deathlessGames >= 10, group: 'Survivability' },
    // Leadership / roles
    { key: 'captain_5',       label: 'Born Leader',        desc: 'Captained 5+ matches',               icon: '👑',  earned: captainGames >= 5,   group: 'Roles' },
    { key: 'captain_15',      label: 'Commander',          desc: 'Captained 15+ matches',              icon: '⚜️',  earned: captainGames >= 15,  group: 'Roles' },
    { key: 'all_positions',   label: 'Versatile',          desc: 'Played all 5 positions',             icon: '🎭',  earned: positionsPlayed >= 5,  group: 'Roles' },
    { key: 'carry_king',      label: 'Carry King',         desc: '20+ games as Safe Lane (Pos 1)',     icon: '🗡️',  earned: carryGames >= 20,     group: 'Roles' },
    { key: 'support_master',  label: 'Support Master',     desc: '20+ games as Support (Pos 4/5)',     icon: '🩺',  earned: supportGames >= 20,   group: 'Roles' },
    // Hero variety
    { key: 'hero_5',          label: 'Experimenter',       desc: '5+ different heroes',                icon: '🎲',  earned: uniqueHeroes >= 5,   group: 'Hero Pool' },
    { key: 'hero_diversity',  label: 'Jack of All Trades', desc: '15+ different heroes',               icon: '🃏',  earned: uniqueHeroes >= 15,  group: 'Hero Pool' },
    { key: 'hero_diversity_25', label: 'Hero Collector',   desc: '25+ different heroes',               icon: '📚',  earned: uniqueHeroes >= 25,  group: 'Hero Pool' },
    { key: 'specialist',      label: 'Specialist',         desc: '10+ games on one hero',              icon: '🎯',  earned: maxOnOneHero >= 10,  group: 'Hero Pool' },
    { key: 'specialist_20',   label: 'One-Trick',          desc: '20+ games on one hero',              icon: '🔒',  earned: maxOnOneHero >= 20,  group: 'Hero Pool' },
    // Multi-kills
    { key: 'rampage',         label: 'RAMPAGE',            desc: 'Achieved at least one rampage',      icon: '☠️',  earned: rampages > 0,  group: 'Multi-kills' },
    { key: 'rampage_3',       label: 'Slaughterer',        desc: '3+ rampages',                        icon: '🩸',  earned: rampages >= 3,  group: 'Multi-kills' },
    { key: 'ultra_kill',      label: 'Ultra Kill',         desc: 'Got an Ultra Kill',                  icon: '⚡',  earned: ultraKills > 0,  group: 'Multi-kills' },
    { key: 'multikill_10',    label: 'Kill Artist',        desc: '10+ multi-kills (combined)',         icon: '🔪',  earned: (doubleKills + tripleKills + ultraKills + rampages) >= 10, group: 'Multi-kills' },
    { key: 'massacre',        label: 'Massacre',           desc: '20+ kills in a single game',         icon: '💣',  earned: maxKills >= 20,  group: 'Multi-kills' },
    // First blood
    { key: 'first_blood',     label: 'First Blood',        desc: 'Claimed first blood',                icon: '💉',  earned: firstBloods > 0,     group: 'First Blood' },
    { key: 'bloodthirsty',    label: 'Bloodthirsty',       desc: '10+ first bloods overall',           icon: '🩸',  earned: firstBloods >= 10,   group: 'First Blood' },
    { key: 'serial_killer',   label: 'Serial Killer',      desc: '25+ first bloods overall',           icon: '🎯',  earned: firstBloods >= 25,   group: 'First Blood' },
    // Kills/assists totals
    { key: 'kills_100',       label: 'Centurion Killer',   desc: '100 total kills',                    icon: '⚔️',  earned: totalKills >= 100,   group: 'Totals' },
    { key: 'kills_500',       label: 'Warlord',            desc: '500 total kills',                    icon: '⚔️',  earned: totalKills >= 500,   group: 'Totals' },
    { key: 'assists_250',     label: 'Team Player',        desc: '250 total assists',                  icon: '🤝',  earned: totalAssists >= 250, group: 'Totals' },
    { key: 'lh_5000',         label: 'Farmer',             desc: '5,000 total last hits',              icon: '🌾',  earned: totalLh >= 5000,     group: 'Totals' },
    { key: 'lh_20000',        label: 'Harvest King',       desc: '20,000 total last hits',             icon: '🌾',  earned: totalLh >= 20000,    group: 'Totals' },
    // Economy
    { key: 'efficient',       label: 'Gold Factory',       desc: '600+ GPM in a single game',          icon: '💰',  earned: maxGpm >= 600,       group: 'Economy' },
    { key: 'gpm_700',         label: 'Mint',               desc: '700+ GPM in a single game',          icon: '💸',  earned: maxGpm >= 700,       group: 'Economy' },
    { key: 'lh_record',       label: 'CS Monster',         desc: '300+ last hits in a single game',    icon: '🧲',  earned: maxLastHits >= 300,  group: 'Economy' },
    // Damage
    { key: 'big_damage',      label: 'Demolisher',         desc: '30,000+ hero damage in one game',    icon: '💥',  earned: maxDamage >= 30000,   group: 'Damage' },
    { key: 'big_damage_50k',  label: 'Nuke',               desc: '50,000+ hero damage in one game',    icon: '☢️',  earned: maxDamage >= 50000,   group: 'Damage' },
    { key: 'tower_destroyer', label: 'Tower Buster',       desc: '5,000+ tower damage in one game',    icon: '🏯',  earned: maxTowerDamage >= 5000,  group: 'Damage' },
    { key: 'tower_5_total',   label: 'Siege Master',       desc: '50,000+ total tower damage',         icon: '🏰',  earned: totalTowerDamage >= 50000, group: 'Damage' },
    // Healing
    { key: 'healer',          label: 'Field Medic',        desc: '5,000+ healing in one game',         icon: '💚',  earned: maxHealing >= 5000,      group: 'Healing' },
    { key: 'great_healer',    label: 'Lifesaver',          desc: '15,000+ healing in one game',        icon: '❤️',  earned: maxHealing >= 15000,     group: 'Healing' },
    { key: 'total_healer',    label: 'Angel',              desc: '100,000+ total healing',             icon: '🕊️',  earned: totalHealing >= 100000,  group: 'Healing' },
    // Support / vision
    { key: 'ward_lord',       label: 'Ward Lord',          desc: '200+ wards placed',                  icon: '👁️',  earned: wardsPlaced >= 200,   group: 'Vision' },
    { key: 'ward_500',        label: 'All-Seeing Eye',     desc: '500+ wards placed',                  icon: '🔭',  earned: wardsPlaced >= 500,   group: 'Vision' },
    { key: 'ward_breaker',    label: 'Ward Breaker',       desc: '50+ enemy wards killed',             icon: '🔍',  earned: wardsKilled >= 50,    group: 'Vision' },
    { key: 'ward_breaker_150',label: 'Dewarder',           desc: '150+ enemy wards killed',            icon: '🚫',  earned: wardsKilled >= 150,   group: 'Vision' },
    // KDA
    { key: 'kda_3',           label: 'Efficient',          desc: '3.0+ average KDA (all games)',       icon: '📊',  earned: avgKda >= 3.0 && games >= 10, group: 'KDA' },
    { key: 'kda_5',           label: 'Flawless',           desc: '5.0+ average KDA (all games)',       icon: '✨',  earned: avgKda >= 5.0 && games >= 10, group: 'KDA' },
    // Courier Killer
    { key: 'chicken_killer',  label: 'Chicken Killer',     desc: '20+ total courier kills',            icon: '🐔',  earned: totalCourierKills >= 20,  group: 'Totals' },
    { key: 'chicken_slayer',  label: 'Courier Slayer',     desc: '50+ total courier kills',            icon: '🍗',  earned: totalCourierKills >= 50,  group: 'Totals' },
  ];
  return ACHIEVEMENTS;
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
  // Versions are "major.minor" strings — compare numerically.
  const parseVer = v => v.split('.').map(Number);
  for (let i = 1; i < notes.length; i++) {
    const [aMaj, aMin] = parseVer(notes[i - 1].version);
    const [bMaj, bMin] = parseVer(notes[i].version);
    const aNum = aMaj * 1000 + aMin;
    const bNum = bMaj * 1000 + bMin;
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

async function createInhouseSession({ captainMode = 'highest_rank', createdBy = null, notes = null, acceptPhaseSeconds = 60 } = {}) {
  const p = getPool();
  const r = await p.query(
    `INSERT INTO inhouse_sessions (captain_mode, created_by, notes, accept_phase_seconds)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [captainMode, createdBy, notes, acceptPhaseSeconds]
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
    `SELECT * FROM inhouse_sessions WHERE status IN ('open','accepting','drafting','in_progress') ORDER BY created_at DESC LIMIT 1`
  );
  return r.rows[0] || null;
}

async function updateInhouseSession(id, fields) {
  const p = getPool();
  const allowed = ['status','captain_mode','match_password','server_ip','server_port','match_id','captain1_account_id','captain2_account_id','team1_is_radiant','accept_phase_starts_at','accept_phase_seconds','started_at','completed_at','notes'];
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
}

async function getInhouseSessionPlayers(sessionId) {
  const p = getPool();
  const r = await p.query(
    `SELECT isp.*,
            pn.nickname AS nickname,
            ps.steam_account_id AS steam_account_id,
            COALESCE(ps.mu, 25.0) AS mu,
            COALESCE(ps.sigma, 8.333) AS sigma,
            (COALESCE(ps.mu, 25.0) - 3*COALESCE(ps.sigma, 8.333)) AS trueskill_mmr,
            ps.discord_id AS discord_id
       FROM inhouse_session_players isp
       LEFT JOIN player_stats ps ON ps.steam_account_id = isp.account_id
       LEFT JOIN player_nicknames pn ON pn.steam_account_id = isp.account_id
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
            created_at, updated_at
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
  } = fields;
  const r = await p.query(
    `INSERT INTO player_profiles
       (account_id, bio, custom_title, theme_accent,
        pinned_hero_id, pinned_hero_caption, pinned_match_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (account_id) DO UPDATE
       SET bio = EXCLUDED.bio,
           custom_title = EXCLUDED.custom_title,
           theme_accent = EXCLUDED.theme_accent,
           pinned_hero_id = EXCLUDED.pinned_hero_id,
           pinned_hero_caption = EXCLUDED.pinned_hero_caption,
           pinned_match_id = EXCLUDED.pinned_match_id,
           updated_at = NOW()
     RETURNING id, account_id, bio, custom_title, theme_accent,
               pinned_hero_id, pinned_hero_caption, pinned_match_id,
               created_at, updated_at`,
    [accountId, bio, custom_title, theme_accent, pinned_hero_id, pinned_hero_caption, pinned_match_id]
  );
  return r.rows[0];
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
  try {
    const top = await getLeaderboard(5).catch(() => []);
    const aidStr = String(accountId);
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
  const r = await p.query(
    `UPDATE coaching_bookings
        SET status = 'disputed',
            dispute_reason = $2,
            disputed_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND status IN ('paid', 'completed')
      RETURNING *`,
    [id, String(reason || '').slice(0, 1000)]
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

  // Double-booking check — anything live (pending/paid/disputed/completed
  // and not yet refunded) on the same slot for the same coach blocks the
  // request. Refunded/cancelled bookings free the slot back up.
  const p = getPool();
  const conflict = await p.query(
    `SELECT 1 FROM coaching_bookings
      WHERE coach_account_id = $1
        AND status IN ('pending', 'paid', 'disputed', 'completed')
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

module.exports = {
  init,
  getPool,
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
  computeSeasonTrueSkill,
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
  getNicknameByDiscordId,
  getDiscordIdByAccountId,
  getSteamByDiscordId,
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
  updateMatchMeta,
  updateMatchDetails,
  updatePlayerStats,
  getMatchDraft,
  updateMatchDraft,
  clearMatchFileHash,
  getEnemySynergyHeatmap,
  getPlayerRatingHistory,
  getPlayerStreaks,
  getHeadToHead,
  getPlayerComparison,
  getPlayerAchievements,
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
  markBookingPaidByIntent,
  confirmBookingSide,
  raiseBookingDispute,
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
  logServerError,
  getServerLogs,
  reparseMatchFromStats,
  getMatchNotes,
  addMatchNote,
  deleteMatchNote,
  createSignupRequest,
  getSignupRequests,
  createInhouseSession,
  getInhouseSession,
  listInhouseSessions,
  getActiveInhouseSession,
  updateInhouseSession,
  deleteInhouseSession,
  joinInhouseSession,
  leaveInhouseSession,
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
  isPlayerEligibleForTournament,
  recomputeTournamentPrizePool,
  updateTournamentStatus,
  deleteTournament,
  getTournamentParticipants,
  addTournamentParticipant,
  removeTournamentParticipant,
  generateTournamentBracket,
  getTournamentMatches,
  setTournamentMatchWinner,
  clearTournamentMatchWinner,
  createWeekendTournament,
  getWeekendTournaments,
  getWeekendTournamentById,
  updateWeekendTournament,
  getWeekendTournamentScores,
};

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
      SUM(ps.kills) AS total_kills
    FROM player_stats ps
    JOIN matches m ON m.match_id::text = ps.match_id::text
    LEFT JOIN nicknames n ON n.account_id::text = ps.account_id::text
    WHERE ps.account_id::text != '0'${sc}
    GROUP BY ps.account_id, COALESCE(n.nickname, ps.persona_name)
    HAVING COUNT(DISTINCT ps.match_id) >= 3
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
  const result = await p.query(`
    SELECT t.*, s.name AS season_name
    FROM tournaments t
    LEFT JOIN seasons s ON s.id = t.season_id
    WHERE t.id = $1
  `, [parseInt(id)]);
  return result.rows[0] || null;
}

async function createTournament({
  name, description, seasonId, format, createdBy,
  tierNumber = null, entryFeeCents = 0,
  signupOpenAt = null, signupCloseAt = null,
}) {
  const p = getPool();
  const result = await p.query(
    `INSERT INTO tournaments (name, description, season_id, format, status, created_by,
       tier_number, entry_fee_cents, signup_open_at, signup_close_at)
     VALUES ($1, $2, $3, $4, 'upcoming', $5, $6, $7, $8, $9) RETURNING *`,
    [
      name,
      description || null,
      seasonId ? parseInt(seasonId) : null,
      format || 'single_elim',
      createdBy || null,
      tierNumber != null ? parseInt(tierNumber) : null,
      parseInt(entryFeeCents) || 0,
      signupOpenAt ? new Date(signupOpenAt) : null,
      signupCloseAt ? new Date(signupCloseAt) : null,
    ]
  );
  return result.rows[0];
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

async function markTournamentEntryPaid(stripeSessionId) {
  const p = getPool();
  const r = await p.query(
    `UPDATE tournament_entries
     SET status = 'paid', paid_at = COALESCE(paid_at, NOW())
     WHERE stripe_session_id = $1
     RETURNING *`,
    [String(stripeSessionId)]
  );
  return r.rows[0] || null;
}

// Eligibility check — returns { eligible: bool, reason: string|null, tier: int|null }
async function isPlayerEligibleForTournament(tournamentId, accountId) {
  const p = getPool();
  const t = await getTournamentById(tournamentId);
  if (!t) return { eligible: false, reason: 'Tournament not found', tier: null };
  if (!t.tier_number || !t.season_id) {
    // Cross-tier / no-season tournament — anyone may enter.
    return { eligible: true, reason: null, tier: null };
  }
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
  // Block double-entry across paid/pending statuses.
  const existing = await getTournamentEntry(tournamentId, accountId);
  if (existing && existing.status === 'paid') {
    return { eligible: false, reason: 'Already entered', tier: placement.tier_number };
  }
  return { eligible: true, reason: null, tier: placement.tier_number };
}

// Recompute and persist the prize pool from paid entries (sum of amount_cents)
// onto the season_tiers row that backs the tournament. Caller decides when.
async function recomputeTournamentPrizePool(tournamentId) {
  const p = getPool();
  const t = await getTournamentById(tournamentId);
  if (!t || !t.season_id || !t.tier_number) return null;
  const r = await p.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::int AS total_cents
     FROM tournament_entries
     WHERE tournament_id = $1 AND status = 'paid'`,
    [parseInt(tournamentId)]
  );
  const total = r.rows[0]?.total_cents || 0;
  await p.query(
    `UPDATE season_tiers SET prize_pool_cents = $1
     WHERE season_id = $2 AND tier_number = $3`,
    [total, t.season_id, t.tier_number]
  );
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
    SELECT tp.*, COALESCE(n.nickname, pl.persona_name, tp.account_id::text) AS display_name, pl.mu, pl.sigma,
      ROUND((pl.mu - 3 * pl.sigma) * 100 + 5000) AS mmr
    FROM tournament_participants tp
    LEFT JOIN players pl ON pl.account_id = tp.account_id
    LEFT JOIN nicknames n ON n.account_id = tp.account_id
    WHERE tp.tournament_id = $1
    ORDER BY tp.seed ASC NULLS LAST, mmr DESC NULLS LAST
  `, [parseInt(tournamentId)]);
  return result.rows;
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

async function generateTournamentBracket(tournamentId) {
  const p = getPool();
  await p.query(`DELETE FROM tournament_matches WHERE tournament_id = $1`, [parseInt(tournamentId)]);
  const tournamentRes = await p.query('SELECT * FROM tournaments WHERE id = $1', [parseInt(tournamentId)]);
  const tournament = tournamentRes.rows[0];
  if (!tournament) throw new Error('Tournament not found');
  const participants = await getTournamentParticipants(tournamentId);
  const n = participants.length;
  if (n < 2) throw new Error('Need at least 2 participants');
  const size = Math.pow(2, Math.ceil(Math.log2(n)));
  const seeded = [...participants].sort((a, b) => (parseInt(b.mmr) || 5000) - (parseInt(a.mmr) || 5000));
  const slots = new Array(size).fill(null);
  const positions = [];
  for (let i = 0; i < size; i++) positions.push(i);
  const snaked = [];
  for (let i = 0; i < size; i++) {
    if (i % 2 === 0) snaked.push(positions[i]);
    else snaked.unshift(positions[i]);
  }
  seeded.forEach((player, i) => { slots[snaked[i]] = player; });
  const pairs = [];
  for (let i = 0; i < size; i += 2) {
    pairs.push([slots[i], slots[i + 1]]);
  }

  if (tournament.format === 'double_elim') {
    return generateDoubleElimBracket(parseInt(tournamentId), pairs, size);
  }

  const inserts = pairs.map((pair, slot) =>
    p.query(
      `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id)
       VALUES ($1, 'W', 1, $2, $3, $4)`,
      [parseInt(tournamentId), slot + 1, pair[0]?.account_id || null, pair[1]?.account_id || null]
    )
  );
  await Promise.all(inserts);
  await p.query(`UPDATE tournaments SET status = 'active' WHERE id = $1`, [parseInt(tournamentId)]);
  return getTournamentMatches(tournamentId);
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

  await p.query(
    `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id) VALUES ($1, 'GF', 1, 1, NULL, NULL)`,
    [tournamentId]
  );

  await p.query(`UPDATE tournaments SET status = 'active' WHERE id = $1`, [tournamentId]);
  return getTournamentMatches(tournamentId);
}

async function getTournamentMatches(tournamentId) {
  const p = getPool();
  const result = await p.query(`
    SELECT tm.*,
      COALESCE(n1.nickname, pl1.persona_name, tm.p1_id::text) AS p1_name,
      COALESCE(n2.nickname, pl2.persona_name, tm.p2_id::text) AS p2_name,
      COALESCE(nw.nickname, plw.persona_name, tm.winner_id::text) AS winner_name
    FROM tournament_matches tm
    LEFT JOIN players pl1 ON pl1.account_id = tm.p1_id
    LEFT JOIN nicknames n1 ON n1.account_id = tm.p1_id
    LEFT JOIN players pl2 ON pl2.account_id = tm.p2_id
    LEFT JOIN nicknames n2 ON n2.account_id = tm.p2_id
    LEFT JOIN players plw ON plw.account_id = tm.winner_id
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

  const tournamentRes = await p.query('SELECT * FROM tournaments WHERE id = $1', [match.tournament_id]);
  const tournament = tournamentRes.rows[0];
  const isDoubleElim = tournament?.format === 'double_elim';

  await p.query(`UPDATE tournament_matches SET winner_id = $2 WHERE id = $1`, [parseInt(matchId), BigInt(winnerId)]);
  const loserId = BigInt(winnerId) === BigInt(match.p1_id) ? match.p2_id : match.p1_id;

  if (isDoubleElim) {
    await _routeDoubleElim(p, match, BigInt(winnerId), loserId ? BigInt(loserId) : null);
  } else {
    if (loserId) {
      await p.query(`UPDATE tournament_participants SET eliminated = TRUE WHERE tournament_id = $1 AND account_id = $2`,
        [match.tournament_id, loserId]);
    }
    const allMatches = await p.query(`SELECT * FROM tournament_matches WHERE tournament_id = $1 AND round = $2`, [match.tournament_id, match.round]);
    const allDone = allMatches.rows.every(m => m.winner_id != null || (m.p1_id == null && m.p2_id == null) || (m.p1_id != null && m.p2_id == null));
    if (allDone) {
      const winners = allMatches.rows.filter(m => m.winner_id != null).map(m => m.winner_id);
      const byes = allMatches.rows.filter(m => m.p1_id != null && m.p2_id == null).map(m => m.p1_id);
      const nextPlayers = [...winners, ...byes];
      if (nextPlayers.length === 1) {
        await p.query(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [match.tournament_id]);
      } else {
        const nextRound = match.round + 1;
        const existing = await p.query(`SELECT COUNT(*) FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'W' AND round = $2`, [match.tournament_id, nextRound]);
        if (parseInt(existing.rows[0].count) === 0) {
          for (let i = 0; i < nextPlayers.length; i += 2) {
            await p.query(
              `INSERT INTO tournament_matches (tournament_id, bracket, round, slot, p1_id, p2_id) VALUES ($1, 'W', $2, $3, $4, $5)`,
              [match.tournament_id, nextRound, Math.floor(i / 2) + 1, nextPlayers[i] || null, nextPlayers[i + 1] || null]
            );
          }
        }
      }
    }
  }
  return getTournamentMatches(match.tournament_id);
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
    await p.query(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [tid]);
    if (loserId) {
      await p.query(`UPDATE tournament_participants SET eliminated = TRUE WHERE tournament_id = $1 AND account_id = $2`, [tid, loserId]);
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
      } else {
        await placePlayer('L', 2 * (round - 1), slot, 'p2', loserId);
      }
    }
    if (loserId) {
      const needsElim = bracket === 'W' && false;
      if (needsElim) {
        await p.query(`UPDATE tournament_participants SET eliminated = TRUE WHERE tournament_id = $1 AND account_id = $2`, [tid, loserId]);
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

  const gfRes = await p.query(`SELECT * FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'GF'`, [tid]);
  const gf = gfRes.rows[0];
  if (gf && gf.p1_id && gf.p2_id && !gf.winner_id) {
  }
}

async function clearTournamentMatchWinner(matchId) {
  const p = getPool();
  const matchRes = await p.query(`SELECT * FROM tournament_matches WHERE id = $1`, [parseInt(matchId)]);
  const match = matchRes.rows[0];
  if (!match || !match.winner_id) return;

  const tournamentRes = await p.query('SELECT * FROM tournaments WHERE id = $1', [match.tournament_id]);
  const tournament = tournamentRes.rows[0];
  const isDoubleElim = tournament?.format === 'double_elim';

  const loserId = BigInt(match.winner_id) === BigInt(match.p1_id) ? match.p2_id : match.p1_id;
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
    await p.query(`DELETE FROM tournament_matches WHERE tournament_id = $1 AND bracket = 'W' AND round > $2`, [match.tournament_id, match.round]);
  }
  return getTournamentMatches(match.tournament_id);
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
