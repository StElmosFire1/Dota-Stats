// Shop redesign variant B — Boutique (dark, matches live site)
// Big Founders hero banner with brass ring artwork. Sticky sub-nav for
// anchor jumps. Taller product cards on --bg-card with bigger previews.
// Dual coin/$ pricing. Amber CTAs match the site's Pro pill style.

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

export function Boutique() {
  return (
    <div style={{ background: bg, minHeight: '100vh', fontFamily: fSans, color: text }}>
      {/* Amber ticker — matches site header */}
      <div style={{ background: amber, color: '#1a1a1a', fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', padding: '6px 0', textAlign: 'center' }}>
        Season 1 Ladder Live · $1000 Prize Pool · Founders Pass — 588 remaining
      </div>

      <SubNav/>
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* HERO — Founders Pass with animated shimmer ring */}
        <style>{`
          @keyframes fp-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes fp-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.35), 0 12px 32px rgba(0,0,0,0.6); }
                                50%       { box-shadow: 0 0 0 14px rgba(245,158,11,0), 0 12px 32px rgba(0,0,0,0.6); } }
          @keyframes fp-shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        `}</style>
        <section id="founders" style={{
          background: `linear-gradient(135deg, #152036 0%, #1a2744 100%)`,
          borderRadius: 14, padding: '48px 56px',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'center',
          position: 'relative', overflow: 'hidden', marginBottom: 40,
          border: `1px solid ${border}`,
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${brass}, transparent)` }}/>
          <div>
            <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: amber, marginBottom: 12 }}>The Founders Pass · 588 remaining</div>
            <h1 style={{ fontFamily: fSerif, fontSize: 44, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.1, color: text }}>Be a founder of OCE Inhouse.</h1>
            <p style={{ fontFamily: fSans, fontSize: 15, color: muted, lineHeight: 1.55, marginBottom: 18, maxWidth: 460 }}>
              An animated founders ring on your avatar — visible on the
              leaderboard, every match card, the inhouse lobby, and your
              profile. Capped at 1,000, one-time, Stripe only.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', fontFamily: fSans, fontSize: 13, color: muted, display: 'grid', gap: 6 }}>
              <li>✦ Animated brass-and-amber ring (founders exclusive)</li>
              <li>✦ "Founder" badge beside your name everywhere it appears</li>
              <li>✦ Permanent leaderboard hover-card highlight</li>
              <li>✦ 2,000 spendable coins included</li>
            </ul>
            <button style={{
              background: amber, color: '#1a1a1a', border: 'none', padding: '14px 28px', borderRadius: 8,
              fontFamily: fCond, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
            }}>Claim founder status — $39 USD</button>
          </div>
          {/* Animated ring: rotating brass/amber shimmer gradient + soft amber pulse */}
          <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: `conic-gradient(from 0deg, ${brass}, ${amber}, #fcd34d, ${amber}, ${brass}, #8a7448, ${brass})`,
              animation: 'fp-rotate 6s linear infinite',
              filter: 'blur(0.5px)',
            }}/>
            <div style={{
              position: 'absolute', inset: 8, borderRadius: '50%',
              background: '#0d1424',
            }}/>
            <div style={{
              position: 'absolute', inset: 14, borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #3a4560 0%, #1a2236 60%, #0d1424 100%)',
              animation: 'fp-pulse 2.4s ease-in-out infinite',
            }}/>
            <div style={{
              position: 'relative', zIndex: 1, fontFamily: fSerif, fontSize: 13, fontStyle: 'italic',
              color: amber, letterSpacing: 1, textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            }}>your avatar</div>
          </div>
        </section>

        {/* Where you'll be seen */}
        <section style={{ marginBottom: 56, padding: '20px 24px', background: card, border: `1px solid ${border}`, borderRadius: 10 }}>
          <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: brass, marginBottom: 10 }}>Where you'll be seen</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
            {[
              ['Leaderboard', 'Ring renders next to your name in every top-100 row.'],
              ['Match cards', 'Both teams see the ring on hover and in post-match.'],
              ['Inhouse lobby', 'Live captain-draft screen shows founders first.'],
              ['Profile page', 'Permanent founders banner above your stats.'],
              ['Discord recap', 'Weekly recap embed tags founders with the ring.'],
            ].map(([t, d]) => (
              <div key={t} style={{ background: hover, borderRadius: 8, padding: 14, border: `1px solid ${border}` }}>
                <div style={{ fontFamily: fSerif, fontSize: 14, color: text, fontWeight: 600, marginBottom: 4 }}>{t}</div>
                <div style={{ fontFamily: fSans, fontSize: 11, color: dim, lineHeight: 1.45 }}>{d}</div>
              </div>
            ))}
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
