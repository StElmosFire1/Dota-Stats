const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeTimelinePerf,
  _percentile,
  _resampleByMinute,
  _mapToPi,
  _statWeightsForPosition,
} = require('../src/perf/perfTimeline');

// ── _percentile ─────────────────────────────────────────────────────────────

const FULL_BUCKET = { p10: 100, p25: 200, p50: 300, p75: 400, p90: 500, p99: 600 };

test('_percentile: returns null when bucket is missing or has no p10', () => {
  assert.equal(_percentile(123, null), null);
  assert.equal(_percentile(123, undefined), null);
  assert.equal(_percentile(123, { p25: 200 }), null);
});

test('_percentile: returns null when fewer than two anchors are populated', () => {
  assert.equal(
    _percentile(50, { p10: 100, p25: null, p50: null, p75: null, p90: null, p99: null }),
    null
  );
});

test('_percentile: ramps linearly from 0 up to first anchor when value <= p10', () => {
  // value at p10 returns the anchor's percentile (0.10).
  assert.ok(Math.abs(_percentile(100, FULL_BUCKET) - 0.10) < 1e-9);
  // value at half of p10 returns half of 0.10 = 0.05.
  assert.ok(Math.abs(_percentile(50, FULL_BUCKET) - 0.05) < 1e-9);
  // value at 0 returns 0.
  assert.ok(Math.abs(_percentile(0, FULL_BUCKET)) < 1e-9);
});

test('_percentile: linearly interpolates between adjacent anchors', () => {
  // Midpoint between p25(200) and p50(300) is 250 → percentile 0.375.
  const got = _percentile(250, FULL_BUCKET);
  assert.ok(Math.abs(got - 0.375) < 1e-9, `expected 0.375, got ${got}`);
});

test('_percentile: returns the upper anchor exactly when value equals it', () => {
  assert.ok(Math.abs(_percentile(300, FULL_BUCKET) - 0.50) < 1e-9);
  assert.ok(Math.abs(_percentile(600, FULL_BUCKET) - 0.99) < 1e-9);
});

test('_percentile: above p99 grants small headroom but clamps at 1.05', () => {
  // Just above p99: 0.99 + small bonus.
  const justAbove = _percentile(610, FULL_BUCKET);
  assert.ok(justAbove > 0.99 && justAbove <= 1.05,
    `expected (0.99, 1.05], got ${justAbove}`);
  // Way above p99 must clamp at 1.05.
  assert.ok(Math.abs(_percentile(1e9, FULL_BUCKET) - 1.05) < 1e-9);
});

test('_percentile: handles equal adjacent anchors without dividing by zero', () => {
  const flat = { p10: 100, p25: 200, p50: 200, p75: 200, p90: 500, p99: 600 };
  // Value at the flat region returns the upper anchor's percentile.
  const got = _percentile(200, flat);
  assert.ok(got != null && Number.isFinite(got));
});

// ── _resampleByMinute ───────────────────────────────────────────────────────

test('_resampleByMinute: emits totalMinutes+1 entries (m=0..total)', () => {
  const samples = [{ t: 0, nw: 0 }, { t: 60, nw: 100 }, { t: 120, nw: 250 }];
  const out = _resampleByMinute(samples, 120);
  assert.equal(out.length, 3, 'duration 120s → minutes 0,1,2');
});

test('_resampleByMinute: picks the latest sample at or before each minute mark', () => {
  const samples = [
    { t: 0,   nw: 0   },
    { t: 30,  nw: 50  },  // before m=1
    { t: 60,  nw: 100 },  // exactly m=1
    { t: 90,  nw: 175 },  // before m=2
    { t: 120, nw: 260 },  // exactly m=2
  ];
  const out = _resampleByMinute(samples, 120);
  assert.equal(out[0].nw, 0);
  assert.equal(out[1].nw, 100, 'should pick exact-minute sample, not the 30s one');
  assert.equal(out[2].nw, 260);
});

test('_resampleByMinute: returns null for minute marks before the first sample', () => {
  // Only sample is far in the future; earlier minute marks must report null.
  const samples = [{ t: 600, nw: 9999 }];
  const out = _resampleByMinute(samples, 600);
  assert.equal(out[0], null, 'minute 0 has no at-or-before sample');
  // Cutoff for m=10 is 600s; the sample t=600 is exactly at the cutoff so it
  // is selected (s.t > tCutoff + 30 is false).
  assert.equal(out[10].nw, 9999);
});

