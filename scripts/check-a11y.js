#!/usr/bin/env node
/**
 * scripts/check-a11y.js
 *
 * Lightweight static gate for the "Frontend accessibility house rule"
 * documented in replit.md. Scans both web/src/ and community-edition/web/src/
 * for the shapes that have repeatedly slipped through PRs (Tasks #158 / #161 /
 * #164):
 *
 *   - <div onClick> / <span onClick> / etc. used as actions without the
 *     documented role="button" + tabIndex + onKeyDown triad. Modal-backdrop
 *     style click-outside handlers are allowed when the element carries
 *     role="presentation" or role="none".
 *   - <th onClick> — must use the shared <SortableTh> component instead.
 *   - <div>/<span> styled as a custom switch/toggle/radio (className contains
 *     a `switch`/`toggle`/`radio` token) and wired to a click/change handler
 *     but missing the matching ARIA role + state attribute
 *     (`role="switch"`+`aria-checked`, `role="radio"`+`aria-checked`, or a
 *     `role="radiogroup"` container). Task #169.
 *   - <button>/<a> elements whose only visible content is a single non-letter
 *     glyph (×, ✕, ✖, ⌄, etc.) or a single icon component (e.g. <Icon …/>,
 *     <svg …/>) and that are missing both `aria-label` and `aria-labelledby`.
 *     The house rule names "Button-as-icon-only must carry an aria-label"
 *     explicitly. Task #175.
 *   - JSX `role="dialog"` outside the canonical <Dialog> primitive
 *     (`web/src/components/Dialog.jsx` / `community-edition/web/src/components/
 *     Dialog.jsx`). Modals MUST go through the shared primitive — hand-rolled
 *     `<div role="dialog">`+ad-hoc `onKeyDown` is forbidden. Task #182.
 *   - JSX mouse handlers (onMouseEnter/onMouseLeave/onMouseOver/onMouseOut)
 *     that drive a state change (handler body invokes a `set...(...)` call)
 *     but ship without the matching onFocus/onBlur — keyboard users would
 *     never see the same reveal. Cosmetic-only handlers (e.g. inline
 *     `e.currentTarget.style.background = …`) are intentionally allowed.
 *     Task #185.
 *   - CSS `:hover` rules that REVEAL content (descendant/sibling combinator
 *     after `:hover`, OR a hover body that sets `display`/`opacity`/
 *     `visibility`/`pointer-events`/`clip-path`/`max-height`/`height`) without
 *     a matching `:focus`/`:focus-within`/`:focus-visible` rule on the same
 *     base selector. Catches hover-only tooltips, detail panels, and
 *     expanded-card-face reveals (Task #170, see the v3 magazine hero cards
 *     reference pattern from Task #158).
 *
 * Exits 0 when clean, 1 when violations are found. Wired into deploy.sh,
 * scripts/post-merge.sh, and `npm run check:a11y` so a regression fails fast
 * before build/push.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCAN_ROOTS = [
  path.join(ROOT, 'web', 'src'),
  path.join(ROOT, 'community-edition', 'web', 'src'),
];

// Reveal-y CSS properties — when one of these appears in a `:hover` body it's
// treated as content actually appearing/disappearing (vs. a pure cosmetic
// color/border tweak), and so must be matched by a `:focus`-family rule on
// the same base selector. Task #170.
const REVEAL_PROPS = [
  'display',
  'opacity',
  'visibility',
  'pointer-events',
  'clip-path',
  'max-height',
  'height',
];

// Non-interactive HTML elements we do not want naked onClick handlers on.
// Native interactive elements (button, a, input, select, textarea, label,
// summary, details) are intentionally omitted.
const NON_INTERACTIVE = new Set([
  'div', 'span', 'li', 'tr', 'td', 'th',
  'section', 'article', 'header', 'footer', 'nav',
  'aside', 'main', 'ul', 'ol', 'p',
  'figure', 'figcaption', 'img',
]);

const FILE_EXTS = new Set(['.jsx', '.tsx', '.js', '.ts']);
const CSS_EXTS = new Set(['.css']);

// Files allowed to ship `role="dialog"` directly. Both editions' canonical
// Dialog primitives are the only intentional sources — every other modal
// must go through them. Task #182.
const DIALOG_ALLOWLIST = new Set([
  path.join(ROOT, 'web', 'src', 'components', 'Dialog.jsx'),
  path.join(ROOT, 'community-edition', 'web', 'src', 'components', 'Dialog.jsx'),
]);

function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return out;
    throw err;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, exts, out);
    else if (exts.has(path.extname(ent.name))) out.push(full);
  }
  return out;
}

/**
 * Walk forward from the position just after `<TAG` and return the index of
 * the matching `>` (the one that closes the opening tag), respecting:
 *   - quoted strings (", ', `)
 *   - JSX expression containers { ... } (with nesting)
 *   - JSX comments {/* ... *\/} are handled as part of the brace block
 * Returns -1 if no terminator is found.
 */
