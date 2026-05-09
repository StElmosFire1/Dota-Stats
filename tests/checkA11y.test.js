'use strict';

const test = require('node:test');
const assert = require('node:assert');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  classifyIconOnly,
  classifyBraceExpression,
  isSingleBraceExpression,
  scanFile,
  scanCssFile,
} = require('../scripts/check-a11y');

// -----------------------------------------------------------------------------
// Helpers for fixture-based tests of scanFile / scanCssFile. Each pass is
// exercised by writing a tiny JSX or CSS snippet to a temp file under a per-
// test directory and asserting on the returned issue list. Using real files
// (rather than refactoring scanFile to take a string) keeps the tested code
// path identical to what runs in CI, including how file names appear in
// messages.
// -----------------------------------------------------------------------------
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'check-a11y-tests-'));

function writeJsx(name, content) {
  const file = path.join(TMP_ROOT, `${name}.jsx`);
  fs.writeFileSync(file, content);
  return file;
}
function writeCss(name, content) {
  const file = path.join(TMP_ROOT, `${name}.css`);
  fs.writeFileSync(file, content);
  return file;
}
function scanJsx(name, content) {
  return scanFile(writeJsx(name, content));
}
function scanCss(name, content) {
  return scanCssFile(writeCss(name, content));
}
function messages(issues) {
  return issues.map((i) => i.message).join('\n');
}

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

// =============================================================================
// Pass 1 — non-interactive onClick triad (and <th onClick>).
// =============================================================================
test('pass1: flags <div onClick> missing the role+tabIndex+onKeyDown triad', () => {
  const issues = scanJsx('p1_div_naked', `
export default function X() {
  return <div onClick={() => {}}>click me</div>;
}
`);
  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].tag, 'div');
  assert.match(issues[0].message, /role="button"/);
  assert.match(issues[0].message, /tabIndex/);
  assert.match(issues[0].message, /onKeyDown/);
});

test('pass1: accepts a div with the full triad', () => {
  const issues = scanJsx('p1_div_full', `
export default function X() {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {}}
      onKeyDown={() => {}}
    >ok</div>
  );
}
`);
  assert.deepStrictEqual(issues, []);
});

test('pass1: rejects a non-actionable role= on an action handler', () => {
  // role="article" satisfies a naive role= check but is not interactive.
  const issues = scanJsx('p1_role_article', `
export default function X() {
  return <div role="article" tabIndex={0} onClick={() => {}} onKeyDown={() => {}}>x</div>;
}
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /role="button"/);
});

test('pass1: accepts each documented escape-hatch role (presentation/none/dialog)', () => {
  for (const role of ['presentation', 'none', 'dialog']) {
    const issues = scanJsx(`p1_role_${role}`, `
export default function X() { return <div role="${role}" onClick={() => {}}>x</div>; }
`);
    assert.deepStrictEqual(issues.filter((i) => i.tag === 'div'), [],
      `role="${role}" should be accepted as a non-actionable container`);
  }
});

test('pass1: <th onClick> always demands SortableTh, even with the triad', () => {
  const issues = scanJsx('p1_th', `
export default function X() {
  return <table><thead><tr>
    <th role="button" tabIndex={0} onClick={() => {}} onKeyDown={() => {}}>Name</th>
  </tr></thead></table>;
}
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /SortableTh/);
});

test('pass1: ignores native interactive elements (button, a)', () => {
  const issues = scanJsx('p1_native', `
export default function X() {
  return <><button onClick={() => {}}>Save</button><a onClick={() => {}} href="/x">go</a></>;
}
`);
  assert.deepStrictEqual(issues, []);
});

test('pass1: ignores PascalCase React components', () => {
  const issues = scanJsx('p1_pascal', `
export default function X() {
  return <Card onClick={() => {}}>x</Card>;
}
`);
  assert.deepStrictEqual(issues, []);
});

test('pass1: accepts expression-form role={…} containing an actionable role literal', () => {
  const issues = scanJsx('p1_role_expr', `
export default function X({ canPick }) {
  return <div role={canPick ? 'button' : undefined} tabIndex={0} onClick={() => {}} onKeyDown={() => {}}>x</div>;
}
`);
  assert.deepStrictEqual(issues, []);
});

// =============================================================================
// Pass 2 — custom switch/toggle/radio shape (Task #169).
// =============================================================================
test('pass2: flags <div className="toggle"> with onClick but no ARIA', () => {
  const issues = scanJsx('p2_toggle_naked', `
export default function X() {
  return <div className="toggle" onClick={() => {}} />;
}
`);
  const toggleIssues = issues.filter((i) => /custom switch/.test(i.message));
  assert.strictEqual(toggleIssues.length, 1);
  assert.match(toggleIssues[0].message, /role="switch"/);
});

