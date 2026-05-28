// Task #439 — Match Insights v2 derivation functions.
//
// Each function in this module takes already-stored match data (the shape
// returned by db.getMatch() plus optional auxiliary lookups: match_fights,
// position_baselines, cohort item-timing samples) and returns an "insight"
// object of the form:
//   {
//     key,            // stable string used for the per-insight feature flag
//     label,          // human-readable title
//     rows,           // array of per-player or per-event entries
//     summary,        // optional short text headline
//     raw,            // the inputs the insight was derived from
//   }
//
// All derivations are pure — no DB access, no network — so the same code is
// reused by:
//   1. The admin preview endpoint (`GET /api/admin/match-insights/:matchId`),
//   2. The backfill runner that persists derivable columns
//      (lane_outcome, death_context, fight_arrival_time, save_events),
//   3. Snapshot tests in `tests/matchInsights.test.js`.
//
// Anything that requires the Java parser to surface new combat-log signal
// (items_sold_gold, end_inventory_gold, time_spent_dead) is read from the
// DB columns directly when present and shown as "—" when the parser hasn't
// caught up yet.

const POSITIONS = [0, 1, 2, 3, 4, 5];

// -----------------------------------------------------------------------------
// 1. Lane grading
// -----------------------------------------------------------------------------
//
// Uses laning_nw (net worth at 10 min) bucketed by lane. Compares each lane
// pair Radiant vs Dire and assigns a stomp / win / even / lose / feed grade.
// Severity is the absolute net-worth advantage of the lane.

function _laneOf(pos, team) {
  if (pos === 2) return 'mid';
  if (pos === 1 || pos === 5) return team === 'radiant' ? 'safe' : 'off';
  if (pos === 3 || pos === 4) return team === 'radiant' ? 'off' : 'safe';
  return 'jungle';
}

function _gradeFromAdvantage(adv) {
  if (adv >= 4000)  return { grade: 'stomp', severity: adv };
  if (adv >= 1500)  return { grade: 'win',   severity: adv };
  if (adv <= -4000) return { grade: 'feed',  severity: -adv };
  if (adv <= -1500) return { grade: 'lose',  severity: -adv };
  return { grade: 'even', severity: Math.abs(adv) };
}

function deriveLaneGrading(players) {
  const grouped = {};
  for (const p of players) {
    if (!p || p.position == null || p.position === 0) continue;
    if (p.laning_nw == null) continue;
    const lane = _laneOf(p.position, p.team);
    if (lane === 'jungle') continue;
    const key = `${lane}_${p.team}`;
    (grouped[key] ||= []).push(p);
  }

  const rows = [];
  for (const lane of ['safe', 'mid', 'off']) {
    const rad = grouped[`${lane}_radiant`] || [];
    const dire = grouped[`${lane}_dire`] || [];
    const radSum = rad.reduce((s, p) => s + (p.laning_nw || 0), 0);
    const direSum = dire.reduce((s, p) => s + (p.laning_nw || 0), 0);
    const adv = radSum - direSum;
    const radGrade = _gradeFromAdvantage(adv);
    const direGrade = _gradeFromAdvantage(-adv);
    for (const p of rad) {
      rows.push({
        slot: p.slot, account_id: p.account_id, hero_id: p.hero_id,
        team: p.team, position: p.position, lane,
        laning_nw: p.laning_nw,
        grade: radGrade.grade, severity: radGrade.severity,
      });
    }
    for (const p of dire) {
      rows.push({
        slot: p.slot, account_id: p.account_id, hero_id: p.hero_id,
        team: p.team, position: p.position, lane,
        laning_nw: p.laning_nw,
        grade: direGrade.grade, severity: direGrade.severity,
      });
    }
  }
  rows.sort((a, b) => a.slot - b.slot);
  return {
    key: 'match_insights_lane_grading',
    label: 'Lane Grading',
    rows,
    summary: rows.length ? `${rows.length} lanes graded` : 'No laning_nw data',
    raw: { source: 'player_stats.laning_nw + position' },
  };
}

