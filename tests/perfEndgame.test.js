const test = require('node:test');
const assert = require('node:assert/strict');

const { computePerfForPlayer } = require('../src/perf/perfService');
const {
  targetsForPosition,
  normTarget,
  POSITION_TARGETS,
  POSITION_WEIGHTS,
} = require('../src/perf/perfWeights.config');
const { computeAndSavePerfForMatch } = require('../src/perf/perfService');

// ── Position-target lookup fallback ─────────────────────────────────────────

test('targetsForPosition: unknown / missing position falls back to position 3 (offlane)', () => {
  const ref = targetsForPosition(3);
  for (const pos of [undefined, null, 0, -1, 6, 99, 'mid']) {
    const got = targetsForPosition(pos);
    assert.equal(got.position, 3, `position=${pos} should fall back to 3`);
    assert.deepEqual(got.targets, ref.targets);
    assert.deepEqual(got.weights, ref.weights);
  }
});

test('targetsForPosition: positions 1..5 return their own targets and weights', () => {
  for (let pos = 1; pos <= 5; pos++) {
    const got = targetsForPosition(pos);
    assert.equal(got.position, pos);
    assert.equal(got.targets, POSITION_TARGETS[pos]);
    assert.equal(got.weights, POSITION_WEIGHTS[pos]);
  }
});

// ── normTarget bounds ───────────────────────────────────────────────────────

test('normTarget: null/zero-span targets return 0 instead of dividing by zero', () => {
  assert.equal(normTarget(123, null), 0);
  assert.equal(normTarget(123, undefined), 0);
  assert.equal(normTarget(123, { avg: 100, elite: 100 }), 0);
  assert.equal(normTarget(123, { avg: 200, elite: 100 }), 0);
});

test('normTarget: returns 0 at avg, 1 at elite, clamps to [-0.5, 1.4]', () => {
  const t = { avg: 100, elite: 200 };
  assert.equal(normTarget(100, t), 0);
  assert.equal(normTarget(200, t), 1);
  assert.equal(normTarget(150, t), 0.5);
  // Way above elite → clamps at 1.4.
  assert.equal(normTarget(10000, t), 1.4);
  // Way below avg → clamps at -0.5.
  assert.equal(normTarget(-10000, t), -0.5);
});

// ── computePerfForPlayer: helpers ──────────────────────────────────────────

// Build a player whose every per-minute stat sits exactly at the position's
// AVG target. With avg = 0, raw should sum to 0 and PI should round to 5.0.
function _avgPlayer(position, durationSec) {
  const t = POSITION_TARGETS[position];
  const minutes = durationSec / 60;
  return {
    position,
    kills:        Math.round(t.kpm.avg      * minutes),
    deaths:       Math.round(0.20           * minutes), // dpm at survScore=0 boundary
    assists:      0,
    last_hits:    Math.round(t.lhpm.avg     * minutes),
    gpm:          t.gpm.avg,
    xpm:          t.xpm.avg,
    hero_damage:  Math.round(t.hdpm.avg     * minutes),
    tower_damage: Math.round(t.tdpm.avg     * minutes),
    hero_healing: Math.round(t.healpm.avg   * minutes),
    obs_placed:   Math.round(t.obspm.avg    * minutes),
    sen_placed:   Math.round(t.senpm.avg    * minutes),
    wards_killed: Math.round(t.dewardpm.avg * minutes),
    stun_duration:Math.round(t.stunpm.avg   * minutes),
  };
}

// ── Per-minute normalisation against duration ──────────────────────────────

