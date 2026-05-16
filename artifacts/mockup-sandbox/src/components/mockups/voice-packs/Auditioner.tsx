// Voice Pack Auditioner — preview surface for the 5 generated voice packs
// (cinematic, captain, hype, calm, roast), each with 3 event slots
// (match-start, level-up, achievement-unlock). Audio files are served by
// the main app on port 5000; this mockup is on the sandbox dev server.
// Cross-port HTML5 audio playback works without CORS configuration.
//
// Branded with the Court & Pitch palette (ink-navy / brass / parchment)
// from replit.md so the audition looks like part of the site, not a
// generic preview page.

const PACKS = [
  {
    id: 'cinematic',
    title: 'Cinematic',
    tagline: 'Brass-court fanfare. Regal, broadcast-quality.',
    direction: 'Deep horn swells, harp glissandos, heraldic flourishes.',
  },
  {
    id: 'captain',
    title: 'Captain',
    tagline: 'Military commander. Disciplined and confident.',
    direction: 'Snare rolls, bugle calls, parade-ground signals.',
  },
  {
    id: 'hype',
    title: 'Hype',
    tagline: 'Modern trailer. Big, fast, aggressive.',
    direction: 'Risers, sub-bass booms, cinematic stabs.',
  },
  {
    id: 'calm',
    title: 'Calm',
    tagline: 'Soft and grounded. Deliberately understated.',
    direction: 'Warm pads, mellow piano, gentle string halos.',
  },
  {
    id: 'roast',
    title: 'Roast',
    tagline: 'Comedic sting. Playfully mocking.',
    direction: 'Muted-trumpet wah-wahs, slide whistles, cartoon trombones.',
  },
] as const;

const SLOTS = [
  { id: 'match-start', label: 'Match start', desc: 'When a lobby kicks off.' },
  { id: 'level-up', label: 'Level up', desc: 'When you hit a milestone.' },
  { id: 'achievement-unlock', label: 'Achievement', desc: 'When something special unlocks.' },
] as const;

// Audio files live on the main app (port 5000 = default Replit domain).
// Mockup sandbox is on the same domain under /__mockup/, but assets at
// /voice-packs/* are served by the main app. Absolute URLs would work
// too; relative `/voice-packs/...` paths work because both mockup and
// main app share the same host through the Replit proxy.
const audioSrc = (pack: string, slot: string) => `/voice-packs/${pack}/${slot}.mp3`;

export function Auditioner() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: '#f5efe2',
        color: '#0d1424',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '32px 28px 56px',
      }}
    >
      <header style={{ maxWidth: 920, margin: '0 auto 28px' }}>
        <div
          style={{
            fontFamily: 'Oswald, sans-serif',
            fontSize: 11,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: '#c5a975',
            marginBottom: 8,
          }}
        >
          OCE Inhouse · Voice Pack Audition
        </div>
        <h1
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 38,
            fontWeight: 700,
            margin: 0,
            color: '#0d1424',
            lineHeight: 1.1,
          }}
        >
          Five packs. Fifteen cues.
        </h1>
        <p
          style={{
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 15,
            color: '#3a4658',
            marginTop: 12,
            maxWidth: 680,
            lineHeight: 1.5,
          }}
        >
          Each pack covers the three lobby-only events kept after the v6.82
          trim: <em>match start</em>, <em>level up</em>, and <em>achievement
          unlock</em>. Pick the ones that feel on-brand and tell me what to
          ship, regenerate, or scrap.
        </p>
      </header>

      <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {PACKS.map((pack) => (
          <section
            key={pack.id}
            style={{
              background: '#ffffff',
              border: '1px solid rgba(13,20,36,0.08)',
              borderRadius: 12,
              padding: '20px 22px',
              boxShadow: '0 1px 0 rgba(13,20,36,0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <h2
                style={{
                  fontFamily: '"Playfair Display", Georgia, serif',
                  fontSize: 24,
                  fontWeight: 700,
                  margin: 0,
                  color: '#0d1424',
                }}
              >
                {pack.title}
              </h2>
              <span
                style={{
                  fontFamily: 'Oswald, sans-serif',
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#c5a975',
                  borderBottom: '1px solid #c5a975',
                  paddingBottom: 2,
                }}
              >
                {pack.tagline}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 16px' }}>
              {pack.direction}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 14,
              }}
            >
              {SLOTS.map((slot) => (
                <div
                  key={slot.id}
                  style={{
                    background: '#f5efe2',
                    border: '1px solid rgba(197,169,117,0.35)',
                    borderRadius: 10,
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'Oswald, sans-serif',
                      fontSize: 11,
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                      color: '#0d1424',
                      marginBottom: 2,
                    }}
                  >
                    {slot.label}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                    {slot.desc}
                  </div>
                  {/*
                    Native HTML5 audio controls — accessible by default
                    (keyboard play/pause via Space, ARIA live-region updates
                    for the time display, focus ring on the play button).
                  */}
                  <audio
                    controls
                    preload="none"
                    src={audioSrc(pack.id, slot.id)}
                    style={{ width: '100%', height: 36 }}
                  >
                    Your browser does not support the audio element.
                  </audio>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer
        style={{
          maxWidth: 920,
          margin: '32px auto 0',
          padding: '16px 20px',
          background: '#0d1424',
          color: '#f5efe2',
          borderRadius: 10,
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: '#c5a975', letterSpacing: 1 }}>
          What I&apos;m listening for from you:
        </strong>{' '}
        which packs feel right, which clips need a regenerate (different
        instruments / faster / quieter / shorter tail), and whether any
        should be dropped entirely. I&apos;ll iterate from there before
        committing them as v6.85.
      </footer>
    </div>
  );
}
