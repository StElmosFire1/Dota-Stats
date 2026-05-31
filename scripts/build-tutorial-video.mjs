// Task #667 — build the /how-it-works walkthrough video.
//
// Composites on-brand 1920x1080 slides (OCE Inhouse palette + fonts) over
// AI-generated backgrounds with @napi-rs/canvas, then assembles a narrated,
// music-backed walkthrough with ffmpeg (subtle ken-burns + cross-dissolves).
//
// Source assets (backgrounds, narration, music, fonts) live under
// attached_assets/tutorial/. The committed deliverable is the final mp4 at
// web/public/tutorial-walkthrough.mp4. Re-run with:  node scripts/build-tutorial-video.mjs
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'attached_assets/tutorial');
const WORK = path.join(SRC, 'work');
const OUT = path.join(ROOT, 'web/public/tutorial-walkthrough.mp4');
const FPS = 30;
const W = 1920; // slides are rendered at full res for crisp text...
const H = 1080;
const OW = 1280; // ...then encoded at 720p (the player is <=920px wide).
const OH = 720;
const T = 0.6; // cross-dissolve length (s)
const STAGE = process.env.STAGE || 'all'; // 'slides' | 'clips' | 'final' | 'all'

// Palette
const INK = '#0d1424';
const PARCHMENT = '#f5efe2';
const BRASS = '#c5a975';
const AMBER = '#f59e0b';
const BODY = '#cdd5e2';

// Fonts
const F = path.join(SRC, 'fonts');
GlobalFonts.registerFromPath(path.join(F, 'PlayfairDisplay-ExtraBold.ttf'), 'PlayfairXB');
GlobalFonts.registerFromPath(path.join(F, 'PlayfairDisplay-Bold.ttf'), 'PlayfairB');
GlobalFonts.registerFromPath(path.join(F, 'Inter-Regular.ttf'), 'InterR');
GlobalFonts.registerFromPath(path.join(F, 'Inter-SemiBold.ttf'), 'InterSB');

const scenes = [
  { key: 'intro', eyebrow: 'OCE INHOUSE', title: 'How it works', body: 'The community-run Dota 2 league for the Oceanic region — the whole flow in five simple steps.', num: null },
  { key: 'what', eyebrow: 'WHAT IT IS', title: 'Balanced 5v5 inhouse', body: 'Skip public matchmaking. Queue into balanced lobbies, get drafted by captains, and play on auto-provisioned OCE servers for low ping.', num: '01' },
  { key: 'steam', eyebrow: 'GET STARTED', title: 'Sign in with Steam', body: 'One click through Valve — we never see your password. Your matches, hero stats and rating are linked and recorded automatically.', num: '02' },
  { key: 'lobby', eyebrow: 'PLAY', title: 'Join an inhouse lobby', body: 'Register your role and accept when the lobby pops. Captains draft ten players, and a dedicated server provisions automatically on the 10th pick.', num: '03' },
  { key: 'mmr', eyebrow: 'PROGRESS', title: 'Climb the MMR ladder', body: 'A TrueSkill rating across an 8-tier ladder, a position-aware performance score from your replays, plus live leaderboard, hero meta and profile.', num: '04' },
  { key: 'coaching', eyebrow: 'IMPROVE', title: 'Level up with coaching', body: 'The coaching marketplace connects you with experienced players for 1:1 sessions, group sessions and VOD reviews.', num: '05' },
  { key: 'outro', eyebrow: 'READY WHEN YOU ARE', title: 'Jump in tonight', body: 'Your first inhouse is one Steam click away.', num: null, brand: 'oceinhouse.gg' },
];

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function drawTracked(ctx, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return cx;
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function renderSlide(scene) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background: cover-fit the generated image.
  const img = await loadImage(path.join(SRC, `bg_${scene.key}.png`));
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

  // Scrim: strong on the left where text lives, lighter to the right.
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, hexA(INK, 0.94));
  g.addColorStop(0.5, hexA(INK, 0.7));
  g.addColorStop(1, hexA(INK, 0.32));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Bottom vignette for depth.
  const gv = ctx.createLinearGradient(0, H * 0.5, 0, H);
  gv.addColorStop(0, hexA(INK, 0));
  gv.addColorStop(1, hexA(INK, 0.8));
  ctx.fillStyle = gv;
  ctx.fillRect(0, 0, W, H);

  const LX = 150; // left column x
  const maxText = 1020;

  // Faint oversized step number on the right as a graphic accent.
  if (scene.num) {
    ctx.save();
    ctx.font = '700 620px PlayfairXB';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = hexA(BRASS, 0.1);
    ctx.fillText(scene.num, W - 70, H / 2 + 30);
    ctx.restore();
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Vertical block roughly centered.
  let y = scene.brand ? 430 : 420;

  // Eyebrow with brass tick.
  ctx.fillStyle = AMBER;
  ctx.fillRect(LX, y - 34, 46, 4);
  ctx.font = '600 26px InterSB';
  ctx.fillStyle = BRASS;
  drawTracked(ctx, scene.eyebrow, LX + 64, y - 22, 4);

  // Title (Playfair ExtraBold), wrapped.
  ctx.font = '800 92px PlayfairXB';
  ctx.fillStyle = PARCHMENT;
  const titleLines = wrap(ctx, scene.title, maxText);
  y += 40;
  for (const line of titleLines) {
    ctx.fillText(line, LX, y);
    y += 104;
  }

  // Brass underline.
  ctx.fillStyle = hexA(BRASS, 0.9);
  ctx.fillRect(LX, y - 58, 96, 5);
  y += 16;

  // Body (Inter Regular), wrapped.
  ctx.font = '400 35px InterR';
  ctx.fillStyle = BODY;
  const bodyLines = wrap(ctx, scene.body, maxText);
  for (const line of bodyLines) {
    ctx.fillText(line, LX, y);
    y += 52;
  }

  // Outro brand wordmark.
  if (scene.brand) {
    y += 26;
    ctx.font = '800 60px PlayfairXB';
    ctx.fillStyle = AMBER;
    ctx.fillText(scene.brand, LX, y);
  }

  const file = path.join(WORK, `slide_${scene.key}.png`);
  writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}

