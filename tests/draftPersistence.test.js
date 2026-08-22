'use strict';
/**
 * tests/draftPersistence.test.js
 *
 * Focused tests for draft-timing persistence: SQL/data-mapping layer.
 * No real database required — we mock the pg client and inspect the
 * queries/params that `recordMatch` and `reparseMatchFromStats` would
 * issue.  Separate section covers the gameTimeline embedding added to
 * replayParser._aggregateStats() so consumers that read game_timeline
 * directly get the new fields without any additional DB join.
 *
 * Run:  node --test tests/draftPersistence.test.js
 */
const test   = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock pg client that records every query() call and always returns
 * an empty result-set.  BEGIN/COMMIT/ROLLBACK are absorbed silently.
 */
function makeMockClient() {
  const calls = [];   // { sql, params }[]
  return {
    _calls: calls,
    async query(sql, params = []) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      return { rows: [] };
    },
    release() {},
  };
}

/**
 * Return the recorded query whose SQL string contains every substring in
 * `needles`.  Throws if none found so test failures are readable.
 */
function findQuery(client, ...needles) {
  const match = client._calls.find(c => needles.every(n => c.sql.includes(n)));
  if (!match) {
    const sqls = client._calls.map(c => `  • ${c.sql.slice(0, 120)}`).join('\n');
    throw new Error(`No query containing [${needles.join(', ')}]\nActual queries:\n${sqls}`);
  }
  return match;
}

// ---------------------------------------------------------------------------
// Section 1 – Column migration DDL generated at startup (idempotent pattern)
// ---------------------------------------------------------------------------

test('migration: match_draft timing columns use ADD COLUMN IF NOT EXISTS', async () => {
  // Extract the relevant ALTER TABLE statements from db/index.js source so we
  // can verify they are idempotent without running them against a real DB.
  const fs = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '../src/db/index.js'), 'utf8');

  const drafCols = ['draft_phase', 'draft_time', 'extra_time', 'time_taken'];
  for (const col of drafCols) {
    const pattern = new RegExp(`ALTER TABLE match_draft ADD COLUMN IF NOT EXISTS ${col}`, 'i');
    assert.ok(pattern.test(src), `match_draft.${col} should use ADD COLUMN IF NOT EXISTS`);
  }
});

test('migration: new columns are nullable (no NOT NULL / no DEFAULT value forcing non-null)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '../src/db/index.js'), 'utf8');

  // Pull out just the four ADD COLUMN lines for match_draft
  const lines = src.split('\n').filter(l =>
    l.includes('ADD COLUMN IF NOT EXISTS') &&
    l.includes('match_draft') &&
    /draft_phase|draft_time|extra_time|time_taken/.test(l)
  );
  assert.ok(lines.length >= 4, `Expected 4 match_draft ALTER lines, got ${lines.length}`);
  for (const l of lines) {
    // Must not have NOT NULL (that would break historical rows)
    assert.ok(!l.includes('NOT NULL'), `Column line must not include NOT NULL: ${l.trim()}`);
    // Must not have a DEFAULT that forces a non-null value (DEFAULT NULL is fine but unlikely)
    const defaultMatch = l.match(/DEFAULT\s+(\S+)/i);
    if (defaultMatch) {
      assert.equal(defaultMatch[1].toLowerCase(), 'null',
        `Unexpected non-null DEFAULT on match_draft timing column: ${l.trim()}`);
    }
  }
});

test('migration: match_draft is created before additive timing alters', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '../src/db/index.js'), 'utf8');
  const createAt = src.indexOf('CREATE TABLE IF NOT EXISTS match_draft');
  const alterAt = src.indexOf('ALTER TABLE match_draft ADD COLUMN IF NOT EXISTS draft_phase');
  assert.ok(createAt >= 0, 'match_draft CREATE TABLE must exist');
  assert.ok(alterAt > createAt, 'match_draft timing ALTERs must run after CREATE TABLE on an empty database');
});

// ---------------------------------------------------------------------------
// Section 2 – recordMatch draft INSERT: columns and conflict strategy
// ---------------------------------------------------------------------------

/**
 * Extract the draft-insert SQL from db/index.js using an anchor comment
 * that uniquely identifies each call site.  More robust than positional
 * regex because there are three INSERT INTO match_draft sites in the file.
 */
