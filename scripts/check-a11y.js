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

function walk(dir, out = []) {
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
    if (ent.isDirectory()) walk(full, out);
    else if (FILE_EXTS.has(path.extname(ent.name))) out.push(full);
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

  return issues;
}

function main() {
  const files = SCAN_ROOTS.flatMap((r) => walk(r));
  const all = [];
  for (const f of files) {
    try {
      all.push(...scanFile(f));
    } catch (err) {
      console.error(`[check-a11y] failed to scan ${f}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  if (all.length === 0) {
    console.log(`[check-a11y] OK — scanned ${files.length} files, no accessibility regressions found.`);
    return;
  }

  console.error(`[check-a11y] FAIL — ${all.length} accessibility regression(s) detected:\n`);
  for (const i of all) {
    const rel = path.relative(ROOT, i.file);
    console.error(`  ${rel}:${i.line}  <${i.tag}>`);
    console.error(`    ${i.message}\n`);
  }
  console.error('See the "Frontend accessibility house rule" section in replit.md for the required shapes.');
  process.exit(1);
}

main();
