// Shop redesign variant A — Editorial / Magazine
// Quiet luxury. Playfair serif section headings in small-caps with a
// brass underline. Generous whitespace, hairline dividers between
// sections, flat tiles (no card borders). Founders Pack lives in a
// one-column hero band at the top with a refined pull-quote. The
// "Spendable" indicator becomes a single line of editorial copy
// rather than a pill. Target buyer impression: this site is a
// publication you trust, and the cosmetics are the masthead's
// recommendations.

const ink = '#0d1424';
const parchment = '#f5efe2';
const brass = '#c5a975';
const muted = '#5d6573';
const hair = 'rgba(13,20,36,0.10)';

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
      <h2 style={{ fontFamily: fSerif, fontSize: 30, fontWeight: 700, margin: '4px 0 8px', color: ink, lineHeight: 1.1 }}>{title}</h2>
      <p style={{ fontFamily: fSans, fontSize: 14, color: muted, maxWidth: 560, lineHeight: 1.55, margin: 0 }}>{intro}</p>
    </header>
  );
}

function Tile({ preview, name, price, note }: { preview: React.ReactNode; name: string; price: string; note?: string }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ marginBottom: 10 }}>{preview}</div>
      <div style={{ fontFamily: fSerif, fontSize: 16, color: ink, fontWeight: 600 }}>{name}</div>
      {note ? <div style={{ fontFamily: fSans, fontSize: 12, color: muted, marginTop: 2 }}>{note}</div> : null}
      <div style={{ fontFamily: fCond, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: brass, marginTop: 6 }}>{price}</div>
    </div>
  );
}

function FramePreview({ color, ring }: { color: string; ring: string }) {
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%',
      background: color, border: `3px solid ${ring}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
    }}/>
  );
}

function ThemeStrip({ bg, accent }: { bg: string; accent: string }) {
  return (
    <div style={{
      width: 200, height: 64, borderRadius: 6, background: bg,
      display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
      border: `1px solid ${hair}`,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: accent }}/>
      <div style={{ flex: 1 }}>
        <div style={{ height: 6, background: accent, borderRadius: 3, width: '60%', marginBottom: 4 }}/>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.3)', borderRadius: 2, width: '40%' }}/>
      </div>
    </div>
  );
}

export function Editorial() {
  return (
    <div style={{ background: parchment, minHeight: '100vh', fontFamily: fSans, color: ink }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '48px 40px 80px' }}>

        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <Eyebrow>The Cosmetics Almanac · Vol. VI</Eyebrow>
          <h1 style={{ fontFamily: fSerif, fontSize: 56, fontWeight: 700, margin: '6px 0 16px', color: ink, lineHeight: 1.05 }}>
            Outfit your profile
          </h1>
          <p style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 16, color: muted, maxWidth: 540, margin: '0 auto', lineHeight: 1.5 }}>
            Frames, themes, titles, and voice packs — curated for the OCE
            inhouse community and priced honestly. Browse and let your
            spendable balance do the talking.
          </p>
          <div style={{ marginTop: 22, fontFamily: fCond, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: ink }}>
            You hold <span style={{ color: brass, fontSize: 16 }}>2,480</span> spendable coins
          </div>
        </div>

        {/* HERO — Founders Pack */}
        <section style={{
          background: ink, color: parchment, padding: '36px 40px',
          borderRadius: 4, marginBottom: 56,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: brass }}/>
          <Eyebrow>Featured · One-time, capped</Eyebrow>
          <h2 style={{ fontFamily: fSerif, fontSize: 36, fontWeight: 700, margin: '4px 0 10px', color: parchment, lineHeight: 1.1 }}>
            The Founders Pass
          </h2>
          <p style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 15, color: 'rgba(245,239,226,0.7)', maxWidth: 480, lineHeight: 1.5, marginBottom: 24 }}>
            "A brass ring on every page you visit. Once it's sold out, it's
            sold out. Stripe only — no coin path here."
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <button style={{
              background: brass, color: ink, border: 'none', padding: '12px 24px',
              fontFamily: fCond, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase',
              fontWeight: 600, cursor: 'pointer',
            }}>Purchase — $39 USD</button>
            <span style={{ fontFamily: fCond, fontSize: 12, letterSpacing: 1, color: 'rgba(245,239,226,0.6)' }}>
              412 / 1,000 sold
            </span>
          </div>
        </section>

        {/* Frames */}
        <section style={{ marginBottom: 64 }}>
          <SectionHead
            kicker="Section I"
            title="Profile Frames"
            intro="Worn around your avatar on the leaderboard, your profile, and the inhouse lobby. Pro members receive the gold frame at no extra charge."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 36, alignItems: 'start' }}>
            <Tile preview={<FramePreview color="#2a3142" ring="#c5a975"/>} name="Brass" price="600 coins · $1.99" note="Heritage tone, matches Pro." />
            <Tile preview={<FramePreview color="#2a3142" ring="#94a3b8"/>} name="Silver" price="400 coins · $0.99" note="Quiet and clean." />
            <Tile preview={<FramePreview color="#2a3142" ring="#f59e0b"/>} name="Amber" price="800 coins · $2.99" note="Captain accent." />
            <Tile preview={<FramePreview color="#2a3142" ring="#7c3aed"/>} name="Violet" price="1,000 coins · $3.99" note="Limited series." />
          </div>
          <div style={{ height: 1, background: hair, marginTop: 56 }}/>
        </section>

        {/* Themes */}
        <section style={{ marginBottom: 64 }}>
          <SectionHead
            kicker="Section II"
            title="Profile Layout Themes"
            intro="The full canvas on which your profile is rendered. Tokens change, but the data stays where you expect it."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 36, alignItems: 'start' }}>
            <Tile preview={<ThemeStrip bg="#0d1424" accent={brass}/>} name="Court & Pitch" price="1,200 coins · $4.99" note="The house theme." />
            <Tile preview={<ThemeStrip bg="#1a1a1a" accent="#f59e0b"/>} name="Carbon Amber" price="1,200 coins · $4.99" note="Stadium broadcast." />
            <Tile preview={<ThemeStrip bg="#fefae0" accent="#283618"/>} name="Newsprint" price="1,400 coins · $5.99" note="Sunday match-day paper." />
          </div>
          <div style={{ height: 1, background: hair, marginTop: 56 }}/>
        </section>

        {/* Voice */}
        <section>
          <SectionHead
            kicker="Section III"
            title="Voice Packs"
            intro="Lobby-only cues — match start, level up, achievement unlock. Five packs, each tonally distinct."
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24, alignItems: 'start' }}>
            {['Cinematic', 'Captain', 'Hype', 'Calm', 'Roast'].map((p) => (
              <Tile key={p}
                preview={<div style={{ height: 56, borderRadius: 4, background: ink, color: parchment, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fSerif, fontStyle: 'italic', fontSize: 14 }}>♪ {p}</div>}
                name={p}
                price="800 coins · $2.99"
              />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
