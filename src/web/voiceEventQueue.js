// Task #217 — in-memory per-account voice-pack event queue.
//
// Voice packs (Task #206) play in the BROWSER, but most of the lifecycle
// events that should fire them (a recorded match → win/loss, first-blood,
// achievement-unlock) are observed server-side. This module keeps a small
// per-account ring buffer of pending events; the browser drains it via
// `GET /api/me/voice-events` and plays the matching mp3 on each one.
//
// Mirrors the shape of the existing inhouse-alerts trigger surface in
// useInhouseAlerts.js: each event is one of the six VOICE_PACK_EVENTS
// slots from profileCosmetics.js (`match-start`, `first-blood`, `win`,
// `loss`, `level-up`, `achievement-unlock`). The browser handles 404 /
// pack-not-selected fallback to the church bell, so missing slots remain
// safe end-to-end.
//
// Queue is in-process only. A bot restart wipes pending events — that's
// fine: voice-pack events are an at-most-once "play this sound now" hint,
// not a durable notification (the existing post-match Discord DM and
// achievement embeds remain the authoritative record).

const MAX_EVENTS_PER_ACCOUNT = 20;
const EVENT_TTL_MS = 5 * 60 * 1000;
const VALID_EVENTS = new Set([
  'match-start',
  'first-blood',
  'win',
  'loss',
  'level-up',
  'achievement-unlock',
]);

const queues = new Map();

function _now() { return Date.now(); }

function _gc(accountId) {
  const list = queues.get(accountId);
  if (!list) return;
  const cutoff = _now() - EVENT_TTL_MS;
  const fresh = list.filter(e => e.ts >= cutoff);
  if (fresh.length === 0) queues.delete(accountId);
  else queues.set(accountId, fresh);
}

function pushVoiceEvent(accountId, event) {
  const id = Number(accountId);
  if (!id || !Number.isFinite(id) || id <= 0) return;
  if (!VALID_EVENTS.has(event)) return;
  let list = queues.get(id);
  if (!list) { list = []; queues.set(id, list); }
  list.push({ event, ts: _now() });
  if (list.length > MAX_EVENTS_PER_ACCOUNT) list.splice(0, list.length - MAX_EVENTS_PER_ACCOUNT);
}

function drainVoiceEvents(accountId) {
  const id = Number(accountId);
  if (!id || !Number.isFinite(id) || id <= 0) return [];
  _gc(id);
  const list = queues.get(id);
  if (!list || list.length === 0) return [];
  queues.delete(id);
  return list;
}

// Helper: push win/loss + first-blood for every player in a freshly
// recorded match. Tolerates either camelCase (`firstbloodClaimed`) or
// snake_case (`firstblood_claimed`) keys because matchStats is built by
// two different upstreams (the GC path and the replay-parser path).
function pushMatchVoiceEvents(matchStats) {
  if (!matchStats || !Array.isArray(matchStats.players)) return;
  const radiantWin = !!matchStats.radiantWin;
  const players = matchStats.players;
  // First, work out whether anyone actually got first blood in this
  // match. The replay/GC pipelines mark exactly one player; if that
  // field is missing entirely we just skip the first-blood event so
  // we never lie to the listener.
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

function _resetForTests() { queues.clear(); }

module.exports = {
  pushVoiceEvent,
  drainVoiceEvents,
  pushMatchVoiceEvents,
  pushAchievementVoiceEvents,
  _resetForTests,
  MAX_EVENTS_PER_ACCOUNT,
  EVENT_TTL_MS,
};
