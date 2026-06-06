import "./_group.css";
import {
  Radio,
  LayoutGrid,
  Activity,
  Swords,
  Trophy,
  Flame,
  ListOrdered,
  Coffee,
  History,
  Copy,
  Check,
  Eye,
  EyeOff,
  Monitor,
  ChevronRight,
} from "lucide-react";

const INK = "#0d1424";
const SURFACE = "#131c30";
const SURFACE_2 = "#1a2438";
const BRASS = "#c5a975";
const AMBER = "#f59e0b";
const PARCH = "#f5efe2";
const LINE = "rgba(245,239,226,0.10)";
const MUTED = "rgba(245,239,226,0.55)";

type OverlayDef = {
  key: string;
  name: string;
  icon: any;
  hint: string;
  status?: "new";
};

const OVERLAYS: OverlayDef[] = [
  { key: "live", name: "Live Lobby", icon: Radio, hint: "Current match state" },
  { key: "scoreboard", name: "Scoreboard", icon: LayoutGrid, hint: "Compact 5v5 snapshot" },
  { key: "ticker", name: "Player Ticker", icon: Activity, hint: "MMR · W/L · streak" },
  { key: "draft", name: "Draft", icon: Swords, hint: "Picks, bans, counters", status: "new" },
  { key: "recap", name: "Match Recap", icon: Trophy, hint: "Post-game KDA + MMR Δ", status: "new" },
  { key: "streak", name: "Streak / Hype", icon: Flame, hint: "Win-streak callouts", status: "new" },
  { key: "leaderboard", name: "Leaderboard", icon: ListOrdered, hint: "Season standings", status: "new" },
  { key: "brb", name: "Starting Soon", icon: Coffee, hint: "BRB / intermission", status: "new" },
  { key: "recent", name: "Recent Matches", icon: History, hint: "Last games strip", status: "new" },
];

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-[7px]">
      <span className="ss-body text-[13px]" style={{ color: on ? PARCH : MUTED }}>
        {label}
      </span>
      <div
        className="relative rounded-full transition-colors"
        style={{
          width: 38,
          height: 21,
          background: on ? AMBER : "rgba(245,239,226,0.14)",
          boxShadow: on ? "0 0 10px rgba(245,158,11,0.35)" : "none",
        }}
      >
        <div
          className="absolute rounded-full transition-all"
          style={{
            width: 15,
            height: 15,
            top: 3,
            left: on ? 20 : 3,
            background: on ? INK : PARCH,
          }}
        />
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: any }) {
  return (
    <div
      className="ss-cond uppercase tracking-[0.18em] text-[10px] mb-2"
      style={{ color: BRASS }}
    >
      {children}
    </div>
  );
}

function StreamTickerPreview() {
  return (
    <div
      className="flex items-stretch overflow-hidden"
      style={{
        width: 430,
        borderRadius: 12,
        background: "linear-gradient(180deg, rgba(13,20,36,0.96), rgba(13,20,36,0.88))",
        border: `1px solid ${BRASS}`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ width: 4, background: AMBER }} />
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 48,
            height: 48,
            borderRadius: 8,
            background: SURFACE_2,
            border: `1px solid ${LINE}`,
            color: BRASS,
          }}
        >
          <span className="ss-serif text-[22px]" style={{ color: BRASS }}>MD</span>
        </div>
        <div className="leading-tight">
          <div className="ss-serif text-[17px]" style={{ color: PARCH }}>
            Majin Dabura
          </div>
          <div className="ss-cond uppercase tracking-[0.14em] text-[10px]" style={{ color: BRASS }}>
            Ancient III · OCE Inhouse
          </div>
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4 pr-4 pl-2">
        <div className="text-center">
          <div className="ss-num text-[22px] leading-none" style={{ color: PARCH }}>5,420</div>
          <div className="ss-cond uppercase tracking-[0.12em] text-[9px]" style={{ color: MUTED }}>MMR</div>
        </div>
        <div className="text-center">
          <div className="ss-num text-[22px] leading-none" style={{ color: PARCH }}>
            38<span style={{ color: MUTED }}>/</span>21
          </div>
          <div className="ss-cond uppercase tracking-[0.12em] text-[9px]" style={{ color: MUTED }}>W / L</div>
        </div>
        <div
          className="flex items-center gap-1 px-2 py-1 rounded-md"
          style={{ background: "rgba(245,158,11,0.14)", border: `1px solid ${AMBER}` }}
        >
          <Flame className="w-3.5 h-3.5" style={{ color: AMBER }} />
          <span className="ss-num text-[14px]" style={{ color: AMBER }}>W4</span>
        </div>
      </div>
    </div>
  );
}