test('_resampleByMinute: tolerates unsorted input and missing t fields', () => {
  const samples = [
    { t: 120, nw: 200 },
    { t: 0,   nw: 0   },
    { t: 60,  nw: 100 },
  ];
  const out = _resampleByMinute(samples, 120);
  assert.equal(out[0].nw, 0);
  assert.equal(out[1].nw, 100);
  assert.equal(out[2].nw, 200);
});

// ── _mapToPi ────────────────────────────────────────────────────────────────

test('_mapToPi: raw=0 → 5.0, raw=1 → 9.0 (linear calibration)', () => {
  assert.ok(Math.abs(_mapToPi(0) - 5.0) < 1e-9);
  assert.ok(Math.abs(_mapToPi(1) - 9.0) < 1e-9);
  assert.ok(Math.abs(_mapToPi(0.5) - 7.0) < 1e-9);
});

test('_mapToPi: clamps to [1, 10]', () => {
  assert.equal(_mapToPi(-100), 1.0);
  assert.equal(_mapToPi(100), 10.0);
  // Just above raw=1.25 → 10.0 cap.
  assert.equal(_mapToPi(2), 10.0);
});

// ── computeTimelinePerf — sparse-input guards ───────────────────────────────

function _baseline(p10, p25, p50, p75, p90, p99) {
  return { p10, p25, p50, p75, p90, p99, sample_count: 1000 };
}

// Build baselines that cover every STAT_DEFS key for buckets 1..N. Values are
// chosen so that "average" play yields ≈ p50 and "elite" play exceeds p90.
function _makeBaselines(maxMinute = 60) {
  const perStat = {
    gold:   _baseline(200,  400,  600,  800, 1000, 1500),
    xp:    _baseline(150,  300,  500,  700,  900, 1300),
    cs:     _baseline(1,    2.5,  4,    6,    8,   12),
    denies: _baseline(0,    0.2,  0.5,  1,    1.5, 3),
    k:      _baseline(0,    0.05, 0.15, 0.30, 0.5, 1.0),
    d:      _baseline(0,    0.05, 0.15, 0.30, 0.5, 1.0),
    a:      _baseline(0,    0.10, 0.25, 0.50, 0.8, 1.5),
    nw:     _baseline(500, 1500, 3000, 5000, 8000, 14000),
    obs:    _baseline(0,    0.05, 0.10, 0.20, 0.30, 0.5),
    sen:    _baseline(0,    0.05, 0.10, 0.20, 0.30, 0.5),
    hd_cum: _baseline(100,  200,  400,  600,  900, 1500),
    td_cum: _baseline(0,    20,   60,   150,  300, 600),
    wk_cum: _baseline(0,    0.05, 0.10, 0.25, 0.40, 0.8),
  };
  const out = {};
  for (const [key, base] of Object.entries(perStat)) {
    out[key] = {};
    for (let m = 1; m <= maxMinute; m++) out[key][m] = base;
  }
  return out;
}

// Build a per-minute stat-line for one player. `perMinDeltas` are the per-
// minute increments for delta stats; nw is set absolutely each minute.
function _buildSamples({ minutes, perMinDeltas, nwPerMin }) {
  const samples = [];
  const cum = { gold: 0, xp: 0, cs: 0, denies: 0, k: 0, d: 0, a: 0,
                obs: 0, sen: 0, hd_cum: 0, td_cum: 0, wk_cum: 0 };
  for (let m = 0; m <= minutes; m++) {
    if (m > 0) {
      for (const k of Object.keys(cum)) cum[k] += (perMinDeltas[k] || 0);
    }
    samples.push({
      t: m * 60,
      ...cum,
      nw: typeof nwPerMin === 'function' ? nwPerMin(m) : nwPerMin * m,
    });
  }
  return samples;
}

test('computeTimelinePerf: returns null when fewer than 5 samples are provided', () => {
  const r = computeTimelinePerf({ samples: [{ t: 0 }, { t: 60 }] }, {
    position: 1, durationSec: 600, baselines: _makeBaselines(), teammateSamples: [],
  });
  assert.equal(r, null);
});

test('computeTimelinePerf: returns null when match is shorter than 5 minutes', () => {
  const samples = _buildSamples({
    minutes: 8,
    perMinDeltas: { gold: 500, xp: 500, cs: 4, k: 0.1, d: 0.1, a: 0.2 },
    nwPerMin: 600,
  });
  const r = computeTimelinePerf({ samples }, {
    position: 1, durationSec: 240, baselines: _makeBaselines(), teammateSamples: [],
  });
  assert.equal(r, null, 'totalMinutes < 5 must return null');
});

// ── 1–10 mapping bounds via computeTimelinePerf ────────────────────────────