test('computePerfForPlayer: per-minute normalisation against duration — same per-minute rate scores identically across game lengths', () => {
  // Same per-minute production but different durations should normalise to the
  // same per-stat scores (and identical PI), since scoring is purely per-minute.
  const player20 = {
    position: 3, kills: 4, deaths: 4, assists: 8, last_hits: 60,
    gpm: 380, xpm: 460, hero_damage: 5600, tower_damage: 1400, hero_healing: 400,
    obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0,
  };
  const player60 = {
    position: 3, kills: 12, deaths: 12, assists: 24, last_hits: 180,
    gpm: 380, xpm: 460, hero_damage: 16800, tower_damage: 4200, hero_healing: 1200,
    obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0,
  };
  const r20 = computePerfForPlayer(player20, { durationSec: 1200, teamKills: 16, won: false });
  const r60 = computePerfForPlayer(player60, { durationSec: 3600, teamKills: 48, won: false });
  // The per-stat normalised scores should match exactly.
  assert.deepEqual(r20.breakdown.scores, r60.breakdown.scores,
    `same per-minute production should yield identical scores across durations`);
  assert.equal(r20.perf, r60.perf);
});

test('computePerfForPlayer: durationSec is floored at 60s to prevent divide-by-tiny', () => {
  // durationSec=0 must not produce Infinity/NaN — caller floors at 60.
  const p = { position: 3, kills: 1, deaths: 0, assists: 1, last_hits: 1,
              gpm: 380, xpm: 460, hero_damage: 100, tower_damage: 0, hero_healing: 0,
              obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 };
  const r0 = computePerfForPlayer(p, { durationSec: 0, teamKills: 1, won: false });
  const r60 = computePerfForPlayer(p, { durationSec: 60, teamKills: 1, won: false });
  assert.ok(Number.isFinite(r0.perf));
  assert.ok(r0.perf >= 1.0 && r0.perf <= 10.0);
  assert.equal(r0.perf, r60.perf, 'durationSec=0 should be treated as 60');
});

// ── Kill participation when teamKills=0 ────────────────────────────────────

test('computePerfForPlayer: kill-participation clamps at the -0.5 floor when teamKills=0 (no division by zero)', () => {
  const p = { position: 3, kills: 4, deaths: 2, assists: 6, last_hits: 50,
              gpm: 380, xpm: 460, hero_damage: 8000, tower_damage: 1400, hero_healing: 0,
              obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 };
  const r = computePerfForPlayer(p, { durationSec: 1800, teamKills: 0, won: false });
  // kpScore should be normTarget(0, apm_kp) for pos 3 = (0 - 0.55) / (0.85 - 0.55) ≈ -1.83 → clamped -0.5.
  assert.equal(r.breakdown.scores.kp, -0.5,
    'teamKills=0 → kpRaw=0 → normalised kp should clamp at the -0.5 floor');
  assert.ok(Number.isFinite(r.perf));
});

test('computePerfForPlayer: kill participation is bounded by normTarget cap (1.4) even when (k+a)>teamKills', () => {
  // Player with k+a > teamKills (e.g. assists overlap) — kpRaw can exceed 1.0
  // but normTarget caps the score at 1.4.
  const p = { position: 2, kills: 10, deaths: 1, assists: 10, last_hits: 200,
              gpm: 600, xpm: 700, hero_damage: 25000, tower_damage: 4000, hero_healing: 0,
              obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 };
  const r = computePerfForPlayer(p, { durationSec: 1800, teamKills: 15, won: true });
  assert.ok(r.breakdown.scores.kp <= 1.4 + 1e-9);
});

// ── Survival score floor / ceiling at dpm extremes ────────────────────────

test('computePerfForPlayer: survival score hits 1.0 at very low dpm (≤0.05) — capped above by normTarget cap (1.4)', () => {
  // Zero deaths over 30 minutes → dpm = 0 → survScore = (0.20 - 0) / 0.15 = 1.333...
  const p = { position: 1, kills: 5, deaths: 0, assists: 5, last_hits: 240,
              gpm: 480, xpm: 520, hero_damage: 10500, tower_damage: 2700, hero_healing: 0,
              obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 };
  const r = computePerfForPlayer(p, { durationSec: 1800, teamKills: 20, won: true });
  // Allowed up to 1.4 cap.
  assert.ok(r.breakdown.scores.surv > 1.0 && r.breakdown.scores.surv <= 1.4 + 1e-9,
    `low-dpm survScore should be in (1.0, 1.4], got ${r.breakdown.scores.surv}`);
});

