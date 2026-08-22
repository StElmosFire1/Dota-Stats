// src/replay/intelligence/timelineNormalizer.js
//
// Full-edition timeline normalizer / sanitizer.
//
// Accepts the raw `game_timeline` object that is persisted in the `matches`
// table (produced by replayParser.js) and returns a bounded, validated,
// sanitized version.
//
// Rules enforced:
//   • Integer timestamps are clamped to [0, MAX_MATCH_DURATION].
//   • Numeric stat fields are clamped to non-negative ranges.
//   • NaN / Infinity are replaced with safe defaults (0 / null).
//   • Unknown event types are preserved but flagged.
//   • Exact position trails are NEVER included in public output; they are
//     moved to the participant-only layer.
//   • Chat text is stripped entirely regardless of context.
//   • replay_path and replay_file_path are stripped.
//   • Sample arrays are deduplicated by timestamp and sorted ascending.
//   • Output arrays are capped at MAX_EVENTS / MAX_SAMPLES to bound memory.

'use strict';

const MAX_MATCH_DURATION = 12_000; // 3h20m — safely above longest possible game
const MAX_SAMPLES        = 3_600;  // 1-second resolution × 1h; cap for safety
const MAX_EVENTS         = 5_000;
const MAX_PLAYERS        = 10;

// Known safe event types for public output.
const PUBLIC_EVENT_TYPES = new Set([
  'kill', 'building_kill', 'roshan', 'aegis',
  'teamfight_start', 'teamfight_end',
  'rune', 'ward_death', 'tower', 'barracks',
  'shrine', 'outpost', 'tormentor', 'lotus',
]);

// Event types that contain position info that must be bounded.
const POSITION_EVENT_TYPES = new Set(['kill', 'building_kill', 'roshan']);

// ---------------------------------------------------------------------------
// Primitive sanitizers
// ---------------------------------------------------------------------------

function _clampTime(v, max = MAX_MATCH_DURATION) {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(Math.round(v), max));
}

function _clampNonNeg(v, fallback = 0) {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(0, v);
}

function _clampInt(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return min;
  return Math.max(min, Math.min(Math.floor(v), max));
}

function _safeStr(v, maxLen = 128) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function _safeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Sample normalizer
// ---------------------------------------------------------------------------

/**
 * Normalizes a player's timeline samples array.
 * Each sample is expected to have shape: { t, nw, xp?, lh?, dn?, level? }
 * Returns a sorted, deduplicated, bounded array.
 */
function normalizeSamples(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const t = _clampTime(s.t);
    if (seen.has(t)) continue;
    seen.add(t);
    const entry = { t };
    if (s.nw != null)    entry.nw    = _clampNonNeg(s.nw);
    if (s.xp != null)    entry.xp    = _clampNonNeg(s.xp);
    if (s.lh != null)    entry.lh    = _clampInt(s.lh, 0, 2000);
    if (s.dn != null)    entry.dn    = _clampInt(s.dn, 0, 2000);
    if (s.level != null) entry.level = _clampInt(s.level, 1, 30);
    out.push(entry);
  }
  out.sort((a, b) => a.t - b.t);
  return out.slice(0, MAX_SAMPLES);
}

// ---------------------------------------------------------------------------
// Event normalizer
// ---------------------------------------------------------------------------

/**
 * Normalizes a single timeline event.
 * Public: strips coordinates from non-kill-type events, marks unknown types.
 * Returns null to signal the event should be dropped.
 */
function _normalizeEvent(ev, opts = {}) {
  if (!ev || typeof ev !== 'object') return null;
  const t = _clampTime(ev.t);
  const type = _safeStr(ev.type, 32) || 'unknown';
  const known = PUBLIC_EVENT_TYPES.has(type);

  const out = { t, type };

  // Slot references — clamp to valid slot range (0-9 radiant, 128-137 dire)
  if (ev.killerSlot != null)  out.killerSlot  = _clampInt(ev.killerSlot, 0, 200);
  if (ev.victimSlot != null)  out.victimSlot  = _clampInt(ev.victimSlot, 0, 200);
  if (Array.isArray(ev.assistSlots)) {
    out.assistSlots = ev.assistSlots
      .map(s => _clampInt(s, 0, 200))
      .filter(s => Number.isFinite(s));
  }

  // Team string
  if (ev.team != null) out.team = ev.team === 'radiant' ? 'radiant' : 'dire';

  // Detail string (e.g. 'killed', 'picked_up', 'expired')
  if (ev.detail != null) out.detail = _safeStr(ev.detail, 32);

  // Building name for building_kill events
  if (ev.buildingKey != null) out.buildingKey = _safeStr(ev.buildingKey, 64);

  // Positions: include only in participant-layer output
  if (opts.includePositions && POSITION_EVENT_TYPES.has(type)) {
    if (ev.x != null && ev.y != null) {
      out.x = _clampInt(ev.x, -32768, 32768);
      out.y = _clampInt(ev.y, -32768, 32768);
    }
  }

  // Flag unknown types but keep them
  if (!known) out._unknownType = true;

  return out;
}

