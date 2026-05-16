// Shop redesign variant C — Tabbed (dark, matches live site)
// Compact dashboard on the production palette. Sticky header with
// spendable pill + tab bar; one category visible at a time, 4-across
// grid below. Best for users who know what they're shopping for.

import { useState } from 'react';

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

type CardData = { name: string; sub: string; coin: string; fiat: string; preview: React.ReactNode };

function Card({ name, sub, coin, fiat, preview }: CardData) {
  return (
    <div style={{
      background: card, border: `1px solid ${border}`, borderRadius: 10,
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ background: hover, borderRadius: 6, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 96, border: `1px solid ${border}` }}>
        {preview}
      </div>
      <div style={{ fontFamily: fSerif, fontSize: 15, fontWeight: 600, color: text }}>{name}</div>
      <div style={{ fontFamily: fSans, fontSize: 11, color: dim, marginTop: -4 }}>{sub}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button style={{
          flex: 1, background: 'transparent', color: brass, border: `1px solid ${brass}`,
          padding: '8px 6px', borderRadius: 6,
          fontFamily: fCond, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer',
        }}>{coin} 🪙</button>
        <button style={{
          flex: 1, background: amber, color: '#1a1a1a', border: 'none', padding: '8px 6px', borderRadius: 6,
          fontFamily: fCond, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
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
    { name: 'Court & Pitch', sub: 'House theme.', coin: '1,200', fiat: '$4.99', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: '#0d1424', padding: 8, border: `1px solid ${border}` }}><div style={{ height: 6, background: brass, borderRadius: 3, width: '60%', marginBottom: 4 }}/><div style={{ height: 4, background: 'rgba(255,255,255,0.25)', borderRadius: 2, width: '40%' }}/></div> },
    { name: 'Carbon Amber', sub: 'Broadcast.', coin: '1,200', fiat: '$4.99', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: '#1a1a1a', padding: 8 }}><div style={{ height: 6, background: amber, borderRadius: 3, width: '60%', marginBottom: 4 }}/><div style={{ height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, width: '40%' }}/></div> },
    { name: 'Newsprint', sub: 'Sunday paper.', coin: '1,400', fiat: '$5.99', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: '#fefae0', padding: 8 }}><div style={{ height: 6, background: '#283618', borderRadius: 3, width: '60%', marginBottom: 4 }}/><div style={{ height: 4, background: '#6b7280', borderRadius: 2, width: '40%' }}/></div> },
    { name: 'Holo', sub: 'Iridescent.', coin: '1,600', fiat: '$6.99', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: 'linear-gradient(135deg, #a78bfa, #60a5fa, #34d399)', padding: 8 }}/> },
  ],
  Titles: [
    { name: 'Captain', sub: 'For shotcallers.', coin: '600', fiat: '$1.99', preview: <div style={{ fontFamily: fSerif, fontSize: 18, fontStyle: 'italic', color: text }}>Player · <span style={{ color: brass }}>Captain</span></div> },
    { name: 'The Closer', sub: 'High-pressure.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 18, fontStyle: 'italic', color: text }}>Player · <span style={{ color: amber }}>The Closer</span></div> },
    { name: 'Ironclad', sub: 'Streak gated.', coin: '1,000', fiat: '$3.99', preview: <div style={{ fontFamily: fSerif, fontSize: 18, fontStyle: 'italic', color: text }}>Player · <span style={{ color: '#f87171' }}>Ironclad</span></div> },
  ],
  Voice: [
    { name: 'Cinematic', sub: 'Brass fanfare.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: brass }}>♪ Cinematic</div> },
    { name: 'Captain', sub: 'Military.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: brass }}>♪ Captain</div> },
    { name: 'Hype', sub: 'Modern trailer.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: brass }}>♪ Hype</div> },
    { name: 'Calm', sub: 'Soft & grounded.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: brass }}>♪ Calm</div> },
    { name: 'Roast', sub: 'Playful sting.', coin: '800', fiat: '$2.99', preview: <div style={{ fontFamily: fSerif, fontSize: 22, fontStyle: 'italic', color: brass }}>♪ Roast</div> },
  ],
  Identity: [
    { name: 'Banner · Brass', sub: 'Top-of-profile.', coin: '500', fiat: '$1.49', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: `linear-gradient(135deg, ${brass}, #8a7448)` }}/> },
    { name: 'Banner · Pitch', sub: 'Field green.', coin: '500', fiat: '$1.49', preview: <div style={{ width: 120, height: 56, borderRadius: 6, background: 'linear-gradient(135deg, #355e3b, #1f3a23)' }}/> },
  ],
  Founders: [
    { name: 'Founders Pass', sub: 'Stripe only · 588 left', coin: '—', fiat: '$39.00', preview: <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#2a3142', border: `6px solid ${brass}` }}/> },
  ],
};

const TABS = ['Frames', 'Themes', 'Titles', 'Voice', 'Identity', 'Founders'];

export function Tabbed() {
  const [active, setActive] = useState('Frames');
  const items = DATA[active] || [];
  return (
    <div style={{ background: bg, minHeight: '100vh', fontFamily: fSans, color: text }}>
      {/* Amber ticker */}
      <div style={{ background: amber, color: '#1a1a1a', fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', padding: '6px 0', textAlign: 'center' }}>
        Season 1 Ladder Live · $1000 Prize Pool · Founders Pass — 588 remaining
      </div>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: bg, borderBottom: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: brass }}>OCE Inhouse</div>
            <h1 style={{ fontFamily: fSerif, fontSize: 26, fontWeight: 700, margin: '2px 0 0', color: text }}>Cosmetics Shop</h1>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: card, border: `1px solid ${brass}`, padding: '8px 16px', borderRadius: 999, fontFamily: fCond, fontSize: 12 }}>
            <span style={{ fontSize: 14 }}>🪙</span>
            <strong style={{ color: brass, fontSize: 15 }}>2,480</strong>
            <span style={{ color: muted, opacity: 0.85, letterSpacing: 1 }}>SPENDABLE</span>
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
                color: isActive ? text : dim,
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
          <h2 style={{ fontFamily: fSerif, fontSize: 22, fontWeight: 700, margin: 0, color: text }}>{active}</h2>
          <span style={{ fontFamily: fSans, fontSize: 13, color: dim }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {items.map(it => <Card key={it.name} {...it}/>)}
        </div>
      </div>
    </div>
  );
}
