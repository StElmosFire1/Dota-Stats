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

    console.log('[DB] Schema migrations applied.');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    return false;
  }
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

async function updateMatchMeta(matchId, { patch, seasonId }) {
  const p = getPool();
  const updates = [];
  const params = [];
  if (patch !== undefined) { updates.push(`patch = $${params.length + 1}`); params.push(patch || null); }
  if (seasonId !== undefined) { updates.push(`season_id = $${params.length + 1}`); params.push(seasonId || null); }
  if (updates.length === 0) return;
  params.push(matchId);
  await p.query(`UPDATE matches SET ${updates.join(', ')} WHERE match_id = $${params.length}`, params);
}

async function recordMatch(matchStats, lobbyName, recordedBy, fileHash, patch, seasonId) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO matches (match_id, date, duration, game_mode, radiant_win, lobby_name, recorded_by, parse_method, file_hash, patch, season_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (match_id) DO NOTHING`,
      [
        matchStats.matchId,
        new Date().toISOString(),
        matchStats.duration || 0,
        matchStats.gameMode || 0,
        matchStats.radiantWin,
        lobbyName || '',
        recordedBy || '',
        matchStats.parseMethod || '',
        fileHash || null,
        patch || null,
        seasonId || null,
      ]
    );

    for (const player of matchStats.players) {
      await client.query(
        `INSERT INTO player_stats (match_id, account_id, discord_id, persona_name, hero_id, hero_name, team, kills, deaths, assists, last_hits, denies, gpm, xpm, hero_damage, tower_damage, hero_healing, level, net_worth, position, is_captain, obs_placed, sen_placed, creeps_stacked, camps_stacked, damage_taken, slot, rune_pickups, stun_duration, towers_killed, roshans_killed, teamfight_participation, firstblood_claimed, wards_killed, obs_purchased, sen_purchased, buybacks, courier_kills, tp_scrolls_used, double_kills, triple_kills, ultra_kills, rampages, kill_streak, smoke_kills, first_death, lane_cs_10min, has_scepter, has_shard, laning_nw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50)`,
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
      for (const d of matchStats.draft) {
        if (!d.heroId || d.heroId <= 0) continue;
        await client.query(
          `INSERT INTO match_draft (match_id, hero_id, is_pick, order_num, team)
           VALUES ($1, $2, $3, $4, $5)`,
          [matchStats.matchId, d.heroId, d.isPick, d.order || 0, typeof d.team === 'string' ? (d.team === 'radiant' ? 0 : 1) : (d.team || 0)]
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
  const seasonClause = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId)) && params.length}` : '';
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
  if (seasonId) {
    const result = await p.query('SELECT COUNT(*) as count FROM matches WHERE season_id = $1', [parseInt(seasonId)]);
    return parseInt(result.rows[0].count);
  }
  const result = await p.query('SELECT COUNT(*) as count FROM matches');
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
       COALESCE(n.nickname, r.player_id) as group_key,
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
     LEFT JOIN nicknames n ON n.account_id::text = r.player_id AND r.player_id ~ '^[0-9]+$'
     GROUP BY COALESCE(n.nickname, r.player_id)
     ORDER BY mmr DESC LIMIT $1`,
    [limit]
  );
  for (const row of result.rows) {
    row.display_name = decodeByteString(row.display_name);
  }
  return result.rows;
}

async function updateRating(playerId, discordId, displayName, mu, sigma, mmr, won) {
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
}

async function getPlayerRating(playerId) {
  const p = getPool();
  const result = await p.query(
    'SELECT * FROM ratings WHERE player_id = $1 OR discord_id = $1 LIMIT 1',
    [playerId]
  );
  return result.rows[0] || null;
}

async function getPlayerStats(accountId) {
  const p = getPool();
  const isNumeric = /^\d+$/.test(accountId);
  const isRealAccount = isNumeric && accountId !== '0';

  const whereClause = isRealAccount ? 'ps.account_id = $1' : 'ps.persona_name = $1';
  const param = isRealAccount ? parseInt(accountId) : decodeURIComponent(accountId);

  const ratingResult = await p.query(
    'SELECT * FROM ratings WHERE player_id = $1 LIMIT 1',
    [isRealAccount ? accountId.toString() : `anon_${param}`]
  );

  let nicknameResult = { rows: [] };
  if (isRealAccount) {
    nicknameResult = await p.query(
      'SELECT nickname FROM nicknames WHERE account_id = $1 LIMIT 1',
      [parseInt(accountId)]
    );
  }

  const recentMatches = await p.query(
    `SELECT ps.*, m.date, m.duration, m.radiant_win, m.lobby_name
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ${whereClause}
     ORDER BY m.date DESC
     LIMIT 20`,
    [param]
  );

  const averages = await p.query(
    `SELECT
       COUNT(*) as total_matches,
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
       SUM(assists) as total_assists
     FROM player_stats ps
     WHERE ${whereClause}`,
    [param]
  );

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
     WHERE ${whereClause} AND ps.hero_id > 0
     GROUP BY hero_name, hero_id
     ORDER BY games DESC`,
    [param]
  );

  for (const row of recentMatches.rows) {
    row.persona_name = decodeByteString(row.persona_name);
  }

  if (ratingResult.rows[0]) {
    ratingResult.rows[0].display_name = decodeByteString(ratingResult.rows[0].display_name);
  }

  return {
    rating: ratingResult.rows[0] || null,
    nickname: nicknameResult.rows[0]?.nickname || null,
    recentMatches: recentMatches.rows,
    averages: averages.rows[0] || null,
    heroes: heroes.rows,
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
  const sc = seasonId ? ` AND m.season_id = $${params1.push(parseInt(seasonId)) && params1.length}` : '';
  const result = await p.query(
    `SELECT
       COALESCE(NULLIF(ps.account_id, 0), 0) as account_id,
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END as player_key,
       MAX(ps.persona_name) as persona_name,
       n.nickname,
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
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       COALESCE(NULLIF(ps.account_id, 0), 0),
       n.nickname
     ORDER BY games_played DESC`,
    params1
  );

  const params2 = [];
  const sc2 = seasonId ? ` AND m.season_id = $${params2.push(parseInt(seasonId)) && params2.length}` : '';
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
  const sc3 = seasonId ? ` WHERE m.season_id = $${params3.push(parseInt(seasonId)) && params3.length}` : '';
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
  const sc4 = seasonId ? ` AND m.season_id = $${params4.push(parseInt(seasonId)) && params4.length}` : '';
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
    const positions = posByPlayer[row.player_key] || [];
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
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId)) && params.length}` : '';
  const sc2 = seasonId ? ` AND m2.season_id = $${params.push(parseInt(seasonId)) && params.length}` : '';
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
  const sc3 = seasonId ? ` AND season_id = $${params3.push(parseInt(seasonId)) && params3.length}` : '';
  const totalResult = await p.query(`SELECT COUNT(*) as total FROM matches WHERE 1=1${sc3}`, params3);

  const params4 = [];
  const sc4 = seasonId ? ` AND m.season_id = $${params4.push(parseInt(seasonId)) && params4.length}` : '';
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
  const sc1 = seasonId ? ` AND m.season_id = $${params1.push(parseInt(seasonId)) && params1.length}` : '';
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
  const sc2 = seasonId ? ` WHERE m.season_id = $${params2.push(parseInt(seasonId)) && params2.length}` : '';
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
  const sc3 = seasonId ? ` AND m.season_id = $${params3.push(parseInt(seasonId)) && params3.length}` : '';
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

async function getPositionStats(position, minGames = 1, seasonId = null) {
  const p = getPool();
  const params1 = [position, minGames];
  const sc1 = seasonId ? ` AND m.season_id = $${params1.push(parseInt(seasonId)) && params1.length}` : '';
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
  const sc2 = seasonId ? ` WHERE m.season_id = $${params2.push(parseInt(seasonId)) && params2.length}` : '';
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
  const sc3 = seasonId ? ` AND m.season_id = $${params3.push(parseInt(seasonId)) && params3.length}` : '';
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

  for (const row of result.rows) {
    row.persona_name = decodeByteString(row.persona_name);
    row.player_key = decodeByteString(row.player_key);
    const kis = kiByPlayer[row.player_key] || [];
    row.avg_kill_involvement = kis.length > 0 ? Math.round(kis.reduce((a, b) => a + b, 0) / kis.length) : 0;
  }

  return result.rows;
}

async function getSynergyMatrix(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId)) && params.length}` : '';
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

  return {
    teammate: Object.values(teammate).filter(r => r.games >= 3),
    opponent: Object.values(opponent).filter(r => r.games >= 3),
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

async function getPlayerPositions(playerKey) {
  const p = getPool();
  const isNumeric = /^\d+$/.test(playerKey);
  const whereClause = isNumeric && playerKey !== '0'
    ? 'ps.account_id = $1'
    : 'ps.persona_name = $1';
  const param = isNumeric && playerKey !== '0' ? parseInt(playerKey) : playerKey;

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
     WHERE ${whereClause} AND ps.position > 0
     GROUP BY ps.position
     ORDER BY games DESC`,
    [param]
  );
  return result.rows;
}

async function getHeroPlayers(heroId) {
  const p = getPool();
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
     WHERE ps.hero_id = $1
     GROUP BY
       CASE WHEN ps.account_id != 0 THEN ps.account_id::text ELSE ps.persona_name END,
       COALESCE(NULLIF(ps.account_id, 0), 0),
       n.nickname
     ORDER BY games DESC`,
    [heroId]
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
          'SELECT mu, sigma FROM ratings WHERE player_id = $1',
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
          'SELECT mu, sigma FROM ratings WHERE player_id = $1',
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
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId)) && params.length}` : '';
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

async function clearMatchFileHash(matchId) {
  const p = getPool();
  await p.query(`UPDATE matches SET file_hash = NULL WHERE match_id = $1`, [matchId]);
}

async function getEnemySynergyHeatmap(seasonId = null) {
  const p = getPool();
  const params = [];
  const sc = seasonId ? ` AND m.season_id = $${params.push(parseInt(seasonId)) && params.length}` : '';
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
  const sc1 = seasonId ? ` AND m.season_id = $${params1.push(parseInt(seasonId)) && params1.length}` : '';
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
  const sc2 = seasonId ? ` AND m.season_id = $${params2.push(parseInt(seasonId)) && params2.length}` : '';
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
  const sc1 = seasonId ? ` AND m.season_id = $${params1.push(parseInt(seasonId)) && params1.length}` : '';
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
  const sc2 = seasonId ? ` AND m.season_id = $${params2.push(parseInt(seasonId)) && params2.length}` : '';
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

  const heroByPlayer = {};
  for (const row of heroBreakdown.rows) {
    const key = decodeByteString(row.player_key);
    if (!heroByPlayer[key]) heroByPlayer[key] = [];
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
  getSeasons,
  getActiveSeason,
  createSeason,
  setActiveSeason,
  updateMatchMeta,
  getMatchDraft,
  clearMatchFileHash,
  getEnemySynergyHeatmap,
};
