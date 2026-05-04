// End-to-end regression test for timeline_v1 PERF cumulative-field provenance.
//
// The test fixture `tests/fixtures/parser_output_slot0.ndjson` is the *real*
// stdout of the rebuilt Java parser jar (`odota-parser/target/stats-0.1.0.jar`)
// run against the public OpenDota test replay
// (https://odota.github.io/testfiles/1781962623_1.dem). It was filtered down to
// every interval event for slot 0 (every ~30s game-time) plus 300 hero-damage
// combat-log events from that slot's hero, so that every code path used by
// `_aggregateStats` to populate timeline samples (parser-emitted cumulative
// fields AND combat-log accumulators) is exercised against authentic data.
//
// Regeneration recipe (kept for reviewers): run the jar locally, POST the
// .dem to it, then re-run the python filter in this file's commit message.
//
// What this test guards against:
//   1. The Java parser silently dropping `hero_damage_cumulative`,
//      `tower_damage_cumulative`, or `wards_killed_cumulative` from interval
//      entries (e.g. an un-rebuilt jar regression). Asserted directly against
//      the fixture's raw NDJSON.
//   2. The JS aggregator stopping consumption of those fields and silently
//      reverting to the combat-log back-fill path. Asserted by running the
//      fixture through `_aggregateStats` and verifying timeline samples carry
//      the parser-emitted values, not the divergent JS-fallback values.
//   3. The fallback path itself rotting. Asserted by a synthetic stripped-
//      fields run that proves combat-log accumulators still fill samples when
//      the parser-emitted fields are absent.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getReplayParser } = require('../src/replay/replayParser');
const { computeTimelinePerf } = require('../src/perf/perfTimeline');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'parser_output_slot0.ndjson');

function _loadFixture() {
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
  return raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
}

// ── (1) Raw parser-output assertions: jar must emit cumulative fields ──────

test('rebuilt parser jar emits hero_damage_cumulative / tower_damage_cumulative / wards_killed_cumulative on every interval entry', () => {
  const events = _loadFixture();
  const intervals = events.filter(e => e.type === 'interval');
  assert.ok(intervals.length >= 50,
    `fixture should contain a dense interval stream, got ${intervals.length}`);

  let missing = [];
  for (const e of intervals) {
    if (!('hero_damage_cumulative'  in e)) missing.push(['hero_damage_cumulative',  e.time]);
    if (!('tower_damage_cumulative' in e)) missing.push(['tower_damage_cumulative', e.time]);
    if (!('wards_killed_cumulative' in e)) missing.push(['wards_killed_cumulative', e.time]);
  }
  assert.equal(missing.length, 0,
    `parser jar regression: ${missing.length} interval entries are missing cumulative fields. ` +
    `First few: ${JSON.stringify(missing.slice(0, 5))}. ` +
    `If this fails after a parser rebuild, the jar reverted to a version without ` +
    `cumulative-counter emission — see odota-parser/src/main/java/opendota/Parse.java ~L444/L796.`);

  // Cumulative counters must actually accumulate (not be permanently zero —
  // otherwise the field is technically present but useless).
  const maxHd = Math.max(...intervals.map(e => e.hero_damage_cumulative || 0));
  const maxTd = Math.max(...intervals.map(e => e.tower_damage_cumulative || 0));
  assert.ok(maxHd > 0, 'hero_damage_cumulative should accumulate above 0 over a real match');
  assert.ok(maxTd > 0, 'tower_damage_cumulative should accumulate above 0 over a real match');
  // Cumulative counters must be monotonically non-decreasing for a single slot.
  let prevHd = 0, prevTd = 0, prevWk = 0;
  for (const e of intervals.filter(e => (e.time || 0) >= 0)) {
    assert.ok(e.hero_damage_cumulative  >= prevHd,
      `hero_damage_cumulative regressed at t=${e.time}: ${prevHd} → ${e.hero_damage_cumulative}`);
    assert.ok(e.tower_damage_cumulative >= prevTd,
      `tower_damage_cumulative regressed at t=${e.time}: ${prevTd} → ${e.tower_damage_cumulative}`);
    assert.ok(e.wards_killed_cumulative >= prevWk,
      `wards_killed_cumulative regressed at t=${e.time}: ${prevWk} → ${e.wards_killed_cumulative}`);
    prevHd = e.hero_damage_cumulative;
    prevTd = e.tower_damage_cumulative;
    prevWk = e.wards_killed_cumulative;
  }
});