/**
 * Normalizes the events array. opts.includePositions = true for participant.
 */
function normalizeEvents(raw, opts = {}) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const ev of raw) {
    const n = _normalizeEvent(ev, opts);
    if (n) out.push(n);
    if (out.length >= MAX_EVENTS) break;
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// ---------------------------------------------------------------------------
// Buyback event normalizer
// ---------------------------------------------------------------------------

function normalizeBuybackEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(ev => {
      if (!ev || typeof ev !== 'object') return null;
      return {
        t:       _clampTime(ev.t),
        dieback: ev.dieback === true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Ability log normalizer
// ---------------------------------------------------------------------------

function normalizeAbilityLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      return {
        heroLevel:    _clampInt(entry.heroLevel, 1, 30),
        abilityName:  _safeStr(entry.abilityName, 64) || '',
        abilityLevel: _clampInt(entry.abilityLevel, 0, 7),
        time:         _clampTime(entry.time),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.heroLevel - b.heroLevel || a.time - b.time);
}

// ---------------------------------------------------------------------------
// Purchase log normalizer
// ---------------------------------------------------------------------------

function normalizePurchaseLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const name = _safeStr(entry.itemName, 64);
      if (!name) return null;
      return {
        itemName: name,
        time:     _clampTime(entry.time),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

function normalizeUseLog(raw, valueKey, outputKey, maxEntries) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const value = _safeStr(entry[valueKey], 96);
      if (!value) return null;
      return { t: _clampTime(entry.t ?? entry.time), [outputKey]: value };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t)
    .slice(0, maxEntries);
}

function normalizeLaneRegionTime(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of ['safelane', 'mid', 'offlane', 'jungle', 'base']) {
    out[key] = _clampInt(Number(raw[key]), 0, 900);
  }
  out._derived = true;
  return out;
}

function normalizePauseEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map(event => ({
    t: _clampTime(event?.t),
    duration: _clampInt(Number(event?.duration), 0, MAX_MATCH_DURATION),
    pauserSlot: event?.pauserSlot == null ? null : _clampInt(Number(event.pauserSlot), 0, 9),
  }));
}

function normalizeSystemEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 20)
    .map(event => {
      const state = _safeStr(event?.state, 48);
      if (!state || !/^[A-Z_]+$/.test(state)) return null;
      return { t: _clampTime(event?.t), state };
    })
    .filter(Boolean);
}

