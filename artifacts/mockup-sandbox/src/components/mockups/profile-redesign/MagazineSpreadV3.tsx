import React, { useState, useEffect, useRef, useMemo } from "react";
import "./_profile.css";
import "./_magazinespread.css";
import "./_magazinespreadv2.css";
import "./_magazinespreadv3.css";
import {
  PERSONAS, EXTRAS, V3_EXTRAS, heroImg, fmtDuration, fmtDate,
  type Persona, type ShopItem, type CareerTile,
} from "./_mockProfile";
import {
  Moon, Sun, ArrowLeft, Twitch, Youtube, Gamepad2, Settings2, Star, Unlock, Eye, Sparkles,
  Activity, Trophy, Gamepad, Layers, Users, Swords, Search, BarChart3, Clock, Package, ListOrdered,
  TrendingUp, TrendingDown, Lock, Crosshair, ChevronRight, ChevronUp, ChevronDown, X, Play,
  Megaphone, Award, ShoppingBag, Music, Brush, Link2,
} from "lucide-react";
import { LineChart, Line, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

const POS_LABEL = ["", "Carry", "Mid", "Off", "Soft Sup", "Hard Sup"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["00–06", "06–12", "12–18", "18–24"];

function heatColor(wr: number): string {
  if (wr < 0) return "var(--bg-elev)";
  const t = Math.max(0, Math.min(100, wr)) / 100;
  if (t < 0.5) {
    const k = t / 0.5;
    return `rgb(${Math.round(248+(245-248)*k)},${Math.round(113+(158-113)*k)},${Math.round(113+(11-113)*k)})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgb(${Math.round(245+(52-245)*k)},${Math.round(158+(211-158)*k)},${Math.round(11+(153-11)*k)})`;
}

type MuSortKey = "delta" | "with_wr" | "vs_wr" | "name";
type ThemeId = "default" | "newsprint" | "carbon" | "holo" | "heritage" | "broadcast";
type CoverVariant = "backdrop" | "split" | "minimal";
type CoverFx = "none" | "shimmer" | "kenburns" | "grain" | "noir" | "vignette" | "scanlines";
type WindowKey = "10" | "30" | "season" | "alltime";
type ShopCat = "all" | "frame" | "voice" | "achievement-border" | "cover-fx" | "vanity" | "season-wrapped" | "verified";

const THEMES: Array<{ id: ThemeId; label: string }> = [
  { id: "default",   label: "Court & Pitch" },
  { id: "newsprint", label: "Newsprint" },
  { id: "carbon",    label: "Carbon" },
  { id: "holo",      label: "Holographic" },
  { id: "heritage",  label: "Heritage" },
  { id: "broadcast", label: "Broadcast" },
];

const COVER_FX_OPTIONS: Array<{ id: CoverFx; label: string; pro?: boolean; oneOff?: boolean }> = [
  { id: "none",      label: "None" },
  { id: "shimmer",   label: "Shimmer (PRO + one-off)", pro: true,  oneOff: true },
  { id: "kenburns",  label: "Ken Burns (PRO)",          pro: true },
  { id: "grain",     label: "Film Grain (one-off)",     oneOff: true },
  { id: "noir",      label: "Noir (PRO + one-off)",     pro: true, oneOff: true },
  { id: "vignette",  label: "Vignette" },
  { id: "scanlines", label: "Scanlines (PRO)",          pro: true },
];

// Sparkline path generator — values can be in any range; we normalise.
function sparkPath(values: number[], width = 64, height = 22, pad = 2): { d: string; cx: number; cy: number } {
  if (!values.length) return { d: "", cx: 0, cy: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points = values.map((v, i) => {
    const x = pad + (i / Math.max(1, values.length - 1)) * innerW;
    const y = pad + (1 - (v - min) / span) * innerH;
    return [x, y] as const;
  });
  const d = points.reduce((acc, [x, y], i) => acc + `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `, "");
  const [cx, cy] = points[points.length - 1];
  return { d, cx, cy };
}

function Sparkline({ values, color }: { values: number[]; color?: string }) {
  const { d, cx, cy } = sparkPath(values);
  return (
    <svg className="v3-vital-spark" viewBox="0 0 64 22" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} style={color ? { stroke: color } : undefined} />
      <circle cx={cx} cy={cy} r={1.6} />
    </svg>
  );
}

interface MagazineSpreadV3Props { theme?: ThemeId }

export function MagazineSpreadV3({ theme: themeProp = "default" }: MagazineSpreadV3Props = {}) {
  const [isLight, setIsLight] = useState(false);
  const [persona, setPersona] = useState<Persona>("pro");
  const [muSort, setMuSort] = useState<MuSortKey>("delta");
  const [muDir, setMuDir] = useState<"asc" | "desc">("desc");
  const [activeTheme, setActiveTheme] = useState<ThemeId>(themeProp);
  // Keep theme in sync when prop changes (wrapper-driven previews stay deterministic).
  useEffect(() => { setActiveTheme(themeProp); }, [themeProp]);
  const [coverVariant, setCoverVariant] = useState<CoverVariant>("backdrop");
  const [coverFx, setCoverFx] = useState<CoverFx>("none");
  const [timeWindow, setTimeWindow] = useState<WindowKey>("30");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shopCat, setShopCat] = useState<ShopCat>("all");
  const [stickyVisible, setStickyVisible] = useState(false);
  const [wrappedVisible, setWrappedVisible] = useState(true);

  const coverRef = useRef<HTMLElement | null>(null);

  const p = PERSONAS[persona];
  const x = EXTRAS[persona];
  const v3 = V3_EXTRAS[persona];
  const isFree = persona === "free";
  const isOG = persona === "ogpro";
  const c = p.customization;
  const ex = c.extras;

  // Reset cover-fx when persona changes so we honour per-persona owned/locked state cleanly.
  useEffect(() => {
    if (persona === "ogpro") setCoverFx(ex.frame_animated ? "shimmer" : "kenburns");
    else if (persona === "pro") setCoverFx(ex.frame_animated ? "shimmer" : "none");
    else setCoverFx("none");
  }, [persona, ex.frame_animated]);

  // Sticky header reveal: hide while cover is in view; show once it's scrolled past.
  useEffect(() => {
    if (!coverRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-60px 0px 0px 0px" },
    );
    io.observe(coverRef.current);
    return () => io.disconnect();
  }, []);

  const themeClass = isLight ? "theme-light" : "theme-dark";
  const themeVariantClass = activeTheme === "default" ? "" : `v3-theme-${activeTheme}`;
  const accent = c.theme_accent || "#c5a975";

  const mmrData = p.mmrHistory.map((val, idx) => ({ match: idx + 1, mmr: val }));
  const wrData = x.rollingWR.map((val, idx) => ({ match: idx + 1, wr: val }));

  const sortedMatchups = useMemo(() => [...x.heroMatchups].sort((a, b) => {
    let av: number | string, bv: number | string;
    if (muSort === "delta")        { av = a.with_wr - a.vs_wr; bv = b.with_wr - b.vs_wr; }
    else if (muSort === "name")    { av = a.name; bv = b.name; }
    else if (muSort === "with_wr") { av = a.with_wr; bv = b.with_wr; }
    else                           { av = a.vs_wr;  bv = b.vs_wr;  }
    if (av < bv) return muDir === "asc" ? -1 : 1;
    if (av > bv) return muDir === "asc" ? 1 : -1;
    return 0;
  }), [x.heroMatchups, muSort, muDir]);
  const toggleMu = (k: MuSortKey) => {
    if (muSort === k) setMuDir(d => d === "asc" ? "desc" : "asc");
    else { setMuSort(k); setMuDir("desc"); }
  };
  const muArrow = (k: MuSortKey) =>
    muSort !== k ? null : (muDir === "asc" ? <ChevronUp className="w-3 h-3 v2-sort-arrow" /> : <ChevronDown className="w-3 h-3 v2-sort-arrow" />);

  const recentTotal = p.recent.wins + p.recent.losses;
  const recentWR = recentTotal ? Math.round((p.recent.wins / recentTotal) * 100) : 0;
  const lastWR = x.rollingWR[x.rollingWR.length - 1];
  const tw = v3.timeWindow[timeWindow];

  const visiblePins = isFree ? v3.pinnedAchievementsList.slice(0, 1) : v3.pinnedAchievementsList.slice(0, 3);
  const pinSlots = (isFree ? 1 : 3) - visiblePins.length;

  // Filter shop by tab
  const filteredShop = useMemo(() => {
    if (shopCat === "all") return v3.shop;
    return v3.shop.filter(s => s.category === shopCat);
  }, [v3.shop, shopCat]);

  // Compare quota for free
  const compareQuotaLeft = Math.max(0, v3.compare.freeDailyLimit - v3.compare.freeUsedToday);

  // Anchor sections list (anchor nav)
  const sections: Array<{ id: string; label: string; pro?: boolean }> = [
    { id: "latest",      label: "Latest Game" },
    { id: "numbers",     label: "By the Numbers" },
    { id: "heroes",      label: "Hero Pool" },
    { id: "matches",     label: "Recent Matches" },
    { id: "scout",       label: "AI Scout", pro: true },
    { id: "allies",      label: "Allies & Enemies", pro: true },
    { id: "perf",        label: "Performance Lab", pro: true },
    { id: "trophies",    label: "Trophy Cabinet" },
    { id: "wrapped",     label: "Season Wrapped" },
    { id: "shop",        label: "OG Shop" },
    { id: "custom",      label: "Customization" },
  ];

  // Header vital sparklines: pull series from V3 extras
  const sparkSeries: Record<string, number[]> = {
    MMR: v3.formSparks.mmr,
    "Recent WR": v3.formSparks.wr,
    KDA: v3.formSparks.kda,
    "GPM / XPM": v3.formSparks.gpm,
    PERF: v3.formSparks.perf,
  };

  return (
    <div
      className={`pp-redesign magazine-layout magazine-v3 ${themeClass} ${themeVariantClass}`}
      style={{ "--theme-accent": accent } as React.CSSProperties}
    >
      {/* ───── Sticky mini-header (appears after cover scrolls away) ───── */}
      <div className={`v3-sticky ${stickyVisible ? "is-visible" : ""}`}>
        <img src={heroImg(p.pinnedHero.hero_id)} alt="" className="v3-sticky-portrait" />
        <span className="v3-sticky-name">{p.display_name}</span>
        <span className="v3-sticky-vital">MMR <b>{p.rank.mmr}</b></span>
        <span className="v3-sticky-vital">WR <b style={{ color: recentWR >= 50 ? "var(--radiant)" : "var(--dire)" }}>{recentWR}%</b></span>
        <span className="v3-sticky-vital hidden md:inline-flex">PERF <b>{p.perf_avg.toFixed(1)}</b></span>
        <div className="v3-sticky-spacer" />
        <button className="v3-sticky-cta" onClick={() => setDrawerOpen(true)}><Swords className="w-3 h-3" /> Compare</button>
        {isFree && <button className="v3-sticky-cta is-primary"><Star className="w-3 h-3" /> Go Pro</button>}
      </div>

      {/* Header Lockup */}
      <header className="magazine-header">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <img src="/__mockup/images/oa-logo.png" alt="OA" className="h-8 w-auto" />
            <div className="flex flex-col leading-none">
              <span className="font-serif font-bold text-xl" style={{ color: 'var(--text-main)' }}>OCE</span>
              <span className="font-condensed font-medium tracking-[0.2em] text-xs" style={{ color: 'var(--accent-amber)' }}>INHOUSE</span>
            </div>
          </div>
          <div className="hidden md:block w-px h-6 bg-[var(--border-subtle)]" />
          <a href="#" className="hidden md:flex items-center gap-2 font-condensed uppercase tracking-wider text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
            <ArrowLeft className="w-4 h-4" /> Leaderboard
          </a>
          <span className="hidden md:inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)', border: '1px solid rgba(245,158,11,0.4)' }}>v3</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="mag-persona-switcher hidden sm:flex">
            <button className={`mag-persona-btn ${persona === "free" ? "active" : ""}`} onClick={() => setPersona("free")}>Free</button>
            <button className={`mag-persona-btn ${persona === "pro" ? "active" : ""}`} onClick={() => setPersona("pro")}>Pro</button>
            <button className={`mag-persona-btn ${persona === "ogpro" ? "active" : ""}`} onClick={() => setPersona("ogpro")}>OG Pro</button>
          </div>
          <button onClick={() => setIsLight(!isLight)} className="p-2 rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]">
            {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Persona Switcher */}
      <div className="flex sm:hidden mag-persona-switcher justify-center py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
        <button className={`mag-persona-btn ${persona === "free" ? "active" : ""}`} onClick={() => setPersona("free")}>Free</button>
        <button className={`mag-persona-btn ${persona === "pro" ? "active" : ""}`} onClick={() => setPersona("pro")}>Pro</button>
        <button className={`mag-persona-btn ${persona === "ogpro" ? "active" : ""}`} onClick={() => setPersona("ogpro")}>OG Pro</button>
      </div>

      {/* §0 — CINEMATIC COVER BANNER */}
      <section ref={coverRef as React.RefObject<HTMLElement>} className={`v3-cover cover-${coverVariant} fx-${coverFx}`}>
        <img src={heroImg(p.pinnedHero.hero_id)} alt="" className="v3-cover-bg" />
        <div className="v3-cover-overlay" />
        <div className="v3-cover-inner">
          <div className="v3-cover-eyebrow">
            <span>Player Profile</span>
            <span className="v3-dot">·</span>
            <span>Pinned Hero · {p.pinnedHero.name}</span>
            {p.is_pro && <><span className="v3-dot">·</span><span style={{ color: 'var(--accent-amber)' }}>★ PRO</span></>}
            <span className={`v3-live-chip kind-${v3.liveStatus.kind}`}>
              <span className="v3-live-dot" /> {v3.liveStatus.label}
              {v3.liveStatus.sinceMin != null && <span style={{ opacity: 0.7 }}>· {v3.liveStatus.sinceMin}m</span>}
            </span>
          </div>

          <h1 className="v3-cover-name">
            {p.display_name}
            {v3.verified.has && <span className="v3-verified" title={v3.verified.reason || "Verified"}>✓</span>}
            {v3.foundersPass.eligible && v3.foundersPass.activeNow && (
              <span className="v3-founders" title={`Founders Pass · ${v3.foundersPass.seasonLabel}`}>★ Founders</span>
            )}
            {v3.hofPlaque.has && (
              <a href="#trophies" className="v3-hof-badge" title={`${v3.hofPlaque.year} · ${v3.hofPlaque.reason || ""}`}>
                🏛 Hall of Fame · {v3.hofPlaque.year}
              </a>
            )}
          </h1>

          {c.custom_title && (
            <div className="v3-cover-title" style={{ color: accent }}>{c.custom_title}</div>
          )}

          {v3.vanitySlug.current && (
            <div className="v3-cover-slug">
              oceinhouse.gg/u/<b>{v3.vanitySlug.current}</b>
              {v3.vanitySlug.isThreeLetter && <span className="v3-vanity-tag">3-letter</span>}
            </div>
          )}

          <div className="v3-cover-flair">
            <span className="v3-pos-pill">POS {p.primary_pos} · {POS_LABEL[p.primary_pos]}</span>
            {(ex.flair_override || p.flairAuto) && (
              <span className="v3-flair-pill" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}>
                ✦ {ex.flair_override || p.flairAuto}
              </span>
            )}
            {ex.show_streak && p.streak && Math.abs(p.streak) >= 3 && (
              <span className="v3-flair-pill" style={{ background: p.streak > 0 ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)", color: p.streak > 0 ? "#4ade80" : "#fb7185", border: `1px solid ${p.streak > 0 ? "#22c55e" : "#ef4444"}66` }}>
                {p.streak > 0 ? '🔥' : '❄️'} {Math.abs(p.streak)} {p.streak > 0 ? 'WIN STREAK' : 'LOSS STREAK'}
              </span>
            )}
            {v3.spotlight.active && (
              <span className="v3-flair-pill" style={{ background: "rgba(245,158,11,0.2)", color: "var(--accent-amber)", border: "1px solid var(--accent-amber)" }}>
                <Megaphone className="w-3 h-3" /> Featured · {v3.spotlight.viewersToday?.toLocaleString()} views today
              </span>
            )}
          </div>

          {c.bio && <div className="v3-cover-bio">"{c.bio}"</div>}

          {/* Vital stats strip with sparklines */}
          <div className="v3-cover-vitals">
            {([
              { lbl: "MMR",        val: p.rank.mmr.toLocaleString(),                                  sub: `Peak ${p.rank.peak}`,                                                  series: sparkSeries.MMR,        color: "var(--accent-brass)" },
              { lbl: "Recent WR",  val: `${recentWR}%`,                                               sub: `${p.recent.wins}W · ${p.recent.losses}L`,                              series: sparkSeries["Recent WR"], color: recentWR >= 50 ? "var(--radiant)" : "var(--dire)" },
              { lbl: "KDA",        val: p.recent.kda.toFixed(2),                                     sub: "last 30 games",                                                       series: sparkSeries.KDA,        color: "#fff" },
              { lbl: "GPM / XPM",  val: `${p.recent.gpm} / ${p.recent.xpm}`,                          sub: "avg per game",                                                        series: sparkSeries["GPM / XPM"], color: "#fff" },
              { lbl: "PERF",       val: <>{p.perf_avg.toFixed(1)}<span className="v3-vital-suffix">/10</span></>, sub: "role-adjusted",                                                    series: sparkSeries.PERF,       color: "var(--accent-amber)" },
            ]).map((v, i, arr) => (
              <React.Fragment key={v.lbl}>
                <div className="v3-vital">
                  <div className="v3-vital-lbl">{v.lbl}</div>
                  <div className="v3-vital-val" style={{ color: v.color }}>{v.val}</div>
                  <div className="v3-vital-sub">{v.sub}</div>
                  <Sparkline values={v.series} color={v.color} />
                </div>
                {i < arr.length - 1 && <div className="v3-vital-sep" />}
              </React.Fragment>
            ))}
          </div>

          <div className="v3-cover-socials">
            {ex.social_twitch && <a href={ex.social_twitch} className="mag-social-chip"><Twitch className="w-3 h-3"/> Twitch</a>}
            {ex.social_youtube && <a href={ex.social_youtube} className="mag-social-chip"><Youtube className="w-3 h-3"/> YouTube</a>}
            {ex.social_steam && <a href={ex.social_steam} className="mag-social-chip"><Gamepad2 className="w-3 h-3"/> Steam</a>}
          </div>
        </div>
      </section>

      {/* §0.5 — Pinned-achievement ribbon (1 free / 3 Pro) */}
      <div className="v3-pin-ribbon">
        <div className="v3-pin-ribbon-inner">
          {visiblePins.map((pin, i) => (
            <div key={i} className={`v3-pin-tile ${pin.border ? `border-${pin.border}` : ""}`}>
              <div className="v3-pin-tile-icon">{pin.emoji}</div>
              <div>
                <div className="v3-pin-tile-label">{pin.label}</div>
                <div className="v3-pin-tile-sub">{pin.sub}</div>
              </div>
            </div>
          ))}
          {Array.from({ length: pinSlots }).map((_, i) => (
            <button key={`slot-${i}`} className={`v3-pin-tile v3-pin-tile-add ${isFree ? "is-locked" : ""}`}>
              + Pin Achievement {isFree && i === 0 ? "· PRO unlocks 3 slots" : ""}
            </button>
          ))}
        </div>
      </div>

      {/* §0.75 — Anchor nav */}
      <nav className="v3-anchor-nav">
        <div className="v3-anchor-nav-inner">
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} className={`v3-anchor-pill ${s.pro ? "is-pro" : ""}`}>
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Stacked full-width body */}
      <div className="v3-body">

        {/* §1 — Latest Game */}
        <article id="latest" className="mag-story">
          <div className="mag-eyebrow"><Gamepad2 className="w-4 h-4"/> Latest Game</div>
          <h2 className="mag-title">The Showdown</h2>
          <div className="mag-pinned-match mt-6">
            <div className={`mag-match-result ${p.pinnedMatch.player_won ? 'win' : 'loss'}`}>
              {p.pinnedMatch.player_won ? 'WIN' : 'LOSS'}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-end mb-2 flex-wrap gap-2">
                <div className="font-serif font-bold text-lg text-[var(--text-main)]">As {p.pinnedMatch.hero}</div>
                <div className="font-condensed text-sm text-[var(--text-muted)]">{fmtDuration(p.pinnedMatch.duration)} • Match #{p.pinnedMatch.match_id}</div>
              </div>
              <div className="flex gap-6 font-condensed text-lg flex-wrap">
                <div><span className="text-[var(--text-muted)] text-xs uppercase mr-2 tracking-widest">Score</span> <span className="font-bold text-[var(--radiant)]">{p.pinnedMatch.radiantScore}</span> <span className="text-[var(--text-faint)]">-</span> <span className="font-bold text-[var(--dire)]">{p.pinnedMatch.direScore}</span></div>
                <div><span className="text-[var(--text-muted)] text-xs uppercase mr-2 tracking-widest">KDA</span> <span className="font-bold text-[var(--text-main)]">{p.pinnedMatch.kills}/{p.pinnedMatch.deaths}/{p.pinnedMatch.assists}</span></div>
              </div>
            </div>
            <img src={heroImg(p.pinnedMatch.hero_id)} alt="" className="w-16 h-16 object-cover rounded shadow-md" />
          </div>

          {/* AI commentary pull-quote */}
          {v3.aiQuote && (
            <div className="v3-ai-quote mt-6">
              {v3.aiQuote}
              <span className="v3-ai-quote-attr">Grok · post-match commentary</span>
            </div>
          )}
        </article>

        {/* §2 — By The Numbers */}
        <article id="numbers" className="mag-story">
          <div className="mag-eyebrow flex items-center gap-3 flex-wrap"><Activity className="w-4 h-4"/> Current Form
            <span className="v3-window-pills">
              {(["10","30","season","alltime"] as WindowKey[]).map(w => {
                const isLockedW = isFree && (w === "season" || w === "alltime");
                return (
                  <button
                    key={w}
                    className={`v3-window-pill ${timeWindow === w ? "is-active" : ""} ${isLockedW ? "is-locked" : ""}`}
                    onClick={() => { if (!isLockedW) setTimeWindow(w); }}
                    title={isLockedW ? "Pro unlocks Season + All-time windows" : undefined}
                  >
                    {w === "10" ? "10g" : w === "30" ? "30g" : w === "season" ? "Season" : "All-time"}
                  </button>
                );
              })}
            </span>
          </div>
          <h2 className="mag-title">By The Numbers</h2>
          <p className="mag-subtitle">
            Window: <strong>{timeWindow === "10" ? "Last 10" : timeWindow === "30" ? "Last 30" : timeWindow === "season" ? `Season — ${tw.games}g` : `All-time — ${tw.games.toLocaleString()}g`}</strong>
            {tw.games > 0 && <> · WR <strong>{tw.wr}%</strong> · KDA <strong>{tw.kda.toFixed(2)}</strong> · GPM <strong>{tw.gpm}</strong> · PERF <strong>{tw.perf.toFixed(1)}</strong></>}
          </p>

          {/* MMR + Rolling WR side by side */}
          <div className="v2-block grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="v2-rolling-card">
              <div className="flex justify-between items-baseline mb-3">
                <div>
                  <div className="font-serif font-bold text-base text-[var(--text-main)]">MMR Trajectory</div>
                  <div className="font-condensed text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Peak: {p.rank.peak}</div>
                </div>
                <div className="font-condensed text-2xl font-bold text-[var(--accent-brass)]">{p.rank.mmr}</div>
              </div>
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mmrData}>
                    <Line type="monotone" dataKey="mmr" stroke={accent} strokeWidth={2.5} dot={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} labelStyle={{ display: 'none' }} itemStyle={{ color: 'var(--text-main)', fontFamily: 'Oswald, sans-serif', fontWeight: 'bold' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="v2-rolling-card">
              <div className="flex justify-between items-baseline mb-3">
                <div>
                  <div className="font-serif font-bold text-base text-[var(--text-main)]">Rolling Win Rate</div>
                  <div className="font-condensed text-[10px] text-[var(--text-muted)] uppercase tracking-widest">10-game window</div>
                </div>
                <div className="font-condensed text-2xl font-bold" style={{ color: lastWR >= 50 ? 'var(--radiant)' : 'var(--dire)' }}>{lastWR}%</div>
              </div>
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={wrData}>
                    <defs>
                      <linearGradient id="wrFillV3" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="var(--radiant)" stopOpacity={0.45}/>
                        <stop offset="100%" stopColor="var(--radiant)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="wr" stroke="var(--radiant)" strokeWidth={2} fill="url(#wrFillV3)" />
                    <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-subtle)', borderRadius: 4 }} labelStyle={{ display: 'none' }} itemStyle={{ color: 'var(--text-main)', fontFamily: 'Oswald, sans-serif', fontWeight: 'bold' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Per-position breakdown */}
          <div className="v2-block">
            <div className="v2-mini-eyebrow"><Layers className="w-3 h-3"/> Per-position breakdown</div>
            <div className="v2-pos-strip">
              {x.positions.map(pos => {
                const wr = pos.games ? Math.round((pos.wins / pos.games) * 100) : 0;
                const isPrimary = pos.pos === p.primary_pos;
                return (
                  <div key={pos.pos} className={`v2-pos-cell ${isPrimary ? 'is-primary' : ''}`}>
                    <div className="v2-pos-label">P{pos.pos} · {POS_LABEL[pos.pos]}</div>
                    <div className="v2-pos-games">{pos.games}g</div>
                    <div className="v2-pos-wr">{pos.games ? `${wr}% WR` : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="v2-insight">
            <span><strong>{p.display_name}</strong> averages <strong>{x.statAvg.heroDmg.toLocaleString()}</strong> hero damage per game across {recentTotal} matches — {p.primary_pos === 2 ? 'classic mid-lane carry profile.' : p.primary_pos <= 2 ? 'a textbook core impact line.' : 'a high-utility support footprint.'}</span>
          </div>

          <div className="v2-block">
            <div className="v2-mini-eyebrow"><BarChart3 className="w-3 h-3"/> Full stat averages · per game</div>
            <div className="v2-stat-strip">
              {([
                { lbl: "LH",        v: x.statAvg.lh,           emph: p.primary_pos <= 2 },
                { lbl: "DN",        v: x.statAvg.dn,           emph: false },
                { lbl: "Hero Dmg",  v: x.statAvg.heroDmg.toLocaleString(),  emph: p.primary_pos === 2 },
                { lbl: "Tower Dmg", v: x.statAvg.towerDmg.toLocaleString(), emph: p.primary_pos <= 2 },
                { lbl: "Healing",   v: x.statAvg.healing.toLocaleString(),  emph: p.primary_pos === 5 },
                { lbl: "Stuns (s)", v: x.statAvg.stuns.toFixed(1), emph: p.primary_pos >= 4 },
                { lbl: "Wards",     v: x.statAvg.wards,          emph: p.primary_pos >= 4 },
                { lbl: "Camps",     v: x.statAvg.campsStacked.toFixed(1), emph: p.primary_pos === 4 },
                { lbl: "Runes",     v: x.statAvg.runes,          emph: p.primary_pos === 2 },
              ]).map(s => (
                <div key={s.lbl} className={`v2-stat-strip-row ${s.emph ? 'is-emph' : ''}`}>
                  <span className="lbl">{s.lbl}</span>
                  <span className="val">{s.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Career Highlights ribbon — replaces the orphan multi-kill row */}
          <div className="v2-block mt-4">
            <div className="v2-mini-eyebrow"><Trophy className="w-3 h-3"/> Career Highlights · best of all time</div>
            <div className="v3-highlight-grid">
              {v3.careerHighlights.map((tile: CareerTile) => (
                <div key={tile.kind} className={`v3-highlight-tile ${tile.rare ? "is-rare" : ""}`}>
                  <div className="v3-highlight-val">{tile.value}</div>
                  <div className="v3-highlight-lbl">{tile.label}</div>
                  {tile.sub && <div className="v3-highlight-sub">{tile.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        </article>

        {/* §3 — Top Heroes Showcase */}
        {ex.show_top_heroes && p.topHeroes.length > 0 && (
          <article id="heroes" className="mag-story">
            <div className="mag-eyebrow"><Star className="w-4 h-4"/> Hero Pool</div>
            <h2 className="mag-title">Most Played</h2>
            <p className="mag-subtitle">Top {Math.min(5, p.topHeroes.length)} most-played heroes · last 30 days · hover for recent form{!isFree && " + matchup deltas"}</p>

            <div className="v3-hero-showcase">
              {p.topHeroes.slice(0, 5).map(h => {
                const wr = Math.round((h.wins / h.games) * 100);
                const hover = v3.heroHover[h.hero_id];
                return (
                  <div key={h.hero_id} className="v3-hero-card">
                    <img src={heroImg(h.hero_id)} alt={h.name} className="v3-hero-portrait" />
                    <div className="v3-hero-meta">
                      <div className="v3-hero-name">{h.name}</div>
                      <div className="v3-hero-stats">
                        <span><span className="lbl">WR</span><span className="val" style={{ color: wr >= 55 ? 'var(--radiant)' : 'var(--text-main)' }}>{wr}%</span></span>
                        <span><span className="lbl">G</span><span className="val">{h.games}</span></span>
                        <span><span className="lbl">KDA</span><span className="val">{h.kda.toFixed(2)}</span></span>
                      </div>
                    </div>
                    {hover && (
                      <div className="v3-hero-hover">
                        <div className="v3-hero-hover-row">
                          <span className="v3-hero-hover-lbl">Recent</span>
                          <span className="v3-hero-dots">
                            {hover.recentResults.slice(0, 10).map((win, i) => (
                              <span key={i} className={`v3-hero-dot ${win ? "win" : ""}`} />
                            ))}
                          </span>
                        </div>
                        <div className="v3-hero-hover-row">
                          <span className="v3-hero-hover-lbl">Top items</span>
                          <span className="v3-hero-hover-items">
                            {hover.topItems.map(it => <span key={it} className="v3-hero-hover-item">{it}</span>)}
                          </span>
                        </div>
                        {!isFree && hover.withWr != null && (
                          <div className="v3-hero-hover-row">
                            <span className="v3-hero-hover-lbl">Synergy</span>
                            <span className="v3-hero-hover-pro">w/ <b>{hover.withWr}%</b> · vs <b>{hover.vsWr}%</b></span>
                          </div>
                        )}
                        {isFree && (
                          <div className="v3-hero-hover-row">
                            <span className="v3-hero-hover-lbl">Synergy</span>
                            <span className="v3-hero-hover-pro" style={{ color: "var(--text-faint)" }}>🔒 Pro unlocks w/vs</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        )}

        {/* §4 — Recent Matches */}
        <article id="matches" className="mag-story">
          <div className="mag-eyebrow"><Gamepad className="w-4 h-4"/> Recent Matches</div>
          <h2 className="mag-title">The Last Ten</h2>
          <p className="mag-subtitle">Newest first · MMR change column shown for Pro viewers</p>

          <div className="v2-matches-grid mt-4">
            {x.recentMatches.map(m => (
              <a key={m.match_id} href={`#match-${m.match_id}`} className="v2-match-row">
                <span className={`v2-mr-tag ${m.won ? 'win' : 'loss'}`}>{m.won ? 'W' : 'L'}</span>
                <img src={heroImg(m.hero_id)} alt={m.hero} />
                <div className="v2-mr-hero truncate">{m.hero}</div>
                <div className="v2-mr-kda">{m.k}/{m.d}/{m.a}</div>
                <div className="v2-mr-dur">{fmtDuration(m.duration)}</div>
                <div className="v2-mr-date">{fmtDate(m.start_time)}</div>
                {isFree ? (
                  <div className="v2-mr-mmr text-[var(--text-faint)]" title="Pro only">🔒</div>
                ) : (
                  <div className={`v2-mr-mmr ${m.mmr_delta >= 0 ? 'up' : 'down'}`}>{m.mmr_delta >= 0 ? '+' : ''}{m.mmr_delta}</div>
                )}
                <ChevronRight className="v2-mr-link w-3.5 h-3.5" />
              </a>
            ))}
          </div>

          <a href="#all-matches" className="v2-view-all">
            View All Matches <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </article>

        {/* §5 — AI Scout (Pro) */}
        <ProSection
          id="scout"
          isFree={isFree}
          eyebrow={<><Eye className="w-4 h-4"/> AI Scout Report</>}
          title={`The Book on ${p.display_name}`}
          unlockTitle="Unlock AI Scouting"
          unlockSub="Pro members read the AI scout on every player in the league."
        >
          <div className="bg-[var(--bg-elev)] border border-[var(--border-subtle)] p-6 rounded-lg mt-4 relative">
            <div className="font-serif italic text-lg text-[var(--text-main)] leading-relaxed border-l-4 border-[var(--accent-brass)] pl-5 mb-6">
              "{p.scouting.tldr}"
            </div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <h4 className="font-condensed text-xs font-bold uppercase tracking-widest text-[var(--radiant)] mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--radiant)]"></span> Strengths
                </h4>
                <ul className="space-y-2">
                  {p.scouting.strengths.map((s, i) => (
                    <li key={i} className="text-[var(--text-main)] text-sm border-b border-[var(--border-subtle)] pb-2 last:border-0">{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-condensed text-xs font-bold uppercase tracking-widest text-[var(--dire)] mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--dire)]"></span> Weaknesses
                </h4>
                <ul className="space-y-2">
                  {p.scouting.weaknesses.map((w, i) => (
                    <li key={i} className="text-[var(--text-main)] text-sm border-b border-[var(--border-subtle)] pb-2 last:border-0">{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </ProSection>

        {/* §6 — Allies & Enemies (Pro) */}
        <ProSection
          id="allies"
          isFree={isFree}
          eyebrow={<><Users className="w-4 h-4"/> Allies & Enemies</>}
          title="Who Lifts You, Who Sinks You"
          unlockTitle="Unlock Synergy Data"
          unlockSub="See your best & worst teammates and run head-to-head comparisons."
        >
          <div className="v2-ally-cols mt-4">
            <div>
              <div className="v2-mini-eyebrow"><TrendingUp className="w-3 h-3"/> Best Allies · 5+ games</div>
              {x.bestAllies.map(a => {
                const wr = Math.round((a.wins / a.games) * 100);
                return (
                  <div key={a.steam_id} className="v2-ally-row up">
                    <img src={`https://api.dicebear.com/9.x/identicon/svg?seed=${a.steam_id}&backgroundColor=152036`} className="w-8 h-8 rounded" alt="" />
                    <div className="v2-ally-name truncate">{a.name}</div>
                    <div className="v2-ally-games">{a.games}g</div>
                    <div className="v2-ally-wr">{wr}%</div>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="v2-mini-eyebrow"><TrendingDown className="w-3 h-3"/> Worst Allies · 5+ games</div>
              {x.worstAllies.map(a => {
                const wr = Math.round((a.wins / a.games) * 100);
                return (
                  <div key={a.steam_id} className="v2-ally-row down">
                    <img src={`https://api.dicebear.com/9.x/identicon/svg?seed=${a.steam_id}&backgroundColor=152036`} className="w-8 h-8 rounded" alt="" />
                    <div className="v2-ally-name truncate">{a.name}</div>
                    <div className="v2-ally-games">{a.games}g</div>
                    <div className="v2-ally-wr">{wr}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="v2-block">
            <div className="v2-mini-eyebrow"><Swords className="w-3 h-3"/> Head-to-head</div>
            <div className="v2-h2h-search">
              <Search className="w-4 h-4" />
              <span className="v2-h2h-fake-input">Compare {p.display_name} vs another player…</span>
              <button className="cta-secondary text-xs px-3 py-1" onClick={() => setDrawerOpen(true)}>Compare</button>
            </div>
          </div>
        </ProSection>

        {/* §7 — Performance Lab (Pro) */}
        <ProSection
          id="perf"
          isFree={isFree}
          eyebrow={<><Activity className="w-4 h-4"/> Performance Lab</>}
          title="Where Performance Comes From"
          unlockTitle="Unlock Performance Lab"
          unlockSub="PERF deltas, hero matchups, schedule heatmap and build trends."
        >
          <div className="v2-block">
            <div className="v2-mini-eyebrow"><Sparkles className="w-3 h-3"/> PERF breakdown · vs role baseline</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div>
                <div className="text-[10px] font-condensed uppercase tracking-widest text-[var(--radiant)] mb-1">Helped most</div>
                {x.perfHelped.map(s => (
                  <div key={s.label} className="v2-perf-row up">
                    <span className="v2-perf-lbl">{s.label}</span>
                    <div className="v2-perf-bar"><span className="v2-perf-fill pos" style={{ width: `${Math.min(50, Math.abs(s.delta))}%` }} /></div>
                    <span className="v2-perf-val">+{s.delta}%</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] font-condensed uppercase tracking-widest text-[var(--dire)] mb-1">Hurt most</div>
                {x.perfHurt.map(s => (
                  <div key={s.label} className="v2-perf-row down">
                    <span className="v2-perf-lbl">{s.label}</span>
                    <div className="v2-perf-bar"><span className="v2-perf-fill neg" style={{ width: `${Math.min(50, Math.abs(s.delta))}%` }} /></div>
                    <span className="v2-perf-val">{s.delta}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="v2-rule" />

          <div className="v2-block">
            <div className="v2-mini-eyebrow"><Trophy className="w-3 h-3"/> Hero matchups · 5+ games</div>
            <table className="v2-mu-table">
              <thead>
                <tr>
                  <th className={`sortable ${muSort === 'name' ? 'is-sorted' : ''}`}    onClick={() => toggleMu('name')}>Hero {muArrow('name')}</th>
                  <th className={`sortable ${muSort === 'with_wr' ? 'is-sorted' : ''}`} onClick={() => toggleMu('with_wr')}>With {muArrow('with_wr')}</th>
                  <th className={`sortable ${muSort === 'vs_wr' ? 'is-sorted' : ''}`}   onClick={() => toggleMu('vs_wr')}>Vs {muArrow('vs_wr')}</th>
                  <th className={`sortable ${muSort === 'delta' ? 'is-sorted' : ''}`}   onClick={() => toggleMu('delta')}>Δ {muArrow('delta')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedMatchups.map(h => {
                  const delta = h.with_wr - h.vs_wr;
                  const wrCls = (wr: number) => wr >= 60 ? 'good' : wr <= 45 ? 'bad' : 'mid';
                  return (
                    <tr key={h.hero_id}>
                      <td><img src={heroImg(h.hero_id)} alt="" />{h.name}</td>
                      <td><span className={`wr ${wrCls(h.with_wr)}`}>{h.with_wr}%</span> <span className="text-[var(--text-faint)] text-[10px]">/{h.with_games}g</span></td>
                      <td><span className={`wr ${wrCls(h.vs_wr)}`}>{h.vs_wr}%</span> <span className="text-[var(--text-faint)] text-[10px]">/{h.vs_games}g</span></td>
                      <td><span className={`wr ${delta >= 10 ? 'good' : delta <= -10 ? 'bad' : 'mid'}`}>{delta >= 0 ? '+' : ''}{delta}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="v2-rule" />

          <div className="v2-block">
            <div className="v2-mini-eyebrow"><Clock className="w-3 h-3"/> When you win · weekday × time-of-day</div>
            <div className="v2-heat-grid">
              <div></div>
              {HOURS.map(h => <div key={h} className="v2-heat-head">{h}</div>)}
              {x.heatmap.map((row, di) => (
                <React.Fragment key={DAYS[di]}>
                  <div className="v2-heat-row-lbl">{DAYS[di]}</div>
                  {row.map((wr, hi) => (
                    <div key={hi} className={`v2-heat-cell ${wr < 0 ? 'empty' : ''}`} style={{ background: heatColor(wr) }} title={`${DAYS[di]} ${HOURS[hi]} · ${wr < 0 ? 'no games' : wr + '% WR'}`}>
                      {wr < 0 ? '·' : `${wr}%`}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="v2-rule" />

          <div className="v2-block grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="v2-mini-eyebrow"><Package className="w-3 h-3"/> {p.pinnedHero.name} · most-built items</div>
              <div className="v2-build-list">
                {x.buildTrends.items.map(it => (
                  <div key={it.name} className="v2-build-row">
                    <span className="v2-build-name">{it.name}</span>
                    <div className="v2-build-bar"><div className="v2-build-fill" style={{ width: `${it.pct}%` }} /></div>
                    <span className="v2-build-pct">{it.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="v2-mini-eyebrow"><ListOrdered className="w-3 h-3"/> Skill order · level 1-17</div>
              <div className="v2-skill-order">
                {x.buildTrends.skillOrder.map((s, i) => (
                  <div key={i} className={`v2-skill-pip ${s.toLowerCase()}`} title={`Lv ${i+1}`}>{s}</div>
                ))}
              </div>
            </div>
          </div>
        </ProSection>

        {/* §8 — Trophy Cabinet */}
        <article id="trophies" className="mag-story">
          <div className="mag-eyebrow"><Trophy className="w-4 h-4"/> Achievement Spotlight</div>
          <h2 className="mag-title">Trophy Cabinet</h2>
          <p className="mag-subtitle">Pinned and recent honors</p>

          {p.pinnedAchievement && (
            <div className="bg-gradient-to-r from-[var(--bg-card)] to-transparent border border-[var(--border-subtle)] border-l-4 border-l-[var(--accent-amber)] p-6 rounded mb-6 flex items-center gap-6">
              <div className="text-5xl">{p.pinnedAchievement.emoji}</div>
              <div>
                <div className="font-condensed text-xs uppercase tracking-widest text-[var(--accent-amber)] mb-1">Featured</div>
                <h3 className="font-serif text-2xl font-bold text-[var(--text-main)]">{p.pinnedAchievement.label}</h3>
                <div className="text-[var(--text-muted)] text-sm mt-1">{p.pinnedAchievement.sub}</div>
              </div>
            </div>
          )}

          <div className="mag-achievements-grid">
            {p.achievements.map((a, i) => (
              <div key={i} className={`mag-achievement ${a.rarity === 'legendary' ? 'border-[var(--accent-amber)] shadow-[0_0_15px_rgba(245,158,11,0.15)]' : ''}`}>
                <div className="mag-achievement-icon">{a.emoji}</div>
                <div className="mag-achievement-title">{a.label}</div>
                <div className="mag-achievement-sub">{a.sub}</div>
              </div>
            ))}
          </div>
        </article>

        {/* §9 — Season Wrapped */}
        {wrappedVisible && (
          <article id="wrapped" className="mag-story">
            <div className="mag-eyebrow"><Award className="w-4 h-4"/> Year in Review</div>
            <div className="v3-wrapped">
              <div className="v3-wrapped-head">
                <div>
                  <div className="v3-wrapped-title">{v3.seasonWrapped.season} · Wrapped</div>
                  <div className="v3-wrapped-meta">Auto-hides {v3.seasonWrapped.autoExpiresInDays} days after season end · profile-only · no Discord post</div>
                </div>
                <button className="cta-secondary text-xs px-3 py-1" onClick={() => setWrappedVisible(false)}>Hide on my profile</button>
              </div>
              <div className="v3-wrapped-grid">
                {v3.seasonWrapped.items.map(item => (
                  <div key={item.label} className="v3-wrapped-item">
                    <div className="v3-w-lbl">{item.label}</div>
                    <div className="v3-w-val">{item.value}</div>
                    {item.sub && <div className="v3-w-sub">{item.sub}</div>}
                  </div>
                ))}
              </div>
              <div className="v3-wrapped-foot">
                <span>Export the poster:</span>
                <button className="cta-secondary text-xs px-3 py-1">
                  <Brush className="w-3 h-3" /> Download Wrapped poster · $1.99 one-off
                </button>
                <span className="text-[var(--text-faint)]">No card placement on Discord — your call to share.</span>
              </div>
            </div>
          </article>
        )}
        {!wrappedVisible && (
          <article className="mag-story" id="wrapped">
            <div className="mag-eyebrow"><Award className="w-4 h-4"/> Year in Review</div>
            <p className="mag-subtitle">
              Hidden from your profile.{" "}
              <button className="text-[var(--accent-amber)] underline underline-offset-2" onClick={() => setWrappedVisible(true)}>Show {v3.seasonWrapped.season} Wrapped</button>
            </p>
          </article>
        )}

        {/* §10 — OG Cosmetic Shop */}
        <article id="shop" className="mag-story">
          <div className="mag-eyebrow"><ShoppingBag className="w-4 h-4"/> Cosmetic Shop · One-off Purchases</div>
          <h2 className="mag-title">OG Cosmetics</h2>
          <p className="mag-subtitle">
            Buy individual items without subscribing. Items marked <span className="text-[var(--accent-amber)] font-bold">PRO-only</span> need an active Pro subscription on top.
            {isOG && " As an OG founder, you already own most of these — your collection is shown as Owned."}
          </p>

          <div className="v3-shop-tabs mt-3">
            {([
              { id: "all",                label: "All" },
              { id: "frame",              label: "Frames" },
              { id: "voice",              label: "Voice Packs" },
              { id: "achievement-border", label: "Trophy Borders" },
              { id: "cover-fx",           label: "Cover FX" },
              { id: "vanity",             label: "Vanity URLs" },
              { id: "season-wrapped",     label: "Season Wrapped" },
              { id: "verified",           label: "Verified" },
            ] as Array<{ id: ShopCat; label: string }>).map(t => (
              <button key={t.id} className={`v3-shop-tab ${shopCat === t.id ? "is-active" : ""}`} onClick={() => setShopCat(t.id)}>{t.label}</button>
            ))}
          </div>

          <div className="v3-shop-grid">
            {filteredShop.map((s: ShopItem) => (
              <div key={s.id} className={`v3-shop-card tier-${s.tier} ${s.owned ? "is-owned" : ""}`}>
                <div className="v3-shop-name">{s.name}</div>
                <div className="v3-shop-blurb">{s.blurb}</div>
                {s.proGate && <div className="v3-shop-pro-flag">★ Requires active Pro</div>}
                <div className="v3-shop-meta">
                  <div>
                    <div className="v3-shop-tier">{s.tier}</div>
                    <div className="v3-shop-price">{s.price}</div>
                  </div>
                  <button className={`v3-shop-buy ${s.owned ? "is-disabled" : ""}`} disabled={s.owned}>
                    {s.owned ? "Owned" : s.price === "Auction" ? "Bid" : "Buy"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* §11 — Customization */}
        <article id="custom" className="mag-story">
          <div className="mag-eyebrow"><Settings2 className="w-4 h-4"/> Customization</div>
          <h2 className="mag-title">Make It Yours</h2>
          <div className="v3-custom-grid">

            {/* Theme accent + auto-tint */}
            <div className="v3-custom-cell">
              <span className="lbl">Theme Accent</span>
              <div className="v3-swatch-row">
                {["#3b82f6", "#f59e0b", "#ef4444", "#10b981", "#a78bfa", "#c5a975"].map(color => (
                  <button key={color} className={`v3-swatch ${color === accent ? "is-active" : ""}`} style={{ background: color }} title={color} />
                ))}
                <button className="v3-swatch is-locked" title="Auto-tint from pinned hero portrait (PRO)">
                  <Sparkles className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[10px] text-[var(--text-faint)]">Pro: auto-tint from pinned hero portrait, or pick custom hex.</div>
            </div>

            {/* Profile frame */}
            <div className="v3-custom-cell">
              <span className="lbl">Profile Frame</span>
              <div className="v3-frame-row">
                {([
                  { id: "none",   label: "None",   pro: false, owned: true },
                  { id: "silver", label: "Silver", pro: false, owned: true },
                  { id: "gold",   label: "Gold",   pro: true,  owned: !isFree },
                  { id: "cosmic", label: "Cosmic", pro: false, owned: !isFree, oneOff: true },
                  { id: "fire",   label: "Fire",   pro: false, owned: isOG,    oneOff: true },
                  { id: "neon",   label: "Neon",   pro: true,  owned: false,   oneOff: true },
                ]).map(f => (
                  <span key={f.id} className={`v3-frame-pill ${c.profile_frame === f.id ? "is-active" : ""} ${!f.owned ? "is-locked" : ""}`}>
                    {f.label}{!f.owned && (f.pro ? " 🔒P" : " 🔒")}
                  </span>
                ))}
              </div>
            </div>

            {/* Cover variant */}
            <div className="v3-custom-cell">
              <span className="lbl">Cover Layout</span>
              <div className="v3-cover-variant-picker">
                {(["backdrop","split","minimal"] as CoverVariant[]).map(cv => (
                  <button key={cv} className={`v3-cover-variant-btn ${coverVariant === cv ? "is-active" : ""}`} onClick={() => setCoverVariant(cv)}>{cv}</button>
                ))}
              </div>
            </div>

            {/* Cover FX */}
            <div className="v3-custom-cell is-pro">
              <span className="lbl">Cover FX</span>
              <select
                className="v3-fx-select"
                value={coverFx}
                onChange={e => setCoverFx(e.target.value as CoverFx)}
              >
                {COVER_FX_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <div className="text-[10px] text-[var(--text-faint)]">Free has Vignette only. Other effects are Pro and/or one-off purchases.</div>
            </div>

            {/* Vanity URL */}
            <div className="v3-custom-cell">
              <span className="lbl">Vanity URL <Link2 className="w-3 h-3 inline-block ml-1 text-[var(--text-faint)]" /></span>
              <div className="v3-vanity-row">
                <span>oceinhouse.gg/u/</span>
                <input value={v3.vanitySlug.desired || ""} readOnly />
              </div>
              {v3.vanitySlug.isThreeLetter ? (
                <div className="text-[10px] text-[var(--accent-amber)]">3-letter slugs are auctioned. {v3.vanitySlug.auctionPrice}</div>
              ) : (
                <div className="text-[10px] text-[var(--text-faint)]">4+ char slugs: $9.99 one-off. 3-letter slugs go up for auction.</div>
              )}
            </div>

            {/* Voice pack */}
            <div className="v3-custom-cell">
              <span className="lbl"><Music className="w-3 h-3 inline-block mr-1" /> Entrance Sting</span>
              <div className="v3-voice-list">
                {v3.voicePacks.options.slice(0, 4).map(v => (
                  <div key={v.id} className={`v3-voice-row ${v.id === v3.voicePacks.currentId ? "is-active" : ""}`}>
                    <div>
                      <div className="v3-voice-label">{v.label}</div>
                      <div className="v3-voice-blurb">{v.blurb}</div>
                    </div>
                    <div className="v3-voice-meta">
                      <span className={`v3-voice-source source-${v.source}`}>{v.source}</span>
                      {v.locked && <Lock className="w-3 h-3 text-[var(--accent-amber)]" />}
                      <button className="v3-voice-play" title="Preview"><Play className="w-2.5 h-2.5" /></button>
                    </div>
                  </div>
                ))}
                <div className="text-[10px] text-[var(--text-faint)]">Curated Dota voicelines + medieval stings only. No custom uploads.</div>
              </div>
            </div>

            {/* Profile Spotlight */}
            <div className="v3-custom-cell">
              <span className="lbl"><Megaphone className="w-3 h-3 inline-block mr-1" /> Profile Spotlight</span>
              <div className={`v3-spotlight-card ${v3.spotlight.active ? "is-active" : ""}`}>
                <div className="v3-spotlight-icon">★</div>
                <div className="v3-spotlight-meta">
                  <div className="ttl">{v3.spotlight.active ? "Featured on leaderboard" : "Not featured"}</div>
                  <div className="sub">
                    {v3.spotlight.active
                      ? `${v3.spotlight.viewersToday?.toLocaleString()} views today · ${v3.spotlight.nextSlotPrice}`
                      : `Next slot · ${v3.spotlight.nextSlotPrice}`}
                  </div>
                </div>
                {!v3.spotlight.active && <button className="cta-secondary text-xs px-3 py-1">Buy</button>}
              </div>
            </div>

            {/* Background pattern */}
            <div className="v3-custom-cell v3-toggle">
              <span className="lbl">Background Pattern</span>
              <div className={`v3-toggle-switch ${ex.bg_pattern ? "is-on" : ""}`}><div className="v3-toggle-knob" /></div>
            </div>

            {/* Animated frame */}
            <div className={`v3-custom-cell v3-toggle ${isFree ? "opacity-60" : ""}`}>
              <span className="lbl">Animated Frame {isFree && <Lock className="w-3 h-3 inline-block ml-1" />}</span>
              <div className={`v3-toggle-switch ${ex.frame_animated ? "is-on" : ""}`}><div className="v3-toggle-knob" /></div>
            </div>

            {/* Verified badge */}
            <div className="v3-custom-cell">
              <span className="lbl">Verified Badge</span>
              <div className="text-xs text-[var(--text-muted)]">
                {v3.verified.has
                  ? <>✓ <span className="text-[var(--accent-amber)] font-bold">Verified</span> · {v3.verified.reason}</>
                  : "Earned via OCE staff review. Free for confirmed pros & captains."}
              </div>
              {!v3.verified.has && <button className="cta-secondary text-xs px-3 py-1 mt-1">Request Verification</button>}
            </div>

            {/* Theme variant picker (canvas-only, also shown here so persona switcher can demo it) */}
            <div className="v3-custom-cell">
              <span className="lbl">Profile Theme</span>
              <div className="v3-frame-row">
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    className={`v3-frame-pill ${activeTheme === t.id ? "is-active" : ""}`}
                    onClick={() => setActiveTheme(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-[var(--text-faint)]">5 paid themes · default Court & Pitch is free.</div>
            </div>
          </div>

          {isFree && (
            <div className="flex flex-col sm:flex-row gap-2 mt-6">
              <button className="cta-primary justify-center py-3 flex-1">
                <Star className="w-4 h-4" /> Unlock Pro Analytics & Cosmetics
              </button>
              <button className="cta-secondary justify-center py-3 flex-1 text-sm">
                <Sparkles className="w-4 h-4" /> Gift Pro to {p.display_name}
              </button>
            </div>
          )}
        </article>

      </div>

      {/* ───── Compare drawer FAB + slide-over ───── */}
      <button className="v3-compare-fab" onClick={() => setDrawerOpen(true)}>
        <Swords className="w-3.5 h-3.5" /> Compare
        {isFree && <span className="v3-compare-quota">{compareQuotaLeft}/{v3.compare.freeDailyLimit} left</span>}
      </button>
      <div className={`v3-drawer-backdrop ${drawerOpen ? "is-open" : ""}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`v3-drawer ${drawerOpen ? "is-open" : ""}`}>
        <div className="v3-drawer-head">
          <div className="v3-drawer-title">Compare players</div>
          <button className="v3-drawer-close" onClick={() => setDrawerOpen(false)}><X className="w-4 h-4" /></button>
        </div>
        <div className="v3-drawer-body">
          <div className="v3-compare-input">
            <Search className="w-4 h-4" />
            <span>{p.display_name} vs …</span>
          </div>
          <div>
            <div className="v2-mini-eyebrow">Suggested</div>
            <div className="v3-compare-suggest">
              {v3.compare.suggestions.map(s => (
                <button key={s} className="v3-compare-tag">{s}</button>
              ))}
            </div>
          </div>
          <div className="v3-compare-quota-bar">
            {isFree
              ? <>Free quota: <b>{compareQuotaLeft} of {v3.compare.freeDailyLimit}</b> comparisons left today. Pro gets unlimited.</>
              : <>Pro · <b>unlimited</b> comparisons.</>}
          </div>

          {/* Sample comparison preview */}
          <div className="v2-mini-eyebrow" style={{ marginTop: 8 }}>Preview · vs {v3.compare.suggestions[0]}</div>
          <div className="v3-compare-results">
            <div className="col-l win">{p.rank.mmr}</div>      <div className="col-mid">MMR</div>            <div className="col-r">5,420</div>
            <div className="col-l">{p.recent.kda.toFixed(2)}</div> <div className="col-mid">KDA · L30</div> <div className="col-r win">4.91</div>
            <div className="col-l win">{p.recent.gpm}</div>    <div className="col-mid">GPM</div>            <div className="col-r">588</div>
            <div className="col-l">{p.perf_avg.toFixed(1)}</div> <div className="col-mid">PERF</div>          <div className="col-r win">7.8</div>
            <div className="col-l win">14W · 6L</div>           <div className="col-mid">Together</div>      <div className="col-r">—</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ProSection({
  id, isFree, eyebrow, title, unlockTitle, unlockSub, children,
}: {
  id?: string;
  isFree: boolean;
  eyebrow: React.ReactNode;
  title: string;
  unlockTitle: string;
  unlockSub: string;
  children: React.ReactNode;
}) {
  return (
    <article id={id} className={`mag-story ${!isFree ? 'is-pro' : ''}`}>
      <div className="mag-eyebrow flex items-center gap-2">
        {eyebrow}
        {!isFree
          ? <span className="pro-chip"><Star className="w-3 h-3"/> PRO</span>
          : <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent-amber)' }}><Lock className="w-3 h-3"/> Pro</span>
        }
      </div>
      <h2 className="mag-title">{title}</h2>

      <div className={`mt-4 ${isFree ? 'lock-overlay' : ''}`} style={{ position: 'relative' }}>
        {children}
        {isFree && (
          <div className="lock-msg">
            <div className="flex flex-col items-center justify-center p-6 bg-[var(--bg-card)] border border-[var(--accent-amber)] rounded-lg shadow-2xl max-w-sm mx-auto">
              <Unlock className="w-8 h-8 text-[var(--accent-amber)] mb-3" />
              <div className="font-serif text-lg font-bold text-[var(--text-main)] mb-1">{unlockTitle}</div>
              <div className="text-xs text-[var(--text-muted)] text-center normal-case tracking-normal mb-4">{unlockSub}</div>
              <button className="cta-primary text-sm px-6 py-2">Upgrade to Pro</button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default MagazineSpreadV3;
