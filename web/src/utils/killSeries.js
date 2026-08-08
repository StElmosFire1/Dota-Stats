// Task #763 — derive a kill-advantage step series from a match's
// game_timeline. Kill events carry `t` (seconds) + victimSlot 0-4 = Radiant,
// 5-9 = Dire. Returns null when no valid timestamped kill data exists;
// otherwise `{ points: [{ t, d }...], maxAbs, endT }` where `d` is the
// cumulative Radiant-minus-Dire kill diff held until the next kill
// (step-after), starting at (0, 0) and ending with a hold to `endT`.
export function deriveKillSeries(timeline, duration) {
  const events = timeline?.events;
  if (!Array.isArray(events)) return null;
  const kills = events
    .filter(e => e && e.type === 'kill' && Number.isFinite(Number(e.t)) &&
      Number(e.victimSlot) >= 0 && Number(e.victimSlot) < 10)
    .map(e => ({ t: Math.max(0, Number(e.t)), diff: Number(e.victimSlot) >= 5 ? 1 : -1 }))
    .sort((a, b) => a.t - b.t);
  if (kills.length === 0) return null;

  const endT = Math.max(Number(duration) || 0, kills[kills.length - 1].t, 1);
  let diff = 0;
  let maxAbs = 1;
  const points = [{ t: 0, d: 0 }];
  for (const k of kills) {
    diff += k.diff;
    points.push({ t: k.t, d: diff });
    if (Math.abs(diff) > maxAbs) maxAbs = Math.abs(diff);
  }
  points.push({ t: endT, d: diff });
  return { points, maxAbs, endT };
}
