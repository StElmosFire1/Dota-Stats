import "./_profile.css";

type Variant = {
  letter: "A" | "B" | "C" | "B2" | "B3";
  id: "TrophyWall" | "MagazineSpread" | "TacticalDossier" | "MagazineSpreadV2" | "MagazineSpreadV3";
  title: string;
  tagline: string;
  rationale: string;
};

const VARIANTS: Variant[] = [
  {
    letter: "A",
    id: "TrophyWall",
    title: "Trophy Wall",
    tagline: "Hero header + right-rail trophy wall",
    rationale:
      "Treats the player like a champion. Big serif name lockup leads, AI Scouting + stat blocks fill the main column, and a right rail collects every Pinned thing (honor, signature hero, match) like trophies on a shelf. Pro upgrades the rail with the Cosmic frame on the signature hero portrait. Best for showing prestige + customization.",
  },
  {
    letter: "B",
    id: "MagazineSpread",
    title: "Magazine Spread",
    tagline: "Editorial two-column long-form",
    rationale:
      "Reads like a player feature in a print magazine. Left column is identity + customization controls; right column is a stack of long-form stories (Latest Game, Current Form, AI Scouting, Trophy Cabinet, Hero Pool). Lock overlay over AI Scouting for free users sells Pro hard. Best when content depth matters more than dashboard density.",
  },
  {
    letter: "B2",
    id: "MagazineSpreadV2",
    title: "Magazine Spread v2",
    tagline: "Editorial v1 — fuller, organised, free/Pro split",
    rationale:
      "Extends Variant B (the user's favourite). Right column reorganised into 7 mag-story sections with clear free vs Pro separation. Free: per-position breakdown, full stat averages, multi-kill chips, recent matches table (with date + link arrow), rolling 10-game WR area chart. Pro (visible to any Pro viewer on any profile): AI Scout, best/worst allies, head-to-head search, PERF helped/hurt bars, sortable hero matchup table (defaults to highest delta), time-of-day × weekday heatmap, item & skill build trends, and an MMR Δ column on Recent Matches. Uses v1's lock-overlay + lock-msg pattern verbatim for parity.",
  },
  {
    letter: "B3",
    id: "MagazineSpreadV3",
    title: "Magazine Spread v3",
    tagline: "Cinematic cover · single-column · polish + cosmetic monetization",
    rationale:
      "Drops the two-column layout entirely. A full-width cinematic hero banner uses the player's pinned hero as a backdrop with a giant Playfair name overlaid, a glassy vital-stats strip (MMR, Recent WR, KDA, GPM/XPM, PERF) with sparklines + Pro \"why\" tooltips, flair pills, socials, and a cover sting mute toggle. Adds: sticky header, anchor nav, time-window pills, AI pull-quote (Pro-only on free profiles), career highlights ribbon, hero hover panels, compare drawer + FAB, OG cosmetic shop with category tabs (frames / voice / trophy borders / cover FX / vanity URLs / season wrapped / verified), Hall of Fame plaque, season wrapped card, and 5 theme variants (Newsprint / Carbon / Holo / Heritage / Broadcast). Cover FX pack: Ken Burns, Parallax Drift, Particle Drift, Shimmer, Vignette Pulse, Kill/Streak Glow — gated by persona/ownership.",
  },
  {
    letter: "C",
    id: "TacticalDossier",
    title: "Tactical Dossier",
    tagline: "Esports roster card · grid of brass-ruled tiles",
    rationale:
      "Reads like a coach's scouting binder. Identity strip + grid of brass-ruled stat tiles. Pro upgrades existing tiles in place (PERF tile gains a chart, Scouting tile fills with copy) instead of unlocking new ones — feels like a single dossier that 'sharpens' with tier. Best for stat-driven users.",
  },
];

