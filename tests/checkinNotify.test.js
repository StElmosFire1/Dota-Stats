// Task #452 — Tournament check-in window notifications.
//
// Verifies the server-side fan-out tick: it pulls the due "open" and
// "5-min reminder" claims from the DB layer and fans each recipient out
// through notify() exactly once, with the correct event key + payload
// kinds. The DB + notify modules are stubbed so no real DB / Discord /
// push is touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

function stubModule(specifier, exports, fromPath) {
  const filename = Module.createRequire(fromPath).resolve(specifier);
  delete require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
  return filename;
}

const SERVER_PATH = require.resolve('../src/web/server.js');

function boot({ claim, dqSummaries }) {
  // Reset module cache so server.js re-binds our stubs every boot.
  delete require.cache[SERVER_PATH];

  const notifyCalls = [];
  const dbStub = {
    async claimTournamentCheckinNotifications() { return claim; },
    async sweepTournamentCheckInDqs() { return dqSummaries || []; },
    // notify.js references these lazily; harmless no-op stubs.
    async isEventEnabled() { return true; },
  };
  const notifyStub = {
    async notify(accountId, eventKey, payload) {
      notifyCalls.push({ accountId, eventKey, payload });
      return { discord: { sent: 1 }, push: { sent: 1 } };
    },
    verifyUnsubscribeToken() { return null; },
    setExpoFanOut() {},
  };

  stubModule('../db', dbStub, SERVER_PATH);
  stubModule('../notify', notifyStub, SERVER_PATH);

  const server = require('../src/web/server.js');
  return { server, notifyCalls };
}

test('check-in notify tick fans out open + reminder to each recipient', async () => {
  const claim = {
    opens: [
      { tournament_id: 7, name: 'Autumn Cup', starts_at: new Date().toISOString(), checkin_offset_min: 30, recipients: ['111', '222'] },
    ],
    reminders: [
      { tournament_id: 7, name: 'Autumn Cup', starts_at: new Date().toISOString(), recipients: ['222'] },
    ],
  };
  const { server, notifyCalls } = boot({ claim });

  const result = await server._runCheckinNotifyTick();
  assert.equal(result.opens, 1);
  assert.equal(result.reminders, 1);

  // 2 open recipients + 1 reminder recipient = 3 notify() calls.
  assert.equal(notifyCalls.length, 3);
  for (const c of notifyCalls) {
    assert.equal(c.eventKey, 'tournament_checkin');
    assert.ok(c.payload.discord && c.payload.push, 'both channels present');
  }
  const kinds = notifyCalls.map(c => c.payload.push.data.kind).sort();
  assert.deepEqual(kinds, ['tournament_checkin_open', 'tournament_checkin_open', 'tournament_checkin_reminder']);

  // Open notices target both registered players; reminder targets only 222.
  const openRecipients = notifyCalls
    .filter(c => c.payload.push.data.kind === 'tournament_checkin_open')
    .map(c => c.accountId).sort();
  assert.deepEqual(openRecipients, ['111', '222']);
  const reminderRecipients = notifyCalls
    .filter(c => c.payload.push.data.kind === 'tournament_checkin_reminder')
    .map(c => c.accountId);
  assert.deepEqual(reminderRecipients, ['222']);
});

test('check-in notify tick is a no-op when nothing is due', async () => {
  const { server, notifyCalls } = boot({ claim: { opens: [], reminders: [] } });
  const result = await server._runCheckinNotifyTick();
  assert.equal(result.opens, 0);
  assert.equal(result.reminders, 0);
  assert.equal(notifyCalls.length, 0);
});

// Task #543 — dropped-player DQ notifications.
test('DQ sweep tick DMs each dropped player exactly once', async () => {
  const dqSummaries = [
    { tournament_id: 7, name: 'Autumn Cup', removed: 2, removed_account_ids: ['111', '222'] },
    { tournament_id: 9, name: 'Winter Clash', removed: 1, removed_account_ids: ['333'] },
  ];
  const { server, notifyCalls } = boot({ claim: { opens: [], reminders: [] }, dqSummaries });

  const result = await server._runCheckinDqSweepTick();
  assert.equal(result.tournaments, 2);
  assert.equal(result.notified, 3);

  assert.equal(notifyCalls.length, 3);
  for (const c of notifyCalls) {
    assert.equal(c.eventKey, 'tournament_checkin');
    assert.equal(c.payload.push.data.kind, 'tournament_checkin_dq');
    assert.ok(c.payload.discord && c.payload.push, 'both channels present');
  }
  const recipients = notifyCalls.map(c => c.accountId).sort();
  assert.deepEqual(recipients, ['111', '222', '333']);
});

test('DQ sweep tick is a no-op when nobody was dropped', async () => {
  const { server, notifyCalls } = boot({ claim: { opens: [], reminders: [] }, dqSummaries: [] });
  const result = await server._runCheckinDqSweepTick();
  assert.equal(result.tournaments, 0);
  assert.equal(result.notified, 0);
  assert.equal(notifyCalls.length, 0);
});