// -----------------------------------------------------------------------------
// 2. Vision report (ward placements summary)
// -----------------------------------------------------------------------------

function deriveVisionReport(players) {
  const rows = players.map(p => {
    const wp = Array.isArray(p.ward_placements) ? p.ward_placements
             : (p.ward_placements ? safeJson(p.ward_placements, []) : []);
    const obs = wp.filter(w => (w.type || '').toLowerCase().startsWith('obs') || w.type === 'observer');
    const sen = wp.filter(w => (w.type || '').toLowerCase().startsWith('sen') || w.type === 'sentry');
    return {
      slot: p.slot, account_id: p.account_id, hero_id: p.hero_id, team: p.team,
      position: p.position,
      obs_placed: p.obs_placed || 0,
      sen_placed: p.sen_placed || 0,
      obs_purchased: p.obs_purchased || 0,
      sen_purchased: p.sen_purchased || 0,
      wards_killed: p.wards_killed || 0,
      ward_avg_lifespan: p.ward_avg_lifespan,
      obs_with_coords: obs.length,
      sen_with_coords: sen.length,
    };
  }).sort((a, b) => a.slot - b.slot);
  const totalObs = rows.reduce((s, r) => s + r.obs_placed, 0);
  const totalSen = rows.reduce((s, r) => s + r.sen_placed, 0);
  return {
    key: 'match_insights_vision_report',
    label: 'Vision Report',
    rows,
    summary: `${totalObs} obs · ${totalSen} sen placed`,
    raw: { source: 'player_stats.{obs_placed,sen_placed,ward_placements,wards_killed}' },
  };
}

// -----------------------------------------------------------------------------
// 3. Item-timing cohort percentile
// -----------------------------------------------------------------------------
//
// For each player, list the first major item purchase times and rank against
// the supplied cohort distribution (same-hero, same-position, similar MMR).
// `cohortDistributions` shape:
//   { [heroId]: { [itemName]: [time1, time2, ...] } }
// If the cohort is empty/missing we return percentile=null and label='no cohort'.

const MAJOR_ITEMS = new Set([
  'item_blink', 'item_black_king_bar', 'item_radiance', 'item_aghanims_scepter',
  'item_octarine_core', 'item_manta', 'item_satanic', 'item_butterfly',
  'item_assault', 'item_heart', 'item_eternal_shroud', 'item_pipe',
  'item_force_staff', 'item_glimmer_cape', 'item_lotus_orb', 'item_aether_lens',
  'item_orchid', 'item_bloodthorn', 'item_silver_edge', 'item_desolator',
  'item_mjollnir', 'item_daedalus', 'item_skadi', 'item_refresher',
  'item_meteor_hammer', 'item_solar_crest', 'item_shivas_guard',
]);

function _percentile(sortedAsc, value) {
  if (!sortedAsc.length) return null;
  // "Faster" = lower time = better percentile (closer to 100).
  let i = 0;
  while (i < sortedAsc.length && sortedAsc[i] <= value) i++;
  // proportion strictly slower = (N - i) / N
  return Math.round(((sortedAsc.length - i) / sortedAsc.length) * 100);
}

