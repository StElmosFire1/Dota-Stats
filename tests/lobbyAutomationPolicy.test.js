const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function loadPolicy(raw = null) {
  let value = raw;
  let readFails = false;
  let writeFails = false;
  const dbPath = require.resolve('../src/db');
  const policyPath = require.resolve('../src/inhouse/automationPolicy');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    getSetting: async () => { if (readFails) throw new Error('db unavailable'); return value; },
    setSetting: async (key, v) => { assert.equal(key, 'inhouse_dota_automation'); if (writeFails) throw new Error('write failed'); value = v; },
  } };
  delete require.cache[policyPath];
  return { policy: require(policyPath), failRead: () => { readFails = true; }, failWrite: () => { writeFails = true; }, value: () => value };
}

test('unknown policy fails closed; absent setting preserves current automation after load', async () => {
  const { policy } = loadPolicy();
  assert.throws(() => policy.assertEnabled(), { code: 'DOTA_AUTOMATION_DISABLED' });
  assert.equal(await policy.refresh(), true);
  assert.doesNotThrow(() => policy.assertEnabled());
});

test('off survives reload and on restores automation', async () => {
  const fixture = loadPolicy();
  await fixture.policy.refresh();
  await fixture.policy.setEnabled(false);
  assert.equal(fixture.value(), 'false');
  assert.equal(await fixture.policy.refresh(), false);
  assert.throws(() => fixture.policy.assertEnabled(), { code: 'DOTA_AUTOMATION_DISABLED' });
  await fixture.policy.setEnabled(true);
  assert.equal(await fixture.policy.refresh(), true);
});

test('invalid values and failed persistence cannot accidentally enable automation', async () => {
  const fixture = loadPolicy('false');
  await fixture.policy.refresh();
  await assert.rejects(fixture.policy.setEnabled('true'), /boolean/);
  fixture.failWrite();
  await assert.rejects(fixture.policy.setEnabled(true), /write failed/);
  assert.equal(fixture.policy.isEnabled(), false);
});

test('database read failure disables even a previously enabled process', async () => {
  const fixture = loadPolicy();
  await fixture.policy.refresh();
  fixture.failRead();
  await assert.rejects(fixture.policy.refresh(), /db unavailable/);
  assert.equal(fixture.policy.isEnabled(), false);
});

test('only literal true enables a persisted policy', async () => {
  for (const raw of ['garbage', '0', 'false', '{"enabled":true}']) {
    assert.equal(await loadPolicy(raw).policy.refresh(), false);
  }
});

test('synchronous and asynchronous game-lobby entrypoints all enforce policy', () => {
  const source = fs.readFileSync('src/lobby/lobbyManager.js', 'utf8');
  for (const method of ['createLobby', 'joinLobby', 'launchLobby', 'invitePlayer']) {
    assert.match(source, new RegExp(`${method}\\([^\\n]*\\) \\{\\s*(?:await automationPolicy.refresh\\(\\);\\s*)?automationPolicy.assertEnabled\\(\\)`));
  }
  for (const event of ['lobbyInviteReceived', 'partyInviteReceived']) {
    assert.ok(source.includes(`on('${event}', async (invite) => {\n      if (!automationPolicy.isEnabled()) return;`));
  }
});

test('settings writes require admin and direct game-server overrides cannot bypass policy', () => {
  const source = fs.readFileSync('src/web/server.js', 'utf8');
  assert.match(source, /router\.put\('\/admin\/inhouse\/automation', requireAdmin, express\.json\(\)/);
  for (const path of ['/inhouse/:id/server', '/inhouse/:id/server/retry', '/admin/inhouse/diag-provision', '/admin/inhouse/rcon-push-password']) {
    const registration = source.split('\n').find(line => line.includes(`router.post('${path}'`));
    assert.ok(registration?.includes('requireDotaAutomation'), path);
  }
  assert.ok(source.indexOf("router.get('/inhouse/automation'") < source.indexOf("router.get('/inhouse/:id'"));
});