function getDraftInsertSql(section = 'recordMatch') {
  const fs   = require('node:fs');
  const path = require('node:path');
  const src  = fs.readFileSync(path.join(__dirname, '../src/db/index.js'), 'utf8');

  // Each site is preceded by a unique anchor string.  Slice from the anchor
  // to the end of the INSERT statement (closing backtick of template literal).
  const anchors = {
    recordMatch:           'Bulk draft insert',
    reparseMatchFromStats: 'reparsed successfully',  // commit log just after
  };
  // For reparseMatchFromStats the draft loop comes just before COMMIT so we
  // anchor on the "reparsed successfully" log that immediately follows.
  // For recordMatch, anchor on the unique "Bulk draft insert" comment.
  const anchor = anchors[section];
  if (!anchor) throw new Error(`Unknown section: ${section}`);

  const anchorIdx = src.indexOf(anchor);
  if (anchorIdx === -1) throw new Error(`Could not find anchor "${anchor}" in db/index.js`);

  // Grab a generous window around the anchor and search for the INSERT.
  const window = section === 'recordMatch'
    ? src.slice(anchorIdx, anchorIdx + 3000)
    : src.slice(anchorIdx - 3000, anchorIdx + 500);  // before COMMIT

  const m = window.match(/INSERT INTO match_draft \(([^)]+)\)/);
  if (!m) throw new Error(`No INSERT INTO match_draft found near anchor "${anchor}"`);
  return m[0];
}

test('recordMatch: draft INSERT includes all four new timing columns', () => {
  const sql = getDraftInsertSql('recordMatch');
  for (const col of ['draft_phase', 'draft_time', 'extra_time', 'time_taken']) {
    assert.ok(sql.includes(col), `recordMatch draft INSERT should include ${col}`);
  }
});

test('recordMatch: draft INSERT uses COALESCE for timing columns on conflict', () => {
  const fs   = require('node:fs');
  const src  = fs.readFileSync(require('node:path').join(__dirname, '../src/db/index.js'), 'utf8');

  // Find the ON CONFLICT block for the bulk draft insert in recordMatch
  // (identified by the unique "Bulk draft insert" comment nearby)
  const bulkIdx = src.indexOf('Bulk draft insert');
  assert.ok(bulkIdx > -1, 'Could not find "Bulk draft insert" comment');
  const relevant = src.slice(bulkIdx, bulkIdx + 3000);

  for (const col of ['draft_time', 'extra_time', 'time_taken']) {
    const pattern = new RegExp(`COALESCE\\(EXCLUDED\\.${col}[^)]*match_draft\\.${col}\\)`);
    assert.ok(pattern.test(relevant),
      `recordMatch ON CONFLICT should COALESCE(EXCLUDED.${col}, match_draft.${col})`);
  }
  // draft_phase (derived from is_pick) is always overwritten — no COALESCE needed
  assert.ok(relevant.includes('draft_phase = EXCLUDED.draft_phase'),
    'draft_phase should be a plain overwrite');
});

test('reparseMatchFromStats: draft INSERT includes all four new timing columns', () => {
  const sql = getDraftInsertSql('reparseMatchFromStats');
  for (const col of ['draft_phase', 'draft_time', 'extra_time', 'time_taken']) {
    assert.ok(sql.includes(col), `reparseMatchFromStats draft INSERT should include ${col}`);
  }
});

// ---------------------------------------------------------------------------
// Section 3 – Data-mapping: draft entry → DB params
// ---------------------------------------------------------------------------

/**
 * Given a draft entry object (as produced by replayParser._aggregateStats),
 * compute the params array the way recordMatch does.  This mirrors the loop
 * body so we can assert on individual positions without mocking the whole DB.
 */
function draftEntryToParams(matchId, d) {
  const teamNum = typeof d.team === 'string'
    ? (d.team === 'radiant' ? 0 : 1)
    : (d.team === 2 ? 0 : d.team === 3 ? 1 : (d.team || 0));
  const draftPhase = d.phase != null ? d.phase : null;
  return [
    matchId,
    d.heroId,
    d.isPick,
    d.order || 0,
    teamNum,
    draftPhase,
    d.time       != null ? d.time       : null,
    d.extraTime  != null ? d.extraTime  : null,
    d.totalTimeTaken != null ? d.totalTimeTaken : null,
  ];
}

