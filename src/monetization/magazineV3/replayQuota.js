/**
 * Feature 1 — Replay download paywall hardening + per-user rate limit.
 * Counters live in `replay_download_log`. Hooked into the existing replay
 * download route in src/web/server.js via `magV3.countReplayDownloadsLast24h`.
 */

const { REPLAY_RATE_LIMIT_PER_DAY } = require('./constants');

function createDb({ getPool }) {
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

  return { logReplayDownload, countReplayDownloadsLast24h };
}

function mountRoutes({ router, deps, requireAuth }) {
  const { magV3, isProAccount } = deps;
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
}

module.exports = { createDb, mountRoutes };
