// Task #217 — per-account voice-pack event queue.
// Task #233 — persisted to PostgreSQL so events survive bot restarts.
//
// Voice packs (Task #206) play in the BROWSER, but most of the lifecycle
// events that should fire them (a recorded match → win/loss, first-blood,
// achievement-unlock) are observed server-side. This module keeps a
// per-account queue of pending events; the browser drains it via
// `GET /api/me/voice-events` and plays the matching mp3 on each one.
//
// Each event is one of the six VOICE_PACK_EVENTS slots from
// profileCosmetics.js (`match-start`, `first-blood`, `win`, `loss`,
// `level-up`, `achievement-unlock`). The browser handles 404 /
// pack-not-selected fallback to the church bell, so missing slots stay
// safe end-to-end.
//
// Originally in-memory only — a deploy / PM2 restart in the seconds
// after a match was recorded would lose the cues. Task #233 persists
// each event to a `voice_events` table with a 5-minute TTL so a restart
// no longer drops them on the floor.
//
// Single-delivery contract:
//   - pushVoiceEvent() is fire-and-forget for the caller (callers in
//     server.js wrap it in `try { … } catch (_) {}` and never await),
//     but the INSERT promise is registered in a per-account `inflight`
//     set so drainVoiceEvents() can await it before querying the DB.
//   - The in-memory `shadows` map only holds events whose INSERT
//     REJECTED (or whose push happened with no DB configured). Events
//     whose INSERT succeeded live in the DB exclusively — they are
//     never duplicated across the memory + DB seam.
//   - drainVoiceEvents() snapshots the inflight set at entry, awaits
//     it, then runs DELETE … RETURNING with a 5-minute TTL filter and
//     drains the per-account shadow. Pushes that arrive AFTER the
//     snapshot are left for the next drain (their INSERTs aren't in
//     our snapshot and their shadows weren't drained), so a polling
//     browser cannot double-fire the same cue across drains.

const MAX_EVENTS_PER_ACCOUNT = 20;
const EVENT_TTL_MS = 5 * 60 * 1000;
const EVENT_TTL_SQL = "5 minutes";
const SWEEP_INTERVAL_MS = 60 * 1000;
const VALID_EVENTS = new Set([
  'match-start',
  'first-blood',
  'win',
  'loss',
  'level-up',
  'achievement-unlock',
]);

// Fallback queue: entries here are events whose INSERT failed (or were
// pushed with no DB configured). drain pulls and clears them.
const shadows = new Map();        // accountId -> Array<{event, ts}>
// In-flight INSERT promises per account. drain snapshots & awaits these
// so pushes that happened just before drain are guaranteed to be
// reflected in the DB (or, on rejection, in the shadow) by the time we
// query.
const inflight = new Map();       // accountId -> Set<Promise>

let _testPoolOverride = undefined;
let _sweepTimer = null;

function _now() { return Date.now(); }

function _getPool() {
  if (_testPoolOverride !== undefined) return _testPoolOverride || null;
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = require('../db');
    if (typeof db.getPool !== 'function') return null;
    return db.getPool();
  } catch (_) {
    return null;
  }
}

function _gcShadow(accountId) {
  const list = shadows.get(accountId);
  if (!list) return;
  const cutoff = _now() - EVENT_TTL_MS;
  const fresh = list.filter(e => e.ts >= cutoff);
  if (fresh.length === 0) shadows.delete(accountId);
  else shadows.set(accountId, fresh);
}

function _pushShadow(id, event) {
  let list = shadows.get(id);
  if (!list) { list = []; shadows.set(id, list); }
  list.push({ event, ts: _now() });
  if (list.length > MAX_EVENTS_PER_ACCOUNT) list.splice(0, list.length - MAX_EVENTS_PER_ACCOUNT);
}

function _registerInflight(id, promise) {
  let set = inflight.get(id);
  if (!set) { set = new Set(); inflight.set(id, set); }
  set.add(promise);
  promise.finally(() => {
    const s = inflight.get(id);
    if (!s) return;
    s.delete(promise);
    if (s.size === 0) inflight.delete(id);
  });
}

