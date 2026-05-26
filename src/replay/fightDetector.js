// Task #411 — Replay viewer v3: auto-detected team fights.
//
// Detector input shape:
//   { duration, players:[{slot, team, positions:[{t,x,y}]}], events:[{type,t,killerSlot,victimSlot,assistSlots?}] }
//
// A "team fight" is a cluster of hero kill events where:
//   * Successive kills land within `gap` seconds (10s by default).
//   * The killer or victim of the new kill is within `radius` world units
//     (~1500 by default) of any participant's last-known position.
//   * The resulting cluster involves >=3 unique hero slots and at least
//     2 hero deaths.
//
// Output shape (each fight):
//   { start_s, end_s, heroes:[slot,...], winner:'radiant'|'dire'|'draw',
//     radiant_deaths, dire_deaths }
//
// The detector is intentionally pure so it can be shared between the live
// parser (`replayParser.js`) and the admin backfill route which replays
// detection over the persisted `game_timeline` JSON.

const DEFAULTS = {
  gap: 10,          // seconds — kill must extend within this gap
  radius: 1500,     // dota world units
  endPad: 4,        // pad each fight end by Xs so the chip covers the brawl
  startPad: 2,
  minHeroes: 3,
  minDeaths: 2,
};

function _lastPosAt(positions, t, tolerance = 2) {
  if (!positions || !positions.length) return null;
  let best = null;
  for (const s of positions) {
    if (s.t <= t + tolerance) best = s; else break;
  }
  return best;
}

function _withinRadius(a, b, radius) {
  if (!a || !b) return true; // unknown positions don't disqualify
  const dx = (a.x - b.x);
  const dy = (a.y - b.y);
  return (dx * dx + dy * dy) <= radius * radius;
}

function detectFights({ players = [], events = [] } = {}, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const posBySlot = new Map();
  for (const p of players) {
    if (p && p.slot != null) posBySlot.set(p.slot, p.positions || []);
  }

  const kills = (events || [])
    .filter(ev => ev && ev.type === 'kill'
      && ev.victimSlot != null && ev.victimSlot >= 0 && ev.victimSlot <= 9)
    .sort((a, b) => (a.t || 0) - (b.t || 0));

  const fights = [];
  let cluster = null;

  const flush = () => {
    if (!cluster) return;
    const heroSlots = [...cluster.heroes];
    const deathTotal = cluster.radDeaths + cluster.direDeaths;
    if (heroSlots.length >= cfg.minHeroes && deathTotal >= cfg.minDeaths) {
      let winner = 'draw';
      if (cluster.radDeaths < cluster.direDeaths) winner = 'radiant';
      else if (cluster.direDeaths < cluster.radDeaths) winner = 'dire';
      fights.push({
        start_s: Math.max(0, Math.round(cluster.start - cfg.startPad)),
        end_s: Math.round(cluster.end + cfg.endPad),
        heroes: heroSlots.sort((a, b) => a - b),
        winner,
        radiant_deaths: cluster.radDeaths,
        dire_deaths: cluster.direDeaths,
      });
    }
    cluster = null;
  };

  for (const ev of kills) {
    const t = ev.t || 0;
    if (cluster && (t - cluster.end) <= cfg.gap) {
      // Spatial gate — only extend the cluster when one side of this kill is
      // co-located with an existing participant.
      const victimPos = _lastPosAt(posBySlot.get(ev.victimSlot), t);
      const killerPos = (ev.killerSlot != null && ev.killerSlot >= 0)
        ? _lastPosAt(posBySlot.get(ev.killerSlot), t)
        : null;
      let near = false;
      for (const partSlot of cluster.heroes) {
        const partPos = _lastPosAt(posBySlot.get(partSlot), t);
        if (_withinRadius(partPos, victimPos, cfg.radius)
          || _withinRadius(partPos, killerPos, cfg.radius)) {
          near = true;
          break;
        }
      }
      if (!near) flush();
    } else if (cluster) {
      flush();
    }
    if (!cluster) {
      cluster = { start: t, end: t, heroes: new Set(), radDeaths: 0, direDeaths: 0 };
    }
    cluster.end = t;
    cluster.heroes.add(ev.victimSlot);
    if (ev.killerSlot != null && ev.killerSlot >= 0 && ev.killerSlot <= 9) {
      cluster.heroes.add(ev.killerSlot);
    }
    if (Array.isArray(ev.assistSlots)) {
      for (const s of ev.assistSlots) {
        if (s != null && s >= 0 && s <= 9) cluster.heroes.add(s);
      }
    }
    if (ev.victimSlot < 5) cluster.radDeaths++; else cluster.direDeaths++;
  }
  flush();
  return fights;
}

module.exports = { detectFights };
