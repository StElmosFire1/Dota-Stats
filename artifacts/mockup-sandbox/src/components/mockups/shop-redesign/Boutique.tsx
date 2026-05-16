// Shop redesign variant B — Boutique Storefront
// E-commerce vibe. Founders Pack as a wide hero banner at the top.
// Sticky sub-nav anchors so the user can jump straight to a category.
// Cards are taller with bigger previews, name+price below, single CTA.
// Hover-elevate via shadow (focus-equivalent for keyboard). 2-3 columns
// depending on category. Target buyer impression: this is a curated store.

const ink = '#0d1424';
const parchment = '#f5efe2';
const brass = '#c5a975';
const amber = '#f59e0b';
const muted = '#6b7280';
const cardBg = '#ffffff';
const border = 'rgba(13,20,36,0.08)';

const fSerif = '"Playfair Display", Georgia, serif';
const fSans = 'Inter, system-ui, sans-serif';
const fCond = 'Oswald, sans-serif';

const cardShadow = '0 1px 2px rgba(13,20,36,0.04), 0 8px 24px -16px rgba(13,20,36,0.12)';

function CoinPill({ n }: { n: number }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: ink, color: parchment, padding: '8px 16px',
      borderRadius: 999, fontFamily: fCond, fontSize: 13, letterSpacing: 1,
    }}>
      <span style={{ fontSize: 16 }}>🪙</span>
      <strong style={{ color: brass }}>{n.toLocaleString()}</strong>
      <span style={{ opacity: 0.7 }}>spendable</span>
    </div>
  );
}

function ProductCard({ preview, name, sub, coin, fiat, accent = brass }: {
  preview: React.ReactNode; name: string; sub: string; coin: string; fiat: string; accent?: string;
}) {
  return (
    <div style={{
      background: cardBg, border: `1px solid ${border}`, borderRadius: 10,
      boxShadow: cardShadow, padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ background: parchment, borderRadius: 8, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
        {preview}
      </div>
      <div>
        <div style={{ fontFamily: fSerif, fontSize: 18, fontWeight: 600, color: ink }}>{name}</div>
        <div style={{ fontFamily: fSans, fontSize: 12, color: muted, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 'auto' }}>
        <span style={{ fontFamily: fCond, fontSize: 18, color: ink, fontWeight: 600 }}>{coin}</span>
        <span style={{ fontFamily: fSans, fontSize: 12, color: muted }}>or {fiat}</span>
      </div>
      <button style={{
        background: accent, color: ink, border: 'none', padding: '10px 14px', borderRadius: 6,
        fontFamily: fCond, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
        fontWeight: 600, cursor: 'pointer',
      }}>Add to inventory</button>
    </div>
  );
}

function SubNav() {
  const items = ['Founders', 'Frames', 'Themes', 'Titles', 'Voice', 'Identity'];
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 5, background: parchment,
      borderBottom: `1px solid ${border}`, padding: '16px 0', marginBottom: 32,
    }}>
      <div style={{ maxWidth: 1140, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', gap: 28 }}>
          {items.map(label => (
            <a key={label} href={`#${label.toLowerCase()}`} style={{
              fontFamily: fCond, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase',
              color: ink, textDecoration: 'none', paddingBottom: 4,
              borderBottom: label === 'Founders' ? `2px solid ${brass}` : '2px solid transparent',
            }}>{label}</a>
          ))}
        </div>
        <CoinPill n={2480}/>
      </div>
    </nav>
  );
}

function FramePreview({ ring }: { ring: string }) {
  return (
    <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#2a3142', border: `3px solid ${ring}`, boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}/>
  );
}

export function Boutique() {
  return (
    <div style={{ background: parchment, minHeight: '100vh', fontFamily: fSans, color: ink }}>
      <SubNav/>
      <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* HERO */}
        <section id="founders" style={{
          background: `linear-gradient(135deg, ${ink} 0%, #1a2236 100%)`,
          borderRadius: 16, padding: '48px 56px', color: parchment,
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 48, alignItems: 'center',
          position: 'relative', overflow: 'hidden', marginBottom: 56,
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', border: `4px solid ${brass}`, opacity: 0.15 }}/>
          <div>
            <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: brass, marginBottom: 12 }}>Founders Pass · 588 remaining</div>
            <h1 style={{ fontFamily: fSerif, fontSize: 44, fontWeight: 700, margin: '0 0 14px', lineHeight: 1.1 }}>A brass ring, forever.</h1>
            <p style={{ fontFamily: fSans, fontSize: 15, color: 'rgba(245,239,226,0.75)', lineHeight: 1.55, marginBottom: 24, maxWidth: 440 }}>
              The capped Founders Pass marks you on every page and every
              lobby. One-time purchase, Stripe only — coins don't unlock
              this one.
            </p>
            <button style={{
              background: brass, color: ink, border: 'none', padding: '14px 28px', borderRadius: 8,
              fontFamily: fCond, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
            }}>Purchase — $39 USD</button>
          </div>
          <div style={{ width: 160, height: 160, borderRadius: '50%', background: '#2a3142', border: `6px solid ${brass}`, boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}/>
        </section>

        {/* Frames */}
        <section id="frames" style={{ marginBottom: 56 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontFamily: fSerif, fontSize: 28, fontWeight: 700, margin: 0 }}>Profile Frames</h2>
            <span style={{ fontFamily: fSans, fontSize: 13, color: muted }}>4 of 6 shown · <a href="#" style={{ color: ink, textDecoration: 'underline' }}>view all</a></span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            <ProductCard preview={<FramePreview ring={brass}/>} name="Brass" sub="Heritage. Matches Pro." coin="600 🪙" fiat="$1.99"/>
            <ProductCard preview={<FramePreview ring="#94a3b8"/>} name="Silver" sub="Quiet and clean." coin="400 🪙" fiat="$0.99"/>
            <ProductCard preview={<FramePreview ring={amber}/>} name="Amber" sub="Captain accent." coin="800 🪙" fiat="$2.99"/>
            <ProductCard preview={<FramePreview ring="#7c3aed"/>} name="Violet" sub="Limited series." coin="1,000 🪙" fiat="$3.99" accent={amber}/>
          </div>
        </section>

        {/* Voice */}
        <section id="voice" style={{ marginBottom: 56 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontFamily: fSerif, fontSize: 28, fontWeight: 700, margin: 0 }}>Voice Packs</h2>
            <span style={{ fontFamily: fSans, fontSize: 13, color: muted }}>Lobby-only · 3 cues each</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              ['Cinematic', 'Brass-court fanfare. Regal.'],
              ['Captain', 'Military commander. Disciplined.'],
              ['Hype', 'Modern trailer. Big and fast.'],
            ].map(([n, s]) => (
              <ProductCard key={n}
                preview={<div style={{ fontFamily: fSerif, fontSize: 32, fontStyle: 'italic', color: ink }}>♪ {n}</div>}
                name={n} sub={s} coin="800 🪙" fiat="$2.99"
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