function deriveItemTimingCohort(players, cohortDistributions = {}) {
  const rows = [];
  for (const p of players) {
    const firstTimes = safeJson(p.item_first_times, {});
    if (!firstTimes || typeof firstTimes !== 'object') continue;
    const heroBucket = cohortDistributions?.[p.hero_id] || {};
    for (const [itemName, t] of Object.entries(firstTimes)) {
      if (!MAJOR_ITEMS.has(itemName)) continue;
      const seconds = Number(t);
      if (!Number.isFinite(seconds) || seconds < 0) continue;
      const cohort = heroBucket[itemName] || [];
      const sorted = [...cohort].sort((a, b) => a - b);
      rows.push({
        slot: p.slot, account_id: p.account_id, hero_id: p.hero_id, team: p.team,
        position: p.position,
        item: itemName,
        time_s: Math.round(seconds),
        cohort_size: sorted.length,
        cohort_median_s: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
        percentile: _percentile(sorted, seconds),
      });
    }
  }
  rows.sort((a, b) => a.slot - b.slot || a.time_s - b.time_s);
  return {
    key: 'match_insights_item_timing_cohort',
    label: 'Item-Timing Cohort',
    rows,
    summary: rows.length ? `${rows.length} item timings` : 'No item_first_times data',
    raw: { source: 'player_stats.item_first_times + supplied cohort distributions' },
  };
}

// -----------------------------------------------------------------------------
// 4. Death-context classifier
// -----------------------------------------------------------------------------
//
// For each death recorded via player_stats.killed_by + match_fights, classify
// it as: solo, ganked (2-3 enemies), or teamfight (≥4 enemies or inside a
// known fight window).

function deriveDeathContext(players, fights = []) {
  const fightByT = (t) => fights.find(f => t >= f.start_s && t <= f.end_s) || null;
  const rows = [];
  for (const p of players) {
    const killedBy = safeJson(p.killed_by, {});
    const killers = Object.keys(killedBy);
    // We don't have per-death timestamps on every match (only aggregate
    // counts), so we compute a derived deathContextSummary by:
    //   - total deaths = p.deaths
    //   - distinct_killers = unique killers
    //   - "teamfight share" = deaths that happened during any known fight
    //     window (when match_fights is available we approximate by assuming
    //     teamfight_participation captures this — falls back to 0).
    const distinct = killers.filter(k => k && !k.startsWith('lane_') && !k.startsWith('npc_dota_creep')).length;
    const teamfightShare = p.teamfight_participation != null
      ? Math.round((p.teamfight_participation || 0) * 100)
      : null;
    rows.push({
      slot: p.slot, account_id: p.account_id, hero_id: p.hero_id, team: p.team,
      deaths: p.deaths || 0,
      distinct_killers: distinct,
      first_death: !!p.first_death,
      teamfight_participation_pct: teamfightShare,
      classification: classifyDeaths(p, distinct),
    });
  }
  rows.sort((a, b) => a.slot - b.slot);
  return {
    key: 'match_insights_death_context',
    label: 'Death Context',
    rows,
    summary: `${rows.reduce((s, r) => s + r.deaths, 0)} total deaths classified`,
    raw: {
      source: 'player_stats.killed_by + teamfight_participation + match_fights',
      fight_count: fights.length,
    },
  };
}

function classifyDeaths(p, distinctKillers) {
  // Heuristic without per-death t: combine distinct-killer count with
  // teamfight_participation to label the *dominant* death pattern.
  if ((p.deaths || 0) === 0) return 'no_deaths';
  const tfp = p.teamfight_participation || 0;
  if (distinctKillers >= 4 || tfp >= 0.7) return 'teamfight_heavy';
  if (distinctKillers >= 2) return 'ganked';
  return 'solo_picks';
}

// -----------------------------------------------------------------------------
// 5. Net-worth swing extractor
// -----------------------------------------------------------------------------
//
// From the per-team gold lead in game_timeline, find the top-K biggest swings
// (start → end gold deficit/lead change) and attribute them by sampling who
// gained the most net worth across the swing window.

