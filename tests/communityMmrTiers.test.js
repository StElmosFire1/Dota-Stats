const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const tierModuleUrl = pathToFileURL(
  path.join(__dirname, '..', 'community-edition', 'web', 'src', 'mmrTiers.mjs')
).href;

test('community MMR tiers use the 5000-centred rating scale', async () => {
  const { getTier } = await import(tierModuleUrl);
  assert.equal(getTier(5000).name, 'Average');
  assert.equal(getTier(5600).name, 'Solid');
  assert.equal(getTier(7000).name, 'Prime Pick');
});

test('Gaben is reserved for the leaderboard leader', async () => {
  const { getTier } = await import(tierModuleUrl);
  assert.notEqual(getTier(99999).name, 'Gaben');
  assert.equal(getTier(5000, { isLeader: true }).name, 'Gaben');
});

test('invalid and very low MMR fall back to Position 6', async () => {
  const { getTier } = await import(tierModuleUrl);
  assert.equal(getTier(null).name, 'Position 6');
  assert.equal(getTier('not-a-number').name, 'Position 6');
  assert.equal(getTier(-100).name, 'Position 6');
});