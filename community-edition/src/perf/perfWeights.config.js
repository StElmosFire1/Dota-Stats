// PERF — Positive Impact Score weights & calibration targets.
//
// Position-aware, duration-normalised performance score on a 1–10 scale where
// 5.0 ≈ average inhouse player at that position, 7.0 ≈ very good game, 9.0+ ≈
// top 1% game, and 10.0 is achievable with truly elite play across the board.
//
// Each position has its own AVG and ELITE per-minute targets per stat. We
// compute a normalised score per stat:
//     s = (actual_per_min - avg) / (elite - avg)
// so s = 0 when the player is at the average, s = 1 when at elite, and s can
// exceed 1 for exceptional games. We then weight per position and clip to [0, 1.4]
// per stat (small headroom above elite so 10 is reachable when several stats are
// well above elite).
//
// FUTURE: Replace these hand-tuned targets with percentile baselines derived
// from a `position_baselines` table maintained from real match data, and
// eventually a LightGBM regressor trained on MVP votes / win contribution.
//
// All targets are PER GAME-MINUTE so duration is automatically normalised.

// Position 0 → unknown — treat as position 3 (offlane) baseline.
// Positions 1..5 are the standard Dota roles.

const POSITION_TARGETS = {
  1: { // Safelane carry — farm, damage, late-game closing
    kpm:      { avg: 0.30, elite: 0.55 },
    dpm:      { avg: 0.50, elite: 0.95 }, // d = deaths_inverse signal computed separately
    gpm:      { avg: 480,  elite: 720  },
    xpm:      { avg: 520,  elite: 760  },
    lhpm:     { avg: 5.0,  elite: 8.5  }, // last hits per minute
    hdpm:     { avg: 350,  elite: 700  }, // hero damage per minute
    tdpm:     { avg: 90,   elite: 250  }, // tower damage per minute
    apm_kp:   { avg: 0.45, elite: 0.75 }, // kill participation (k+a)/teamK
    obspm:    { avg: 0.02, elite: 0.10 },
    senpm:    { avg: 0.02, elite: 0.10 },
    dewardpm: { avg: 0.05, elite: 0.20 },
    stunpm:   { avg: 0.30, elite: 1.20 },
    healpm:   { avg: 20,   elite: 100  },
  },
  2: { // Mid — tempo, damage, mobility, kill participation
    kpm:      { avg: 0.35, elite: 0.65 },
    gpm:      { avg: 460,  elite: 680  },
    xpm:      { avg: 540,  elite: 780  },
    lhpm:     { avg: 4.5,  elite: 7.5  },
    hdpm:     { avg: 400,  elite: 800  },
    tdpm:     { avg: 80,   elite: 220  },
    apm_kp:   { avg: 0.55, elite: 0.85 },
    obspm:    { avg: 0.02, elite: 0.10 },
    senpm:    { avg: 0.02, elite: 0.10 },
    dewardpm: { avg: 0.05, elite: 0.20 },
    stunpm:   { avg: 0.40, elite: 1.40 },
    healpm:   { avg: 15,   elite: 80   },
  },
  3: { // Offlane — initiation, space, tankiness, utility
    kpm:      { avg: 0.20, elite: 0.45 },
    gpm:      { avg: 380,  elite: 580  },
    xpm:      { avg: 460,  elite: 680  },
    lhpm:     { avg: 3.0,  elite: 5.5  },
    hdpm:     { avg: 280,  elite: 600  },
    tdpm:     { avg: 70,   elite: 200  },
    apm_kp:   { avg: 0.55, elite: 0.85 },
    obspm:    { avg: 0.04, elite: 0.15 },
    senpm:    { avg: 0.04, elite: 0.15 },
    dewardpm: { avg: 0.08, elite: 0.30 },
    stunpm:   { avg: 0.80, elite: 2.40 },
    healpm:   { avg: 20,   elite: 120  },
  },
  4: { // Soft support — roaming, vision, utility, kill setup
    kpm:      { avg: 0.18, elite: 0.40 },
    gpm:      { avg: 280,  elite: 440  },
    xpm:      { avg: 360,  elite: 560  },
    lhpm:     { avg: 1.5,  elite: 3.5  },
    hdpm:     { avg: 200,  elite: 480  },
    tdpm:     { avg: 40,   elite: 150  },
    apm_kp:   { avg: 0.65, elite: 0.92 },
    obspm:    { avg: 0.20, elite: 0.45 },
    senpm:    { avg: 0.20, elite: 0.45 },
    dewardpm: { avg: 0.20, elite: 0.55 },
    stunpm:   { avg: 1.20, elite: 3.20 },
    healpm:   { avg: 40,   elite: 200  },
  },
  5: { // Hard support — sacrifice, vision, saves, utility
    kpm:      { avg: 0.15, elite: 0.35 },
    gpm:      { avg: 240,  elite: 400  },
    xpm:      { avg: 320,  elite: 520  },
    lhpm:     { avg: 1.0,  elite: 3.0  },
    hdpm:     { avg: 180,  elite: 440  },
    tdpm:     { avg: 30,   elite: 130  },
    apm_kp:   { avg: 0.65, elite: 0.92 },
    obspm:    { avg: 0.22, elite: 0.50 },
    senpm:    { avg: 0.22, elite: 0.50 },
    dewardpm: { avg: 0.22, elite: 0.60 },
    stunpm:   { avg: 1.40, elite: 3.60 },
    healpm:   { avg: 60,   elite: 280  },
  },
};