// ── (2) End-to-end: parser intervals → _aggregateStats → timeline samples ──

test('end-to-end: timeline_v1 samples surface parser-emitted cumulative fields, not the JS combat-log back-fill', () => {
  const events = _loadFixture();
  const parser = getReplayParser();
  const r = parser._aggregateStats(events);
  const slot0 = r.gameTimeline.players.find(p => p.slot === 0);
  assert.ok(slot0 && Array.isArray(slot0.samples) && slot0.samples.length > 0,
    'expected slot 0 timeline samples in aggregator output');

  // Build a lookup from interval time → parser-emitted cumulative values, for
  // every interval at or after game start (samples only emit at t >= 0).
  const parserCumByTime = new Map();
  for (const e of events) {
    if (e.type === 'interval' && e.slot === 0 && (e.time || 0) >= 0) {
      parserCumByTime.set(e.time, {
        hd: e.hero_damage_cumulative,
        td: e.tower_damage_cumulative,
        wk: e.wards_killed_cumulative,
      });
    }
  }

  // Independently aggregate combat-log damage from the same fixture so we can
  // prove the back-fill path WOULD have produced different numbers.
  const hdAccum = []; let cumHd = 0;
  const tdAccum = []; let cumTd = 0;
  const TUSK = 'npc_dota_hero_tusk';
  for (const e of events) {
    if (e.type !== 'DOTA_COMBATLOG_DAMAGE' || (e.value || 0) <= 0) continue;
    if (e.attackername !== TUSK || !e.attackerhero || e.attackerillusion) continue;
    if (e.targethero && !e.targetillusion) {
      cumHd += e.value;
      hdAccum.push({ t: e.time || 0, cum: cumHd });
    }
    if (e.targetname && /tower|fort|barracks|rax/.test(e.targetname)) {
      cumTd += e.value;
      tdAccum.push({ t: e.time || 0, cum: cumTd });
    }
  }

  // Helper: combat-log accumulator value at-or-before t.
  function _at(arr, t) {
    let v = 0;
    for (const p of arr) { if (p.t <= t) v = p.cum; else break; }
    return v;
  }

  // For every sample whose timestamp matches a parser interval, the sample's
  // hd_cum / td_cum / wk_cum must equal the parser-emitted value, NOT the
  // combat-log accumulator value (which we expect to differ).
  let matched = 0;
  let provenCombatLogDivergence = false;
  for (const s of slot0.samples) {
    const parserCum = parserCumByTime.get(s.t);
    if (!parserCum) continue; // sample emitted between parser intervals — skip
    matched++;
    assert.equal(s.hd_cum, parserCum.hd,
      `sample t=${s.t}: hd_cum should be parser-emitted ${parserCum.hd}, got ${s.hd_cum}`);
    assert.equal(s.td_cum, parserCum.td,
      `sample t=${s.t}: td_cum should be parser-emitted ${parserCum.td}, got ${s.td_cum}`);
    assert.equal(s.wk_cum, parserCum.wk,
      `sample t=${s.t}: wk_cum should be parser-emitted ${parserCum.wk}, got ${s.wk_cum}`);

    // Whenever the JS combat-log accumulator disagrees with the parser value,
    // record that we proved precedence on real data. The Java parser only
    // counts damage to enemy heroes (not allied-targeting spells like Tusk's
    // Walrus PUNCH on creeps), and the JS-side fallback uses a slightly
    // different filter, so disagreements occur on most real samples.
    const cbLogHd = _at(hdAccum, s.t);
    const cbLogTd = _at(tdAccum, s.t);
    if (cbLogHd !== parserCum.hd || cbLogTd !== parserCum.td) {
      provenCombatLogDivergence = true;
    }
  }
  assert.ok(matched >= 10,
    `expected at least 10 samples to align with parser interval timestamps, got ${matched}`);
  assert.ok(provenCombatLogDivergence,
    'fixture should contain at least one sample where the JS combat-log accumulator differs from the parser-emitted cumulative — otherwise this test cannot prove precedence on real data');
});

// ── (3) PERF computability against parser-emitted values ───────────────────