function deriveNetWorthSwings(timeline, players, k = 5) {
  if (!timeline?.players?.length) {
    return {
      key: 'match_insights_nw_swings',
      label: 'Net-Worth Swings',
      rows: [],
      summary: 'No timeline data',
      raw: { source: 'matches.game_timeline' },
    };
  }
  const slotTeam = {};
  players.forEach(p => { slotTeam[p.slot] = p.team; });

  const timesSet = new Set();
  for (const tp of timeline.players) {
    for (const s of (tp.samples || [])) timesSet.add(s.t);
  }
  const times = [...timesSet].sort((a, b) => a - b);
  if (times.length < 3) {
    return {
      key: 'match_insights_nw_swings', label: 'Net-Worth Swings',
      rows: [], summary: 'Timeline too short', raw: { source: 'matches.game_timeline' },
    };
  }

  // Per-slot sample lookup: slot → { t: nw }
  const bySlot = {};
  for (const tp of timeline.players) {
    bySlot[tp.slot] = {};
    for (const s of (tp.samples || [])) bySlot[tp.slot][s.t] = s.nw ?? 0;
  }

  const leadSeries = times.map(t => {
    let rad = 0, dire = 0;
    for (const tp of timeline.players) {
      const nw = bySlot[tp.slot]?.[t] ?? 0;
      if (slotTeam[tp.slot] === 'radiant') rad += nw; else dire += nw;
    }
    return { t, lead: rad - dire };
  });

  // Find local extrema (peaks/troughs) and emit the top-K swings
  // between consecutive extrema by absolute delta.
  const swings = [];
  for (let i = 1; i < leadSeries.length; i++) {
    const prev = leadSeries[i - 1];
    const curr = leadSeries[i];
    swings.push({
      start_t: prev.t, end_t: curr.t,
      delta: curr.lead - prev.lead,
      lead_before: prev.lead, lead_after: curr.lead,
    });
  }
  // Pick top-K by absolute swing
  swings.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = swings.slice(0, k);

  // Attribution: who gained most NW across the window?
  for (const sw of top) {
    const gains = [];
    for (const tp of timeline.players) {
      const before = bySlot[tp.slot]?.[sw.start_t] ?? 0;
      const after = bySlot[tp.slot]?.[sw.end_t] ?? 0;
      gains.push({ slot: tp.slot, gain: after - before });
    }
    gains.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
    sw.top_gainers = gains.slice(0, 3);
  }
  top.sort((a, b) => a.start_t - b.start_t);

  return {
    key: 'match_insights_nw_swings',
    label: 'Net-Worth Swings',
    rows: top,
    summary: `${top.length} biggest swings`,
    raw: { source: 'matches.game_timeline (per-slot nw samples)' },
  };
}

// -----------------------------------------------------------------------------
// 6. Skill-build vs cohort
// -----------------------------------------------------------------------------
//
// Given each player's recorded ability levels and an optional `cohortBuilds`
// map ({ [heroId]: { sequence: [abilityName, ...], wr: number } }) compute
// the longest common prefix length and a similarity ratio.

function _abilitySequence(abilityRows) {
  return (abilityRows || [])
    .slice()
    .sort((a, b) => (a.ability_level - b.ability_level) || (a.time - b.time))
    .map(a => a.ability_name);
}

function deriveSkillBuildVsCohort(players, cohortBuilds = {}) {
  const rows = players.map(p => {
    const playerSeq = _abilitySequence(p.abilities || []).slice(0, 18);
    const cohort = cohortBuilds?.[p.hero_id] || null;
    const cohortSeq = cohort?.sequence || [];
    let prefixMatch = 0;
    for (let i = 0; i < Math.min(playerSeq.length, cohortSeq.length); i++) {
      if (playerSeq[i] === cohortSeq[i]) prefixMatch++;
      else break;
    }
    return {
      slot: p.slot, account_id: p.account_id, hero_id: p.hero_id, team: p.team,
      player_sequence: playerSeq,
      cohort_sequence: cohortSeq,
      cohort_winrate: cohort?.wr ?? null,
      prefix_match: prefixMatch,
      similarity_pct: cohortSeq.length
        ? Math.round((prefixMatch / Math.min(playerSeq.length, cohortSeq.length)) * 100)
        : null,
    };
  }).sort((a, b) => a.slot - b.slot);
  return {
    key: 'match_insights_skill_build',
    label: 'Skill Build vs Top-WR Build',
    rows,
    summary: cohortBuilds && Object.keys(cohortBuilds).length
      ? `${Object.keys(cohortBuilds).length} cohort builds available`
      : 'No cohort builds supplied',
    raw: { source: 'player_abilities + supplied cohort builds' },
  };
}

