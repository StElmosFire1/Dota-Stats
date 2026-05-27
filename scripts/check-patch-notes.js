#!/usr/bin/env node
'use strict';

const path = require('path');

const PATCH_NOTES_PATH = path.join(__dirname, '..', 'src', 'data', 'patchNotes.js');

let notes;
try {
  notes = require(PATCH_NOTES_PATH);
} catch (err) {
  console.error(`[check:patch-notes] Failed to load ${PATCH_NOTES_PATH}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(notes)) {
  console.error(`[check:patch-notes] ${PATCH_NOTES_PATH} must export an array.`);
  process.exit(1);
}

const seen = new Map();
const duplicates = [];

for (let i = 0; i < notes.length; i++) {
  const note = notes[i];
  if (!note || typeof note !== 'object') {
    console.error(`[check:patch-notes] Entry at index ${i} is not an object.`);
    process.exit(1);
  }
  const version = note.version;
  if (typeof version !== 'string' || !version.trim()) {
    console.error(`[check:patch-notes] Entry at index ${i} is missing a string 'version' field.`);
    process.exit(1);
  }
  if (seen.has(version)) {
    duplicates.push({ version, firstIndex: seen.get(version), dupIndex: i });
  } else {
    seen.set(version, i);
  }
}

if (duplicates.length > 0) {
  console.error(`[check:patch-notes] FAIL — ${duplicates.length} duplicate version(s) in src/data/patchNotes.js:`);
  for (const d of duplicates) {
    console.error(
      `  • v${d.version} — first at entry #${d.firstIndex + 1}, duplicate at entry #${d.dupIndex + 1}`
    );
  }
  console.error(
    `[check:patch-notes] Delete the duplicate entries (keep the first occurrence) or bump the new entry to a unique version number.`
  );
  process.exit(1);
}

console.log(`[check:patch-notes] OK — ${notes.length} entries, all versions unique.`);
