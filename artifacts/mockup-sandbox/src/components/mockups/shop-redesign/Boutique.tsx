// Shop redesign variant B — Boutique (dark, matches live site)
// Big Founders hero banner with brass ring artwork. Sticky sub-nav for
// anchor jumps. Taller product cards on --bg-card with bigger previews.
// Dual coin/$ pricing. Amber CTAs match the site's Pro pill style.
import * as React from 'react';

const bg = '#0d1424';
const card = '#152036';
const hover = '#1a2744';
const text = '#e6edf8';
const muted = '#94a6cb';
const dim = '#6c7e9c';
const brass = '#c5a975';
const amber = '#f59e0b';
const border = '#2a3b5c';

const fSerif = '"Playfair Display", Georgia, serif';
const fSans = 'Inter, system-ui, sans-serif';
const fCond = 'Oswald, sans-serif';

const cardShadow = '0 1px 2px rgba(0,0,0,0.3), 0 8px 24px -16px rgba(0,0,0,0.5)';

function CoinPill({ n }: { n: number }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: card, border: `1px solid ${brass}`, color: text,
      padding: '7px 14px', borderRadius: 999, fontFamily: fCond, fontSize: 12, letterSpacing: 1,
    }}>
      <span style={{ fontSize: 14 }}>🪙</span>
      <strong style={{ color: brass }}>{n.toLocaleString()}</strong>
      <span style={{ opacity: 0.7 }}>spendable</span>
    </div>
  );
}

function ProductCard({ preview, name, sub, coin, fiat }: {
  preview: React.ReactNode; name: string; sub: string; coin: string; fiat: string;
}) {
  return (
    <div style={{
      background: card, border: `1px solid ${border}`, borderRadius: 10,
      boxShadow: cardShadow, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ background: hover, borderRadius: 8, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120, border: `1px solid ${border}` }}>
        {preview}
      </div>
      <div>
        <div style={{ fontFamily: fSerif, fontSize: 18, fontWeight: 600, color: text }}>{name}</div>
        <div style={{ fontFamily: fSans, fontSize: 12, color: dim, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 'auto' }}>
        <span style={{ fontFamily: fCond, fontSize: 18, color: brass, fontWeight: 600 }}>{coin}</span>
        <span style={{ fontFamily: fSans, fontSize: 12, color: dim }}>or {fiat}</span>
      </div>
      <button style={{
        background: amber, color: '#1a1a1a', border: 'none', padding: '10px 14px', borderRadius: 6,
        fontFamily: fCond, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
      }}>Add to inventory</button>
    </div>
  );
}

function SubNav() {
  const items = ['Founders', 'Frames', 'Themes', 'Titles', 'Voice', 'Identity'];
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 5, background: bg,
      borderBottom: `1px solid ${border}`, padding: '14px 0', marginBottom: 32,
    }}>
      <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 28 }}>
          {items.map((label, i) => (
            <a key={label} href={`#${label.toLowerCase()}`} style={{
              fontFamily: fCond, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
              color: i === 0 ? text : muted, textDecoration: 'none', paddingBottom: 4,
              borderBottom: i === 0 ? `2px solid ${brass}` : '2px solid transparent',
            }}>{label}</a>
          ))}
        </div>
        <CoinPill n={2480}/>
      </div>
    </nav>
  );
}

function FramePreview({ ring }: { ring: string }) {
  return <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#2a3142', border: `3px solid ${ring}`, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}/>;
}