test('pass2: accepts role="switch" + aria-checked', () => {
  const issues = scanJsx('p2_switch_ok', `
export default function X({ on }) {
  return <div className="dark-mode-toggle" role="switch" aria-checked={on} onClick={() => {}} tabIndex={0} onKeyDown={() => {}} />;
}
`);
  assert.deepStrictEqual(issues.filter((i) => /custom switch/.test(i.message)), []);
});

test('pass2: flags <span className="my-radio"> without role/aria-checked', () => {
  const issues = scanJsx('p2_radio_naked', `
export default function X() {
  return <span className="my-radio" onChange={() => {}} />;
}
`);
  const radioIssues = issues.filter((i) => /custom radio/.test(i.message));
  assert.strictEqual(radioIssues.length, 1);
  assert.match(radioIssues[0].message, /role="radio"/);
});

test('pass2: accepts role="radiogroup" container without per-item aria-checked', () => {
  const issues = scanJsx('p2_radiogroup', `
export default function X() {
  return <div className="my-radio" role="radiogroup" onClick={() => {}} />;
}
`);
  assert.deepStrictEqual(issues.filter((i) => /custom radio/.test(i.message)), []);
});

test('pass2: ignores wrapper-style class tokens (toggle-row, switch-group, radio-list)', () => {
  for (const cls of ['toggle-row', 'switch-group', 'radio-list']) {
    const issues = scanJsx(`p2_wrapper_${cls.replace(/-/g, '_')}`, `
export default function X() { return <div className="${cls}" onClick={() => {}} />; }
`);
    assert.deepStrictEqual(issues.filter((i) => /custom (switch|radio)/.test(i.message)), [],
      `wrapper class "${cls}" should not be flagged as a custom toggle/radio`);
  }
});

test('pass2: ignores decorative element (no interactive handler)', () => {
  const issues = scanJsx('p2_decorative', `
export default function X() { return <div className="toggle" />; }
`);
  assert.deepStrictEqual(issues.filter((i) => /custom switch/.test(i.message)), []);
});

// =============================================================================
// Pass 3 — icon-only button label (Task #175 / #183).
// =============================================================================
test('pass3: flags <button>×</button> without aria-label', () => {
  const issues = scanJsx('p3_glyph', `
export default function X() { return <button onClick={() => {}}>×</button>; }
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /icon-only/);
  assert.match(issues[0].message, /aria-label/);
});

test('pass3: accepts <button aria-label="Close">×</button>', () => {
  const issues = scanJsx('p3_glyph_labeled', `
export default function X() { return <button aria-label="Close" onClick={() => {}}>×</button>; }
`);
  assert.deepStrictEqual(issues, []);
});

test('pass3: accepts aria-labelledby as an alternative', () => {
  const issues = scanJsx('p3_labelledby', `
export default function X() { return <button aria-labelledby="t" onClick={() => {}}>×</button>; }
`);
  assert.deepStrictEqual(issues, []);
});

test('pass3: flags single SVG child without aria-label', () => {
  const issues = scanJsx('p3_svg_child', `
export default function X() { return <button onClick={() => {}}><svg viewBox="0 0 1 1"/></button>; }
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /icon-only/);
});

test('pass3: flags icon-component child without aria-label', () => {
  const issues = scanJsx('p3_icon_child', `
export default function X() { return <button onClick={() => {}}><CloseIcon /></button>; }
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /icon-only/);
});

test('pass3: skips visible text content', () => {
  const issues = scanJsx('p3_text', `
export default function X() { return <button onClick={() => {}}>Save</button>; }
`);
  assert.deepStrictEqual(issues, []);
});

test('pass3: skips dynamic JSX expression that may carry a text label', () => {
  const issues = scanJsx('p3_dynamic', `
export default function X({ label }) { return <button onClick={() => {}}>{label}</button>; }
`);
  assert.deepStrictEqual(issues, []);
});

test('pass3: flags {<Icon/>} bracketed icon expression child', () => {
  const issues = scanJsx('p3_brace_icon', `
export default function X() { return <button onClick={() => {}}>{<CloseIcon/>}</button>; }
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /icon-only/);
});