test('computePerfForPlayer: survival score hits the -0.5 floor when dpm is catastrophic', () => {
  // 30 deaths in 30 minutes → dpm = 1.0 → (0.20 - 1.0)/0.15 ≈ -5.33 → clamped at -0.5.
  const p = { position: 3, kills: 0, deaths: 30, assists: 0, last_hits: 0,
              gpm: 100, xpm: 100, hero_damage: 0, tower_damage: 0, hero_healing: 0,
              obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 };
  const r = computePerfForPlayer(p, { durationSec: 1800, teamKills: 0, won: false });
  assert.equal(r.breakdown.scores.surv, -0.5,
    `catastrophic dpm should clamp survScore at -0.5`);
});

test('computePerfForPlayer: survival score is exactly 0 at dpm = 0.20 (avg boundary)', () => {
  // 6 deaths in 30 minutes → dpm = 0.20 → survScore = 0 exactly.
  const p = { position: 3, kills: 1, deaths: 6, assists: 1, last_hits: 60,
              gpm: 380, xpm: 460, hero_damage: 5600, tower_damage: 1400, hero_healing: 0,
              obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 };
  const r = computePerfForPlayer(p, { durationSec: 1800, teamKills: 5, won: false });
  assert.ok(Math.abs(r.breakdown.scores.surv) < 1e-9,
    `survScore at dpm=0.20 should be 0, got ${r.breakdown.scores.surv}`);
});

// ── Vision / deward / heal weighting ──────────────────────────────────────

test('computePerfForPlayer: vision uses combined obs+sen avg/elite (not each separately)', () => {
  // For position 5, obs+sen avg = 0.44, elite = 1.00 (per minute combined).
  // Place obs+sen at exactly 0.44/min → vision score should be 0.
  const minutes = 30;
  const t5 = POSITION_TARGETS[5];
  const visAvg = t5.obspm.avg + t5.senpm.avg;
  const p = { position: 5, kills: 1, deaths: 4, assists: 8, last_hits: 30,
              gpm: 240, xpm: 320, hero_damage: 5400, tower_damage: 900, hero_healing: 1800,
              obs_placed: Math.round(t5.obspm.avg * minutes),
              sen_placed: Math.round(t5.senpm.avg * minutes),
              wards_killed: 0, stun_duration: 0 };
  const r = computePerfForPlayer(p, { durationSec: minutes * 60, teamKills: 14, won: false });
  // obs+sen at combined avg → vis score ~0. Allow small rounding from Math.round above.
  assert.ok(Math.abs(r.breakdown.scores.vis) < 0.05,
    `vision at combined-avg placement should score ~0, got ${r.breakdown.scores.vis}`);
  // visAvg used by the implementation matches the position-config sum.
  assert.equal(visAvg, 0.44);
});

test('computePerfForPlayer: deward and heal each contribute via their per-position weights', () => {
  // Hard support with elite deward and elite heal: those two stats combined
  // should push raw upward enough to lift the player above 5.0.
  const minutes = 30;
  const t5 = POSITION_TARGETS[5];
  const player = { position: 5, kills: 1, deaths: 6, assists: 8, last_hits: 30,
                   gpm: 240, xpm: 320,
                   hero_damage: 5400, tower_damage: 900,
                   hero_healing: Math.round(t5.healpm.elite * minutes),
                   obs_placed: 0, sen_placed: 0,
                   wards_killed: Math.round(t5.dewardpm.elite * minutes),
                   stun_duration: 0 };
  const r = computePerfForPlayer(player, { durationSec: minutes * 60, teamKills: 14, won: false });
  // Heal score should be ~1, deward score ~1.
  assert.ok(r.breakdown.scores.heal >= 0.95 && r.breakdown.scores.heal <= 1.05,
    `elite heal should normalise to ~1.0, got ${r.breakdown.scores.heal}`);
  assert.ok(r.breakdown.scores.deward >= 0.95 && r.breakdown.scores.deward <= 1.05,
    `elite deward should normalise to ~1.0, got ${r.breakdown.scores.deward}`);
  // Their individual contributions should respect the per-position weights.
  const w = POSITION_WEIGHTS[5];
  assert.ok(Math.abs(r.breakdown.contributions.heal - r.breakdown.scores.heal * w.heal) < 1e-3);
  assert.ok(Math.abs(r.breakdown.contributions.deward - r.breakdown.scores.deward * w.deward) < 1e-3);
});