// Per-position weights — sum to 1.0 within each position.
// Designed so a player at all-elite gets sum ≈ 1.0 → mapped to PI ≈ 9.0,
// and clearly above-elite stretches toward 10. A player at all-avg gets 0 → PI 5.
const POSITION_WEIGHTS = {
  1: { kp: 0.18, surv: 0.10, gpm: 0.12, xpm: 0.08, lh: 0.10, hd: 0.18, td: 0.10, vis: 0.04, deward: 0.03, stun: 0.03, heal: 0.02, win: 0.02 },
  2: { kp: 0.22, surv: 0.10, gpm: 0.10, xpm: 0.08, lh: 0.06, hd: 0.20, td: 0.08, vis: 0.04, deward: 0.04, stun: 0.04, heal: 0.02, win: 0.02 },
  3: { kp: 0.18, surv: 0.10, gpm: 0.08, xpm: 0.06, lh: 0.05, hd: 0.14, td: 0.08, vis: 0.08, deward: 0.05, stun: 0.10, heal: 0.04, win: 0.04 },
  4: { kp: 0.20, surv: 0.08, gpm: 0.04, xpm: 0.04, lh: 0.02, hd: 0.08, td: 0.04, vis: 0.18, deward: 0.10, stun: 0.12, heal: 0.06, win: 0.04 },
  5: { kp: 0.18, surv: 0.08, gpm: 0.03, xpm: 0.04, lh: 0.02, hd: 0.06, td: 0.03, vis: 0.20, deward: 0.10, stun: 0.14, heal: 0.08, win: 0.04 },
};

function targetsForPosition(position) {
  const pos = (position >= 1 && position <= 5) ? position : 3;
  return { targets: POSITION_TARGETS[pos], weights: POSITION_WEIGHTS[pos], position: pos };
}

// Normalise an actual per-minute value against (avg, elite) targets.
// Returns 0 at avg, 1 at elite, can exceed 1 with cap at 1.4.
function normTarget(actual, target) {
  if (!target) return 0;
  const span = target.elite - target.avg;
  if (span <= 0) return 0;
  const s = (actual - target.avg) / span;
  return Math.max(-0.5, Math.min(1.4, s));
}

module.exports = {
  POSITION_TARGETS,
  POSITION_WEIGHTS,
  targetsForPosition,
  normTarget,
};