// Animated founders ring. SVG-based for crisp rendering at every size.
// Two engraved brass rails sit static; a single soft amber highlight orbits
// the outer rail slowly (18s). Inner avatar disc has a gentle amber glow
// breathing on 8s. Polished, restrained, jewelry-quality — not a spinner.
function FoundersRing({ size = 200 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  const cx = size / 2;
  const cy = size / 2;
  // Thicker, more present rail. Two close-set brass bands for a "double band" engraved feel.
  const railOuter = size * 0.47;
  const railInner = size * 0.39;
  const railStroke = Math.max(3, size * 0.05);
  const innerBandStroke = Math.max(1, size * 0.015);
  const avatarR = size * 0.34;
  const orbitR = railOuter;
  const highlightR = Math.max(4, size * 0.075);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id={`disc${uid}`} cx="0.35" cy="0.30">
            <stop offset="0%" stopColor="#3a4560"/>
            <stop offset="60%" stopColor="#1a2236"/>
            <stop offset="100%" stopColor="#0d1424"/>
          </radialGradient>
          <radialGradient id={`glow${uid}`}>
            <stop offset="0%" stopColor="#fffbe6" stopOpacity="1"/>
            <stop offset="35%" stopColor="#fcd34d" stopOpacity="0.85"/>
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/>
          </radialGradient>
        </defs>
        {/* Soft amber outer halo (static, very low opacity) */}
        <circle cx={cx} cy={cy} r={railOuter + railStroke * 0.8} fill="none" stroke="#f59e0b" strokeWidth={railStroke * 1.6} opacity="0.08"/>
        {/* Outer brass rail — bright, solid */}
        <circle cx={cx} cy={cy} r={railOuter} fill="none" stroke="#c5a975" strokeWidth={railStroke}/>
        {/* Inset highlight on the outer rail's upper arc (static glossy effect) */}
        <circle cx={cx} cy={cy} r={railOuter} fill="none" stroke="#fbe6a8" strokeWidth={railStroke * 0.45}
                strokeDasharray={`${Math.PI * railOuter * 0.55} ${Math.PI * railOuter * 4}`}
                strokeDashoffset={Math.PI * railOuter * 0.45}
                transform={`rotate(-110 ${cx} ${cy})`} opacity="0.85" strokeLinecap="round"/>
        {/* Outer rail bottom shadow arc */}
        <circle cx={cx} cy={cy} r={railOuter} fill="none" stroke="#6b5530" strokeWidth={railStroke * 0.35}
                strokeDasharray={`${Math.PI * railOuter * 0.40} ${Math.PI * railOuter * 4}`}
                strokeDashoffset={Math.PI * railOuter * 0.30}
                transform={`rotate(60 ${cx} ${cy})`} opacity="0.7" strokeLinecap="round"/>
        {/* Inner brass band */}
        <circle cx={cx} cy={cy} r={railInner} fill="none" stroke="#c5a975" strokeWidth={innerBandStroke}/>
        {/* Avatar disc */}
        <circle cx={cx} cy={cy} r={avatarR} fill={`url(#disc${uid})`} stroke="#0d1424" strokeWidth={Math.max(1, size * 0.008)}/>
        {/* Slow amber breathing glow just inside the avatar edge */}
        <circle cx={cx} cy={cy} r={avatarR - Math.max(2, size * 0.018)} fill="none" stroke="#f59e0b" strokeWidth={Math.max(1, size * 0.018)} opacity="0.45" style={{ animation: 'fp-breathe 8s ease-in-out infinite' }}/>
        {/* Slow travelling highlight — orbits the outer rail at 18s */}
        <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'fp-sweep 18s linear infinite' }}>
          <circle cx={cx} cy={cy - orbitR} r={highlightR * 1.8} fill={`url(#glow${uid})`} opacity="0.7"/>
          <circle cx={cx} cy={cy - orbitR} r={highlightR} fill={`url(#glow${uid})`}/>
          <circle cx={cx} cy={cy - orbitR} r={highlightR * 0.35} fill="#fffbe6"/>
        </g>
        {size >= 90 ? (
          <text x={cx} y={cy + size * 0.06} textAnchor="middle"
                fontFamily="Playfair Display, Georgia, serif" fontStyle="italic"
                fontSize={size * 0.16} fill="#c5a975" opacity="0.9">
            BAD1
          </text>
        ) : null}
      </svg>
    </div>
  );
}

function FounderBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      background: 'rgba(245,158,11,0.12)', border: `1px solid rgba(245,158,11,0.5)`,
      fontFamily: 'Oswald, sans-serif', fontSize: 10, letterSpacing: 2,
      textTransform: 'uppercase', color: '#f59e0b',
    }}>✦ Founder</span>
  );
}

