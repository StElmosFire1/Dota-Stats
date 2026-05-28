#!/usr/bin/env node
// Task #492 — Deterministic generator for both editions' robots.txt.
//
// The agent UA list in src/security/agentUaList.js is the single source of
// truth. Running this script regenerates:
//   - web/public/robots.txt              (full edition)
//   - community-edition/web/public/robots.txt
//
// Run with --check to fail (exit 1) without writing if either file is
// already out of sync. This is intended to be wired into the pre-deploy /
// post-merge gates the same way scripts/build-parser.sh --check is.
//
// Usage:
//   node scripts/build-robots-txt.js          # rewrite both files
//   node scripts/build-robots-txt.js --check  # CI gate, no writes

'use strict';

const fs = require('fs');
const path = require('path');
const { ALL_AGENTS } = require('../src/security/agentUaList');

const TARGETS = [
  path.join(__dirname, '..', 'web', 'public', 'robots.txt'),
  path.join(__dirname, '..', 'community-edition', 'web', 'public', 'robots.txt'),
];

function render() {
  const lines = [
    '# Generated from src/security/agentUaList.js (Task #492).',
    '# DO NOT EDIT BY HAND — run `node scripts/build-robots-txt.js` to regenerate.',
    '# AI scraping and clone-builder agents are not permitted on this site.',
    '# Honour the directives below or expect a hard block.',
    '',
  ];
  for (const a of ALL_AGENTS) lines.push(`User-agent: ${a.robotsAgent}`);
  lines.push('Disallow: /');
  lines.push('');
  lines.push('# Everyone else: site is open to crawl.');
  lines.push('User-agent: *');
  lines.push('Allow: /');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const content = render();
  let drift = false;
  for (const target of TARGETS) {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (existing === content) continue;
    if (check) {
      console.error(`[build-robots-txt] DRIFT: ${path.relative(process.cwd(), target)} is out of sync with src/security/agentUaList.js`);
      drift = true;
    } else {
      fs.writeFileSync(target, content);
      console.log(`[build-robots-txt] wrote ${path.relative(process.cwd(), target)}`);
    }
  }
  if (check) {
    if (drift) {
      console.error('[build-robots-txt] Run `node scripts/build-robots-txt.js` to regenerate.');
      process.exit(1);
    }
    console.log('[build-robots-txt] OK — both robots.txt files are in sync.');
    return;
  }
  console.log('[build-robots-txt] done.');
}

main();