async function _insertToDb(pool, id, event) {
  // ONLY the INSERT — trimming runs as a separate, log-only step so a
  // trim failure can't drag a successful INSERT into the shadow path
  // (which would produce a duplicate cue: one from the DB row that
  // committed, one from the shadow the catch block added).
  await pool.query(
    `INSERT INTO voice_events (account_id, event) VALUES ($1, $2)`,
    [id, event]
  );
}

function _trimToCap(pool, id) {
  // Best-effort trim — keep the newest MAX rows for this account. Cheap
  // because the queue is bounded; runs only on the insert path. Failure
  // is logged and dropped — at worst the table holds a few extra rows
  // until the next sweep / next push catches it.
  pool.query(
    `DELETE FROM voice_events WHERE account_id = $1 AND id NOT IN (
       SELECT id FROM voice_events WHERE account_id = $1
       ORDER BY id DESC LIMIT $2
     )`,
    [id, MAX_EVENTS_PER_ACCOUNT]
  ).catch(err => {
    try { console.error('[voiceEvents] trim failed:', err.message); } catch (_) {}
  });
}

function pushVoiceEvent(accountId, event) {
  const id = Number(accountId);
  if (!id || !Number.isFinite(id) || id <= 0) return;
  if (!VALID_EVENTS.has(event)) return;
  const pool = _getPool();
  if (!pool) {
    // No DB configured — pure in-memory mode (tests / local dev).
    _pushShadow(id, event);
    return;
  }
  // Fire-and-forget INSERT. On success, the row lives in the DB
  // exclusively (no shadow ever written) → drain reads it via
  // DELETE … RETURNING. On failure, fall back to the in-memory shadow
  // so the cue is still surfaced on the next drain. drainVoiceEvents
  // awaits the in-flight promise before reading either source, so the
  // settle order is deterministic from the drain's point of view.
  const p = _insertToDb(pool, id, event).then(
    () => { _trimToCap(pool, id); },
    err => {
      try { console.error('[voiceEvents] persist failed:', err.message); } catch (_) {}
      _pushShadow(id, event);
    }
  );
  _registerInflight(id, p);
  _ensureSweep(pool);
}

async function drainVoiceEvents(accountId) {
  const id = Number(accountId);
  if (!id || !Number.isFinite(id) || id <= 0) return [];
  const pool = _getPool();
  if (!pool) {
    // In-memory only path.
    _gcShadow(id);
    const list = shadows.get(id) || [];
    shadows.delete(id);
    return list;
  }
  // Snapshot the in-flight set BEFORE awaiting so pushes that arrive
  // during the await aren't drained (they'll surface in the next call).
  // Without this snapshot a push between the await and DELETE could
  // either be missed entirely or counted twice (once from the shadow
  // its rejection populates, once from a row our DELETE picks up).
  const inflightSet = inflight.get(id);
  const pending = inflightSet ? Array.from(inflightSet) : [];
  if (pending.length > 0) {
    await Promise.allSettled(pending);
  }
  // After the await: every snapshot push has either committed a row
  // to the DB (success path — never shadowed) or pushed an entry to
  // the shadow (failure path — never written to DB). Single delivery.
  let dbRows = [];
  try {
    // Postgres does NOT guarantee row order in DELETE … RETURNING, so we
    // also return `id` (BIGSERIAL → strictly monotonic per push order)
    // and sort dbRows by (created_at asc, id asc) below. created_at has
    // only ms resolution so consecutive pushes within the same ms need
    // the id tiebreaker to preserve FIFO playback semantics.
    const r = await pool.query(
      `DELETE FROM voice_events
       WHERE account_id = $1
         AND created_at > NOW() - INTERVAL '${EVENT_TTL_SQL}'
       RETURNING id, event, EXTRACT(EPOCH FROM created_at) * 1000 AS ts`,
      [id]
    );
    dbRows = (r.rows || [])
      .map(row => ({ event: row.event, ts: Number(row.ts), _id: Number(row.id) }))
      .sort((a, b) => (a.ts - b.ts) || (a._id - b._id))
      .map(row => ({ event: row.event, ts: row.ts }));
    // Sweep expired rows for this account so the table doesn't grow.
    await pool.query(
      `DELETE FROM voice_events
       WHERE account_id = $1
         AND created_at <= NOW() - INTERVAL '${EVENT_TTL_SQL}'`,
      [id]
    ).catch(() => {});
  } catch (err) {
    try { console.error('[voiceEvents] drain failed:', err.message); } catch (_) {}
    // Fall through — the shadow path below still surfaces failed-push
    // events so we don't black-hole on a transient DB hiccup.
  }
  _gcShadow(id);
  const memList = shadows.get(id) || [];
  shadows.delete(id);
  // Merge & cap. Both sources are chronologically meaningful.
  const merged = dbRows.concat(memList).sort((a, b) => a.ts - b.ts);
  if (merged.length > MAX_EVENTS_PER_ACCOUNT) {
    return merged.slice(merged.length - MAX_EVENTS_PER_ACCOUNT);
  }
  return merged;
}

