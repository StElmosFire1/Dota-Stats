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
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    return false;
  }
}

async function recordMatch(matchStats, lobbyName, recordedBy) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO matches (match_id, date, duration, game_mode, radiant_win, lobby_name, recorded_by, parse_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    'SELECT * FROM player_stats WHERE match_id = $1 ORDER BY team, kills DESC',
    [matchId]
  );

  return {
    ...matchResult.rows[0],
    players: playersResult.rows,
  };
}

async function getLeaderboard(limit = 50) {
  const p = getPool();
  const result = await p.query(
    'SELECT * FROM ratings ORDER BY mmr DESC LIMIT $1',
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
       ROUND(AVG(last_hits), 0) as avg_last_hits
     FROM player_stats
     WHERE account_id = $1`,
    [accountId]
  );

  const heroes = await p.query(
    `SELECT hero_name, hero_id, COUNT(*) as games,
       SUM(CASE WHEN (team = 'radiant' AND m.radiant_win = true) OR (team = 'dire' AND m.radiant_win = false) THEN 1 ELSE 0 END) as wins
     FROM player_stats ps
     JOIN matches m ON m.match_id = ps.match_id
     WHERE ps.account_id = $1 AND ps.hero_name != ''
     GROUP BY hero_name, hero_id
     ORDER BY games DESC`,
    [accountId]
  );

  return {
    rating: ratingResult.rows[0] || null,
    recentMatches: recentMatches.rows,
    averages: averages.rows[0] || null,
    heroes: heroes.rows,
  };
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

module.exports = {
  init,
  getPool,
  recordMatch,
  isMatchRecorded,
  getMatches,
  getMatchCount,
  getMatch,
  getLeaderboard,
  updateRating,
  getPlayerRating,
  getPlayerStats,
  registerPlayer,
  getRegisteredPlayers,
  getMatchHistory,
};