function probeDur(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim();
  return parseFloat(out);
}

function ff(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
}

async function main() {
  mkdirSync(WORK, { recursive: true });

  // 1) Render slides + measure narration, compute durations.
  const lead = 0.55;
  const tail = 1.35;
  for (const s of scenes) {
    s.slide = path.join(WORK, `slide_${s.key}.png`);
    if (STAGE === 'slides' || STAGE === 'all' || !existsSync(s.slide)) await renderSlide(s);
    s.vo = path.join(SRC, `vo_${s.key}.mp3`);
    s.voDur = probeDur(s.vo);
    s.dur = +(s.voDur + lead + tail).toFixed(3);
  }
  if (STAGE === 'slides') { console.log('Slides rendered.'); return; }

  // 2) Per-scene video clip with a gentle ken-burns zoom (720p, resumable).
  for (const s of scenes) {
    const frames = Math.round(s.dur * FPS);
    s.clip = path.join(WORK, `clip_${s.key}.mp4`);
    if (STAGE === 'final' && existsSync(s.clip)) continue;
    // Single still image in -> zoompan emits `frames` output frames (no -loop,
    // which would multiply input frames by d and explode the frame count).
    const zoom = `zoompan=z='min(zoom+0.00045,1.07)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${OW}x${OH}:fps=${FPS}`;
    ff([
      '-i', s.slide,
      '-filter_complex', `[0:v]scale=${Math.round(OW * 1.3)}:${Math.round(OH * 1.3)},${zoom},format=yuv420p[v]`,
      '-map', '[v]', '-frames:v', String(frames), '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', s.clip,
    ]);
  }
  if (STAGE === 'clips') { console.log('Clips built.'); return; }

  // 3) Compute the cross-dissolve timeline offsets.
  const starts = [];
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    starts[i] = i === 0 ? 0 : +(starts[i - 1] + scenes[i - 1].dur - T).toFixed(3);
    acc = starts[i] + scenes[i].dur;
  }
  const total = +acc.toFixed(3);

  // 4) Single ffmpeg: xfade chain (video) + narration delays + music bed (audio).
  const inputs = [];
  scenes.forEach((s) => { inputs.push('-i', s.clip); });
  scenes.forEach((s) => { inputs.push('-i', s.vo); });
  inputs.push('-stream_loop', '-1', '-i', path.join(SRC, 'music_bed.mp3'));

  const N = scenes.length;
  const musicIdx = 2 * N;

  // Video xfade chain.
  let fc = '';
  let prev = '[0:v]';
  for (let i = 1; i < N; i++) {
    const out = i === N - 1 ? '[vid]' : `[vx${i}]`;
    fc += `${prev}[${i}:v]xfade=transition=fade:duration=${T}:offset=${starts[i]}${out};`;
    prev = out;
  }

  // Narration: delay each into place, then mix.
  const voLabels = [];
  for (let i = 0; i < N; i++) {
    const ms = Math.round((starts[i] + lead) * 1000);
    fc += `[${N + i}:a]adelay=${ms}|${ms},volume=1.0[vo${i}];`;
    voLabels.push(`[vo${i}]`);
  }
  fc += `${voLabels.join('')}amix=inputs=${N}:normalize=0:dropout_transition=0[voall];`;

  // Music bed: trim to total, low volume, fade out.
  fc += `[${musicIdx}:a]atrim=0:${total},volume=0.14,afade=t=out:st=${(total - 2).toFixed(3)}:d=2[bed];`;
  fc += `[voall][bed]amix=inputs=2:normalize=0:dropout_transition=0,alimiter=limit=0.95[aud]`;

  ff([
    ...inputs,
    '-filter_complex', fc,
    '-map', '[vid]', '-map', '[aud]',
    '-t', String(total),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    OUT,
  ]);

  console.log(`Done. total=${total}s -> ${OUT}`);
  console.log('Scene durations:', scenes.map((s) => `${s.key}:${s.dur}`).join('  '));
}

main().catch((e) => { console.error(e); process.exit(1); });
