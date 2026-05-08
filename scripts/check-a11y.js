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

    const hasRole = /\brole\s*=\s*["'{]/.test(opening);
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

    const hasTabIndex = /\btabIndex\s*=/.test(opening);
    const hasKeyDown = /\bonKeyDown\s*=/.test(opening);

    if (!(hasRole && hasTabIndex && hasKeyDown)) {
      const missing = [];
      if (!hasRole) missing.push('role="button"');
      if (!hasTabIndex) missing.push('tabIndex={0}');
      if (!hasKeyDown) missing.push('onKeyDown (Enter/Space)');
      issues.push({
        file, line, tag,
        message: `<${lower} onClick> is missing ${missing.join(' + ')}. Either use a real <button type="button">, or add the documented role+tabIndex+onKeyDown triad (replit.md → "Frontend accessibility house rule"). Backdrop-style click handlers may use role="presentation".`,
      });
    }
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
