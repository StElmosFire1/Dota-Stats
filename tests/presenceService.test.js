// Task #228 — unit tests for the bulk live-presence rollup added in
// Task #213 (`getAllLivePresences()` in src/services/presenceService.js).
//
// The rollup merges three sources (the in-memory _steam cache, the
// in-memory _discord cache, and the inhouse_queue table), applies the
// same priority + visibility rules as the per-profile getPlayerPresence,
// and skips stale records. None of that is currently exercised by an
// automated test, so this file seeds the in-memory caches directly and
// stubs the small set of pg queries the service issues.

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const presence = require('../src/services/presenceService');

const STEAM64_OFFSET = 76561197960265728n;
function steam64(accountId32) {
  return (BigInt(accountId32) + STEAM64_OFFSET).toString();
}

// ---------------------------------------------------------------------------
// Tiny pool stub. Every test installs its own row map keyed by a substring
// match against the SQL string the service issues. The rollup makes at
// most three queries: discord-id → account_id resolve, the inhouse_queue
// scan, and the visibility/display-name lookup.
// ---------------------------------------------------------------------------

function installPool(handlers) {
  const pool = {
    async query(sql, params) {
      for (const { match, rows } of handlers) {
        if (sql.includes(match)) {
          const out = typeof rows === 'function' ? rows(params) : rows;
          return { rows: out };
        }
      }
      return { rows: [] };
    },
  };
  const origGetPool = db.getPool;
  db.getPool = () => pool;
  return () => { db.getPool = origGetPool; };
}

function resetCaches() {
  presence._caches._steam.clear();
  presence._caches._discord.clear();
}

// ---------------------------------------------------------------------------

test('getAllLivePresences: status priority — in_game wins over in_lobby/in_queue/in_voice', async () => {
  resetCaches();
  const now = Date.now();
  // Player A: in_game via steam.
  presence._caches._steam.set(steam64('100'), {
    state: 'in_game', heroId: 5, heroName: 'Crystal Maiden', matchId: '999', updatedAt: now,
  });
  // Player B: in_lobby via steam AND in queue — in_lobby wins.
  presence._caches._steam.set(steam64('200'), { state: 'in_lobby', updatedAt: now });
  // Player C: queue-only.
  // Player D: discord voice only.
  presence._caches._discord.set('discordD', { state: 'online', voice: true, updatedAt: now });

  const restore = installPool([
    { match: 'FROM nicknames\n          WHERE discord_id', rows: [
      { account_id: '400', discord_id: 'discordD' },
    ]},
    { match: 'FROM inhouse_queue WHERE account_id IS NOT NULL', rows: [
      { account_id: '200', joined_at: new Date(now - 60_000) },
      { account_id: '300', joined_at: new Date(now - 30_000) },
    ]},
    { match: 'COALESCE(pp.presence_visible', rows: (params) => params[0].map((id) => ({
      account_id: id, display_name: `P${id}`, presence_visible: true,
    })) },
  ]);
  try {
    const rows = await presence.getAllLivePresences();
    const byId = Object.fromEntries(rows.map(r => [r.account_id, r]));
    assert.equal(byId['100'].status, 'in_game');
    assert.equal(byId['100'].hero, 'Crystal Maiden');
    assert.equal(byId['100'].match_id, '999');
    assert.equal(byId['200'].status, 'in_lobby');
    assert.equal(byId['300'].status, 'in_queue');
    assert.ok(byId['300'].joined_at, 'queue rows expose joined_at');
    assert.equal(byId['400'].status, 'in_voice');
    // Sort order: in_game, in_lobby, in_queue, in_voice.
    assert.deepEqual(rows.map(r => r.status), ['in_game', 'in_lobby', 'in_queue', 'in_voice']);
  } finally { restore(); resetCaches(); }
});

test('getAllLivePresences: presence_visible=false hides the row', async () => {
  resetCaches();
  const now = Date.now();
  presence._caches._steam.set(steam64('100'), { state: 'in_game', updatedAt: now });
  presence._caches._steam.set(steam64('101'), { state: 'in_game', updatedAt: now });
  const restore = installPool([
    { match: 'FROM inhouse_queue', rows: [] },
    { match: 'COALESCE(pp.presence_visible', rows: (params) => params[0].map((id) => ({
      account_id: id, display_name: `P${id}`, presence_visible: id !== '101',
    })) },
  ]);
  try {
    const rows = await presence.getAllLivePresences();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_id, '100');
  } finally { restore(); resetCaches(); }
});

