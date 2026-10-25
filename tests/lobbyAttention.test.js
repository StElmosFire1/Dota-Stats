const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../web/src/lib/lobbyAttention.js');
const session = { id: 42, status: 'accepting', accept_phase_starts_at: '2026-10-25T00:00:00Z', captain1_account_id: 10, captain2_account_id: 20 };
const players = [{ account_id: 10, status: 'registered' }, { account_id: 20, status: 'accepted' }];

test('only participating players receive reminders; accepted and declined users are not nagged', async () => {
  const { lobbyAttention } = await load();
  assert.equal(lobbyAttention(session, players, 30), null);
  assert.equal(lobbyAttention(null, players, 10), null);
  assert.equal(lobbyAttention(session, players, null), null);
  assert.equal(lobbyAttention(session, players, 20), null);
  assert.equal(lobbyAttention(session, [{ account_id: 10, status: 'declined' }], 10), null);
  assert.match(lobbyAttention(session, players, '10').message, /accept/);
});

test('draft reminders use authoritative turn and pick index, including back-to-back picks', async () => {
  const { lobbyAttention } = await load();
  const s = { ...session, status: 'drafting' };
  const first = lobbyAttention(s, players, 20, { currentPickerTeam: 2, pickIdx: 1 });
  const second = lobbyAttention(s, players, 20, { currentPickerTeam: 2, pickIdx: 2 });
  assert.notEqual(first.key, second.key);
  assert.match(first.message, /your turn/);
  assert.doesNotMatch(lobbyAttention(s, players, 10, { currentPickerTeam: 2, pickIdx: 1 }).message, /your turn/);
});

test('draft completion supports manual matches, and match-ready/error events are distinct', async () => {
  const { lobbyAttention } = await load();
  assert.match(lobbyAttention({ ...session, status: 'drafting' }, players, 10, { complete: true }).message, /drafting is complete/);
  assert.match(lobbyAttention({ ...session, status: 'in_progress' }, players, 10).message, /match is ready/);
  assert.match(lobbyAttention({ ...session, status: 'server_failed' }, players, 10).message, /failed/);
  assert.equal(lobbyAttention({ ...session, status: 'completed' }, players, 10), null);
  assert.equal(lobbyAttention({ ...session, status: 'cancelled' }, players, 10), null);
});