export function Boutique() {
  return (
    <div style={{ background: bg, minHeight: '100vh', fontFamily: fSans, color: text }}>
      {/* Amber ticker — matches site header */}
      <div style={{ background: amber, color: '#1a1a1a', fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', padding: '6px 0', textAlign: 'center' }}>
        Season 1 Ladder Live · $1000 Prize Pool · Founders Pass — 588 remaining
      </div>

      <SubNav/>
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* HERO — Founders Pass with slow upscale ring animation */}
        <style>{`
          /* Slow 18s clockwise sweep — a single highlight travels around the
             ring like light catching a polished band. No spinning gradient. */
          @keyframes fp-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          /* Very subtle inner glow breathing, 8s, ease-in-out. */
          @keyframes fp-breathe { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
          /* Tiny independent ember orbit at 14s. */
          @keyframes fp-ember { from { transform: rotate(0deg) translateX(98px) rotate(0deg); }
                                to   { transform: rotate(360deg) translateX(98px) rotate(-360deg); } }
          /* Mini ring variants for the surface previews — slower for restraint. */
          @keyframes fp-sweep-mini { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
        <section id="founders" style={{
          background: `radial-gradient(circle at 80% 30%, #1f2a48 0%, #152036 50%, #0f1729 100%)`,
          borderRadius: 14, padding: '52px 56px',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'center',
          position: 'relative', overflow: 'hidden', marginBottom: 40,
          border: `1px solid ${border}`,
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${brass}, transparent)` }}/>
          <div>
            <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: amber, marginBottom: 12 }}>The Founders Pass · 588 remaining</div>
            <h1 style={{ fontFamily: fSerif, fontSize: 44, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.1, color: text }}>Be a founder of OCE Inhouse.</h1>
            <p style={{ fontFamily: fSans, fontSize: 15, color: muted, lineHeight: 1.55, marginBottom: 18, maxWidth: 460 }}>
              A polished animated ring on your avatar — visible on the
              leaderboard, every match card, the inhouse lobby, and your
              profile. Capped at 1,000, one-time, Stripe only.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', fontFamily: fSans, fontSize: 13, color: muted, display: 'grid', gap: 6 }}>
              <li>✦ Animated founders ring (founders exclusive)</li>
              <li>✦ "Founder" badge beside your name everywhere it appears</li>
              <li>✦ Permanent leaderboard hover-card highlight</li>
              <li>✦ 2,000 spendable coins included</li>
            </ul>
            <button style={{
              background: amber, color: '#1a1a1a', border: 'none', padding: '14px 28px', borderRadius: 8,
              fontFamily: fCond, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
            }}>Claim founder status — $39 USD</button>
          </div>

          {/* Large showcase ring */}
          <FoundersRing size={220}/>
        </section>

        {/* Where you'll be seen — actual rendered surfaces */}
        <section style={{ marginBottom: 56 }}>
          <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: brass, marginBottom: 8 }}>Where you'll be seen</div>
          <h2 style={{ fontFamily: fSerif, fontSize: 26, fontWeight: 700, margin: '0 0 18px', color: text }}>The ring follows you across the site.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16 }}>

            {/* Leaderboard row preview */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: 18 }}>
              <div style={{ fontFamily: fCond, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: dim, marginBottom: 10 }}>Leaderboard · Top 5</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {[
                  { rank: 1, name: 'BAD1', mmr: 7265, founder: true },
                  { rank: 2, name: 'Lemon Burtle', mmr: 6940, founder: false },
                  { rank: 3, name: 'Astro', mmr: 6802, founder: true },
                ].map(p => (
                  <div key={p.rank} style={{
                    display: 'grid', gridTemplateColumns: '32px 48px 1fr auto', gap: 12, alignItems: 'center',
                    padding: '8px 10px', background: p.founder ? 'rgba(245,158,11,0.06)' : 'transparent',
                    border: `1px solid ${p.founder ? 'rgba(245,158,11,0.25)' : border}`, borderRadius: 6,
                  }}>
                    <div style={{ fontFamily: fSerif, fontStyle: 'italic', color: dim, fontSize: 16 }}>{p.rank}</div>
                    {p.founder ? <FoundersRing size={36}/> : <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2a3142', border: `2px solid ${border}` }}/>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: fSans, fontSize: 14, color: text, fontWeight: 600 }}>{p.name}</span>
                      {p.founder ? <FounderBadge/> : null}
                    </div>
                    <span style={{ fontFamily: fCond, fontSize: 14, color: brass, letterSpacing: 1 }}>{p.mmr} MMR</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile header preview */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: 18 }}>
              <div style={{ fontFamily: fCond, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: dim, marginBottom: 10 }}>Profile header</div>
              <div style={{
                background: 'linear-gradient(135deg, #1a2744, #152036)',
                borderRadius: 8, padding: '20px 22px',
                border: `1px solid rgba(245,158,11,0.25)`,
                position: 'relative', overflow: 'hidden',
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${amber}, transparent)` }}/>
                <FoundersRing size={68}/>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: fSerif, fontSize: 20, color: text, fontWeight: 700 }}>BAD1</span>
                    <FounderBadge/>
                  </div>
                  <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: amber }}>Founder · #042 of 1,000</div>
                  <div style={{ fontFamily: fSans, fontSize: 12, color: muted, marginTop: 4 }}>7,265 MMR · Tier I · PERF 8.5</div>
                </div>
              </div>
            </div>

            {/* Match card preview */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: 18 }}>
              <div style={{ fontFamily: fCond, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: dim, marginBottom: 10 }}>Match card · Radiant lineup</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {[
                  { name: 'BAD1', hero: 'Invoker', k: 14, d: 3, a: 9, founder: true },
                  { name: 'Lemon Burtle', hero: 'Lifestealer', k: 11, d: 4, a: 8, founder: false },
                  { name: 'Astro', hero: 'Earthshaker', k: 4, d: 6, a: 18, founder: true },
                ].map(r => (
                  <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center', padding: '4px 0' }}>
                    {r.founder ? <FoundersRing size={26}/> : <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#2a3142', border: `2px solid ${border}` }}/>}
                    <div>
                      <div style={{ fontFamily: fSans, fontSize: 12, color: text }}>{r.name} {r.founder ? <span style={{ color: amber, fontSize: 10, letterSpacing: 1, marginLeft: 4 }}>✦</span> : null}</div>
                      <div style={{ fontFamily: fSans, fontSize: 10, color: dim }}>{r.hero}</div>
                    </div>
                    <div style={{ fontFamily: fCond, fontSize: 12, color: muted, letterSpacing: 1 }}>{r.k}/{r.d}/{r.a}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Discord embed preview */}
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 10, padding: 18 }}>
              <div style={{ fontFamily: fCond, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: dim, marginBottom: 10 }}>Discord weekly recap</div>
              <div style={{ background: '#2b2d31', borderLeft: `3px solid ${amber}`, borderRadius: 4, padding: '12px 14px', fontFamily: 'system-ui, sans-serif' }}>
                <div style={{ fontSize: 11, color: '#b5bac1', marginBottom: 6 }}>OCE Inhouse Bot · Week 12 Recap</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <FoundersRing size={32}/>
                  <div style={{ fontSize: 13, color: '#f2f3f5', fontWeight: 600 }}>BAD1 <span style={{ color: amber, fontSize: 11, marginLeft: 4 }}>FOUNDER</span></div>
                </div>
                <div style={{ fontSize: 12, color: '#dbdee1', lineHeight: 1.5 }}>
                  Topped the leaderboard with 7,265 MMR. PERF score 8.5
                  — highest across every recorded match this week.
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Frames */}
        <section id="frames" style={{ marginBottom: 56 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontFamily: fSerif, fontSize: 28, fontWeight: 700, margin: 0, color: text }}>Profile Frames</h2>
            <span style={{ fontFamily: fSans, fontSize: 13, color: dim }}>4 of 6 shown · <a href="#" style={{ color: brass, textDecoration: 'underline' }}>view all</a></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            <ProductCard preview={<FramePreview ring={brass}/>} name="Brass" sub="Heritage. Matches Pro." coin="600 🪙" fiat="$1.99"/>
            <ProductCard preview={<FramePreview ring="#94a3b8"/>} name="Silver" sub="Quiet and clean." coin="400 🪙" fiat="$0.99"/>
            <ProductCard preview={<FramePreview ring={amber}/>} name="Amber" sub="Captain accent." coin="800 🪙" fiat="$2.99"/>
            <ProductCard preview={<FramePreview ring="#7c3aed"/>} name="Violet" sub="Limited series." coin="1,000 🪙" fiat="$3.99"/>
          </div>
        </section>

        {/* Voice */}
        <section id="voice" style={{ marginBottom: 56 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontFamily: fSerif, fontSize: 28, fontWeight: 700, margin: 0, color: text }}>Voice Packs</h2>
            <span style={{ fontFamily: fSans, fontSize: 13, color: dim }}>Lobby-only · 3 cues each</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              ['Cinematic', 'Brass-court fanfare. Regal.'],
              ['Captain', 'Military commander. Disciplined.'],
              ['Hype', 'Modern trailer. Big and fast.'],
            ].map(([n, s]) => (
              <ProductCard key={n}
                preview={<div style={{ fontFamily: fSerif, fontSize: 32, fontStyle: 'italic', color: brass }}>♪ {n}</div>}
                name={n} sub={s} coin="800 🪙" fiat="$2.99"
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
