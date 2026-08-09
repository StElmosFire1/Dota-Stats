#!/usr/bin/env node
'use strict';

// Task #718 — Keep docs/website-features.txt in sync with the routes registered
// in web/src/App.jsx. Extracts every <Route path="…"> from App.jsx, resolves
// nested (parent/child) paths to their full URL, normalises route params, and
// fails if any concrete route is not mentioned in the feature inventory.
//
// The feature doc lists paths inside parentheses, often grouped/comma-separated
// and sometimes brace-expanded (e.g. /settings/{profile,notifications}). We
// normalise both sides the same way so param NAME differences (:matchId vs :id)
// never cause false positives — only genuinely undocumented paths are flagged.

const fs = require('fs');
const path = require('path');

const APP_JSX_PATH = path.join(__dirname, '..', 'web', 'src', 'App.jsx');
const FEATURES_PATH = path.join(__dirname, '..', 'docs', 'website-features.txt');

// Route paths that are intentionally not documented as user-facing features.
// Keep this list short and explain every entry.
const IGNORED_PATHS = new Set([
  '/*', // react-router catch-all wrappers, not a real page
  '/ward-heatmap-lab', // superuser-only internal tuning lab, intentionally unlisted/undocumented
]);

function fail(msg) {
  console.error(`[check:feature-list] ${msg}`);
  process.exit(1);
}

// Collapse :paramName -> :p and strip a trailing slash so the two sides compare
// on shape rather than the exact param identifier used in code vs docs.
function normalize(p) {
  let out = p.replace(/:[A-Za-z0-9_]+/g, ':p');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function joinPaths(parent, child) {
  if (!parent) return child;
  if (child.startsWith('/')) return child;
  return `${parent.replace(/\/$/, '')}/${child}`;
}

// ---- Extract the concrete routes registered in App.jsx --------------------
function extractRoutes(src) {
  const lines = src.split('\n');
  const stack = []; // full paths of currently-open (child-bearing) <Route>s
  const routes = new Set();

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === '</Route>') {
      stack.pop();
      continue;
    }

    if (!line.includes('<Route')) continue;

    const pathMatch = line.match(/path="([^"]*)"/);
    if (!pathMatch) continue; // index routes / fragments without a path attr

    const own = pathMatch[1];
    const parent = stack.length ? stack[stack.length - 1] : '';
    const full = joinPaths(parent, own);

    // A self-closing <Route … /> is a leaf; otherwise it opens children.
    // We must distinguish the real tag terminator from the "/>" inside an
    // inline element={<Foo />} prop, so we look at how the trimmed line ENDS.
    const isSelfClosing = line.endsWith('/>');

    routes.add(full);
    if (!isSelfClosing) stack.push(full);
  }

  return routes;
}

// ---- Extract every path token mentioned in the feature doc -----------------
function extractDocPaths(src) {
  const paths = new Set();
  // Path-ish tokens: start with "/", allow word chars, params, braces, commas,
  // dots and dashes. Grouping commas/parens are stripped afterwards.
  const re = /\/[A-Za-z0-9:_{},.\-/]*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let token = m[0].replace(/[.,)]+$/g, ''); // strip trailing punctuation
    if (!token || token === '/') {
      paths.add('/');
      continue;
    }
    if (token.includes('{')) {
      // Brace expansion: /settings/{a,b,c} -> /settings, /settings/a, …
      const braceMatch = token.match(/^([^{]*)\{([^}]*)\}(.*)$/);
      if (braceMatch) {
        const [, base, inner, tail] = braceMatch;
        const cleanBase = base.replace(/\/$/, '');
        if (cleanBase) paths.add(cleanBase);
        for (const part of inner.split(',')) {
          const seg = part.trim();
          if (seg) paths.add(`${cleanBase}/${seg}${tail}`);
        }
        continue;
      }
    }
    paths.add(token);
  }
  return paths;
}

function main() {
  let appSrc;
  let docSrc;
  try {
    appSrc = fs.readFileSync(APP_JSX_PATH, 'utf8');
  } catch (err) {
    fail(`Failed to read ${APP_JSX_PATH}: ${err.message}`);
  }
  try {
    docSrc = fs.readFileSync(FEATURES_PATH, 'utf8');
  } catch (err) {
    fail(`Failed to read ${FEATURES_PATH}: ${err.message}`);
  }

  const routes = extractRoutes(appSrc);
  const docPaths = new Set([...extractDocPaths(docSrc)].map(normalize));

  const missing = [];
  for (const route of routes) {
    if (IGNORED_PATHS.has(route)) continue;
    if (!docPaths.has(normalize(route))) missing.push(route);
  }

  if (missing.length > 0) {
    missing.sort();
    console.error(
      `[check:feature-list] FAIL — ${missing.length} route(s) in web/src/App.jsx are not mentioned in docs/website-features.txt:`
    );
    for (const p of missing) console.error(`  • ${p}`);
    console.error(
      '[check:feature-list] Add each missing path to docs/website-features.txt (group related routes on one line, as the file already does). If a path is intentionally undocumented, add it to IGNORED_PATHS in scripts/check-feature-list.js with a reason.'
    );
    process.exit(1);
  }

  console.log(
    `[check:feature-list] OK — all ${routes.size} App.jsx routes are documented in docs/website-features.txt.`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  normalize,
  joinPaths,
  extractRoutes,
  extractDocPaths,
  IGNORED_PATHS,
};
