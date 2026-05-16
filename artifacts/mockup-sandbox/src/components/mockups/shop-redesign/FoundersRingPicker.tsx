// Founders ring picker — 10 ring variants + 5 avatar-disc treatments.
// Click-to-compare. Same dark palette as the live site.
import * as React from 'react';

const bg = '#0d1424';
const card = '#152036';
const border = '#2a3b5c';
const text = '#e6edf8';
const muted = '#a8b3cf';
const dim = '#6e7a98';
const brass = '#c5a975';
const brassDark = '#8a7448';
const brassBright = '#e3c98a';
const amber = '#f59e0b';
const fSerif = 'Playfair Display, Georgia, serif';
const fCond = 'Oswald, sans-serif';
const fSans = 'Inter, system-ui, sans-serif';

// ─── Avatar disc treatments ──────────────────────────────────────────────
// These fill the centre of the ring. Pass `disc` to any ring variant.

type DiscKind = 'monogram' | 'steam' | 'hero' | 'radiant' | 'dire' | 'tier' | 'emblem';

function AvatarDisc({ kind, size, uid }: { kind: DiscKind; size: number; uid: string }) {
  const r = size * 0.34;
  const cx = size / 2;
  const cy = size / 2;
  if (kind === 'monogram') {
    return (
      <>
        <defs>
          <radialGradient id={`disc-mono-${uid}`} cx="0.35" cy="0.30">
            <stop offset="0%" stopColor="#3a4560"/>
            <stop offset="60%" stopColor="#1a2236"/>
            <stop offset="100%" stopColor="#0d1424"/>
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-mono-${uid})`}/>
        <text x={cx} y={cy + r * 0.18} textAnchor="middle"
              fontFamily={fSerif} fontStyle="italic"
              fontSize={r * 0.95} fill={brass} opacity="0.95">B</text>
      </>
    );
  }
  if (kind === 'steam') {
    // Mock a Steam avatar: warm tinted radial with a faux silhouette.
    return (
      <>
        <defs>
          <radialGradient id={`disc-steam-${uid}`} cx="0.40" cy="0.30">
            <stop offset="0%" stopColor="#9aa4c7"/>
            <stop offset="55%" stopColor="#3b4868"/>
            <stop offset="100%" stopColor="#0d1424"/>
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-steam-${uid})`}/>
        {/* Faux silhouette: head + shoulders */}
        <circle cx={cx} cy={cy - r * 0.18} r={r * 0.30} fill="#1a2236" opacity="0.65"/>
        <path d={`M ${cx - r * 0.55} ${cy + r * 0.55} Q ${cx} ${cy + r * 0.05} ${cx + r * 0.55} ${cy + r * 0.55} L ${cx + r * 0.55} ${cy + r} L ${cx - r * 0.55} ${cy + r} Z`} fill="#1a2236" opacity="0.65"/>
      </>
    );
  }
  if (kind === 'hero') {
    // Dota hero portrait — schematic Invoker-ish silhouette in amber on dark.
    return (
      <>
        <defs>
          <radialGradient id={`disc-hero-${uid}`} cx="0.50" cy="0.30">
            <stop offset="0%" stopColor="#3a2a1a"/>
            <stop offset="60%" stopColor="#1a1208"/>
            <stop offset="100%" stopColor="#0d0a04"/>
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-hero-${uid})`}/>
        {/* Glowing orbs of an Invoker-like silhouette */}
        <circle cx={cx - r * 0.4} cy={cy - r * 0.1} r={r * 0.12} fill="#f59e0b" opacity="0.85"/>
        <circle cx={cx} cy={cy - r * 0.35} r={r * 0.14} fill="#fcd34d" opacity="0.95"/>
        <circle cx={cx + r * 0.4} cy={cy - r * 0.1} r={r * 0.12} fill="#f59e0b" opacity="0.85"/>
        {/* Cloaked figure */}
        <path d={`M ${cx - r * 0.55} ${cy + r * 0.6} Q ${cx} ${cy + r * 0.2} ${cx + r * 0.55} ${cy + r * 0.6} L ${cx + r * 0.55} ${cy + r} L ${cx - r * 0.55} ${cy + r} Z`} fill="#2a1f10" opacity="0.9"/>
      </>
    );
  }
  if (kind === 'radiant') {
    return (
      <>
        <defs>
          <radialGradient id={`disc-rad-${uid}`} cx="0.5" cy="0.5">
            <stop offset="0%" stopColor="#3e5f2a"/>
            <stop offset="60%" stopColor="#1a2a12"/>
            <stop offset="100%" stopColor="#0d1408"/>
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-rad-${uid})`}/>
        {/* Sunburst */}
        <g transform={`translate(${cx} ${cy})`}>
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={-r * 0.04} y={-r * 0.85} width={r * 0.08} height={r * 0.4}
                  fill="#86c34a" opacity="0.8" transform={`rotate(${i * 45})`}/>
          ))}
          <circle r={r * 0.32} fill="#86c34a" opacity="0.9"/>
          <circle r={r * 0.18} fill="#cdf07c"/>
        </g>
      </>
    );
  }
  if (kind === 'dire') {
    return (
      <>
        <defs>
          <radialGradient id={`disc-dire-${uid}`} cx="0.5" cy="0.5">
            <stop offset="0%" stopColor="#5a1a1a"/>
            <stop offset="60%" stopColor="#2a0a0a"/>
            <stop offset="100%" stopColor="#0d0408"/>
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-dire-${uid})`}/>
        {/* Skull-ish sigil: inverted triangle + horns */}
        <g transform={`translate(${cx} ${cy})`}>
          <path d={`M ${-r * 0.55} ${-r * 0.4} L 0 ${r * 0.55} L ${r * 0.55} ${-r * 0.4} Z`} fill="#c83232" opacity="0.85"/>
          <circle cx={-r * 0.2} cy={-r * 0.1} r={r * 0.1} fill="#0d1424"/>
          <circle cx={r * 0.2} cy={-r * 0.1} r={r * 0.1} fill="#0d1424"/>
        </g>
      </>
    );
  }
  if (kind === 'tier') {
    // Tier I — brass tier badge as a radial gradient
    return (
      <>
        <defs>
          <radialGradient id={`disc-tier-${uid}`} cx="0.5" cy="0.5">
            <stop offset="0%" stopColor="#fbe6a8"/>
            <stop offset="45%" stopColor="#c5a975"/>
            <stop offset="100%" stopColor="#5a4422"/>
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-tier-${uid})`}/>
        <text x={cx} y={cy + r * 0.20} textAnchor="middle"
              fontFamily={fSerif} fontWeight="700"
              fontSize={r * 0.85} fill="#1a1208" opacity="0.9">I</text>
      </>
    );
  }
  // emblem (OA monogram)
  return (
    <>
      <defs>
        <radialGradient id={`disc-em-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#1f2a48"/>
          <stop offset="100%" stopColor="#0d1424"/>
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#disc-em-${uid})`}/>
      <text x={cx} y={cy + r * 0.10} textAnchor="middle"
            fontFamily={fSerif} fontWeight="700"
            fontSize={r * 0.55} fill={brass}>OA</text>
      <text x={cx} y={cy + r * 0.55} textAnchor="middle"
            fontFamily={fCond} fontSize={r * 0.18}
            fill={amber} letterSpacing="2">INHOUSE</text>
    </>
  );
}

// ─── Ring variants ───────────────────────────────────────────────────────

type RingProps = { size?: number; disc?: DiscKind };

function useUid() {
  return React.useId().replace(/:/g, '');
}

