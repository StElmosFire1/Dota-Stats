// Shared homepage chrome for the Live Hub mockups — nav, footer, lower content.
// Styled to match oceinhouse.gg's dark navy theme (--bg-primary #0d1424, cards #152036).

export const C = {
  bg: "#0d1424",
  card: "#152036",
  hover: "#1a2744",
  border: "#233150",
  text: "#e8edf7",
  dim: "#8ea0c0",
  accent: "#5b9bd5",
  radiant: "#3fb37f",
  dire: "#e05d5d",
  gold: "#e8c15a",
};

export function Avatar({ name, hue, size = 36, dim = false }: { name: string; hue: number; size?: number; dim?: boolean }) {
  return (
    <div
      title={name}
      style={{
        width: size, height: size, borderRadius: "50%",
        background: dim ? "#1a2744" : `linear-gradient(135deg, hsl(${hue},45%,40%), hsl(${hue + 40},50%,28%))`,
        border: `2px solid ${dim ? "#233150" : "#3a4d78"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: dim ? "#3a4d78" : "#dfe8f7", fontWeight: 700, fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {dim ? "?" : name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function Nav({ liveBadge }: { liveBadge?: string }) {
  const links = ["Ladder", "Matches", "Head to Head", "Hall of Fame", "Games", "Shop"];
  return (
    <div style={{ background: "#0a101e", borderBottom: `1px solid ${C.border}`, padding: "0 28px", height: 58, display: "flex", alignItems: "center", gap: 26 }}>
      <div style={{ fontWeight: 800, letterSpacing: 1, color: C.text, fontSize: 17 }}>
        OCE <span style={{ color: C.accent }}>INHOUSE</span>
      </div>
      {links.map(l => (
        <span key={l} style={{ color: C.dim, fontSize: 13.5, fontWeight: 600 }}>{l}</span>
      ))}
      {liveBadge && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(224,93,93,.12)", border: "1px solid rgba(224,93,93,.4)", color: "#ff8484", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff5c5c", boxShadow: "0 0 8px #ff5c5c", display: "inline-block" }} />
          {liveBadge}
        </span>
      )}
      <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ color: C.gold, fontSize: 13, fontWeight: 700 }}>★ Pro</span>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 14px", color: C.text, fontSize: 13, fontWeight: 600 }}>
          Sign in with Steam
        </div>
      </div>
    </div>
  );
}

const recent = [
  { id: 1841, res: "Radiant", dur: "41:22", mvp: "frostbite", score: "34–21", ago: "2h ago" },
  { id: 1840, res: "Dire", dur: "52:07", mvp: "Kraken", score: "28–39", ago: "5h ago" },
  { id: 1839, res: "Radiant", dur: "33:45", mvp: "mango.dota", score: "31–14", ago: "yesterday" },
];

const ladder = [
  { r: 1, n: "Kraken", mmr: 4120, d: "+26" },
  { r: 2, n: "frostbite", mmr: 3980, d: "+31" },
  { r: 3, n: "mango.dota", mmr: 3875, d: "–18" },
  { r: 4, n: "Wisp", mmr: 3790, d: "+22" },
  { r: 5, n: "Duskbringer", mmr: 3711, d: "+9" },
];

export function LowerContent() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18, padding: "0 28px 28px" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Recent Matches</span>
          <span style={{ color: C.accent, fontSize: 12.5, fontWeight: 600 }}>View all →</span>
        </div>
        {recent.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px", borderRadius: 8, background: "#111a2e", marginBottom: 8 }}>
            <span style={{ color: m.res === "Radiant" ? C.radiant : C.dire, fontWeight: 800, fontSize: 12.5, width: 96 }}>
              {m.res.toUpperCase()} WIN
            </span>
            <span style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>#{m.id}</span>
            <span style={{ color: C.dim, fontSize: 12.5 }}>{m.score} kills · {m.dur}</span>
            <span style={{ color: C.gold, fontSize: 12.5 }}>MVP {m.mvp}</span>
            <span style={{ color: C.dim, fontSize: 12, marginLeft: "auto" }}>{m.ago}</span>
          </div>
        ))}
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Ladder — Season 8</span>
          <span style={{ color: C.accent, fontSize: 12.5, fontWeight: 600 }}>Full ladder →</span>
        </div>
        {ladder.map((p, i) => (
          <div key={p.n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 8, background: i % 2 ? "transparent" : "#111a2e" }}>
            <span style={{ color: i === 0 ? C.gold : C.dim, fontWeight: 800, fontSize: 13, width: 20 }}>{p.r}</span>
            <Avatar name={p.n} hue={p.n.length * 47} size={26} />
            <span style={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>{p.n}</span>
            <span style={{ marginLeft: "auto", color: C.text, fontSize: 13, fontWeight: 700 }}>{p.mmr}</span>
            <span style={{ color: p.d.startsWith("+") ? C.radiant : C.dire, fontSize: 12, width: 34, textAlign: "right" }}>{p.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
