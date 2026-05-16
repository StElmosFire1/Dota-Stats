// Shop redesign variant A — Editorial (dark, matches live site)
// Almanac feel on the production ink-navy palette: serif section heads
// with brass underline, hairline dividers, generous whitespace,
// borderless tiles. Founders Pack as a one-column hero band with amber
// CTA. Spendable indicator is an editorial subtitle, not a pill.

const bg = '#0d1424';
const card = '#152036';
const text = '#e6edf8';
const muted = '#94a6cb';
const dim = '#6c7e9c';
const brass = '#c5a975';
const amber = '#f59e0b';
const border = '#2a3b5c';
const hair = 'rgba(197,169,117,0.18)';

const fSerif = '"Playfair Display", Georgia, serif';
const fSans = 'Inter, system-ui, sans-serif';
const fCond = 'Oswald, sans-serif';

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: fCond, fontSize: 11, letterSpacing: 4,
      textTransform: 'uppercase', color: brass, marginBottom: 10,
      paddingBottom: 8, borderBottom: `1px solid ${brass}`, display: 'inline-block',
    }}>{children}</div>
  );
}

function SectionHead({ kicker, title, intro }: { kicker: string; title: string; intro: string }) {
  return (
    <header style={{ marginBottom: 26 }}>
      <Eyebrow>{kicker}</Eyebrow>
      <h2 style={{ fontFamily: fSerif, fontSize: 30, fontWeight: 700, margin: '4px 0 8px', color: text, lineHeight: 1.1 }}>{title}</h2>
      <p style={{ fontFamily: fSans, fontSize: 14, color: muted, maxWidth: 560, lineHeight: 1.55, margin: 0 }}>{intro}</p>
    </header>
  );
}

function Tile({ preview, name, price, note }: { preview: React.ReactNode; name: string; price: string; note?: string }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: 12 }}>{preview}</div>
      <div style={{ fontFamily: fSerif, fontSize: 16, color: text, fontWeight: 600 }}>{name}</div>
      {note ? <div style={{ fontFamily: fSans, fontSize: 12, color: dim, marginTop: 2 }}>{note}</div> : null}
      <div style={{ fontFamily: fCond, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: brass, marginTop: 6 }}>{price}</div>
    </div>
  );
}

function FramePreview({ ring }: { ring: string }) {
  return <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#2a3142', border: `3px solid ${ring}`, boxShadow: '0 1px 6px rgba(0,0,0,0.5)' }}/>;
}

function ThemeStrip({ bg: tb, accent }: { bg: string; accent: string }) {
  return (
    <div style={{ width: 200, height: 64, borderRadius: 6, background: tb, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, border: `1px solid ${border}` }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: accent }}/>
      <div style={{ flex: 1 }}>
        <div style={{ height: 6, background: accent, borderRadius: 3, width: '60%', marginBottom: 4 }}/>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, width: '40%' }}/>
      </div>
    </div>
  );
}