function normalizeTpActivations(raw, includePositions) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 200)
    .map(event => {
      if (!event || typeof event !== 'object') return null;
      const out = {
        t: _clampTime(event.t),
        slot: _clampInt(Number(event.slot), 0, 9),
        item: _safeStr(event.item, 64) || 'tpscroll',
      };
      if (includePositions && Number.isFinite(Number(event.destX)) && Number.isFinite(Number(event.destY))) {
        out.destX = _clampInt(Number(event.destX), -32768, 32768);
        out.destY = _clampInt(Number(event.destY), -32768, 32768);
      }
      return out;
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Smoke event normalizer
// ---------------------------------------------------------------------------

function normalizeSmokeTimes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(v => {
      if (typeof v === 'number') return _clampTime(v);
      if (v && typeof v === 'object' && v.t != null) return _clampTime(v.t);
      return null;
    })
    .filter(v => v !== null)
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Ward death normalizer
// ---------------------------------------------------------------------------

function normalizeWardDeaths(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(w => {
      if (!w || typeof w !== 'object') return null;
      const out = { t: _clampTime(w.t) };
      if (w.type != null)  out.type  = _safeStr(w.type, 32);
      if (w.slot != null)  out.slot  = _clampInt(w.slot, 0, 200);
      if (w.team != null)  out.team  = w.team === 'radiant' ? 'radiant' : 'dire';
      return out;
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Rune pickup normalizer
// ---------------------------------------------------------------------------

function normalizeRunePickups(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(r => {
      if (!r || typeof r !== 'object') return null;
      const out = { t: _clampTime(r.t) };
      if (r.type != null)  out.type  = _safeStr(r.type, 32);
      if (r.slot != null)  out.slot  = _clampInt(r.slot, 0, 200);
      if (r.team != null)  out.team  = r.team === 'radiant' ? 'radiant' : 'dire';
      return out;
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Fight normalizer
// ---------------------------------------------------------------------------

function normalizeFights(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(f => {
      if (!f || typeof f !== 'object') return null;
      const start = _clampTime(f.start_s);
      const end   = _clampTime(f.end_s);
      if (end < start) return null;
      const out = {
        start_s:        start,
        end_s:          end,
        heroes:         Array.isArray(f.heroes) ? f.heroes.map(h => _clampInt(h, 0, 200)) : [],
        winner:         (f.winner === 'radiant' || f.winner === 'dire') ? f.winner : 'draw',
        radiant_deaths: _clampInt(f.radiant_deaths, 0),
        dire_deaths:    _clampInt(f.dire_deaths,    0),
      };
      return out;
    })
    .filter(Boolean)
    .sort((a, b) => a.start_s - b.start_s);
}

// ---------------------------------------------------------------------------
// Player entry normalizer
// ---------------------------------------------------------------------------

/**
 * Normalizes a single player timeline entry.
 *
 * opts.includePositions — include raw position samples (participant layer only)
 * opts.includeSmokeTimes — include smoke times (public OK; they're just timestamps)
 */
function normalizePlayerEntry(p, opts = {}) {
  if (!p || typeof p !== 'object') return null;
  const slot = _clampInt(p.slot, 0, 200);
  const team = (p.team === 'radiant' || p.team === 'dire') ? p.team : null;

  const out = {
    slot,
    name:          _safeStr(p.name, 64) || '',
    team,
    samples:       normalizeSamples(p.samples),
    purchaseLog:   normalizePurchaseLog(p.purchaseLog),
    abilityLog:    normalizeAbilityLog(p.abilityLog),
    abilityCastLog: normalizeUseLog(p.abilityCastLog, 'ability', 'ability', 300),
    itemUseLog:     normalizeUseLog(p.itemUseLog, 'item', 'item', 100),
    buybackEvents: normalizeBuybackEvents(p.buybackEvents),
    smokeSuccesses: _clampInt(p.smokeSuccesses, 0, 1000),
    laneRegionTime: normalizeLaneRegionTime(p.laneRegionTime),
  };

  if (opts.includeSmokeTimes !== false) {
    out.smokeTimes = normalizeSmokeTimes(p.smokeTimes);
  }

  // Position samples — participant-only layer
  if (opts.includePositions && Array.isArray(p.positions)) {
    out.positions = p.positions
      .map(pos => {
        if (!pos || typeof pos !== 'object') return null;
        const t = _clampTime(pos.t);
        const x = _clampInt(pos.x, -32768, 32768);
        const y = _clampInt(pos.y, -32768, 32768);
        return { t, x, y };
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t)
      .slice(0, MAX_SAMPLES);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Lane outcomes summary normalizer
// ---------------------------------------------------------------------------

function normalizeLaneOutcomesSummary(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(lane => {
      if (!lane || typeof lane !== 'object') return null;
      const validLanes = new Set(['safe', 'mid', 'off']);
      const validWinners = new Set(['radiant', 'dire', 'even']);
      return {
        lane:          validLanes.has(lane.lane) ? lane.lane : 'unknown',
        radiantNW:     _clampNonNeg(lane.radiantNW),
        direNW:        _clampNonNeg(lane.direNW),
        radiantXP:     _clampNonNeg(lane.radiantXP),
        direXP:        _clampNonNeg(lane.direXP),
        radiantKills:  _clampInt(lane.radiantKills, 0),
        direKills:     _clampInt(lane.direKills, 0),
        winner:        validWinners.has(lane.winner) ? lane.winner : 'even',
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Master normalizer
// ---------------------------------------------------------------------------

/**
 * Normalizes a full game_timeline object.
 *
 * context: 'public' | 'participant' | 'admin'
 *   public      — No positions, no chat, no paths.
 *   participant — Includes bounded position trails per player.
 *   admin       — Same as participant; admin-only fields handled at API layer.
 *
 * Returns a validated, sanitized timeline object safe for storage or API output.
 */
function normalizeTimeline(rawTimeline, context = 'public') {
  if (!rawTimeline || typeof rawTimeline !== 'object') {
    return { interval: 30, players: [], events: [], fights: [], wardDeaths: [], runePickups: [], laneOutcomesSummary: [] };
  }

  const includePositions = (context === 'participant' || context === 'admin');
  const opts = { includePositions };

  const players = Array.isArray(rawTimeline.players)
    ? rawTimeline.players
        .slice(0, MAX_PLAYERS)
        .map(p => normalizePlayerEntry(p, opts))
        .filter(Boolean)
    : [];

  const events        = normalizeEvents(rawTimeline.events, opts);
  const fights        = normalizeFights(rawTimeline.fights);
  const wardDeaths    = normalizeWardDeaths(rawTimeline.wardDeaths);
  const runePickups   = normalizeRunePickups(rawTimeline.runePickups);
  const laneOutcomes  = normalizeLaneOutcomesSummary(rawTimeline.laneOutcomesSummary);

  // Interval: must be a finite positive integer in [1, 300]; default 30.
  const rawInterval = rawTimeline.interval;
  const parsedInterval = (rawInterval != null && typeof rawInterval === 'number' && Number.isFinite(rawInterval))
    ? Math.max(1, Math.min(300, Math.floor(rawInterval)))
    : 30;

  const out = {
    interval:            parsedInterval,
    players,
    events,
    fights,
    wardDeaths,
    runePickups,
    laneOutcomesSummary: laneOutcomes,
    draftMeta: rawTimeline.draftMeta && typeof rawTimeline.draftMeta === 'object'
      ? {
          startTime: Number.isFinite(Number(rawTimeline.draftMeta.startTime))
            ? Number(rawTimeline.draftMeta.startTime)
            : null,
          _derived: true,
        }
      : null,
    pauseEvents: normalizePauseEvents(rawTimeline.pauseEvents),
    systemEvents: normalizeSystemEvents(rawTimeline.systemEvents),
    tpActivations: normalizeTpActivations(rawTimeline.tpActivations, includePositions),
  };

  // Never propagate paths or chat
  // (defensive: these should never be in game_timeline, but be safe)

  return out;
}

// ---------------------------------------------------------------------------
// Public strip — removes anything that shouldn't leave the server on the
// public API. Call this after normalizeTimeline('public').
// ---------------------------------------------------------------------------

/**
 * Produces a public-safe summary view of the timeline.
 * Strips per-player purchase logs (item names can sometimes leak identity)
 * and leaves only the aggregate signals.
 *
 * Returns the same shape as normalizeTimeline but with purchaseLog → length
 * only, and no positions.
 */
function publicTimelineView(normalizedTimeline) {
  if (!normalizedTimeline) return null;
  return {
    ...normalizedTimeline,
    players: (normalizedTimeline.players || []).map(p => {
      return {
        slot: p.slot,
        team: p.team,
        purchaseCount: Array.isArray(p.purchaseLog) ? p.purchaseLog.length : 0,
        abilityBuildCount: Array.isArray(p.abilityLog) ? p.abilityLog.length : 0,
        abilityCastCount: Array.isArray(p.abilityCastLog) ? p.abilityCastLog.length : 0,
        itemUseCount: Array.isArray(p.itemUseLog) ? p.itemUseLog.length : 0,
        buybackCount: Array.isArray(p.buybackEvents) ? p.buybackEvents.length : 0,
        smokeCount: Array.isArray(p.smokeTimes) ? p.smokeTimes.length : 0,
        smokeSuccesses: p.smokeSuccesses || 0,
        laneRegionTime: p.laneRegionTime || null,
      };
    }),
  };
}

module.exports = {
  normalizeTimeline,
  publicTimelineView,
  normalizeSamples,
  normalizeEvents,
  normalizeFights,
  normalizePlayerEntry,
  normalizeBuybackEvents,
  normalizeAbilityLog,
  normalizePurchaseLog,
  normalizeUseLog,
  normalizeLaneRegionTime,
  normalizePauseEvents,
  normalizeSystemEvents,
  normalizeTpActivations,
  normalizeSmokeTimes,
  normalizeWardDeaths,
  normalizeRunePickups,
  normalizeLaneOutcomesSummary,
  // Exported constants (for tests)
  MAX_MATCH_DURATION,
  MAX_SAMPLES,
  MAX_EVENTS,
  MAX_PLAYERS,
};
