// Task #168 — unit tests for src/inhouse/serverProvisioner.js.
//
// Covers:
//   • Single-flight: two concurrent provisionInhouseServer() calls collapse
//     into one DB transition (the second returns { skipped: 'in_flight' }).
//   • Idempotency: a session already at status='in_progress' with a password
//     short-circuits without rotating the password or calling RCON again.
//   • Failure path: when RCON is configured AND throws, the session moves to
//     status='server_failed' (NOT in_progress), records the reason in
//     `notes`, and tries to ping the Discord channel.
//   • Success path: status='in_progress', match_password set, Discord
//     announcement sent.
//   • RCON not configured: NOT a failure — falls through to in_progress so
//     the connect-link-only fallback continues to work as today.
//   • isDraftComplete predicate.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// Stub the dependencies the helper require()s. We replace require.cache
// entries before loading the helper, then delete the helper from cache so
// each test gets a fresh in-memory single-flight Set.
function loadHelperWithStubs(stubs) {
  const helperPath = require.resolve('../src/inhouse/serverProvisioner.js');
  const dbPath     = require.resolve('../src/db');
  const linkPath   = require.resolve('../src/services/steamConnectLink');
  const cfgPath    = require.resolve('../src/config');
  const rconPath   = require.resolve('../src/services/rconClient');
  const botPath    = require.resolve('../src/discord/bot');

  // Wipe related cache so our fresh stubs win.
  delete require.cache[helperPath];
  delete require.cache[dbPath];
  delete require.cache[linkPath];
  delete require.cache[cfgPath];
  delete require.cache[rconPath];
  delete require.cache[botPath];

  require.cache[dbPath]   = { id: dbPath,   filename: dbPath,   loaded: true, exports: stubs.db };
  require.cache[linkPath] = { id: linkPath, filename: linkPath, loaded: true, exports: { generateMatchPassword: () => 'gen12345' } };
  require.cache[cfgPath]  = { id: cfgPath,  filename: cfgPath,  loaded: true, exports: { config: stubs.config } };
  require.cache[rconPath] = { id: rconPath, filename: rconPath, loaded: true, exports: { setMatchPassword: stubs.setMatchPassword } };
  require.cache[botPath]  = { id: botPath,  filename: botPath,  loaded: true, exports: { getDiscordBot: () => stubs.bot } };

  return require(helperPath);
}

function makeBot() {
  const calls = [];
  return {
    calls,
    _notifyChannel: (msg) => { calls.push(msg); },
    _movePlayersToVoiceChannels: async () => {},
  };
}

function makeDb({ initialSession, players = [] }) {
  const state = { session: { ...initialSession } };
  const updates = [];
  return {
    state,
    updates,
    async getInhouseSession() { return state.session ? { ...state.session } : null; },
    async updateInhouseSession(_id, fields) {
      updates.push({ ...fields });
      Object.assign(state.session, fields);
      return { ...state.session };
    },
    async getInhouseSessionPlayers() { return players; },
  };
}

test('success path: drafting → in_progress with RCON configured + Discord ping', async () => {
  const db = makeDb({ initialSession: { id: 1, status: 'drafting', team1_is_radiant: true } });
  const bot = makeBot();
  const helper = loadHelperWithStubs({
    db, bot,
    setMatchPassword: async () => {},
    config: { dota: { dedicatedServer: { ip: '10.0.0.1', port: 27015, rconPassword: 'rcon' } } },
  });

  const r = await helper.provisionInhouseServer(1, { trigger: 'auto_draft_complete' });

  assert.equal(r.ok, true);
  assert.equal(r.session.status, 'in_progress');
  assert.ok(r.session.match_password);
  assert.equal(r.rcon.ok, true);
  assert.ok(bot.calls.some(c => /server provisioned/i.test(String(c))));
});

test('failure path: RCON throws → status=server_failed, reason in notes, Discord pinged, no in_progress', async () => {
  const db = makeDb({ initialSession: { id: 2, status: 'drafting' } });
  const bot = makeBot();
  const helper = loadHelperWithStubs({
    db, bot,
    setMatchPassword: async () => { throw new Error('connection refused'); },
    config: { dota: { dedicatedServer: { ip: '10.0.0.1', port: 27015, rconPassword: 'rcon' } } },
  });

  const r = await helper.provisionInhouseServer(2, { trigger: 'auto_draft_complete' });

  assert.equal(r.ok, false);
  assert.equal(r.failed, true);
  assert.equal(r.session.status, 'server_failed');
  assert.match(String(r.session.notes), /connection refused/);
  // Crucially: we never wrote in_progress.
  assert.ok(!db.updates.some(u => u.status === 'in_progress'));
  assert.ok(bot.calls.some(c => /provisioning failed/i.test(String(c))));
});

