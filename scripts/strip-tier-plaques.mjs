// Strip the decorative square PLAQUE off the three card-style sub-tier crests
// (Peasant / Vagabond / Outlaw) so the trailer renders clean free-standing
// shields matching the other 8 plain tiers.
//
//   node scripts/strip-tier-plaques.mjs
//
// Reads the ORIGINALS from web/public/badges/ (NEVER edits them — the live site
// renders those) and writes stripped copies to trailer-handoff/assets/badges/.
// scripts/render-trailer.mjs prefers the trailer-handoff copy over web/public.
//
// Why this isn't AI background removal: the "box" is NOT a flat backdrop, it's a
// fully decorated square plaque — a navy/black panel + a thin gold FRAME around
// the plaque edge + the tier name in gold text — with the heraldic shield on
// top. AI matting left the whole card / mangled the shield.
//
// How the matte works (see .agents/memory/trailer-renderer.md for the full why):
//   1. Flood-fill transparency over "background-class" pixels. A BORDER-ONLY
//      flood fails: it removes the thin outer margin but the plaque's gold
//      square-frame is warm/bright (not bg-class) and stops the flood, so the
//      plaque interior survives (~91% kept). Fix = ALSO seed the flood from
//      inset vertical columns INSIDE the plaque, past that frame (x≈0.10W/0.13W
//      and mirrored, y 0.12H..0.88H). Those land in plaque on the sides (the
//      shield is narrower + centred), so region-grow fills the whole plaque and
//      stops at the shield's warm wood/gold border. Healthy result kept% ≈ 45-60.
//   2. Keep ONLY the connected component containing the centre pixel — drops the
//      now-isolated gold frame + floating tier-name text. A crest ribbon/sash
//      that crosses the shield (Outlaw's diagonal banner) stays connected and is
//      kept, which is fine — other tiers have ribbons too.
//
// Verify the output by compositing over a BRIGHT bg (magenta/green); a dark
// composite (or the low-res trailer strip on the dark bg) HIDES a dark plaque.
//
// .mjs (not .js) because root package.json is not type:module. Must run from the
// workspace root so @napi-rs/canvas resolves.

import { loadImage, createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'web', 'public', 'badges');
const OUT_DIR = path.join(ROOT, 'trailer-handoff', 'assets', 'badges');

async function matte(name, isBg) {
  const img = await loadImage(path.join(SRC_DIR, `${name}.png`));
  const W = img.width, H = img.height, N = W * H;
  const c = createCanvas(W, H);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const im = x.getImageData(0, 0, W, H);
  const d = im.data;

  const bg = new Uint8Array(N), seen = new Uint8Array(N);
  const stack = [];
  const push = (xx, yy) => {
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) return;
    const idx = yy * W + xx;
    if (!seen[idx]) { seen[idx] = 1; stack.push(idx); }
  };

  // border seeds (outer margin)
  for (let xx = 0; xx < W; xx++) { push(xx, 0); push(xx, H - 1); }
  for (let yy = 0; yy < H; yy++) { push(0, yy); push(W - 1, yy); }
  // inset side-column seeds — INSIDE the plaque, past the decorative frame
  for (const fx of [0.10, 0.13]) {
    const a = Math.round(fx * W), b = W - 1 - a;
    for (let yy = Math.round(0.12 * H); yy < Math.round(0.88 * H); yy++) { push(a, yy); push(b, yy); }
  }

  // flood over bg-class connectivity (8-conn)
  while (stack.length) {
    const idx = stack.pop(), i = idx * 4;
    if (!isBg(d[i], d[i + 1], d[i + 2])) continue;
    bg[idx] = 1;
    const xx = idx % W, yy = (idx / W) | 0;
    push(xx - 1, yy); push(xx + 1, yy); push(xx, yy - 1); push(xx, yy + 1);
    push(xx - 1, yy - 1); push(xx + 1, yy - 1); push(xx - 1, yy + 1); push(xx + 1, yy + 1);
  }

  // keep only the opaque component containing the centre pixel
  const comp = new Uint8Array(N);
  const cs = [((H >> 1) * W) + (W >> 1)];
  comp[cs[0]] = 1;
  while (cs.length) {
    const idx = cs.pop(), xx = idx % W, yy = (idx / W) | 0;
    const nb = [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1],
                [xx - 1, yy - 1], [xx + 1, yy - 1], [xx - 1, yy + 1], [xx + 1, yy + 1]];
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nidx = ny * W + nx;
      if (!comp[nidx] && !bg[nidx]) { comp[nidx] = 1; cs.push(nidx); }
    }
  }

  for (let idx = 0; idx < N; idx++) { if (!comp[idx]) d[idx * 4 + 3] = 0; }
  x.putImageData(im, 0, 0);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), c.toBuffer('image/png'));

  let kept = 0;
  for (let i = 0; i < N; i++) kept += comp[i];
  console.log(`${name}  kept% ${(100 * kept / N).toFixed(1)}`);
}

const avg = (r, g, b) => (r + g + b) / 3;

// Peasant already mattes cleanly with the plain border flood (shield on flat bg).
await matte('tier-sub-3-peasant', (r, g, b) =>
  (r > 198 && g > 198 && b > 198) || (avg(r, g, b) < 66 && b + 6 >= r));

// Vagabond: near-white outer margin OR navy plaque.
await matte('tier-sub-2-vagabond', (r, g, b) =>
  (r > 198 && g > 198 && b > 198) || (avg(r, g, b) < 72 && b + 12 >= r));

// Outlaw: near-black navy plaque.
await matte('tier-sub-1-outlaw', (r, g, b) =>
  avg(r, g, b) < 78 && b + 12 >= r);

console.log('\n✓ Stripped sub-tier crests →', path.relative(ROOT, OUT_DIR));
console.log('  Verify over a BRIGHT bg (magenta/green); dark composites hide a dark plaque.');
