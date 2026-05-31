// Pure ranking helpers for the command palette (Task #586 / #588), split out of
// CommandPalette.jsx so they can be unit-tested in isolation (Task #619) without
// pulling in React, the router, the search API or the hero registry.
//
// Relevance model (higher = more relevant), see scoreText:
//   exact ............. 1000
//   prefix ............ 800
//   word-start prefix . 600 (start of any space/-/_/'-separated word)
//   substring ......... 400 minus the offset (earlier matches rank higher)
//   fuzzy subsequence . 100
//   no match .......... -Infinity

// Per-group cap so a flood of matches can never make the list unwieldy. The
// server already bounds each group to 6; this is the client-side backstop and
// also caps the in-process hero matches.
export const GROUP_CAP = 6;

// True if every char of `q` appears in `text` in order (allowing gaps) — a
// cheap fuzzy/subsequence test so minor typos / omitted letters still surface
// results (e.g. "invk" → "Invoker"). Assumes both args already lower-cased.
export function isSubsequence(q, text) {
  if (!q) return true;
  let i = 0;
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++;
  }
  return i === q.length;
}

// Score one piece of text against the lower-cased query. Higher is more
// relevant. Returns -Infinity when there's no match at all (not even fuzzy).
export function scoreText(text, q) {
  if (!text) return -Infinity;
  const t = String(text).toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;
  const words = t.split(/[\s\-_']+/);
  if (words.some(w => w.startsWith(q))) return 600;
  const idx = t.indexOf(q);
  if (idx >= 0) return 400 - Math.min(idx, 399);
  if (isSubsequence(q, t)) return 100;
  return -Infinity;
}

// Best score across an item's primary label plus any secondary fields (persona
// name, tag, etc.) so a query that only matches an alias still ranks sensibly.
export function scoreItem(q, primary, ...extras) {
  let best = scoreText(primary, q);
  for (const ex of extras) {
    if (ex == null) continue;
    const s = scoreText(ex, q);
    if (s > best) best = s;
  }
  return best;
}

// Stable sort by descending score, then cap. Items keep their original
// (server) order within a score tier. When `dropMisses` is true, items with no
// match at all are removed (used for the client-side hero list); for server
// groups we keep everything the server returned and only re-order it.
export function rankAndCap(scored, { dropMisses = false, cap = GROUP_CAP } = {}) {
  return scored
    .map((entry, i) => ({ ...entry, i }))
    .filter(e => !dropMisses || e.score > -Infinity)
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .slice(0, cap)
    .map(e => e.item);
}
