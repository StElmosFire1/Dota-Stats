// src/replay/intelligence/matchIntelligence.js
//
// Full-edition derived match-intelligence builder.
//
// Reads already-persisted data — draft, fights, timeline, lane outcomes,
// player stats, team abilities, and game events — and produces structured
// intelligence layers without touching the parser, DB, or network.
//
// Output layers
// ─────────────
//   meta          — match header (id, duration, mode, result, radiant/dire teams)
//   draft         — ordered pick/ban sequence with phase and timing
//   laneOutcomes  — per-lane advantage with NW/XP/kill differentials
//   fights        — structured fight blocks with NW swing, buyback flags, winner
//   timeline      — normalized game timeline (context-appropriate)
//   playerStats   — per-player aggregate summary (bounded, no private fields)
//   teamAbilities — ability usage patterns per team
//   visionSummary — ward/smoke aggregates
//   buybacking    — buyback timeline with dieback annotation
//   objectiveLog  — buildings, Roshan, aegis, tormentors from event stream
//   runeSummary   — rune breakdown by type and team
//   coaching      — coaching metrics (participant layer only)
//
// Privacy model
// ─────────────
//   context = 'public'      → meta + draft + laneOutcomes + fights + objectiveLog
//                             + runeSummary + redacted playerStats + teamAbilities
//   context = 'participant' → above + full playerStats + buybacking + coaching
//                             + bounded positions
//   context = 'admin'       → all of the above; no extra fields here since chat/
//                             paths are never in the intelligence output regardless
//
// NEVER includes: chat text, exact position trails (public), replay_path, or
//                 private coaching data (public/admin).

'use strict';

const { normalizeTimeline, publicTimelineView } = require('./timelineNormalizer');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _clampInt(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return min;
  return Math.max(min, Math.min(Math.floor(v), max));
}

