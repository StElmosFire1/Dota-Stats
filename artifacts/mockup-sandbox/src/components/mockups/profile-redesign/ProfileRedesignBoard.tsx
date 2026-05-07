import "./_profile.css";

type Variant = {
  letter: "A" | "B" | "C" | "B2";
  id: "TrophyWall" | "MagazineSpread" | "TacticalDossier" | "MagazineSpreadV2";
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
    letter: "C",
    id: "TacticalDossier",
    title: "Tactical Dossier",
    tagline: "Esports roster card · grid of brass-ruled tiles",
    rationale:
      "Reads like a coach's scouting binder. Identity strip + grid of brass-ruled stat tiles. Pro upgrades existing tiles in place (PERF tile gains a chart, Scouting tile fills with copy) instead of unlocking new ones — feels like a single dossier that 'sharpens' with tier. Best for stat-driven users.",
  },
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
          Four Directions, Side by Side
        </h1>
        <p style={{ color: "var(--text-muted)", maxWidth: 920, margin: 0 }}>
          Each variant covers the full spec — pinned hero / match / achievement, customization (theme accent +
          frame swatches + animated frame), socials, AI scouting (Pro), achievements, MMR trajectory, top heroes,
          light/dark, and persona switching across Free / Pro / OG Pro. Toggle the persona pill inside any iframe
          to see the same layout respond to tier.
        </p>
      </header>

      {/* Rationale row: A / B / C side by side */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: COL_GAP, marginBottom: 32 }}>
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
              style={{ width: DESKTOP_W, height: FRAME_H, border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-card)", display: "block" }}
            />
          </figure>
        ))}
      </section>

      {/* Mobile row: A / B / C at 390 each */}
      <div style={{ ...eyebrow, marginBottom: 8 }}>Row 2 · Mobile · 390 × {FRAME_H}</div>
      <section style={{ display: "flex", gap: COL_GAP, overflowX: "auto", paddingBottom: 12 }}>
        {VARIANTS.map(v => (
          <figure key={v.id} style={{ margin: 0, flex: "0 0 auto" }}>
            <figcaption style={{ ...eyebrow, marginBottom: 6 }}>Variant {v.letter} — {v.title}</figcaption>
            <iframe
              title={`${v.id} mobile preview`}
              src={`${SANDBOX_BASE}/${v.id}`}
              style={{ width: MOBILE_W, height: FRAME_H, border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-card)", display: "block" }}
            />
          </figure>
        ))}
      </section>
    </div>
  );
}