test('end-to-end: computeTimelinePerf produces a finite in-range score from real parser-emitted samples', () => {
  const events = _loadFixture();
  const parser = getReplayParser();
  const r = parser._aggregateStats(events);
  const tlPlayer = r.gameTimeline.players.find(p => p.slot === 0);
  assert.ok(tlPlayer && tlPlayer.samples.length > 0);

  // Synthesised baselines covering all minute buckets the real samples reach.
  const stat = (p10,p25,p50,p75,p90,p99) => ({ p10,p25,p50,p75,p90,p99,sample_count:1000 });
  const perStat = {
    gold: stat(1000,2000,3000,4000,5000,8000),
    xp:   stat(1200,2400,3600,4800,6000,9000),
    cs:   stat(0.5, 1,    2,   3,    4,   6),
    denies: stat(0, 0.1,  0.3, 0.6,  1,   2),
    k:    stat(0,   0.05, 0.15,0.30, 0.5, 1),
    d:    stat(0,   0.05, 0.15,0.30, 0.5, 1),
    a:    stat(0,   0.10, 0.25,0.50, 0.8, 1.5),
    nw:   stat(1000,2000,3000,5000, 8000,14000),
    obs:  stat(0,   0.05, 0.10,0.20, 0.30,0.5),
    sen:  stat(0,   0.05, 0.10,0.20, 0.30,0.5),
    hd_cum: stat(50, 100, 200, 400,  800, 1500),
    td_cum: stat(0,  10,  30,  100,  300, 600),
    wk_cum: stat(0,  0.05,0.10,0.25, 0.40,0.8),
  };
  const baselines = {};
  const totalMinutes = Math.max(60, Math.floor((r.duration || 1800) / 60) + 5);
  for (const [k, b] of Object.entries(perStat)) {
    baselines[k] = {};
    for (let m = 1; m <= totalMinutes; m++) baselines[k][m] = b;
  }

  const result = computeTimelinePerf(tlPlayer, {
    position: 4,
    durationSec: r.duration,
    baselines,
    teammateSamples: [],
    won: false,
  });
  assert.ok(result, 'timeline PERF should be computable from real parser-emitted samples');
  assert.ok(result.perf >= 1.0 && result.perf <= 10.0,
    `perf ${result.perf} out of [1,10]`);
  assert.ok(result.breakdown.timeline.scored_minutes >= 5);
});

// ── (4) Fallback-path sentinel: when parser fields are stripped, JS back-fill kicks in ──

test('regression sentinel: stripping cumulative fields from interval entries forces the JS combat-log back-fill (proves the two paths still diverge)', () => {
  const events = _loadFixture();
  const parser = getReplayParser();

  // Reference run on unmodified fixture.
  const baseline = parser._aggregateStats(events);
  const baseSamples = baseline.gameTimeline.players.find(p => p.slot === 0).samples;

  // Stripped run: deep-clone interval events with cumulative fields removed.
  const stripped = events.map(e => {
    if (e.type !== 'interval') return e;
    const c = { ...e };
    delete c.hero_damage_cumulative;
    delete c.tower_damage_cumulative;
    delete c.wards_killed_cumulative;
    return c;
  });
  const fallback = parser._aggregateStats(stripped);
  const fbSamples = fallback.gameTimeline.players.find(p => p.slot === 0).samples;

  assert.equal(baseSamples.length, fbSamples.length,
    'sample counts must be identical between the two runs (only the cumulative fields differ)');

  // The two runs must NOT produce identical hd_cum/td_cum sequences. If they
  // do, the JS fallback never ran (or — worse — the parser-emitted path was
  // never used) and the precedence assertion in test (2) is vacuous.
  const baseHd = baseSamples.map(s => s.hd_cum).join(',');
  const fbHd   = fbSamples.map(s => s.hd_cum).join(',');
  const baseTd = baseSamples.map(s => s.td_cum).join(',');
  const fbTd   = fbSamples.map(s => s.td_cum).join(',');
  assert.notEqual(baseHd, fbHd,
    'parser-emitted hd_cum sequence must differ from combat-log fallback sequence');
  assert.notEqual(baseTd, fbTd,
    'parser-emitted td_cum sequence must differ from combat-log fallback sequence');

  // Final defaults: even when both parser fields and combat-log events are
  // missing for a slot, samples must end up with numeric (not null) values
  // so downstream PERF math doesn't NaN out. Verified on the stripped run's
  // very first sample (before any combat-log damage has accumulated).
  const firstFb = fbSamples.find(s => s.t >= 0);
  assert.ok(firstFb);
  assert.equal(typeof firstFb.hd_cum, 'number');
  assert.equal(typeof firstFb.td_cum, 'number');
  assert.equal(typeof firstFb.wk_cum, 'number');
});
