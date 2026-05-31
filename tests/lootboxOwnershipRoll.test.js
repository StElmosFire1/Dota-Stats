'use strict';

const test = require('node:test');
const assert = require('node:assert');

const catalog = require('../src/monetization/lootbox/catalog');

// Deterministic rng helper: returns each value in `seq` in turn, then 0.
function seqRng(seq) {
  let i = 0;
  return () => (i < seq.length ? seq[i++] : 0);
}

// All eligible item SKUs for a box at a given rarity (no sets retired).
function bucketSkus(boxId, rarity) {
  return catalog
    .eligibleItems(boxId, [])
    .filter((it) => it.rarity === rarity)
    .map((it) => it.sku);
}

test('rollDrop without ownership returns an eligible item (raw odds preserved)', () => {
  const pick = catalog.rollDrop('common', [], seqRng([0.0, 0.0]));
  assert.ok(pick && pick.sku, 'a pick is returned');
  assert.ok(bucketSkus('common', pick.rarity).includes(pick.sku));
});

test('unowned item exists in rolled rarity -> never a duplicate', () => {
  // Force the common rarity bucket (first rarity, roll well within its weight).
  const commons = bucketSkus('common', 'common');
  assert.ok(commons.length >= 2, 'need >=2 commons for this test');

  // Own all-but-one common. The roll must land on the single unowned one,
  // regardless of which item index the second rng draw points at.
  const unowned = commons[0];
  const owned = new Set(commons.slice(1));
  for (const itemDraw of [0, 0.25, 0.5, 0.75, 0.999]) {
    const pick = catalog.rollDrop('common', [], seqRng([0.0, itemDraw]), owned);
    assert.strictEqual(pick.sku, unowned, `landed on the only unowned common (draw=${itemDraw})`);
    assert.ok(!owned.has(pick.sku), 'pick is not owned');
  }
});

test('all items in rolled rarity owned -> falls back to a duplicate of that rarity', () => {
  const commons = bucketSkus('common', 'common');
  const ownedAll = new Set(commons);
  const pick = catalog.rollDrop('common', [], seqRng([0.0, 0.0]), ownedAll);
  assert.strictEqual(pick.rarity, 'common', 'still a common (rarity odds untouched)');
  assert.ok(ownedAll.has(pick.sku), 'pick is a duplicate (everything in bucket owned)');
});

test('ownership-aware roll keeps the rolled rarity (distribution untouched)', () => {
  // Roll into the rare bucket of the common crate (common=80, rare=18): a roll
  // value of 0.9*total lands past common into rare. Own all rares so it dupes,
  // proving the rarity itself is still respected even on the dupe path.
  const rares = bucketSkus('common', 'rare');
  const ownedRares = new Set(rares);
  // total weight = 80+18+2 = 100; roll fraction 0.85 -> 85 -> within rare bucket.
  const pick = catalog.rollDrop('common', [], seqRng([0.85, 0.0]), ownedRares);
  assert.strictEqual(pick.rarity, 'rare');
  assert.ok(ownedRares.has(pick.sku));
});

test('pro_time chase is never treated as owned (stays rollable)', () => {
  // Legendary Vault: legendary bucket includes pro_time:30 plus cosmetics.
  // Even if the player owns every legendary *cosmetic*, pro_time must remain a
  // candidate (it is never written to coin_owned_cosmetics).
  const legendaryCosmetics = catalog
    .eligibleItems('legendary', [])
    .filter((it) => it.rarity === 'legendary' && it.kind !== 'pro_time')
    .map((it) => it.sku);
  const owned = new Set(legendaryCosmetics);

  const legendaryBucket = catalog
    .eligibleItems('legendary', [])
    .filter((it) => it.rarity === 'legendary');
  const proTime = legendaryBucket.find((it) => it.kind === 'pro_time');
  assert.ok(proTime, 'legendary bucket has a pro_time chase item');

  // With all legendary cosmetics owned, the only unowned candidate is pro_time,
  // so any in-bucket draw must resolve to it.
  for (const itemDraw of [0, 0.5, 0.999]) {
    const pick = catalog.rollDrop('legendary', [], seqRng([0.999, itemDraw]), owned);
    assert.strictEqual(pick.rarity, 'legendary');
    assert.strictEqual(pick.kind, 'pro_time', `unowned pro_time chosen (draw=${itemDraw})`);
  }
});
