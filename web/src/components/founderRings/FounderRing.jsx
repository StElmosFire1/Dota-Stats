// Task #314 / v7.34 — Founders Ring shop catalog.
//
// All 11 ring designs graduated from artifacts/mockup-sandbox/.../FoundersRingPicker.tsx.
// One file, no per-ring split: each ring is a small self-contained SVG component,
// keyed by its slug in RING_COMPONENTS at the bottom. The `<FounderRing>` default
// export switches over the slug so callers don't need to know individual names.
//
// Slug → product mapping:
//   inscribed → bundled with the Founders Pack ('founders_pass_ring' entitlement)
//   classic, laurel → static tier ($4.99 / 1200🪙)
//   beveled, phoenix, twin, astrolabe, eclipse, forge, storm, starmap → animated
//                                                          tier ($7.99 / 2000🪙)
//
// Animations are driven by `@keyframes fp-*` rules in web/src/styles.css.
import React from 'react';

const brass = '#c5a975';
const brassDark = '#8a7448';
const brassBright = '#e3c98a';
const amber = '#f59e0b';
const fSerif = 'Playfair Display, Georgia, serif';
const fCond = 'Oswald, sans-serif';

function useUid() {
  return React.useId().replace(/:/g, '');
}

// ─── Avatar disc treatments ───────────────────────────────────────────────────
// Fills the centre of the ring. `monogram` defaults to the first letter of
// `monogramText` (or "B" if absent). Production callers pass the player's
// initial. Rings used as cover-decorations on the MagazineCover use `emblem`
// (the OA brand mark) since the player's hero portrait already dominates the
// cover backdrop.
function AvatarDisc({ kind = 'monogram', size, uid, monogramText = 'B' }) {
  const r = size * 0.34;
  const cx = size / 2;
  const cy = size / 2;
  if (kind === 'monogram') {
    return (
      <>
        <defs>
          <radialGradient id={`disc-mono-${uid}`} cx="0.35" cy="0.30">
            <stop offset="0%" stopColor="#3a4560" />
            <stop offset="60%" stopColor="#1a2236" />
            <stop offset="100%" stopColor="#0d1424" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-mono-${uid})`} />
        <text
          x={cx}
          y={cy + r * 0.18}
          textAnchor="middle"
          fontFamily={fSerif}
          fontStyle="italic"
          fontSize={r * 0.95}
          fill={brass}
          opacity="0.95"
        >
          {(monogramText || 'B').slice(0, 1).toUpperCase()}
        </text>
      </>
    );
  }
  if (kind === 'steam') {
    return (
      <>
        <defs>
          <radialGradient id={`disc-steam-${uid}`} cx="0.40" cy="0.30">
            <stop offset="0%" stopColor="#9aa4c7" />
            <stop offset="55%" stopColor="#3b4868" />
            <stop offset="100%" stopColor="#0d1424" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-steam-${uid})`} />
        <circle cx={cx} cy={cy - r * 0.18} r={r * 0.30} fill="#1a2236" opacity="0.65" />
        <path
          d={`M ${cx - r * 0.55} ${cy + r * 0.55} Q ${cx} ${cy + r * 0.05} ${cx + r * 0.55} ${cy + r * 0.55} L ${cx + r * 0.55} ${cy + r} L ${cx - r * 0.55} ${cy + r} Z`}
          fill="#1a2236"
          opacity="0.65"
        />
      </>
    );
  }
  if (kind === 'hero') {
    return (
      <>
        <defs>
          <radialGradient id={`disc-hero-${uid}`} cx="0.50" cy="0.30">
            <stop offset="0%" stopColor="#3a2a1a" />
            <stop offset="60%" stopColor="#1a1208" />
            <stop offset="100%" stopColor="#0d0a04" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-hero-${uid})`} />
        <circle cx={cx - r * 0.4} cy={cy - r * 0.1} r={r * 0.12} fill="#f59e0b" opacity="0.85" />
        <circle cx={cx} cy={cy - r * 0.35} r={r * 0.14} fill="#fcd34d" opacity="0.95" />
        <circle cx={cx + r * 0.4} cy={cy - r * 0.1} r={r * 0.12} fill="#f59e0b" opacity="0.85" />
        <path
          d={`M ${cx - r * 0.55} ${cy + r * 0.6} Q ${cx} ${cy + r * 0.2} ${cx + r * 0.55} ${cy + r * 0.6} L ${cx + r * 0.55} ${cy + r} L ${cx - r * 0.55} ${cy + r} Z`}
          fill="#2a1f10"
          opacity="0.9"
        />
      </>
    );
  }
  if (kind === 'tier') {
    return (
      <>
        <defs>
          <radialGradient id={`disc-tier-${uid}`} cx="0.5" cy="0.5">
            <stop offset="0%" stopColor="#fbe6a8" />
            <stop offset="45%" stopColor="#c5a975" />
            <stop offset="100%" stopColor="#5a4422" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#disc-tier-${uid})`} />
        <text
          x={cx}
          y={cy + r * 0.20}
          textAnchor="middle"
          fontFamily={fSerif}
          fontWeight="700"
          fontSize={r * 0.85}
          fill="#1a1208"
          opacity="0.9"
        >I</text>
      </>
    );
  }
  // emblem (default OA monogram brand mark)
  return (
    <>
      <defs>
        <radialGradient id={`disc-em-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#1f2a48" />
          <stop offset="100%" stopColor="#0d1424" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#disc-em-${uid})`} />
      <text
        x={cx}
        y={cy + r * 0.10}
        textAnchor="middle"
        fontFamily={fSerif}
        fontWeight="700"
        fontSize={r * 0.55}
        fill={brass}
      >OA</text>
      <text
        x={cx}
        y={cy + r * 0.55}
        textAnchor="middle"
        fontFamily={fCond}
        fontSize={r * 0.18}
        fill={amber}
        letterSpacing="2"
      >INHOUSE</text>
    </>
  );
}