// Helper: push win/loss + first-blood for every player in a freshly
// recorded match. Tolerates either camelCase (`firstbloodClaimed`) or
// snake_case (`firstblood_claimed`) keys because matchStats is built by
// two different upstreams (the GC path and the replay-parser path).
function pushMatchVoiceEvents(matchStats) {
  if (!matchStats || !Array.isArray(matchStats.players)) return;
  const radiantWin = !!matchStats.radiantWin;
  const players = matchStats.players;
  const firstBloodFired = players.some(p =>
    p && (p.firstbloodClaimed === 1 || p.firstbloodClaimed === true
       || p.firstblood_claimed === 1 || p.firstblood_claimed === true)
  );
  for (const p of players) {
    if (!p) continue;
    const accountId = Number(p.accountId || p.account_id || 0);
    if (!accountId) continue;
    const isRadiant = p.team === 'radiant'
      || (typeof p.player_slot === 'number' && p.player_slot < 128);
    const won = (isRadiant && radiantWin) || (!isRadiant && !radiantWin);
    pushVoiceEvent(accountId, won ? 'win' : 'loss');
    if (firstBloodFired) pushVoiceEvent(accountId, 'first-blood');
  }
}

// Helper: push achievement-unlock for every player surfaced in the
// achievement-grants payload that recordMatch() returns and the bot's
// _notifyAchievementsUnlocked() consumes.
function pushAchievementVoiceEvents(allGrants) {
  if (!Array.isArray(allGrants)) return;
  for (const g of allGrants) {
    if (!g || !g.player) continue;
    const accountId = Number(g.player.accountId || g.player.account_id || 0);
    if (!accountId) continue;
    pushVoiceEvent(accountId, 'achievement-unlock');
  }
}

// Periodic sweep of expired rows across all accounts. Lazily started
// the first time we see a pool. unref()'d so it never holds the
// process open in tests.
function _ensureSweep(pool) {
  if (_sweepTimer || !pool) return;
  _sweepTimer = setInterval(() => {
    pool.query(
      `DELETE FROM voice_events WHERE created_at <= NOW() - INTERVAL '${EVENT_TTL_SQL}'`
    ).catch(() => {});
  }, SWEEP_INTERVAL_MS);
  if (typeof _sweepTimer.unref === 'function') _sweepTimer.unref();
}

function _resetForTests() {
  shadows.clear();
  inflight.clear();
  // Default to FORCED in-memory mode for tests so a stray DATABASE_URL
  // in the dev environment can't make baseline tests hit a real DB
  // (where the voice_events table may not exist). Tests covering the
  // persistent path explicitly call _setPoolForTests(stubPool) AFTER
  // reset() to opt back in.
  _testPoolOverride = false;
  if (_sweepTimer) { clearInterval(_sweepTimer); _sweepTimer = null; }
}

function _setPoolForTests(pool) {
  // Pass `false` to force in-memory mode regardless of DATABASE_URL.
  _testPoolOverride = pool;
}

module.exports = {
  pushVoiceEvent,
  drainVoiceEvents,
  pushMatchVoiceEvents,
  pushAchievementVoiceEvents,
  _resetForTests,
  _setPoolForTests,
  MAX_EVENTS_PER_ACCOUNT,
  EVENT_TTL_MS,
};
