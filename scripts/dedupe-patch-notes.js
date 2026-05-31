#!/usr/bin/env node
'use strict';

// Auto-dedupe colliding `version` values in src/data/patchNotes.js.
//
// Why this exists: isolated task agents each add their own patch note and pick
// a version number without seeing the other in-flight tasks, so two queued
// merges routinely land the same number (e.g. both bump an `8.75` entry to
// `8.76`). The hard uniqueness gate (scripts/check-patch-notes.js) then fails
// in post-merge of the second merge and silently blocks the GitHub push.
//
// This script self-heals that: it keeps the FIRST occurrence of each version
// and bumps every later duplicate to the next free numeric version, preserving
// the file's exact formatting (it only rewrites the offending version strings).
// It is safe to run repeatedly — a no-op when there are no duplicates.
//
// Usage: node scripts/dedupe-patch-notes.js [path-to-patchNotes.js]
//        (path arg is optional; defaults to ../src/data/patchNotes.js)

const fs = require('fs');
const path = require('path');

const PATCH_NOTES_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'src', 'data', 'patchNotes.js');

let notes;
try {
  notes = require(PATCH_NOTES_PATH);
} catch (err) {
  console.error(`[dedupe:patch-notes] Failed to load ${PATCH_NOTES_PATH}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(notes)) {
  console.error(`[dedupe:patch-notes] ${PATCH_NOTES_PATH} must export an array.`);
  process.exit(1);
}

// Validate every entry has a usable string version up front.
for (let i = 0; i < notes.length; i++) {
  const n = notes[i];
  if (!n || typeof n !== 'object') {
    console.error(`[dedupe:patch-notes] Entry at index ${i} is not an object.`);
    process.exit(1);
  }
  if (typeof n.version !== 'string' || !n.version.trim()) {
    console.error(`[dedupe:patch-notes] Entry at index ${i} is missing a string 'version' field.`);
    process.exit(1);
  }
}

// Work in integer hundredths so version arithmetic is exact (no float drift):
// "8.76" -> 876, 877 -> "8.77".
function toHundredths(v) {
  const f = parseFloat(v);
  if (!Number.isFinite(f)) return null;
  return Math.round(f * 100);
}
function fromHundredths(h) {
  return (h / 100).toFixed(2);
}

// Exact-string versions already in use (matches the gate's equality check)…
const taken = new Set(notes.map((n) => n.version));
// …plus their numeric (hundredths) values, so a generated version can never be
// numerically equal-but-string-distinct from an existing one (e.g. emitting
// "5.10" when "5.1" already exists). Belt-and-braces on top of always counting
// strictly above the numeric max below.
const takenH = new Set();

// Highest numeric version currently in use; new versions count up from here.
let maxH = 0;
for (const n of notes) {
  const h = toHundredths(n.version);
  if (h === null) continue;
  takenH.add(h);
  if (h > maxH) maxH = h;
}

// First occurrence of each version is kept; every later one is a duplicate.
const firstSeen = new Map();
const replacements = []; // { index, oldVersion, newVersion }
let nextH = maxH;
for (let i = 0; i < notes.length; i++) {
  const v = notes[i].version;
  if (!firstSeen.has(v)) {
    firstSeen.set(v, i);
    continue;
  }
  // Duplicate — assign the next free numeric version (free by both exact
  // string AND numeric value, so we never emit an ambiguous equal-but-distinct
  // version such as "5.10" alongside an existing "5.1").
  let candidate;
  do {
    nextH += 1;
    candidate = fromHundredths(nextH);
  } while (taken.has(candidate) || takenH.has(nextH));
  taken.add(candidate);
  takenH.add(nextH);
  replacements.push({ index: i, oldVersion: v, newVersion: candidate });
}

if (replacements.length === 0) {
  console.log(`[dedupe:patch-notes] OK — ${notes.length} entries, no duplicate versions; nothing to do.`);
  process.exit(0);
}

// Rewrite the file in place, touching ONLY the duplicate version strings.
// We match version fields in file order and assume a 1:1 correspondence with
// the parsed array entries. If that assumption is violated (e.g. a note body
// literally contains a `"version": "..."` fragment), abort rather than risk
// corrupting the file.
const src = fs.readFileSync(PATCH_NOTES_PATH, 'utf8');
const VERSION_RE = /("version"\s*:\s*")([^"]*)(")/g;
const matches = [...src.matchAll(VERSION_RE)];

if (matches.length !== notes.length) {
  console.error(
    `[dedupe:patch-notes] ABORT — found ${matches.length} version field(s) in the file ` +
      `but ${notes.length} parsed entries. Refusing to edit to avoid corruption. ` +
      `Resolve the duplicate(s) manually.`
  );
  process.exit(1);
}

// Sanity check: each matched value must equal the parsed entry's version.
for (let i = 0; i < matches.length; i++) {
  if (matches[i][2] !== notes[i].version) {
    console.error(
      `[dedupe:patch-notes] ABORT — version field #${i + 1} ("${matches[i][2]}") does not ` +
        `align with parsed entry #${i + 1} ("${notes[i].version}"). Refusing to edit.`
    );
    process.exit(1);
  }
}

const replByIndex = new Map(replacements.map((r) => [r.index, r.newVersion]));
let out = '';
let last = 0;
for (let i = 0; i < matches.length; i++) {
  if (!replByIndex.has(i)) continue;
  const m = matches[i];
  const valStart = m.index + m[1].length;
  const valEnd = valStart + m[2].length;
  out += src.slice(last, valStart) + replByIndex.get(i);
  last = valEnd;
}
out += src.slice(last);

fs.writeFileSync(PATCH_NOTES_PATH, out, 'utf8');

console.log(`[dedupe:patch-notes] Auto-bumped ${replacements.length} duplicate version(s):`);
for (const r of replacements) {
  console.log(`  • entry #${r.index + 1}: v${r.oldVersion} → v${r.newVersion}`);
}
console.log('[dedupe:patch-notes] Done.');
