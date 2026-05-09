// Task #217 — unit tests for the voice-pack event queue.
// Task #233 — drainVoiceEvents is async; persistent path covered too.
const { test } = require('node:test');
const assert = require('node:assert');

const queue = require('../src/web/voiceEventQueue');

function reset() { queue._resetForTests(); }

test('drainVoiceEvents returns empty for unknown account', async () => {
  reset();
  assert.deepStrictEqual(await queue.drainVoiceEvents(123), []);
});

test('pushVoiceEvent persists, drainVoiceEvents clears in FIFO order', async () => {
  reset();
  queue.pushVoiceEvent(42, 'win');
  queue.pushVoiceEvent(42, 'first-blood');
  const events = await queue.drainVoiceEvents(42);
  assert.strictEqual(events.length, 2);
  // FIFO: push order must equal drain order.
  assert.strictEqual(events[0].event, 'win');
  assert.strictEqual(events[1].event, 'first-blood');
  assert.deepStrictEqual(await queue.drainVoiceEvents(42), []);
});

test('pushVoiceEvent rejects invalid event names and zero/null accountIds', async () => {
  reset();
  queue.pushVoiceEvent(42, 'bogus-event');
  queue.pushVoiceEvent(0, 'win');
  queue.pushVoiceEvent(null, 'win');
  queue.pushVoiceEvent(-1, 'win');
  assert.deepStrictEqual(await queue.drainVoiceEvents(42), []);
  assert.deepStrictEqual(await queue.drainVoiceEvents(0), []);
});

test('pushVoiceEvent caps queue at MAX_EVENTS_PER_ACCOUNT', async () => {
  reset();
  const overflow = queue.MAX_EVENTS_PER_ACCOUNT + 5;
  for (let i = 0; i < overflow; i++) queue.pushVoiceEvent(7, 'win');
  const events = await queue.drainVoiceEvents(7);
  assert.strictEqual(events.length, queue.MAX_EVENTS_PER_ACCOUNT);
});

test('pushMatchVoiceEvents emits win/loss + first-blood for every player', async () => {
  reset();
  const matchStats = {
    radiantWin: true,
    players: [
      { accountId: 100, team: 'radiant', firstbloodClaimed: 1 },
      { accountId: 200, team: 'radiant' },
      { accountId: 300, team: 'dire' },
      { accountId: 0, team: 'radiant' }, // anon — must be skipped
    ],
  };
  queue.pushMatchVoiceEvents(matchStats);

  // Push order from pushMatchVoiceEvents: win/loss first, then first-blood.
  const e100 = (await queue.drainVoiceEvents(100)).map(e => e.event);
  const e200 = (await queue.drainVoiceEvents(200)).map(e => e.event);
  const e300 = (await queue.drainVoiceEvents(300)).map(e => e.event);
  const e0 = await queue.drainVoiceEvents(0);

  assert.deepStrictEqual(e100, ['win', 'first-blood']);
  assert.deepStrictEqual(e200, ['win', 'first-blood']);
  assert.deepStrictEqual(e300, ['loss', 'first-blood']);
  assert.deepStrictEqual(e0, []);
});

test('pushMatchVoiceEvents skips first-blood when no killer recorded', async () => {
  reset();
  queue.pushMatchVoiceEvents({
    radiantWin: false,
    players: [
      { accountId: 100, team: 'radiant' },
      { accountId: 200, team: 'dire' },
    ],
  });
  assert.deepStrictEqual((await queue.drainVoiceEvents(100)).map(e => e.event), ['loss']);
  assert.deepStrictEqual((await queue.drainVoiceEvents(200)).map(e => e.event), ['win']);
});

test('pushMatchVoiceEvents accepts snake_case firstblood_claimed', async () => {
  reset();
  queue.pushMatchVoiceEvents({
    radiantWin: true,
    players: [
      { accountId: 100, team: 'radiant', firstblood_claimed: 1 },
      { accountId: 200, team: 'dire' },
    ],
  });
  const e100 = (await queue.drainVoiceEvents(100)).map(e => e.event);
  assert.deepStrictEqual(e100, ['win', 'first-blood']);
});

test('pushMatchVoiceEvents handles player_slot fallback (no team field)', async () => {
  reset();
  queue.pushMatchVoiceEvents({
    radiantWin: true,
    players: [
      { accountId: 100, player_slot: 0 },     // radiant
      { accountId: 200, player_slot: 128 },   // dire
    ],
  });
  assert.deepStrictEqual((await queue.drainVoiceEvents(100)).map(e => e.event), ['win']);
  assert.deepStrictEqual((await queue.drainVoiceEvents(200)).map(e => e.event), ['loss']);
});

test('pushMatchVoiceEvents tolerates malformed input', () => {
  reset();
  queue.pushMatchVoiceEvents(null);
  queue.pushMatchVoiceEvents({});
  queue.pushMatchVoiceEvents({ players: 'not-an-array' });
  assert.ok(true); // didn't throw
});

