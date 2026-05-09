'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  classifyIconOnly,
  classifyBraceExpression,
  isSingleBraceExpression,
} = require('../scripts/check-a11y');

// -----------------------------------------------------------------------------
// isSingleBraceExpression
// -----------------------------------------------------------------------------
test('isSingleBraceExpression: matches a single balanced {…}', () => {
  assert.strictEqual(isSingleBraceExpression('{icon}'), true);
  assert.strictEqual(isSingleBraceExpression('{a ? "x" : "y"}'), true);
  assert.strictEqual(isSingleBraceExpression('{t("save")}'), true);
  assert.strictEqual(isSingleBraceExpression('{`Hi ${n}`}'), true);
  assert.strictEqual(isSingleBraceExpression('{ {nested:1} }'), true);
});

test('isSingleBraceExpression: rejects mixed content and unbalanced input', () => {
  assert.strictEqual(isSingleBraceExpression('×{icon}'), false);
  assert.strictEqual(isSingleBraceExpression('{a}{b}'), false);
  assert.strictEqual(isSingleBraceExpression('{a}'.slice(0, 2)), false);
  assert.strictEqual(isSingleBraceExpression('plain text'), false);
});

// -----------------------------------------------------------------------------
// Text-y expressions — classifyIconOnly should SKIP (return null), Task #183.
// -----------------------------------------------------------------------------
test('classifyIconOnly: skips string-literal label expressions', () => {
  assert.strictEqual(classifyIconOnly('{"Save"}'), null);
  assert.strictEqual(classifyIconOnly("{'Cancel'}"), null);
  assert.strictEqual(classifyIconOnly('{`Hello ${name}`}'), null);
});

test('classifyIconOnly: skips ternaries with string branches', () => {
  assert.strictEqual(classifyIconOnly('{open ? "Hide" : "Show"}'), null);
  assert.strictEqual(classifyIconOnly("{loading ? 'Saving…' : 'Save'}"), null);
});

test('classifyIconOnly: skips i18n-style call expressions', () => {
  assert.strictEqual(classifyIconOnly('{t("save")}'), null);
  assert.strictEqual(classifyIconOnly("{i18n.t('save')}"), null);
  assert.strictEqual(classifyIconOnly('{tr("close")}'), null);
});

test('classifyIconOnly: stays lenient on ambiguous bare identifiers', () => {
  // `{label}` could be a string variable; the static check can't tell, so
  // we keep the previous lenient behaviour and skip.
  assert.strictEqual(classifyIconOnly('{label}'), null);
  assert.strictEqual(classifyIconOnly('{count}'), null);
  assert.strictEqual(classifyIconOnly('{props.label}'), null);
});

// -----------------------------------------------------------------------------
// Icon expressions — classifyIconOnly should FLAG (return non-null).
// -----------------------------------------------------------------------------
test('classifyIconOnly: flags inline JSX icon elements wrapped in braces', () => {
  assert.match(classifyIconOnly('{<CloseIcon/>}') || '', /<CloseIcon>/);
  assert.match(classifyIconOnly('{<svg width="12"/>}') || '', /<svg>/);
  assert.match(classifyIconOnly('{<ChevronSvg />}') || '', /<ChevronSvg>/);
});

test('classifyIconOnly: flags bare identifier references ending in Icon/Svg', () => {
  assert.match(classifyIconOnly('{CloseIcon}') || '', /icon component reference/);
  assert.match(classifyIconOnly('{closeSvg}') || '', /icon component reference/);
});

test('classifyIconOnly: flags member-access references ending in Icon/Svg', () => {
  assert.match(classifyIconOnly('{Icons.closeIcon}') || '', /icon component reference/);
  assert.match(classifyIconOnly('{props.dismissSvg}') || '', /icon component reference/);
});

// -----------------------------------------------------------------------------
// Existing shapes still work as before.
// -----------------------------------------------------------------------------
test('classifyIconOnly: still flags single-glyph buttons (×, ⌄, →)', () => {
  assert.match(classifyIconOnly('×') || '', /single glyph/);
  assert.match(classifyIconOnly('⌄') || '', /single glyph/);
});

test('classifyIconOnly: still flags single non-brace icon children', () => {
  assert.match(classifyIconOnly('<CloseIcon />') || '', /<CloseIcon\/>/);
  assert.match(classifyIconOnly('<svg viewBox="0 0 1 1"/>') || '', /<svg\/>/);
});

test('classifyIconOnly: still skips visible text and letter/digit glyphs', () => {
  assert.strictEqual(classifyIconOnly('Save'), null);
  assert.strictEqual(classifyIconOnly('A'), null);
  assert.strictEqual(classifyIconOnly('7'), null);
  assert.strictEqual(classifyIconOnly(''), null);
});

// -----------------------------------------------------------------------------
// classifyBraceExpression direct unit tests for the inner expression.
// -----------------------------------------------------------------------------
test('classifyBraceExpression: handles edge cases', () => {
  assert.strictEqual(classifyBraceExpression(''), null);
  assert.strictEqual(classifyBraceExpression('<div/>'), null); // non-icon JSX
  assert.match(classifyBraceExpression('<svg/>') || '', /<svg>/);
  assert.match(classifyBraceExpression('CloseIcon') || '', /icon component reference/);
  assert.strictEqual(classifyBraceExpression('label'), null);
});
