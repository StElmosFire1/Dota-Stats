// Live Hub homepage — "Match live" state. The band shows the running game.
import { C, Avatar, Nav, LowerContent } from "./_shared/HomeShell";

const radiant = [
  { n: "Kraken", hero: "Storm Spirit", kda: "9/2/7", hue: 210 },
  { n: "Wisp", hero: "Io", kda: "1/4/18", hue: 280 },
  { n: "Pudgemancer", hero: "Pudge", kda: "5/6/11", hue: 90 },
  { n: "lastpick", hero: "Dazzle", kda: "2/3/15", hue: 180 },
  { n: "smurfhunter", hero: "Tiny", kda: "7/5/9", hue: 45 },
];
const dire = [
  { n: "frostbite", hero: "Invoker", kda: "8/4/6", hue: 140 },
  { n: "mango.dota", hero: "Juggernaut", kda: "6/5/4", hue: 30 },
  { n: "Duskbringer", hero: "Mars", kda: "3/6/10", hue: 0 },
  { n: "tinker.tv", hero: "Tinker", kda: "4/7/5", hue: 320 },
  { n: "wardbot", hero: "Crystal Maiden", kda: "0/8/14", hue: 250 },
];

function TeamCol({ side, players, color }: { side: string; players: typeof radiant; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ color, fontWeight: 800, fontSize: 13, letterSpacing: 1, marginBottom: 10 }}>{side}</div>
      {players.map(p => (
        <div key={p.n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
          <Avatar name={p.n} hue={p.hue} size={28} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 12.5, fontWeight: 600 }}>{p.n}</div>
            <div style={{ color: C.dim, fontSize: 11 }}>{p.hero}</div>
          </div>
          <span style={{ marginLeft: "auto", color: C.dim, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{p.kda}</span>
        </div>
      ))}
    </div>
  );
}

export function MatchLive() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <Nav liveBadge="MATCH LIVE" />

      <div style={{ margin: "22px 28px", borderRadius: 14, border: "1px solid rgba(224,93,93,.4)", background: "linear-gradient(135deg, #1c1626 0%, #121325 55%, #0f1830 100%)", boxShadow: "0 0 40px rgba(224,93,93,.10)", padding: "22px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5c5c", boxShadow: "0 0 10px #ff5c5c" }} />
          <span style={{ color: C.text, fontWeight: 800, fontSize: 20 }}>MATCH #1842 LIVE</span>
          <span style={{ color: C.dim, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>⏱ 23:41</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: C.radiant, fontWeight: 900, fontSize: 26 }}>24</span>
            <span style={{ color: C.dim, fontWeight: 700 }}>—</span>
            <span style={{ color: C.dire, fontWeight: 900, fontSize: 26 }}>19</span>
            <button style={{ background: "transparent", border: `1px solid ${C.accent}`, color: C.accent, fontWeight: 700, fontSize: 13.5, padding: "10px 22px", borderRadius: 10, cursor: "pointer" }}>
              Watch live page →
            </button>
          </div>
        </div>

        {/* net worth strip */}
        <div style={{ margin: "16px 0 18px", height: 8, borderRadius: 4, background: "#233150", overflow: "hidden", display: "flex" }}>
          <div style={{ width: "58%", background: "linear-gradient(90deg,#2d8f63,#3fb37f)" }} />
          <div style={{ flex: 1, background: "linear-gradient(90deg,#7a3030,#e05d5d)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: -12, marginBottom: 14 }}>
          <span style={{ color: C.radiant, fontSize: 11.5, fontWeight: 700 }}>+6.8k net worth</span>
          <span style={{ color: C.dim, fontSize: 11 }}>gold advantage</span>
        </div>

        <div style={{ display: "flex", gap: 40 }}>
          <TeamCol side="RADIANT · cap. Kraken" players={radiant} color={C.radiant} />
          <div style={{ width: 1, background: "rgba(255,255,255,.07)" }} />
          <TeamCol side="DIRE · cap. frostbite" players={dire} color={C.dire} />
        </div>

        <div style={{ display: "flex", gap: 26, marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.07)" }}>
          <span style={{ color: C.dim, fontSize: 12.5 }}>Draft: Captains Mode · Kraken first pick</span>
          <span style={{ color: C.dim, fontSize: 12.5 }}>Avg MMR <b style={{ color: C.text }}>3,786</b></span>
          <span style={{ color: C.dim, fontSize: 12.5, marginLeft: "auto" }}>When scored, this becomes the match page automatically</span>
        </div>
      </div>

      <LowerContent />
    </div>
  );
}