// -----------------------------------------------------------------------------
// 7. Aegis / Roshan timeline
// -----------------------------------------------------------------------------

function deriveRoshanTimeline(timeline) {
  const events = (timeline?.events || []).filter(e => e.type === 'roshan' || e.type === 'aegis');
  const rows = events.map(e => ({
    t: e.t,
    type: e.type,
    team: e.team || null,
    detail: e.detail || null,
  })).sort((a, b) => a.t - b.t);
  return {
    key: 'match_insights_roshan_timeline',
    label: 'Roshan / Aegis Timeline',
    rows,
    summary: `${rows.length} roshan/aegis events`,
    raw: { source: 'matches.game_timeline.events' },
  };
}

// -----------------------------------------------------------------------------
// 8. Fight participation + arrival time
// -----------------------------------------------------------------------------
//
// Per player: how many of the match_fights they appeared in, and their
// average arrival_time (seconds between fight start and the player's first
// timeline NW jump > 100 within the fight window — used as a proxy for
// "engagement time"). Pure: no DB lookups, uses passed-in timeline.

function deriveFightParticipation(timeline, players, fights = []) {
  if (!fights.length) {
    return {
      key: 'match_insights_fight_participation',
      label: 'Fight Participation',
      rows: [], summary: 'No match_fights recorded',
      raw: { source: 'match_fights + matches.game_timeline' },
    };
  }
  // Build per-slot per-time NW lookup
  const bySlot = {};
  for (const tp of (timeline?.players || [])) {
    bySlot[tp.slot] = (tp.samples || []).slice().sort((a, b) => a.t - b.t);
  }

  const rows = players.map(p => {
    const samples = bySlot[p.slot] || [];
    let participated = 0;
    const arrivalTimes = [];
    for (const f of fights) {
      if (Array.isArray(f.heroes) && f.heroes.includes(p.slot)) {
        participated++;
        // Approximate arrival: first sample with t in [start_s, end_s+10] that
        // shows a non-trivial NW delta compared to the sample immediately
        // before start_s. Falls back to start_s (instant arrival) when we
        // can't compute.
        let pre = null, arrival = null;
        for (const s of samples) {
          if (s.t < f.start_s) pre = s;
          else if (s.t <= f.end_s + 10 && pre && (s.nw - pre.nw) > 100) {
            arrival = s.t; break;
          }
        }
        arrivalTimes.push(arrival != null ? Math.max(0, arrival - f.start_s) : 0);
      }
    }
    const avgArrival = arrivalTimes.length
      ? Math.round(arrivalTimes.reduce((s, x) => s + x, 0) / arrivalTimes.length)
      : null;
    return {
      slot: p.slot, account_id: p.account_id, hero_id: p.hero_id, team: p.team,
      fights_participated: participated,
      total_fights: fights.length,
      participation_pct: fights.length
        ? Math.round((participated / fights.length) * 100) : 0,
      avg_arrival_s: avgArrival,
    };
  }).sort((a, b) => a.slot - b.slot);
  return {
    key: 'match_insights_fight_participation',
    label: 'Fight Participation',
    rows,
    summary: `${fights.length} team fights`,
    raw: { source: 'match_fights + matches.game_timeline' },
  };
}

// -----------------------------------------------------------------------------
// 9. Save events (parser-derived; gracefully degrades when missing)
// -----------------------------------------------------------------------------

