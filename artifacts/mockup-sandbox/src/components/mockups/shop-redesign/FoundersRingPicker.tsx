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
  const railOuter = size * 0.47, railInner = size * 0.39;
  const railStroke = Math.max(3, size * 0.05);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={railOuter + railStroke * 0.8} fill="none" stroke={amber} strokeWidth={railStroke * 1.6} opacity="0.08"/>
      <circle cx={cx} cy={cy} r={railOuter} fill="none" stroke={brass} strokeWidth={railStroke}/>
      <circle cx={cx} cy={cy} r={railOuter} fill="none" stroke={brassBright} strokeWidth={railStroke * 0.45}
              strokeDasharray={`${Math.PI * railOuter * 0.55} ${Math.PI * railOuter * 4}`}
              strokeDashoffset={Math.PI * railOuter * 0.45}
              transform={`rotate(-110 ${cx} ${cy})`} opacity="0.85" strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r={railInner} fill="none" stroke={brass} strokeWidth={Math.max(1, size * 0.015)}/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 18s linear infinite' }}>
        <circle cx={cx} cy={cy - railOuter} r={size * 0.075} fill={amber} opacity="0.7"/>
        <circle cx={cx} cy={cy - railOuter} r={size * 0.035} fill="#fffbe6"/>
      </g>
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
  const r = size * 0.36;            // band centreline — leaves are rooted here
  // Classical laurel wreath: two branches arching up from a bottom clasp,
  // dense overlapping leaves on each side, a small gap at the very top where
  // the amber gem sits. Each branch puts an overlapping LEAF PAIR (one back,
  // one front) at each of 12 positions for the full classical density.
  const Leaf = ({ x, y, rot, scale, side }: { x: number; y: number; rot: number; scale: number; side: 1 | -1 }) => {
    const L = size * 0.105 * scale;        // leaf length
    const W = size * 0.028 * scale;        // half-width at the bulge
    // Slim pointed teardrop, asymmetric so the outward edge bulges more.
    const path = side > 0
      ? `M 0 0 C ${-W * 0.3} ${-L * 0.2}, ${-W * 0.85} ${-L * 0.55}, ${-W * 0.12} ${-L}
         C ${W * 0.55} ${-L * 0.6}, ${W * 1.0} ${-L * 0.22}, 0 0 Z`
      : `M 0 0 C ${W * 0.3} ${-L * 0.2}, ${W * 0.85} ${-L * 0.55}, ${W * 0.12} ${-L}
         C ${-W * 0.55} ${-L * 0.6}, ${-W * 1.0} ${-L * 0.22}, 0 0 Z`;
    const ribPath = side > 0
      ? `M 0 ${-L * 0.05} Q ${W * 0.08} ${-L * 0.5} ${-W * 0.12} ${-L * 0.95}`
      : `M 0 ${-L * 0.05} Q ${-W * 0.08} ${-L * 0.5} ${W * 0.12} ${-L * 0.95}`;
    return (
      <g transform={`translate(${x} ${y}) rotate(${rot})`}>
        <path d={path} fill="#000" opacity="0.35" transform="translate(0.5 0.5)"/>
        <path d={path} fill={side > 0 ? `url(#lf-r-${uid})` : `url(#lf-l-${uid})`}
              stroke={brassDark} strokeWidth={0.35}/>
        <path d={path} fill={`url(#lf-hl-${uid})`} opacity="0.55"/>
        <path d={ribPath} fill="none" stroke={brassDark} strokeWidth={0.45} opacity="0.85"/>
      </g>
    );
  };
  // Angle along each branch. Each branch sweeps a half-circle from near the
  // bottom (where the clasp sits) up around one side to near the top (where
  // the amber gem sits). A small bottom exclusion keeps leaves off the clasp;
  // a small top exclusion creates the classical gap.
  const arcStart = Math.PI / 2 - 0.10;     // just inside the bottom
  const arcEnd   = -Math.PI / 2 + 0.22;    // just inside the top → ~25° wreath gap
  const angFor = (t: number, side: 1 | -1) => {
    const right = arcStart + t * (arcEnd - arcStart);
    return side > 0 ? right : Math.PI - right;
  };
  const N = 12;        // positions per branch
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`lf-r-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brassDark}/>
          <stop offset="55%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassBright}/>
        </linearGradient>
        <linearGradient id={`lf-l-${uid}`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor={brassDark}/>
          <stop offset="55%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassBright}/>
        </linearGradient>
        <linearGradient id={`lf-hl-${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0"/>
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0.85"/>
        </linearGradient>
      </defs>
      {/* Each branch: two leaves per position (a smaller back leaf and a
          larger front leaf rotated forward), giving the dense overlapping
          look of a real laurel wreath. Leaves lean forward along the branch
          and curl inward toward the top so the tips meet near the gem. */}
      {([1, -1] as const).map(side => (
        <g key={side}>
          {Array.from({ length: N }).map((_, i) => {
            const t = i / (N - 1);
            const ang = angFor(t, side);
            const lx = cx + Math.cos(ang) * r;
            const ly = cy + Math.sin(ang) * r;
            const outward = (ang * 180 / Math.PI) + 90;
            // Forward lean (toward branch growth direction) at the base, then
            // reverses near the top so the topmost leaves curl inward toward
            // the centreline. side=+1 grows CW; side=-1 grows CCW.
            const fan = side * (22 - 38 * t);
            // Back leaf — larger, lower-rotation, behind the front
            const backRot = outward + fan + side * 8;
            // Front leaf — slightly forward of the back, smaller, more lean
            const frontRot = outward + fan - side * 10;
            return (
              <g key={i}>
                <Leaf x={lx} y={ly} rot={backRot} scale={1.05} side={side}/>
                <Leaf x={lx} y={ly} rot={frontRot} scale={0.78} side={side}/>
              </g>
            );
          })}
        </g>
      ))}
      {/* Brass ribbon clasp at the bottom — knot + two trailing tails */}
      <g transform={`translate(${cx} ${cy + r * 0.97})`}>
        <ellipse rx={size * 0.045} ry={size * 0.020}
                 fill={`url(#lf-r-${uid})`} stroke={brassDark} strokeWidth={0.5}/>
        <line x1={-size * 0.025} y1={0} x2={size * 0.025} y2={0}
              stroke={brassDark} strokeWidth={0.5} opacity="0.7"/>
        <path d={`M ${-size * 0.025} ${size * 0.014} Q ${-size * 0.05} ${size * 0.045} ${-size * 0.020} ${size * 0.075}`}
              fill="none" stroke={brass} strokeWidth={size * 0.012} strokeLinecap="round" opacity="0.8"/>
        <path d={`M ${size * 0.025} ${size * 0.014} Q ${size * 0.05} ${size * 0.045} ${size * 0.020} ${size * 0.075}`}
              fill="none" stroke={brass} strokeWidth={size * 0.012} strokeLinecap="round" opacity="0.8"/>
      </g>
      {/* Amber gem set into the wreath's top gap */}
      <circle cx={cx} cy={cy - r * 0.97} r={size * 0.05} fill={brassDark}/>
      <circle cx={cx} cy={cy - r * 0.97} r={size * 0.040} fill={amber}/>
      <circle cx={cx - size * 0.012} cy={cy - r * 0.97 - size * 0.012}
              r={size * 0.016} fill="#fffbe6" opacity="0.95"/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
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
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#bev-${uid})`} strokeWidth={stroke}/>
      {/* Bevel: bright top edge + dark bottom edge */}
      <circle cx={cx} cy={cy} r={r + stroke * 0.4} fill="none" stroke={brassBright} strokeWidth={1.5}
              strokeDasharray={`${Math.PI * r * 0.6} ${Math.PI * r * 4}`}
              transform={`rotate(-110 ${cx} ${cy})`} opacity="0.85"/>
      <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill="none" stroke={brassDark} strokeWidth={1.5}
              strokeDasharray={`${Math.PI * r * 0.5} ${Math.PI * r * 4}`}
              transform={`rotate(70 ${cx} ${cy})`} opacity="0.7"/>
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
  const text = '·  FOUNDER  ·  MMXXVI  ·  OCE  ·  INHOUSE  ';
  const circumference = 2 * Math.PI * rMid;
  // Gem size, capped so gems don't poke past the outer rim edge.
  const gemR = rimT * 0.55;
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
        {/* Dark engraved channel — warm-toned shadow so it reads as recessed
            metal, not flat black. */}
        <linearGradient id={`insc-chan-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#050200"/>
          <stop offset="50%" stopColor="#1a0d02"/>
          <stop offset="100%" stopColor="#2a1808"/>
        </linearGradient>
        {/* Amber gem gradient */}
        <radialGradient id={`insc-gem-${uid}`} cx="0.35" cy="0.30">
          <stop offset="0%"  stopColor="#fffbe6"/>
          <stop offset="40%" stopColor="#ffd068"/>
          <stop offset="100%" stopColor="#8a3a08"/>
        </radialGradient>
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
      {/* Four amber cabochon gemstones set into the outer rim at cardinal
          points — drop shadow, deep bezel, gem body with highlight. */}
      {[0, 1, 2, 3].map(i => {
        const a = i * Math.PI / 2 - Math.PI / 2;     // 12, 3, 6, 9 o'clock
        const gx = cx + Math.cos(a) * rOuterRim;
        const gy = cy + Math.sin(a) * rOuterRim;
        return (
          <g key={i}>
            <circle cx={gx} cy={gy} r={gemR + 0.5} fill="#000" opacity="0.45"/>
            <circle cx={gx} cy={gy} r={gemR} fill={brassDark}/>
            <circle cx={gx} cy={gy} r={gemR * 0.85} fill={`url(#insc-gem-${uid})`}/>
            <circle cx={gx - gemR * 0.30} cy={gy - gemR * 0.30}
                    r={gemR * 0.30} fill="#fffbe6" opacity="0.85"/>
          </g>
        );
      })}
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
  const r1 = size * 0.47, r2 = size * 0.40;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke={brass} strokeWidth={Math.max(2, size * 0.025)}/>
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke={brass} strokeWidth={Math.max(2, size * 0.025)}/>
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 20s linear infinite' }}>
        <circle cx={cx} cy={cy - r1} r={size * 0.04} fill={amber}/>
      </g>
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep-rev 16s linear infinite' }}>
        <circle cx={cx} cy={cy - r2} r={size * 0.035} fill="#fffbe6"/>
      </g>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
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
      {/* Breathing amber halo — INSIDE the band, not outside */}
      <circle cx={cx} cy={cy} r={r - stroke * 0.5} fill={`url(#ecl-breath-${uid})`}
              style={{ animation: 'fp-breathe 8s ease-in-out infinite', transformOrigin: `${cx}px ${cy}px` }}/>
      {/* Base brass band */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brass} strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={r + stroke / 2} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      <circle cx={cx} cy={cy} r={r - stroke / 2} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      {/* Corona ring — strokeWidth bounded so outer edge r+stroke*0.75 ≤ size*0.49 */}
      <circle cx={cx} cy={cy} r={r} fill="none"
              stroke={`url(#ecl-corona-${uid})`} strokeWidth={stroke * 1.5}/>
      <AvatarDisc kind={disc} size={size} uid={uid}/>
      {/* The eclipsing body — a dark sphere that slowly orbits the band centreline */}
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 22s linear infinite' }}>
        {/* Sphere positioned at top of ring */}
        <g transform={`translate(${cx} ${cy - r})`}>
          {/* Bright corona behind the sphere — gives the eclipse halo effect */}
          <circle r={stroke * 1.6} fill={`url(#ecl-corona-${uid})`} opacity="0.9"/>
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
  const r = size * 0.41;          // pulled in so displaced band stays inside viewBox
  const stroke = Math.max(3, size * 0.055);
  // Molten brass effect: SVG turbulence noise + displacement map distorts the
  // band into a rippling liquid surface. The turbulence's baseFrequency is
  // animated so the ripples shift continuously — like watching molten metal
  // settle. Embers rise from the bottom of the ring on staggered timings.
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
        {/* Turbulence/displacement filter — molten ripple effect on the band.
            Filter region is bounded to the band's bbox so distorted pixels
            cannot escape it. */}
        <filter id={`fg-melt-${uid}`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08"
                        numOctaves="2" seed="3" result="noise">
            <animate attributeName="baseFrequency"
                     values="0.04 0.08;0.06 0.10;0.04 0.08"
                     dur="9s" repeatCount="indefinite"/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise"
                             scale={size * 0.012} xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        {/* Hard outer clip — guarantees nothing (displaced band, ember halo,
            heat glow, drop-shadow) escapes the viewBox at any size. */}
        <clipPath id={`fg-clip-${uid}`}>
          <circle cx={cx} cy={cy} r={size / 2 - 0.5}/>
        </clipPath>
      </defs>
      {/* Everything below sits inside the hard circular clip */}
      <g clipPath={`url(#fg-clip-${uid})`}>
        {/* Inner heat glow contained inside the band */}
        <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill={`url(#fg-glow-${uid})`}/>
        {/* The molten band — solid brass stroke through the melt filter */}
        <g filter={`url(#fg-melt-${uid})`}>
          <circle cx={cx} cy={cy} r={r} fill="none"
                  stroke={`url(#fg-band-${uid})`} strokeWidth={stroke}/>
        </g>
        <AvatarDisc kind={disc} size={size} uid={uid}/>
        {/* Rising embers — SMIL animate on cy so motion scales with viewBox */}
        {Array.from({ length: emberCount }).map((_, i) => {
          const ang = Math.PI / 2 + ((i / emberCount) - 0.5) * Math.PI * 0.7;
          const ex = cx + Math.cos(ang) * r;
          const ey = cy + Math.sin(ang) * r;
          const dur = 3.2;
          const begin = `${-i * 0.65}s`;
          return (
            <circle key={i} cx={ex} cy={ey} r={size * 0.018}
                    fill={`url(#fg-ember-${uid})`} opacity="0">
              <animate attributeName="cy"
                       from={ey} to={ey - size * 0.22}
                       dur={`${dur}s`} begin={begin} repeatCount="indefinite"/>
              <animate attributeName="opacity"
                       values="0;1;1;0" keyTimes="0;0.15;0.7;1"
                       dur={`${dur}s`} begin={begin} repeatCount="indefinite"/>
            </circle>
          );
        })}
      </g>
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
  const r = size * 0.44;
  const stroke = Math.max(3, size * 0.06);
  // A brooding dark-steel band with lightning arcs that flash at staggered
  // intervals across different sectors. Each arc is a jagged polyline drawn
  // from a starting position outward along the band, lit electric-blue, and
  // visible only during a brief flash window of its keyframe cycle.
  // A proper lightning bolt: a jagged MAIN path going inward by `boltLen`,
  // plus a smaller BRANCH forking off partway down. Local coords: positive y
  // points inward (toward the ring centre) after the parent <g> rotation.
  const boltLen = size * 0.12;
  const segs = 6;
  const jag = size * 0.022;
  const buildBolt = (seed: number) => {
    const main: string[] = ['M 0 0'];
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const dx = Math.sin(seed + i * 2.3) * jag;
      main.push(`L ${dx.toFixed(2)} ${(t * boltLen).toFixed(2)}`);
    }
    // Branch forks from segment 2, two short jagged segments off to one side.
    const branchSeg = 2;
    const bx = Math.sin(seed + branchSeg * 2.3) * jag;
    const by = (branchSeg / segs) * boltLen;
    const branchDir = Math.cos(seed * 1.7) > 0 ? 1 : -1;
    const branch = [
      `M ${bx.toFixed(2)} ${by.toFixed(2)}`,
      `L ${(bx + branchDir * jag * 1.4).toFixed(2)} ${(by + boltLen * 0.18).toFixed(2)}`,
      `L ${(bx + branchDir * jag * 2.1).toFixed(2)} ${(by + boltLen * 0.36).toFixed(2)}`,
    ].join(' ');
    return { main: main.join(' '), branch };
  };
  // Five bolts at staggered angles. Each fires a multi-flash strike sequence
  // on a 5s cycle with 1s offsets — feels like a continuous storm with
  // multiple strikes per bolt rather than a single quick blip.
  const arcs = Array.from({ length: 5 }).map((_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 10;
    const sx = cx + Math.cos(a) * r;
    const sy = cy + Math.sin(a) * r;
    const rot = (a * 180 / Math.PI) - 90;     // local +y → inward
    return { i, sx, sy, rot, ...buildBolt(i * 1.7 + 0.3) };
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
      </defs>
      {/* Inner electric halo, contained */}
      <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill={`url(#st-core-${uid})`}/>
      {/* Dark stormcloud band */}
      <circle cx={cx} cy={cy} r={r} fill="none"
              stroke={`url(#st-band-${uid})`} strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={r + stroke / 2} fill="none" stroke="#3a4a6a" strokeWidth={0.5}/>
      <circle cx={cx} cy={cy} r={r - stroke / 2} fill="none" stroke="#3a4a6a" strokeWidth={0.5}/>
      {/* Five lightning bolts. Each bolt fires a multi-flash STRIKE sequence
          (initial strike → flicker → secondary strike → fade) on a 5s loop
          with 1s offsets. With 5 bolts at 1s apart and ~1.1s strikes, there's
          almost always lightning somewhere on the ring — a proper storm, not
          a single quick blip. Main bolt + secondary branch are rendered with
          both a diffuse blue halo and a bright white core. */}
      {arcs.map(({ i, sx, sy, rot, main, branch }) => (
        <g key={i} transform={`translate(${sx} ${sy}) rotate(${rot})`}>
          <g style={{ animation: 'fp-strike 5s ease-out infinite',
                      animationDelay: `${-i * 1}s` }}>
            {/* Diffuse electric-blue halo — main + branch */}
            <path d={main} fill="none" stroke="#7ab8ff" strokeWidth={size * 0.030}
                  strokeLinecap="round" strokeLinejoin="round" opacity="0.55"
                  style={{ filter: `blur(${size * 0.012}px)` }}/>
            <path d={branch} fill="none" stroke="#7ab8ff" strokeWidth={size * 0.020}
                  strokeLinecap="round" strokeLinejoin="round" opacity="0.45"
                  style={{ filter: `blur(${size * 0.010}px)` }}/>
            {/* Bright white cores — main + branch */}
            <path d={main} fill="none" stroke="#fffbe6" strokeWidth={size * 0.012}
                  strokeLinecap="round" strokeLinejoin="round"/>
            <path d={branch} fill="none" stroke="#fffbe6" strokeWidth={size * 0.008}
                  strokeLinecap="round" strokeLinejoin="round"/>
          </g>
        </g>
      ))}
      <AvatarDisc kind={disc} size={size} uid={uid}/>
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
  { id: 'classic',   name: '1. Classic Brass',  tag: 'Double band · slow highlight orbit',       Comp: Ring1_Classic },
  { id: 'laurel',    name: '2. Laurel Wreath',  tag: 'Classical wreath · 24 overlapping leaves', Comp: Ring3_Laurel },
  { id: 'beveled',   name: '3. Beveled Edge',   tag: 'Engraved depth · bright top, dark bottom', Comp: Ring7_Beveled },
  { id: 'inscribed', name: '4. Inscribed',      tag: 'Raised rims · 4 gems · molten hot-spot',   Comp: Ring8_Inscribed },
  { id: 'phoenix',   name: '5. Phoenix',        tag: 'Three orbiting embers · crimson halo',     Comp: Ring9_Phoenix },
  { id: 'twin',      name: '6. Twin Halo',      tag: 'Counter-rotating dual rings',              Comp: Ring10_TwinHalo },
  { id: 'astrolabe', name: '7. Astrolabe',      tag: 'Animated · 3 rings · engraved ticks',     Comp: Ring14_Astrolabe },
  { id: 'eclipse',   name: '8. Eclipse',        tag: 'Animated · orbiting eclipse + corona',    Comp: Ring15_Eclipse },
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
      `}</style>

      <header style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: fCond, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase', color: amber, marginBottom: 6 }}>Founders Pass · Picker</div>
        <h1 style={{ fontFamily: fSerif, fontSize: 36, fontWeight: 700, margin: '0 0 8px' }}>Pick your founders ring</h1>
        <p style={{ color: muted, maxWidth: 760, lineHeight: 1.55, margin: 0 }}>
          Shortlist of eleven, trimmed to the directions worth taking further. <strong>Laurel</strong> is now a
          dense classical wreath — twelve positions per branch, two overlapping leaves at each (back + front),
          twenty-four leaves a side, leaves leaning forward along the branch and curling inward at the top so
          their tips meet near the amber gem. <strong>Inscribed</strong> reads as proper high-value gold now:
          outer + inner raised brass rims with rolled-edge bevel highlights, a deep engraved channel between
          them, four amber cabochon gemstones set at the cardinal points, and the rotating hot-spot mask still
          making each section of the inscription glow molten as it passes. <strong>Forge</strong> is now fully
          clipped to a hard outer circle so the displaced band can't escape the boundary at any size.
          <strong> Storm</strong> rebuilt as proper lightning — five bolts, each with a secondary branching fork,
          firing a multi-flash strike sequence (initial → flicker → secondary → fade) on staggered 1s offsets.
          The fifteen leftover variants (Coronet, Signet, Comet, the old Constellation, Twin Serpent, Filigree,
          Sigil, Aurora, Runes) are dropped. Every ring still renders crisply at production sizes (26px / 36px /
          56px shown beneath each card).
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
