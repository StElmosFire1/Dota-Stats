// Task #439 — Match-insights backfill runner.
//
// For each candidate match (those with a parsed game_timeline) we:
//   1. Load the full match + match_fights.
//   2. Run derivePersistableFields() to compute lane_outcome,
//      death_context, fight_arrival_time per player from existing data.
//   3. UPDATE player_stats with those values where currently NULL.
//
// Idempotent: only sets columns that are NULL so re-runs are cheap and do
// not clobber any parser-populated values. Reports per-match progress via
// the optional `onProgress` callback so the admin UI + Discord command can
// stream status updates.

const db = require('../db');
const { derivePersistableFields } = require('./matchInsights');

const _state = {
  inFlight: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  scanned: 0,
  updated: 0,
  errors: 0,
  lastMatchId: null,
  lastError: null,
};

function getBackfillState() {
  return { ..._state };
}

async function runBackfill({ limit = 200, onProgress = null } = {}) {
  if (_state.inFlight) {
    return { skipped: true, reason: 'already running', state: getBackfillState() };
  }
  _state.inFlight = true;
  _state.startedAt = Date.now();
  _state.finishedAt = null;
  _state.scanned = 0;
  _state.updated = 0;
  _state.errors = 0;
  _state.lastError = null;

  try {
    const matchIds = await _listCandidates(limit);
    _state.total = matchIds.length;

    for (const matchId of matchIds) {
      _state.scanned++;
      _state.lastMatchId = matchId;
      try {
        const match = await db.getMatch(matchId);
        if (!match) continue;
        const fights = await db.getMatchFights(matchId).catch(() => []);
        const per = derivePersistableFields(match, { fights });
        const updated = await _persist(matchId, per);
        if (updated) _state.updated++;
      } catch (e) {
        _state.errors++;
        _state.lastError = `${matchId}: ${e?.message || e}`;
        console.warn('[InsightsBackfill]', _state.lastError);
      }
      if (onProgress) {
        try { onProgress(getBackfillState()); } catch (_) {}
      }
    }
    return { ok: true, state: getBackfillState() };
  } finally {
    _state.finishedAt = Date.now();
    _state.inFlight = false;
  }
}

async function _listCandidates(limit) {
  const r = await db.getPool().query(
    `SELECT m.match_id
       FROM matches m
       JOIN player_stats ps ON ps.match_id = m.match_id
      WHERE m.game_timeline IS NOT NULL
        AND (ps.lane_outcome IS NULL OR ps.death_context IS NULL OR ps.fight_arrival_time IS NULL)
      GROUP BY m.match_id, m.date
      ORDER BY m.date DESC
      LIMIT $1`,
    [Math.max(1, Math.min(5000, limit | 0))]
  );
  return r.rows.map(x => x.match_id);
}

async function _persist(matchId, perPlayer) {
  const p = db.getPool();
  let touched = false;
  for (const [slot, fields] of Object.entries(perPlayer || {})) {
    // COALESCE keeps any already-populated value intact (parser-first wins).
    const r = await p.query(
      `UPDATE player_stats
          SET lane_outcome = COALESCE(lane_outcome, $3),
              death_context = COALESCE(death_context, $4),
              fight_arrival_time = COALESCE(fight_arrival_time, $5)
        WHERE match_id = $1 AND slot = $2`,
      [matchId, Number(slot), fields.lane_outcome, fields.death_context, fields.fight_arrival_time]
    );
    if (r.rowCount > 0) touched = true;
  }
  return touched;
}

module.exports = { runBackfill, getBackfillState };
