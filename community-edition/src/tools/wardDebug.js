#!/usr/bin/env node
/**
 * wardDebug.js — Ward/deward accuracy checker for replay files
 *
 * Usage:
 *   node src/tools/wardDebug.js <path-to-replay.dem>
 *
 * Requires the Java parser service to be running on port 5600.
 * Start it first with:  node src/index.js  (or the bot auto-starts it)
 *
 * What it reports:
 *  • Every obs_left / obs_left_log / sen_left / sen_left_log event that fires
 *  • Whether each was counted or skipped by the dedup logic
 *  • A duplicate summary showing how many events the dedup actually caught
 *  • Per-player final ward stats (obs_placed, sen_placed, wards_killed)
 *  • obs_placed / sen_placed snapshots from player-state events (for comparison)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PARSER_PORT = 5600;
const DEM_PATH    = process.argv[2];

if (!DEM_PATH) {
  console.error('Usage: node src/tools/wardDebug.js <path-to-replay.dem>');
  process.exit(1);
}
if (!fs.existsSync(DEM_PATH)) {
  console.error(`File not found: ${DEM_PATH}`);
  process.exit(1);
}

// ─── Step 1: Send replay to Java parser ──────────────────────────────────────

const fileMB = (fs.statSync(DEM_PATH).size / (1024 * 1024)).toFixed(1);
console.log(`\n[wardDebug] Sending ${path.basename(DEM_PATH)} (${fileMB} MB) to parser on port ${PARSER_PORT}...`);
console.log('[wardDebug] This may take a minute for large replays.\n');

let rawText;
try {
  const buf = execFileSync('curl', [
    '-s', '-S',
    '--max-time', '600',
    '--connect-timeout', '10',
    '-X', 'POST',
    '-H', 'Content-Type: application/octet-stream',
    '--data-binary', `@${DEM_PATH}`,
    `http://localhost:${PARSER_PORT}/`,
  ], { maxBuffer: 500 * 1024 * 1024, timeout: 660000 });
  rawText = buf.toString();
} catch (err) {
  console.error('[wardDebug] Parser request failed:', err.message);
  console.error('Make sure the Java parser service is running (start the bot first).');
  process.exit(1);
}

const lines  = rawText.trim().split('\n').filter(Boolean);
const events = [];
for (const line of lines) {
  try { events.push(JSON.parse(line)); } catch {}
}
console.log(`[wardDebug] Parser returned ${events.length} events.\n`);

// ─── Step 2: Build a slot → hero name map from player_slot events ─────────────

const slotToHero = {};   // slot (0-9) → hero NPC name (or 'slot N')
const slotToSteam = {};  // slot → steam32 id

for (const e of events) {
  if (e.type === 'player_slot' || (e.slot != null && e.hero_id != null && e.hero != null)) {
    const s = parseInt(e.slot);
    if (!isNaN(s) && s >= 0 && s < 10) {
      slotToHero[s] = e.hero || e.hero_name || `slot${s}`;
    }
  }
  // Capture hero names from player state updates
  if (e.slot != null && e.hero != null) {
    const s = parseInt(e.slot);
    if (!isNaN(s) && s >= 0 && s < 10 && !slotToHero[s]) {
      slotToHero[s] = e.hero;
    }
  }
  if (e.slot != null && e.account_id != null) {
    const s = parseInt(e.slot);
    if (!isNaN(s)) slotToSteam[s] = e.account_id;
  }
}

// Also scan for attackername-style slot resolution (same as replayParser)
const npcNameToSlot = {};
for (const [slot, hero] of Object.entries(slotToHero)) {
  npcNameToSlot[hero] = parseInt(slot);
}

function slotLabel(slot) {
  const hero = slotToHero[slot];
  const team = slot < 5 ? 'R' : 'D';
  return hero ? `${team}[${slot}] ${hero}` : `${team}[${slot}]`;
}

function attackerLabel(attackername) {
  if (!attackername) return '(expired naturally)';
  const slot = npcNameToSlot[attackername];
  if (slot != null) return slotLabel(slot) + ` (${attackername})`;
  return attackername + ' (slot unknown)';
}

// ─── Step 3: Replay all ward events with dedup logic mirrored from parser ─────

const WARD_TYPES = new Set(['obs_left', 'obs_left_log', 'sen_left', 'sen_left_log']);

const wardKills   = {};        // slot → count (after dedup)
const wardKillSeen = new Set();// same dedup set as parser
const obsFinal    = {};        // slot → last obs_placed value seen
const senFinal    = {};        // slot → last sen_placed value seen

const allWardEvents  = [];     // full log of every ward event
const dupEvents      = [];     // events skipped by dedup
const naturalExpiry  = [];     // ward events with no attackername

let obsLeftCount    = 0;
let obsLogCount     = 0;
let senLeftCount    = 0;
let senLogCount     = 0;

for (const e of events) {
  // Track obs/sen placed (player state)
  if (e.obs_placed != null) {
    const s = parseInt(e.slot);
    if (!isNaN(s)) obsFinal[s] = e.obs_placed;
  }
  if (e.sen_placed != null) {
    const s = parseInt(e.slot);
    if (!isNaN(s)) senFinal[s] = e.sen_placed;
  }

  if (!WARD_TYPES.has(e.type)) continue;

  // Count raw event types
  if (e.type === 'obs_left')     obsLeftCount++;
  if (e.type === 'obs_left_log') obsLogCount++;
  if (e.type === 'sen_left')     senLeftCount++;
  if (e.type === 'sen_left_log') senLogCount++;

  const isObs      = (e.type === 'obs_left' || e.type === 'obs_left_log');
  const wardType   = isObs ? 'obs' : 'sen';
  const timeSec    = Math.round(e.time || 0);
  const timeStr    = `${Math.floor(timeSec / 60)}:${String(timeSec % 60).padStart(2, '0')}`;
  const killed     = !!e.attackername;
  const killerSlot = killed ? npcNameToSlot[e.attackername] : null;

  const entry = {
    type:        e.type,
    wardType,
    timeSec,
    timeStr,
    killed,
    attackername: e.attackername || null,
    killerSlot,
    ownerSlot:   e.slot,
    dedupKey:    null,
    counted:     false,
    duplicate:   false,
  };

  if (killed && killerSlot != null && killerSlot >= 0 && killerSlot < 10) {
    const dedupKey = `${killerSlot}_${wardType}_${timeSec}`;
    entry.dedupKey = dedupKey;

    if (wardKillSeen.has(dedupKey)) {
      entry.duplicate = true;
      dupEvents.push(entry);
    } else {
      wardKillSeen.add(dedupKey);
      wardKills[killerSlot] = (wardKills[killerSlot] || 0) + 1;
      entry.counted = true;
    }
  } else if (!killed) {
    naturalExpiry.push(entry);
  }

  allWardEvents.push(entry);
}

// ─── Step 4: Print report ─────────────────────────────────────────────────────

const hr = () => console.log('─'.repeat(80));

console.log('═'.repeat(80));
console.log('  WARD DEBUG REPORT');
console.log(`  Replay: ${path.basename(DEM_PATH)}`);
console.log('═'.repeat(80));

// --- Raw event counts ---
console.log('\n[ RAW EVENT COUNTS FROM PARSER ]');
console.log(`  obs_left      (streaming) : ${obsLeftCount}`);
console.log(`  obs_left_log  (combat log): ${obsLogCount}`);
console.log(`  sen_left      (streaming) : ${senLeftCount}`);
console.log(`  sen_left_log  (combat log): ${senLogCount}`);
console.log(`  Total ward events          : ${allWardEvents.length}`);
console.log(`  Natural expiries (no kill) : ${naturalExpiry.length}`);
console.log(`  Kill events (raw)          : ${allWardEvents.filter(e => e.killed).length}`);
console.log(`  Duplicates caught by dedup : ${dupEvents.length}`);
console.log(`  Unique kills counted       : ${allWardEvents.filter(e => e.counted).length}`);

// --- Duplicate detail ---
if (dupEvents.length > 0) {
  console.log('\n[ DUPLICATES CAUGHT (would have double-counted without fix) ]');
  hr();
  for (const d of dupEvents) {
    console.log(`  ${d.timeStr.padEnd(6)} ${d.type.padEnd(15)} key=${d.dedupKey}  attacker=${d.attackername}`);
  }
  hr();
  console.log(`  → ${dupEvents.length} duplicate event(s) suppressed.\n`);
} else {
  console.log('\n  ✓ No duplicates detected — parser emitted only one event type for ward kills.\n');
}

// --- All kill events ---
console.log('\n[ ALL WARD KILL EVENTS (time / type / ward / killer) ]');
hr();
const killEvents = allWardEvents.filter(e => e.killed);
if (killEvents.length === 0) {
  console.log('  (no ward kills found)');
} else {
  for (const e of killEvents) {
    const flag  = e.duplicate ? ' ⚡DUP' : e.counted ? '  ✓' : '  ?';
    const killer = e.killerSlot != null ? slotLabel(e.killerSlot) : (e.attackername || '?');
    console.log(`  ${e.timeStr.padEnd(6)} ${e.type.padEnd(15)} ${e.wardType.padEnd(4)} ${flag.padEnd(8)} ${killer}`);
  }
}
hr();

// --- Per-player summary ---
console.log('\n[ PER-PLAYER WARD STATS ]');
hr();
const header = 'Slot/Hero'.padEnd(40) + 'obs_placed'.padStart(12) + 'sen_placed'.padStart(12) + 'wards_killed'.padStart(14);
console.log('  ' + header);
console.log('  ' + '─'.repeat(78));
for (let slot = 0; slot < 10; slot++) {
  const label   = slotLabel(slot).padEnd(40);
  const obs     = String(obsFinal[slot]  || 0).padStart(12);
  const sen     = String(senFinal[slot]  || 0).padStart(12);
  const kills   = String(wardKills[slot] || 0).padStart(14);
  const sep     = slot === 4 ? '\n  ' : '';
  console.log(sep + '  ' + label + obs + sen + kills);
}
hr();

// --- Sanity checks ---
console.log('\n[ SANITY CHECKS ]');
const totalKills  = Object.values(wardKills).reduce((a, b) => a + b, 0);
const totalObs    = Object.values(obsFinal).reduce((a, b) => a + b, 0);
const totalSen    = Object.values(senFinal).reduce((a, b) => a + b, 0);
console.log(`  Total wards killed (all players): ${totalKills}`);
console.log(`  Total obs placed   (all players): ${totalObs}`);
console.log(`  Total sen placed   (all players): ${totalSen}`);

if (dupEvents.length > 0) {
  const halved = Math.round(totalKills);
  const inflated = halved + dupEvents.length;
  console.log(`\n  ⚠ WARNING: ${dupEvents.length} duplicate(s) were found and suppressed.`);
  console.log(`    Without the dedup fix, total wards_killed would have been: ${inflated}`);
  console.log(`    Corrected total (with fix): ${halved}`);
} else {
  console.log('\n  ✓ No double-counting detected.');
}

console.log('\n[wardDebug] Done.\n');