function findTagEnd(src, start) {
  let i = start;
  let depth = 0;     // brace depth inside {...} JSX expressions
  let quote = null;  // current quote char or null
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { if (depth > 0) depth--; i++; continue; }
    if (c === '>' && depth === 0) return i;
    i++;
  }
  return -1;
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

function scanFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const issues = [];

  // Match an opening tag start: `<tagname` followed by whitespace or `/` or `>`.
  // We deliberately ignore self-closing-ness; we only need the opening tag span.
  const re = /<([A-Za-z][A-Za-z0-9]*)(?=[\s/>])/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tag = m[1];
    const lower = tag.toLowerCase();
    // Only check lowercase HTML elements; React components (PascalCase) are
    // out of scope for a static check — they encapsulate their own a11y.
    if (tag !== lower) continue;
    if (!NON_INTERACTIVE.has(lower)) continue;

    const tagStart = m.index;
    const tagEnd = findTagEnd(src, m.index + m[0].length);
    if (tagEnd < 0) continue;
    const opening = src.slice(tagStart, tagEnd + 1);

    // Cheap presence check first.
    if (!/\bonClick\s*=/.test(opening)) continue;

    const line = lineOf(src, tagStart);

    // <th onClick> always wants SortableTh.
    if (lower === 'th') {
      issues.push({
        file, line, tag,
        message: '<th onClick> is forbidden — use the shared <SortableTh> component (web/src/components/SortableTh.jsx) so screen readers get a real aria-sort.',
      });
      continue;
    }

    const roleNonActionable = /\brole\s*=\s*["'](presentation|none|dialog)["']/.test(opening);

    // Non-actionable container roles are the documented escape hatch:
    //   - role="presentation" / role="none" — backdrop / click-outside-to-close
    //   - role="dialog"                     — modal content surface; the click
    //                                         handler is typically a defensive
    //                                         e.stopPropagation() so backdrop
    //                                         clicks don't bubble through, and
    //                                         keyboard handling (Escape) lives
    //                                         on the backdrop. See the
    //                                         "Frontend accessibility house
    //                                         rule" section of replit.md.
    if (roleNonActionable) continue;

    // For actionable click handlers we require a real interactive ARIA role,
    // not just any role= attribute. The house rule names button/switch/radio/
    // checkbox explicitly; we also accept the other ARIA "widget" roles that
    // imply Enter/Space activation (link, menuitem, menuitemcheckbox,
    // menuitemradio, tab, option). A bare role= with a static value
    // (e.g. role="article") would otherwise satisfy the check while still
    // leaving the element semantically wrong for an action.
    const ACTIONABLE_ROLES = '(button|switch|checkbox|radio|menuitem|menuitemcheckbox|menuitemradio|tab|option|link)';
    const hasActionableRole =
      new RegExp(`\\brole\\s*=\\s*["']${ACTIONABLE_ROLES}["']`).test(opening) ||
      // Allow expression-form roles (e.g. role={canPickWinner ? 'button' : undefined})
      // as long as one of the actionable role names appears literally inside
      // the role={...} expression.
      new RegExp(`\\brole\\s*=\\s*\\{[^}]*['"]${ACTIONABLE_ROLES}['"][^}]*\\}`).test(opening);

    const hasTabIndex = /\btabIndex\s*=/.test(opening);
    const hasKeyDown = /\bonKeyDown\s*=/.test(opening);

    if (!(hasActionableRole && hasTabIndex && hasKeyDown)) {
      const missing = [];
      if (!hasActionableRole) missing.push('role="button"');
      if (!hasTabIndex) missing.push('tabIndex={0}');
      if (!hasKeyDown) missing.push('onKeyDown (Enter/Space)');
      issues.push({
        file, line, tag,
        message: `<${lower} onClick> is missing ${missing.join(' + ')}. Either use a real <button type="button">, or add the documented role+tabIndex+onKeyDown triad (replit.md → "Frontend accessibility house rule"). Backdrop-style click handlers may use role="presentation".`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Second pass (Task #169): catch <div>/<span> styled as a custom
  // switch/toggle/radio that ships without the matching ARIA role + state.
  //
  // The house rule in replit.md ("Custom toggle/switch/radio shapes must use
  // the matching ARIA role …") is currently only enforced by code review.
  // This pass flags a future regression where someone styles a non-interactive
  // element as a switch/toggle/radio and wires it up to a click or change
  // handler without the proper ARIA semantics.
  //
  // Heuristic: only flag when BOTH conditions hold, to keep false positives low
  //   1. className contains a class token that strongly implies the element
  //      *is* an interactive switch/toggle/radio control:
  //        - exact tokens: switch, toggle, radio
  //        - any token ending in -switch / -toggle / -radio (e.g. dark-toggle)
  //      Container/wrapper class tokens (e.g. "toggle-row", "switch-group",
  //      "radio-list") are intentionally NOT matched because they typically
  //      wrap real interactive children.
  //   2. The element is interactive on its own — it carries onClick, onChange,
  //      or onKeyDown. A purely decorative div with one of those class names
  //      is not a regression.
  //
  // Required shapes:
  //   - role="switch"     → must also carry aria-checked
  //   - role="radio"      → must also carry aria-checked
  //   - role="radiogroup" → accepted (container; child radios are checked
  //                         independently when they themselves match the
  //                         heuristic above)
  // Anything else (including role="button" or no role at all) is flagged.
  // ---------------------------------------------------------------------------
  const re2 = /<([A-Za-z][A-Za-z0-9]*)(?=[\s/>])/g;
  let m2;
  while ((m2 = re2.exec(src)) !== null) {
    const tag = m2[1];
    const lower = tag.toLowerCase();
    if (tag !== lower) continue;
    if (lower !== 'div' && lower !== 'span') continue;

    const tagStart = m2.index;
    const tagEnd = findTagEnd(src, m2.index + m2[0].length);
    if (tagEnd < 0) continue;
    const opening = src.slice(tagStart, tagEnd + 1);

    // Pull className value (string literal form only; expression-form
    // classNames like className={cls} are out of scope for the static check
    // — there's nothing to inspect).
    const classMatch = opening.match(/\bclassName\s*=\s*["']([^"']+)["']/);
    if (!classMatch) continue;
    const tokens = classMatch[1].split(/\s+/).filter(Boolean);

    let kind = null; // 'switch' | 'radio'
    for (const t of tokens) {
      if (t === 'switch' || t === 'toggle' || /-(?:switch|toggle)$/.test(t)) {
        kind = 'switch';
        break;
      }
      if (t === 'radio' || /-radio$/.test(t)) {
        kind = 'radio';
        break;
      }
    }
    if (!kind) continue;

    const isInteractive =
      /\bonClick\s*=/.test(opening) ||
      /\bonChange\s*=/.test(opening) ||
      /\bonKeyDown\s*=/.test(opening);
    if (!isInteractive) continue;

    const roleMatch = opening.match(/\brole\s*=\s*["']([a-z]+)["']/);
    const role = roleMatch ? roleMatch[1] : null;
    const hasAriaChecked = /\baria-checked\s*=/.test(opening);

    let ok = false;
    if (kind === 'switch') {
      ok = role === 'switch' && hasAriaChecked;
    } else {
      // radio
      ok = (role === 'radio' && hasAriaChecked) || role === 'radiogroup';
    }

    if (ok) continue;

    const line = lineOf(src, tagStart);
    const want =
      kind === 'switch'
        ? 'role="switch" + aria-checked={…}'
        : 'role="radio" + aria-checked={…} (or role="radiogroup" for the container)';
    issues.push({
      file, line, tag,
      message: `<${lower}> looks like a custom ${kind} (className "${classMatch[1]}") with an interactive handler but is missing ${want}. See replit.md → "Frontend accessibility house rule" → "Custom toggle/switch/radio shapes". Prefer a real <input type="checkbox"/"radio"> or <button role="switch">.`,
    });
  }

  // ---------------------------------------------------------------------------
  // Third pass (Task #175): catch <button> / <a> elements whose only visible
  // content is a single non-letter glyph (×, ✕, ✖, ⌄, …) or a single icon
  // component (<svg …/>, <FooIcon …/>, …) and that are missing both
  // `aria-label` and `aria-labelledby`.
  //
  // The house rule's "Button-as-icon-only must carry an aria-label" line is
  // currently only enforced by code review; without this gate, a future PR
  // adding a close button with just `×` or just an SVG icon would silently
  // regress.
  //
  // Heuristic — only flag when ALL of these hold, to keep false positives low:
  //   1. The element is a real <button> or <a> (interactive native element).
  //   2. It is NOT self-closing (otherwise there are no children to inspect).
  //   3. Neither `aria-label` nor `aria-labelledby` is present on the opening
  //      tag. `title` is intentionally not accepted because screen readers
  //      treat it inconsistently.
  //   4. The trimmed inner content is one of:
  //        a. A single non-letter, non-digit, non-whitespace character
  //           (×, ✕, ✖, ⌄, →, …).
  //        b. A single child JSX element whose tag name is `svg`, ends in
  //           `Icon` (e.g. <CloseIcon/>, <ChevronIcon/>), or ends in `Svg`.
  //   5. The inner content contains no `{…}` JSX expression — those can carry
  //      a dynamic visible label and are out of scope for the static check.
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Hand-rolled-modal gate (Task #182): catch any JSX that ships its own
  // `role="dialog"` instead of going through the shared <Dialog> primitive
  // (`web/src/components/Dialog.jsx` / `community-edition/web/src/components/
  // Dialog.jsx`). The house rule in replit.md ("Modals/dialogs must use the
  // shared <Dialog> primitive") is otherwise only enforced by code review,
  // so a future PR copy-pasting the old `<div role="dialog" aria-modal>` +
  // ad-hoc `onKeyDown` shape would silently regress.
  //
  // Heuristic: flag every `role="dialog"` (string-literal form) that appears
  // anywhere in the file. Allow-listed files are the canonical Dialog
  // primitives themselves. Expression-form `role={…}` is intentionally not
  // matched — there's nothing useful to inspect statically.
  // ---------------------------------------------------------------------------
  if (!DIALOG_ALLOWLIST.has(path.resolve(file))) {
    const reDlg = /\brole\s*=\s*["']dialog["']/g;
    let mDlg;
    while ((mDlg = reDlg.exec(src)) !== null) {
      const line = lineOf(src, mDlg.index);
      issues.push({
        file, line, tag: 'role="dialog"',
        message:
          'Hand-rolled `role="dialog"` is forbidden — modals must use the shared <Dialog> primitive (`web/src/components/Dialog.jsx`). ' +
          'It handles backdrop, role+aria-modal, focus trap/restore, body-scroll lock, and Escape-to-close in one place. ' +
          'See replit.md → "Frontend accessibility house rule" → "Modals/dialogs must use the shared <Dialog> primitive".',
      });
    }
  }

  const re3 = /<(button|a)(?=[\s/>])/g;
  let m3;
  while ((m3 = re3.exec(src)) !== null) {
    const tag = m3[1];
    const tagStart = m3.index;
    const tagEnd = findTagEnd(src, m3.index + m3[0].length);
    if (tagEnd < 0) continue;
    const opening = src.slice(tagStart, tagEnd + 1);

    // Self-closing — no children to inspect.
    if (opening.endsWith('/>')) continue;

    // Already has an accessible name.
    if (/\baria-label(?:ledby)?\s*=/.test(opening)) continue;

    const closeIdx = findMatchingClose(src, tagEnd + 1, tag);
    if (closeIdx < 0) continue;
    const inner = src.slice(tagEnd + 1, closeIdx);

    const verdict = classifyIconOnly(inner);
    if (!verdict) continue;

    const line = lineOf(src, tagStart);
    issues.push({
      file, line, tag,
      message: `<${tag}> appears to be icon-only (${verdict}) but is missing aria-label / aria-labelledby. Icon-only buttons must carry an accessible name so screen readers can announce the action. See replit.md → "Frontend accessibility house rule" → "Button-as-icon-only must carry an aria-label".`,
    });
  }

  // Sixth pass (Task #185): mouse handlers without focus parity.
  issues.push(...scanFocusParity(file, src));

  return issues;
}

/**
 * Find the index of the matching `</tag>` for an opening tag of `tag`,
 * starting the search at `start`. Tracks nested same-name tags and respects
 * self-closing `<tag .../>` forms (those don't increase depth).
 * Returns the index of the `<` of the matching close tag, or -1.
 */
function findMatchingClose(src, start, tag) {
  const re = new RegExp(`<\\/?${tag}(?=[\\s/>])`, 'g');
  re.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = re.exec(src)) !== null) {
    const isClose = src[m.index + 1] === '/';
    if (isClose) {
      depth--;
      if (depth === 0) return m.index;
      re.lastIndex = m.index + m[0].length;
      continue;
    }
    // Opening tag — find its end to detect self-closing.
    const end = findTagEnd(src, m.index + m[0].length);
    if (end < 0) return -1;
    const tagStr = src.slice(m.index, end + 1);
    if (!tagStr.endsWith('/>')) depth++;
    re.lastIndex = end + 1;
  }
  return -1;
}

/**
 * Returns a short human-readable string describing why the inner content
 * looks icon-only, or null if it doesn't qualify. Used by the icon-only
 * button/anchor pass.
 */
function classifyIconOnly(inner) {
  const trimmed = inner.trim();
  if (!trimmed) return null;

  // Single `{...}` JSX expression case (Task #183). The earlier version of
  // this pass skipped *any* inner content containing `{` because the
  // expression *might* be a visible text label (e.g. `{label}`). That's
  // overly lenient — `<button onClick={x}>{icon}</button>` (where `icon`
  // is an SVG component reference) would slip through. We now narrow:
  //   - obvious text-y expressions (string literals, ternaries with string
  //     branches, `t('…')` / `i18n.t('…')` i18n calls, template literals)
  //     → skip (whitelist as a visible label)
  //   - obvious icon expressions (a single JSX element whose tag is `svg`
  //     or ends in `Icon`/`Svg`, or a bare identifier ending in `Icon`/`Svg`)
  //     → flag
  //   - everything else (ambiguous, e.g. `{label}`) → skip, same as before
  if (isSingleBraceExpression(trimmed)) {
    const expr = trimmed.slice(1, -1).trim();
    return classifyBraceExpression(expr);
  }

  // Mixed content that contains a `{...}` expression alongside other nodes
  // is too ambiguous to classify statically — keep skipping it.
  if (/\{/.test(trimmed)) return null;

  // Single-glyph case (×, ✕, ✖, ⌄, →, …). Use Array.from to count code
  // points (a single emoji can be multiple UTF-16 units).
  const codePoints = Array.from(trimmed);
  if (codePoints.length === 1) {
    const ch = codePoints[0];
    if (/[\p{L}\p{N}]/u.test(ch)) return null;
    return `single glyph "${ch}"`;
  }

  // Single child element: must start with `<` and end with `>`.
  if (trimmed[0] !== '<' || trimmed[trimmed.length - 1] !== '>') return null;
  const openMatch = trimmed.match(/^<([A-Za-z][A-Za-z0-9]*)/);
  if (!openMatch) return null;
  const childTag = openMatch[1];
  const isIconTag =
    childTag === 'svg' || /Icon$/.test(childTag) || /Svg$/.test(childTag);
  if (!isIconTag) return null;

  const childTagEnd = findTagEnd(trimmed, openMatch[0].length);
  if (childTagEnd < 0) return null;
  const childOpening = trimmed.slice(0, childTagEnd + 1);

  if (childOpening.endsWith('/>')) {
    if (childTagEnd + 1 !== trimmed.length) return null;
    return `single child <${childTag}/>`;
  }

  // Non-self-closing — find its matching close and require it terminates
  // the trimmed inner exactly.
  const childClose = findMatchingClose(trimmed, childTagEnd + 1, childTag);
  if (childClose < 0) return null;
  const tail = trimmed.slice(childClose).replace(/\s+/g, '');
  if (tail !== `</${childTag}>`) return null;
  return `single child <${childTag}>…</${childTag}>`;
}

/**
 * Returns true when `trimmed` is exactly one balanced `{...}` JSX
 * expression — i.e. it starts with `{`, ends with `}`, and the brace
 * depth only returns to zero at the final character. Tracks string
 * literals so braces inside strings don't confuse the depth counter.
 * Used by classifyIconOnly to detect the `<button>{expr}</button>` shape.
 */
function isSingleBraceExpression(trimmed) {
  if (trimmed.length < 2) return false;
  if (trimmed[0] !== '{' || trimmed[trimmed.length - 1] !== '}') return false;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0 && i !== trimmed.length - 1) return false;
    }
  }
  return depth === 0;
}

/**
 * Classify the inner contents of a single `{...}` JSX expression child of
 * a button/anchor. Returns:
 *   - a non-null string describing the icon shape → caller should FLAG
 *   - null → caller should SKIP (either obviously a visible text label
 *            or too ambiguous to decide statically)
 *
 * The bias is intentionally conservative: when in doubt, skip. We only
 * flag shapes that clearly reference an icon component or an inline SVG.
 */
/**
 * Walk a string that begins immediately after `(` of a call expression and
 * return the substring of the first argument (up to the first top-level `,`
 * or the matching `)`), respecting nested parens/brackets/braces and
 * quoted strings. Returns null if the call's closing `)` cannot be found.
 * Used by classifyBraceExpression to pick the first argument out of a
 * `cloneElement(arg, …)` call. Task #194.
 */
function extractFirstCallArg(rest) {
  let depth = 0;
  let quote = null;
  let buf = '';
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (quote) {
      if (c === '\\') { buf += c + (rest[i + 1] || ''); i++; continue; }
      if (c === quote) quote = null;
      buf += c;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; buf += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; buf += c; continue; }
    if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) {
        // End of the cloneElement(...) call with a single arg.
        return buf;
      }
      depth--;
      buf += c;
      continue;
    }
    if (c === ',' && depth === 0) return buf;
    buf += c;
  }
  return null;
}

/**
 * True when `inside` (the contents of an array literal or arg list) contains
 * a top-level `,` — i.e. has more than one element. Honors nested
 * brackets/parens/braces and quoted strings. Used by classifyBraceExpression
 * to confirm a `[expr]` array literal is single-element. Task #194.
 */
function hasTopLevelComma(inside) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < inside.length; i++) {
    const c = inside[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; continue; }
    if (c === ',' && depth === 0) return true;
  }
  return false;
}

