// Task #222 / v6.76 — automated tests for the weekly auto-pick Featured
// Player rotation (PERF leader → hot streak → most-improved fallback chain
// inside ensureAutoSpotlight + pickAutoSpotlightCandidate).
//
// Covers:
//  1. ensureAutoSpotlight is a no-op when an admin row currently covers
//     NOW() — no INSERT, returns reason='already_active'.
//  2. ensureAutoSpotlight picks the PERF leader as a first preference and
//     persists with source='auto'.
//  3. ensureAutoSpotlight falls back to the hot-streak query when no PERF
//     row exists, then to most-improved when no streak exists.
//  4. ensureAutoSpotlight returns reason='no_candidate' (no INSERT) when
//     every source is empty.
//  5. createSpotlight (admin path) ends any conflicting source='auto'
//     rows up front so the new admin row's window is conflict-free.
//  6. getCurrentSpotlight prefers admin rows over auto rows when both
//     are simultaneously active.

const test = require('node:test');
const assert = require('node:assert/strict');

// In-memory fake pg.Pool that knows enough SQL fragments to drive the
// spotlight code paths. Inserts get auto-incrementing ids; SELECTs are
// pattern-matched on substring. Anything we haven't taught it about
// throws so test failures are loud.
function _makeFakePool() {
  const state = {
    spotlights: [],   // { id, account_id, headline, blurb, starts_at: Date|null, ends_at: Date|null, ended_at: Date|null, source, created_at }
    perfRows: [],     // { account_id, perf, match_id, hero_name, position, persona_name, match_date }
    streakRows: [],   // { account_id, streak, display_name }   (synthetic shortcut — see note below)
    improvedRows: [], // { account_id, display_name, current_mmr, start_mmr, mmr_delta, games_in_period }
    nextId: 1,
  };

  const fakePool = {
    state,
    async query(sqlRaw, params = []) {
      const sql = String(sqlRaw);

      // ----- profile_spotlight reads -----
      if (sql.includes('FROM profile_spotlight s') && sql.includes('ORDER BY (s.source')) {
        // getCurrentSpotlight
        const now = Date.now();
        const active = state.spotlights
          .filter(s => !s.ended_at && (!s.starts_at || s.starts_at.getTime() <= now) && (!s.ends_at || s.ends_at.getTime() > now))
          .sort((a, b) => {
            const aAdmin = a.source === 'admin' ? 1 : 0;
            const bAdmin = b.source === 'admin' ? 1 : 0;
            if (aAdmin !== bAdmin) return bAdmin - aAdmin;
            return (b.starts_at?.getTime() || 0) - (a.starts_at?.getTime() || 0);
          });
        const r = active[0];
        return { rows: r ? [{ ...r, display_name: r.display_name || null }] : [] };
      }
      if (sql.includes('SELECT id FROM profile_spotlight') && sql.includes('ended_at IS NULL')) {
        // _spotlightOverlaps
        const [start, end, excludeId] = params;
        const startMs = start ? new Date(start).getTime() : null;
        const endMs = end ? new Date(end).getTime() : null;
        const hit = state.spotlights.find(s => {
          if (s.ended_at) return false;
          if (excludeId != null && s.id === excludeId) return false;
          const sStart = s.starts_at?.getTime() || 0;
          const sEnd = s.ends_at?.getTime() || null;
          if (endMs == null && sEnd == null) return true;
          if (sEnd == null && endMs > sStart) return true;
          if (endMs == null && startMs < sEnd) return true;
          if (sEnd != null && endMs != null && startMs < sEnd && endMs > sStart) return true;
          return false;
        });
        return { rows: hit ? [{ id: hit.id }] : [] };
      }
      if (sql.includes('SELECT starts_at FROM profile_spotlight') && sql.includes("source = 'admin'") && sql.includes('starts_at >')) {
        // ensureAutoSpotlight next-queued-admin clamp
        const after = new Date(params[0]).getTime();
        const next = state.spotlights
          .filter(s => !s.ended_at && s.source === 'admin' && s.starts_at && s.starts_at.getTime() > after)
          .sort((a, b) => a.starts_at - b.starts_at)[0];
        return { rows: next ? [{ starts_at: next.starts_at }] : [] };
      }
      if (sql.includes('SELECT DISTINCT account_id::text AS account_id') && sql.includes("source = 'auto'")) {
        // ensureAutoSpotlight recent lookback
        const since = Date.now() - (params[0] || 0) * 24 * 3600 * 1000;
        const ids = new Set(
          state.spotlights
            .filter(s => s.source === 'auto' && (s.created_at?.getTime() || 0) > since)
            .map(s => String(s.account_id))
        );
        return { rows: [...ids].map(account_id => ({ account_id })) };
      }

      // ----- profile_spotlight writes -----
      if (sql.startsWith('UPDATE profile_spotlight') && sql.includes("source = 'auto'") && sql.includes('SET ended_at = NOW()')) {
        // createSpotlight admin-end-conflicting-auto path
        const [start, end] = params;
        const startMs = start ? new Date(start).getTime() : null;
        const endMs = end ? new Date(end).getTime() : null;
        let n = 0;
        for (const s of state.spotlights) {
          if (s.ended_at || s.source !== 'auto') continue;
          const sStart = s.starts_at?.getTime() || 0;
          const sEnd = s.ends_at?.getTime() || null;
          let overlap = false;
          if (endMs == null && sEnd == null) overlap = true;
          else if (sEnd == null && endMs > sStart) overlap = true;
          else if (endMs == null && startMs < sEnd) overlap = true;
          else if (sEnd != null && endMs != null && startMs < sEnd && endMs > sStart) overlap = true;
          if (overlap) { s.ended_at = new Date(); n++; }
        }
        return { rowCount: n, rows: [] };
      }
      if (sql.startsWith('INSERT INTO profile_spotlight')) {
        const [account_id, headline, blurb, starts_at, ends_at, created_by, source] = params;
        const row = {
          id: state.nextId++,
          account_id: Number(account_id),
          headline,
          blurb,
          starts_at: starts_at ? new Date(starts_at) : new Date(),
          ends_at: ends_at ? new Date(ends_at) : null,
          ended_at: null,
          created_by,
          created_at: new Date(),
          source: source || 'admin',
        };
        state.spotlights.push(row);
        return { rows: [row] };
      }

      // ----- candidate queries -----
      if (sql.includes('FROM player_stats ps') && sql.includes('ps.perf >= 6.0')) {
        const [days, excludeArr] = params;
        const cutoff = Date.now() - (days || 7) * 24 * 3600 * 1000;
        const exclude = new Set((excludeArr || []).map(String));
        const candidates = state.perfRows
          .filter(r => r.perf >= 6.0 && r.match_date.getTime() > cutoff && !exclude.has(String(r.account_id)))
          .sort((a, b) => b.perf - a.perf || b.match_date - a.match_date);
        const r = candidates[0];
        return { rows: r ? [{
          account_id: String(r.account_id), perf: r.perf, match_id: r.match_id,
          hero_name: r.hero_name, position: r.position,
          display_name: r.persona_name,
        }] : [] };
      }
      if (sql.includes('WITH recent_players AS') && sql.includes('latest_won')) {
        const [, excludeArr] = params;
        const exclude = new Set((excludeArr || []).map(String));
        const candidates = state.streakRows
          .filter(r => !exclude.has(String(r.account_id)) && r.streak >= 3)
          .sort((a, b) => b.streak - a.streak);
        const r = candidates[0];
        return { rows: r ? [{
          account_id: String(r.account_id),
          streak: r.streak,
          display_name: r.display_name,
        }] : [] };
      }
      // getMostImproved (used as third fallback)
      if (sql.includes('rating_history') && sql.includes('mmr_delta')) {
        // Return improvedRows sorted by mmr_delta DESC (mirrors prod query).
        const sorted = [...state.improvedRows].sort((a, b) => b.mmr_delta - a.mmr_delta);
        return { rows: sorted };
      }

      throw new Error('unexpected query in fake pool: ' + sql.replace(/\s+/g, ' ').slice(0, 120));
    },
  };

  return fakePool;
}