function _clampNonNeg(v) {
  if (v == null || typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, v);
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

function _safeTeam(v) {
  if (v === 'radiant' || v === 0 || v === 2 || v === '0' || v === '2') return 'radiant';
  if (v === 'dire' || v === 1 || v === 3 || v === '1' || v === '3') return 'dire';
  return null;
}

// ---------------------------------------------------------------------------
// Meta layer
// ---------------------------------------------------------------------------

function buildMeta(match) {
  return {
    matchId:       match.match_id ?? match.matchId ?? null,
    duration:      _clampInt(match.duration, 0, 12000),
    radiantWin:    match.radiant_win === true || match.radiantWin === true,
    gameMode:      _clampInt(match.game_mode ?? match.gameMode, 0, 99),
    gameStartTime: match.game_start_time ?? match.gameStartTime ?? null,
    parseMethod:   _safeStr(match.parseMethod ?? match.parse_method, 64) || null,
  };
}

// ---------------------------------------------------------------------------
// Draft layer
// ---------------------------------------------------------------------------

function buildDraft(rawDraft) {
  const draft = _safeJson(rawDraft, null);
  if (!draft) return null;

  // db.getMatch() returns the dedicated match_draft rows as one ordered array.
  // Accept that production shape as well as the older {picks,bans} fixture
  // shape used by early insight previews.
  if (Array.isArray(draft)) {
    const sequence = draft
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') return null;
        const isPick = entry.is_pick === true || entry.isPick === true;
        const order = _clampInt(entry.order_num ?? entry.order ?? index, 0, 50);
        return {
          order,
          heroId: _clampInt(entry.hero_id ?? entry.heroId, 0),
          heroName: _safeStr(entry.hero_name ?? entry.heroName, 64),
          team: _safeTeam(entry.team),
          phase: entry.draft_phase != null || entry.phase != null
            ? _clampInt(entry.draft_phase ?? entry.phase, 1, 3)
            : null,
          timing: entry.time_taken != null
            ? _clampInt(Number(entry.time_taken), 0, 600)
            : (entry.timing != null ? _clampInt(Number(entry.timing), 0, 600) : null),
          draftTime: entry.draft_time != null ? Number(entry.draft_time) : null,
          extraTime: entry.extra_time != null ? _clampInt(Number(entry.extra_time), 0, 600) : null,
          action: isPick ? 'pick' : 'ban',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
    return {
      picks: sequence.filter(entry => entry.action === 'pick'),
      bans: sequence.filter(entry => entry.action === 'ban'),
      sequence,
    };
  }

  // Normalise picks array
  const picks = Array.isArray(draft.picks)
    ? draft.picks.map((p, i) => ({
        order:     _clampInt(p.order ?? i, 0, 50),
        heroId:    _clampInt(p.hero_id ?? p.heroId, 0),
        heroName:  _safeStr(p.hero_name ?? p.heroName, 64),
        team:      _safeTeam(p.team),
        phase:     _clampInt(p.phase, 0, 5),
        timing:    p.timing != null ? _clampInt(p.timing, 0, 600) : null,
      }))
    : [];

  // Normalise bans array
  const bans = Array.isArray(draft.bans)
    ? draft.bans.map((b, i) => ({
        order:     _clampInt(b.order ?? i, 0, 50),
        heroId:    _clampInt(b.hero_id ?? b.heroId, 0),
        heroName:  _safeStr(b.hero_name ?? b.heroName, 64),
        team:      _safeTeam(b.team),
        phase:     _clampInt(b.phase, 0, 5),
        timing:    b.timing != null ? _clampInt(b.timing, 0, 600) : null,
      }))
    : [];

  // Merged sequence with action type
  const sequence = [...picks.map(p => ({ ...p, action: 'pick' })),
                    ...bans.map(b => ({ ...b, action: 'ban' }))]
    .sort((a, b) => a.order - b.order);

  return { picks, bans, sequence };
}

// ---------------------------------------------------------------------------
// Lane outcomes layer
// ---------------------------------------------------------------------------

function buildLaneOutcomes(laneOutcomes, laneOutcomesSummary) {
  const raw = _safeJson(laneOutcomes, null);
  const summary = Array.isArray(laneOutcomesSummary) ? laneOutcomesSummary : [];

  // Normalise per-player lane outcomes when available
  const perPlayer = raw && typeof raw === 'object'
    ? Object.entries(raw).map(([slot, lo]) => ({
        slot:   _clampInt(Number(slot), 0, 200),
        lane:   _safeStr(lo?.lane, 16),
        winner: _safeTeam(lo?.winner),
        nwAdv:  lo?.nw_adv != null ? lo.nw_adv : null,
      }))
    : [];

  return { perPlayer, summary };
}

// ---------------------------------------------------------------------------
// NW swing helper
// ---------------------------------------------------------------------------

function _computeFightNWSwing(fight, timelineBySlot) {
  if (!fight || !timelineBySlot) return null;
  const { start_s, end_s } = fight;
  let radBefore = 0, radAfter = 0, direBefore = 0, direAfter = 0;
  for (const [slot, samples] of Object.entries(timelineBySlot)) {
    const s = _clampInt(Number(slot), 0, 200);
    const team = s >= 128 ? 'dire' : 'radiant';
    // Find closest sample at/before start and at/after end
    let before = 0, after = 0;
    for (const sample of samples) {
      if (sample.t <= start_s) before = sample.nw ?? 0;
      if (sample.t <= end_s)   after  = sample.nw ?? 0;
    }
    if (team === 'radiant') { radBefore += before; radAfter += after; }
    else                    { direBefore += before; direAfter += after; }
  }
  return {
    radiant: { before: radBefore, after: radAfter, delta: radAfter - radBefore },
    dire:    { before: direBefore, after: direAfter, delta: direAfter - direBefore },
    net:     (radAfter - radBefore) - (direAfter - direBefore),
  };
}

// ---------------------------------------------------------------------------
// Fights layer
// ---------------------------------------------------------------------------

function buildFights(rawFights, timeline) {
  const fights = Array.isArray(rawFights) ? rawFights : [];
  if (!fights.length) return [];

  // Build per-slot NW lookup from timeline
  const timelineBySlot = {};
  for (const tp of (timeline?.players || [])) {
    timelineBySlot[tp.slot] = tp.samples || [];
  }

  return fights.map(f => {
    const start  = _clampInt(f.start_s, 0);
    const end    = _clampInt(f.end_s, 0);
    const heroes = Array.isArray(f.heroes) ? f.heroes.map(h => _clampInt(h, 0, 200)) : [];
    const winner = (f.winner === 'radiant' || f.winner === 'dire') ? f.winner : 'draw';

    // NW swing across the fight window
    const nwSwing = _computeFightNWSwing(
      { start_s: start, end_s: end },
      timelineBySlot
    );

    // Buybacks used in window (from per-player buybackEvents)
    const buybacksUsed = [];
    for (const tp of (timeline?.players || [])) {
      for (const bb of (tp.buybackEvents || [])) {
        if (bb.t >= start && bb.t <= end + 30) {
          buybacksUsed.push({ slot: tp.slot, t: bb.t, dieback: bb.dieback });
        }
      }
    }

    return {
      start_s:       start,
      end_s:         end,
      duration_s:    Math.max(0, end - start),
      heroes,
      radiant_deaths: _clampInt(f.radiant_deaths, 0),
      dire_deaths:    _clampInt(f.dire_deaths,    0),
      winner,
      nwSwing:       nwSwing,
      buybacksUsed,
    };
  });
}

// ---------------------------------------------------------------------------
// Player stats layer
// ---------------------------------------------------------------------------

// Fields safe for public output (no private metrics)
const PUBLIC_PLAYER_FIELDS = [
  'slot', 'account_id', 'hero_id', 'hero_name',
  'personaname', 'team', 'position',
  'kills', 'deaths', 'assists',
  'last_hits', 'denies',
  'gpm', 'xpm',
  'net_worth', 'laning_nw',
  'hero_damage', 'tower_damage', 'hero_healing',
  'obs_placed', 'sen_placed', 'wards_killed',
  'teamfight_participation',
  'rank_tier', 'level',
];

// Additional fields for participant layer
const PARTICIPANT_EXTRA_FIELDS = [
  'killed_by', 'kills_log',
  'item_first_times', 'items',
  'stun_duration', 'heal_saves',
  'death_prevention_count',
  'obs_purchased', 'sen_purchased',
  'ward_avg_lifespan', 'ward_placements',
  'smoke_uses', 'first_death',
  'diebacks', 'dieback_count',
  'save_events', 'abilities',
];

function buildPlayerStats(players, context = 'public') {
  if (!Array.isArray(players)) return [];
  return players.map(p => {
    const out = {};
    for (const field of PUBLIC_PLAYER_FIELDS) {
      if (p[field] !== undefined) {
        // Clamp numeric fields
        const v = p[field];
        if (typeof v === 'number') out[field] = _clampNonNeg(v);
        else out[field] = v;
      }
    }
    if (context === 'participant' || context === 'admin') {
      for (const field of PARTICIPANT_EXTRA_FIELDS) {
        if (p[field] !== undefined) out[field] = p[field];
      }
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Team abilities layer
// ---------------------------------------------------------------------------

function buildTeamAbilities(rawTeamAbilities) {
  if (!rawTeamAbilities || typeof rawTeamAbilities !== 'object') return null;
  // Passthrough with basic sanitization — this is already structured parser output
  const out = {};
  for (const team of ['radiant', 'dire']) {
    if (!rawTeamAbilities[team]) continue;
    const teamData = rawTeamAbilities[team];
    out[team] = typeof teamData === 'object' ? teamData : null;
  }
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// Vision summary layer
// ---------------------------------------------------------------------------

function buildVisionSummary(players, wardDeaths) {
  const rows = (players || []).map(p => ({
    slot:      _clampInt(p.slot ?? 0, 0, 200),
    team:      _safeTeam(p.team),
    obsPlaced: _clampInt(p.obs_placed, 0),
    senPlaced: _clampInt(p.sen_placed, 0),
    wardsKilled: _clampInt(p.wards_killed, 0),
  }));

  const totalObs     = rows.reduce((s, r) => s + r.obsPlaced, 0);
  const totalSen     = rows.reduce((s, r) => s + r.senPlaced, 0);
  const totalDewarded = rows.reduce((s, r) => s + r.wardsKilled, 0);
  const wardDeathCount = Array.isArray(wardDeaths) ? wardDeaths.length : 0;

  return {
    perPlayer:       rows,
    totalObsPlaced:  totalObs,
    totalSenPlaced:  totalSen,
    totalDewarded,
    wardDeathsLogged: wardDeathCount,
  };
}

// ---------------------------------------------------------------------------
// Buyback layer
// ---------------------------------------------------------------------------

function buildBuybacking(timelinePlayers) {
  if (!Array.isArray(timelinePlayers)) return [];
  const out = [];
  for (const tp of timelinePlayers) {
    for (const bb of (tp.buybackEvents || [])) {
      out.push({
        slot:    tp.slot,
        t:       bb.t,
        dieback: bb.dieback,
        // Approximate cost: standard formula 200 + NW/13 capped at 2800
        cost:    (() => {
          const sample = (tp.samples || []).reduce((best, s) => {
            return (s.t <= bb.t && (!best || s.t > best.t)) ? s : best;
          }, null);
          const nw = sample?.nw ?? 0;
          return Math.min(2800, Math.round(200 + nw / 13));
        })(),
      });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

// ---------------------------------------------------------------------------
// Objective log layer
// ---------------------------------------------------------------------------

const OBJECTIVE_TYPES = new Set([
  'building_kill', 'roshan', 'aegis', 'tormentor', 'shrine', 'outpost', 'lotus',
]);

function buildObjectiveLog(events) {
  if (!Array.isArray(events)) return [];
  return events
    .filter(e => e && OBJECTIVE_TYPES.has(e.type))
    .map(e => ({
      t:           _clampInt(e.t, 0),
      type:        e.type,
      team:        _safeTeam(e.team),
      detail:      _safeStr(e.detail, 32),
      buildingKey: _safeStr(e.buildingKey, 64),
    }))
    .sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------
// Rune summary layer
// ---------------------------------------------------------------------------

function buildRuneSummary(runePickups) {
  if (!Array.isArray(runePickups)) return { byType: {}, byTeam: { radiant: 0, dire: 0 }, total: 0 };
  const byType = {};
  const byTeam = { radiant: 0, dire: 0 };
  for (const r of runePickups) {
    const type = _safeStr(r.type, 32) || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
    const team = _safeTeam(r.team);
    if (team) byTeam[team]++;
  }
  return { byType, byTeam, total: runePickups.length };
}

// ---------------------------------------------------------------------------
// Coaching layer (participant only)
// ---------------------------------------------------------------------------

/**
 * Derives coaching metrics from already-normalized data.
 * Only included for participant / admin context.
 */
function buildCoachingMetrics(timelinePlayers, fights, matchMeta) {
  const playerMetrics = (timelinePlayers || []).map(tp => {
    const bbs = tp.buybackEvents || [];
    const samples = tp.samples || [];

    // 1. Buybacks with no subsequent meaningful fight
    const buybackNoFight = bbs.filter(bb => {
      if (bb.dieback) return false;
      // "No fight" = no fight starts within 120s of buyback
      return !fights.some(f => f.start_s >= bb.t && f.start_s <= bb.t + 120
                               && f.heroes.includes(tp.slot));
    }).length;

    // 2. Fight attendance rate
    const fightCount = fights.length;
    const attended   = fights.filter(f => f.heroes.includes(tp.slot)).length;
    const fightAttendancePct = fightCount > 0
      ? Math.round((attended / fightCount) * 100) : null;

    // 3. Farm efficiency proxy: compare NW at 10 min vs expected
    // A simple linear benchmark: radiant carry expected ~5500 NW @ 10min.
    // We don't have role so we compute GPM from samples and flag outliers.
    const sample10 = samples.reduce((best, s) => {
      return (s.t <= 600 && (!best || s.t > best.t)) ? s : best;
    }, null);
    const nwAt10 = sample10?.nw ?? null;

    return {
      slot:             tp.slot,
      buybackNoFight,
      fightAttendancePct,
      nwAt10,
      buybackCount:     bbs.length,
      diebackCount:     bbs.filter(b => b.dieback).length,
    };
  });

  // Throw/comeback detection: did team with large NW lead lose?
  let throwDetected = null;
  let comebackDetected = null;
  if (timelinePlayers.length > 0) {
    // Find peak radiant lead and check if they lost
    const allTimes = new Set();
    for (const tp of timelinePlayers) {
      for (const s of (tp.samples || [])) allTimes.add(s.t);
    }
    const times = [...allTimes].sort((a, b) => a - b);
    const nwBySlot = {};
    for (const tp of timelinePlayers) {
      nwBySlot[tp.slot] = {};
      for (const s of (tp.samples || [])) nwBySlot[tp.slot][s.t] = s.nw ?? 0;
    }
    let peakRadiantLead = 0;
    let peakDireLead = 0;
    for (const t of times) {
      let rad = 0, dire = 0;
      for (const tp of timelinePlayers) {
        const nw = nwBySlot[tp.slot]?.[t] ?? 0;
        if (tp.slot < 128) rad += nw; else dire += nw;
      }
      const lead = rad - dire;
      if (lead > peakRadiantLead) peakRadiantLead = lead;
      if (lead < -peakDireLead)   peakDireLead    = -lead;
    }
    const radiantWon = matchMeta?.radiantWin === true;
    // Throw: had a commanding lead (≥10k) but lost
    if (peakRadiantLead >= 10000 && !radiantWon) throwDetected   = 'radiant';
    if (peakDireLead    >= 10000 &&  radiantWon) throwDetected   = 'dire';
    // Comeback: were behind ≥10k but won
    if (peakDireLead    >= 10000 && !radiantWon) comebackDetected = null;   // dire led and won = expected
    if (peakDireLead    >= 10000 &&  radiantWon) comebackDetected = 'radiant'; // radiant was behind ≥10k, won
    if (peakRadiantLead >= 10000 && !radiantWon) comebackDetected = 'dire';    // dire was behind ≥10k, won
  }

  return {
    playerMetrics,
    throwDetected,
    comebackDetected,
  };
}

// ---------------------------------------------------------------------------
// Public output guard
// ---------------------------------------------------------------------------

/**
 * Strips any field from the intelligence output that must not appear in public
 * API responses. This is an extra safety layer on top of buildMatchIntelligence.
 *
 * Removes: coaching, exact positions in players, any _private flag.
 */
function stripForPublic(intelligence) {
  if (!intelligence) return null;
  const safe = { ...intelligence };
  delete safe.coaching;
  safe.timeline = publicTimelineView(safe.timeline);
  return safe;
}

function applyTelemetryFamilyFlags(intelligence, flagMap = {}, context = 'public') {
  if (!intelligence) return null;
  const out = { ...intelligence };
  const enabled = family => flagMap[`replay_telemetry_${family}`] === true;

  if (!enabled('draft')) delete out.draft;
  if (!enabled('laning')) delete out.laneOutcomes;
  if (!enabled('fights')) delete out.fights;
  if (!enabled('vision')) delete out.visionSummary;
  if (!enabled('abilities')) delete out.teamAbilities;
  if (!enabled('objectives')) {
    delete out.objectiveLog;
    delete out.runeSummary;
  }
  if (!enabled('economy') || !enabled('combat')) {
    delete out.playerStats;
    delete out.buybacking;
  }
  if (!enabled('coaching')) delete out.coaching;

  if (out.timeline) {
    const timeline = { ...out.timeline };
    let players = Array.isArray(timeline.players)
      ? timeline.players.map(player => ({ ...player }))
      : [];

    if (!enabled('draft')) timeline.draftMeta = null;
    if (!enabled('fights')) {
      timeline.fights = [];
      timeline.events = (timeline.events || []).filter(
        event => event.type !== 'teamfight_start' && event.type !== 'teamfight_end'
      );
    }
    if (!enabled('objectives')) {
      const objectiveTypes = new Set([
        'building_kill', 'roshan', 'aegis', 'rune', 'tower', 'barracks',
        'shrine', 'outpost', 'tormentor', 'lotus',
      ]);
      timeline.events = (timeline.events || []).filter(event => !objectiveTypes.has(event.type));
      timeline.runePickups = [];
    }
    if (!enabled('vision')) {
      timeline.wardDeaths = [];
      players = players.map(({
        smokeTimes: _smokeTimes,
        smokeCount: _smokeCount,
        smokeSuccesses: _smokeSuccesses,
        ...player
      }) => player);
      if (out.teamAbilities) {
        out.teamAbilities = Object.fromEntries(
          Object.entries(out.teamAbilities).map(([team, abilities]) => [
            team,
            abilities && typeof abilities === 'object'
              ? {
                  glyphCount: abilities.glyphCount,
                  glyphTimes: abilities.glyphTimes,
                  glyphEffective: abilities.glyphEffective,
                }
              : abilities,
          ])
        );
      }
    }
    if (!enabled('economy')) {
      players = players.map(({
        samples: _samples,
        purchaseLog: _purchaseLog,
        purchaseCount: _purchaseCount,
        buybackEvents: _buybackEvents,
        buybackCount: _buybackCount,
        ...player
      }) => player);
    }
    if (!enabled('abilities')) {
      players = players.map(({
        abilityLog: _abilityLog,
        abilityBuildCount: _abilityBuildCount,
        abilityCastLog: _abilityCastLog,
        abilityCastCount: _abilityCastCount,
        itemUseLog: _itemUseLog,
        itemUseCount: _itemUseCount,
        ...player
      }) => player);
    }
    if (!enabled('laning')) {
      timeline.laneOutcomesSummary = [];
      players = players.map(({ laneRegionTime: _laneRegionTime, ...player }) => player);
    }
    if (!enabled('combat')) {
      timeline.events = (timeline.events || []).filter(event => event.type !== 'kill');
    }
    if (!enabled('movement')) {
      players = [];
      timeline.tpActivations = [];
    } else if (!enabled('position')) {
      players = players.map(({ positions: _positions, ...player }) => player);
      timeline.tpActivations = (timeline.tpActivations || []).map(({ destX: _x, destY: _y, ...event }) => event);
    }
    timeline.players = players;
    out.timeline = timeline;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

/**
 * Builds the full match intelligence object.
 *
 * Input: the shape returned by db.getMatch() plus optional auxiliaries.
 *   match               — the match record (players[], draft, game_timeline, etc.)
 *   fights              — match_fights rows (or from game_timeline.fights)
 *   context             — 'public' | 'participant' | 'admin'
 *
 * Output: structured intelligence object (never contains chat, exact paths,
 * or private coaching data for public/admin context).
 */
function buildMatchIntelligence(match, { fights = [], context = 'public' } = {}) {
  if (!match || typeof match !== 'object') {
    throw new TypeError('buildMatchIntelligence: match must be an object');
  }

  const validContexts = new Set(['public', 'participant', 'admin']);
  if (!validContexts.has(context)) {
    throw new RangeError(`buildMatchIntelligence: invalid context "${context}"`);
  }

  const players = Array.isArray(match.players) ? match.players : [];

  // Prefer match_fights passed in; fall back to embedded timeline.fights
  const rawTimeline = _safeJson(match.game_timeline, null);
  const effectiveFights = fights.length > 0
    ? fights
    : (rawTimeline?.fights || []);

  // Normalize timeline with position visibility controlled by context
  const normalizedTimeline = normalizeTimeline(rawTimeline, context);

  const meta           = buildMeta(match);
  const draft          = buildDraft(match.draft);
  const laneOutcomes   = buildLaneOutcomes(
    match.laneOutcomes ?? match.lane_outcomes ?? null,
    normalizedTimeline.laneOutcomesSummary
  );
  const fightsLayer    = buildFights(effectiveFights, normalizedTimeline);
  const playerStats    = buildPlayerStats(players, context);
  const teamAbilities  = buildTeamAbilities(match.teamAbilities ?? match.team_abilities);
  const visionSummary  = buildVisionSummary(players, normalizedTimeline.wardDeaths);
  const objectiveLog   = buildObjectiveLog(normalizedTimeline.events);
  const runeSummary    = buildRuneSummary(normalizedTimeline.runePickups);

  const intelligence = {
    meta,
    draft,
    laneOutcomes,
    fights:        fightsLayer,
    timeline:      normalizedTimeline,
    playerStats,
    teamAbilities,
    visionSummary,
    objectiveLog,
    runeSummary,
  };

  // Participant-only layers
  if (context === 'participant' || context === 'admin') {
    intelligence.buybacking = buildBuybacking(normalizedTimeline.players);
    intelligence.coaching   = buildCoachingMetrics(
      normalizedTimeline.players, fightsLayer, meta
    );
  }

  // Final public guard
  if (context === 'public') {
    return stripForPublic(intelligence);
  }

  return intelligence;
}

module.exports = {
  buildMatchIntelligence,
  // Sub-builders exported for unit testing
  buildMeta,
  buildDraft,
  buildLaneOutcomes,
  buildFights,
  buildPlayerStats,
  buildTeamAbilities,
  buildVisionSummary,
  buildBuybacking,
  buildObjectiveLog,
  buildRuneSummary,
  buildCoachingMetrics,
  stripForPublic,
  applyTelemetryFamilyFlags,
};