function classifyBraceExpression(expr) {
  if (!expr) return null;

  // Inline JSX element wrapped in braces: `{<Icon/>}`, `{<svg>…</svg>}`.
  if (expr[0] === '<') {
    const m = expr.match(/^<([A-Za-z][A-Za-z0-9]*)/);
    if (!m) return null;
    const tag = m[1];
    if (tag === 'svg' || /Icon$/.test(tag) || /Svg$/.test(tag)) {
      return `single child <${tag}> in {…} expression`;
    }
    return null;
  }

  // React.cloneElement(...) / cloneElement(...) — Task #194. Shared button
  // wrappers commonly forward a passed-in icon node through cloneElement to
  // attach className/size props. The first argument is the element being
  // cloned; if that argument itself looks like an icon, the wrapping button
  // is effectively icon-only and needs an aria-label.
  const cloneMatch = expr.match(/^(?:React\.)?cloneElement\s*\(\s*/);
  if (cloneMatch) {
    const rest = expr.slice(cloneMatch[0].length);
    const firstArg = extractFirstCallArg(rest);
    if (firstArg !== null) {
      const inner = classifyBraceExpression(firstArg.trim());
      if (inner) return `cloneElement of ${inner}`;
    }
    return null;
  }

  // Single-element array literal: `{[icon]}`, `{[<CloseIcon/>]}` — Task #194.
  // Wrapper buttons sometimes splat children into an array (e.g. when
  // composing optional icon slots). A one-element array containing only an
  // icon ref is the same hazard as the bare-identifier case above. Trailing
  // commas (`[icon,]`) are tolerated as still single-element.
  if (expr[0] === '[' && expr[expr.length - 1] === ']') {
    let inside = expr.slice(1, -1).trim();
    if (inside.endsWith(',')) inside = inside.slice(0, -1).trim();
    if (inside && !hasTopLevelComma(inside)) {
      const inner = classifyBraceExpression(inside);
      if (inner) return `single-element array containing ${inner}`;
    }
    return null;
  }

  // Bare identifier: `{icon}`, `{CloseIcon}`, `{closeSvg}`. Only flag the
  // names that are extremely likely to be an icon component reference —
  // a plain `{label}` or `{count}` stays ambiguous and is skipped.
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expr)) {
    if (/(?:Icon|Svg)$/.test(expr)) {
      return `icon component reference {${expr}}`;
    }
    return null;
  }

  // Member-access reference: `{Icons.close}`, `{props.icon}`. Flag only
  // when the trailing segment ends in Icon/Svg — `{props.label}` is
  // intentionally not flagged.
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(expr)) {
    const last = expr.split('.').pop();
    if (/(?:Icon|Svg)$/.test(last)) {
      return `icon component reference {${expr}}`;
    }
    return null;
  }

  // Everything below is treated as a visible text label and skipped.

  // String / template literal: `{"Save"}`, `{'Save'}`, `` {`Save ${n}`} ``
  if (expr[0] === '"' || expr[0] === "'" || expr[0] === '`') return null;

  // Ternary with a string-literal branch: `{ok ? 'Save' : 'Cancel'}` or
  // `{ok ? <Foo/> : 'Cancel'}` — once at least one branch is a string,
  // the rendered output can be a visible label so we skip.
  if (expr.includes('?') && expr.includes(':') && /["'`]/.test(expr)) return null;

  // i18n / formatter call invoked with a string literal first argument:
  // `{t('save')}`, `{i18n.t('save')}`, `{tr('save')}`, `{format('Hi {name}')}`.
  // The leading callee can be any dotted identifier chain.
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(\s*["'`]/.test(expr)) return null;

  // Default: ambiguous (e.g. bare `{label}`, `{count}`, complex expressions)
  // → keep the previous lenient behaviour and skip.
  return null;
}

// ---------------------------------------------------------------------------
// CSS hover-reveal scan (Task #170).
//
// The house rule "Hover-only reveals are forbidden" in replit.md says any
// content that appears on `:hover` (tooltips, detail panels, expanded card
// faces) must also appear on `:focus` / `:focus-within`. The earlier passes
// here only see JSX, so a CSS-only `:hover .child { display: block }` reveal
// would slip through. This pass closes that gap.
//
// What gets flagged:
//   1. A `:hover` selector with a combinator AFTER `:hover` revealing a
//      different element, e.g. `.card:hover .panel`, `.card:hover > .face`,
//      `.card:hover + .tip`, `.card:hover ~ .x` — the canonical "hover-only
//      reveal" shape (v3 magazine hero cards reference, Task #158).
//   2. A `:hover` rule whose body sets one of REVEAL_PROPS (`display`,
//      `opacity`, `visibility`, `pointer-events`, `clip-path`, `max-height`,
//      `height`) — these properties make content actually appear/disappear,
//      vs. a pure cosmetic color/border tweak which is intentionally not
//      flagged.
//
// What's accepted as parity:
//   - Any rule whose selector list contains the same selector with `:hover`
//     replaced by `:focus`, `:focus-within`, or `:focus-visible` is treated
//     as the matching counterpart. The matching is done on a normalized form
//     (whitespace-collapsed) so multi-line selector lists work.
// ---------------------------------------------------------------------------

function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Recursively parse a CSS source string into a flat list of declaration-block
 * rules: `{ selector, body, line }`. At-rules with blocks (`@media`,
 * `@supports`) are descended into; non-block at-rules (`@keyframes`,
 * `@font-face`, etc.) and their inner blocks are skipped because they have
 * no bearing on focus/hover parity.
 */
function parseCssRules(src, lineOffset = 0) {
  const rules = [];
  let i = 0;
  let buf = '';
  let bufStart = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '{') {
      const sel = buf.trim();
      const selStart = bufStart;
      buf = '';
      bufStart = -1;
      // Find matching close brace.
      let depth = 1;
      let j = i + 1;
      while (j < src.length && depth > 0) {
        const cj = src[j];
        if (cj === '{') depth++;
        else if (cj === '}') depth--;
        if (depth > 0) j++;
      }
      const body = src.slice(i + 1, j);
      const line = lineOffsetOf(src, selStart) + lineOffset;
      if (sel.startsWith('@')) {
        const head = sel.split(/\s/, 1)[0];
        if (head === '@media' || head === '@supports') {
          // Descend so inner rules participate in the focus/hover matching.
          // Pass through line offset so reported line numbers line up with
          // the original file.
          const innerOffset = lineOffsetOf(src, i + 1) + lineOffset;
          for (const r of parseCssRules(body, innerOffset)) {
            rules.push(r);
          }
        }
        // Otherwise: skip (@keyframes / @font-face / @import / etc.)
      } else if (sel) {
        rules.push({ selector: sel, body, line });
      }
      i = j + 1;
      bufStart = i;
      continue;
    }
    if (c === '}') {
      // Stray brace (shouldn't happen for valid CSS); reset buffer.
      buf = '';
      bufStart = i + 1;
      i++;
      continue;
    }
    if (buf === '') bufStart = i;
    buf += c;
    i++;
  }
  return rules;
}

function lineOffsetOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

function splitSelectorList(selector) {
  // Split on top-level commas (commas not inside parentheses or brackets —
  // e.g. :is(.a, .b) or [attr="a,b"]). CSS doesn't have braces inside
  // selectors so we only need to track () and [].
  const out = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function normalizeSelector(sel) {
  return sel.replace(/\s+/g, ' ').replace(/\s*([>+~])\s*/g, '$1').trim();
}

/**
 * Returns true when the single selector has a combinator AFTER `:hover`,
 * meaning the rule reveals a different element (the canonical hover-only
 * reveal shape). Examples that match:
 *   .card:hover .panel
 *   .card:hover > .face
 *   .card:hover+.tip
 *   .card:hover ~ .x
 * Examples that do NOT match (self-style on the hovered element):
 *   .btn:hover
 *   .btn:hover:not(:disabled)
 *   .row td:hover
 */
function hasCombinatorAfterHover(sel) {
  // Find each `:hover` that's not part of a longer pseudo (e.g. there's no
  // `:hovered` but be defensive). Look at the remaining tail; if any
  // combinator (whitespace, >, +, ~) appears at the top level of the tail
  // before the next pseudo/attribute boundary, it's a reveal.
  const re = /:hover\b/g;
  let m;
  while ((m = re.exec(sel)) !== null) {
    const tail = sel.slice(m.index + ':hover'.length);
    let depth = 0;
    for (let i = 0; i < tail.length; i++) {
      const c = tail[i];
      if (c === '(' || c === '[') { depth++; continue; }
      if (c === ')' || c === ']') { depth--; continue; }
      if (depth > 0) continue;
      if (c === ' ' || c === '\t' || c === '\n' || c === '>' || c === '+' || c === '~') return true;
      // Anything else (`.`, `:`, `#`, `[`, alphanumeric) is a same-element
      // continuation — keep scanning the tail in case the next `:hover` is
      // followed by a combinator.
      break;
    }
  }
  return false;
}

function bodyHasRevealProperty(body) {
  for (const prop of REVEAL_PROPS) {
    // Match the property only when it appears as a declaration name
    // (start of line / after `;` / after `{`). Use a simple regex anchored
    // on a non-name char before the property.
    const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:`, 'i');
    if (re.test(body)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mouse-handler focus-parity scan (Task #185).
//
// The house rule "Hover-only reveals are forbidden" already covers CSS-only
// reveals (Task #170), but a JSX-side equivalent exists: a tooltip / popover /
// detail panel can be wired up with `onMouseEnter={() => setShow(true)}`
// and `onMouseLeave={() => setShow(false)}` and ship without the matching
// `onFocus`/`onBlur` handlers, so keyboard users never see it. Task #176 hand-
// fixed every offender; this pass closes the gap so a future PR can't
// silently regress with the gate green.
//
// Pairs we care about:
//   onMouseEnter / onMouseOver  ↔  onFocus
//   onMouseLeave / onMouseOut   ↔  onBlur
//
// Cosmetic-only handlers (e.g. inline `e.currentTarget.style.background = …`)
// are intentionally allowed — focus-only mouseover styling is fine, and
// requiring focus parity for every hover color tweak would be noise. The
// heuristic: only flag when the handler body invokes a state setter call
// matching `\bset[A-Z]\w*\s*\(` (e.g. `setOpen(true)`, `setHovered(idx)`).
// Reference-form handlers (`onMouseEnter={handleEnter}`) are intentionally
// not flagged — there's nothing inspectable inline.
// ---------------------------------------------------------------------------

const MOUSE_FOCUS_PAIRS = [
  ['onMouseEnter', 'onFocus'],
  ['onMouseLeave', 'onBlur'],
  ['onMouseOver', 'onFocus'],
  ['onMouseOut', 'onBlur'],
];

const STATE_SETTER_RE = /\bset[A-Z]\w*\s*\(/;

/**
 * Extract the raw text of a JSX expression-form attribute value
 * (`name={...}`) from an opening-tag string. Returns null if the attribute
 * is absent or uses a string-literal value (`name="..."`). Handles nested
 * braces and quoted strings.
 */
function getJsxAttrExpr(opening, attrName) {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*\\{`);
  const m = opening.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let quote = null;
  for (let i = start; i < opening.length; i++) {
    const c = opening[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') {
      depth--;
      if (depth === 0) return opening.slice(start, i);
    }
  }
  return null;
}

function scanFocusParity(file, src) {
  const issues = [];
  const re = /<([A-Za-z][A-Za-z0-9_.]*)(?=[\s/>])/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tag = m[1];
    const tagStart = m.index;
    const tagEnd = findTagEnd(src, m.index + m[0].length);
    if (tagEnd < 0) continue;
    const opening = src.slice(tagStart, tagEnd + 1);

    for (const [mouseAttr, focusAttr] of MOUSE_FOCUS_PAIRS) {
      const expr = getJsxAttrExpr(opening, mouseAttr);
      if (expr === null) continue;
      // Cosmetic-only or reference-form handlers — skip to keep false
      // positives low.
      if (!STATE_SETTER_RE.test(expr)) continue;
      // Already has focus parity — accept.
      if (new RegExp(`\\b${focusAttr}\\s*=`).test(opening)) continue;

      const line = lineOf(src, tagStart);
      issues.push({
        file, line, tag,
        message:
          `<${tag}> uses ${mouseAttr} to drive a state change but has no matching ${focusAttr} handler. ` +
          `Keyboard users (Tab focus) will never see the same reveal — add ${focusAttr} parity (and ${focusAttr === 'onFocus' ? 'onBlur' : 'onFocus'} for the inverse). ` +
          'See replit.md → "Frontend accessibility house rule" → "Hover-only reveals are forbidden".',
      });
    }
  }
  return issues;
}

function scanCssFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const stripped = stripCssComments(src);
  const rules = parseCssRules(stripped);

  // Build a set of normalized selectors that exist in the file (across all
  // rules and all comma-separated parts) so we can quickly look up whether
  // a `:focus`-family counterpart is defined.
  const selectorSet = new Set();
  for (const r of rules) {
    for (const part of splitSelectorList(r.selector)) {
      selectorSet.add(normalizeSelector(part));
    }
  }

  const issues = [];
  for (const r of rules) {
    const parts = splitSelectorList(r.selector);
    for (const sel of parts) {
      if (!/:hover\b/.test(sel)) continue;

      const isCombinatorReveal = hasCombinatorAfterHover(sel);
      const isPropertyReveal = !isCombinatorReveal && bodyHasRevealProperty(r.body);
      if (!isCombinatorReveal && !isPropertyReveal) continue;

      const focusVariants = [
        sel.replace(/:hover\b/g, ':focus-within'),
        sel.replace(/:hover\b/g, ':focus-visible'),
        sel.replace(/:hover\b/g, ':focus'),
      ].map(normalizeSelector);

      const hasFocusCounterpart = focusVariants.some((v) => selectorSet.has(v));
      if (hasFocusCounterpart) continue;

      const reason = isCombinatorReveal
        ? 'reveals a descendant/sibling element'
        : `sets a reveal property (${REVEAL_PROPS.filter((p) => new RegExp(`(?:^|[;{\\s])${p}\\s*:`, 'i').test(r.body)).join(', ')})`;
      issues.push({
        file,
        line: r.line,
        selector: sel,
        message:
          `\`${sel}\` ${reason} but has no matching \`:focus\`/\`:focus-within\`/\`:focus-visible\` rule on the same target. ` +
          'Hover-only reveals are forbidden — add a focus counterpart so keyboard users can see the same content. ' +
          'See replit.md → "Frontend accessibility house rule" → "Hover-only reveals are forbidden."',
      });
    }
  }
  return issues;
}

function main() {
  const jsxFiles = SCAN_ROOTS.flatMap((r) => walk(r, FILE_EXTS));
  const cssFiles = SCAN_ROOTS.flatMap((r) => walk(r, CSS_EXTS));
  const all = [];
  for (const f of jsxFiles) {
    try {
      all.push(...scanFile(f));
    } catch (err) {
      console.error(`[check-a11y] failed to scan ${f}: ${err.message}`);
      process.exitCode = 1;
    }
  }
  for (const f of cssFiles) {
    try {
      all.push(...scanCssFile(f));
    } catch (err) {
      console.error(`[check-a11y] failed to scan ${f}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  if (all.length === 0) {
    console.log(`[check-a11y] OK — scanned ${jsxFiles.length} JSX/TS file(s) and ${cssFiles.length} CSS file(s), no accessibility regressions found.`);
    return;
  }

  console.error(`[check-a11y] FAIL — ${all.length} accessibility regression(s) detected:\n`);
  for (const i of all) {
    const rel = path.relative(ROOT, i.file);
    if (i.tag) {
      console.error(`  ${rel}:${i.line}  <${i.tag}>`);
    } else {
      console.error(`  ${rel}:${i.line}  ${i.selector}`);
    }
    console.error(`    ${i.message}\n`);
  }
  console.error('See the "Frontend accessibility house rule" section in replit.md for the required shapes.');
  process.exit(1);
}

// Allow this file to be both an executable script and a require()-able module
// so the icon-only classifier can be unit-tested in isolation (Task #183).
if (require.main === module) {
  main();
}

module.exports = {
  classifyIconOnly,
  classifyBraceExpression,
  isSingleBraceExpression,
  scanFile,
  scanCssFile,
  scanFocusParity,
  getJsxAttrExpr,
};