function _loadDbWithFakePool(fakePool) {
  delete require.cache[require.resolve('pg')];
  delete require.cache[require.resolve('../src/db')];
  delete require.cache[require.resolve('../src/db/index.js')];
  require.cache[require.resolve('pg')] = {
    id: require.resolve('pg'),
    filename: require.resolve('pg'),
    loaded: true,
    exports: { Pool: function FakePool() { return fakePool; } },
  };
  return require('../src/db');
}

// ───────────────────────────────────────────────────────────────────────
// 1. ensureAutoSpotlight is a no-op when an admin row already covers NOW()
// ───────────────────────────────────────────────────────────────────────
test('ensureAutoSpotlight: no-op when admin row currently active', async () => {
  const pool = _makeFakePool();
  const db = _loadDbWithFakePool(pool);

  // Seed an active admin row.
  pool.state.spotlights.push({
    id: pool.state.nextId++, account_id: 111, headline: 'Hand-picked',
    blurb: null, starts_at: new Date(Date.now() - 3600_000),
    ends_at: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    ended_at: null, source: 'admin', created_at: new Date(),
  });
  // Also seed a high-PERF candidate so we know the fallback chain WOULD pick someone.
  pool.state.perfRows.push({
    account_id: 222, perf: 9.7, match_id: 1, hero_name: 'pudge',
    position: 4, persona_name: 'NoodleArms', match_date: new Date(),
  });

  const out = await db.ensureAutoSpotlight({ windowDays: 7 });
  assert.equal(out.created, false);
  assert.equal(out.reason, 'already_active');
  assert.equal(pool.state.spotlights.length, 1, 'no new row inserted');
});