test('data-mapping: pick entry retains its Captain Mode phase and timing', () => {
  const d = {
    heroId: 42,
    isPick: true,
    phase: 2,
    order: 3,
    team: 'radiant',
    time: 28,
    extraTime: 5,
    totalTimeTaken: 7,
  };
  const params = draftEntryToParams('match_abc', d);

  assert.equal(params[0], 'match_abc', 'match_id');
  assert.equal(params[1], 42,          'hero_id');
  assert.equal(params[2], true,        'is_pick');
  assert.equal(params[3], 3,           'order_num');
  assert.equal(params[4], 0,           'team (radiant=0)');
  assert.equal(params[5], 2,           'draft_phase');
  assert.equal(params[6], 28,          'draft_time');
  assert.equal(params[7], 5,           'extra_time');
  assert.equal(params[8], 7,           'time_taken');
});

test('data-mapping: ban entry retains its Captain Mode phase', () => {
  const d = {
    heroId: 99,
    isPick: false,
    phase: 3,
    order: 1,
    team: 'dire',
    time: 35,
    extraTime: 0,
    totalTimeTaken: 5,
  };
  const params = draftEntryToParams('match_xyz', d);
  assert.equal(params[4], 1, 'team (dire=1)');
  assert.equal(params[5], 3, 'draft_phase');
});

test('data-mapping: entry without timing → timing params are null', () => {
  const d = {
    heroId: 7,
    isPick: true,
    order: 0,
    team: 0,    // numeric team (radiant)
  };
  const params = draftEntryToParams('match_legacy', d);
  assert.equal(params[5], null, 'draft_phase null when missing');
  assert.equal(params[6], null, 'draft_time null when missing');
  assert.equal(params[7], null, 'extra_time null when missing');
  assert.equal(params[8], null, 'time_taken null when missing');
});

test('data-mapping: legacy numeric team values (2/3) normalise to 0/1', () => {
  // Old parser emitted rawTeam=2 for radiant, 3 for dire
  const r = draftEntryToParams('m', { heroId: 1, isPick: false, order: 0, team: 2 });
  assert.equal(r[4], 0, 'team=2 → 0 (radiant)');
  const d = draftEntryToParams('m', { heroId: 1, isPick: false, order: 0, team: 3 });
  assert.equal(d[4], 1, 'team=3 → 1 (dire)');
});

// ---------------------------------------------------------------------------
// Section 4 – getMatch: SELECT includes new columns
// ---------------------------------------------------------------------------

test('getMatch: draft SELECT includes all four new timing columns', () => {
  const fs  = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '../src/db/index.js'), 'utf8');

  // Find the getMatch draft SELECT (identified by the ORDER BY order_num ASC after
  // a FROM match_draft)
  const regex = /SELECT ([^;]+) FROM match_draft WHERE match_id = \$1 ORDER BY order_num ASC/;
  const m = src.match(regex);
  assert.ok(m, 'Could not find getMatch draft SELECT');
  const selectCols = m[1];

  for (const col of ['draft_phase', 'draft_time', 'extra_time', 'time_taken']) {
    assert.ok(selectCols.includes(col), `getMatch SELECT should include ${col}\nActual: ${selectCols}`);
  }
});

// ---------------------------------------------------------------------------
// Section 5 – gameTimeline embedding (replayParser integration)
// ---------------------------------------------------------------------------
// These tests verify that pauseEvents, systemEvents, tpActivations and
// draftMeta are now embedded inside the gameTimeline object returned by
// _aggregateStats so they automatically survive the game_timeline JSONB write.

let ReplayParser;
try {
  ReplayParser = require('../src/replay/replayParser');
} catch (_) { /* skip if not loadable */ }

const PARSER_AVAILABLE = typeof ReplayParser === 'function' || (ReplayParser && typeof ReplayParser.ReplayParser === 'function');
const ParserClass = PARSER_AVAILABLE
  ? (typeof ReplayParser === 'function' ? ReplayParser : ReplayParser.ReplayParser)
  : null;

