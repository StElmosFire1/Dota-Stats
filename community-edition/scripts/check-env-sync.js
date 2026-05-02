#!/usr/bin/env node
/**
 * check-env-sync.js
 *
 * Parses process.env references from src/config.js and verifies that:
 *   1. Every variable appears in .env.example (full coverage check).
 *   2. Every *required* variable (marked [REQUIRED] in .env.example) appears
 *      in SETUP.md's secrets table (quick-start coverage check).
 *
 * "Required" is determined by a `# [REQUIRED]` comment line immediately
 * before a KEY=value assignment in .env.example.
 *
 * Exit codes:
 *   0 — everything is in sync
 *   1 — one or more variables are out of sync
 *
 * Usage:
 *   node scripts/check-env-sync.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const CONFIG_PATH  = path.join(ROOT, 'src', 'config.js');
const EXAMPLE_PATH = path.join(ROOT, '.env.example');
const SETUP_PATH   = path.join(ROOT, 'SETUP.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Extract all unique process.env.VAR_NAME references from a JS source string.
 * Returns a sorted array of variable names.
 */
function extractConfigVars(source) {
  const re = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  const vars = new Set();
  let m;
  while ((m = re.exec(source)) !== null) {
    vars.add(m[1]);
  }
  return [...vars].sort();
}

/**
 * Parse .env.example and return:
 *   allVars      — Set of every KEY defined in the file
 *   requiredVars — Set of KEYs preceded by a # [REQUIRED] comment line
 *
 * A key is considered required when the nearest non-blank comment line
 * above its KEY=… assignment contains "[REQUIRED]".
 */
function parseExampleVars(source) {
  const allVars = new Set();
  const requiredVars = new Set();

  const lines = source.split('\n');
  let lastCommentHadRequired = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      lastCommentHadRequired = false;
      continue;
    }

    if (trimmed.startsWith('#')) {
      if (trimmed.includes('[REQUIRED]')) {
        lastCommentHadRequired = true;
      } else {
        lastCommentHadRequired = false;
      }
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      allVars.add(key);
      if (lastCommentHadRequired) {
        requiredVars.add(key);
      }
    }

    lastCommentHadRequired = false;
  }

  return { allVars, requiredVars };
}

/**
 * Extract variable names from SETUP.md's secrets table.
 * Recognises Markdown table rows containing a backtick-wrapped key, e.g.:
 *   | `SECRET_KEY` | … |
 */
function extractSetupVars(source) {
  const vars = new Set();
  const re = /\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    vars.add(m[1]);
  }
  return vars;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const configSource  = readFile(CONFIG_PATH);
const exampleSource = readFile(EXAMPLE_PATH);
const setupSource   = readFile(SETUP_PATH);

const configVars                    = extractConfigVars(configSource);
const { allVars: exampleVars,
        requiredVars: requiredExampleVars } = parseExampleVars(exampleSource);
const setupVars                     = extractSetupVars(setupSource);

let ok = true;

// --- Check 1: .env.example must list every var used in config.js -----------

const missingFromExample = configVars.filter(v => !exampleVars.has(v));

if (missingFromExample.length === 0) {
  console.log('✓ .env.example covers all variables used in config.js');
} else {
  ok = false;
  console.error('\n✗ Variables used in config.js but MISSING from .env.example:');
  for (const v of missingFromExample) {
    console.error(`    - ${v}`);
  }
  console.error('  → Add an entry for each missing variable to .env.example.');
}

// --- Check 2: SETUP.md must list every *required* var used in config.js ----
//
// SETUP.md is a quick-start guide; it intentionally lists only the most
// important secrets. We only enforce coverage for variables that are both
// used in config.js AND marked [REQUIRED] in .env.example.

const requiredConfigVars = configVars.filter(v => requiredExampleVars.has(v));
const missingFromSetup   = requiredConfigVars.filter(v => !setupVars.has(v));

if (missingFromSetup.length === 0) {
  console.log('✓ SETUP.md secrets table covers all required variables used in config.js');
} else {
  ok = false;
  console.error('\n✗ Required variables used in config.js but MISSING from SETUP.md secrets table:');
  for (const v of missingFromSetup) {
    console.error(`    - ${v}`);
  }
  console.error('  → Add a row for each missing variable to the secrets table in SETUP.md.');
}

// --- Summary ----------------------------------------------------------------

if (!ok) {
  console.error('\nFix the issues above to keep docs in sync with config.js.');
  process.exit(1);
}

console.log('\nAll env vars are in sync.');