test('computeTimelinePerf: average play maps near 5.0 and is bounded in [1,10]', () => {
  // Per-minute deltas chosen near the p50 values for each baseline stat.
  const samples = _buildSamples({
    minutes: 30,
    perMinDeltas: { gold: 600, xp: 500, cs: 4, denies: 0.5, k: 0.15, d: 0.15,
                    a: 0.25, obs: 0.10, sen: 0.10, hd_cum: 400, td_cum: 60,
                    wk_cum: 0.10 },
    nwPerMin: 3000,
  });
  const r = computeTimelinePerf({ samples }, {
    position: 3, durationSec: 1800, baselines: _makeBaselines(), teammateSamples: [],
  });
  assert.ok(r, 'average play should produce a result');
  assert.ok(r.perf >= 1.0 && r.perf <= 10.0,
    `perf ${r.perf} out of bounds [1,10]`);
  assert.ok(r.perf >= 4.5 && r.perf <= 5.8,
    `average-on-baseline play should land near 5.0, got ${r.perf}`);
});

test('computeTimelinePerf: elite play across every stat lands near the top of the scale', () => {
  // Crank every per-minute delta well past the p99 anchors. The percentile
  // headroom is clipped at 1.05, so the per-stat score caps at (1.05-0.5)*2 =
  // 1.1; with the win bonus the raw maxes around 1.14 → PI ≈ 9.6.
  const samples = _buildSamples({
    minutes: 30,
    perMinDeltas: { gold: 5000, xp: 5000, cs: 30, denies: 10, k: 5, d: 0,
                    a: 8, obs: 2, sen: 2, hd_cum: 3000, td_cum: 1500,
                    wk_cum: 2 },
    nwPerMin: 30000,
  });
  const r = computeTimelinePerf({ samples }, {
    position: 1, durationSec: 1800, baselines: _makeBaselines(), teammateSamples: [],
    won: true,
  });
  assert.ok(r);
  assert.ok(r.perf >= 9.0 && r.perf <= 10.0,
    `elite play should sit in [9.0, 10.0], got ${r.perf}`);
});

test('computeTimelinePerf: catastrophic play does not drop below the 1.0 floor', () => {
  // Zero everything → every stat sits at the bottom of the percentile ramp.
  const samples = _buildSamples({
    minutes: 30,
    perMinDeltas: {},
    nwPerMin: 0,
  });
  const r = computeTimelinePerf({ samples }, {
    position: 3, durationSec: 1800, baselines: _makeBaselines(), teammateSamples: [],
    won: false,
  });
  assert.ok(r);
  assert.ok(r.perf >= 1.0 && r.perf <= 10.0);
});

// ── Time-weighting (lane stage 1.25×) ──────────────────────────────────────

test('computeTimelinePerf: minutes 0–10 carry 1.25× weight relative to mid/late', () => {
  // Baseline-equal play for the whole game → reference perf.
  const baselines = _makeBaselines(60);
  const baseDeltas = { gold: 600, xp: 500, cs: 4, denies: 0.5, k: 0.15, d: 0.15,
                       a: 0.25, obs: 0.10, sen: 0.10, hd_cum: 400, td_cum: 60,
                       wk_cum: 0.10 };

  // Player A: spikes to elite gold during minutes 1–10 (lane stage), average after.
  // Player B: identical totals but the spike happens during minutes 21–30.
  function buildSpike({ spikeStart, spikeEnd }) {
    const samples = [];
    const cum = { gold: 0, xp: 0, cs: 0, denies: 0, k: 0, d: 0, a: 0,
                  obs: 0, sen: 0, hd_cum: 0, td_cum: 0, wk_cum: 0 };
    for (let m = 0; m <= 30; m++) {
      if (m > 0) {
        for (const k of Object.keys(cum)) cum[k] += (baseDeltas[k] || 0);
        if (m >= spikeStart && m <= spikeEnd) {
          // Elite-tier extra gold/xp this minute.
          cum.gold += 1500;
          cum.xp   += 1200;
        }
      }
      samples.push({ t: m * 60, ...cum, nw: 3000 * m });
    }
    return samples;
  }

  const earlyPlayer = { samples: buildSpike({ spikeStart: 1, spikeEnd: 10 }) };
  const latePlayer  = { samples: buildSpike({ spikeStart: 21, spikeEnd: 30 }) };

  const ctx = { position: 2, durationSec: 1800, baselines, teammateSamples: [], won: false };
  const early = computeTimelinePerf(earlyPlayer, ctx);
  const late  = computeTimelinePerf(latePlayer,  ctx);

  assert.ok(early && late);
  assert.ok(early.perf > late.perf,
    `early-game spike (1.25× weighted) should outscore identical late-game spike: ${early.perf} vs ${late.perf}`);
});

