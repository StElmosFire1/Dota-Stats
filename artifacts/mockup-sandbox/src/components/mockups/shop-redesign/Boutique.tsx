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

        {/* HERO */}
        <section id="founders" style={{
          background: `linear-gradient(135deg, #152036 0%, #1a2744 100%)`,
          borderRadius: 14, padding: '48px 56px',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'center',
          position: 'relative', overflow: 'hidden', marginBottom: 56,
          border: `1px solid ${border}`,
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: '50%', border: `4px solid ${brass}`, opacity: 0.2 }}/>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${brass}, transparent)` }}/>
          <div>
            <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: brass, marginBottom: 12 }}>Founders Pass · 588 remaining</div>
            <h1 style={{ fontFamily: fSerif, fontSize: 44, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.1, color: text }}>A brass ring, forever.</h1>
            <p style={{ fontFamily: fSans, fontSize: 15, color: muted, lineHeight: 1.55, marginBottom: 24, maxWidth: 440 }}>
              The capped Founders Pass marks you on every page and every
              lobby. One-time purchase, Stripe only — coins don't unlock
              this one.
            </p>
            <button style={{
              background: amber, color: '#1a1a1a', border: 'none', padding: '14px 28px', borderRadius: 8,
              fontFamily: fCond, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
            }}>Purchase — $39 USD</button>
          </div>
          <div style={{ width: 160, height: 160, borderRadius: '50%', background: '#2a3142', border: `6px solid ${brass}`, boxShadow: '0 12px 32px rgba(0,0,0,0.6)' }}/>
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
