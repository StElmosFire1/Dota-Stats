// Live Hub homepage — "Queue forming" state. The live band replaces the static hero.
import { C, Avatar, Nav, LowerContent } from "./_shared/HomeShell";

const inQueue = [
  { n: "Kraken", hue: 210, mmr: 4120 },
  { n: "frostbite", hue: 140, mmr: 3980 },
  { n: "mango.dota", hue: 30, mmr: 3875 },
  { n: "Wisp", hue: 280, mmr: 3790 },
  { n: "Duskbringer", hue: 0, mmr: 3711 },
  { n: "Pudgemancer", hue: 90, mmr: 3540 },
  { n: "tinker.tv", hue: 320, mmr: 3488 },
];

export function QueueForming() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "Inter, system-ui, sans-serif" }}>
      <Nav liveBadge="QUEUE 7/10" />

      {/* Live band */}
      <div style={{ margin: "22px 28px", borderRadius: 14, border: "1px solid rgba(91,155,213,.45)", background: "linear-gradient(135deg, #13203c 0%, #0f1830 60%, #101c36 100%)", boxShadow: "0 0 40px rgba(91,155,213,.12)", padding: "22px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#5b9bd5", boxShadow: "0 0 10px #5b9bd5", animation: "pulse 2s infinite" }} />
          <span style={{ color: C.text, fontWeight: 800, fontSize: 20, letterSpacing: .3 }}>QUEUE FORMING</span>
          <span style={{ color: C.accent, fontWeight: 800, fontSize: 20 }}>7/10</span>
          <span style={{ color: C.dim, fontSize: 13, marginLeft: 8 }}>3 more needed to launch</span>
          <button style={{ marginLeft: "auto", background: "linear-gradient(135deg,#3fb37f,#2d8f63)", border: "none", color: "#08120c", fontWeight: 800, fontSize: 15, padding: "12px 30px", borderRadius: 10, cursor: "pointer", boxShadow: "0 4px 18px rgba(63,179,127,.35)" }}>
            ▶ Join Queue
          </button>
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 20, alignItems: "center" }}>
          {inQueue.map(p => (
            <div key={p.n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 74 }}>
              <Avatar name={p.n} hue={p.hue} size={44} />
              <span style={{ color: C.text, fontSize: 11.5, fontWeight: 600, maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.n}</span>
              <span style={{ color: C.dim, fontSize: 10.5 }}>{p.mmr}</span>
            </div>
          ))}
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 74 }}>
              <Avatar name="?" hue={0} size={44} dim />
              <span style={{ color: "#3a4d78", fontSize: 11.5 }}>open slot</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 26, marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(91,155,213,.15)" }}>
          <span style={{ color: C.dim, fontSize: 12.5 }}>⏱ Queue open <b style={{ color: C.text }}>12 min</b></span>
          <span style={{ color: C.dim, fontSize: 12.5 }}>Avg MMR <b style={{ color: C.text }}>3,786</b></span>
          <span style={{ color: C.dim, fontSize: 12.5 }}>Projected balance <b style={{ color: C.radiant }}>±1.2%</b></span>
          <span style={{ color: C.dim, fontSize: 12.5, marginLeft: "auto" }}>Also joinable from Discord · one queue, two doors</span>
        </div>
      </div>

      <LowerContent />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
