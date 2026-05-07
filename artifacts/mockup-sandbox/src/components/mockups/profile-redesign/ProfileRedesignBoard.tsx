import "./_profile.css";

type Variant = {
  id: "TrophyWall" | "MagazineSpread" | "TacticalDossier";
  title: string;
  tagline: string;
  rationale: string;
};

const VARIANTS: Variant[] = [
  {
    id: "TrophyWall",
    title: "Trophy Wall",
    tagline: "Magazine hero header + right-rail trophy wall",
    rationale:
      "Treats the player like a champion. Big serif name lockup leads, AI Scouting and stat blocks fill the main column, and a right rail collects every Pinned thing (honor, signature hero, match) like trophies on a shelf. Pro upgrades the rail with the Cosmic frame on the signature hero portrait. Best for showing prestige + customization.",
  },
  {
    id: "MagazineSpread",
    title: "Magazine Spread",
    tagline: "Editorial two-column long-form",
    rationale:
      "Reads like a player feature in a print magazine. Left column is identity + customization controls; right column is a stack of long-form 'stories' (Latest Game, Current Form, AI Scouting, Trophy Cabinet, Hero Pool). Lock overlay over AI Scouting for free users sells Pro hard. Best when content depth matters more than dashboard density.",
  },
  {
    id: "TacticalDossier",
    title: "Tactical Dossier",
    tagline: "Esports roster card · grid of brass-ruled tiles",
    rationale:
      "Reads like a coach's scouting binder. Identity strip + grid of stat tiles, every tile brass-ruled. Pro upgrades existing tiles in place (PERF tile gains a chart, Scouting tile fills with copy) instead of unlocking new ones — feels like a single dossier that 'sharpens' with tier. Best for stat-driven users.",
  },
];

const SANDBOX_BASE = (() => {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const root = url.pathname.split("/__mockup")[0];
  return `${url.origin}${root}/__mockup/preview/profile-redesign`;
})();

export default function ProfileRedesignBoard() {
  return (
    <div className="pp-redesign" style={{ minHeight: "100vh", padding: "24px 32px 48px", background: "var(--bg-base)" }}>
      <header style={{ marginBottom: 28, borderBottom: "1px solid var(--border-subtle)", paddingBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-condensed)", textTransform: "uppercase", letterSpacing: 4, fontSize: 11, color: "var(--text-faint)" }}>
          OCE Inhouse · Player Profile Redesign
        </div>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 38, margin: "6px 0 4px", color: "var(--text-main)" }}>
          Three Directions for the Profile Page
        </h1>
        <p style={{ color: "var(--text-muted)", maxWidth: 880, margin: 0 }}>
          Each variant covers the full spec — pinned hero / pinned match / pinned achievement, customization
          (theme accent + frame swatches + animated frame), socials, AI scouting (Pro), achievements,
          MMR trajectory, top heroes, light/dark theme, and persona switching across Free / Pro / OG Pro.
          Open any iframe and toggle the persona pill to see how the same layout responds to tier.
        </p>
      </header>

      {VARIANTS.map(v => (
        <section key={v.id} style={{ marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 28, margin: 0, color: "var(--text-main)" }}>{v.title}</h2>
            <span style={{ fontFamily: "var(--font-condensed)", textTransform: "uppercase", letterSpacing: 2, fontSize: 12, color: "var(--accent-brass)" }}>
              {v.tagline}
            </span>
          </div>
          <p style={{ color: "var(--text-muted)", margin: "0 0 16px", maxWidth: 920 }}>{v.rationale}</p>

          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <figure style={{ margin: 0 }}>
              <figcaption style={{ fontFamily: "var(--font-condensed)", textTransform: "uppercase", letterSpacing: 2, fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                Desktop · 1280 × 1800
              </figcaption>
              <iframe
                title={`${v.id} desktop preview`}
                src={`${SANDBOX_BASE}/${v.id}`}
                style={{ width: 1280, height: 1800, border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-card)" }}
              />
            </figure>
            <figure style={{ margin: 0 }}>
              <figcaption style={{ fontFamily: "var(--font-condensed)", textTransform: "uppercase", letterSpacing: 2, fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                Mobile · 390 × 1800
              </figcaption>
              <iframe
                title={`${v.id} mobile preview`}
                src={`${SANDBOX_BASE}/${v.id}`}
                style={{ width: 390, height: 1800, border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--bg-card)" }}
              />
            </figure>
          </div>
        </section>
      ))}
    </div>
  );
}