test('pushAchievementVoiceEvents emits achievement-unlock per granted player', async () => {
  reset();
  queue.pushAchievementVoiceEvents([
    { player: { accountId: 100 }, newOnes: [{ key: 'first_win' }] },
    { player: { accountId: 200 }, newOnes: [{ key: 'mvp' }, { key: 'streak5' }] },
    { player: { accountId: 0 }, newOnes: [{ key: 'x' }] },     // anon — skipped
    null,                                                       // tolerated
    { player: null, newOnes: [] },                              // tolerated
  ]);
  assert.deepStrictEqual((await queue.drainVoiceEvents(100)).map(e => e.event), ['achievement-unlock']);
  assert.deepStrictEqual((await queue.drainVoiceEvents(200)).map(e => e.event), ['achievement-unlock']);
  assert.deepStrictEqual(await queue.drainVoiceEvents(0), []);
});

test('pushAchievementVoiceEvents tolerates non-array input', () => {
  reset();
  queue.pushAchievementVoiceEvents(null);
  queue.pushAchievementVoiceEvents(undefined);
  queue.pushAchievementVoiceEvents('nope');
  assert.ok(true); // didn't throw
});

// Task #233 — persistent path: with a stub pool injected, pushVoiceEvent
// writes through to the DB and drainVoiceEvents pulls rows back out via
// DELETE … RETURNING. Validates the SQL shape without needing a live DB.
test('pushVoiceEvent persists to injected pool and drain returns DB rows', async () => {
  reset();
  const inserts = [];
  let nextId = 1;
  const rows = []; // { id, account_id, event, created_at }
  const stubPool = {
    async query(sql, params) {
      const s = sql.trim();
      if (s.startsWith('INSERT INTO voice_events')) {
        inserts.push({ account_id: params[0], event: params[1] });
        rows.push({ id: nextId++, account_id: params[0], event: params[1], created_at: new Date() });
        return { rows: [] };
      }
      if (s.startsWith('DELETE FROM voice_events') && s.includes('RETURNING')) {
        const [accountId] = params;
        const cutoff = Date.now() - queue.EVENT_TTL_MS;
        const matched = rows.filter(r => r.account_id === accountId && r.created_at.getTime() > cutoff);
        for (const m of matched) rows.splice(rows.indexOf(m), 1);
        return { rows: matched.map(m => ({ event: m.event, ts: m.created_at.getTime() })) };
      }
      return { rows: [] };
    },
  };
  queue._setPoolForTests(stubPool);

  queue.pushVoiceEvent(99, 'win');
  queue.pushVoiceEvent(99, 'first-blood');

  // drain awaits in-flight inserts internally, so we don't need to
  // micro-task-wait first — that's the whole point of the new design.
  // FIFO: push order from above is win, then first-blood.
  const drained = (await queue.drainVoiceEvents(99)).map(e => e.event);
  assert.deepStrictEqual(drained, ['win', 'first-blood']);
  assert.deepStrictEqual(await queue.drainVoiceEvents(99), []);
});

// Regression #1: the original draft removed shadow entries by event-name,
// so two duplicate `win` pushes with out-of-order INSERT settles could
// drop one cue entirely. Now: failed pushes go to shadow, succeeded
// pushes go to DB only — drain awaits in-flight then reads both. Two
// `win`s with one rejection MUST surface both cues.
test('duplicate events with one rejected INSERT do not lose cues', async () => {
  reset();
  let callIdx = 0;
  const settlers = [];
  const stubPool = {
    async query(sql, params) {
      const s = sql.trim();
      if (s.startsWith('INSERT INTO voice_events')) {
        const myIdx = callIdx++;
        return new Promise((resolve, reject) => {
          settlers[myIdx] = { resolve, reject };
        });
      }
      if (s.startsWith('DELETE FROM voice_events') && s.includes('RETURNING')) {
        // First INSERT was acked but its trim-DELETE never ran (we never
        // resolve it past the INSERT); the test simulates one committed
        // row in the DB by returning a synthetic row for the success case.
        return { rows: [{ event: 'win', ts: Date.now() }] };
      }
      return { rows: [] };
    },
  };
  queue._setPoolForTests(stubPool);

  queue.pushVoiceEvent(77, 'win');
  queue.pushVoiceEvent(77, 'win');
  await new Promise(r => setImmediate(r));
  // Resolve insert #1 with REJECTION (DB hiccup → shadow), then
  // settler #0 with success (→ DB row, no shadow).
  settlers[1].reject(new Error('hiccup'));
  settlers[0].resolve();

  const drained = (await queue.drainVoiceEvents(77)).map(e => e.event);
  // One from DB (synthetic 'win'), one from shadow (rejected push).
  assert.deepStrictEqual(drained.sort(), ['win', 'win']);
});

