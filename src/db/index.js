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
      CREATE TABLE IF NOT EXISTS player_items (
        id SERIAL PRIMARY KEY,
        match_id VARCHAR NOT NULL,
        slot INTEGER NOT NULL,
        item_slot INTEGER NOT NULL,
        item_id INTEGER DEFAULT 0,
        item_name VARCHAR DEFAULT '',
        purchase_time INTEGER DEFAULT 0,
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
    await p.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false`);
    await p.query(`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false`);

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
      `INSERT INTO matches (match_id, date, duration, game_mode, radiant_win, lobby_name, recorded_by, parse_method, file_hash, patch, season_id, game_timeline, lane_outcomes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (match_id) DO UPDATE SET date = EXCLUDED.date,
         game_timeline = COALESCE(EXCLUDED.game_timeline, matches.game_timeline),
         lane_outcomes = COALESCE(EXCLUDED.lane_outcomes, matches.lane_outcomes)
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
      ]
    );

    for (const player of matchStats.players) {
      await client.query(
        `INSERT INTO player_stats (match_id, account_id, discord_id, persona_name, hero_id, hero_name, team, kills, deaths, assists, last_hits, denies, gpm, xpm, hero_damage, tower_damage, hero_healing, level, net_worth, position, is_captain, obs_placed, sen_placed, creeps_stacked, camps_stacked, damage_taken, slot, rune_pickups, stun_duration, towers_killed, roshans_killed, teamfight_participation, firstblood_claimed, wards_killed, obs_purchased, sen_purchased, buybacks, courier_kills, tp_scrolls_used, double_kills, triple_kills, ultra_kills, rampages, kill_streak, smoke_kills, first_death, lane_cs_10min, has_scepter, has_shard, laning_nw, support_gold_spent, killed_by, ward_placements, nemesis_hero_name, nemesis_kills, hook_attempts, hook_hits)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57)`,
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
        ]
      );

      if (player.items && player.items.length > 0) {
        for (const item of player.items) {
          await client.query(
            `INSERT INTO player_items (match_id, slot, item_slot, item_id, item_name, purchase_time)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (match_id, slot, item_slot) DO NOTHING`,
            [matchStats.matchId, player.slot || 0, item.slot, item.itemId || 0, item.itemName || '', item.purchaseTime || 0]
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

  return {
    ...matchResult.rows[0],
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

async function getComputedLeaderboard(seasonId = null) {
  const p = getPool();

  const { ratings } = await computeSeasonTrueSkill(seasonId);

  // Fetch nicknames
  const nicknamesRes = await p.query('SELECT account_id, nickname FROM nicknames');
  const nicknames = {};
  for (const n of nicknamesRes.rows) nicknames[n.account_id.toString()] = n.nickname;

  // Build sorted leaderboard array
  const leaderboard = Object.entries(ratings).map(([player_id, r]) => ({
    player_id,
    display_name: decodeByteString(r.display_name || player_id),
    nickname: nicknames[player_id] || null,
    mu: r.mu,
    sigma: r.sigma,
    mmr: r.mmr ?? Math.round((r.mu - 3 * r.sigma) * 100) + 2600,
    wins: r.wins,
    losses: r.losses,
    games_played: r.wins + r.losses,
  }));

  leaderboard.sort((a, b) => b.mmr - a.mmr);
  return leaderboard;
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

  const whereClause = isRealAccount ? 'ps.account_id = $1' : 'ps.persona_name = $1';
  const param = isRealAccount ? parseInt(accountId) : decodeURIComponent(accountId);

  const ratingResult = await p.query(
    'SELECT * FROM ratings WHERE player_id::text = $1 LIMIT 1',
    [isRealAccount ? accountId.toString() : `anon_${param}`]
  );

  let nicknameResult = { rows: [] };
  if (isRealAccount) {
    nicknameResult = await p.query(
      'SELECT nickname FROM nicknames WHERE account_id = $1 LIMIT 1',
      [parseInt(accountId)]
    );
  }

  // Build season clause for queries that join matches
  const scParams = [param];
  const sc = _sc(seasonId, scParams, 'm');

  const recentMatches = await p.query(
    `SELECT ps.*, m.date, m.duration, m.radiant_win, m.lobby_name
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ${whereClause}${sc}
     ORDER BY m.date DESC
     LIMIT 20`,
    scParams
  );

  const avgParams = [param];
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

  const heroParams = [param];
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
    const { ratings: seasonRatings, accountToCanonical } = await computeSeasonTrueSkill(seasonId);
    const canonicalId = accountToCanonical[accountId.toString()] || accountId.toString();
    const entry = seasonRatings[canonicalId];
    if (entry) {
      seasonMmr = entry.mmr ?? Math.round((entry.mu - 3 * entry.sigma) * 100) + 2600;
    }
  }

  return {
    rating: ratingResult.rows[0] || null,
    nickname: nicknameResult.rows[0]?.nickname || null,
    recentMatches: recentMatches.rows,
    averages: averages.rows[0] || null,
    heroes: heroes.rows,
    seasonMmr,
  };
}

async function getNickname(accountId) {
  const p = getPool();
  const result = await p.query('SELECT nickname FROM nicknames WHERE account_id = $1', [accountId]);
  return result.rows[0]?.nickname || null;
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

async function getAllNicknames() {
  const p = getPool();
  const result = await p.query('SELECT * FROM nicknames ORDER BY updated_at DESC');
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

async function getPlayerPositions(playerKey, seasonId = null) {
  const p = getPool();
  const isNumeric = /^\d+$/.test(playerKey);
  const whereClause = isNumeric && playerKey !== '0'
    ? 'ps.account_id = $1'
    : 'ps.persona_name = $1';
  const param = isNumeric && playerKey !== '0' ? parseInt(playerKey) : playerKey;
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
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage
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
       ROUND(AVG(ps.hero_damage), 0) as avg_hero_damage
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
        }
      }
    }

    await client.query('COMMIT');
    console.log('[DB] Ratings recalculated from all matches.');
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
    if (isAFirst) {
      if (row.player_a_won) versus[pairKey].winsA += 0.5;
    } else {
      if (row.player_a_won) versus[pairKey].winsB += 0.5;
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
  const result = await p.query(
    `SELECT mmr, mu, sigma, match_id, recorded_at
     FROM rating_history
     WHERE player_id = $1
     ORDER BY recorded_at ASC
     LIMIT 200`,
    [parseInt(accountId)]
  );
  return result.rows;
}

async function getPlayerStreaks(seasonId = null) {
  const p = getPool();
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
    `SELECT ps.account_id, m.date, ps.team, m.radiant_win,
            ROW_NUMBER() OVER (PARTITION BY ps.account_id ORDER BY m.date DESC) as rn
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     ${whereClause}
     ORDER BY ps.account_id, m.date DESC`,
    params
  );
  const byPlayer = {};
  for (const row of result.rows) {
    const id = row.account_id.toString();
    if (!byPlayer[id]) byPlayer[id] = [];
    if (parseInt(row.rn) <= 30) byPlayer[id].push(row);
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
  const pid = parseInt(accountId);
  const [gamesRes, heroesRes, captainRes, positionsRes] = await Promise.all([
    p.query(
      `SELECT COUNT(*) as games,
              SUM(CASE WHEN (ps.team='radiant' AND m.radiant_win) OR (ps.team='dire' AND NOT m.radiant_win) THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN ps.deaths = 0 THEN 1 ELSE 0 END) as deathless_games
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = $1 AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT COUNT(DISTINCT ps.hero_id) as unique_heroes,
              MAX(cnt) as max_on_one_hero
       FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id,
       LATERAL (SELECT COUNT(*) as cnt FROM player_stats ps2
                JOIN matches m2 ON m2.match_id = ps2.match_id
                WHERE ps2.account_id = $1 AND ps2.hero_id = ps.hero_id AND m2.is_legacy = false) sub
       WHERE ps.account_id = $1 AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT COUNT(*) as captain_games FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = $1 AND ps.is_captain = true AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT COUNT(DISTINCT ps.position) as positions_played FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = $1 AND ps.position > 0 AND m.is_legacy = false`,
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
     WHERE ps.account_id = $1 AND m.is_legacy = false ORDER BY m.date ASC`,
    [pid]
  );
  let maxStreak = 0, cur = 0;
  for (const r of maxStreakRes.rows) {
    const won = (r.team === 'radiant' && r.radiant_win) || (r.team === 'dire' && !r.radiant_win);
    cur = won ? cur + 1 : 0;
    if (cur > maxStreak) maxStreak = cur;
  }

  const [mkRes, fbRes, wardRes] = await Promise.all([
    p.query(
      `SELECT SUM(rampages) AS rampages, SUM(ultra_kills) AS ultra_kills, SUM(triple_kills) AS triple_kills,
              SUM(double_kills) AS double_kills, MAX(kills) AS max_kills
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = $1 AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT SUM(firstblood_claimed) AS fbs FROM player_stats ps
       JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = $1 AND m.is_legacy = false`,
      [pid]
    ),
    p.query(
      `SELECT SUM(obs_placed + sen_placed) AS wards_placed, SUM(wards_killed) AS wards_killed
       FROM player_stats ps JOIN matches m ON m.match_id = ps.match_id
       WHERE ps.account_id = $1 AND m.is_legacy = false`,
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

  const ACHIEVEMENTS = [
    { key: 'veteran_25',    label: 'Veteran',          desc: '25 games played',              icon: '🎖️',  earned: games >= 25 },
    { key: 'veteran_50',    label: 'Battle-Hardened',   desc: '50 games played',              icon: '⚔️',  earned: games >= 50 },
    { key: 'veteran_100',   label: 'Centurion',         desc: '100 games played',             icon: '🏆',  earned: games >= 100 },
    { key: 'streak_5',      label: 'On Fire',           desc: '5-game win streak',            icon: '🔥',  earned: maxStreak >= 5 },
    { key: 'streak_10',     label: 'Unstoppable',       desc: '10-game win streak',           icon: '💥',  earned: maxStreak >= 10 },
    { key: 'deathless',     label: 'Untouchable',       desc: 'Won a game with 0 deaths',     icon: '🛡️',  earned: deathlessGames > 0 },
    { key: 'captain_5',     label: 'Born Leader',       desc: 'Captained 5+ matches',         icon: '👑',  earned: captainGames >= 5 },
    { key: 'all_positions', label: 'Versatile',         desc: 'Played all 5 positions',       icon: '🎭',  earned: positionsPlayed >= 5 },
    { key: 'hero_diversity',label: 'Jack of All Trades', desc: '15+ different heroes',        icon: '🃏',  earned: uniqueHeroes >= 15 },
    { key: 'specialist',    label: 'Specialist',        desc: '10+ games on one hero',        icon: '🎯',  earned: maxOnOneHero >= 10 },
    { key: 'rampage',       label: 'RAMPAGE',           desc: 'Achieved at least one rampage',icon: '☠️',  earned: rampages > 0 },
    { key: 'ultra_kill',    label: 'Ultra Kill',        desc: 'Got an Ultra Kill',            icon: '⚡',  earned: ultraKills > 0 },
    { key: 'multikill_10',  label: 'Kill Artist',       desc: '10+ multi-kills (combined)',   icon: '🔪',  earned: (doubleKills + tripleKills + ultraKills + rampages) >= 10 },
    { key: 'first_blood',   label: 'First Blood',       desc: 'Claimed first blood',          icon: '💉',  earned: firstBloods > 0 },
    { key: 'bloodthirsty',  label: 'Bloodthirsty',      desc: '10+ first bloods overall',     icon: '🩸',  earned: firstBloods >= 10 },
    { key: 'massacre',      label: 'Massacre',          desc: '20+ kills in a single game',   icon: '💀',  earned: maxKills >= 20 },
    { key: 'ward_lord',     label: 'Ward Lord',         desc: '200+ wards placed',            icon: '👁️',  earned: wardsPlaced >= 200 },
    { key: 'ward_breaker',  label: 'Ward Breaker',      desc: '50+ enemy wards killed',       icon: '🔍',  earned: wardsKilled >= 50 },
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
  const res = await p.query(`SELECT * FROM patch_notes ORDER BY published_at DESC`);
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
  // Remove all System-authored notes and re-insert in the correct sequential order.
  // published_at is set to NOW() on insert, so inserting in order ensures correct
  // display ordering on the patch notes page. User-created notes are preserved.
  await p.query(`DELETE FROM patch_notes WHERE author = 'System'`);
  for (const note of notes) {
    await p.query(`
      INSERT INTO patch_notes (version, title, content, author)
      VALUES ($1, $2, $3, $4)
    `, [note.version, note.title, note.content, note.author || 'System']);
  }
  console.log(`[DB] Patch notes seeded (${notes.length} entries).`);
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

async function getPlayerCurrentStreak(accountId) {
  const p = getPool();
  const res = await p.query(`
    SELECT ps.team, m.radiant_win
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.account_id = $1 AND m.is_legacy = false
    ORDER BY m.date DESC
    LIMIT 15
  `, [accountId]);

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

async function getMostImproved(days = 30) {
  const p = getPool();
  const result = await p.query(`
    WITH latest AS (
      SELECT DISTINCT ON (player_id) player_id, mu, sigma, recorded_at
      FROM rating_history
      ORDER BY player_id, recorded_at DESC
    ),
    earliest AS (
      SELECT DISTINCT ON (player_id) player_id, mu, sigma, recorded_at
      FROM rating_history
      WHERE recorded_at >= NOW() - INTERVAL '${parseInt(days)} days'
      ORDER BY player_id, recorded_at ASC
    )
    SELECT
      l.player_id AS account_id,
      COALESCE(n.nickname, MAX(ps.persona_name)) AS display_name,
      ROUND((l.mu - 3*l.sigma)*100 + 2600) AS current_mmr,
      ROUND((e.mu - 3*e.sigma)*100 + 2600) AS start_mmr,
      ROUND(((l.mu - 3*l.sigma) - (e.mu - 3*e.sigma))*100) AS mmr_delta,
      COUNT(ps.match_id) AS games_in_period
    FROM latest l
    JOIN earliest e ON e.player_id = l.player_id
    LEFT JOIN nicknames n ON n.account_id = l.player_id
    LEFT JOIN player_stats ps ON ps.account_id = l.player_id
    LEFT JOIN matches m ON m.match_id = ps.match_id AND m.date >= NOW() - INTERVAL '${parseInt(days)} days'
    GROUP BY l.player_id, l.mu, l.sigma, e.mu, e.sigma, n.nickname
    HAVING ROUND(((l.mu - 3*l.sigma) - (e.mu - 3*e.sigma))*100) > 0
    ORDER BY mmr_delta DESC
    LIMIT 10
  `);
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

async function getPlayerWardPlacements(accountId, seasonId = null) {
  const p = getPool();
  const params = [accountId];
  let sc = '';
  if (!seasonId) sc = ` AND m.is_legacy = false`;
  else if (seasonId === 'legacy') sc = ` AND m.is_legacy = true`;
  else { params.push(parseInt(seasonId)); sc = ` AND m.season_id = $${params.length}`; }

  const res = await p.query(`
    SELECT ps.ward_placements, ps.persona_name, ps.hero_id, ps.hero_name, m.match_id, m.date
    FROM player_stats ps
    JOIN matches m ON m.match_id = ps.match_id
    WHERE ps.account_id = $1
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

async function getPlayerHeroCounters(accountId, seasonId = null) {
  const p = getPool();
  const params = [accountId];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId))}` : ' AND m.is_legacy = false';

  const res = await p.query(`
    WITH my_matches AS (
      SELECT ps.match_id, ps.team, m.radiant_win
      FROM player_stats ps
      JOIN matches m ON m.match_id = ps.match_id
      WHERE ps.account_id = $1${sc}
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
      JOIN player_stats ps ON ps.match_id = mm.match_id AND ps.account_id != $1
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
      ps.last_hits, ps.level,
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
    { key: 'level', label: 'Highest Level', asc: false },
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

async function getPlayerGameDurationStats(accountId, seasonId = null) {
  const p = getPool();
  const params = [parseInt(accountId)];
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
    WHERE ps.account_id = $1 ${sc}
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
  getLeaderboard,
  getComputedLeaderboard,
  computeSeasonTrueSkill,
  updateRating,
  getPlayerRating,
  getPlayerStats,
  getNickname,
  setNickname,
  getAllNicknames,
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
  getPlayerCurrentStreak,
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
};

async function getPudgeStats(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = _sc(seasonId, params, 'm');
  const result = await p.query(
    `SELECT
       ps.account_id,
       COALESCE(n.nickname, MAX(ps.persona_name)) AS display_name,
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
  // Note: caller is responsible for actually deleting the files from disk
  return res.rows;
}
