const test = require('node:test');
const assert = require('node:assert/strict');

const implementations = [
  ['full', require('../src/discord/mmrRoleReconciler')],
  ['community', require('../community-edition/src/discord/mmrRoleReconciler')],
];

function member(id, roleIds = []) {
  const current = new Set(roleIds);
  return {
    id,
    roles: {
      cache: { has: roleId => current.has(roleId) },
      add: async roleId => current.add(roleId),
      remove: async roleId => current.delete(roleId),
    },
    has: roleId => current.has(roleId),
  };
}

for (const [edition, { resolveLeaderDiscordId, reconcileExclusiveRole }] of implementations) {
  test(`${edition}: exact account mapping resolves the eligible leader`, () => {
    const players = [
      { account_id_32: '11', discord_id: 'discord-old' },
      { account_id_32: '22', discord_id: ' discord-new ' },
    ];
    assert.equal(resolveLeaderDiscordId('22', players), 'discord-new');
    assert.equal(resolveLeaderDiscordId('33', players), null);
  });

  test(`${edition}: leader transition demotes the old holder and promotes the new one`, async () => {
    const oldLeader = member('discord-old', ['top-role']);
    const newLeader = member('discord-new');
    const role = { id: 'top-role', members: new Map([[oldLeader.id, oldLeader]]) };

    const result = await reconcileExclusiveRole(role, newLeader);
    assert.deepEqual(result, { removed: 1, added: true });
    assert.equal(oldLeader.has('top-role'), false);
    assert.equal(newLeader.has('top-role'), true);
  });

  test(`${edition}: no eligible Discord leader clears stale holders`, async () => {
    const oldLeader = member('discord-old', ['top-role']);
    const role = { id: 'top-role', members: new Map([[oldLeader.id, oldLeader]]) };

    const result = await reconcileExclusiveRole(role, null);
    assert.deepEqual(result, { removed: 1, added: false });
    assert.equal(oldLeader.has('top-role'), false);
  });

  test(`${edition}: an already-correct exclusive role is unchanged`, async () => {
    const leader = member('discord-leader', ['top-role']);
    const role = { id: 'top-role', members: new Map([[leader.id, leader]]) };

    const result = await reconcileExclusiveRole(role, leader);
    assert.deepEqual(result, { removed: 0, added: false });
    assert.equal(leader.has('top-role'), true);
  });
}