// ── Win bonus ──────────────────────────────────────────────────────────────

test('computePerfForPlayer: win bonus adds exactly weights.win to raw — losers get 0', () => {
  const baseP = _avgPlayer(3, 1800);
  const teamK = baseP.kills * 5; // kpRaw will be 0.2 — close to baseline
  const lose = computePerfForPlayer(baseP, { durationSec: 1800, teamKills: teamK, won: false });
  const win  = computePerfForPlayer(baseP, { durationSec: 1800, teamKills: teamK, won: true  });
  assert.equal(lose.breakdown.scores.win, 0);
  assert.equal(win.breakdown.scores.win, 1);
  // Winner's win contribution equals POSITION_WEIGHTS[3].win exactly.
  assert.ok(Math.abs(win.breakdown.contributions.win - POSITION_WEIGHTS[3].win) < 1e-9);
  assert.ok(Math.abs(lose.breakdown.contributions.win) < 1e-9);
  // Winning lifts raw by exactly the win weight.
  assert.ok(Math.abs((win.breakdown.raw - lose.breakdown.raw) - POSITION_WEIGHTS[3].win) < 1e-3);
});

// ── 1–10 mapping bounds ────────────────────────────────────────────────────

test('computePerfForPlayer: catastrophic stat-line never drops below the 1.0 floor', () => {
  const p = { position: 3, kills: 0, deaths: 30, assists: 0, last_hits: 0,
              gpm: 0, xpm: 0, hero_damage: 0, tower_damage: 0, hero_healing: 0,
              obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 };
  const r = computePerfForPlayer(p, { durationSec: 1800, teamKills: 0, won: false });
  assert.ok(r.perf >= 1.0 && r.perf <= 10.0,
    `floor-extreme perf must be in [1, 10], got ${r.perf}`);
  // All stats well below average, plus catastrophic survival, should sit
  // comfortably below the 5.0 baseline.
  assert.ok(r.perf < 5.0,
    `floor stat-line should be well below 5.0, got ${r.perf}`);
});

test('computePerfForPlayer: across-the-board-elite stat-line is bounded by the 10.0 ceiling', () => {
  // Crank every per-minute stat well past elite for a mid player. With
  // per-stat cap 1.4 and weights summing to 1.0, max raw ≈ 1.4 → PI 10.6 →
  // clipped to 10.
  const minutes = 30;
  const t = POSITION_TARGETS[2];
  const p = { position: 2, kills: 30, deaths: 0, assists: 30, last_hits: 9999,
              gpm: t.gpm.elite * 2, xpm: t.xpm.elite * 2,
              hero_damage:  Math.round(t.hdpm.elite  * 3 * minutes),
              tower_damage: Math.round(t.tdpm.elite  * 3 * minutes),
              hero_healing: Math.round(t.healpm.elite* 3 * minutes),
              obs_placed:   Math.round(t.obspm.elite * 3 * minutes),
              sen_placed:   Math.round(t.senpm.elite * 3 * minutes),
              wards_killed: Math.round(t.dewardpm.elite* 3 * minutes),
              stun_duration:Math.round(t.stunpm.elite* 3 * minutes) };
  const r = computePerfForPlayer(p, { durationSec: minutes * 60, teamKills: 30, won: true });
  assert.ok(r.perf >= 1.0 && r.perf <= 10.0,
    `ceiling-extreme perf must be in [1, 10], got ${r.perf}`);
  assert.equal(r.perf, 10.0,
    `all-elite stat-line should reach the 10.0 ceiling`);
});

