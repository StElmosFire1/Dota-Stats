// tests/replayIntelligenceFieldRegistry.test.js
//
// Full-edition replay intelligence — field registry tests.

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  FIELD_REGISTRY,
  getAllFields,
  getFieldsByStatus,
  getFieldsByCategory,
  getPublicFields,
  getParticipantFields,
  getField,
  registrySummary,
  getAllowedFieldKeys,
} = require('../src/replay/intelligence/fieldRegistry');

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

test('field registry: every field has required shape', () => {
  const VALID_STATUSES    = new Set(['available','derivable','parser_extension','patch_limited','unavailable']);
  const VALID_RETENTIONS  = new Set(['public','participant','admin','private']);
  const VALID_PRIVACIES   = new Set(['none','position','chat','coaching','path']);
  const VALID_VISIBILITIES = new Set(['always','feature_flag','admin_only','opt_in']);
  const VALID_CONFIDENCE  = new Set(['high','medium','low']);

  for (const f of FIELD_REGISTRY) {
    assert.ok(typeof f.key === 'string' && f.key.length > 0,
      `field missing key: ${JSON.stringify(f)}`);
    assert.ok(typeof f.label === 'string' && f.label.length > 0,
      `field ${f.key} missing label`);
    assert.ok(typeof f.category === 'string' && f.category.length > 0,
      `field ${f.key} missing category`);
    assert.ok(VALID_STATUSES.has(f.status),
      `field ${f.key} has invalid status "${f.status}"`);
    assert.ok(typeof f.source === 'string' && f.source.length > 0,
      `field ${f.key} missing source`);
    assert.ok(VALID_CONFIDENCE.has(f.confidence),
      `field ${f.key} has invalid confidence "${f.confidence}"`);
    assert.ok(VALID_RETENTIONS.has(f.retention),
      `field ${f.key} has invalid retention "${f.retention}"`);
    assert.ok(VALID_PRIVACIES.has(f.privacy),
      `field ${f.key} has invalid privacy "${f.privacy}"`);
    assert.ok(VALID_VISIBILITIES.has(f.visibility),
      `field ${f.key} has invalid visibility "${f.visibility}"`);
  }
});

test('field registry: no duplicate keys', () => {
  const keys = FIELD_REGISTRY.map(f => f.key);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, 'Duplicate keys found in registry');
});

test('field registry: contains expected categories', () => {
  const categories = new Set(FIELD_REGISTRY.map(f => f.category));
  for (const expected of ['draft','chat','position','fights','economy','abilities','vision','laning','objectives','movement','coaching','internal']) {
    assert.ok(categories.has(expected), `Missing category: ${expected}`);
  }
});

// ---------------------------------------------------------------------------
// Known fields coverage — spot-check representative entries
// ---------------------------------------------------------------------------

test('field registry: draft.pick_ban_order is available + public', () => {
  const f = getField('draft.pick_ban_order');
  assert.ok(f, 'draft.pick_ban_order missing');
  assert.equal(f.status, 'available');
  assert.equal(f.retention, 'public');
  assert.equal(f.visibility, 'always');
});

test('field registry: chat.chat_wheel is admin-only with chat privacy', () => {
  const f = getField('chat.chat_wheel');
  assert.ok(f, 'chat.chat_wheel missing');
  assert.equal(f.retention, 'admin');
  assert.equal(f.privacy, 'chat');
  assert.equal(f.visibility, 'admin_only');
});

test('field registry: position.one_second_samples needs parser extension and is participant', () => {
  const f = getField('position.one_second_samples');
  assert.ok(f);
  assert.equal(f.status, 'parser_extension');
  assert.equal(f.retention, 'participant');
  assert.equal(f.privacy, 'position');
});

test('field registry: position.trails requires opt-in with path privacy', () => {
  const f = getField('position.trails');
  assert.ok(f);
  assert.equal(f.status, 'parser_extension');
  assert.equal(f.privacy, 'path');
  assert.equal(f.visibility, 'opt_in');
});

test('field registry: fights.structured_blocks is available + public', () => {
  const f = getField('fights.structured_blocks');
  assert.ok(f);
  assert.equal(f.status, 'available');
  assert.equal(f.retention, 'public');
});

test('field registry: fights.net_worth_swing is derivable', () => {
  const f = getField('fights.net_worth_swing');
  assert.ok(f);
  assert.equal(f.status, 'derivable');
});

test('field registry: coaching fields are participant-only and opt-in', () => {
  const coachingFields = getFieldsByCategory('coaching');
  assert.ok(coachingFields.length >= 5, 'Expected at least 5 coaching fields');
  for (const f of coachingFields) {
    assert.equal(f.retention, 'participant',
      `coaching field ${f.key} should be participant`);
    assert.equal(f.visibility, 'opt_in',
      `coaching field ${f.key} should be opt_in`);
    assert.equal(f.privacy, 'coaching',
      `coaching field ${f.key} should have coaching privacy`);
  }
});

test('field registry: internal fields are private + admin-only', () => {
  const internal = getFieldsByCategory('internal');
  assert.ok(internal.length >= 2);
  for (const f of internal) {
    assert.equal(f.retention, 'private');
    assert.equal(f.visibility, 'admin_only');
  }
});

