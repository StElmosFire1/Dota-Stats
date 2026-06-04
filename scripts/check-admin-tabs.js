#!/usr/bin/env node
'use strict';

// Task #758 — Enforce exactly one render guard per admin tab.
//
// Task #751 consolidated web/src/pages/AdminPanel.jsx so each tab id has
// exactly one `{activeTab === 'x' && (...)}` render guard (previously matches
// had 3 blocks and seasons had 4). This check re-asserts that invariant so the
// fragmented-tab smell can't recur. It fails if:
//   • any tab id in ADMIN_TAB_IDS (= keys of TAB_META) has zero, or more than
//     one, render guard, or
//   • any render guard references a tab id that isn't defined in TAB_META.

const fs = require('fs');
const path = require('path');

const ADMIN_PANEL_PATH = path.join(
  __dirname,
  '..',
  'web',
  'src',
  'pages',
  'AdminPanel.jsx'
);

function fail(msg) {
  console.error(`[check:admin-tabs] ${msg}`);
  process.exit(1);
}

// Extract the top-level keys of the `const TAB_META = { ... };` object literal.
// We slice from the opening brace to the first line that is exactly `};` (the
// object's terminator) and then collect `key:` tokens at that nesting depth.
function extractTabMetaIds(src) {
  const start = src.indexOf('const TAB_META = {');
  if (start === -1) return [];
  const after = src.slice(start + 'const TAB_META = {'.length);
  const endIdx = after.indexOf('\n};');
  if (endIdx === -1) return [];
  const body = after.slice(0, endIdx);

  const ids = [];
  for (const rawLine of body.split('\n')) {
    // Top-level entries are indented two spaces: `  overview:    { ... }`.
    const m = rawLine.match(/^ {2}([A-Za-z0-9_]+):\s*\{/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

// Count `activeTab === 'x'` render guards keyed by the tab id they reference.
// Returns a Map<tabId, count>.
function extractRenderGuards(src) {
  const counts = new Map();
  const re = /activeTab === '([A-Za-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const id = m[1];
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

// Pure validation core, exported for unit tests. Returns an array of error
// strings (empty == valid).
function validate(tabIds, guardCounts) {
  const errors = [];
  const tabSet = new Set(tabIds);

  for (const id of tabIds) {
    const count = guardCounts.get(id) || 0;
    if (count === 0) {
      errors.push(`tab '${id}' has no render guard (expected exactly 1)`);
    } else if (count > 1) {
      errors.push(
        `tab '${id}' has ${count} render guards (expected exactly 1) — consolidate them into a single {activeTab === '${id}' && (...)} block`
      );
    }
  }

  for (const id of guardCounts.keys()) {
    if (!tabSet.has(id)) {
      errors.push(
        `render guard references tab '${id}' which is not defined in TAB_META`
      );
    }
  }

  return errors;
}

function main() {
  let src;
  try {
    src = fs.readFileSync(ADMIN_PANEL_PATH, 'utf8');
  } catch (err) {
    fail(`Failed to read ${ADMIN_PANEL_PATH}: ${err.message}`);
  }

  const tabIds = extractTabMetaIds(src);
  if (tabIds.length === 0) {
    fail('Could not parse TAB_META keys from AdminPanel.jsx');
  }

  const guardCounts = extractRenderGuards(src);
  const errors = validate(tabIds, guardCounts);

  if (errors.length > 0) {
    console.error(
      `[check:admin-tabs] FAIL — ${errors.length} render-guard problem(s) in web/src/pages/AdminPanel.jsx:`
    );
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }

  console.log(
    `[check:admin-tabs] OK — all ${tabIds.length} admin tabs have exactly one render guard, and every guard maps to a TAB_META id.`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  extractTabMetaIds,
  extractRenderGuards,
  validate,
};