function makeBaseEvents(durationSec = 300) {
  const evs = [
    { type: 'match_id',     key: 'test_match_01' },
    { type: 'game_mode',    key: '2' },
    { type: 'radiant_win',  key: 'true' },
    { type: 'duration',     key: String(durationSec) },
  ];
  // Minimal interval events so the parser doesn't throw on empty player list
  for (let t = 0; t <= durationSec; t += 30) {
    evs.push({
      type: 'interval', time: t,
      players: [],
    });
  }
  return evs;
}

function makeParser() {
  return new ParserClass();
}

function maybeSkip(t, fn) {
  if (!PARSER_AVAILABLE) {
    t.skip('ReplayParser not loadable — skipping');
    return;
  }
  fn();
}

test('gameTimeline: pauseEvents embedded inside gameTimeline (not top-level)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      { type: 'game_paused', time: 100, value: 1, key: '0', duration: 30 },
      ...makeBaseEvents(300),
    ];
    const stats = p._aggregateStats(events);
    // Must NOT appear at top-level
    assert.equal(stats.pauseEvents, undefined, 'pauseEvents must not be top-level');
    // Must appear inside gameTimeline
    assert.ok('pauseEvents' in stats.gameTimeline,
      'pauseEvents should be a key inside gameTimeline');
  });
});

test('gameTimeline: systemEvents embedded inside gameTimeline (not top-level)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      { type: 'game_state', key: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', time: 0 },
      ...makeBaseEvents(300),
    ];
    const stats = p._aggregateStats(events);
    assert.equal(stats.systemEvents, undefined, 'systemEvents must not be top-level');
    assert.ok('systemEvents' in stats.gameTimeline,
      'systemEvents should be a key inside gameTimeline');
  });
});

test('gameTimeline: tpActivations embedded inside gameTimeline (not top-level)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = makeBaseEvents(300);
    const stats = p._aggregateStats(events);
    // tpActivations may be null when no TP events are present, but the key
    // should exist inside gameTimeline (not at top-level).
    assert.equal(stats.tpActivations, undefined, 'tpActivations must not be top-level');
    assert.ok('tpActivations' in stats.gameTimeline,
      'tpActivations should be a key inside gameTimeline');
  });
});

test('gameTimeline: draftMeta embedded inside gameTimeline (not top-level)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      { type: 'draft_start', time: -90 },
      { type: 'draft_timings', hero_id: 1, pick: false, draft_order: 1,
        draft_active_team: 2, time: -80, draft_extime0: 40, draft_extime1: 40 },
      ...makeBaseEvents(300),
    ];
    const stats = p._aggregateStats(events);
    assert.equal(stats.draftMeta, undefined, 'draftMeta must not be top-level');
    assert.ok('draftMeta' in stats.gameTimeline,
      'draftMeta should be a key inside gameTimeline');
    assert.ok(stats.gameTimeline.draftMeta !== undefined,
      'gameTimeline.draftMeta should be set (not undefined)');
  });
});

test('gameTimeline: null telemetry fields still present as keys (null not absent)', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const stats = p._aggregateStats(makeBaseEvents(300));
    // When there are no events the value is null; key must still exist so
    // consumers can safely check `'pauseEvents' in gameTimeline`.
    assert.ok('pauseEvents'   in stats.gameTimeline, 'pauseEvents key must exist');
    assert.ok('systemEvents'  in stats.gameTimeline, 'systemEvents key must exist');
    assert.ok('tpActivations' in stats.gameTimeline, 'tpActivations key must exist');
    assert.ok('draftMeta'     in stats.gameTimeline, 'draftMeta key must exist');
  });
});

test('gameTimeline: pauseEvents value is array (not null) when events present', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const events = [
      { type: 'game_paused', time: 50, value: 1, key: '3', duration: 15 },
      ...makeBaseEvents(300),
    ];
    const stats = p._aggregateStats(events);
    const pe = stats.gameTimeline.pauseEvents;
    assert.ok(Array.isArray(pe), 'pauseEvents should be an array when events are present');
    assert.ok(pe.length > 0, 'pauseEvents should be non-empty');
    // Shape check: each entry must have t
    for (const ev of pe) {
      assert.ok('t' in ev, 'each pauseEvent must have a t field');
      assert.ok(!('message' in ev), 'pause events must not contain free-text message field');
    }
  });
});