test('pass3: skips title attribute (not an accessible name substitute)', () => {
  // title is intentionally NOT accepted, so this should still flag.
  const issues = scanJsx('p3_title', `
export default function X() { return <button title="Close" onClick={() => {}}>×</button>; }
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /icon-only/);
});

test('pass3: skips self-closing button (no children)', () => {
  const issues = scanJsx('p3_selfclose', `
export default function X() { return <button onClick={() => {}} />; }
`);
  assert.deepStrictEqual(issues, []);
});

// =============================================================================
// Pass 4 — hand-rolled `role="dialog"` (Task #182).
// =============================================================================
test('pass4: flags hand-rolled role="dialog" outside the canonical Dialog primitive', () => {
  const issues = scanJsx('p4_dialog_handrolled', `
export default function X() {
  return <div role="dialog" aria-modal="true">…</div>;
}
`);
  const dlg = issues.filter((i) => /Hand-rolled/.test(i.message));
  assert.strictEqual(dlg.length, 1);
  assert.match(dlg[0].message, /shared <Dialog>/);
});

test('pass4: skips expression-form role={…} (nothing to inspect statically)', () => {
  const issues = scanJsx('p4_role_expr', `
export default function X({ kind }) { return <div role={kind === 'm' ? 'dialog' : undefined} />; }
`);
  assert.deepStrictEqual(issues.filter((i) => /Hand-rolled/.test(i.message)), []);
});

test('pass4: allow-listed Dialog primitive may ship role="dialog"', () => {
  // Simulate the canonical primitive by writing into the exact allow-listed
  // path. We resolve it relative to the project root the script uses.
  const ROOT = path.resolve(__dirname, '..');
  const allowListed = path.join(ROOT, 'web', 'src', 'components', 'Dialog.jsx');
  // The real file already exists. Confirm it parses with no Hand-rolled flag.
  if (fs.existsSync(allowListed)) {
    const issues = scanFile(allowListed);
    assert.deepStrictEqual(
      issues.filter((i) => /Hand-rolled/.test(i.message)),
      [],
      'canonical Dialog.jsx must not be flagged'
    );
  }
});

// =============================================================================
// Pass 5 — CSS hover-reveal parity (Task #170).
// =============================================================================
test('pass5: flags `.card:hover .panel` with no :focus-within counterpart', () => {
  const issues = scanCss('p5_combinator_naked', `
.card:hover .panel { display: block; }
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /reveals a descendant\/sibling element/);
});

test('pass5: accepts `:hover` + `:focus-within` parity on the same selector', () => {
  const issues = scanCss('p5_combinator_ok', `
.card:hover .panel,
.card:focus-within .panel { display: block; }
`);
  assert.deepStrictEqual(issues, []);
});

test('pass5: accepts `:hover` + `:focus-visible` parity', () => {
  const issues = scanCss('p5_combinator_ok2', `
.tip:hover .pop { opacity: 1; }
.tip:focus-visible .pop { opacity: 1; }
`);
  assert.deepStrictEqual(issues, []);
});

test('pass5: flags `:hover` body that sets a reveal property (display)', () => {
  const issues = scanCss('p5_prop_naked', `
.menu:hover { display: block; }
`);
  assert.strictEqual(issues.length, 1);
  assert.match(issues[0].message, /sets a reveal property \(display\)/);
});

test('pass5: ignores pure cosmetic `:hover` tweaks (color, background, border, transform)', () => {
  const issues = scanCss('p5_cosmetic', `
.btn:hover { color: red; background: blue; border-color: green; transform: scale(1.1); }
`);
  assert.deepStrictEqual(issues, []);
});

test('pass5: descends into @media blocks and matches focus counterparts inside them', () => {
  const issues = scanCss('p5_media', `
@media (min-width: 600px) {
  .card:hover .panel { display: block; }
  .card:focus-within .panel { display: block; }
}
`);
  assert.deepStrictEqual(issues, []);
});

test('pass5: skips @keyframes blocks (no focus/hover semantics)', () => {
  const issues = scanCss('p5_keyframes', `
@keyframes spin {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.btn:hover { color: red; }
`);
  assert.deepStrictEqual(issues, []);
});

test('pass5: each :hover combinator shape (descendant, child, +, ~) is detected', () => {
  for (const sel of ['.x:hover .y', '.x:hover > .y', '.x:hover + .y', '.x:hover ~ .y']) {
    const issues = scanCss(`p5_shape_${Buffer.from(sel).toString('hex')}`,
      `${sel} { display: block; }`);
    assert.strictEqual(issues.length, 1, `expected ${sel} to be flagged`);
  }
});