// Regression #2: the v1 design held a memory shadow until the INSERT
// committed, so a drain BEFORE the commit then a second drain AFTER
// would surface the same event twice. The redesigned drain awaits
// in-flight INSERTs first, so the same event can never appear in both
// drains.
test('drain-before-insert-commit then drain-after surfaces event exactly once', async () => {
  reset();
  let insertSettler = null;
  let committed = false;
  const stubPool = {
    async query(sql, params) {
      const s = sql.trim();
      if (s.startsWith('INSERT INTO voice_events')) {
        return new Promise((resolve, reject) => {
          insertSettler = () => { committed = true; resolve(); };
        });
      }
      if (s.startsWith('DELETE FROM voice_events') && s.includes('RETURNING')) {
        if (committed) {
          committed = false;
          return { rows: [{ event: 'win', ts: Date.now() }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  queue._setPoolForTests(stubPool);

  queue.pushVoiceEvent(88, 'win');
  // Kick off a drain BEFORE the INSERT commits. The new drain awaits
  // the in-flight INSERT, so we have to settle it before the drain
  // promise can resolve. Schedule the settle on a later tick.
  const drainPromise = queue.drainVoiceEvents(88);
  await new Promise(r => setImmediate(r));
  insertSettler();
  const first = (await drainPromise).map(e => e.event);

  // Second drain must be empty — the event was delivered exactly once.
  const second = (await queue.drainVoiceEvents(88)).map(e => e.event);

  assert.deepStrictEqual(first, ['win']);
  assert.deepStrictEqual(second, []);
});

// Persistent-path FIFO ordering test: Postgres does NOT guarantee row
// order in DELETE … RETURNING, so the drain must sort by (created_at,
// id) to preserve push order. Stub returns rows intentionally shuffled
// to prove the sort is real.
test('drain sorts DB rows into FIFO order even when stub returns shuffled', async () => {
  reset();
  const stubPool = {
    async query(sql, params) {
      const s = sql.trim();
      if (s.startsWith('INSERT INTO voice_events')) return { rows: [] };
      if (s.startsWith('DELETE FROM voice_events') && s.includes('RETURNING')) {
        // Same created_at ms for all three; only id distinguishes order.
        const ts = Date.now();
        // Return SHUFFLED order — drain must sort by id.
        return { rows: [
          { id: 3, event: 'first-blood', ts },
          { id: 1, event: 'match-start', ts },
          { id: 2, event: 'win',         ts },
        ] };
      }
      return { rows: [] };
    },
  };
  queue._setPoolForTests(stubPool);

  queue.pushVoiceEvent(31, 'match-start');
  queue.pushVoiceEvent(31, 'win');
  queue.pushVoiceEvent(31, 'first-blood');

  const drained = (await queue.drainVoiceEvents(31)).map(e => e.event);
  assert.deepStrictEqual(drained, ['match-start', 'win', 'first-blood']);
});

// Regression #3 (code-review round 3): a failing trim DELETE after a
// successful INSERT must NOT push the event into the shadow — that
// would surface the cue twice (one from the committed DB row, one from
// the shadow). Trim failure is log-only.
test('INSERT success with trim DELETE failure delivers cue exactly once', async () => {
  reset();
  let nextId = 1;
  const rows = [];
  const stubPool = {
    async query(sql, params) {
      const s = sql.trim();
      if (s.startsWith('INSERT INTO voice_events')) {
        rows.push({ id: nextId++, account_id: params[0], event: params[1], created_at: new Date() });
        return { rows: [] };
      }
      // The trim DELETE is the one with `NOT IN (SELECT … LIMIT $2)` —
      // throw on it specifically. The drain DELETE has `RETURNING`.
      if (s.startsWith('DELETE FROM voice_events') && s.includes('NOT IN')) {
        throw new Error('trim failure');
      }
      if (s.startsWith('DELETE FROM voice_events') && s.includes('RETURNING')) {
        const [accountId] = params;
        const matched = rows.filter(r => r.account_id === accountId);
        for (const m of matched) rows.splice(rows.indexOf(m), 1);
        return { rows: matched.map(m => ({ event: m.event, ts: m.created_at.getTime() })) };
      }
      return { rows: [] };
    },
  };
  queue._setPoolForTests(stubPool);

  queue.pushVoiceEvent(66, 'win');
  const drained = (await queue.drainVoiceEvents(66)).map(e => e.event);
  assert.deepStrictEqual(drained, ['win'], 'trim failure must not duplicate the cue into the shadow');
  // Second drain — must be empty. Single delivery.
  assert.deepStrictEqual(await queue.drainVoiceEvents(66), []);
});

test('drainVoiceEvents falls back to in-memory shadow if DB query throws', async () => {
  reset();
  const stubPool = {
    async query(sql) {
      const s = sql.trim();
      // INSERT throws → pushVoiceEvent's catch records to shadow.
      if (s.startsWith('INSERT INTO voice_events')) throw new Error('db down');
      // DELETE throws → drain falls through to shadow read.
      if (s.startsWith('DELETE FROM voice_events') && s.includes('RETURNING')) {
        throw new Error('db down');
      }
      return { rows: [] };
    },
  };
  queue._setPoolForTests(stubPool);
  queue.pushVoiceEvent(55, 'win');
  const drained = (await queue.drainVoiceEvents(55)).map(e => e.event);
  assert.deepStrictEqual(drained, ['win']);
});