// ───────────────────────────────────────────────────────────────────────
// 2. PERF leader is the first preference
// ───────────────────────────────────────────────────────────────────────
test('ensureAutoSpotlight: picks PERF leader and persists source=auto', async () => {
  const pool = _makeFakePool();
  const db = _loadDbWithFakePool(pool);

  pool.state.perfRows.push(
    { account_id: 100, perf: 7.2, match_id: 1, hero_name: 'lina', position: 2, persona_name: 'Mid', match_date: new Date() },
    { account_id: 101, perf: 9.4, match_id: 2, hero_name: 'am', position: 1, persona_name: 'Carry', match_date: new Date() },
    { account_id: 102, perf: 6.1, match_id: 3, hero_name: 'cm', position: 5, persona_name: 'Sup', match_date: new Date() },
  );

  const out = await db.ensureAutoSpotlight({ windowDays: 7 });
  assert.equal(out.created, true);
  assert.equal(out.reason, 'perf_leader');
  assert.equal(out.spotlight.account_id, 101);
  assert.equal(out.spotlight.source, 'auto');
  assert.match(out.spotlight.headline, /PERF leader/);
  assert.match(out.spotlight.blurb, /9\.4/);
  // Window roughly 7 days.
  const days = (out.spotlight.ends_at.getTime() - out.spotlight.starts_at.getTime()) / (24 * 3600 * 1000);
  assert.ok(days > 6.9 && days < 7.1, `expected ~7 day window, got ${days}`);
});

// ───────────────────────────────────────────────────────────────────────
// 3. Hot-streak fallback when PERF is empty; most-improved fallback when
//    both PERF and streak are empty.
// ───────────────────────────────────────────────────────────────────────
test('ensureAutoSpotlight: falls back to hot streak then most-improved', async () => {
  // 3a — hot streak when PERF empty
  {
    const pool = _makeFakePool();
    const db = _loadDbWithFakePool(pool);
    pool.state.streakRows.push(
      { account_id: 200, streak: 4, display_name: 'Heater' },
      { account_id: 201, streak: 6, display_name: 'BiggerHeater' },
    );
    const out = await db.ensureAutoSpotlight({ windowDays: 7 });
    assert.equal(out.created, true);
    assert.equal(out.reason, 'hot_streak');
    assert.equal(out.spotlight.account_id, 201);
    assert.match(out.spotlight.headline, /6-win/);
  }
  // 3b — most-improved when both PERF and streak empty
  {
    const pool = _makeFakePool();
    const db = _loadDbWithFakePool(pool);
    pool.state.improvedRows.push(
      { account_id: 300, display_name: 'SmallMove', current_mmr: 4500, start_mmr: 4400, mmr_delta: 100, games_in_period: 5 },
      { account_id: 301, display_name: 'BigMove', current_mmr: 4900, start_mmr: 4500, mmr_delta: 400, games_in_period: 8 },
    );
    const out = await db.ensureAutoSpotlight({ windowDays: 7 });
    assert.equal(out.created, true);
    assert.equal(out.reason, 'most_improved');
    assert.equal(out.spotlight.account_id, 301);
    assert.match(out.spotlight.headline, /\+400 MMR/);
  }
});

// ───────────────────────────────────────────────────────────────────────
// 4. No-candidate path
// ───────────────────────────────────────────────────────────────────────
test('ensureAutoSpotlight: returns no_candidate when every source is empty', async () => {
  const pool = _makeFakePool();
  const db = _loadDbWithFakePool(pool);
  const out = await db.ensureAutoSpotlight({ windowDays: 7 });
  assert.equal(out.created, false);
  assert.equal(out.reason, 'no_candidate');
  assert.equal(pool.state.spotlights.length, 0);
});

