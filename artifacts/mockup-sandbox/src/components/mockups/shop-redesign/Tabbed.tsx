// Shop redesign variant C — Tabbed Categories
// Compact dashboard. Tab bar across the top, only one section visible
// at a time, 4-across grid. Spendable pill always sticky above the tabs.
// Best for users who know what category they want and hate scrolling.

import { useState } from 'react';

const ink = '#0d1424';
const parchment = '#f5efe2';
const brass = '#c5a975';
const amber = '#f59e0b';
const muted = '#6b7280';
const cardBg = '#ffffff';
const border = 'rgba(13,20,36,0.10)';

const fSerif = '"Playfair Display", Georgia, serif';
const fSans = 'Inter, system-ui, sans-serif';
const fCond = 'Oswald, sans-serif';

type CardData = { name: string; sub: string; coin: string; fiat: string; preview: React.ReactNode };

function Card({ name, sub, coin, fiat, preview }: CardData) {
  return (
    <div style={{
      background: cardBg, border: `1px solid ${border}`, borderRadius: 10,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ background: parchment, borderRadius: 6, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 88 }}>
        {preview}
      </div>
      <div style={{ fontFamily: fSerif, fontSize: 15, fontWeight: 600, color: ink }}>{name}</div>
      <div style={{ fontFamily: fSans, fontSize: 11, color: muted, marginTop: -4 }}>{sub}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button style={{
          flex: 1, background: ink, color: parchment, border: 'none', padding: '8px 6px', borderRadius: 6,
          fontFamily: fCond, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer',
        }}>{coin} 🪙</button>
        <button style={{
          flex: 1, background: 'transparent', color: ink, border: `1px solid ${ink}`, padding: '8px 6px', borderRadius: 6,
          fontFamily: fCond, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer',
        }}>{fiat}</button>
      </div>
    </div>
  );
}

function FramePrev({ ring }: { ring: string }) {
  return <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#2a3142', border: `3px solid ${ring}` }}/>;
}

