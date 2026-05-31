#!/usr/bin/env node
'use strict';

// Task #665 — source REAL in-game Dota 2 hero voice lines for the Voiceline
// daily game.
//
// Per the owner's decision we now serve authentic Valve hero voice-over (the
// previous build used licensing-clean espeak-ng TTS; that script has been
// retired). Each clip is sourced from a public community wiki that mirrors the
// game's response audio, trimmed to a short (~1-3s) segment, loudness-
// normalised, and encoded to src/games/voice-lines/<slug>.mp3 keyed by the
// canonical hero slug in src/games/voiceData.js.
//
// The clip is still served ONLY through the HMAC audio proxy in routes.js, so
// the answer slug never reaches the client and the line *text* is never sent —
// the player guesses from the audio alone.
//
// Sources (both MediaWiki, so imageinfo resolves a direct .mp3 URL):
//   1. Fandom Dota 2 wiki  — primary; responses listed as <sm2>file</sm2> text.
//   2. Liquipedia Dota 2    — fallback for heroes Fandom hasn't catalogued yet
//                             (e.g. the newest releases); <ab>file</ab> text.
//
// For each hero we fuzzy-match the iconic catchphrase in VOICE_LINES against the
// wiki's transcribed lines; on a confident match we use that exact clip,
// otherwise we fall back to the hero's spawn/debut ("self-introduction") line,
// which is always authentic VO for the right hero.
//
// Idempotent: by default only sources clips that don't already exist on disk.
//   --force            re-source every clip (overwrite existing)
//   --only=slug,slug   restrict to specific hero slugs
//
// Requires: ffmpeg + ffprobe on PATH, and network access to the wikis.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const fetch = require('node-fetch');

const { VOICE_LINES } = require('../src/games/voiceData');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src', 'games', 'voice-lines');
const HERO_NAMES_FILE = path.join(ROOT, 'web', 'src', 'heroNames.js');

const UA = 'OCEInhouseStatsBot/1.0 (Voiceline game VO sourcing; +https://github.com/StElmosFire1)';
const FANDOM_API = 'https://dota2.fandom.com/api.php';
const LIQUI_API = 'https://liquipedia.net/dota2/api.php';

// Politeness delays (ms). Liquipedia's API terms ask for a slow cadence.
const FANDOM_DELAY = 180;
const LIQUI_DELAY = 2500;

// Max clip length (seconds). Iconic lines are short; this just caps the rare
// long line so we never ship a multi-second clip.
const MAX_CLIP_SEC = 3.0;

// Confidence threshold for accepting a transcribed-line match over the spawn
// fallback. Tuned so exact / near-exact lines match but loose ones fall back.
const MATCH_THRESHOLD = 0.5;

// Display-name → wiki page title overrides (only where our display name in
// heroNames.js differs from the wiki's responses page title).
const PAGE_OVERRIDE = {
  obsidian_destroyer: 'Outworld Destroyer', // we store "Outworld Devourer"
  ringmaster: 'Ringmaster', // we store "Ring Master"
};

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (() => {
  const a = args.find((x) => x.startsWith('--only='));
  return a ? new Set(a.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean)) : null;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Hero display names (parsed from web/src/heroNames.js so we stay in sync) ──
function loadHeroNames() {
  const src = fs.readFileSync(HERO_NAMES_FILE, 'utf8');
  const m = src.match(/const HERO_NAMES = \{([\s\S]*?)\};/);
  if (!m) throw new Error('Could not parse HERO_NAMES from heroNames.js');
  const map = {};
  const re = /(\d+):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
  let g;
  while ((g = re.exec(m[1]))) {
    const id = Number(g[1]);
    const name = (g[2] != null ? g[2] : g[3]).replace(/\\'/g, "'").replace(/\\"/g, '"');
    map[id] = name;
  }
  return map;
}

// ── Text similarity (normalise + substring + token Jaccard) ──────────────────
function norm(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return 0.9;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

// ── Wiki helpers ─────────────────────────────────────────────────────────────
async function apiJson(api, params) {
  const url = api + '?' + new URLSearchParams({ format: 'json', ...params });
  const r = await fetch(url, { headers: { 'User-Agent': UA }, timeout: 25000 });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function responsesWikitext(api, pageTitle) {
  const d = await apiJson(api, { action: 'parse', page: `${pageTitle}/Responses`, prop: 'wikitext' });
  if (!d.parse || !d.parse.wikitext) return null;
  return d.parse.wikitext['*'];
}

// Parse a responses page into [{file, text}], one entry per audio file. Handles
// both Fandom (<sm2>) and Liquipedia (<ab>) markup. The transcribed text is the
// trailing text after the audio tag(s) on the same bullet; the primary file is
// the first tag (alt/arcana variants come after).
function parseResponses(wikitext) {
  const out = [];
  for (const raw of wikitext.split('\n')) {
    const tags = [...raw.matchAll(/<(?:sm2|ab)>\s*([^<]+?\.mp3)\s*<\/(?:sm2|ab)>/gi)];
    if (!tags.length) continue;
    const lastClose = raw.lastIndexOf('</');
    let text = raw.slice(raw.indexOf('>', lastClose) + 1);
    text = text
      .replace(/\{\{[^}]*\}\}/g, ' ')
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/''+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ file: tags[0][1].trim(), text });
  }
  return out;
}

// Choose the spawn / debut ("self-introduction") clip as a fallback.
function pickSpawn(pairs) {
  return (
    pairs.find((p) => /(?:spawn|debut)_0*1\.mp3$/i.test(p.file)) ||
    pairs.find((p) => /(?:spawn|debut)/i.test(p.file)) ||
    pairs[0]
  );
}