// ─── 11 ring variants ────────────────────────────────────────────────────────

function Ring_Classic({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const rBand = size * 0.42;
  const stroke = Math.max(3, size * 0.078);
  const rOuterEdge = rBand + stroke / 2;
  const rInnerEdge = rBand - stroke / 2;
  const notches = Math.max(48, Math.round(size * 0.5));
  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const numeralSize = stroke * 0.62;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`cl-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright} />
          <stop offset="35%" stopColor={brass} />
          <stop offset="65%" stopColor={brassDark} />
          <stop offset="100%" stopColor="#5a3a14" />
        </linearGradient>
        <linearGradient id={`cl-hl-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#fffbe6" stopOpacity="0" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`cl-gem-${uid}`} cx="0.35" cy="0.35">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="40%" stopColor={amber} />
          <stop offset="100%" stopColor="#8a3a08" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={rBand} fill="none" stroke={`url(#cl-band-${uid})`} strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={rBand} fill="none" stroke={`url(#cl-hl-${uid})`} strokeWidth={stroke} />
      {ROMAN.map((numeral, i) => {
        const deg = (i / 12) * 360;
        return (
          <g key={i} transform={`rotate(${deg} ${cx} ${cy})`}>
            <text x={cx} y={cy - rBand + numeralSize * 0.35 + 0.6} textAnchor="middle" dominantBaseline="middle"
                  fontFamily={fSerif} fontWeight="700" fontSize={numeralSize} fill="#3a1a04" opacity="0.85">{numeral}</text>
            <text x={cx} y={cy - rBand + numeralSize * 0.35} textAnchor="middle" dominantBaseline="middle"
                  fontFamily={fSerif} fontWeight="700" fontSize={numeralSize} fill={brassDark}>{numeral}</text>
          </g>
        );
      })}
      {Array.from({ length: notches }).map((_, i) => {
        const a = (i / notches) * Math.PI * 2;
        const x1 = cx + Math.cos(a) * rOuterEdge;
        const y1 = cy + Math.sin(a) * rOuterEdge;
        const x2 = cx + Math.cos(a) * (rOuterEdge - stroke * 0.22);
        const y2 = cy + Math.sin(a) * (rOuterEdge - stroke * 0.22);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                     stroke={brassDark} strokeWidth={Math.max(0.4, size * 0.004)} opacity="0.7" />;
      })}
      <circle cx={cx} cy={cy} r={rOuterEdge} fill="none" stroke={brassDark} strokeWidth={0.6} />
      <circle cx={cx} cy={cy} r={rInnerEdge} fill="none" stroke={brassDark} strokeWidth={0.6} />
      {[0, 90, 180, 270].map(deg => {
        const a = (deg - 90) * Math.PI / 180;
        const gx = cx + Math.cos(a) * rBand;
        const gy = cy + Math.sin(a) * rBand;
        const gemR = stroke * 0.32;
        return (
          <g key={deg}>
            <circle cx={gx} cy={gy} r={gemR + 0.6} fill={brassDark} />
            <circle cx={gx} cy={gy} r={gemR} fill={`url(#cl-gem-${uid})`} stroke={brassDark} strokeWidth={0.4} />
            <circle cx={gx - gemR * 0.35} cy={gy - gemR * 0.35} r={gemR * 0.28} fill="#fffbe6" opacity="0.75" />
          </g>
        );
      })}
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
    </svg>
  );
}