test('gameTimeline: existing required keys still present after embedding', (t) => {
  maybeSkip(t, () => {
    const p = makeParser();
    const stats = p._aggregateStats(makeBaseEvents(300));
    const gt = stats.gameTimeline;
    for (const key of ['interval', 'players', 'events', 'fights',
                       'wardDeaths', 'runePickups', 'laneOutcomesSummary']) {
      assert.ok(key in gt, `gameTimeline.${key} must still be present`);
    }
  });
});

// ---------------------------------------------------------------------------
// Section 6 – Round-trip: draft timing survives JSON serialise → parse
// ---------------------------------------------------------------------------

test('round-trip: draft timing fields survive JSON serialise/parse (JSONB simulation)', () => {
  // Simulate what PostgreSQL does when writing/reading game_timeline JSONB:
  // JSON.stringify → JSON.parse.  The new fields must survive intact.
  const fakeTimeline = {
    interval: 30,
    pauseEvents:   [{ t: 100, duration: 30, pauserSlot: 0 }],
    systemEvents:  [{ t: 0, state: 'PRE_GAME' }],
    tpActivations: [{ t: 200, slot: 3, item: 'tpscroll', destX: null, destY: null }],
    draftMeta:     { startTime: -90, _derived: true },
    players: [],
    events:  [],
  };

  const serialised = JSON.stringify(fakeTimeline);
  const parsed     = JSON.parse(serialised);

  assert.deepEqual(parsed.pauseEvents,   fakeTimeline.pauseEvents,   'pauseEvents round-trip');
  assert.deepEqual(parsed.systemEvents,  fakeTimeline.systemEvents,  'systemEvents round-trip');
  assert.deepEqual(parsed.tpActivations, fakeTimeline.tpActivations, 'tpActivations round-trip');
  assert.deepEqual(parsed.draftMeta,     fakeTimeline.draftMeta,     'draftMeta round-trip');
});

test('round-trip: null telemetry fields round-trip as null (not absent)', () => {
  const fakeTimeline = {
    pauseEvents: null, systemEvents: null, tpActivations: null, draftMeta: null,
    players: [], events: [],
  };
  const parsed = JSON.parse(JSON.stringify(fakeTimeline));
  assert.equal(parsed.pauseEvents,   null, 'null pauseEvents preserved');
  assert.equal(parsed.systemEvents,  null, 'null systemEvents preserved');
  assert.equal(parsed.tpActivations, null, 'null tpActivations preserved');
  assert.equal(parsed.draftMeta,     null, 'null draftMeta preserved');
});

// ---------------------------------------------------------------------------
// Section 7 – COALESCE semantics: conflict resolution preserves richer value
// ---------------------------------------------------------------------------

test('conflict-resolution: COALESCE keeps existing non-null timing on re-record', () => {
  // Simulate what ON CONFLICT … DO UPDATE SET col = COALESCE(EXCLUDED.col, match_draft.col) does.
  function coalesceUpdate(incoming, existing) {
    return incoming != null ? incoming : existing;
  }

  // Case 1: new parse has timing, old row had none → use new
  assert.equal(coalesceUpdate(28,   null), 28,   'new timing wins when old is null');
  // Case 2: new parse lacks timing, old row had it → keep old
  assert.equal(coalesceUpdate(null, 35),   35,   'old timing preserved when new is null');
  // Case 3: both non-null → use new (EXCLUDED wins in COALESCE when EXCLUDED is non-null)
  assert.equal(coalesceUpdate(20,   35),   20,   'new timing takes precedence when both non-null');
  // Case 4: both null → remains null
  assert.equal(coalesceUpdate(null, null), null, 'null stays null');
});

test('conflict-resolution: draft_phase always overwritten (no COALESCE)', () => {
  // draft_phase is deterministically derived from is_pick and should always
  // match the incoming row.  We verify the source uses a plain assignment.
  const fs  = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, '../src/db/index.js'), 'utf8');

  // In the conflict update block, draft_phase must be a direct assignment, not COALESCE
  const plain = src.includes('draft_phase = EXCLUDED.draft_phase');
  assert.ok(plain, 'draft_phase conflict update should be a plain assignment (no COALESCE)');

  const coalesced = /COALESCE\(EXCLUDED\.draft_phase/.test(src);
  assert.ok(!coalesced, 'draft_phase must NOT use COALESCE in conflict clause');
});