test('RCON not configured: NOT a failure — still flips to in_progress (connect-link fallback)', async () => {
  const db = makeDb({ initialSession: { id: 3, status: 'drafting' } });
  const bot = makeBot();
  const helper = loadHelperWithStubs({
    db, bot,
    setMatchPassword: async () => { throw new Error('ENOTFOUND'); },
    config: { dota: { dedicatedServer: { ip: '10.0.0.1', port: 27015, rconPassword: '' } } },
  });

  const r = await helper.provisionInhouseServer(3, { trigger: 'manual' });

  assert.equal(r.ok, true);
  assert.equal(r.session.status, 'in_progress');
  assert.equal(r.rcon.ok, false);
});

test('idempotent: already in_progress short-circuits without re-rotating', async () => {
  let rconCalls = 0;
  const db = makeDb({ initialSession: { id: 4, status: 'in_progress', match_password: 'existing' } });
  const helper = loadHelperWithStubs({
    db, bot: makeBot(),
    setMatchPassword: async () => { rconCalls++; },
    config: { dota: { dedicatedServer: { ip: '10.0.0.1', port: 27015, rconPassword: 'rcon' } } },
  });

  const r = await helper.provisionInhouseServer(4);

  assert.equal(r.ok, true);
  assert.equal(r.skipped, 'already_provisioned');
  assert.equal(r.session.match_password, 'existing');
  assert.equal(rconCalls, 0);
  assert.equal(db.updates.length, 0);
});

test('single-flight: concurrent calls collapse — second returns skipped:in_flight', async () => {
  let releaseRcon;
  const db = makeDb({ initialSession: { id: 5, status: 'drafting' } });
  const helper = loadHelperWithStubs({
    db, bot: makeBot(),
    setMatchPassword: () => new Promise(resolve => { releaseRcon = resolve; }),
    config: { dota: { dedicatedServer: { ip: '10.0.0.1', port: 27015, rconPassword: 'rcon' } } },
  });

  const p1 = helper.provisionInhouseServer(5);
  // Yield once so p1 enters the lock.
  await new Promise(r => setImmediate(r));
  const p2 = helper.provisionInhouseServer(5);
  const r2 = await p2;
  releaseRcon();
  const r1 = await p1;

  assert.equal(r2.skipped, 'in_flight');
  assert.equal(r1.ok, true);
});

test('wrong status (e.g. open) → skipped:wrong_status, no DB writes', async () => {
  const db = makeDb({ initialSession: { id: 6, status: 'open' } });
  const helper = loadHelperWithStubs({
    db, bot: makeBot(),
    setMatchPassword: async () => {},
    config: { dota: { dedicatedServer: { ip: '10.0.0.1', port: 27015, rconPassword: 'rcon' } } },
  });

  const r = await helper.provisionInhouseServer(6);

  assert.equal(r.ok, false);
  assert.equal(r.skipped, 'wrong_status');
  assert.equal(db.updates.length, 0);
});

test('server_failed → retry succeeds and flips to in_progress', async () => {
  const db = makeDb({ initialSession: { id: 7, status: 'server_failed', notes: 'old failure' } });
  const helper = loadHelperWithStubs({
    db, bot: makeBot(),
    setMatchPassword: async () => {},
    config: { dota: { dedicatedServer: { ip: '10.0.0.1', port: 27015, rconPassword: 'rcon' } } },
  });

  const r = await helper.provisionInhouseServer(7, { trigger: 'captain_retry' });

  assert.equal(r.ok, true);
  assert.equal(r.session.status, 'in_progress');
});

test('isDraftComplete: true when 8 non-captain slots are placed', async () => {
  const helper = loadHelperWithStubs({
    db: makeDb({ initialSession: { id: 0, status: 'drafting' } }),
    bot: makeBot(),
    setMatchPassword: async () => {},
    config: { dota: { dedicatedServer: { ip: '', port: 27015, rconPassword: '' } } },
  });
  const session = { captain1_account_id: 1, captain2_account_id: 2 };
  const players = [
    { account_id: 1, team: 1 }, { account_id: 2, team: 2 },
    { account_id: 3, team: 1 }, { account_id: 4, team: 2 },
    { account_id: 5, team: 1 }, { account_id: 6, team: 2 },
    { account_id: 7, team: 1 }, { account_id: 8, team: 2 },
    { account_id: 9, team: 1 }, { account_id: 10, team: 2 },
  ];
  assert.equal(helper.isDraftComplete(session, players), true);
  assert.equal(helper.isDraftComplete(session, players.slice(0, 9)), false);
});