export function StreamStudio() {
  const sizePresets = ["50%", "100%", "Fit"];
  const activeSize = "100%";

  return (
    <div
      className="ss-body min-h-screen w-full flex flex-col"
      style={{ background: INK, color: PARCH }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${LINE}`, background: "rgba(19,28,48,0.6)" }}
      >
        <div>
          <div className="ss-cond uppercase tracking-[0.22em] text-[11px]" style={{ color: BRASS }}>
            OCE Inhouse · Streaming
          </div>
          <h1 className="ss-serif text-[26px] leading-tight" style={{ color: PARCH }}>
            Stream Studio
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="ss-cond uppercase tracking-[0.14em] text-[10px] px-2.5 py-1 rounded-full"
            style={{ color: AMBER, border: `1px solid ${AMBER}`, background: "rgba(245,158,11,0.08)" }}
          >
            Full Edition
          </span>
          <div
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full"
            style={{ background: SURFACE, border: `1px solid ${LINE}` }}
          >
            <div
              className="flex items-center justify-center"
              style={{ width: 26, height: 26, borderRadius: "50%", background: SURFACE_2, color: BRASS }}
            >
              <span className="ss-serif text-[13px]">MD</span>
            </div>
            <span className="text-[13px]" style={{ color: PARCH }}>Majin Dabura</span>
          </div>
        </div>
      </header>

      {/* Body: 3 columns */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT — overlay picker */}
        <aside
          className="shrink-0 px-3 py-4 overflow-y-auto"
          style={{ width: 236, borderRight: `1px solid ${LINE}`, background: "rgba(19,28,48,0.35)" }}
        >
          <SectionLabel>Overlays</SectionLabel>
          <div className="flex flex-col gap-1">
            {OVERLAYS.map((o) => {
              const active = o.key === "ticker";
              const Icon = o.icon;
              return (
                <div
                  key={o.key}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer"
                  style={{
                    background: active ? "rgba(197,169,117,0.14)" : "transparent",
                    borderLeft: active ? `3px solid ${BRASS}` : "3px solid transparent",
                  }}
                >
                  <Icon className="w-4 h-4 shrink-0" style={{ color: active ? AMBER : BRASS }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[13px] truncate"
                        style={{ color: active ? PARCH : "rgba(245,239,226,0.82)" }}
                      >
                        {o.name}
                      </span>
                      {o.status === "new" && (
                        <span
                          className="ss-cond uppercase tracking-wider text-[8px] px-1 py-[1px] rounded"
                          style={{ color: INK, background: AMBER }}
                        >
                          New
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] truncate" style={{ color: MUTED }}>
                      {o.hint}
                    </div>
                  </div>
                  {active && <ChevronRight className="w-3.5 h-3.5" style={{ color: BRASS }} />}
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTER — live preview */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* toolbar */}
          <div
            className="flex items-center justify-between px-5 py-2.5"
            style={{ borderBottom: `1px solid ${LINE}` }}
          >
            <div className="flex items-center gap-2">
              <span className="ss-cond uppercase tracking-[0.14em] text-[10px]" style={{ color: MUTED }}>
                Preview
              </span>
              <div
                className="flex items-center rounded-md overflow-hidden"
                style={{ border: `1px solid ${LINE}` }}
              >
                {sizePresets.map((s) => (
                  <span
                    key={s}
                    className="ss-body text-[12px] px-2.5 py-1"
                    style={{
                      background: s === activeSize ? BRASS : "transparent",
                      color: s === activeSize ? INK : MUTED,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: MUTED }}>
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: "#22c55e", boxShadow: "0 0 8px #22c55e" }}
              />
              Live data · refreshes every 10s
            </div>
          </div>

          {/* stream canvas */}
          <div className="flex-1 flex items-center justify-center p-7">
            <div
              className="ss-check relative w-full"
              style={{
                maxWidth: 760,
                aspectRatio: "16 / 9",
                borderRadius: 14,
                border: `1px solid ${LINE}`,
                background: "rgba(8,12,22,0.7)",
              }}
            >
              <span
                className="absolute top-3 left-3 ss-cond uppercase tracking-[0.16em] text-[9px] px-2 py-1 rounded"
                style={{ color: MUTED, background: "rgba(13,20,36,0.7)" }}
              >
                1920 × 1080 · transparent
              </span>
              {/* the overlay positioned where it sits on stream */}
              <div className="absolute left-5 bottom-5">
                <StreamTickerPreview />
              </div>
            </div>
          </div>
          <div className="px-7 pb-5 -mt-2 text-center text-[11px]" style={{ color: MUTED }}>
            This is exactly what OBS will capture — drag the source to reposition in your scene.
          </div>
        </main>

        {/* RIGHT — settings */}
        <aside
          className="shrink-0 px-4 py-4 overflow-y-auto"
          style={{ width: 312, borderLeft: `1px solid ${LINE}`, background: "rgba(19,28,48,0.35)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" style={{ color: AMBER }} />
            <h2 className="ss-serif text-[18px]" style={{ color: PARCH }}>Player Ticker</h2>
          </div>

          <div className="mb-5">
            <SectionLabel>Modules</SectionLabel>
            <Toggle on label="Show MMR" />
            <Toggle on label="Show W / L record" />
            <Toggle on={false} label="Show win rate %" />
            <Toggle on label="Show win streak" />
            <Toggle on label="Show rank medal" />
            <Toggle on={false} label="Show region" />
          </div>

          <div className="mb-5" style={{ borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
            <SectionLabel>Appearance</SectionLabel>
            <div className="py-1.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px]" style={{ color: PARCH }}>Size</span>
                <span className="ss-num text-[13px]" style={{ color: BRASS }}>100%</span>
              </div>
              <div className="relative h-1.5 rounded-full" style={{ background: "rgba(245,239,226,0.12)" }}>
                <div className="absolute left-0 top-0 h-1.5 rounded-full" style={{ width: "62%", background: BRASS }} />
                <div
                  className="absolute rounded-full"
                  style={{ width: 14, height: 14, top: -4, left: "60%", background: PARCH, border: `2px solid ${BRASS}` }}
                />
              </div>
            </div>
            <Toggle on label="Transparent background" />
            <div className="flex items-center justify-between py-[7px]">
              <span className="text-[13px]" style={{ color: PARCH }}>Refresh rate</span>
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px]"
                style={{ background: SURFACE, border: `1px solid ${LINE}`, color: PARCH }}
              >
                10 seconds
                <ChevronRight className="w-3 h-3 rotate-90" style={{ color: MUTED }} />
              </div>
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
            <SectionLabel>Privacy</SectionLabel>
            <Toggle on={false} label="Hide MMR" />
            <Toggle on={false} label="Hide region" />
            <div className="py-[7px]">
              <span className="text-[13px] block mb-1.5" style={{ color: PARCH }}>Display alias</span>
              <div
                className="flex items-center gap-2 px-2.5 py-2 rounded-md"
                style={{ background: SURFACE, border: `1px solid ${LINE}` }}
              >
                <EyeOff className="w-3.5 h-3.5" style={{ color: MUTED }} />
                <span className="text-[12.5px]" style={{ color: MUTED }}>Off — show Steam name</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom bar — browser source URL */}
      <footer
        className="flex items-center gap-4 px-6 py-3.5"
        style={{ borderTop: `1px solid ${LINE}`, background: "rgba(19,28,48,0.6)" }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <Monitor className="w-4 h-4" style={{ color: BRASS }} />
          <span className="ss-cond uppercase tracking-[0.14em] text-[10px]" style={{ color: MUTED }}>
            OBS Browser Source
          </span>
        </div>
        <div
          className="flex-1 flex items-center px-3 py-2 rounded-md overflow-hidden"
          style={{ background: INK, border: `1px solid ${LINE}` }}
        >
          <span className="ss-num text-[12.5px] truncate" style={{ color: "rgba(245,239,226,0.8)" }}>
            https://oceinhouse.gg/overlay/ticker/35944021?mmr=1&wl=1&streak=1&medal=1&size=100&refresh=10
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-md shrink-0 cursor-pointer"
          style={{ background: BRASS, color: INK }}
        >
          <Copy className="w-3.5 h-3.5" />
          <span className="text-[13px] font-semibold">Copy URL</span>
        </div>
        <div className="shrink-0 text-right">
          <div className="ss-num text-[13px]" style={{ color: PARCH }}>480 × 140</div>
          <div className="ss-cond uppercase tracking-[0.12em] text-[9px]" style={{ color: MUTED }}>
            Recommended size
          </div>
        </div>
      </footer>
    </div>
  );
}
