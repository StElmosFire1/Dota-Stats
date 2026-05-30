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

function boot({ claim, dqSummaries, payoutNudges }) {
  // Reset module cache so server.js re-binds our stubs every boot.
  delete require.cache[SERVER_PATH];

  const notifyCalls = [];
  const markedNotified = [];
  const dbStub = {
    async claimTournamentCheckinNotifications() { return claim; },
    async sweepTournamentCheckInDqs() { return dqSummaries || []; },
    async getPayoutsNeedingConnectNotification() { return payoutNudges || []; },
    async markTournamentPayoutConnectNotified(id) { markedNotified.push(id); return { id }; },
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
  return { server, notifyCalls, markedNotified };
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

// Task #579 — dropped players are told they can reclaim their freed spot.
test('DQ sweep DM invites a reclaim when spots are still open', async () => {
  const dqSummaries = [
    { tournament_id: 7, name: 'Autumn Cup', removed: 1, removed_account_ids: ['111'], max_participants: 8, spots_available: 3 },
  ];
  const { server, notifyCalls } = boot({ claim: { opens: [], reminders: [] }, dqSummaries });
  await server._runCheckinDqSweepTick();
  assert.equal(notifyCalls.length, 1);
  assert.match(notifyCalls[0].payload.push.body, /reclaim/i);
});

// Task #579 — when the freed slots have already been refilled, no reclaim hint.
test('DQ sweep DM omits the reclaim hint when the tournament is full', async () => {
  const dqSummaries = [
    { tournament_id: 9, name: 'Winter Clash', removed: 1, removed_account_ids: ['333'], max_participants: 8, spots_available: 0 },
  ];
  const { server, notifyCalls } = boot({ claim: { opens: [], reminders: [] }, dqSummaries });
  await server._runCheckinDqSweepTick();
  assert.equal(notifyCalls.length, 1);
  assert.doesNotMatch(notifyCalls[0].payload.push.body, /reclaim/i);
});

// Task #545 — connect-a-payout-account nudge for winners with unclaimed prizes.
test('payout connect-nudge DMs each unconnected winner once and stamps them', async () => {
  const payoutNudges = [
    { id: 11, tournament_id: 7, account_id: '111', place: 1, amount_cents: 5000, currency: 'aud', tournament_name: 'Autumn Cup', display_name: 'Alpha' },
    { id: 12, tournament_id: 7, account_id: '222', place: 2, amount_cents: 2500, currency: 'aud', tournament_name: 'Autumn Cup', display_name: 'Bravo' },
  ];
  const { server, notifyCalls, markedNotified } = boot({ claim: { opens: [], reminders: [] }, payoutNudges });

  const result = await server._notifyUnconnectedPayoutWinners();
  assert.equal(result.notified, 2);

  assert.equal(notifyCalls.length, 2);
  for (const c of notifyCalls) {
    assert.equal(c.eventKey, 'tournament_payout_pending');
    assert.equal(c.payload.push.data.kind, 'tournament_payout_pending');
    assert.ok(c.payload.discord && c.payload.push, 'both channels present');
  }
  // Each notified row gets stamped exactly once (one-shot guard).
  assert.deepEqual(markedNotified.sort(), [11, 12]);
  const recipients = notifyCalls.map(c => c.accountId).sort();
  assert.deepEqual(recipients, ['111', '222']);
});

test('payout connect-nudge is a no-op when no winner needs prompting', async () => {
  const { server, notifyCalls, markedNotified } = boot({ claim: { opens: [], reminders: [] }, payoutNudges: [] });
  const result = await server._notifyUnconnectedPayoutWinners();
  assert.equal(result.notified, 0);
  assert.equal(notifyCalls.length, 0);
  assert.equal(markedNotified.length, 0);
});