function Ring_Laurel({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const rRib = size * 0.34;
  const arcStart = Math.PI / 2 - 0.30;
  const arcEnd = -Math.PI / 2 + 0.35;
  const angFor = (t, side) => {
    const right = arcStart + t * (arcEnd - arcStart);
    return side > 0 ? right : Math.PI - right;
  };
  const N = 14;
  const Leaf = ({ x, y, rot, scale }) => {
    const L = size * 0.115 * scale;
    const W = size * 0.024 * scale;
    const path = `M 0 0 C ${-W * 0.95} ${-L * 0.30}, ${-W * 0.85} ${-L * 0.65}, 0 ${-L} C ${W * 0.85} ${-L * 0.65}, ${W * 0.95} ${-L * 0.30}, 0 0 Z`;
    const veinPath = `M 0 ${-L * 0.95} L 0 ${-L * 0.05}`;
    const sideVeins = [];
    for (let k = 1; k <= 3; k++) {
      const sy = -L * (0.25 + k * 0.18);
      const swx = W * 0.55 * (1 - Math.abs(0.5 - k * 0.18) * 0.6);
      sideVeins.push(`M 0 ${sy} Q ${swx * 0.4} ${sy - L * 0.04} ${swx} ${sy - L * 0.08}`);
      sideVeins.push(`M 0 ${sy} Q ${-swx * 0.4} ${sy - L * 0.04} ${-swx} ${sy - L * 0.08}`);
    }
    return (
      <g transform={`translate(${x} ${y}) rotate(${rot})`}>
        <path d={path} fill="#000" opacity="0.32" transform="translate(0.6 0.8)" />
        <path d={path} fill={`url(#lf-body-${uid})`} stroke={brassDark} strokeWidth={0.35} />
        <path d={path} fill={`url(#lf-hl-${uid})`} opacity="0.55" />
        <path d={veinPath} fill="none" stroke={brassDark} strokeWidth={0.5} opacity="0.85" />
        {sideVeins.map((d, k) => (
          <path key={k} d={d} fill="none" stroke={brassDark} strokeWidth={0.3} opacity="0.55" />
        ))}
      </g>
    );
  };
  const ribPath = (side) => {
    const segs = [];
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
        <linearGradient id={`lf-body-${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={brassDark} />
          <stop offset="40%" stopColor={brass} />
          <stop offset="80%" stopColor={brassBright} />
          <stop offset="100%" stopColor="#fff5d4" />
        </linearGradient>
        <linearGradient id={`lf-hl-${uid}`} x1="0" y1="0.5" x2="1" y2="0.5">
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0" />
          <stop offset="35%" stopColor="#fffbe6" stopOpacity="0.85" />
          <stop offset="50%" stopColor="#fffbe6" stopOpacity="0" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`lf-stem-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright} />
          <stop offset="60%" stopColor={brass} />
          <stop offset="100%" stopColor={brassDark} />
        </linearGradient>
      </defs>
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
      {[1, -1].map(side => (
        <path key={`rib-${side}`} d={ribPath(side)} fill="none"
              stroke={brassDark} strokeWidth={Math.max(0.9, size * 0.009)} strokeLinecap="round" opacity="0.9" />
      ))}
      {[1, -1].map(side => (
        <g key={side}>
          {Array.from({ length: N }).map((_, i) => {
            const t = i / (N - 1);
            const ang = angFor(t, side);
            const lx = cx + Math.cos(ang) * rRib;
            const ly = cy + Math.sin(ang) * rRib;
            const angDeg = ang * 180 / Math.PI;
            const baseRot = side > 0 ? angDeg : angDeg + 180;
            const lean = side > 0 ? 15 : -15;
            const rot = baseRot + lean;
            const sc = (0.92 + 0.18 * Math.sin(t * Math.PI)) * (1.0 - Math.max(0, t - 0.85) * 0.45);
            return <Leaf key={i} x={lx} y={ly} rot={rot} scale={sc} />;
          })}
        </g>
      ))}
      <g transform={`translate(${cx} ${cy + rRib + size * 0.010})`}>
        <ellipse rx={size * 0.032} ry={size * 0.016} fill={`url(#lf-stem-${uid})`} stroke={brassDark} strokeWidth={0.5} />
        <line x1={-size * 0.020} y1={-size * 0.003} x2={size * 0.020} y2={-size * 0.003} stroke={brassDark} strokeWidth={0.35} opacity="0.6" />
        <line x1={-size * 0.020} y1={size * 0.003} x2={size * 0.020} y2={size * 0.003} stroke="#fff5d4" strokeWidth={0.3} opacity="0.55" />
      </g>
    </svg>
  );
}

function Ring_Beveled({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.45;
  const stroke = Math.max(5, size * 0.075);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`bev-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright} />
          <stop offset="50%" stopColor={brass} />
          <stop offset="100%" stopColor={brassDark} />
        </linearGradient>
        <radialGradient id={`bev-glint-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="35%" stopColor="#fffbe6" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#bev-${uid})`} strokeWidth={stroke} />
      <circle cx={cx} cy={cy} r={r + stroke * 0.4} fill="none" stroke={brassBright} strokeWidth={1.5}
              strokeDasharray={`${Math.PI * r * 0.6} ${Math.PI * r * 4}`} transform={`rotate(-110 ${cx} ${cy})`} opacity="0.85" />
      <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill="none" stroke={brassDark} strokeWidth={1.5}
              strokeDasharray={`${Math.PI * r * 0.5} ${Math.PI * r * 4}`} transform={`rotate(70 ${cx} ${cy})`} opacity="0.7" />
      <g>
        <ellipse cx={cx} cy={cy - r} rx={stroke * 1.6} ry={stroke * 0.55} fill={`url(#bev-glint-${uid})`} opacity="0">
          <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.42;0.46;1" dur="5s" repeatCount="indefinite" />
        </ellipse>
        <animateTransform attributeName="transform" type="rotate"
                          values={`-75 ${cx} ${cy};75 ${cx} ${cy};75 ${cx} ${cy}`}
                          keyTimes="0;0.46;1" dur="5s" repeatCount="indefinite" />
      </g>
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
    </svg>
  );
}

function Ring_Inscribed({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const stroke = Math.max(3, size * 0.130);
  const rMid = size * 0.38;
  const rimT = Math.max(1, stroke * 0.22);
  const chanT = stroke * 0.50;
  const rOuterRim = rMid + chanT / 2 + rimT / 2;
  const rInnerRim = rMid - chanT / 2 - rimT / 2;
  const rOuterEdge = rOuterRim + rimT / 2;
  const rInnerEdge = rInnerRim - rimT / 2;
  const fontSize = chanT * 0.78;
  const text = '·  FOUNDER  ·  MMXXVI  ·  OCE  ·  INHOUSE  ·  FOUNDER  ·  MMXXVI  ·  OCE  ·  INHOUSE  ';
  const circumference = 2 * Math.PI * rMid;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`insc-rim-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff5d4" />
          <stop offset="35%" stopColor={brassBright} />
          <stop offset="70%" stopColor={brass} />
          <stop offset="100%" stopColor={brassDark} />
        </linearGradient>
        <linearGradient id={`insc-chan-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050402" />
          <stop offset="50%" stopColor="#140d05" />
          <stop offset="100%" stopColor="#2a1d0a" />
        </linearGradient>
        <path id={`insc-path-${uid}`}
              d={`M ${cx},${cy} m -${rMid},0 a ${rMid},${rMid} 0 1,1 ${rMid * 2},0 a ${rMid},${rMid} 0 1,1 -${rMid * 2},0`} />
        <radialGradient id={`insc-hot-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`insc-mask-${uid}`}>
          <rect x="0" y="0" width={size} height={size} fill="black" />
          <g>
            <animateTransform attributeName="transform" type="rotate"
                              from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="9s" repeatCount="indefinite" />
            <circle cx={cx} cy={cy - rMid} r={size * 0.18} fill={`url(#insc-hot-${uid})`} />
          </g>
        </mask>
      </defs>
      <circle cx={cx} cy={cy} r={rOuterRim} fill="none" stroke={`url(#insc-rim-${uid})`} strokeWidth={rimT} />
      <circle cx={cx} cy={cy} r={rOuterEdge} fill="none" stroke={brassDark} strokeWidth={0.5} />
      <circle cx={cx} cy={cy} r={rOuterRim - rimT / 2} fill="none" stroke={brassDark} strokeWidth={0.3} opacity="0.6" />
      <circle cx={cx} cy={cy} r={rMid} fill="none" stroke={`url(#insc-chan-${uid})`} strokeWidth={chanT} />
      <circle cx={cx} cy={cy} r={rInnerRim} fill="none" stroke={`url(#insc-rim-${uid})`} strokeWidth={rimT} />
      <circle cx={cx} cy={cy} r={rInnerRim + rimT / 2} fill="none" stroke={brassDark} strokeWidth={0.3} opacity="0.6" />
      <circle cx={cx} cy={cy} r={rInnerEdge} fill="none" stroke={brassDark} strokeWidth={0.5} />
      <text fontFamily={fSerif} fontSize={fontSize} fill="#c08a2e"
            letterSpacing={fontSize * 0.22} fontWeight="700" dominantBaseline="middle">
        <textPath href={`#insc-path-${uid}`} startOffset="0%" textLength={circumference}>{text}</textPath>
      </text>
      <g mask={`url(#insc-mask-${uid})`}>
        <text fontFamily={fSerif} fontSize={fontSize} fill="#fff5b6"
              stroke={amber} strokeWidth={0.6}
              letterSpacing={fontSize * 0.22} fontWeight="700" dominantBaseline="middle"
              style={{ filter: `drop-shadow(0 0 ${size * 0.012}px ${amber})` }}>
          <textPath href={`#insc-path-${uid}`} startOffset="0%" textLength={circumference}>{text}</textPath>
        </text>
      </g>
      <circle cx={cx} cy={cy} r={rInnerEdge - 1} fill="#0d1424" />
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
    </svg>
  );
}

function Ring_Phoenix({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.45;
  const stroke = Math.max(3, size * 0.05);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <radialGradient id={`phx-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="50%" stopColor={amber} stopOpacity="0.95" />
          <stop offset="100%" stopColor="#c83232" stopOpacity="0.7" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r + stroke * 1.2} fill="none" stroke="#c83232" strokeWidth={stroke * 1.4} opacity="0.18" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brass} strokeWidth={stroke} />
      {[0, 1, 2].map(i => (
        <g key={i} style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 15s linear infinite', animationDelay: `${-i * 5}s` }}>
          <circle cx={cx} cy={cy - r} r={size * 0.05} fill={`url(#phx-${uid})`} />
        </g>
      ))}
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
    </svg>
  );
}

function Ring_Twin({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r1 = size * 0.40, r2 = size * 0.32;
  const haloR1 = size * 0.055, haloR2 = size * 0.050;
  const trackStroke = Math.max(2, size * 0.022);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id={`th-amber-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="35%" stopColor={amber} />
          <stop offset="100%" stopColor={amber} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`th-tail-amber-${uid}`}>
          <stop offset="0%" stopColor={amber} stopOpacity="0.95" />
          <stop offset="100%" stopColor={amber} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`th-cream-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="40%" stopColor="#fffbe6" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`th-tail-cream-${uid}`}>
          <stop offset="0%" stopColor="#fffbe6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fffbe6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke={brass} strokeWidth={trackStroke} />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke={brass} strokeWidth={trackStroke} />
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 16s linear infinite' }}>
        <circle cx={cx} cy={cy} r={r1} fill="none"
                stroke={`url(#th-tail-amber-${uid})`} strokeWidth={trackStroke * 1.8}
                strokeDasharray={`${Math.PI * r1 * 0.28} ${Math.PI * r1 * 4}`}
                strokeDashoffset={Math.PI * r1 * 0.28} strokeLinecap="round" opacity="0.85" />
        <g style={{ transformOrigin: `${cx}px ${cy - r1}px`, animation: 'fp-breathe 1.8s ease-in-out infinite' }}>
          <circle cx={cx} cy={cy - r1} r={haloR1} fill={`url(#th-amber-${uid})`} opacity="0.85" />
        </g>
        <circle cx={cx} cy={cy - r1} r={size * 0.030} fill={amber} stroke="#fffbe6" strokeWidth={0.6} />
        <circle cx={cx - size * 0.010} cy={cy - r1 - size * 0.010} r={size * 0.010} fill="#fffbe6" />
      </g>
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep-rev 13s linear infinite' }}>
        <circle cx={cx} cy={cy} r={r2} fill="none"
                stroke={`url(#th-tail-cream-${uid})`} strokeWidth={trackStroke * 1.6}
                strokeDasharray={`${Math.PI * r2 * 0.28} ${Math.PI * r2 * 4}`}
                strokeDashoffset={Math.PI * r2 * 0.28} strokeLinecap="round" opacity="0.85" />
        <g style={{ transformOrigin: `${cx}px ${cy - r2}px`, animation: 'fp-breathe 2.2s ease-in-out infinite' }}>
          <circle cx={cx} cy={cy - r2} r={haloR2} fill={`url(#th-cream-${uid})`} opacity="0.85" />
        </g>
        <circle cx={cx} cy={cy - r2} r={size * 0.028} fill="#fffbe6" stroke={brassBright} strokeWidth={0.5} />
      </g>
    </svg>
  );
}

function Ring_Astrolabe({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const rOuter = size * 0.44;
  const rMid = size * 0.38;
  const rInner = size * 0.32;
  const stroke = Math.max(1.5, size * 0.018);
  const ringTicks = (radius, count, longEvery, longLen, shortLen) =>
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
                   opacity={isLong ? 0.95 : 0.7} />;
    });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`ast-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright} />
          <stop offset="55%" stopColor={brass} />
          <stop offset="100%" stopColor={brassDark} />
        </linearGradient>
        <radialGradient id={`ast-glow-${uid}`} cx="0.5" cy="0.5">
          <stop offset="30%" stopColor={amber} stopOpacity="0" />
          <stop offset="70%" stopColor={amber} stopOpacity="0.10" />
          <stop offset="100%" stopColor={amber} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={rOuter} fill={`url(#ast-glow-${uid})`} />
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 28s linear infinite' }}>
        <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={`url(#ast-band-${uid})`} strokeWidth={stroke * 1.4} />
        {ringTicks(rOuter, 32, 4, size * 0.045, size * 0.022)}
      </g>
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep-rev 18s linear infinite' }}>
        <circle cx={cx} cy={cy} r={rMid} fill="none" stroke={`url(#ast-band-${uid})`} strokeWidth={stroke * 1.1} />
        {ringTicks(rMid, 24, 6, size * 0.030, size * 0.015)}
        <circle cx={cx} cy={cy - rMid} r={size * 0.028} fill={amber} stroke={brassDark} strokeWidth={0.5} />
        <circle cx={cx} cy={cy + rMid} r={size * 0.020} fill={brassBright} stroke={brassDark} strokeWidth={0.5} />
      </g>
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 40s linear infinite' }}>
        <circle cx={cx} cy={cy} r={rInner} fill="none" stroke={brass} strokeWidth={stroke} />
        {ringTicks(rInner, 16, 4, size * 0.022, size * 0.010)}
      </g>
      <line x1={cx - rInner * 0.15} y1={cy} x2={cx + rInner * 0.15} y2={cy}
            stroke={brassDark} strokeWidth={stroke * 0.5} opacity="0.5" />
      <line x1={cx} y1={cy - rInner * 0.15} x2={cx} y2={cy + rInner * 0.15}
            stroke={brassDark} strokeWidth={stroke * 0.5} opacity="0.5" />
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
    </svg>
  );
}

function Ring_Eclipse({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.41;
  const stroke = Math.max(3, size * 0.05);
  const SEG = 120;
  const sigma = 0.35;
  const bulge = -stroke * 1.05;
  const warpedPath = (radius) => {
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
  const bandD = warpedPath(r);
  const outerD = warpedPath(r + stroke / 2);
  const innerD = warpedPath(r - stroke / 2);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id={`ecl-corona-${uid}`} cx="0.5" cy="0.5">
          <stop offset="65%" stopColor="#0d0a04" stopOpacity="0" />
          <stop offset="80%" stopColor={amber} stopOpacity="0.45" />
          <stop offset="92%" stopColor="#fffbe6" stopOpacity="0.7" />
          <stop offset="100%" stopColor={amber} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`ecl-body-${uid}`} cx="0.45" cy="0.35">
          <stop offset="0%" stopColor="#3a2a1a" />
          <stop offset="55%" stopColor="#0d0a04" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <radialGradient id={`ecl-breath-${uid}`} cx="0.5" cy="0.5">
          <stop offset="40%" stopColor={amber} stopOpacity="0" />
          <stop offset="80%" stopColor={amber} stopOpacity="0.20" />
          <stop offset="100%" stopColor={amber} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r - stroke * 0.5} fill={`url(#ecl-breath-${uid})`}
              style={{ animation: 'fp-breathe 3.5s ease-in-out infinite', transformOrigin: `${cx}px ${cy}px` }} />
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 22s linear infinite' }}>
        <path d={bandD} fill="none" stroke={brass} strokeWidth={stroke} />
        <path d={outerD} fill="none" stroke={brassDark} strokeWidth={0.6} />
        <path d={innerD} fill="none" stroke={brassDark} strokeWidth={0.6} />
        <path d={bandD} fill="none" stroke={amber} strokeWidth={stroke * 0.35} opacity="0.5"
              strokeDasharray={`${Math.PI * r * 0.18} ${Math.PI * r * 4}`}
              strokeDashoffset={`${-Math.PI * r * 0.09}`} />
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none"
              stroke={`url(#ecl-corona-${uid})`} strokeWidth={stroke * 1.5}
              style={{ animation: 'fp-breathe 4.2s ease-in-out infinite', transformOrigin: `${cx}px ${cy}px` }} />
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 22s linear infinite' }}>
        <g transform={`translate(${cx} ${cy - r})`}>
          <g style={{ animation: 'fp-pulse-bright 2.6s ease-in-out infinite', transformOrigin: '0 0' }}>
            <circle r={stroke * 2.0} fill={`url(#ecl-corona-${uid})`} opacity="0.6" />
            <circle r={stroke * 1.6} fill={`url(#ecl-corona-${uid})`} opacity="0.9" />
          </g>
          <circle r={stroke * 0.95} fill={`url(#ecl-body-${uid})`} stroke={brassDark} strokeWidth={0.5} />
          <circle r={stroke * 0.95} fill="none"
                  stroke="#fffbe6" strokeWidth={0.6}
                  strokeDasharray={`${stroke * 0.7} ${stroke * 4}`}
                  transform="rotate(-120)" opacity="0.7" />
        </g>
      </g>
    </svg>
  );
}