// ───────────────────────────────────────────────────────────────────────
// 5. Admin-precedence: createSpotlight ends conflicting auto rows
// ───────────────────────────────────────────────────────────────────────
test('createSpotlight (admin): ends conflicting auto rows up front', async () => {
  const pool = _makeFakePool();
  const db = _loadDbWithFakePool(pool);

  // Seed an active auto row covering the next 7 days.
  pool.state.spotlights.push({
    id: pool.state.nextId++, account_id: 555, headline: 'auto pick',
    blurb: null, starts_at: new Date(Date.now() - 3600_000),
    ends_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    ended_at: null, source: 'auto', created_at: new Date(),
  });

  const created = await db.createSpotlight({
    accountId: 999,
    headline: 'Hand-curated mid-week pick',
    blurb: 'Admin override',
    startsAt: new Date(Date.now() + 60_000).toISOString(),
    endsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    createdBy: 'superuser',
  });

  assert.equal(created.source, 'admin');
  const auto = pool.state.spotlights.find(s => s.account_id === 555);
  assert.ok(auto.ended_at, 'auto row should have been ended by admin insert');
});

// ───────────────────────────────────────────────────────────────────────
// 5b. ensureAutoSpotlight clamps the auto window to a queued admin row's
// starts_at instead of skipping the whole week (reviewer ask).
// ───────────────────────────────────────────────────────────────────────
test('ensureAutoSpotlight: clamps auto window end to next queued admin start', async () => {
  const pool = _makeFakePool();
  const db = _loadDbWithFakePool(pool);

  // Admin row queued to start in 2 days (no current active row).
  const adminStart = new Date(Date.now() + 2 * 24 * 3600 * 1000);
  pool.state.spotlights.push({
    id: pool.state.nextId++, account_id: 4242, headline: 'queued admin',
    blurb: null, starts_at: adminStart,
    ends_at: new Date(adminStart.getTime() + 7 * 24 * 3600 * 1000),
    ended_at: null, source: 'admin', created_at: new Date(),
  });
  pool.state.perfRows.push({
    account_id: 9001, perf: 8.5, match_id: 1, hero_name: 'invoker',
    position: 2, persona_name: 'Quas', match_date: new Date(),
  });

  const out = await db.ensureAutoSpotlight({ windowDays: 7 });
  assert.equal(out.created, true);
  assert.equal(out.reason, 'perf_leader');
  // End should be clamped to ~adminStart, NOT NOW()+7d.
  const gap = out.spotlight.ends_at.getTime() - adminStart.getTime();
  assert.ok(Math.abs(gap) < 1000, `expected end to be clamped to admin start, gap=${gap}ms`);
});

// 5c. When the gap to the next admin row is too short (<1h), skip rather
// than insert a sub-hour spotlight.
test('ensureAutoSpotlight: skips when clamped window is shorter than minWindowMs', async () => {
  const pool = _makeFakePool();
  const db = _loadDbWithFakePool(pool);
  // Admin row queued to start in 30 minutes.
  pool.state.spotlights.push({
    id: pool.state.nextId++, account_id: 4242, headline: 'imminent admin',
    blurb: null, starts_at: new Date(Date.now() + 30 * 60_000),
    ends_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    ended_at: null, source: 'admin', created_at: new Date(),
  });
  pool.state.perfRows.push({
    account_id: 9001, perf: 8.5, match_id: 1, hero_name: 'invoker',
    position: 2, persona_name: 'Quas', match_date: new Date(),
  });

  const out = await db.ensureAutoSpotlight({ windowDays: 7 });
  assert.equal(out.created, false);
  assert.equal(out.reason, 'overlap_with_admin');
});

// ───────────────────────────────────────────────────────────────────────
// 6. getCurrentSpotlight prefers admin when both active
// ───────────────────────────────────────────────────────────────────────
test('getCurrentSpotlight: admin row beats auto row when both are active', async () => {
  const pool = _makeFakePool();
  const db = _loadDbWithFakePool(pool);

  // Auto first (newer starts_at).
  pool.state.spotlights.push({
    id: pool.state.nextId++, account_id: 700, headline: 'auto',
    blurb: null, starts_at: new Date(Date.now() - 60_000),
    ends_at: new Date(Date.now() + 24 * 3600 * 1000),
    ended_at: null, source: 'auto', created_at: new Date(),
  });
  // Admin second (older starts_at — would lose on starts_at DESC alone).
  pool.state.spotlights.push({
    id: pool.state.nextId++, account_id: 800, headline: 'admin',
    blurb: null, starts_at: new Date(Date.now() - 3600_000),
    ends_at: new Date(Date.now() + 24 * 3600 * 1000),
    ended_at: null, source: 'admin', created_at: new Date(),
  });

  const current = await db.getCurrentSpotlight();
  assert.equal(current.account_id, 800, 'admin row should win the tie-break');
  assert.equal(current.source, 'admin');
});