const V3_THEMES: Array<{ id: string; component: string; label: string; rationale: string }> = [
  { id: "default",   component: "MagazineSpreadV3",          label: "Court & Pitch",  rationale: "Default OCE Inhouse palette — ink-navy / brass / amber / parchment." },
  { id: "newsprint", component: "MagazineSpreadV3Newsprint", label: "Newsprint",      rationale: "High-contrast editorial — cream paper, deep ink, condensed display type." },
  { id: "carbon",    component: "MagazineSpreadV3Carbon",    label: "Carbon",         rationale: "Pure dark/mono — pitch black, near-white, single accent. Esports broadcast vibe." },
  { id: "holo",      component: "MagazineSpreadV3Holo",      label: "Holographic",    rationale: "Iridescent gradient accents over deep navy — modern Web3-adjacent feel." },
  { id: "heritage",  component: "MagazineSpreadV3Heritage",  label: "Heritage",       rationale: "Sepia + leather + gold — old-world sportsbook / vintage Wisden almanac." },
  { id: "broadcast", component: "MagazineSpreadV3Broadcast", label: "Broadcast",      rationale: "Sports-broadcast lower-third look — saturated brand red, slab type, bold rules." },
];

const SANDBOX_BASE = (() => {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const root = url.pathname.split("/__mockup")[0];
  return `${url.origin}${root}/__mockup/preview/profile-redesign`;
})();

const DESKTOP_W = 1280;
const MOBILE_W = 390;
const FRAME_H = 1800;
const FRAME_H_V3 = 3000;
const COL_GAP = 24;

const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-condensed)", textTransform: "uppercase",
  letterSpacing: 3, fontSize: 11, color: "var(--text-faint)",
};