function Ring_Forge({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.36;
  const stroke = Math.max(3, size * 0.045);
  const emberCount = 5;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`fg-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={brassBright} />
          <stop offset="40%" stopColor={amber} />
          <stop offset="100%" stopColor="#8a3a08" />
        </linearGradient>
        <radialGradient id={`fg-glow-${uid}`} cx="0.5" cy="0.5">
          <stop offset="50%" stopColor="#ff8c1a" stopOpacity="0" />
          <stop offset="100%" stopColor="#ff8c1a" stopOpacity="0.20" />
        </radialGradient>
        <radialGradient id={`fg-ember-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="40%" stopColor={amber} />
          <stop offset="100%" stopColor="#c83232" stopOpacity="0" />
        </radialGradient>
        <filter id={`fg-melt-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.08" numOctaves="2" seed="3" result="noise">
            <animate attributeName="baseFrequency" values="0.04 0.08;0.06 0.10;0.04 0.08" dur="9s" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise"
                             scale={size * 0.006} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill={`url(#fg-glow-${uid})`} />
      <g filter={`url(#fg-melt-${uid})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#fg-band-${uid})`} strokeWidth={stroke} />
      </g>
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
      {Array.from({ length: emberCount }).map((_, i) => {
        const ang = Math.PI / 2 + ((i / emberCount) - 0.5) * Math.PI * 0.7;
        const ex = cx + Math.cos(ang) * r;
        const ey = cy + Math.sin(ang) * r;
        const dur = 3.2;
        const begin = `${-i * 0.65}s`;
        return (
          <circle key={i} cx={ex} cy={ey} r={size * 0.014} fill={`url(#fg-ember-${uid})`} opacity="0">
            <animate attributeName="cy" from={ey} to={ey - size * 0.14} dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.7;1" dur={`${dur}s`} begin={begin} repeatCount="indefinite" />
          </circle>
        );
      })}
    </svg>
  );
}

function Ring_Storm({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;
  const stroke = Math.max(3, size * 0.05);
  const hash = (n) => {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const buildBolt = (seed, len) => {
    const segs = 5 + Math.floor(hash(seed) * 5);
    const main = ['M 0 0'];
    let prevDx = 0;
    for (let i = 1; i <= segs; i++) {
      const step = (hash(seed * 7.1 + i * 3.7) - 0.5) * size * 0.045;
      const dx = prevDx * 0.4 + step;
      prevDx = dx;
      main.push(`L ${dx.toFixed(2)} ${((i / segs) * len).toFixed(2)}`);
    }
    const buildBranch = (branchSeed) => {
      const at = 1 + Math.floor(hash(branchSeed) * (segs - 2));
      const bx = (hash(branchSeed + 0.11) - 0.5) * size * 0.04;
      const by = (at / segs) * len;
      const dir = hash(branchSeed + 0.23) > 0.5 ? 1 : -1;
      const bLen = len * (0.30 + hash(branchSeed + 0.41) * 0.25);
      const bSegs = 2 + Math.floor(hash(branchSeed + 0.53) * 2);
      const pts = [`M ${bx.toFixed(2)} ${by.toFixed(2)}`];
      let prev = bx;
      for (let i = 1; i <= bSegs; i++) {
        const step = (hash(branchSeed + i * 4.7) - 0.5) * size * 0.032;
        const x = prev + dir * (size * 0.018) + step;
        prev = x;
        pts.push(`L ${x.toFixed(2)} ${(by + (i / bSegs) * bLen).toFixed(2)}`);
      }
      return pts.join(' ');
    };
    const branches = [buildBranch(seed + 1.7)];
    if (hash(seed + 2.9) > 0.45) branches.push(buildBranch(seed + 5.3));
    return { main: main.join(' '), branches };
  };
  const slots = [
    { angOff: 0.10, dur: 4.2, delay: 0.0, seed: 17.31, len: size * 0.105 },
    { angOff: 1.25, dur: 5.7, delay: 1.3, seed: 41.07, len: size * 0.130 },
    { angOff: 2.40, dur: 4.9, delay: 2.7, seed: 63.49, len: size * 0.090 },
    { angOff: 3.55, dur: 6.4, delay: 0.6, seed: 88.13, len: size * 0.115 },
    { angOff: 4.70, dur: 5.3, delay: 3.4, seed: 108.77, len: size * 0.140 },
    { angOff: 5.85, dur: 7.1, delay: 1.9, seed: 131.21, len: size * 0.100 },
  ];
  const arcs = slots.map((s, i) => {
    const a = s.angOff - Math.PI / 2;
    const sx = cx + Math.cos(a) * r;
    const sy = cy + Math.sin(a) * r;
    const rot = (a * 180 / Math.PI) - 90;
    return { i, sx, sy, rot, dur: s.dur, delay: s.delay, ...buildBolt(s.seed, s.len) };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`st-band-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a4a6a" />
          <stop offset="50%" stopColor="#1a2236" />
          <stop offset="100%" stopColor="#0d1424" />
        </linearGradient>
        <radialGradient id={`st-core-${uid}`} cx="0.5" cy="0.5">
          <stop offset="60%" stopColor="#3a6fb5" stopOpacity="0" />
          <stop offset="100%" stopColor="#3a6fb5" stopOpacity="0.18" />
        </radialGradient>
        <clipPath id={`st-clip-${uid}`}>
          <circle cx={cx} cy={cy} r={size / 2 - 0.5} />
        </clipPath>
      </defs>
      <g clipPath={`url(#st-clip-${uid})`}>
        <circle cx={cx} cy={cy} r={r - stroke * 0.4} fill={`url(#st-core-${uid})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#st-band-${uid})`} strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r + stroke / 2} fill="none" stroke="#3a4a6a" strokeWidth={0.5} />
        <circle cx={cx} cy={cy} r={r - stroke / 2} fill="none" stroke="#3a4a6a" strokeWidth={0.5} />
        {arcs.map(({ i, sx, sy, rot, dur, delay, main, branches }) => (
          <g key={i} transform={`translate(${sx} ${sy}) rotate(${rot})`}>
            <g style={{ animation: `fp-strike ${dur}s ease-out infinite`, animationDelay: `${-delay}s` }}>
              <path d={main} fill="none" stroke="#7ab8ff" strokeWidth={size * 0.026}
                    strokeLinecap="round" strokeLinejoin="round" opacity="0.55"
                    style={{ filter: `blur(${size * 0.010}px)` }} />
              {branches.map((b, j) => (
                <path key={j} d={b} fill="none" stroke="#7ab8ff" strokeWidth={size * 0.018}
                      strokeLinecap="round" strokeLinejoin="round" opacity="0.45"
                      style={{ filter: `blur(${size * 0.008}px)` }} />
              ))}
              <path d={main} fill="none" stroke="#fffbe6" strokeWidth={size * 0.011}
                    strokeLinecap="round" strokeLinejoin="round" />
              {branches.map((b, j) => (
                <path key={j} d={b} fill="none" stroke="#fffbe6" strokeWidth={size * 0.007}
                      strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
          </g>
        ))}
        <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
      </g>
    </svg>
  );
}

function Ring_Starmap({ size = 140, disc = 'emblem', monogramText }) {
  const uid = useUid();
  const cx = size / 2, cy = size / 2;
  const r = size * 0.44;
  const N = 12;
  const stars = Array.from({ length: N }).map((_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    return { i, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
  const edges = [];
  for (let i = 0; i < N; i++) {
    edges.push({ a: i, b: (i + 2) % N });
    if (i % 2 === 0) edges.push({ a: i, b: (i + 5) % N });
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id={`con-bg-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#0d1424" />
          <stop offset="100%" stopColor="#050810" />
        </radialGradient>
        <radialGradient id={`con-star-${uid}`} cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="40%" stopColor={brassBright} />
          <stop offset="100%" stopColor={amber} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r + size * 0.04} fill={`url(#con-bg-${uid})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={brassDark}
              strokeWidth={Math.max(1, size * 0.010)} opacity="0.5" />
      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 60s linear infinite' }}>
        {edges.map((e, i) => (
          <line key={i} x1={stars[e.a].x} y1={stars[e.a].y}
                x2={stars[e.b].x} y2={stars[e.b].y}
                stroke={amber} strokeWidth={Math.max(0.5, size * 0.005)} opacity="0.30" />
        ))}
        {stars.map(({ i, x, y }) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <g style={{ animation: 'fp-twinkle 3.5s ease-in-out infinite',
                        animationDelay: `${-i * 0.28}s`, transformOrigin: '0 0' }}>
              <circle r={size * 0.05} fill={`url(#con-star-${uid})`} />
              <circle r={size * 0.014} fill="#fffbe6" />
              <line x1={-size * 0.04} y1={0} x2={size * 0.04} y2={0}
                    stroke="#fffbe6" strokeWidth={0.7} opacity="0.7" />
              <line x1={0} y1={-size * 0.04} x2={0} y2={size * 0.04}
                    stroke="#fffbe6" strokeWidth={0.7} opacity="0.7" />
            </g>
          </g>
        ))}
      </g>
      <AvatarDisc kind={disc} size={size} uid={uid} monogramText={monogramText} />
    </svg>
  );
}

// ─── Slug → component map + catalog metadata ──────────────────────────────────

export const FOUNDER_RING_SLUGS = [
  'inscribed', 'classic', 'laurel', 'beveled',
  'phoenix', 'twin', 'astrolabe', 'eclipse',
  'forge', 'storm', 'starmap',
];

export const FOUNDER_RING_LABELS = {
  inscribed: 'Inscribed',
  classic: 'Classic Brass',
  laurel: 'Laurel Wreath',
  beveled: 'Beveled Edge',
  phoenix: 'Phoenix',
  twin: 'Twin Halo',
  astrolabe: 'Astrolabe',
  eclipse: 'Eclipse',
  forge: 'Forge',
  storm: 'Storm',
  starmap: 'Constellation',
};

export const FOUNDER_RING_TAGS = {
  inscribed: 'Raised rims · molten engraved text',
  classic: 'Roman numerals · amber cabochons · milled edge',
  laurel: 'Classical wreath · pointed almond leaves',
  beveled: 'Bright bevel · periodic sun-glint sweep',
  phoenix: 'Three orbiting embers · crimson halo',
  twin: 'Counter-rotating dual rings · comet tails',
  astrolabe: 'Three engraved rings · counter-rotating ticks',
  eclipse: 'Gaussian-pinched band under orbiting body',
  forge: 'Molten brass band · rising embers',
  storm: 'Six asynchronous lightning strikes',
  starmap: 'Twinkling star map · slowly drifting',
};

const RING_COMPONENTS = {
  inscribed: Ring_Inscribed,
  classic: Ring_Classic,
  laurel: Ring_Laurel,
  beveled: Ring_Beveled,
  phoenix: Ring_Phoenix,
  twin: Ring_Twin,
  astrolabe: Ring_Astrolabe,
  eclipse: Ring_Eclipse,
  forge: Ring_Forge,
  storm: Ring_Storm,
  starmap: Ring_Starmap,
};

// Default export: switch over slug. Falls back to Inscribed (the historical
// Founders Pass ring) if an unknown slug is passed — keeps the UI rendering
// rather than throwing.
export default function FounderRing({ sku, size = 56, disc = 'emblem', monogramText }) {
  const slug = (sku && RING_COMPONENTS[sku]) ? sku : 'inscribed';
  const Comp = RING_COMPONENTS[slug];
  return <Comp size={size} disc={disc} monogramText={monogramText} />;
}