const DATA: Record<string, CardData[]> = {
  Frames: [
    { name: 'Brass', sub: 'Heritage tone.', coin: '600', fiat: '$1.99', preview: <FramePrev ring={brass}/> },
    { name: 'Silver', sub: 'Clean.', coin: '400', fiat: '$0.99', preview: <FramePrev ring="#94a3b8"/> },
    { name: 'Amber', sub: 'Captain accent.', coin: '800', fiat: '$2.99', preview: <FramePrev ring={amber}/> },
    { name: 'Violet', sub: 'Limited.', coin: '1,000', fiat: '$3.99', preview: <FramePrev ring="#7c3aed"/> },
    { name: 'Crimson', sub: 'High-tier.', coin: '1,200', fiat: '$4.99', preview: <FramePrev ring="#dc2626"/> },
    { name: 'Emerald', sub: 'Forest.', coin: '1,200', fiat: '$4.99', preview: <FramePrev ring="#10b981"/> },
  ],
  Themes: [
    { name: 'Court & Pitch', sub: 'House theme.', coin: '1,200', fiat: '$4.99', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: ink, padding: 8 }}><div style={{ height: 6, background: brass, borderRadius: 3, width: '60%', marginBottom: 4 }}/><div style={{ height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, width: '40%' }}/></div> },
    { name: 'Carbon Amber', sub: 'Broadcast.', coin: '1,200', fiat: '$4.99', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: '#1a1a1a', padding: 8 }}><div style={{ height: 6, background: amber, borderRadius: 3, width: '60%', marginBottom: 4 }}/><div style={{ height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, width: '40%' }}/></div> },
    { name: 'Newsprint', sub: 'Sunday paper.', coin: '1,400', fiat: '$5.99', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: '#fefae0', padding: 8 }}><div style={{ height: 6, background: '#283618', borderRadius: 3, width: '60%', marginBottom: 4 }}/><div style={{ height: 4, background: '#6b7280', borderRadius: 2, width: '40%' }}/></div> },
    { name: 'Holo', sub: 'Iridescent.', coin: '1,600', fiat: '$6.99', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: 'linear-gradient(135deg, #a78bfa, #60a5fa, #34d399)', padding: 8 }}/> },
  ],
  Titles: [
    { name: 'Captain', sub: 'For shotcallers.', coin: '600', fiat: '$1.99', preview: <div style={{ fontFamily: fSerif, fontSize: 18, fontStyle: 'italic', color: ink }}>Player · <span style={{ color: brass }}>Captain</span></div> },
    { name: 'The Closer', sub: 'High-pressure.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 18, fontStyle: 'italic', color: ink }}>Player · <span style={{ color: amber }}>The Closer</span></div> },
    { name: 'Ironclad', sub: 'Streak gated.', coin: '1,000', fiat: '$3.99', preview: <div style={{ fontFamily: fSerif, fontSize: 18, fontStyle: 'italic', color: ink }}>Player · <span style={{ color: '#dc2626' }}>Ironclad</span></div> },
  ],
  Voice: [
    { name: 'Cinematic', sub: 'Brass fanfare.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: ink }}>♪ Cinematic</div> },
    { name: 'Captain', sub: 'Military.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: ink }}>♪ Captain</div> },
    { name: 'Hype', sub: 'Modern trailer.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: ink }}>♪ Hype</div> },
    { name: 'Calm', sub: 'Soft & grounded.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: ink }}>♪ Calm</div> },
    { name: 'Roast', sub: 'Playful sting.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: ink }}>♪ Roast</div> },
  ],
  Identity: [
    { name: 'Banner · Brass', sub: 'Top-of-profile.', coin: '500', fiat: '$1.49', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: `linear-gradient(135deg, ${brass}, #8a7448)` }}/> },
    { name: 'Banner · Pitch', sub: 'Field green.', coin: '500', fiat: '$1.49', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: 'linear-gradient(135deg, #355e3b, #1f3a23)' }}/> },
  ],
  Founders: [
    { name: 'Founders Pass', sub: 'Stripe only · 588 left', coin: '—', fiat: '$39.00', preview: <div style={{ width: 72, height: 72, borderRadius: '50%', background: ink, border: `6px solid ${brass}` }}/> },
  ],
};

const TABS = ['Frames', 'Themes', 'Titles', 'Voice', 'Identity', 'Founders'];

export function Tabbed() {
  const [active, setActive] = useState('Frames');
  const items = DATA[active] || [];
  return (
    <div style={{ background: parchment, minHeight: '100vh', fontFamily: fSans, color: ink }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: parchment, borderBottom: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: brass }}>OCE Inhouse</div>
            <h1 style={{ fontFamily: fSerif, fontSize: 26, fontWeight: 700, margin: '2px 0 0' }}>Cosmetics Shop</h1>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ink, color: parchment, padding: '10px 18px', borderRadius: 999, fontFamily: fCond, fontSize: 13 }}>
            <span style={{ fontSize: 16 }}>🪙</span>
            <strong style={{ color: brass, fontSize: 15 }}>2,480</strong>
            <span style={{ opacity: 0.7, letterSpacing: 1 }}>SPENDABLE</span>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px', display: 'flex', gap: 4, overflowX: 'auto' }}>
          {TABS.map(t => {
            const isActive = t === active;
            return (
              <button key={t} type="button" onClick={() => setActive(t)} style={{
                background: 'transparent', border: 'none', padding: '14px 18px', cursor: 'pointer',
                fontFamily: fCond, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase',
                color: isActive ? ink : muted,
                borderBottom: isActive ? `3px solid ${brass}` : '3px solid transparent',
                fontWeight: isActive ? 600 : 400,
              }}>{t} <span style={{ opacity: 0.55, marginLeft: 4, fontSize: 11 }}>{(DATA[t]||[]).length}</span></button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 28px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontFamily: fSerif, fontSize: 22, fontWeight: 700, margin: 0 }}>{active}</h2>
          <span style={{ fontFamily: fSans, fontSize: 13, color: muted }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {items.map(it => <Card key={it.name} {...it}/>)}
        </div>
      </div>
    </div>
  );
}