function Ring1_Classic({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  // Reworked "Classic Brass" — a wide beveled band engraved with a classical
  // GREEK MEANDER / KEY pattern (the running square spiral seen on Roman
  // coins and laurel-crown reliefs) plus milled outer edge, hairline rims,
  // and four small brilliant-cut amber cabochons at the cardinal points sunk
  // into the band. No more "just a spinning highlight" — the band itself
  // carries detail now.
  const rBand = size * 0.42;
  const stroke = Math.max(3, size * 0.078);     // wider band so the meander fits
  const rOuterEdge = rBand + stroke / 2;
  const rInnerEdge = rBand - stroke / 2;
  const notches = Math.max(48, Math.round(size * 0.5));
  // Engraved Roman numerals chased around the band at clock positions —
  // I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII. Classical Roman-coin
  // detail, unmistakable, and renders crisply at every size. Each numeral
  // is engraved (dark stroke shadow + bright hairline highlight) so it
  // reads as inscribed metal, not painted text.
  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const numeralSize = stroke * 0.62;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        {/* Beveled brass: bright top → mid → dark bottom for cylindrical relief */}
        <linearGradient id={`cl-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={brassBright}/>
          <stop offset="35%" stopColor={brass}/>
          <stop offset="65%" stopColor={brassDark}/>
          <stop offset="100%" stopColor="#5a3a14"/>
        </linearGradient>
        {/* Specular highlight stripe along the upper half of the band */}
        <linearGradient id={`cl-hl-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#fffbe6" stopOpacity="0.85"/>
          <stop offset="45%" stopColor="#fffbe6" stopOpacity="0"/>
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0"/>
        </linearGradient>
        {/* Amber cabochon gem */}
        <radialGradient id={`cl-gem-${uid}`} cx="0.35" cy="0.35">
          <stop offset="0%"  stopColor="#fffbe6"/>
          <stop offset="40%" stopColor={amber}/>
          <stop offset="100%" stopColor="#8a3a08"/>
        </radialGradient>
      </defs>
      {/* Main beveled band */}
      <circle cx={cx} cy={cy} r={rBand} fill="none"
              stroke={`url(#cl-band-${uid})`} strokeWidth={stroke}/>
      {/* Specular highlight pass over the top half */}
      <circle cx={cx} cy={cy} r={rBand} fill="none"
              stroke={`url(#cl-hl-${uid})`} strokeWidth={stroke}/>
      {/* Engraved Roman numerals around the band at clock positions. Each
          numeral is rotated so it sits radially upright on the band (top of
          numeral points outward), with a dark "engraved" shadow pass plus a
          bright hairline highlight pass for the chased-relief look. */}
      {ROMAN.map((numeral, i) => {
        const deg = (i / 12) * 360;
        return (
          <g key={i} transform={`rotate(${deg} ${cx} ${cy})`}>
            {/* Shadow pass — slightly offset down/right inside the engraved groove */}
            <text x={cx} y={cy - rBand + numeralSize * 0.35 + 0.6}
                  textAnchor="middle" dominantBaseline="middle"
                  fontFamily={fSerif} fontWeight="700"
                  fontSize={numeralSize} fill="#3a1a04" opacity="0.85">{numeral}</text>
            {/* Bright pass — the legible engraved numeral itself */}
            <text x={cx} y={cy - rBand + numeralSize * 0.35}
                  textAnchor="middle" dominantBaseline="middle"
                  fontFamily={fSerif} fontWeight="700"
                  fontSize={numeralSize} fill={brassDark}>{numeral}</text>
          </g>
        );
      })}
      {/* Knurled / milled outer edge — radial micro-notches all around */}
      {Array.from({ length: notches }).map((_, i) => {
        const a = (i / notches) * Math.PI * 2;
        const x1 = cx + Math.cos(a) * rOuterEdge;
        const y1 = cy + Math.sin(a) * rOuterEdge;
        const x2 = cx + Math.cos(a) * (rOuterEdge - stroke * 0.22);
        const y2 = cy + Math.sin(a) * (rOuterEdge - stroke * 0.22);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                     stroke={brassDark} strokeWidth={Math.max(0.4, size * 0.004)}
                     opacity="0.7"/>;
      })}
      {/* Hairline edge crisp-up — outer + inner */}
      <circle cx={cx} cy={cy} r={rOuterEdge} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      <circle cx={cx} cy={cy} r={rInnerEdge} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      {/* Four amber cabochon gems set into the band at cardinal points */}
      {[0, 90, 180, 270].map(deg => {
        const a = (deg - 90) * Math.PI / 180;
        const gx = cx + Math.cos(a) * rBand;
        const gy = cy + Math.sin(a) * rBand;
        const gemR = stroke * 0.32;
        return (
          <g key={deg}>
            <circle cx={gx} cy={gy} r={gemR + 0.6} fill={brassDark}/>
            <circle cx={gx} cy={gy} r={gemR} fill={`url(#cl-gem-${uid})`}
                    stroke={brassDark} strokeWidth={0.4}/>
            <circle cx={gx - gemR * 0.35} cy={gy - gemR * 0.35} r={gemR * 0.28}
                    fill="#fffbe6" opacity="0.75"/>
          </g>
        );
      })}
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring2_Coronet({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.45;
  const stroke = Math.max(3, size * 0.045);
  const teeth = 12;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brass} strokeWidth={stroke}/>
      {Array.from({ length: teeth }).map((_, i) => {
        const a = (i / teeth) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * (r + stroke * 0.4);
        const y = cy + Math.sin(a) * (r + stroke * 0.4);
        return <polygon key={i}
          points={`${x - size * 0.022},${y + size * 0.022} ${x + size * 0.022},${y + size * 0.022} ${x},${y - size * 0.035}`}
          fill={brassBright} stroke={brassDark} strokeWidth={0.5}
          transform={`rotate(${(i / teeth) * 360} ${x} ${y})`}/>;
      })}
      <circle cx={cx} cy={cy} r={r - stroke * 0.9} fill="none" stroke={brassDark} strokeWidth={1}/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring3_Laurel({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  // Classical laurel wreath rebuilt to match the gold-relief photo reference.
  // KEY GEOMETRY (this is where the previous attempts went wrong):
  //   The leaves are NOT oriented radially outward from the centre. They are
  //   oriented along the BRANCH TANGENT — their long axis runs along the rib
  //   in the direction of branch growth, with a small outward lean (~15°).
  //   That is how real laurel leaves attach to a stem, and it is what the
  //   reference photo shows: leaves "flowing" along the curve of the wreath,
  //   overlapping like fish scales, not splaying out from the centre.
  const rRib = size * 0.34;
  const arcStart = Math.PI / 2 - 0.30;     // branch leaves the bottom stem already heading up
  const arcEnd   = -Math.PI / 2 + 0.35;    // ~40° top opening — branches reach near the crown
  const angFor = (t: number, side: 1 | -1) => {
    const right = arcStart + t * (arcEnd - arcStart);
    return side > 0 ? right : Math.PI - right;
  };
  const N = 14;        // dense ladder of overlapping leaves
  // Symmetric pointed-almond leaf — rooted at (0,0), tip at (0,-L), sharp at
  // both ends. Long and narrow like real laurel leaves.
  const Leaf = ({ x, y, rot, scale }: { x: number; y: number; rot: number; scale: number }) => {
    const L = size * 0.115 * scale;
    const W = size * 0.024 * scale;
    const path = `M 0 0
                  C ${-W * 0.95} ${-L * 0.30}, ${-W * 0.85} ${-L * 0.65}, 0 ${-L}
                  C ${W * 0.85} ${-L * 0.65}, ${W * 0.95} ${-L * 0.30}, 0 0 Z`;
    const veinPath = `M 0 ${-L * 0.95} L 0 ${-L * 0.05}`;
    // A few short side veins branching off the centre — adds the chased
    // gold-relief detail you see on classical laurel reliefs.
    const sideVeins: string[] = [];
    for (let k = 1; k <= 3; k++) {
      const sy = -L * (0.25 + k * 0.18);
      const swx = W * 0.55 * (1 - Math.abs(0.5 - k * 0.18) * 0.6);
      sideVeins.push(`M 0 ${sy} Q ${swx * 0.4} ${sy - L * 0.04} ${swx} ${sy - L * 0.08}`);
      sideVeins.push(`M 0 ${sy} Q ${-swx * 0.4} ${sy - L * 0.04} ${-swx} ${sy - L * 0.08}`);
    }
    return (
      <g transform={`translate(${x} ${y}) rotate(${rot})`}>
        {/* Drop shadow underneath for depth between overlapping leaves */}
        <path d={path} fill="#000" opacity="0.32" transform="translate(0.6 0.8)"/>
        {/* Body — vertical brass bevel: bright on the upper (tip-facing) edge
            for the gold-relief highlight. */}
        <path d={path} fill={`url(#lf-body-${uid})`}
              stroke={brassDark} strokeWidth={0.35}/>
        {/* Specular highlight along one side for the polished-gold feel */}
        <path d={path} fill={`url(#lf-hl-${uid})`} opacity="0.55"/>
        {/* Centre vein — dark engraved line */}
        <path d={veinPath} fill="none" stroke={brassDark} strokeWidth={0.5} opacity="0.85"/>
        {/* Short side veins */}
        {sideVeins.map((d, k) => (
          <path key={k} d={d} fill="none" stroke={brassDark}
                strokeWidth={0.3} opacity="0.55"/>
        ))}
      </g>
    );
  };
  // Smooth rib path drawn UNDER the leaves so the branch reads as a
  // continuous brass stem peeking out between overlapping leaves.
  const ribPath = (side: 1 | -1) => {
    const segs: string[] = [];
    const STEPS = 24;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const ang = angFor(t, side);
      const px = cx + Math.cos(ang) * rRib;
      const py = cy + Math.sin(ang) * rRib;
      segs.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(2)} ${py.toFixed(2)}`);
    }
    return segs.join(' ');
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        {/* Polished brass body — bright tip, deeper brass at the base */}
        <linearGradient id={`lf-body-${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor={brassDark}/>
          <stop offset="40%"  stopColor={brass}/>
          <stop offset="80%"  stopColor={brassBright}/>
          <stop offset="100%" stopColor="#fff5d4"/>
        </linearGradient>
        {/* Specular highlight stripe along one edge of the leaf */}
        <linearGradient id={`lf-hl-${uid}`} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%"  stopColor="#fffbe6" stopOpacity="0"/>
          <stop offset="35%" stopColor="#fffbe6" stopOpacity="0.85"/>
          <stop offset="50%" stopColor="#fffbe6" stopOpacity="0"/>
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0"/>
        </linearGradient>
        {/* Stem gradient — solid brass for the joining knot */}
        <linearGradient id={`lf-stem-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="60%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
      </defs>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
      {/* Branch ribs underneath the leaves */}
      {([1, -1] as const).map(side => (
        <path key={`rib-${side}`} d={ribPath(side)} fill="none"
              stroke={brassDark} strokeWidth={Math.max(0.9, size * 0.009)}
              strokeLinecap="round" opacity="0.9"/>
      ))}
      {/* Each branch: dense ladder of overlapping leaves oriented ALONG the
          branch tangent (long axis runs in the direction of branch growth),
          with a small constant outward lean for the natural laurel look. */}
      {([1, -1] as const).map(side => (
        <g key={side}>
          {Array.from({ length: N }).map((_, i) => {
            const t = i / (N - 1);
            const ang = angFor(t, side);
            const lx = cx + Math.cos(ang) * rRib;
            const ly = cy + Math.sin(ang) * rRib;
            const angDeg = ang * 180 / Math.PI;
            // Tangent rotation: SVG rotate(θ) takes the leaf's local "up"
            // (0,-1) to (sin θ, -cos θ). For a CCW-going right branch, the
            // forward tangent is (sin ang, -cos ang), so θ = angDeg.
            // For the LEFT branch (mirrored across the vertical axis) the
            // forward tangent is (-sin ang, cos ang), giving θ = angDeg+180.
            // Then add a small outward lean (~15°) so leaves tilt slightly
            // away from the rib like real laurel.
            const baseRot = side > 0 ? angDeg : angDeg + 180;
            const lean = side > 0 ? 15 : -15;
            const rot = baseRot + lean;
            // Slight scale taper near the tip and a tiny bump near the
            // middle so the silhouette isn't perfectly uniform.
            const sc = (0.92 + 0.18 * Math.sin(t * Math.PI)) * (1.0 - Math.max(0, t - 0.85) * 0.45);
            return <Leaf key={i} x={lx} y={ly} rot={rot} scale={sc}/>;
          })}
        </g>
      ))}
      {/* Brass joining stem at the bottom centre — where both branch ribs
          meet. A small bulge with a few transverse hairlines for the look of
          a tied/cast stem on the relief. */}
      <g transform={`translate(${cx} ${cy + rRib + size * 0.010})`}>
        <ellipse rx={size * 0.032} ry={size * 0.016}
                 fill={`url(#lf-stem-${uid})`} stroke={brassDark} strokeWidth={0.5}/>
        <line x1={-size * 0.020} y1={-size * 0.003} x2={size * 0.020} y2={-size * 0.003}
              stroke={brassDark} strokeWidth={0.35} opacity="0.6"/>
        <line x1={-size * 0.020} y1={size * 0.003} x2={size * 0.020} y2={size * 0.003}
              stroke="#fff5d4" strokeWidth={0.3} opacity="0.55"/>
      </g>
    </svg>
  );
}

function Ring4_Signet({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.46;
  const stroke = Math.max(5, size * 0.085);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brass} strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brassBright} strokeWidth={stroke * 0.3}
              strokeDasharray={`${Math.PI * r * 0.5} ${Math.PI * r * 4}`}
              transform={`rotate(-110 ${cx} ${cy})`} opacity="0.8"/>
      <circle cx={cx} cy={cy} r={r - stroke * 0.5} fill="none" stroke={brassDark} strokeWidth={0.5}/>
      <circle cx={cx} cy={cy} r={r + stroke * 0.5} fill="none" stroke={brassDark} strokeWidth={0.5}/>
      {/* Engraved monogram at top of band */}
      <text x={cx} y={cy - r + size * 0.015} textAnchor="middle"
            fontFamily={fSerif} fontWeight="700"
            fontSize={size * 0.07} fill={brassDark}>OCE</text>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring5_Comet({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.46;
  const stroke = Math.max(3, size * 0.04);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id={`comet-${uid}`}>
          <stop offset="0%" stopColor="#fffbe6"/>
          <stop offset="40%" stopColor={amber} stopOpacity="0.9"/>
          <stop offset="100%" stopColor={amber} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brass} strokeWidth={stroke}/>
      {/* Comet tail: long dashed arc that rotates */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 14s linear infinite' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#comet-${uid})`} strokeWidth={stroke * 1.4}
                strokeDasharray={`${Math.PI * r * 0.55} ${Math.PI * r * 4}`}
                strokeDashoffset={Math.PI * r * 0.4}
                strokeLinecap="round" opacity="0.95"/>
        <circle cx={cx} cy={cy - r} r={size * 0.045} fill="#fffbe6"/>
      </g>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring6_Constellation({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.45;
  const stroke = Math.max(1, size * 0.018);
  const stars = 7;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brass} strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={r * 0.92} fill="none" stroke={brassDark} strokeWidth={stroke * 0.6} opacity="0.6"/>
      {Array.from({ length: stars }).map((_, i) => {
        const a = (i / stars) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${i * 30})`}>
            <circle r={size * 0.025} fill={amber} opacity="0.8"/>
            <circle r={size * 0.012} fill="#fffbe6"/>
          </g>
        );
      })}
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring7_Beveled({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.45;
  const stroke = Math.max(5, size * 0.075);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`bev-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="50%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
        {/* Glint hot-spot — soft radial blob, bright white centre falling
            off to transparent. Painted as a tangent ellipse on the band. */}
        <radialGradient id={`bev-glint-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="1"/>
          <stop offset="35%"  stopColor="#fffbe6" stopOpacity="0.85"/>
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#bev-${uid})`} strokeWidth={stroke}/>
      {/* Bevel: bright top edge + dark bottom edge */}
      <circle cx={cx} cy={cy} r={r + stroke * 0.4} fill="none" stroke={brassBright} strokeWidth={1.5}
              strokeDasharray={`${Math.PI * r * 0.6} ${Math.PI * r * 4}`}
              transform={`rotate(-110 ${cx} ${cy})`} opacity="0.85"/>
      <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill="none" stroke={brassDark} strokeWidth={1.5}
              strokeDasharray={`${Math.PI * r * 0.5} ${Math.PI * r * 4}`}
              transform={`rotate(70 ${cx} ${cy})`} opacity="0.7"/>
      {/* Single sun-glint — one small bright hot-spot on the band that
          streaks across a ~150° arc, fades, then pauses ~3s before
          flashing again. Tangent ellipse so it reads like a long highlight
          on a polished surface. Cycle = 5s: 0.04 fade-in → 0.38 streak →
          0.04 fade-out → 0.54 dark pause. */}
      <g>
        <ellipse cx={cx} cy={cy - r} rx={stroke * 1.6} ry={stroke * 0.55}
                 fill={`url(#bev-glint-${uid})`} opacity="0">
          <animate attributeName="opacity"
                   values="0;1;1;0;0"
                   keyTimes="0;0.04;0.42;0.46;1"
                   dur="5s" repeatCount="indefinite"/>
        </ellipse>
        <animateTransform attributeName="transform" type="rotate"
                          values={`-75 ${cx} ${cy};75 ${cx} ${cy};75 ${cx} ${cy}`}
                          keyTimes="0;0.46;1"
                          dur="5s" repeatCount="indefinite"/>
      </g>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring8_Inscribed({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  // "High-value" engraved gold band. Three concentric brass elements form the
  // bezel: an outer raised rim with bevel highlight, a dark engraved channel
  // where the inscription lives, and an inner raised rim with matching bevel.
  // Four amber cabochon gems are set into the outer rim at cardinal points.
  const stroke = Math.max(3, size * 0.130);          // total bezel thickness
  const rMid = size * 0.38;                           // channel centreline
  const rimT = Math.max(1, stroke * 0.22);            // each raised rim thickness
  const chanT = stroke * 0.50;                        // dark channel thickness
  const rOuterRim = rMid + chanT / 2 + rimT / 2;      // centreline of outer rim
  const rInnerRim = rMid - chanT / 2 - rimT / 2;      // centreline of inner rim
  const rOuterEdge = rOuterRim + rimT / 2;
  const rInnerEdge = rInnerRim - rimT / 2;
  const fontSize = chanT * 0.78;
  // Doubled inscription so the text visibly fills the entire circumference
  // (the previous single phrase, stretched to fit, read as patchy with the
  // heavy letter-spacing). Two repeats give a continuous-looking band of
  // glyphs all the way around.
  const text = '·  FOUNDER  ·  MMXXVI  ·  OCE  ·  INHOUSE  ·  FOUNDER  ·  MMXXVI  ·  OCE  ·  INHOUSE  ';
  const circumference = 2 * Math.PI * rMid;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        {/* Polished brass for the raised rims — bright top, deep bottom for
            the rolled-edge bevel look. */}
        <linearGradient id={`insc-rim-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#fff5d4"/>
          <stop offset="35%" stopColor={brassBright}/>
          <stop offset="70%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
        {/* Dark engraved channel — near-black dark brass (very deep warm
            brown), so the inscription channel reads as oxidised/blackened
            brass set between the two bright raised rims. */}
        <linearGradient id={`insc-chan-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#050402"/>
          <stop offset="50%" stopColor="#140d05"/>
          <stop offset="100%" stopColor="#2a1d0a"/>
        </linearGradient>
        <path id={`insc-path-${uid}`}
              d={`M ${cx},${cy} m -${rMid},0 a ${rMid},${rMid} 0 1,1 ${rMid * 2},0 a ${rMid},${rMid} 0 1,1 -${rMid * 2},0`}/>
        <radialGradient id={`insc-hot-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"   stopColor="#fff" stopOpacity="1"/>
          <stop offset="55%"  stopColor="#fff" stopOpacity="0.5"/>
          <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
        </radialGradient>
        <mask id={`insc-mask-${uid}`}>
          <rect x="0" y="0" width={size} height={size} fill="black"/>
          <g>
            <animateTransform attributeName="transform" type="rotate"
                              from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`}
                              dur="9s" repeatCount="indefinite"/>
            <circle cx={cx} cy={cy - rMid} r={size * 0.18}
                    fill={`url(#insc-hot-${uid})`}/>
          </g>
        </mask>
      </defs>
      {/* Outer raised rim with hairline edges for depth */}
      <circle cx={cx} cy={cy} r={rOuterRim} fill="none"
              stroke={`url(#insc-rim-${uid})`} strokeWidth={rimT}/>
      <circle cx={cx} cy={cy} r={rOuterEdge} fill="none" stroke={brassDark} strokeWidth={0.5}/>
      <circle cx={cx} cy={cy} r={rOuterRim - rimT / 2} fill="none" stroke={brassDark} strokeWidth={0.3} opacity="0.6"/>
      {/* Dark engraved channel between the rims */}
      <circle cx={cx} cy={cy} r={rMid} fill="none"
              stroke={`url(#insc-chan-${uid})`} strokeWidth={chanT}/>
      {/* Inner raised rim with hairline edges */}
      <circle cx={cx} cy={cy} r={rInnerRim} fill="none"
              stroke={`url(#insc-rim-${uid})`} strokeWidth={rimT}/>
      <circle cx={cx} cy={cy} r={rInnerRim + rimT / 2} fill="none" stroke={brassDark} strokeWidth={0.3} opacity="0.6"/>
      <circle cx={cx} cy={cy} r={rInnerEdge} fill="none" stroke={brassDark} strokeWidth={0.5}/>
      {/* BASE inscription — deep amber, always readable */}
      <text fontFamily={fSerif} fontSize={fontSize} fill="#c08a2e"
            letterSpacing={fontSize * 0.22} fontWeight="700"
            dominantBaseline="middle">
        <textPath href={`#insc-path-${uid}`} startOffset="0%" textLength={circumference}>{text}</textPath>
      </text>
      {/* HOT inscription — bright molten gold revealed inside the rotating
          mask, making each letter glow as the hot-spot orbits past. */}
      <g mask={`url(#insc-mask-${uid})`}>
        <text fontFamily={fSerif} fontSize={fontSize} fill="#fff5b6"
              stroke={amber} strokeWidth={0.6}
              letterSpacing={fontSize * 0.22} fontWeight="700"
              dominantBaseline="middle"
              style={{ filter: `drop-shadow(0 0 ${size * 0.012}px ${amber})` }}>
          <textPath href={`#insc-path-${uid}`} startOffset="0%" textLength={circumference}>{text}</textPath>
        </text>
      </g>
      {/* Dark inset for the avatar disc */}
      <circle cx={cx} cy={cy} r={rInnerEdge - 1} fill={bg}/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring9_Phoenix({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.45;
  const stroke = Math.max(3, size * 0.05);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id={`phx-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fffbe6"/>
          <stop offset="50%" stopColor={amber} stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#c83232" stopOpacity="0.7"/>
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r + stroke * 1.2} fill="none" stroke="#c83232" strokeWidth={stroke * 1.4} opacity="0.18"/>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brass} strokeWidth={stroke}/>
      {/* Three ember orbits — same period, offset via negative animation-delay */}
      {[0, 1, 2].map(i => (
        <g key={i} style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 15s linear infinite', animationDelay: `${-i * 5}s` }}>
          <circle cx={cx} cy={cy - r} r={size * 0.05} fill={`url(#phx-${uid})`}/>
        </g>
      ))}
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring10_TwinHalo({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  // Two glowing orbs orbiting on counter-rotating tracks. Sizing is tuned so
  // both orbs (including their pulsing halos) stay COMPLETELY INSIDE the
  // SVG viewBox at every render size — outer orb's max reach r1 + haloR1
  // is 0.40 + 0.055 = 0.455, well inside 0.5. The avatar disc is rendered
  // FIRST so the orbs always sit ON TOP of it, never behind.
  const r1 = size * 0.40, r2 = size * 0.32;
  const haloR1 = size * 0.055, haloR2 = size * 0.050;
  const trackStroke = Math.max(2, size * 0.022);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        {/* Amber orb halo + comet-tail gradient */}
        <radialGradient id={`th-amber-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%"  stopColor="#fffbe6"/>
          <stop offset="35%" stopColor={amber}/>
          <stop offset="100%" stopColor={amber} stopOpacity="0"/>
        </radialGradient>
        <radialGradient id={`th-tail-amber-${uid}`}>
          <stop offset="0%"  stopColor={amber} stopOpacity="0.95"/>
          <stop offset="100%" stopColor={amber} stopOpacity="0"/>
        </radialGradient>
        {/* Cream orb halo + comet-tail gradient */}
        <radialGradient id={`th-cream-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%"  stopColor="#fffbe6"/>
          <stop offset="40%" stopColor="#fffbe6" stopOpacity="0.85"/>
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id={`th-tail-cream-${uid}`}>
          <stop offset="0%"  stopColor="#fffbe6" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* Twin brass tracks */}
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke={brass} strokeWidth={trackStroke}/>
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke={brass} strokeWidth={trackStroke}/>
      {/* Avatar disc rendered BEFORE the orbs so the orbs always sit on top
          of it (the inner orb's orbit crosses in front of the disc area). */}
      <AvatarDisc kind={disc} size={size} uid={uid}/>
      {/* Amber orb on outer ring — clockwise, with comet trail behind it */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 16s linear infinite' }}>
        <circle cx={cx} cy={cy} r={r1} fill="none"
                stroke={`url(#th-tail-amber-${uid})`} strokeWidth={trackStroke * 1.8}
                strokeDasharray={`${Math.PI * r1 * 0.28} ${Math.PI * r1 * 4}`}
                strokeDashoffset={Math.PI * r1 * 0.28}
                strokeLinecap="round" opacity="0.85"/>
        <g style={{ transformOrigin: `${cx}px ${cy - r1}px`, animation: 'fp-breathe 1.8s ease-in-out infinite' }}>
          <circle cx={cx} cy={cy - r1} r={haloR1} fill={`url(#th-amber-${uid})`} opacity="0.85"/>
        </g>
        <circle cx={cx} cy={cy - r1} r={size * 0.030} fill={amber} stroke="#fffbe6" strokeWidth={0.6}/>
        <circle cx={cx - size * 0.010} cy={cy - r1 - size * 0.010} r={size * 0.010} fill="#fffbe6"/>
      </g>
      {/* Cream orb on inner ring — counter-rotating, with its own comet trail */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep-rev 13s linear infinite' }}>
        <circle cx={cx} cy={cy} r={r2} fill="none"
                stroke={`url(#th-tail-cream-${uid})`} strokeWidth={trackStroke * 1.6}
                strokeDasharray={`${Math.PI * r2 * 0.28} ${Math.PI * r2 * 4}`}
                strokeDashoffset={Math.PI * r2 * 0.28}
                strokeLinecap="round" opacity="0.85"/>
        <g style={{ transformOrigin: `${cx}px ${cy - r2}px`, animation: 'fp-breathe 2.2s ease-in-out infinite' }}>
          <circle cx={cx} cy={cy - r2} r={haloR2} fill={`url(#th-cream-${uid})`} opacity="0.85"/>
        </g>
        <circle cx={cx} cy={cy - r2} r={size * 0.028} fill="#fffbe6" stroke={brassBright} strokeWidth={0.5}/>
      </g>
    </svg>
  );
}

function Ring11_TwinSerpent({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.44;
  const stroke = Math.max(3, size * 0.05);
  // Two snakes wound around the band — modelled as a sine-modulated arc
  // (radius oscillates above/below the band centreline). Each snake covers
  // ~180° and they interlock by being offset by π.
  const steps = 72;
  const wave = (t: number, phase: number) => {
    // t in [0, 1] → angle in [0, 2π]
    const ang = t * Math.PI * 2 - Math.PI / 2;
    const amp = stroke * 0.55;
    const rr = r + Math.sin(ang * 3 + phase) * amp;
    return [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr];
  };
  const snakePath = (phase: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [x, y] = wave(t, phase);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return pts.join(' ');
  };
  // Head positions: at t=0 the snake starts at top
  const [hx1, hy1] = wave(0.01, 0);
  const [hx2, hy2] = wave(0.51, Math.PI);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`ser-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brassDark} strokeWidth={0.6} opacity="0.4"/>
      {/* Body shadow underneath for depth */}
      <path d={snakePath(0)} fill="none" stroke="#1a1208" strokeWidth={stroke * 1.15} opacity="0.5"/>
      <path d={snakePath(Math.PI)} fill="none" stroke="#1a1208" strokeWidth={stroke * 1.15} opacity="0.5"/>
      {/* Two interlocking snake bodies */}
      <path d={snakePath(0)} fill="none" stroke={`url(#ser-${uid})`} strokeWidth={stroke} strokeLinecap="round"/>
      <path d={snakePath(Math.PI)} fill="none" stroke={`url(#ser-${uid})`} strokeWidth={stroke} strokeLinecap="round"/>
      {/* Two heads with tiny amber eyes */}
      {[[hx1, hy1], [hx2, hy2]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={stroke * 0.75} fill={brassBright} stroke={brassDark} strokeWidth={0.5}/>
          <circle cx={x} cy={y} r={stroke * 0.18} fill={amber}/>
        </g>
      ))}
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring12_Filigree({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.45;
  const stroke = Math.max(2, size * 0.025);
  // Art Nouveau scrollwork: small spirals at the 8 compass points,
  // connected along the band by gentle curves. Drawn once and rotated.
  const scrollPath = `
    M 0 0
    c ${size * 0.025} ${-size * 0.015}, ${size * 0.045} ${-size * 0.005}, ${size * 0.05} ${size * 0.02}
    c ${size * 0.005} ${size * 0.025}, ${-size * 0.015} ${size * 0.035}, ${-size * 0.03} ${size * 0.025}
    c ${-size * 0.015} ${-size * 0.01}, ${-size * 0.005} ${-size * 0.025}, ${size * 0.005} ${-size * 0.03}
  `;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id={`fil-${uid}`} cx="0.5" cy="0.5">
          <stop offset="60%" stopColor={brass} stopOpacity="0"/>
          <stop offset="100%" stopColor={brass} stopOpacity="0.18"/>
        </radialGradient>
      </defs>
      {/* Inner glow halo */}
      <circle cx={cx} cy={cy} r={r + stroke * 4} fill={`url(#fil-${uid})`}/>
      {/* Twin hairline bands */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brass} strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={r - stroke * 2.5} fill="none" stroke={brassDark} strokeWidth={stroke * 0.5} opacity="0.7"/>
      {/* 8 scroll motifs around the band, mirrored on alternate positions */}
      {Array.from({ length: 8 }).map((_, i) => {
        const ang = (i / 8) * 360;
        const mirror = i % 2 === 0 ? 1 : -1;
        return (
          <g key={i} transform={`rotate(${ang} ${cx} ${cy}) translate(${cx} ${cy - r}) scale(${mirror} 1)`}>
            <path d={scrollPath} fill="none" stroke={brassBright} strokeWidth={stroke * 0.7} strokeLinecap="round"/>
            <path d={scrollPath} fill="none" stroke={brassDark} strokeWidth={stroke * 0.3} strokeLinecap="round"
                  transform="translate(0.3 0.3)" opacity="0.6"/>
            {/* Tiny dot accent at the spiral's centre */}
            <circle cx={size * 0.015} cy={size * 0.012} r={stroke * 0.4} fill={amber}/>
          </g>
        );
      })}
      {/* Four cardinal anchor points — small brass rosettes */}
      {[0, 90, 180, 270].map(deg => (
        <g key={deg} transform={`rotate(${deg} ${cx} ${cy}) translate(${cx} ${cy - r})`}>
          <circle r={stroke * 1.4} fill={brassDark}/>
          <circle r={stroke * 1.0} fill={brassBright}/>
          <circle r={stroke * 0.3} fill={amber}/>
        </g>
      ))}
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring13_Sigil({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.43;
  const stroke = Math.max(4, size * 0.065);
  // Center medallion at 12-o'clock that breaks the band's top edge.
  const sigilSize = size * 0.22;
  const sigilCx = cx;
  const sigilCy = cy - r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sig-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
        <linearGradient id={`sig-med-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe6a8"/>
          <stop offset="55%" stopColor={brassBright}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
        <radialGradient id={`sig-glow-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor={amber} stopOpacity="0.45"/>
          <stop offset="100%" stopColor={amber} stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* Soft glow behind the medallion */}
      <circle cx={sigilCx} cy={sigilCy} r={sigilSize * 1.4} fill={`url(#sig-glow-${uid})`}/>
      {/* Main band */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#sig-band-${uid})`} strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={r + stroke / 2} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      <circle cx={cx} cy={cy} r={r - stroke / 2} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
      {/* Diamond-cut medallion sitting ON TOP of the band */}
      <g transform={`translate(${sigilCx} ${sigilCy})`}>
        {/* Diamond outline */}
        <path d={`M 0 ${-sigilSize * 0.9}
                  L ${sigilSize * 0.78} 0
                  L 0 ${sigilSize * 0.9}
                  L ${-sigilSize * 0.78} 0 Z`}
              fill={`url(#sig-med-${uid})`} stroke={brassDark} strokeWidth={1}/>
        {/* Inner facet lines */}
        <path d={`M 0 ${-sigilSize * 0.9} L 0 ${sigilSize * 0.9}
                  M ${-sigilSize * 0.78} 0 L ${sigilSize * 0.78} 0`}
              stroke={brassDark} strokeWidth={0.5} opacity="0.55"/>
        {/* Inner diamond + centre crest letter */}
        <path d={`M 0 ${-sigilSize * 0.55}
                  L ${sigilSize * 0.48} 0
                  L 0 ${sigilSize * 0.55}
                  L ${-sigilSize * 0.48} 0 Z`}
              fill="#1a1208" opacity="0.85"/>
        <text x={0} y={sigilSize * 0.18} textAnchor="middle"
              fontFamily={fSerif} fontWeight="700"
              fontSize={sigilSize * 0.55} fill={amber}>OA</text>
        {/* Top sparkle */}
        <circle cx={0} cy={-sigilSize * 0.72} r={sigilSize * 0.05} fill="#fffbe6"/>
      </g>
    </svg>
  );
}

function Ring14_Astrolabe({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  // Pulled in slightly so the outer ring's stroke half-width stays inside size/2.
  const rOuter = size * 0.44;
  const rMid = size * 0.38;
  const rInner = size * 0.32;
  const stroke = Math.max(1.5, size * 0.018);
  // Tick marks for each ring — long every 4th, short otherwise, drawn as
  // radial lines that read as engraved graduations on an antique astrolabe.
  const ringTicks = (radius: number, count: number, longEvery: number, longLen: number, shortLen: number) =>
    Array.from({ length: count }).map((_, i) => {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      const isLong = i % longEvery === 0;
      const len = isLong ? longLen : shortLen;
      const x1 = cx + Math.cos(a) * radius;
      const y1 = cy + Math.sin(a) * radius;
      const x2 = cx + Math.cos(a) * (radius - len);
      const y2 = cy + Math.sin(a) * (radius - len);
      return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                   stroke={isLong ? brassBright : brass}
                   strokeWidth={isLong ? stroke * 0.9 : stroke * 0.5}
                   opacity={isLong ? 0.95 : 0.7}/>;
    });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`ast-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="55%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
        {/* Inner amber glow — sits between centre and the outermost ring so it
            stays inside the viewBox at every preview size. */}
        <radialGradient id={`ast-glow-${uid}`} cx="0.5" cy="0.5">
          <stop offset="30%" stopColor={amber} stopOpacity="0"/>
          <stop offset="70%" stopColor={amber} stopOpacity="0.10"/>
          <stop offset="100%" stopColor={amber} stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* Inner amber halo, contained inside the outermost ring */}
      <circle cx={cx} cy={cy} r={rOuter} fill={`url(#ast-glow-${uid})`}/>
      {/* Outer engraved ring — rotates slowly clockwise */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 28s linear infinite' }}>
        <circle cx={cx} cy={cy} r={rOuter} fill="none"
                stroke={`url(#ast-band-${uid})`} strokeWidth={stroke * 1.4}/>
        {ringTicks(rOuter, 32, 4, size * 0.045, size * 0.022)}
      </g>
      {/* Middle ring — counter-rotates, different speed */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep-rev 18s linear infinite' }}>
        <circle cx={cx} cy={cy} r={rMid} fill="none"
                stroke={`url(#ast-band-${uid})`} strokeWidth={stroke * 1.1}/>
        {ringTicks(rMid, 24, 6, size * 0.030, size * 0.015)}
        {/* Two cardinal pointer beads at opposite positions */}
        <circle cx={cx} cy={cy - rMid} r={size * 0.028} fill={amber} stroke={brassDark} strokeWidth={0.5}/>
        <circle cx={cx} cy={cy + rMid} r={size * 0.020} fill={brassBright} stroke={brassDark} strokeWidth={0.5}/>
      </g>
      {/* Inner ring — rotates slow forward, distinct from outer */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 40s linear infinite' }}>
        <circle cx={cx} cy={cy} r={rInner} fill="none"
                stroke={brass} strokeWidth={stroke}/>
        {ringTicks(rInner, 16, 4, size * 0.022, size * 0.010)}
      </g>
      {/* Centre crosshairs — engraved compass lines, static */}
      <line x1={cx - rInner * 0.15} y1={cy} x2={cx + rInner * 0.15} y2={cy}
            stroke={brassDark} strokeWidth={stroke * 0.5} opacity="0.5"/>
      <line x1={cx} y1={cy - rInner * 0.15} x2={cx} y2={cy + rInner * 0.15}
            stroke={brassDark} strokeWidth={stroke * 0.5} opacity="0.5"/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring15_Eclipse({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  // Pulled in to leave headroom for the corona/halo without exceeding viewBox.
  const r = size * 0.41;
  const stroke = Math.max(3, size * 0.05);
  // Warped band geometry — a circle with a smooth radial bulge centred at
  // angle 0 (top). The whole path rotates in lockstep with the orbiting body
  // below, so the band appears to bow outward under the body's gravity
  // wherever it passes. Gaussian falloff for a smooth, organic-looking warp.
  const SEG = 120;
  const sigma = 0.35;           // ~20° spread of the squeeze
  const bulge = -stroke * 1.05; // NEGATIVE = squeeze inward (band pinched
                                // toward centre where the orb passes, like
                                // the orb is compressing the band).
  const warpedPath = (radius: number) => {
    let d = '';
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2;
      let dt = t; if (dt > Math.PI) dt -= Math.PI * 2;
      const rr = radius + bulge * Math.exp(-(dt * dt) / (2 * sigma * sigma));
      const x = cx + rr * Math.sin(t);
      const y = cy - rr * Math.cos(t);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
    }
    return d + 'Z';
  };
  const bandD  = warpedPath(r);
  const outerD = warpedPath(r + stroke / 2);
  const innerD = warpedPath(r - stroke / 2);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        {/* Eclipse corona: bright amber rim — drawn as a stroke whose half-width
            is bounded so the outer edge stays inside size/2 at every size. */}
        <radialGradient id={`ecl-corona-${uid}`} cx="0.5" cy="0.5">
          <stop offset="65%" stopColor="#0d0a04" stopOpacity="0"/>
          <stop offset="80%" stopColor={amber} stopOpacity="0.45"/>
          <stop offset="92%" stopColor="#fffbe6" stopOpacity="0.7"/>
          <stop offset="100%" stopColor={amber} stopOpacity="0"/>
        </radialGradient>
        {/* The eclipsing body: dark sphere with subtle rim light */}
        <radialGradient id={`ecl-body-${uid}`} cx="0.45" cy="0.35">
          <stop offset="0%" stopColor="#3a2a1a"/>
          <stop offset="55%" stopColor="#0d0a04"/>
          <stop offset="100%" stopColor="#000"/>
        </radialGradient>
        {/* Breathing inner halo — sits inside the ring, gently pulses */}
        <radialGradient id={`ecl-breath-${uid}`} cx="0.5" cy="0.5">
          <stop offset="40%" stopColor={amber} stopOpacity="0"/>
          <stop offset="80%" stopColor={amber} stopOpacity="0.20"/>
          <stop offset="100%" stopColor={amber} stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* Breathing amber halo — INSIDE the band, pulses on a faster cycle */}
      <circle cx={cx} cy={cy} r={r - stroke * 0.5} fill={`url(#ecl-breath-${uid})`}
              style={{ animation: 'fp-breathe 3.5s ease-in-out infinite', transformOrigin: `${cx}px ${cy}px` }}/>
      {/* Pinched brass band — rotates in lockstep with the orbiting body so
          the squeeze always sits directly under the body. The band is
          pulled INWARD toward centre as the orb passes, as if the orb's
          mass is compressing it. */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 22s linear infinite' }}>
        <path d={bandD}  fill="none" stroke={brass}     strokeWidth={stroke}/>
        <path d={outerD} fill="none" stroke={brassDark} strokeWidth={0.6}/>
        <path d={innerD} fill="none" stroke={brassDark} strokeWidth={0.6}/>
        {/* Subtle amber rim-light along the bulged section — implies the
            warped band is also bending light from the body. */}
        <path d={bandD} fill="none" stroke={amber} strokeWidth={stroke * 0.35} opacity="0.5"
              strokeDasharray={`${Math.PI * r * 0.18} ${Math.PI * r * 4}`}
              strokeDashoffset={`${-Math.PI * r * 0.09}`}/>
      </g>
      {/* Corona ring — breathes on a slightly offset cycle (kept as a plain
          circle behind everything; its softness hides any non-warp). */}
      <circle cx={cx} cy={cy} r={r} fill="none"
              stroke={`url(#ecl-corona-${uid})`} strokeWidth={stroke * 1.5}
              style={{ animation: 'fp-breathe 4.2s ease-in-out infinite', transformOrigin: `${cx}px ${cy}px` }}/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
      {/* The eclipsing body — a dark sphere that orbits on the ORIGINAL
          (un-warped) circular path. Same 22s period as the warped band, so
          the bulge stays directly beneath it as the band distorts around it. */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 22s linear infinite' }}>
        <g transform={`translate(${cx} ${cy - r})`}>
          {/* Bright corona behind the sphere — pulses independently for the
              "solar flare" effect as the eclipsing body orbits. */}
          <g style={{ animation: 'fp-pulse-bright 2.6s ease-in-out infinite', transformOrigin: '0 0' }}>
            <circle r={stroke * 2.0} fill={`url(#ecl-corona-${uid})`} opacity="0.6"/>
            <circle r={stroke * 1.6} fill={`url(#ecl-corona-${uid})`} opacity="0.9"/>
          </g>
          {/* The dark body itself */}
          <circle r={stroke * 0.95} fill={`url(#ecl-body-${uid})`}
                  stroke={brassDark} strokeWidth={0.5}/>
          {/* Rim-light catch on the upper-left edge */}
          <circle r={stroke * 0.95} fill="none"
                  stroke="#fffbe6" strokeWidth={0.6} strokeDasharray={`${stroke * 0.7} ${stroke * 4}`}
                  transform="rotate(-120)" opacity="0.7"/>
        </g>
      </g>
    </svg>
  );
}

function Ring16_Forge({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  // Forge — molten brass band using turbulence + displacement (the original,
  // good-looking version). The previous "bites" out of the band were NOT the
  // displacement itself — they were the filter REGION being bounded to the
  // band's bbox (x=0% width=100%), which clamped displaced pixels at the
  // edge. The fix: expand the filter region well past the band so displaced
  // pixels have room to render, and keep the displacement scale small enough
  // that the outer reach stays inside the viewBox.
  const r = size * 0.36;          // pulled in so the displaced outer edge stays inside the viewBox
  const stroke = Math.max(3, size * 0.045);
  const emberCount = 5;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`fg-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="40%" stopColor={amber}/>
          <stop offset="100%" stopColor="#8a3a08"/>
        </linearGradient>
        <radialGradient id={`fg-glow-${uid}`} cx="0.5" cy="0.5">
          <stop offset="50%" stopColor="#ff8c1a" stopOpacity="0"/>
          <stop offset="100%" stopColor="#ff8c1a" stopOpacity="0.20"/>
        </radialGradient>
        <radialGradient id={`fg-ember-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fffbe6"/>
          <stop offset="40%" stopColor={amber}/>
          <stop offset="100%" stopColor="#c83232" stopOpacity="0"/>
        </radialGradient>
        {/* Molten ripple — turbulence + displacement applied to the band.
            CRITICAL: the filter region must be larger than the band's bbox so
            displaced pixels have room to render. The previous version had
            x=0% width=100% which clamped displaced pixels at the band's edge
            (that's what produced the "bites" out of the ring). */}
        <filter id={`fg-melt-${uid}`}
                x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08"
                        numOctaves="2" seed="3" result="noise">
            <animate attributeName="baseFrequency"
                     values="0.04 0.08;0.06 0.10;0.04 0.08"
                     dur="9s" repeatCount="indefinite"/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise"
                             scale={size * 0.006} xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
      {/* Inner heat glow contained inside the band */}
      <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill={`url(#fg-glow-${uid})`}/>
      {/* The molten band — solid brass stroke through the melt filter. With
          r=0.36 and stroke=0.045 the outer band edge sits at 0.3825, plus
          the tiny displacement scale of 0.006 → max reach ≈ 0.39, well
          inside the 0.5 viewBox half-width. */}
      <g filter={`url(#fg-melt-${uid})`}>
        <circle cx={cx} cy={cy} r={r} fill="none"
                stroke={`url(#fg-band-${uid})`} strokeWidth={stroke}/>
      </g>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
      {/* Rising embers — staggered timings */}
      {Array.from({ length: emberCount }).map((_, i) => {
        const ang = Math.PI / 2 + ((i / emberCount) - 0.5) * Math.PI * 0.7;
        const ex = cx + Math.cos(ang) * r;
        const ey = cy + Math.sin(ang) * r;
        const dur = 3.2;
        const begin = `${-i * 0.65}s`;
        return (
          <circle key={i} cx={ex} cy={ey} r={size * 0.014}
                  fill={`url(#fg-ember-${uid})`} opacity="0">
            <animate attributeName="cy"
                     from={ey} to={ey - size * 0.14}
                     dur={`${dur}s`} begin={begin} repeatCount="indefinite"/>
            <animate attributeName="opacity"
                     values="0;1;1;0" keyTimes="0;0.15;0.7;1"
                     dur={`${dur}s`} begin={begin} repeatCount="indefinite"/>
          </circle>
        );
      })}
    </svg>
  );
}

function Ring17_Aurora({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.44;
  const stroke = Math.max(3, size * 0.055);
  // Flowing brass aurora: a multi-stop linearGradient (brassDark → brass →
  // brassBright → cream → amber → brassBright → brassDark) whose gradient
  // transform rotates continuously, making the colour bands appear to flow
  // around the ring's circumference like a slow shimmer.
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`aur-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brassDark}/>
          <stop offset="15%" stopColor={brass}/>
          <stop offset="30%" stopColor={brassBright}/>
          <stop offset="45%" stopColor="#fffbe6"/>
          <stop offset="55%" stopColor={amber}/>
          <stop offset="70%" stopColor={brassBright}/>
          <stop offset="85%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassDark}/>
          <animateTransform attributeName="gradientTransform" type="rotate"
                            from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`}
                            dur="7s" repeatCount="indefinite"/>
        </linearGradient>
        <linearGradient id={`aur-inner-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="50%" stopColor="#fffbe6"/>
          <stop offset="100%" stopColor={brass}/>
          <animateTransform attributeName="gradientTransform" type="rotate"
                            from={`0 ${cx} ${cy}`} to={`-360 ${cx} ${cy}`}
                            dur="11s" repeatCount="indefinite"/>
        </linearGradient>
      </defs>
      {/* Outer flowing band */}
      <circle cx={cx} cy={cy} r={r} fill="none"
              stroke={`url(#aur-${uid})`} strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={r + stroke / 2} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      <circle cx={cx} cy={cy} r={r - stroke / 2} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      {/* Thin inner hairline counter-rotating for parallax depth */}
      <circle cx={cx} cy={cy} r={r - stroke * 0.7} fill="none"
              stroke={`url(#aur-inner-${uid})`} strokeWidth={Math.max(1, size * 0.012)} opacity="0.9"/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring18_Runes({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.40;          // pulled in so rune glyphs + glow stay inside viewBox at 26px
  const stroke = Math.max(3, size * 0.045);
  // 8 rune glyphs arranged around the band. Each one has a base brass version
  // (always visible) and a bright amber "glowing" version on top that fades
  // in/out via fp-pulse on a staggered delay, so the runes appear to light up
  // sequentially as if some unseen force is reading them.
  const glyphSize = size * 0.045;
  // Each glyph is a tiny abstract path scaled to glyphSize. Simple geometric
  // shapes (triangle, cross, diamond, double-bar, vesica, arrow, X, circle).
  const GLYPHS = [
    `M 0 ${-glyphSize} L ${glyphSize * 0.7} ${glyphSize * 0.6} L ${-glyphSize * 0.7} ${glyphSize * 0.6} Z`,
    `M ${-glyphSize * 0.8} 0 L ${glyphSize * 0.8} 0 M 0 ${-glyphSize * 0.8} L 0 ${glyphSize * 0.8}`,
    `M 0 ${-glyphSize} L ${glyphSize * 0.7} 0 L 0 ${glyphSize} L ${-glyphSize * 0.7} 0 Z`,
    `M ${-glyphSize * 0.7} ${-glyphSize * 0.4} L ${glyphSize * 0.7} ${-glyphSize * 0.4} M ${-glyphSize * 0.7} ${glyphSize * 0.4} L ${glyphSize * 0.7} ${glyphSize * 0.4}`,
    `M 0 ${-glyphSize} Q ${glyphSize * 0.7} 0 0 ${glyphSize} Q ${-glyphSize * 0.7} 0 0 ${-glyphSize} Z`,
    `M 0 ${-glyphSize} L 0 ${glyphSize * 0.6} M ${-glyphSize * 0.5} ${glyphSize * 0.1} L 0 ${glyphSize * 0.6} L ${glyphSize * 0.5} ${glyphSize * 0.1}`,
    `M ${-glyphSize * 0.7} ${-glyphSize * 0.7} L ${glyphSize * 0.7} ${glyphSize * 0.7} M ${-glyphSize * 0.7} ${glyphSize * 0.7} L ${glyphSize * 0.7} ${-glyphSize * 0.7}`,
    `M 0 ${-glyphSize * 0.7} L ${glyphSize * 0.5} 0 L 0 ${glyphSize * 0.7} L ${-glyphSize * 0.5} 0 Z M 0 ${-glyphSize * 0.35} L 0 ${glyphSize * 0.35}`,
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`rn-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="55%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
      </defs>
      {/* Thin brass band that the runes sit on */}
      <circle cx={cx} cy={cy} r={r} fill="none"
              stroke={`url(#rn-band-${uid})`} strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={r + stroke / 2} fill="none" stroke={brassDark} strokeWidth={0.5}/>
      <circle cx={cx} cy={cy} r={r - stroke / 2} fill="none" stroke={brassDark} strokeWidth={0.5}/>
      {GLYPHS.map((d, i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const gx = cx + Math.cos(a) * r;
        const gy = cy + Math.sin(a) * r;
        const rot = (a * 180 / Math.PI) + 90;
        return (
          <g key={i} transform={`translate(${gx} ${gy}) rotate(${rot})`}>
            {/* Base rune — always visible, deep brass */}
            <path d={d} stroke={brassDark} strokeWidth={size * 0.008}
                  fill={d.includes('Z') ? brassDark : 'none'} strokeLinecap="round"/>
            {/* Glowing overlay — bright amber, fades in then out via fp-pulse.
                8 runes × 0.5s offset = 4s cycle, so each glyph glows once
                every 4 seconds in a slow procession around the band. */}
            <g style={{ animation: 'fp-pulse 4s ease-in-out infinite',
                        animationDelay: `${-i * 0.5}s` }}>
              <path d={d} stroke={amber} strokeWidth={size * 0.012}
                    fill={d.includes('Z') ? amber : 'none'} strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 ${size * 0.008}px ${amber})` }}/>
            </g>
          </g>
        );
      })}
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

function Ring19_Storm({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;          // pulled in so bolts + glow stay well clear
  const stroke = Math.max(3, size * 0.05);
  // A brooding dark-steel band with lightning bolts that actually look like
  // lightning: each bolt has its own JAGGED main path with randomly-varying
  // segment widths and 1–2 forking branches, fires on its own asynchronous
  // cycle (prime-ish durations + non-uniform delays so they NEVER sync into
  // a visible pattern), and is hard-clipped to a circular boundary.
  //
  // Deterministic-but-chaotic seeded pseudo-RNG. Same seed always produces
  // the same bolt shape on every render, but different seeds look genuinely
  // different (not just a sine wave with a phase shift).
  const hash = (n: number) => {
    let x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);                       // → [0, 1)
  };
  const buildBolt = (seed: number, len: number) => {
    // Varying segment count per bolt (5–9) so silhouettes differ.
    const segs = 5 + Math.floor(hash(seed) * 5);
    const main: string[] = ['M 0 0'];
    let prevDx = 0;
    for (let i = 1; i <= segs; i++) {
      // Each segment's lateral offset is a perturbation of the previous one
      // (random walk), which reads as a proper jagged stroke rather than
      // a sine wave.
      const step = (hash(seed * 7.1 + i * 3.7) - 0.5) * size * 0.045;
      const dx = prevDx * 0.4 + step;
      prevDx = dx;
      main.push(`L ${dx.toFixed(2)} ${((i / segs) * len).toFixed(2)}`);
    }
    // 1 or 2 branching forks at random segments / random sides.
    const buildBranch = (branchSeed: number) => {
      const at = 1 + Math.floor(hash(branchSeed) * (segs - 2));     // segment index 1..segs-2
      const bx = (hash(branchSeed + 0.11) - 0.5) * size * 0.04;
      const by = (at / segs) * len;
      const dir = hash(branchSeed + 0.23) > 0.5 ? 1 : -1;
      const bLen = len * (0.30 + hash(branchSeed + 0.41) * 0.25);
      const bSegs = 2 + Math.floor(hash(branchSeed + 0.53) * 2);
      const pts: string[] = [`M ${bx.toFixed(2)} ${by.toFixed(2)}`];
      let prev = bx;
      for (let i = 1; i <= bSegs; i++) {
        const step = (hash(branchSeed + i * 4.7) - 0.5) * size * 0.032;
        const x = prev + dir * (size * 0.018) + step;
        prev = x;
        pts.push(`L ${x.toFixed(2)} ${(by + (i / bSegs) * bLen).toFixed(2)}`);
      }
      return pts.join(' ');
    };
    const branches: string[] = [buildBranch(seed + 1.7)];
    if (hash(seed + 2.9) > 0.45) branches.push(buildBranch(seed + 5.3));
    return { main: main.join(' '), branches };
  };
  // Six lightning positions around the band. Each fires on its own non-
  // synchronising cycle (durations 4.2 / 5.7 / 4.9 / 6.4 / 5.3 / 7.1 s —
  // no common multiples) with irregular start offsets, so the storm never
  // forms a visible repeating pattern. Bolt LENGTHS also vary per slot.
  const slots = [
    { angOff: 0.10, dur: 4.2, delay: 0.0, seed: 17.31, len: size * 0.105 },
    { angOff: 1.25, dur: 5.7, delay: 1.3, seed: 41.07, len: size * 0.130 },
    { angOff: 2.40, dur: 4.9, delay: 2.7, seed: 63.49, len: size * 0.090 },
    { angOff: 3.55, dur: 6.4, delay: 0.6, seed: 88.13, len: size * 0.115 },
    { angOff: 4.70, dur: 5.3, delay: 3.4, seed:108.77, len: size * 0.140 },
    { angOff: 5.85, dur: 7.1, delay: 1.9, seed:131.21, len: size * 0.100 },
  ];
  const arcs = slots.map((s, i) => {
    const a = s.angOff - Math.PI / 2;     // 0 rad anchor is now top of ring
    const sx = cx + Math.cos(a) * r;
    const sy = cy + Math.sin(a) * r;
    const rot = (a * 180 / Math.PI) - 90;     // local +y → inward
    return { i, sx, sy, rot, dur: s.dur, delay: s.delay, ...buildBolt(s.seed, s.len) };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`st-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a4a6a"/>
          <stop offset="50%" stopColor="#1a2236"/>
          <stop offset="100%" stopColor="#0d1424"/>
        </linearGradient>
        <radialGradient id={`st-core-${uid}`} cx="0.5" cy="0.5">
          <stop offset="60%" stopColor="#3a6fb5" stopOpacity="0"/>
          <stop offset="100%" stopColor="#3a6fb5" stopOpacity="0.18"/>
        </radialGradient>
        {/* Hard outer clip — guarantees bolts + glow can't escape the viewBox */}
        <clipPath id={`st-clip-${uid}`}>
          <circle cx={cx} cy={cy} r={size / 2 - 0.5}/>
        </clipPath>
      </defs>
      <g clipPath={`url(#st-clip-${uid})`}>
        {/* Inner electric halo, contained */}
        <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill={`url(#st-core-${uid})`}/>
        {/* Dark stormcloud band */}
        <circle cx={cx} cy={cy} r={r} fill="none"
                stroke={`url(#st-band-${uid})`} strokeWidth={stroke}/>
        <circle cx={cx} cy={cy} r={r + stroke / 2} fill="none" stroke="#3a4a6a" strokeWidth={0.5}/>
        <circle cx={cx} cy={cy} r={r - stroke / 2} fill="none" stroke="#3a4a6a" strokeWidth={0.5}/>
        {/* Six bolts, each on its own non-synchronising strike cycle. */}
        {arcs.map(({ i, sx, sy, rot, dur, delay, main, branches }) => (
          <g key={i} transform={`translate(${sx} ${sy}) rotate(${rot})`}>
            <g style={{ animation: `fp-strike ${dur}s ease-out infinite`,
                        animationDelay: `${-delay}s` }}>
              {/* Diffuse electric-blue halo — main + each branch */}
              <path d={main} fill="none" stroke="#7ab8ff" strokeWidth={size * 0.026}
                    strokeLinecap="round" strokeLinejoin="round" opacity="0.55"
                    style={{ filter: `blur(${size * 0.010}px)` }}/>
              {branches.map((b, j) => (
                <path key={j} d={b} fill="none" stroke="#7ab8ff" strokeWidth={size * 0.018}
                      strokeLinecap="round" strokeLinejoin="round" opacity="0.45"
                      style={{ filter: `blur(${size * 0.008}px)` }}/>
              ))}
              {/* Bright white cores — main + each branch */}
              <path d={main} fill="none" stroke="#fffbe6" strokeWidth={size * 0.011}
                    strokeLinecap="round" strokeLinejoin="round"/>
              {branches.map((b, j) => (
                <path key={j} d={b} fill="none" stroke="#fffbe6" strokeWidth={size * 0.007}
                      strokeLinecap="round" strokeLinejoin="round"/>
              ))}
            </g>
          </g>
        ))}
        <AvatarDisc kind={disc} size={size} uid={uid}/>
      </g>
    </svg>
  );
}

function Ring20_Constellation({ size = 140, disc = 'monogram' }: RingProps) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.44;
  // 12 stars at fixed positions, with connecting lines that form a constellation
  // pattern (each star linked to its 2nd-and-4th neighbour). Stars twinkle on
  // staggered delays. The whole constellation rotates very slowly so it reads
  // as a star map rotating across the night sky.
  const N = 12;
  const stars = Array.from({ length: N }).map((_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    return { i, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  // Connect i → (i+2) and i → (i+5) for a non-trivial graph pattern.
  const edges: { a: number; b: number }[] = [];
  for (let i = 0; i < N; i++) {
    edges.push({ a: i, b: (i + 2) % N });
    if (i % 2 === 0) edges.push({ a: i, b: (i + 5) % N });
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id={`con-bg-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#0d1424"/>
          <stop offset="100%" stopColor="#050810"/>
        </radialGradient>
        <radialGradient id={`con-star-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fffbe6"/>
          <stop offset="40%" stopColor={brassBright}/>
          <stop offset="100%" stopColor={amber} stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* Dark night-sky disc behind everything */}
      <circle cx={cx} cy={cy} r={r + size * 0.04} fill={`url(#con-bg-${uid})`}/>
      {/* Faint brass ring marking the constellation's path */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brassDark}
              strokeWidth={Math.max(1, size * 0.010)} opacity="0.5"/>
      {/* The whole constellation rotates very slowly for that "sky drifting" feel */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 60s linear infinite' }}>
        {/* Connecting lines drawn in faint amber */}
        {edges.map((e, i) => (
          <line key={i} x1={stars[e.a].x} y1={stars[e.a].y}
                x2={stars[e.b].x} y2={stars[e.b].y}
                stroke={amber} strokeWidth={Math.max(0.5, size * 0.005)} opacity="0.30"/>
        ))}
        {/* Stars — twinkle staggered, drawn as soft radial gradients with cross-rays */}
        {stars.map(({ i, x, y }) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <g style={{ animation: 'fp-twinkle 3.5s ease-in-out infinite',
                        animationDelay: `${-i * 0.28}s`,
                        transformOrigin: '0 0' }}>
              <circle r={size * 0.05} fill={`url(#con-star-${uid})`}/>
              <circle r={size * 0.014} fill="#fffbe6"/>
              {/* Four-pointed sparkle rays */}
              <line x1={-size * 0.04} y1={0} x2={size * 0.04} y2={0}
                    stroke="#fffbe6" strokeWidth={0.7} opacity="0.7"/>
              <line x1={0} y1={-size * 0.04} x2={0} y2={size * 0.04}
                    stroke="#fffbe6" strokeWidth={0.7} opacity="0.7"/>
            </g>
          </g>
        ))}
      </g>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
    </svg>
  );
}

const RINGS: { id: string; name: string; tag: string; Comp: React.FC<RingProps> }[] = [
  { id: 'classic',   name: '1. Classic Brass',  tag: 'Roman numerals · cabochons · milled edge', Comp: Ring1_Classic },
  { id: 'laurel',    name: '2. Laurel Wreath',  tag: 'Pointed almond leaves · gold-relief ref',  Comp: Ring3_Laurel },
  { id: 'beveled',   name: '3. Beveled Edge',   tag: 'Bright bevel · periodic shimmer sweep',    Comp: Ring7_Beveled },
  { id: 'inscribed', name: '4. Inscribed',      tag: 'Raised rims · dark brass · molten text',   Comp: Ring8_Inscribed },
  { id: 'phoenix',   name: '5. Phoenix',        tag: 'Three orbiting embers · crimson halo',     Comp: Ring9_Phoenix },
  { id: 'twin',      name: '6. Twin Halo',      tag: 'Counter-rotating dual rings',              Comp: Ring10_TwinHalo },
  { id: 'astrolabe', name: '7. Astrolabe',      tag: 'Animated · 3 rings · engraved ticks',     Comp: Ring14_Astrolabe },
  { id: 'eclipse',   name: '8. Eclipse',        tag: 'Band pinches inward under the orbiting body', Comp: Ring15_Eclipse },
  { id: 'forge',     name: '9. Forge',          tag: 'Animated · molten brass + rising embers', Comp: Ring16_Forge },
  { id: 'storm',     name: '10. Storm',         tag: 'Animated · multi-flash lightning strikes', Comp: Ring19_Storm },
  { id: 'starmap',   name: '11. Constellation', tag: 'Animated · twinkling star map',           Comp: Ring20_Constellation },
];

const DISC_OPTIONS: { id: DiscKind; name: string; tag: string }[] = [
  { id: 'steam',    name: 'Steam avatar',    tag: 'Real player PFP — production default' },
  { id: 'monogram', name: 'Brass monogram',  tag: 'Initial in italic Playfair' },
  { id: 'hero',     name: 'Hero portrait',   tag: 'Player\'s most-played hero' },
  { id: 'tier',     name: 'Tier badge',      tag: 'Brass/silver/bronze tier disc' },
  { id: 'emblem',   name: 'OCE emblem',      tag: 'OA logo · brand-default' },
];

export function FoundersRingPicker() {
  const [disc, setDisc] = React.useState<DiscKind>('steam');
  return (
    <div style={{ background: bg, color: text, fontFamily: fSans, minHeight: '100vh', padding: '32px 40px' }}>
      <style>{`
        @keyframes fp-sweep     { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fp-sweep-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes fp-breathe   { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        /* Lightning STRIKE sequence — multiple flashes per cycle so storm
           reads as proper lightning (initial → flicker → secondary → fade)
           rather than a single quick blip. Strike window is ~22% of cycle. */
        @keyframes fp-strike    {
          0%, 7%, 22%, 100% { opacity: 0; }
          8%  { opacity: 1; }    /* initial strike */
          10% { opacity: 0.3; }
          11% { opacity: 0.95; } /* flicker */
          12% { opacity: 0.4; }
          13% { opacity: 0.85; }
          14% { opacity: 0.5; }
          16% { opacity: 1; }    /* secondary strike */
          17% { opacity: 0.6; }
          18% { opacity: 0.9; }
        }
        /* Star twinkle — gentle scale + opacity wobble */
        @keyframes fp-twinkle   { 0%,100% { opacity: 0.35; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.15); } }
        /* Bright pulse — sharper opacity swing for solar-flare style breathing */
        @keyframes fp-pulse-bright { 0%,100% { opacity: 0.45; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
        /* Soft pulse — opacity-only fade-in/out used by rune highlights */
        @keyframes fp-pulse { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
      `}</style>

      <header style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: fCond, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase', color: amber, marginBottom: 6 }}>Founders Pass · Picker</div>
        <h1 style={{ fontFamily: fSerif, fontSize: 36, fontWeight: 700, margin: '0 0 8px' }}>Pick your founders ring</h1>
        <p style={{ color: muted, maxWidth: 760, lineHeight: 1.55, margin: 0 }}>
          Shortlist of eleven, retuned to the latest direction notes.
          <strong> Classic Brass</strong> now carries twelve engraved <em>Roman numerals</em> (I–XII) chased
          around a wide beveled band at clock positions, four amber cabochon gems set at the cardinal points,
          and a milled outer edge — proper Roman-coin detail, not just a gold ring. <strong>Laurel</strong> is rebuilt with
          long pointed almond leaves (~14 per branch) leaning along the rib the way real laurel grows, rising
          from a single brass stem at the bottom centre with a ~60° open gap at the top — branches now reach
          nearly to the crown, matching the gold-relief reference shape. <strong>Inscribed</strong> swaps the navy channel for near-black dark
          brass so the inscription reads as oxidised metal between two bright raised rims, and the engraved
          text now repeats twice so it visibly fills the entire circumference instead of stretching to fit.
          <strong> Forge</strong> is back to the original turbulence-displacement molten brass band — the
          previous "bites" were the filter region being clamped to the band's bbox, fixed by expanding the
          filter region and pulling the band radius in a touch so the displaced edge stays inside the box. <strong>Twin Halo</strong> orbits shrunk
          (r₁ 0.40, r₂ 0.32, halo 0.055) so both orbs stay fully inside the box on every pass, and the avatar
          disc is rendered before the orbs so they always sit on top of it.
          <strong> Beveled Edge</strong> shows one small sun-glint that streaks across a ~150° arc on the
          top of the band, then pauses ~3s before flashing again. <strong>Storm</strong> remains six
          asynchronous jagged-walk lightning bolts inside a circular clip. <strong>Eclipse</strong> now
          uses a Gaussian-pinched band path that rotates in lockstep with the orbiting body — the band
          is pulled INWARD toward centre as the orb passes, as if the orb's mass is compressing it,
          with a soft amber rim-light along the pinched arc. Every ring still renders crisply at
          production sizes (26px / 36px / 56px beneath each card).
        </p>
      </header>

      {/* Disc treatment selector */}
      <section style={{ marginBottom: 32, padding: 18, background: card, borderRadius: 10, border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: brass }}>Avatar disc · what fills the centre</div>
          <div style={{ fontSize: 12, color: dim }}>Click to preview each treatment across all 11 rings →</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {DISC_OPTIONS.map(opt => {
            const selected = disc === opt.id;
            return (
              <button key={opt.id} onClick={() => setDisc(opt.id)}
                      style={{
                        background: selected ? 'rgba(245,158,11,0.10)' : '#1a2744',
                        border: `1px solid ${selected ? amber : border}`,
                        borderRadius: 8, padding: '12px 10px',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        cursor: 'pointer', textAlign: 'center', color: text,
                      }}>
                <svg width={64} height={64} viewBox={`0 0 64 64`}>
                  <AvatarDisc kind={opt.id} size={64} uid={`opt-${opt.id}`}/>
                </svg>
                <div>
                  <div style={{ fontFamily: fSerif, fontWeight: 600, fontSize: 13 }}>{opt.name}</div>
                  <div style={{ fontSize: 10, color: dim, marginTop: 2 }}>{opt.tag}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Ring grid */}
      <section>
        <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: brass, marginBottom: 12 }}>Ring variants · 11 options</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {RINGS.map(({ id, name, tag, Comp }) => (
            <div key={id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, width: '100%' }}>
                <Comp size={150} disc={disc}/>
              </div>
              <div style={{ marginTop: 10, textAlign: 'center' }}>
                <div style={{ fontFamily: fSerif, fontWeight: 700, fontSize: 14, color: text }}>{name}</div>
                <div style={{ fontSize: 11, color: dim, marginTop: 3, lineHeight: 1.4 }}>{tag}</div>
              </div>
              {/* Size comparison strip — how it looks in production */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${border}`, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                <Comp size={26} disc={disc}/>
                <Comp size={36} disc={disc}/>
                <Comp size={56} disc={disc}/>
              </div>
              <div style={{ fontSize: 9, color: dim, marginTop: 4, letterSpacing: 1, textTransform: 'uppercase', fontFamily: fCond }}>match · leaderboard · profile</div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: 32, padding: 18, background: card, border: `1px solid ${border}`, borderRadius: 10 }}>
        <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: brass, marginBottom: 8 }}>How to choose</div>
        <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>
          Tell me a number (1–11) for the ring. The disc isn't a buyer choice — it's chosen per-page automatically
          (rank on scoreboards, hero on match cards, Steam avatar on profiles, monogram as fallback). Pick the
          ring and I'll graduate it into the live <code style={{ background: '#1a2744', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>FoundersRing</code> component,
          roll it through the Boutique mockup, then onto the real shop.
        </div>
      </footer>
    </div>
  );
}
