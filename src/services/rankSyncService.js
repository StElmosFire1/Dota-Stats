const db = require('../db');
const { getOpenDota } = require('../api/opendota');

const api = getOpenDota();

// Dota 2 rank tier decoding
function decodeRankTier(rankTier) {
  if (!rankTier || rankTier === 0) return null;
  const tier  = Math.floor(rankTier / 10); // 1=Herald...8=Immortal
  const stars = rankTier % 10;
  const names = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  const name  = names[tier] || 'Unknown';
  return { tier, stars, name, rankTier };
}

// Attempt to sync a single player's rank from OpenDota.
// Returns 'opendota' | 'skipped' | null (null = no data found)
async function syncOneFromOpenDota(accountId) {
  try {
    const profile = await api.getPlayerProfile(accountId);
    if (profile && profile.rankTier) {
      await db.setPlayerRank(accountId, profile.rankTier, profile.leaderboardRank || null, 'opendota');
      return 'opendota';
    }
    return null;
  } catch (err) {
    console.error(`[RankSync] OpenDota error for ${accountId}:`, err.message);
    return null;
  }
}

// Try GC profile card via the Dota2 GC client (Steam friend, no public profile needed)
async function syncOneFromGC(accountId, gcClient) {
  if (!gcClient || !gcClient.isReady) return null;
  try {
    const result = await gcClient.requestProfileCard(accountId);
    if (result && result.rankTier) {
      await db.setPlayerRank(accountId, result.rankTier, result.leaderboardRank || null, 'gc');
      return 'gc';
    }
    return null;
  } catch (err) {
    console.error(`[RankSync] GC error for ${accountId}:`, err.message);
    return null;
  }
}

// Delay helper to avoid rate-limiting OpenDota
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Sync ranks for all players.
 * Priority: (1) OpenDota public data → (2) GC profile card → skip if already manual.
 * 
 * @param {Object} gcClient  - Dota2GCClient instance (optional)
 * @param {Function} onProgress - optional callback(current, total, accountId, source)
 */
async function syncAllRanks(gcClient, onProgress) {
  const players = await db.getAllPlayerRanks();
  const total   = players.length;
  let updated   = 0;
  let skipped   = 0;

  console.log(`[RankSync] Starting rank sync for ${total} players...`);

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const accountId = parseInt(p.account_id);
    if (!accountId) continue;

    // Don't overwrite manual entries
    if (p.dota_rank_source === 'manual') {
      skipped++;
      if (onProgress) onProgress(i + 1, total, accountId, 'manual_skip');
      continue;
    }

    // Layer 1: OpenDota
    const odResult = await syncOneFromOpenDota(accountId);
    if (odResult) {
      updated++;
      if (onProgress) onProgress(i + 1, total, accountId, 'opendota');
      await delay(500); // rate limit: 2 req/s
      continue;
    }

    // Layer 2: GC profile card
    await delay(1000);
    const gcResult = await syncOneFromGC(accountId, gcClient);
    if (gcResult) {
      updated++;
      if (onProgress) onProgress(i + 1, total, accountId, 'gc');
      await delay(500);
      continue;
    }

    // No data found
    if (onProgress) onProgress(i + 1, total, accountId, 'none');
    await delay(200);
  }

  console.log(`[RankSync] Done. Updated ${updated}/${total}, skipped ${skipped} manual.`);
  return { total, updated, skipped };
}

/**
 * Set a rank manually (admin override — will not be overwritten by auto-sync)
 */
async function setManualRank(accountId, rankTier, leaderboardRank) {
  await db.setPlayerRank(accountId, rankTier, leaderboardRank || null, 'manual');
}

module.exports = { syncAllRanks, syncOneFromOpenDota, syncOneFromGC, setManualRank, decodeRankTier };
