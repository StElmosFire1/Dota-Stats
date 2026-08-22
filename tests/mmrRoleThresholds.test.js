const test = require('node:test');
const assert = require('node:assert/strict');

test('full Discord MMR roles match the 5000-centred leaderboard ladder', () => {
  const { config, getMmrTier } = require('../src/config');
  assert.equal(getMmrTier(5000).name, 'Apprentice');
  assert.equal(getMmrTier(7000).name, 'Warlord');
  assert.equal(config.discord.mmrRoles.tiers[0].name, 'King');
  assert.equal(config.discord.mmrRoles.tiers[0].min, Infinity);
  assert.equal(config.discord.mmrRoles.tiers[0].leaderOnly, true);
});

test('community Discord MMR roles do not give fresh players Gaben', () => {
  const { config, getMmrTier } = require('../community-edition/src/config');
  assert.equal(getMmrTier(5000).name, 'Average');
  assert.equal(getMmrTier(7000).name, 'Prime Pick');
  assert.equal(config.discord.mmrRoles.tiers[0].name, 'Gaben');
  assert.equal(config.discord.mmrRoles.tiers[0].min, Infinity);
  assert.equal(config.discord.mmrRoles.tiers[0].leaderOnly, true);
});

for (const [edition, botPath, leaderName] of [
  ['full', '../src/discord/bot.js', 'King'],
  ['community', '../community-edition/src/discord/bot.js', 'Gaben'],
]) {
  test(`${edition} reconciles ${leaderName} separately from MMR-only roles`, () => {
    const fs = require('node:fs');
    const source = fs.readFileSync(require.resolve(botPath), 'utf8');
    assert.match(source, /async _syncLeaderMmrRole\(guild\)/);
    assert.match(source, /t\.roleId && !t\.leaderOnly/);
    assert.match(source, /getComputedLeaderboard\(\)/);
    assert.match(source, /reconcileExclusiveRole\(role, targetMember\)/);
    assert.match(source, /reconcileExclusiveRole\(role, null\)/);
  });
}