test('field registry: replay_path and chat_text are private', () => {
  const replayPath = getField('internal.replay_path');
  assert.ok(replayPath);
  assert.equal(replayPath.retention, 'private');
  assert.equal(replayPath.privacy, 'path');

  const chatText = getField('internal.chat_text');
  assert.ok(chatText);
  assert.equal(chatText.retention, 'private');
  assert.equal(chatText.privacy, 'chat');
});

test('field registry: buyback fields cover timeline, timing, delay, cost, outcome', () => {
  const requiredKeys = [
    'buyback.full_timeline',
    'buyback.timing',
    'buyback.death_to_bb_delay',
    'buyback.likely_cost',
    'buyback.outcome',
  ];
  for (const key of requiredKeys) {
    const f = getField(key);
    assert.ok(f, `Missing buyback field: ${key}`);
  }
});

test('field registry: rune type breakdown is available', () => {
  const f = getField('runes.type_breakdown');
  assert.ok(f);
  assert.equal(f.status, 'available');
});

test('field registry: ward placement timeline is available', () => {
  const f = getField('wards.placement_timeline');
  assert.ok(f);
  assert.equal(f.status, 'available');
});

test('field registry: smoke timeline is available', () => {
  const f = getField('smoke.timeline');
  assert.ok(f);
  assert.equal(f.status, 'available');
});

test('field registry: talent choices and timing are available', () => {
  assert.ok(getField('abilities.talent_choices')?.status === 'available');
  assert.ok(getField('abilities.talent_timing')?.status  === 'available');
});

test('field registry: facet/innate is patch_limited', () => {
  const f = getField('abilities.facet_innate');
  assert.ok(f);
  assert.equal(f.status, 'patch_limited');
});

test('field registry: tormentor timing is patch_limited', () => {
  const f = getField('objectives.tormentor_timing');
  assert.ok(f);
  assert.equal(f.status, 'patch_limited');
});

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

test('getFieldsByStatus returns only matching fields', () => {
  const available = getFieldsByStatus('available');
  assert.ok(available.length > 0);
  assert.ok(available.every(f => f.status === 'available'));
  const derivable = getFieldsByStatus('derivable');
  assert.ok(derivable.every(f => f.status === 'derivable'));
  assert.deepEqual(getFieldsByStatus(''), []);
  assert.deepEqual(getFieldsByStatus(null), []);
});

test('getFieldsByCategory returns only matching fields', () => {
  const fights = getFieldsByCategory('fights');
  assert.ok(fights.length >= 8);
  assert.ok(fights.every(f => f.category === 'fights'));
});

test('getPublicFields returns only public-retention fields', () => {
  const pub = getPublicFields();
  assert.ok(pub.length > 0);
  assert.ok(pub.every(f => f.retention === 'public'));
});

test('getParticipantFields includes public and participant fields', () => {
  const part = getParticipantFields();
  const pub  = getPublicFields();
  assert.ok(part.length >= pub.length);
  assert.ok(part.every(f => f.retention === 'public' || f.retention === 'participant'));
});

test('getField returns undefined for unknown key', () => {
  assert.equal(getField('no.such.field'), undefined);
});

test('getAllFields returns full registry copy', () => {
  const all = getAllFields();
  assert.equal(all.length, FIELD_REGISTRY.length);
  assert.notEqual(all, FIELD_REGISTRY); // is a copy
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

test('registrySummary returns expected shape', () => {
  const s = registrySummary();
  assert.equal(typeof s.total, 'number');
  assert.ok(s.total > 30, 'Expected at least 30 registered fields');
  assert.ok(s.byStatus.available    > 0);
  assert.ok(s.byStatus.derivable    > 0);
  assert.ok(s.byStatus.parser_extension > 0);
  assert.ok(s.byCategory.draft      > 0);
  assert.ok(s.byCategory.fights     > 0);
  assert.ok(s.byRetention.public    > 0);
  assert.ok(s.byRetention.private   > 0);
});

// ---------------------------------------------------------------------------
// Visibility filter
// ---------------------------------------------------------------------------

test('getAllowedFieldKeys(public) excludes private and participant fields', () => {
  const keys = getAllowedFieldKeys('public');
  // No private fields
  for (const f of FIELD_REGISTRY.filter(f2 => f2.retention === 'private')) {
    assert.ok(!keys.includes(f.key), `private field ${f.key} found in public keys`);
  }
  // No participant-only fields
  for (const f of FIELD_REGISTRY.filter(f2 => f2.retention === 'participant')) {
    assert.ok(!keys.includes(f.key), `participant field ${f.key} found in public keys`);
  }
});

test('getAllowedFieldKeys(participant) includes public and participant but not private', () => {
  const keys = getAllowedFieldKeys('participant');
  for (const f of FIELD_REGISTRY.filter(f2 => f2.retention === 'private')) {
    assert.ok(!keys.includes(f.key), `private field ${f.key} found in participant keys`);
  }
  const coachKey = 'coaching.fight_attendance_rate';
  assert.ok(keys.includes(coachKey), 'participant fields should include coaching');
});

test('getAllowedFieldKeys(admin) includes all fields', () => {
  const keys = getAllowedFieldKeys('admin');
  assert.equal(keys.length, FIELD_REGISTRY.length);
});