test('computePerfForPlayer: average stat-line maps near 5.0 baseline', () => {
  // _avgPlayer puts every stat at AVG; dpm is 0.20 (survScore=0); kp depends
  // on teamKills. Pick teamK so kpRaw matches the position avg (0.55 for pos 3).
  // _avgPlayer gives kills = 6 (0.20*30) and assists=0; for kpRaw=0.55 we need
  // teamK = (k+a)/0.55 = 6/0.55 ≈ 11.
  const p = _avgPlayer(3, 1800);
  const r = computePerfForPlayer(p, { durationSec: 1800, teamKills: Math.round((p.kills + p.assists) / 0.55), won: false });
  // Raw should be very close to 0 → PI ≈ 5.0. Allow ±0.5 for rounding/integer
  // rounding in stat-line construction.
  assert.ok(r.perf >= 4.5 && r.perf <= 5.5,
    `all-avg player should land near 5.0, got ${r.perf}`);
});

// ── Output shape ───────────────────────────────────────────────────────────

test('computePerfForPlayer: returns rounded perf to 1 decimal and a fully-populated breakdown', () => {
  const p = _avgPlayer(2, 1800);
  const r = computePerfForPlayer(p, { durationSec: 1800, teamKills: 12, won: true });
  // perf should be a multiple of 0.1.
  assert.ok(Math.abs(r.perf * 10 - Math.round(r.perf * 10)) < 1e-9,
    `perf should be rounded to 1 decimal place, got ${r.perf}`);
  assert.equal(r.breakdown.position, 2);
  for (const key of ['kp', 'surv', 'gpm', 'xpm', 'lh', 'hd', 'td', 'vis', 'deward', 'stun', 'heal', 'win']) {
    assert.ok(typeof r.breakdown.scores[key] === 'number', `scores.${key} missing`);
    assert.ok(typeof r.breakdown.contributions[key] === 'number', `contributions.${key} missing`);
  }
  assert.equal(r.breakdown.weights, POSITION_WEIGHTS[2]);
});

// ── 8.5 cap applied by computeAndSavePerfForMatch for endgame_v1 ──────────

function _makeEndgamePool({ matchRow, players }) {
  const updates = [];
  const pool = {
    async query(sql, params) {
      const text = String(sql);
      if (text.startsWith('SELECT match_id, duration')) return { rows: [matchRow] };
      if (text.startsWith('SELECT slot, account_id'))   return { rows: players };
      if (text.includes("game_timeline->'players'"))     return { rows: [{ has_timeline: false, game_timeline: null }] };
      if (text.startsWith('UPDATE player_stats')) {
        updates.push({ perf: params[0], breakdown: JSON.parse(params[1]), source: params[2], slot: params[4] });
        return { rows: [] };
      }
      throw new Error('unexpected query: ' + text.slice(0, 80));
    },
  };
  return { pool, updates };
}