test('getAllLivePresences: stale entries (>5min) are skipped', async () => {
  resetCaches();
  const now = Date.now();
  const stale = now - (6 * 60 * 1000);
  presence._caches._steam.set(steam64('100'), { state: 'in_game', updatedAt: stale });
  presence._caches._steam.set(steam64('101'), { state: 'in_lobby', updatedAt: now });
  presence._caches._discord.set('staleDisc', { state: 'online', voice: true, updatedAt: stale });
  const restore = installPool([
    { match: 'FROM nicknames\n          WHERE discord_id', rows: [] }, // never reached for stale
    { match: 'FROM inhouse_queue', rows: [] },
    { match: 'COALESCE(pp.presence_visible', rows: (params) => params[0].map((id) => ({
      account_id: id, display_name: `P${id}`, presence_visible: true,
    })) },
  ]);
  try {
    const rows = await presence.getAllLivePresences();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_id, '101');
    assert.equal(rows[0].status, 'in_lobby');
  } finally { restore(); resetCaches(); }
});

test('getAllLivePresences: plain Discord-online (voice=false) is excluded from the rollup', async () => {
  resetCaches();
  const now = Date.now();
  // Player A: in_game via steam — should appear.
  presence._caches._steam.set(steam64('100'), { state: 'in_game', updatedAt: now });
  // Player B: discord state=online but voice=false — NOT live, so excluded
  // (Task #213 scopes the rollup to actively-doing-something statuses).
  presence._caches._discord.set('discordOnline', { state: 'online', voice: false, updatedAt: now });
  // Player C: discord state=online with voice=true — IS live (in_voice).
  presence._caches._discord.set('discordVoice', { state: 'online', voice: true, updatedAt: now });
  const restore = installPool([
    { match: 'FROM nicknames\n          WHERE discord_id', rows: (params) => {
      // Sanity: only the voice=true discord id should be resolved — the
      // online-but-not-voice candidate is dropped before the SQL fan-out.
      assert.deepEqual(params[0], ['discordVoice']);
      return [{ account_id: '300', discord_id: 'discordVoice' }];
    }},
    { match: 'FROM inhouse_queue', rows: [] },
    { match: 'COALESCE(pp.presence_visible', rows: (params) => params[0].map((id) => ({
      account_id: id, display_name: `P${id}`, presence_visible: true,
    })) },
  ]);
  try {
    const rows = await presence.getAllLivePresences();
    const ids = rows.map(r => r.account_id).sort();
    assert.deepEqual(ids, ['100', '300']);
    const byId = Object.fromEntries(rows.map(r => [r.account_id, r]));
    assert.equal(byId['100'].status, 'in_game');
    assert.equal(byId['300'].status, 'in_voice');
    // Status order: in_game (rank 0) before in_voice (rank 3); plain
    // 'online' has no rank because it never appears.
    assert.deepEqual(rows.map(r => r.status), ['in_game', 'in_voice']);
  } finally { restore(); resetCaches(); }
});

test('getAllLivePresences: inhouse_queue rows produce in_queue entries with no steam/discord cache hit', async () => {
  resetCaches();
  const now = Date.now();
  const restore = installPool([
    { match: 'FROM inhouse_queue', rows: [
      { account_id: '500', joined_at: new Date(now - 120_000) },
      { account_id: '501', joined_at: new Date(now - 30_000) },
    ]},
    { match: 'COALESCE(pp.presence_visible', rows: (params) => params[0].map((id) => ({
      account_id: id, display_name: `Q${id}`, presence_visible: true,
    })) },
  ]);
  try {
    const rows = await presence.getAllLivePresences();
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.status, 'in_queue');
      assert.ok(r.joined_at, 'joined_at is populated from inhouse_queue');
      assert.ok(r.display_name && r.display_name.startsWith('Q'));
    }
  } finally { restore(); resetCaches(); }
});