async function resolveFileUrl(api, fileName) {
  const title = 'File:' + fileName.charAt(0).toUpperCase() + fileName.slice(1);
  const d = await apiJson(api, { action: 'query', prop: 'imageinfo', iiprop: 'url', titles: title });
  const pages = d.query && d.query.pages;
  if (!pages) return null;
  const p = pages[Object.keys(pages)[0]];
  return p && p.imageinfo ? p.imageinfo[0].url : null;
}

// ── ffmpeg encode ────────────────────────────────────────────────────────────
function encodeClip(srcFile, outFile) {
  // Trim leading silence, cap length, loudness-normalise, encode mono mp3.
  const af = [
    'aresample=44100',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03',
    `atrim=0:${MAX_CLIP_SEC}`,
    'dynaudnorm=f=200:g=15',
    'afade=t=out:st=' + (MAX_CLIP_SEC - 0.12) + ':d=0.12',
  ].join(',');
  execFileSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', srcFile, '-ac', '1', '-ar', '44100',
      '-codec:a', 'libmp3lame', '-b:a', '96k', '-af', af, outFile],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
}

// ── Per-hero sourcing ────────────────────────────────────────────────────────
async function sourceHero(entry, heroNames, tmpDir) {
  const { heroId, slug, line } = entry;
  const display = PAGE_OVERRIDE[slug] || heroNames[heroId];
  if (!display) return { slug, status: 'no-name' };

  let api = FANDOM_API;
  let wt = await responsesWikitext(FANDOM_API, display);
  await sleep(FANDOM_DELAY);
  let pairs = wt ? parseResponses(wt) : [];
  let source = 'fandom';

  // Fandom lacks a usable page (or transcriptions) → try Liquipedia.
  const usableText = pairs.filter((p) => p.text).length;
  if (!pairs.length || usableText === 0) {
    const lwt = await responsesWikitext(LIQUI_API, display);
    await sleep(LIQUI_DELAY);
    const lpairs = lwt ? parseResponses(lwt) : [];
    if (lpairs.length && (lpairs.filter((p) => p.text).length >= usableText)) {
      pairs = lpairs;
      api = LIQUI_API;
      source = 'liquipedia';
    }
  }
  if (!pairs.length) return { slug, status: 'no-clips', source };

  // Best transcribed match vs spawn fallback.
  let best = null;
  let bestScore = 0;
  for (const p of pairs) {
    if (!p.text) continue;
    const s = similarity(line, p.text);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  const matched = bestScore >= MATCH_THRESHOLD;
  const chosen = matched ? best : pickSpawn(pairs);
  if (!chosen) return { slug, status: 'no-pick', source };

  const url = await resolveFileUrl(api, chosen.file);
  if (api === LIQUI_API) await sleep(LIQUI_DELAY); else await sleep(FANDOM_DELAY);
  if (!url) return { slug, status: 'no-url', source, file: chosen.file };

  const dl = await fetch(url, { headers: { 'User-Agent': UA }, timeout: 30000 });
  if (!dl.ok) return { slug, status: `dl-${dl.status}`, source, file: chosen.file };
  const buf = await dl.buffer();
  const tmp = path.join(tmpDir, `${slug}.src.mp3`);
  fs.writeFileSync(tmp, buf);

  const out = path.join(OUT_DIR, `${slug}.mp3`);
  encodeClip(tmp, out);
  fs.unlinkSync(tmp);

  return {
    slug,
    status: 'ok',
    source,
    via: matched ? `match(${bestScore.toFixed(2)})` : 'spawn',
    text: chosen.text || '(no transcript)',
    file: chosen.file,
  };
}

(async () => {
  const heroNames = loadHeroNames();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));

  let targets = VOICE_LINES.slice();
  if (ONLY) targets = targets.filter((e) => ONLY.has(e.slug));

  const results = [];
  for (const entry of targets) {
    const out = path.join(OUT_DIR, `${entry.slug}.mp3`);
    if (!FORCE && fs.existsSync(out)) {
      console.log(`skip (exists) ${entry.slug}`);
      results.push({ slug: entry.slug, status: 'skip' });
      continue;
    }
    try {
      const r = await sourceHero(entry, heroNames, tmpDir);
      results.push(r);
      if (r.status === 'ok') {
        console.log(`ok   ${r.slug.padEnd(22)} [${r.source}/${r.via}] "${r.text}" <- ${r.file}`);
      } else {
        console.log(`FAIL ${r.slug.padEnd(22)} ${r.status} ${r.file || ''}`);
      }
    } catch (e) {
      results.push({ slug: entry.slug, status: 'error', error: e.message });
      console.log(`ERR  ${entry.slug.padEnd(22)} ${e.message}`);
    }
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  const ok = results.filter((r) => r.status === 'ok');
  const matched = ok.filter((r) => r.via && r.via.startsWith('match')).length;
  const spawn = ok.filter((r) => r.via === 'spawn').length;
  const failed = results.filter((r) => !['ok', 'skip'].includes(r.status));
  console.log('\n──────── summary ────────');
  console.log(`sourced: ${ok.length}  (line-matched: ${matched}, spawn-fallback: ${spawn})`);
  console.log(`skipped: ${results.filter((r) => r.status === 'skip').length}`);
  console.log(`failed:  ${failed.length}`);
  if (failed.length) {
    for (const f of failed) console.log(`  - ${f.slug}: ${f.status}${f.error ? ' ' + f.error : ''}`);
    process.exitCode = 1;
  }
})();