test('computeAndSavePerfForMatch (endgame_v1): caps stored perf at 8.5 even when raw computation exceeds it', () => {
  // Build one all-elite player whose computePerfForPlayer would return 10.0.
  // The persisted/stored perf must be capped at 8.5 because the timeline path
  // wasn't used. Run synchronously inside a test by using await.
  return (async () => {
    const minutes = 30;
    const t = POSITION_TARGETS[2];
    const elitePlayer = {
      slot: 0, account_id: 1, team: 'radiant', position: 2,
      kills: 30, deaths: 0, assists: 30, last_hits: 9999,
      gpm: t.gpm.elite * 2, xpm: t.xpm.elite * 2,
      hero_damage:  Math.round(t.hdpm.elite  * 3 * minutes),
      tower_damage: Math.round(t.tdpm.elite  * 3 * minutes),
      hero_healing: Math.round(t.healpm.elite* 3 * minutes),
      obs_placed:   Math.round(t.obspm.elite * 3 * minutes),
      sen_placed:   Math.round(t.senpm.elite * 3 * minutes),
      wards_killed: Math.round(t.dewardpm.elite* 3 * minutes),
      stun_duration:Math.round(t.stunpm.elite* 3 * minutes),
    };
    // Filler players so teamKills isn't trivially zero.
    const players = [elitePlayer];
    for (let i = 1; i < 5; i++) {
      players.push({ slot: i, account_id: 100 + i, team: 'radiant', position: 3,
                     kills: 0, deaths: 0, assists: 5, last_hits: 0, gpm: 0, xpm: 0,
                     hero_damage: 0, tower_damage: 0, hero_healing: 0,
                     obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 });
    }
    for (let i = 5; i < 10; i++) {
      players.push({ slot: i, account_id: 200 + i, team: 'dire', position: 3,
                     kills: 0, deaths: 0, assists: 0, last_hits: 0, gpm: 0, xpm: 0,
                     hero_damage: 0, tower_damage: 0, hero_healing: 0,
                     obs_placed: 0, sen_placed: 0, wards_killed: 0, stun_duration: 0 });
    }
    const { pool, updates } = _makeEndgamePool({
      matchRow: { match_id: 'CAP1', duration: minutes * 60, radiant_win: true },
      players,
    });
    const r = await computeAndSavePerfForMatch(() => pool, 'CAP1');
    assert.equal(r.ok, true);
    const eliteUpdate = updates.find(u => u.slot === 0);
    assert.ok(eliteUpdate);
    assert.equal(eliteUpdate.source, 'endgame_v1');
    assert.equal(eliteUpdate.perf, 8.5,
      `endgame_v1 elite player must be capped at 8.5, got ${eliteUpdate.perf}`);
    assert.equal(eliteUpdate.breakdown.cap_applied, 8.5,
      `breakdown.cap_applied should record the 8.5 cap when it is applied`);
    assert.equal(eliteUpdate.breakdown.source, 'endgame_v1');
  })();
});

test('computeAndSavePerfForMatch (endgame_v1): does not cap when raw perf is already <= 8.5', () => {
  return (async () => {
    const players = [];
    for (let i = 0; i < 5; i++) {
      players.push({ slot: i, account_id: 1000 + i, team: 'radiant', position: 3,
                     kills: 5, deaths: 6, assists: 7, last_hits: 60,
                     gpm: 380, xpm: 460, hero_damage: 8400, tower_damage: 2100, hero_healing: 600,
                     obs_placed: 1, sen_placed: 1, wards_killed: 1, stun_duration: 5 });
    }
    for (let i = 5; i < 10; i++) {
      players.push({ slot: i, account_id: 2000 + i, team: 'dire', position: 3,
                     kills: 5, deaths: 6, assists: 7, last_hits: 60,
                     gpm: 380, xpm: 460, hero_damage: 8400, tower_damage: 2100, hero_healing: 600,
                     obs_placed: 1, sen_placed: 1, wards_killed: 1, stun_duration: 5 });
    }
    const { pool, updates } = _makeEndgamePool({
      matchRow: { match_id: 'NOCAP', duration: 1800, radiant_win: true },
      players,
    });
    const r = await computeAndSavePerfForMatch(() => pool, 'NOCAP');
    assert.equal(r.ok, true);
    for (const u of updates) {
      assert.equal(u.source, 'endgame_v1');
      assert.ok(u.perf <= 8.5);
      // For these middling stat-lines, raw perf is well under the cap, so
      // cap_applied should be null.
      assert.equal(u.breakdown.cap_applied, null,
        `cap_applied should be null when stored perf is below the 8.5 cap`);
    }
  })();
});