// ── Passive penalty ────────────────────────────────────────────────────────

function _avgTeammates({ minutes, nwPerMin, kPerMin = 0.4 }) {
  // Build N=4 teammate sample arrays whose nw averages to `nwPerMin`*m and
  // whose total kills accumulate at kPerMin per minute, per teammate.
  const teammates = [];
  for (let i = 0; i < 4; i++) {
    teammates.push(_buildSamples({
      minutes,
      perMinDeltas: { gold: 600, xp: 500, cs: 4, k: kPerMin, d: 0, a: 0,
                      obs: 0, sen: 0, hd_cum: 0, td_cum: 0, wk_cum: 0 },
      nwPerMin,
    }));
  }
  return teammates;
}

test('computeTimelinePerf: passive penalty triggers when player is behind on NW AND below 10% KP', () => {
  // Player: tiny NW, zero kills/assists. Teammates: high NW, lots of kills.
  const minutes = 30;
  const passivePlayer = _buildSamples({
    minutes,
    perMinDeltas: { gold: 600, xp: 500, cs: 4, denies: 0.5, k: 0, d: 0, a: 0,
                    obs: 0.10, sen: 0.10, hd_cum: 400, td_cum: 60, wk_cum: 0.10 },
    nwPerMin: 100,    // far below team avg
  });
  const teammates = _avgTeammates({ minutes, nwPerMin: 5000, kPerMin: 0.5 });

  const r = computeTimelinePerf({ samples: passivePlayer }, {
    position: 3, durationSec: minutes * 60, baselines: _makeBaselines(),
    teammateSamples: teammates, won: false,
  });
  assert.ok(r);
  assert.ok(r.breakdown.timeline.penalised_minutes > 0,
    'passive minutes should be flagged for penalty');
  assert.ok(r.breakdown.timeline.total_penalty > 0,
    'total_penalty should be > 0 when penalty triggers');
});

test('computeTimelinePerf: no passive penalty when player keeps up on NW', () => {
  const minutes = 30;
  const carry = _buildSamples({
    minutes,
    perMinDeltas: { gold: 600, xp: 500, cs: 4, k: 0, d: 0, a: 0,
                    hd_cum: 400, td_cum: 60 },
    nwPerMin: 6000, // ahead of team avg
  });
  const teammates = _avgTeammates({ minutes, nwPerMin: 4000, kPerMin: 0.3 });

  const r = computeTimelinePerf({ samples: carry }, {
    position: 1, durationSec: minutes * 60, baselines: _makeBaselines(),
    teammateSamples: teammates, won: true,
  });
  assert.ok(r);
  assert.equal(r.breakdown.timeline.penalised_minutes, 0,
    'NW-ahead player must not be penalised even with low kill participation');
  assert.equal(r.breakdown.timeline.total_penalty, 0);
});

test('computeTimelinePerf: no passive penalty when kill participation >= 10%', () => {
  const minutes = 30;
  // Player: behind on NW, but actively contributing to teamfights.
  const player = _buildSamples({
    minutes,
    perMinDeltas: { gold: 600, xp: 500, cs: 4, k: 0.5, d: 0, a: 0.5,
                    hd_cum: 400, td_cum: 60 },
    nwPerMin: 100,
  });
  // Teammates: high NW but very few kills, so player's KP is well above 10%.
  const teammates = _avgTeammates({ minutes, nwPerMin: 5000, kPerMin: 0.05 });

  const r = computeTimelinePerf({ samples: player }, {
    position: 4, durationSec: minutes * 60, baselines: _makeBaselines(),
    teammateSamples: teammates, won: false,
  });
  assert.ok(r);
  assert.equal(r.breakdown.timeline.penalised_minutes, 0,
    'high-KP player must not trigger passive penalty even when behind on NW');
});

test('computeTimelinePerf: no passive penalty path runs when teammateSamples is empty', () => {
  const minutes = 20;
  const samples = _buildSamples({
    minutes,
    perMinDeltas: { gold: 600, xp: 500, cs: 4, k: 0, d: 0, a: 0 },
    nwPerMin: 100,
  });
  const r = computeTimelinePerf({ samples }, {
    position: 3, durationSec: minutes * 60, baselines: _makeBaselines(),
    teammateSamples: [], won: false,
  });
  assert.ok(r);
  assert.equal(r.breakdown.timeline.penalised_minutes, 0,
    'penalty requires teammate context — no teammates means no penalty');
});

// ── _statWeightsForPosition ────────────────────────────────────────────────