export default function ProfileRedesignBoard() {
  return (
    <div className="pp-redesign" style={{ minHeight: "100vh", padding: "24px 32px 48px", background: "var(--bg-base)" }}>
      <header style={{ marginBottom: 28, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 16 }}>
        <div style={eyebrow}>OCE Inhouse · Player Profile Redesign · Decision Board</div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 38, margin: "6px 0 4px", color: "var(--text-main)" }}>
          Five Directions · plus v3 polish + 5 theme variants
        </h1>
        <p style={{ color: "var(--text-muted)", maxWidth: 920, margin: 0 }}>
          Each variant covers the full spec — pinned hero / match / achievement, customization (theme accent +
          frame swatches + animated frame), socials, AI scouting (Pro), achievements, MMR trajectory, top heroes,
          light/dark, and persona switching across Free / Pro / OG Pro. Toggle the persona pill inside any iframe
          to see the same layout respond to tier. The v3 polish row below shows the cinematic single-column profile
          with the cosmetic monetization surfaces wired up, and the 5 theme variants demonstrate the same component
          rendered through different palette/typography overrides.
        </p>
      </header>

      {/* Rationale row: A / B / C side by side */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: COL_GAP, marginBottom: 32 }}>
        {VARIANTS.map(v => (
          <div key={v.id} style={{
            border: "1px solid var(--border-strong)", borderRadius: 8, padding: 16,
            background: "var(--bg-card)",
          }}>
            <div style={{ ...eyebrow, color: "var(--accent-brass)", marginBottom: 4 }}>Variant {v.letter}</div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, margin: "0 0 4px", color: "var(--text-main)" }}>
              {v.title}
            </h2>
            <div style={{ ...eyebrow, marginBottom: 8 }}>{v.tagline}</div>
            <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 13, lineHeight: 1.55 }}>{v.rationale}</p>
          </div>
        ))}
      </section>

      {/* Desktop row: A / B / C at 1280 each */}
      <div style={{ ...eyebrow, marginBottom: 8 }}>Row 1 · Desktop · 1280 × {FRAME_H}</div>
      <section style={{ display: "flex", gap: COL_GAP, marginBottom: 40, overflowX: "auto", paddingBottom: 12 }}>
        {VARIANTS.map(v => (
          <figure key={v.id} style={{ margin: 0, flex: "0 0 auto" }}>
            <figcaption style={{ ...eyebrow, marginBottom: 6 }}>Variant {v.letter} — {v.title}</figcaption>
            <iframe
              title={`${v.id} desktop preview`}
              src={`${SANDBOX_BASE}/${v.id}`}
              style={{ width: DESKTOP_W, height: v.id === "MagazineSpreadV3" ? FRAME_H_V3 : FRAME_H, border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-card)", display: "block" }}
            />
          </figure>
        ))}
      </section>

      {/* Mobile row: A / B / C at 390 each */}
      <div style={{ ...eyebrow, marginBottom: 8 }}>Row 2 · Mobile · 390 × {FRAME_H}</div>
      <section style={{ display: "flex", gap: COL_GAP, overflowX: "auto", paddingBottom: 12, marginBottom: 40 }}>
        {VARIANTS.map(v => (
          <figure key={v.id} style={{ margin: 0, flex: "0 0 auto" }}>
            <figcaption style={{ ...eyebrow, marginBottom: 6 }}>Variant {v.letter} — {v.title}</figcaption>
            <iframe
              title={`${v.id} mobile preview`}
              src={`${SANDBOX_BASE}/${v.id}`}
              style={{ width: MOBILE_W, height: v.id === "MagazineSpreadV3" ? FRAME_H_V3 : FRAME_H, border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-card)", display: "block" }}
            />
          </figure>
        ))}
      </section>

      {/* === V3 polish + 5 theme variants === */}
      <header style={{ marginTop: 40, marginBottom: 18, borderTop: "1px solid var(--border-subtle)", paddingTop: 24 }}>
        <div style={{ ...eyebrow, color: "var(--accent-amber)" }}>Magazine Spread v3 · polish + cosmetic monetization · theme variants</div>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 28, margin: "6px 0 4px", color: "var(--text-main)" }}>
          v3 — same component, five theme overrides
        </h2>
        <p style={{ color: "var(--text-muted)", maxWidth: 1100, margin: 0, fontSize: 13 }}>
          The default <code>MagazineSpreadV3</code> includes an in-frame theme picker so you can flip palettes live;
          the five wrappers below each force a single theme via the <code>theme</code> prop so you can review them
          side-by-side at the same scroll depth.
        </p>
      </header>

      {/* V3 theme rationale row */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: COL_GAP, marginBottom: 24 }}>
        {V3_THEMES.map(t => (
          <div key={t.id} style={{
            border: "1px solid var(--border-strong)", borderRadius: 8, padding: 14,
            background: "var(--bg-card)",
          }}>
            <div style={{ ...eyebrow, color: "var(--accent-brass)", marginBottom: 4 }}>Theme · {t.id}</div>
            <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 18, margin: "0 0 6px", color: "var(--text-main)" }}>{t.label}</h3>
            <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 12, lineHeight: 1.5 }}>{t.rationale}</p>
          </div>
        ))}
      </section>

      {/* V3 theme desktop row */}
      <div style={{ ...eyebrow, marginBottom: 8 }}>Row 3 · Desktop · 1280 × {FRAME_H_V3} · v3 themes</div>
      <section style={{ display: "flex", gap: COL_GAP, overflowX: "auto", paddingBottom: 12, marginBottom: 32 }}>
        {V3_THEMES.map(t => (
          <figure key={t.id} style={{ margin: 0, flex: "0 0 auto" }}>
            <figcaption style={{ ...eyebrow, marginBottom: 6 }}>v3 — {t.label}</figcaption>
            <iframe
              title={`${t.component} desktop preview`}
              src={`${SANDBOX_BASE}/${t.component}`}
              style={{ width: DESKTOP_W, height: FRAME_H_V3, border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-card)", display: "block" }}
            />
          </figure>
        ))}
      </section>

      {/* V3 theme mobile row */}
      <div style={{ ...eyebrow, marginBottom: 8 }}>Row 4 · Mobile · 390 × {FRAME_H_V3} · v3 themes</div>
      <section style={{ display: "flex", gap: COL_GAP, overflowX: "auto", paddingBottom: 12 }}>
        {V3_THEMES.map(t => (
          <figure key={t.id} style={{ margin: 0, flex: "0 0 auto" }}>
            <figcaption style={{ ...eyebrow, marginBottom: 6 }}>v3 — {t.label}</figcaption>
            <iframe
              title={`${t.component} mobile preview`}
              src={`${SANDBOX_BASE}/${t.component}`}
              style={{ width: MOBILE_W, height: FRAME_H_V3, border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-card)", display: "block" }}
            />
          </figure>
        ))}
      </section>
    </div>
  );
}