function deriveSaveEvents(players) {
  const rows = players.map(p => {
    const saves = safeJson(p.save_events, []);
    return {
      slot: p.slot, account_id: p.account_id, hero_id: p.hero_id, team: p.team,
      heal_saves: p.heal_saves || 0,
      stun_duration: Math.round((p.stun_duration || 0) * 10) / 10,
      death_prevention_count: p.death_prevention_count || 0,
      save_events: saves,
    };
  }).sort((a, b) => a.slot - b.slot);
  return {
    key: 'match_insights_save_events',
    label: 'Saves & Stuns',
    rows,
    summary: `${rows.reduce((s, r) => s + r.heal_saves, 0)} saves recorded`,
    raw: {
      source: 'player_stats.{heal_saves,stun_duration,death_prevention_count,save_events}',
      parser_field_pending: 'save_events (full per-event log requires parser update)',
    },
  };
}

// -----------------------------------------------------------------------------
// 10. Parser-field status (transparency on what hasn't shipped yet)
// -----------------------------------------------------------------------------

function deriveParserFieldStatus(players) {
  const fields = ['items_sold_gold', 'end_inventory_gold', 'time_spent_dead', 'fight_arrival_time', 'save_events'];
  const rows = fields.map(f => {
    const present = players.some(p => p[f] != null && (typeof p[f] !== 'object' || (Array.isArray(p[f]) ? p[f].length : Object.keys(p[f] || {}).length)));
    return { field: f, populated: present };
  });
  return {
    key: 'match_insights_parser_field_status',
    label: 'Parser Field Status',
    rows,
    summary: `${rows.filter(r => r.populated).length} / ${rows.length} populated`,
    raw: { source: 'player_stats column presence check' },
  };
}

// -----------------------------------------------------------------------------
// Top-level orchestrator
// -----------------------------------------------------------------------------

function deriveAllInsights(match, { fights = [], cohortItemTimings = {}, cohortBuilds = {} } = {}) {
  const players = match?.players || [];
  const timeline = match?.game_timeline || null;
  return [
    deriveLaneGrading(players),
    deriveVisionReport(players),
    deriveItemTimingCohort(players, cohortItemTimings),
    deriveFightParticipation(timeline, players, fights),
    deriveNetWorthSwings(timeline, players),
    deriveSkillBuildVsCohort(players, cohortBuilds),
    deriveDeathContext(players, fights),
    deriveRoshanTimeline(timeline),
    deriveSaveEvents(players),
    deriveParserFieldStatus(players),
  ];
}

// -----------------------------------------------------------------------------
// Persistence: which fields can the backfill derive from existing data?
// -----------------------------------------------------------------------------
//
// Returns { perPlayer: { slot: { lane_outcome, death_context,
//   fight_arrival_time, save_events } } } — keys are nullable when no signal.

function derivePersistableFields(match, { fights = [] } = {}) {
  const lanes = deriveLaneGrading(match.players || []);
  const deaths = deriveDeathContext(match.players || [], fights);
  const fightPart = deriveFightParticipation(match.game_timeline, match.players || [], fights);
  const out = {};
  for (const p of (match.players || [])) {
    out[p.slot] = {
      lane_outcome: lanes.rows.find(r => r.slot === p.slot)?.grade || null,
      death_context: deaths.rows.find(r => r.slot === p.slot)?.classification || null,
      fight_arrival_time: fightPart.rows.find(r => r.slot === p.slot)?.avg_arrival_s ?? null,
      // save_events from parser is pending — we leave the column as-is here.
    };
  }
  return out;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function safeJson(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

module.exports = {
  deriveAllInsights,
  derivePersistableFields,
  deriveLaneGrading,
  deriveVisionReport,
  deriveItemTimingCohort,
  deriveFightParticipation,
  deriveNetWorthSwings,
  deriveSkillBuildVsCohort,
  deriveDeathContext,
  deriveRoshanTimeline,
  deriveSaveEvents,
  deriveParserFieldStatus,
  classifyDeaths,
  POSITIONS,
};