test('_statWeightsForPosition: unknown position falls back to position 3', () => {
  const w0  = _statWeightsForPosition(0);
  const w99 = _statWeightsForPosition(99);
  const w3  = _statWeightsForPosition(3);
  assert.deepEqual(w0,  w3);
  assert.deepEqual(w99, w3);
});

test('_statWeightsForPosition: returns a numeric weight for every STAT_DEFS key', () => {
  const { STAT_DEFS } = require('../src/perf/perfTimeline');
  const w = _statWeightsForPosition(1);
  for (const def of STAT_DEFS) {
    assert.equal(typeof w[def.key], 'number',
      `weight for ${def.key} should be a number`);
    assert.ok(w[def.key] >= 0, `weight for ${def.key} should be non-negative`);
  }
});

// ── computeAndSavePerfForMatch — selection logic ───────────────────────────

const { computeAndSavePerfForMatch } = require('../src/perf/perfService');

function _makeSelectionPool({ matchRow, players, timelineRow, baselineCount }) {
  const updates = [];
  const pool = {
    async query(sql, params) {
      const text = String(sql);
      if (text.startsWith('SELECT match_id, duration')) return { rows: [matchRow] };
      if (text.startsWith('SELECT slot, account_id'))   return { rows: players };
      if (text.includes("game_timeline->'players'"))     return { rows: [timelineRow] };
      if (text.includes('FROM position_baselines'))      return { rows: [{ c: baselineCount }] };
      if (text.includes('SELECT minute_bucket'))         return { rows: [] };
      if (text.startsWith('UPDATE player_stats')) {
        updates.push({ perf: params[0], breakdown: JSON.parse(params[1]), source: params[2], slot: params[4] });
        return { rows: [] };
      }
      throw new Error('unexpected query: ' + text.slice(0, 80));
    },
  };
  return { pool, updates };
}

const SAMPLE_PLAYER = (slot, team) => ({
  slot, account_id: 1000 + slot, team, position: 3,
  kills: 5, deaths: 3, assists: 7, last_hits: 100,
  gpm: 450, xpm: 500, hero_damage: 12000, tower_damage: 1500, hero_healing: 500,
  obs_placed: 3, sen_placed: 2, wards_killed: 1, stun_duration: 5,
});

test('computeAndSavePerfForMatch: falls back to endgame_v1 when match has no timeline samples', async () => {
  const players = [];
  for (let i = 0; i < 5; i++) players.push(SAMPLE_PLAYER(i, 'radiant'));
  for (let i = 0; i < 5; i++) players.push(SAMPLE_PLAYER(5 + i, 'dire'));

  const { pool, updates } = _makeSelectionPool({
    matchRow: { match_id: 'X1', duration: 1800, radiant_win: true },
    players,
    timelineRow: { has_timeline: false, game_timeline: null },
    baselineCount: 5000, // plenty, but doesn't matter without samples
  });

  const r = await computeAndSavePerfForMatch(() => pool, 'X1');
  assert.equal(r.ok, true);
  assert.equal(r.timeline_used, 0);
  assert.equal(updates.length, 10);
  for (const u of updates) {
    assert.equal(u.source, 'endgame_v1');
    // endgame fallback path applies the 8.5 cap.
    assert.ok(u.perf <= 8.5, `endgame_v1 fallback must cap at 8.5, got ${u.perf}`);
  }
});

test('computeAndSavePerfForMatch: falls back to endgame_v1 when baselines table is too sparse', async () => {
  const players = [];
  for (let i = 0; i < 5; i++) players.push(SAMPLE_PLAYER(i, 'radiant'));
  for (let i = 0; i < 5; i++) players.push(SAMPLE_PLAYER(5 + i, 'dire'));

  const { pool, updates } = _makeSelectionPool({
    matchRow: { match_id: 'X2', duration: 1800, radiant_win: true },
    players,
    timelineRow: { has_timeline: true, game_timeline: { players: [] } },
    baselineCount: 10, // below the 200-row threshold → not usable
  });

  const r = await computeAndSavePerfForMatch(() => pool, 'X2');
  assert.equal(r.ok, true);
  assert.equal(r.timeline_used, 0,
    'sparse baselines must force the endgame_v1 fallback path');
  for (const u of updates) {
    assert.equal(u.source, 'endgame_v1');
  }
});

test('computeAndSavePerfForMatch: returns no_match when match id is unknown', async () => {
  const pool = {
    async query(sql) {
      if (String(sql).startsWith('SELECT match_id, duration')) return { rows: [] };
      throw new Error('unexpected query');
    },
  };
  const r = await computeAndSavePerfForMatch(() => pool, 'missing');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_match');
});
