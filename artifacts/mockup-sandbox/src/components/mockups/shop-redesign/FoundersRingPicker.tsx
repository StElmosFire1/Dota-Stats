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
  const r = size * 0.43;
  // Almond / vesica leaf shape used by every leaf — drawn pointing up,
  // then rotated into place. Two-tone fill via gradient ID per leaf side.
  const leafPath = (len: number, w: number) =>
    `M 0 0 Q ${w} ${-len * 0.45} 0 ${-len} Q ${-w} ${-len * 0.45} 0 0 Z`;
  // 9 leaves per branch — outer cluster + smaller fillers in between.
  // Each entry: [angleFromTop, length, width, isFiller]
  const leafSpec: [number, number, number, boolean][] = [
    [0.95, 0.16, 0.055, false], // bottom-most (near clasp)
    [0.80, 0.15, 0.050, true],
    [0.65, 0.17, 0.058, false],
    [0.50, 0.14, 0.048, true],
    [0.36, 0.18, 0.060, false],
    [0.24, 0.13, 0.045, true],
    [0.14, 0.16, 0.052, false],
    [0.06, 0.11, 0.040, true],
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`leaf-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={brassDark}/>
          <stop offset="55%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassBright}/>
        </linearGradient>
        <linearGradient id={`leaf-flip-${uid}`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor={brassDark}/>
          <stop offset="55%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassBright}/>
        </linearGradient>
      </defs>
      {/* Faint reference circle (the wreath itself replaces the band) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brassDark} strokeWidth={Math.max(1, size * 0.012)} opacity="0.35"/>
      {/* Two laurel branches sweeping from the bottom clasp up to the top gem */}
      {[1, -1].map(side => (
        <g key={side}>
          {leafSpec.map(([t, lenMul, wMul, filler], i) => {
            // Walk t from near-bottom (t≈1) up toward the top (t≈0) along this side.
            const ang = (side > 0 ? Math.PI / 2 + Math.PI * t : Math.PI / 2 - Math.PI * t) - Math.PI / 2;
            const x = cx + Math.cos(ang) * r;
            const y = cy + Math.sin(ang) * r;
            const len = size * lenMul;
            const w = size * wMul;
            // Rotate so leaf points outward from the circle, then fan slightly
            // forward along the direction of travel for a natural branch look.
            const tangent = (ang * 180 / Math.PI) + 90 + side * 22;
            const grad = side > 0 ? `url(#leaf-${uid})` : `url(#leaf-flip-${uid})`;
            return (
              <g key={i} transform={`translate(${x} ${y}) rotate(${tangent})`}>
                <path d={leafPath(len, w)} fill={grad} stroke={brassDark} strokeWidth={0.4}/>
                {/* Centre vein for definition */}
                <line x1={0} y1={0} x2={0} y2={-len * 0.92} stroke={brassDark} strokeWidth={0.5} opacity="0.7"/>
                {/* Smaller filler leaf alongside on the offside, creates depth */}
                {!filler && (
                  <path d={leafPath(len * 0.65, w * 0.7)} fill={brass}
                        transform={`translate(${-side * w * 0.5} ${-len * 0.25}) rotate(${-side * 35})`}
                        opacity="0.85" stroke={brassDark} strokeWidth={0.3}/>
                )}
              </g>
            );
          })}
        </g>
      ))}
      {/* Clasp / ribbon at the bottom where the two branches join */}
      <g transform={`translate(${cx} ${cy + r})`}>
        <path d={`M ${-size * 0.08} 0 Q 0 ${size * 0.025} ${size * 0.08} 0 L ${size * 0.065} ${size * 0.035} Q 0 ${size * 0.05} ${-size * 0.065} ${size * 0.035} Z`}
              fill={`url(#leaf-${uid})`} stroke={brassDark} strokeWidth={0.5}/>
        <line x1={-size * 0.04} y1={size * 0.018} x2={size * 0.04} y2={size * 0.018} stroke={brassDark} strokeWidth={0.5} opacity="0.6"/>
      </g>
      {/* Amber gem at the top where branches meet */}
      <circle cx={cx} cy={cy - r} r={size * 0.058} fill={brassDark}/>
      <circle cx={cx} cy={cy - r} r={size * 0.048} fill={amber}/>
      <circle cx={cx - size * 0.012} cy={cy - r - size * 0.012} r={size * 0.018} fill="#fffbe6" opacity="0.9"/>
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
  // Wider band so the inscription has somewhere to live without overhanging.
  const stroke = Math.max(6, size * 0.10);
  const rMid = size * 0.43;                  // band centreline radius
  const rOuter = rMid + stroke / 2;
  const rInner = rMid - stroke / 2;
  // The engraved text rides the band centreline; the SVG path baseline sits
  // along that radius, so glyph ascenders + descenders both stay between
  // rInner and rOuter when fontSize ≤ stroke * 0.7.
  const inscRadius = rMid + stroke * 0.05;   // tiny nudge for visual centring
  const fontSize = stroke * 0.62;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`insc-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright}/>
          <stop offset="55%" stopColor={brass}/>
          <stop offset="100%" stopColor={brassDark}/>
        </linearGradient>
        {/* Engraved channel: a darker inset that the letters sit inside */}
        <radialGradient id={`insc-chan-${uid}`} cx="0.5" cy="0.5">
          <stop offset={`${(rInner / rOuter) * 100}%`} stopColor={brassDark} stopOpacity="0"/>
          <stop offset={`${((rInner + stroke * 0.15) / rOuter) * 100}%`} stopColor="#2a1d08" stopOpacity="0.55"/>
          <stop offset={`${((rOuter - stroke * 0.15) / rOuter) * 100}%`} stopColor="#2a1d08" stopOpacity="0.55"/>
          <stop offset="100%" stopColor={brassDark} stopOpacity="0"/>
        </radialGradient>
        <path id={`insc-path-${uid}`}
              d={`M ${cx},${cy} m -${inscRadius},0 a ${inscRadius},${inscRadius} 0 1,1 ${inscRadius * 2},0 a ${inscRadius},${inscRadius} 0 1,1 -${inscRadius * 2},0`}/>
      </defs>
      {/* Solid brass band rendered as a thick stroke at the centreline */}
      <circle cx={cx} cy={cy} r={rMid} fill="none" stroke={`url(#insc-band-${uid})`} strokeWidth={stroke}/>
      {/* Outer + inner hairline edges */}
      <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      <circle cx={cx} cy={cy} r={rInner} fill="none" stroke={brassDark} strokeWidth={0.6}/>
      {/* Carved channel — darker recess where the text sits */}
      <circle cx={cx} cy={cy} r={rMid} fill="none" stroke={`url(#insc-chan-${uid})`} strokeWidth={stroke * 0.7}/>
      {/* Elvish-feel inscription — serif, generous letterspacing, all caps.
          Two layers: dark shadow underneath + brass-bright letters on top
          give an engraved-then-rubbed-with-gold look. textLength constrains
          the string to one full revolution so it never overflows. */}
      {(() => {
        const text = '· FOUNDER · OCE · INHOUSE · MMXXVI ';
        const circumference = 2 * Math.PI * inscRadius;
        return (
          <>
            <text fontFamily={fSerif} fontSize={fontSize} fill="#1a0f04"
                  letterSpacing={fontSize * 0.18} fontWeight="700" opacity="0.85">
              <textPath href={`#insc-path-${uid}`} startOffset="0%" textLength={circumference}>
                {text}
              </textPath>
            </text>
            <text fontFamily={fSerif} fontSize={fontSize} fill="#f3d98a"
                  letterSpacing={fontSize * 0.18} fontWeight="700"
                  transform={`translate(0 -0.4)`}>
              <textPath href={`#insc-path-${uid}`} startOffset="0%" textLength={circumference}>
                {text}
              </textPath>
            </text>
          </>
        );
      })()}
      {/* Disc sits on a dark inset, slightly recessed from the inner band edge */}
      <circle cx={cx} cy={cy} r={rInner - 1} fill={bg}/>
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

const RINGS: { id: string; name: string; tag: string; Comp: React.FC<RingProps> }[] = [
  { id: 'classic',       name: '1. Classic Brass',    tag: 'Double band · slow highlight orbit',       Comp: Ring1_Classic },
  { id: 'coronet',       name: '2. Coronet',          tag: 'Crown-style notched outer rim',            Comp: Ring2_Coronet },
  { id: 'laurel',        name: '3. Laurel Wreath',    tag: 'Reworked: denser two-tone leaves + clasp', Comp: Ring3_Laurel },
  { id: 'signet',        name: '4. Signet',           tag: 'Heavy brass band · "OCE" engraving',       Comp: Ring4_Signet },
  { id: 'comet',         name: '5. Aurum Comet',      tag: 'Comet tail sweeping the ring',             Comp: Ring5_Comet },
  { id: 'constellation', name: '6. Constellation',    tag: '7 brass star points around the band',      Comp: Ring6_Constellation },
  { id: 'beveled',       name: '7. Beveled Edge',     tag: 'Engraved depth · bright top, dark bottom', Comp: Ring7_Beveled },
  { id: 'inscribed',     name: '8. Inscribed',        tag: 'Reworked: Elvish serif inside the band',   Comp: Ring8_Inscribed },
  { id: 'phoenix',       name: '9. Phoenix',          tag: 'Three orbiting embers · crimson halo',     Comp: Ring9_Phoenix },
  { id: 'twin',          name: '10. Twin Halo',       tag: 'Counter-rotating dual rings',              Comp: Ring10_TwinHalo },
  { id: 'serpent',       name: '11. Twin Serpent',    tag: 'New: two snakes intertwined as the band',  Comp: Ring11_TwinSerpent },
  { id: 'filigree',      name: '12. Filigree Scroll', tag: 'New: Art Nouveau scrollwork · 8 motifs',   Comp: Ring12_Filigree },
  { id: 'sigil',         name: '13. Aurum Sigil',     tag: 'New: diamond medallion breaks the band',   Comp: Ring13_Sigil },
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
      `}</style>

      <header style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: fCond, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase', color: amber, marginBottom: 6 }}>Founders Pass · Picker</div>
        <h1 style={{ fontFamily: fSerif, fontSize: 36, fontWeight: 700, margin: '0 0 8px' }}>Pick your founders ring</h1>
        <p style={{ color: muted, maxWidth: 760, lineHeight: 1.55, margin: 0 }}>
          Thirteen variants below — the original ten plus three new high-quality options (Twin Serpent, Filigree
          Scroll, Aurum Sigil), with reworked Laurel (denser leaves + clasp) and reworked Inscribed (Elvish serif
          contained inside the band, no overhang). Each animates slowly (12–20s) and renders crisply at every size
          used in production (26px on match cards, 36px in leaderboard rows, 68px on profile headers, 200px+ in
          shop). The five disc treatments below are <em>per-page</em>, not a player choice — scoreboard rows show
          rank number, match cards show hero portrait, profile shows Steam avatar, fallback is the brass monogram.
        </p>
      </header>

      {/* Disc treatment selector */}
      <section style={{ marginBottom: 32, padding: 18, background: card, borderRadius: 10, border: `1px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
          <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: brass }}>Avatar disc · what fills the centre</div>
          <div style={{ fontSize: 12, color: dim }}>Click to preview each treatment across all 10 rings →</div>
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
        <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: brass, marginBottom: 12 }}>Ring variants · 13 options</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
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
          Tell me a number (1–13) for the ring. The disc isn't a buyer choice — it's chosen per-page automatically
          (rank on scoreboards, hero on match cards, Steam avatar on profiles, monogram as fallback). Pick the
          ring and I'll graduate it into the live <code style={{ background: '#1a2744', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>FoundersRing</code> component,
          roll it through the Boutique mockup, then onto the real shop.
        </div>
      </footer>
    </div>
  );
}
