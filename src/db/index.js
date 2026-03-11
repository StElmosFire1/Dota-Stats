const { Pool } = require('pg');

let pool = null;

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

    console.log('[DB] Schema migrations applied.');
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    return false;
  }
}

async function recordMatch(matchStats, lobbyName, recordedBy, fileHash) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO matches (match_id, date, duration, game_mode, radiant_win, lobby_name, recorded_by, parse_method, file_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
      ]
    );

    for (const player of matchStats.players) {
      await client.query(
        `INSERT INTO player_stats (match_id, account_id, discord_id, persona_name, hero_id, hero_name, team, kills, deaths, assists, last_hits, denies, gpm, xpm, hero_damage, tower_damage, hero_healing, level, net_worth)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
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
        ]
      );
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

async function getMatches(limit = 50, offset = 0) {
  const p = getPool();
  const result = await p.query(
    `SELECT m.*,
       (SELECT COUNT(*) FROM player_stats ps WHERE ps.match_id = m.match_id) as player_count
     FROM matches m
     ORDER BY m.date DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

async function getMatchCount() {
  const p = getPool();
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

  return {
    ...matchResult.rows[0],
    players: playersResult.rows,
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
    `SELECT r.*, n.nickname
     FROM ratings r
     LEFT JOIN nicknames n ON n.account_id::text = r.player_id AND r.player_id ~ '^[0-9]+$'
     ORDER BY mmr DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function updateRating(playerId, discordId, displayName, mu, sigma, mmr, won) {
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

  const ratingResult = await p.query(
    'SELECT * FROM ratings WHERE player_id = $1 LIMIT 1',
    [accountId.toString()]
  );

  const nicknameResult = await p.query(
    'SELECT nickname FROM nicknames WHERE account_id = $1 LIMIT 1',
    [accountId]
  );

  const recentMatches = await p.query(
    `SELECT ps.*, m.date, m.duration, m.radiant_win, m.lobby_name
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.account_id = $1
     ORDER BY m.date DESC
     LIMIT 20`,
    [accountId]
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
     FROM player_stats
     WHERE account_id = $1`,
    [accountId]
  );

  const heroes = await p.query(
    `SELECT hero_name, hero_id, COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins,
       ROUND(AVG(kills), 1) as avg_kills,
       ROUND(AVG(deaths), 1) as avg_deaths,
       ROUND(AVG(assists), 1) as avg_assists,
       ROUND(AVG(gpm), 0) as avg_gpm,
       ROUND(AVG(hero_damage), 0) as avg_hero_damage
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.account_id = $1 AND ps.hero_id > 0
     GROUP BY hero_name, hero_id
     ORDER BY games DESC`,
    [accountId]
  );

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

async function getAllPlayers() {
  const p = getPool();
  const result = await p.query(
    `SELECT
       ps.account_id,
       MAX(ps.persona_name) as persona_name,
       n.nickname,
       COUNT(DISTINCT ps.match_id) as games_played,
       MAX(m.date) as last_played
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     LEFT JOIN nicknames n ON n.account_id = ps.account_id
     WHERE ps.account_id != 0
     GROUP BY ps.account_id, n.nickname
     ORDER BY games_played DESC`
  );
  return result.rows;
}

async function getHeroStats() {
  const p = getPool();
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
       ROUND(AVG(ps.last_hits), 0) as avg_last_hits
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.hero_id > 0
     GROUP BY ps.hero_id, ps.hero_name
     ORDER BY games DESC`
  );
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
  registerPlayer,
  getRegisteredPlayers,
  getMatchHistory,
  recalculateAllRatings,
};