export function Editorial() {
  return (
    <div style={{ background: bg, minHeight: '100vh', fontFamily: fSans, color: text }}>
      {/* Amber ticker — matches site header */}
      <div style={{ background: amber, color: '#1a1a1a', fontFamily: fCond, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', padding: '6px 0', textAlign: 'center' }}>
        Season 1 Ladder Live · $1000 Prize Pool · Founders Pass — 588 remaining
      </div>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '56px 40px 80px' }}>

        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Eyebrow>The Cosmetics Almanac · Vol. VI</Eyebrow>
          <h1 style={{ fontFamily: fSerif, fontSize: 56, fontWeight: 700, margin: '6px 0 16px', color: text, lineHeight: 1.05 }}>
            Outfit your profile.
          </h1>
          <p style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 16, color: muted, maxWidth: 540, margin: '0 auto', lineHeight: 1.5 }}>
            Frames, themes, titles, and voice packs — curated for the OCE
            inhouse community and priced honestly. Let your spendable
            balance do the talking.
          </p>
          <div style={{ marginTop: 22, fontFamily: fCond, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: muted }}>
            You hold <span style={{ color: brass, fontSize: 16, letterSpacing: 1 }}>2,480</span> spendable coins
          </div>
        </div>

        {/* HERO — Founders Pack */}
        <section style={{
          background: card, padding: '36px 40px',
          borderRadius: 8, marginBottom: 56, position: 'relative', overflow: 'hidden',
          border: `1px solid ${border}`,
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: brass }}/>
          <Eyebrow>Featured · One-time, capped</Eyebrow>
          <h2 style={{ fontFamily: fSerif, fontSize: 36, fontWeight: 700, margin: '4px 0 10px', color: text, lineHeight: 1.1 }}>
            The Founders Pass
          </h2>
          <p style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 15, color: muted, maxWidth: 480, lineHeight: 1.5, marginBottom: 24 }}>
            "A brass ring on every page you visit. Once it's sold out, it's
            sold out. Stripe only — no coin path here."
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <button style={{
              background: amber, color: '#1a1a1a', border: 'none', padding: '12px 24px', borderRadius: 6,
              fontFamily: fCond, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
            }}>Purchase — $39 USD</button>
            <span style={{ fontFamily: fCond, fontSize: 12, letterSpacing: 1, color: dim }}>412 / 1,000 sold</span>
          </div>
        </section>

        <section style={{ marginBottom: 64 }}>
          <SectionHead kicker="Section I" title="Profile Frames" intro="Worn around your avatar on the leaderboard, your profile, and the inhouse lobby. Pro members receive the gold frame at no extra charge."/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 36, alignItems: 'start' }}>
            <Tile preview={<FramePreview ring={brass}/>} name="Brass" price="600 coins · $1.99" note="Heritage tone, matches Pro." />
            <Tile preview={<FramePreview ring="#94a3b8"/>} name="Silver" price="400 coins · $0.99" note="Quiet and clean." />
            <Tile preview={<FramePreview ring={amber}/>} name="Amber" price="800 coins · $2.99" note="Captain accent." />
            <Tile preview={<FramePreview ring="#7c3aed"/>} name="Violet" price="1,000 coins · $3.99" note="Limited series." />
          </div>
          <div style={{ height: 1, background: hair, marginTop: 56 }}/>
        </section>

        <section style={{ marginBottom: 64 }}>
          <SectionHead kicker="Section II" title="Profile Layout Themes" intro="The full canvas on which your profile is rendered. Tokens change, but the data stays where you expect it."/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 36, alignItems: 'start' }}>
            <Tile preview={<ThemeStrip bg="#0d1424" accent={brass}/>} name="Court & Pitch" price="1,200 coins · $4.99" note="The house theme." />
            <Tile preview={<ThemeStrip bg="#1a1a1a" accent={amber}/>} name="Carbon Amber" price="1,200 coins · $4.99" note="Stadium broadcast." />
            <Tile preview={<ThemeStrip bg="#fefae0" accent="#283618"/>} name="Newsprint" price="1,400 coins · $5.99" note="Sunday match-day paper." />
          </div>
          <div style={{ height: 1, background: hair, marginTop: 56 }}/>
        </section>

        <section>
          <SectionHead kicker="Section III" title="Voice Packs" intro="Lobby-only cues — match start, level up, achievement unlock. Five packs, each tonally distinct."/>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24, alignItems: 'start' }}>
            {['Cinematic', 'Captain', 'Hype', 'Calm', 'Roast'].map((p) => (
              <Tile key={p}
                preview={<div style={{ height: 56, borderRadius: 4, background: '#0a0f1c', color: brass, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fSerif, fontStyle: 'italic', fontSize: 14, border: `1px solid ${border}` }}>♪ {p}</div>}
                name={p} price="800 coins · $2.99"
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
