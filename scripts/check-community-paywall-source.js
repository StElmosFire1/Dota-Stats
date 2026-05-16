#!/usr/bin/env node
/**
 * scripts/check-community-paywall-source.js
 *
 * Task #301 — Fast source-level Pro-paywall regression gate for the
 * community edition frontend.
 *
 * Walks community-edition/web/src/ and flags any import or JSX/identifier
 * usage of the full-edition-only Pro-paywall surface:
 *
 *   - `PaywallCard`  — the full-edition paywall component
 *                      (web/src/components/PaywallCard.jsx). Any reference
 *                      from the community web source is a regression.
 *   - `useProStatus` — the full-edition Pro-status hook. The community
 *                      build only allows the LOCAL no-op stub at
 *                      community-edition/web/src/hooks/useProStatus.{js,jsx,
 *                      ts,tsx}. Any import that resolves elsewhere
 *                      (e.g. into the full-edition web/src/hooks/) is a
 *                      regression — even an unused import would survive
 *                      bundling and ship paywall code on the community site.
 *
 * Why this exists in addition to scripts/check-community-paywall.sh:
 *
 *   - check-community-paywall.sh has a fixed-string source-scan pass and a
 *     post-build dist-scan pass. The source pass is file-only (no line
 *     numbers) and treats the stub file itself as forbidden, so it has to
 *     match by token rather than by import resolution.
 *   - This script gives line-numbered errors and IS aware of the local
 *     no-op stub, so it can allow the stub's own self-references while
 *     still rejecting any import that pulls the full-edition hook in.
 *   - It runs in milliseconds (no install, no build) so a regression
 *     fails fast — before either deploy.sh or post-merge.sh pays for an
 *     npm install + Vite build.
 *
 * The dist-scan pass in check-community-paywall.sh remains the byte-level
 * final backstop.
 *
 * Exits 0 when clean, 1 when any forbidden reference is found.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCAN_ROOT = path.join(ROOT, 'community-edition', 'web', 'src');

// The one allow-listed stub path. The community edition is permitted to
// ship a no-op `useProStatus` hook at this exact location; any other
// resolution is forbidden.
const STUB_REL_NOEXT = 'community-edition/web/src/hooks/useProStatus';
const SOURCE_EXTS = ['.js', '.jsx', '.ts', '.tsx'];
const STUB_REL_VARIANTS = new Set(SOURCE_EXTS.map((e) => STUB_REL_NOEXT + e));

const SOURCE_EXT_SET = new Set(SOURCE_EXTS);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.vite']);

const errors = [];

function relPath(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

function isStubFile(absPath) {
  return STUB_REL_VARIANTS.has(relPath(absPath));
}

// Resolve a relative import specifier from `fromFile` and report whether
// it lands on the allow-listed stub. Bare/package specifiers (no leading
// dot) can never resolve to the stub.
function importResolvesToStub(fromFile, importPath) {
  if (!importPath.startsWith('.')) return false;
  const baseDir = path.dirname(fromFile);
  const resolved = path.resolve(baseDir, importPath);
  const resolvedRel = relPath(resolved);
  if (resolvedRel === STUB_REL_NOEXT) return true;
  for (const ext of SOURCE_EXTS) {
    if (resolvedRel === STUB_REL_NOEXT + ext) return true;
  }
  return false;
}

function pushError(file, lineNo, line, reason) {
  errors.push({ file: relPath(file), lineNo, line: line.replace(/\s+$/, ''), reason });
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(full);
    } else if (ent.isFile() && SOURCE_EXT_SET.has(path.extname(ent.name))) {
      checkFile(full);
    }
  }
}

// Matches a JS import or re-export with a `from '…'` source. Captures the
// import specifier path. Intentionally tolerant — any `from '…'` on the
// same line as a `useProStatus`/`PaywallCard` mention is enough to inspect.
const IMPORT_PATH_RE = /(?:^|[^a-zA-Z0-9_$])(?:import|export)\b[^;\n]*?from\s*['"]([^'"]+)['"]/;

const PAYWALL_CARD_RE = /\bPaywallCard\b/;
const USE_PRO_STATUS_RE = /\buseProStatus\b/;
// Detect an `import … useProStatus … from '…'` line by BINDING NAME — this
// catches `import { useProStatus } …` and `import { useProStatus as foo } …`.
const USE_PRO_STATUS_IMPORT_RE = /^\s*(?:import|export)\b[^;\n]*\buseProStatus\b[^;\n]*?from\s*['"]([^'"]+)['"]/;
// Detect an import line by SPECIFIER PATH — this catches alias / default /
// namespace / side-effect imports where `useProStatus` does not appear in
// the binding list, e.g. `import usePS from '../../../web/src/hooks/useProStatus'`
// or `import * as ProMod from '…/useProStatus'`. Triggers on any specifier
// whose final path segment is `useProStatus` (with optional .js/.jsx/.ts/.tsx
// extension). Combined with the binding-name regex this covers every
// import shape that pulls the hook in.
const USE_PRO_STATUS_PATH_IMPORT_RE = /^\s*(?:import|export)\b[^;\n]*?from\s*['"]([^'"]*\/useProStatus(?:\.(?:js|jsx|ts|tsx))?)['"]/;

function checkFile(file) {
  const stub = isStubFile(file);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (_e) {
    return;
  }
  const lines = text.split(/\r?\n/);

  // First pass: collect EVERY import/export line that mentions
  // `useProStatus` and classify each by whether it resolves to the local
  // stub. We must look at all of them — not just the first — because a
  // file could legitimately import the stub AND also (illegitimately)
  // alias-import the full-edition hook on a later line. Both shapes
  // need to be flagged independently.
  const useProStatusImports = []; // [{ lineNo, specifier, resolvesToStub }]
  for (let i = 0; i < lines.length; i++) {
    // Two complementary detectors:
    //   - binding-name match: `import { useProStatus … } from '…'`
    //   - specifier-path match: `import anyAlias from '…/useProStatus'`
    // Either alone misses real attack shapes; together they cover every
    // import form that pulls the hook in (named, aliased, default,
    // namespace, side-effect).
    const mByName = lines[i].match(USE_PRO_STATUS_IMPORT_RE);
    const mByPath = lines[i].match(USE_PRO_STATUS_PATH_IMPORT_RE);
    const m = mByName || mByPath;
    if (m) {
      useProStatusImports.push({
        lineNo: i + 1,
        specifier: m[1],
        resolvesToStub: importResolvesToStub(file, m[1]),
      });
    }
  }
  const importLineNos = new Set(useProStatusImports.map((imp) => imp.lineNo));
  const hasStubImport = useProStatusImports.some((imp) => imp.resolvesToStub);

  // Flag every non-stub useProStatus import — independently of how many
  // there are or whether a sibling stub import exists. The presence of a
  // safe stub import on line N does NOT excuse a forbidden non-stub
  // import on line M.
  for (const imp of useProStatusImports) {
    if (stub) continue;
    if (imp.resolvesToStub) continue;
    pushError(
      file,
      imp.lineNo,
      lines[imp.lineNo - 1],
      `useProStatus imported from "${imp.specifier}" — must resolve to the local no-op stub at ${STUB_REL_NOEXT}.js`,
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // ---- PaywallCard ----
    // Any reference is forbidden. The community edition has no legitimate
    // use of the full-edition paywall component.
    if (PAYWALL_CARD_RE.test(line)) {
      const importMatch = line.match(IMPORT_PATH_RE);
      const reason = importMatch
        ? `PaywallCard imported from "${importMatch[1]}" — full-edition paywall component is forbidden in the community edition`
        : 'PaywallCard reference — full-edition paywall component is forbidden in the community edition';
      pushError(file, lineNo, line, reason);
    }

    // ---- useProStatus (non-import usages) ----
    // Import lines themselves were handled above; only inspect everything
    // else here. A bare usage is allowed iff the file imports
    // `useProStatus` from the local stub at least once. If no stub
    // import exists, the symbol must have come from somewhere we don't
    // trust — flag the bare usage so the developer sees both the import
    // and the call sites.
    if (USE_PRO_STATUS_RE.test(line) && !importLineNos.has(lineNo)) {
      if (stub) continue;
      if (!hasStubImport) {
        pushError(
          file,
          lineNo,
          line,
          'useProStatus usage without an import from the local no-op stub',
        );
      }
    }
  }
}

if (!fs.existsSync(SCAN_ROOT)) {
  console.log(
    `[check-community-paywall-source] ${relPath(SCAN_ROOT)} not found — nothing to scan.`,
  );
  process.exit(0);
}

walk(SCAN_ROOT);

if (errors.length === 0) {
  console.log(
    '[check-community-paywall-source] OK — community-edition/web/src/ is clean of Pro-paywall references.',
  );
  process.exit(0);
}

console.error(
  'ERROR: forbidden Pro-paywall reference(s) in community-edition/web/src/:',
);
console.error('');
for (const e of errors) {
  console.error(`  ${e.file}:${e.lineNo}  ${e.reason}`);
  console.error(`    > ${e.line.trim()}`);
}
console.error('');
console.error(
  'The community edition (dota.stats.corvidaeinc.com) is paywall-free by policy.',
);
console.error(
  'Remove the offending import/usage, or — for useProStatus only — point the',
);
console.error(
  `import at the local no-op stub (${STUB_REL_NOEXT}.js). See community-edition/`,
);
console.error('SETUP.md ("Pro tier / paid memberships — removed") for context.');
process.exit(1);
