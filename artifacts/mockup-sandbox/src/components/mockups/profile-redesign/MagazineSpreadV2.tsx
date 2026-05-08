import React, { useState } from "react";
import "./_profile.css";
import "./_magazinespread.css";
import "./_magazinespreadv2.css";
import { PERSONAS, EXTRAS, heroImg, fmtDuration, fmtDate, type Persona } from "./_mockProfile";
import {
  Moon, Sun, ArrowLeft, Twitch, Youtube, Gamepad2, Settings2, Star, Unlock, Eye, Sparkles,
  Activity, Trophy, Gamepad, Layers, Users, Swords, Search, BarChart3, Clock, Package, ListOrdered,
  TrendingUp, TrendingDown, Lock, Crosshair, ChevronRight, ChevronUp, ChevronDown,
} from "lucide-react";
import { LineChart, Line, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

const POS_LABEL = ["", "Carry", "Mid", "Off", "Soft Sup", "Hard Sup"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["00–06", "06–12", "12–18", "18–24"];

function heatColor(wr: number): string {
  if (wr < 0) return "var(--bg-elev)";
  // 0..100 -> red -> amber -> green
  const t = Math.max(0, Math.min(100, wr)) / 100;
  if (t < 0.5) {
    const k = t / 0.5;
    const r = Math.round(248 + (245 - 248) * k);
    const g = Math.round(113 + (158 - 113) * k);
    const b = Math.round(113 + (11 - 113) * k);
    return `rgb(${r},${g},${b})`;
  }
  const k = (t - 0.5) / 0.5;
  const r = Math.round(245 + (52 - 245) * k);
  const g = Math.round(158 + (211 - 158) * k);
  const b = Math.round(11 + (153 - 11) * k);
  return `rgb(${r},${g},${b})`;
}

type MuSortKey = "delta" | "with_wr" | "vs_wr" | "name";

export function MagazineSpreadV2() {
  const [isLight, setIsLight] = useState(false);
  const [persona, setPersona] = useState<Persona>("pro");
  const [muSort, setMuSort] = useState<MuSortKey>("delta");
  const [muDir, setMuDir] = useState<"asc" | "desc">("desc");

  const p = PERSONAS[persona];
  const x = EXTRAS[persona];
  const isFree = persona === "free";
  const c = p.customization;
  const ex = c.extras;

  const themeClass = isLight ? "theme-light" : "theme-dark";
  const accent = c.theme_accent || "#c5a975";

  const mmrData = p.mmrHistory.map((val, idx) => ({ match: idx + 1, mmr: val }));
  const wrData = x.rollingWR.map((val, idx) => ({ match: idx + 1, wr: val }));

  const sortedMatchups = [...x.heroMatchups].sort((a, b) => {
    let av: number | string, bv: number | string;
    if (muSort === "delta")        { av = a.with_wr - a.vs_wr; bv = b.with_wr - b.vs_wr; }
    else if (muSort === "name")    { av = a.name; bv = b.name; }
    else if (muSort === "with_wr") { av = a.with_wr; bv = b.with_wr; }
    else                           { av = a.vs_wr;  bv = b.vs_wr;  }
    if (av < bv) return muDir === "asc" ? -1 : 1;
    if (av > bv) return muDir === "asc" ? 1 : -1;
    return 0;
  });
  const toggleMu = (k: MuSortKey) => {
    if (muSort === k) setMuDir(d => d === "asc" ? "desc" : "asc");
    else { setMuSort(k); setMuDir("desc"); }
  };
  const muArrow = (k: MuSortKey) =>
    muSort !== k ? null : (muDir === "asc" ? <ChevronUp className="w-3 h-3 v2-sort-arrow" /> : <ChevronDown className="w-3 h-3 v2-sort-arrow" />);

  return (
    <div className={`pp-redesign magazine-layout magazine-v2 ${themeClass}`} style={{ "--theme-accent": accent } as React.CSSProperties}>
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
          <span className="hidden md:inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-amber)', border: '1px solid rgba(245,158,11,0.4)' }}>v2</span>
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

      <div className="magazine-container flex-1">
        {/* LEFT COLUMN: identical to v1 (identity + customization) */}
        <div className="magazine-left-col">
          <div className={`mag-profile-card ${p.is_pro ? "pro-card" : ""} ${ex.frame_animated ? "frame-animated" : ""}`} style={{ "--theme-accent": accent } as React.CSSProperties}>
            {p.is_pro && <div className="pro-corner" />}
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="min-w-0">
                  <div className="font-condensed text-[10px] font-bold tracking-[0.3em] uppercase mb-2 text-[var(--text-faint)]">Player Profile</div>
                  <h1 className="v2-player-name font-serif font-bold leading-[0.95] tracking-tight mb-1 text-[var(--text-main)]">{p.display_name}</h1>
                  {c.custom_title && (
                    <div className="font-condensed text-sm font-semibold tracking-widest uppercase mt-3" style={{ color: accent }}>
                      {c.custom_title}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {p.is_pro && <div className="pro-chip"><Star className="w-3 h-3"/> PRO</div>}
                  <div className="pos-pill">POS {p.primary_pos}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-2">
                {(ex.flair_override || p.flairAuto) && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}>
                    ✦ {ex.flair_override || p.flairAuto}
                  </span>
                )}
                {ex.show_streak && p.streak && Math.abs(p.streak) >= 3 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: p.streak > 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: p.streak > 0 ? "#22c55e" : "#ef4444", border: `1px solid ${p.streak > 0 ? "#22c55e" : "#ef4444"}55` }}>
                    {p.streak > 0 ? '🔥' : '❄️'} {Math.abs(p.streak)} {p.streak > 0 ? 'WINS' : 'LOSSES'}
                  </span>
                )}
              </div>

              {c.bio && <div className="mag-pull-quote">"{c.bio}"</div>}

              <div className="mag-social-chips">
                {ex.social_twitch && <a href={ex.social_twitch} className="mag-social-chip"><Twitch className="w-3 h-3"/> Twitch</a>}
                {ex.social_youtube && <a href={ex.social_youtube} className="mag-social-chip"><Youtube className="w-3 h-3"/> YouTube</a>}
                {ex.social_steam && <a href={ex.social_steam} className="mag-social-chip"><Gamepad2 className="w-3 h-3"/> Steam</a>}
              </div>
            </div>
          </div>

          <div className="relative group">
            <img src={heroImg(p.pinnedHero.hero_id)} alt={p.pinnedHero.name} className={`mag-hero-large ${ex.pinned_hero_border ? "has-border" : ""}`} style={{ "--hero-border": ex.pinned_hero_border } as React.CSSProperties} />
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[var(--bg-base)] to-transparent">
              <div className="mag-eyebrow text-white"><Star className="w-3 h-3" /> Pinned Hero</div>
              <h3 className="font-serif text-3xl font-bold text-white mb-2">{p.pinnedHero.name}</h3>
              {p.pinnedHero.caption && <p className="font-serif italic text-sm text-gray-300 mb-4">"{p.pinnedHero.caption}"</p>}
              <div className="flex gap-4 font-condensed text-sm tracking-wider text-white">
                <div><span className="opacity-60 uppercase mr-1">Games</span> <span className="font-bold">{p.pinnedHero.games}</span></div>
                <div><span className="opacity-60 uppercase mr-1">WR</span> <span className="font-bold text-[var(--radiant)]">{Math.round((p.pinnedHero.wins / p.pinnedHero.games) * 100)}%</span></div>
                <div><span className="opacity-60 uppercase mr-1">KDA</span> <span className="font-bold">{p.pinnedHero.kda.toFixed(2)}</span></div>
              </div>
            </div>
          </div>

          {ex.show_top_heroes && p.topHeroes.length > 0 && (
            <div className="mt-2">
              <div className="mag-eyebrow mb-4"><Star className="w-3 h-3"/> Top Heroes</div>
              <div className="flex flex-col gap-2">
                {p.topHeroes.slice(0, 5).map(h => {
                  const wr = Math.round((h.wins / h.games) * 100);
                  return (
                    <div key={h.hero_id} className="v2-tw-hero-row">
                      <img src={heroImg(h.hero_id)} alt={h.name} />
                      <div className="v2-tw-hero-name">{h.name}</div>
                      <div className="v2-tw-hero-stats">
                        <span style={{ color: wr >= 55 ? 'var(--radiant)' : 'var(--text-muted)' }}>{wr}%</span>
                        <span className="v2-tw-hero-sep">|</span>
                        <span className="text-[var(--text-muted)]">{h.games}g</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mag-edit-rail">
            <div className="mag-eyebrow"><Settings2 className="w-4 h-4"/> Customization</div>
            <div className="flex flex-col gap-4 mt-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">Theme Accent</label>
                <div className="flex gap-2">
                  {['#3b82f6', '#f59e0b', '#ef4444', '#10b981'].map(color => (
                    <div key={color} className={`w-6 h-6 rounded-full cursor-pointer border-2 ${color === accent ? 'border-white' : 'border-transparent'}`} style={{ background: color }} />
                  ))}
                  <div className="w-6 h-6 rounded-full cursor-not-allowed border border-[var(--border-subtle)] flex items-center justify-center bg-[var(--bg-card)]">
                    <Unlock className="w-3 h-3 text-[var(--text-muted)]" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">Profile Frame</label>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-2 py-1 border border-[var(--border-strong)] rounded bg-[var(--bg-base)] text-[var(--text-main)]">None</span>
                  <span className="text-xs px-2 py-1 border border-gray-400 rounded bg-gray-500/10 text-gray-300">Silver</span>
                  <span className={`text-xs px-2 py-1 border border-amber-500 rounded bg-amber-500/10 text-amber-500 ${isFree ? 'opacity-50' : ''}`}>Gold {isFree && '🔒'}</span>
                  <span className={`text-xs px-2 py-1 border border-purple-500 rounded bg-purple-500/10 text-purple-400 ${isFree ? 'opacity-50' : ''}`}>Cosmic {isFree && '🔒'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Background Pattern</label>
                <div className={`w-8 h-4 rounded-full ${ex.bg_pattern ? 'bg-[var(--accent-brass)]' : 'bg-[var(--border-strong)]'} relative`}>
                  <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 ${ex.bg_pattern ? 'right-0.5' : 'left-0.5'}`} />
                </div>
              </div>

              <div className={`flex items-center justify-between ${isFree ? 'opacity-50' : ''}`}>
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">Animated Frame {isFree && <Unlock className="w-3 h-3"/>}</label>
                <div className={`w-8 h-4 rounded-full ${ex.frame_animated ? 'bg-[var(--accent-brass)]' : 'bg-[var(--border-strong)]'} relative`}>
                  <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 ${ex.frame_animated ? 'right-0.5' : 'left-0.5'}`} />
                </div>
              </div>
            </div>
          </div>

          {isFree && (
            <div className="flex flex-col gap-2 mt-4">
              <button className="cta-primary w-full justify-center py-4">
                <Star className="w-4 h-4" /> Unlock Pro Analytics & Cosmetics
              </button>
              <button className="cta-secondary w-full justify-center py-3 text-sm">
                <Sparkles className="w-4 h-4" /> Gift Pro to {p.display_name}
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: stories */}
        <div className="magazine-right-col">

          {/* §1 — The Showdown */}
          <article className="mag-story">
            <div className="mag-eyebrow"><Gamepad2 className="w-4 h-4"/> Latest Game</div>
            <h2 className="mag-title">The Showdown</h2>
            <div className="mag-pinned-match mt-6">
              <div className={`mag-match-result ${p.pinnedMatch.player_won ? 'win' : 'loss'}`}>
                {p.pinnedMatch.player_won ? 'WIN' : 'LOSS'}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-end mb-2">
                  <div className="font-serif font-bold text-lg text-[var(--text-main)]">As {p.pinnedMatch.hero}</div>
                  <div className="font-condensed text-sm text-[var(--text-muted)]">{fmtDuration(p.pinnedMatch.duration)} • Match #{p.pinnedMatch.match_id}</div>
                </div>
                <div className="flex gap-6 font-condensed text-lg">
                  <div><span className="text-[var(--text-muted)] text-xs uppercase mr-2 tracking-widest">Score</span> <span className="font-bold text-[var(--radiant)]">{p.pinnedMatch.radiantScore}</span> <span className="text-[var(--text-faint)]">-</span> <span className="font-bold text-[var(--dire)]">{p.pinnedMatch.direScore}</span></div>
                  <div><span className="text-[var(--text-muted)] text-xs uppercase mr-2 tracking-widest">KDA</span> <span className="font-bold text-[var(--text-main)]">{p.pinnedMatch.kills}/{p.pinnedMatch.deaths}/{p.pinnedMatch.assists}</span></div>
                </div>
              </div>
              <img src={heroImg(p.pinnedMatch.hero_id)} alt="" className="w-16 h-16 object-cover rounded shadow-md" />
            </div>
          </article>

          {/* §2 — By The Numbers (expanded) */}
          <article className="mag-story">
            <div className="mag-eyebrow"><Activity className="w-4 h-4"/> Current Form</div>
            <h2 className="mag-title">By The Numbers</h2>
            <p className="mag-subtitle">Recent performance over the last 30 matches</p>

            {/* Headline form grid */}
            <div className="mag-stat-grid">
              <div className="mag-stat-box">
                <div className="mag-stat-val text-[var(--accent-amber)]">{p.recent.wins} - {p.recent.losses}</div>
                <div className="mag-stat-lbl">Record</div>
              </div>
              <div className="mag-stat-box">
                <div className="mag-stat-val">{p.recent.kda.toFixed(2)}</div>
                <div className="mag-stat-lbl">KDA Ratio</div>
              </div>
              <div className="mag-stat-box">
                <div className="mag-stat-val">{p.recent.gpm}</div>
                <div className="mag-stat-lbl">Avg GPM</div>
              </div>
              <div className="mag-stat-box">
                <div className="mag-stat-val">{p.recent.xpm}</div>
                <div className="mag-stat-lbl">Avg XPM</div>
              </div>
            </div>

            {/* MMR + Rolling WR — moved up to break the page after the KPI grid */}
            <div className="v2-block grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
              <div className="v2-rolling-card">
                <div className="flex justify-between items-baseline mb-3">
                  <div>
                    <div className="font-serif font-bold text-base text-[var(--text-main)]">MMR Trajectory</div>
                    <div className="font-condensed text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Peak: {p.rank.peak}</div>
                  </div>
                  <div className="font-condensed text-2xl font-bold text-[var(--accent-brass)]">{p.rank.mmr}</div>
                </div>
                <div className="h-[100px] w-full">
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
                  <div className="font-condensed text-2xl font-bold" style={{ color: x.rollingWR[x.rollingWR.length - 1] >= 50 ? 'var(--radiant)' : 'var(--dire)' }}>
                    {x.rollingWR[x.rollingWR.length - 1]}%
                  </div>
                </div>
                <div className="h-[100px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={wrData}>
                      <defs>
                        <linearGradient id="wrFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="var(--radiant)" stopOpacity={0.45}/>
                          <stop offset="100%" stopColor="var(--radiant)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="wr" stroke="var(--radiant)" strokeWidth={2} fill="url(#wrFill)" />
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

            {/* Editorial pull-quote breaker between position grid and the dense stat lists */}
            <div className="v2-insight">
              <span><strong>{p.display_name}</strong> averages <strong>{x.statAvg.heroDmg.toLocaleString()}</strong> hero damage per game across {p.recent.wins + p.recent.losses} matches — {p.primary_pos === 2 ? 'classic mid-lane carry profile.' : p.primary_pos <= 2 ? 'a textbook core impact line.' : 'a high-utility support footprint.'}</span>
            </div>

            {/* Full stat averages — flat data strip, no boxes */}
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

            {/* Multi-kill — slim inline pills */}
            <div className="v2-block mt-4">
              <div className="v2-mini-eyebrow"><Crosshair className="w-3 h-3"/> Multi-kill counts · career</div>
              <div className="v2-mk-strip">
                {([
                  { lbl: "Double",  v: x.multiKills.double,  rare: false },
                  { lbl: "Triple",  v: x.multiKills.triple,  rare: false },
                  { lbl: "Ultra",   v: x.multiKills.ultra,   rare: x.multiKills.ultra > 0 },
                  { lbl: "Rampage", v: x.multiKills.rampage, rare: x.multiKills.rampage > 0 },
                ]).map(m => (
                  <div key={m.lbl} className={`v2-mk-pill ${m.rare ? 'is-rare' : ''}`}>
                    <span className="num">{m.v}</span>
                    <span className="lbl">{m.lbl}</span>
                  </div>
                ))}
              </div>
            </div>

          </article>

          {/* §3 — Recent Matches */}
          <article className="mag-story">
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

          {/* §4 — AI Scout (Pro) */}
          <ProSection
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

          {/* §5 — Allies & Enemies (Pro) */}
          <ProSection
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
                <button className="cta-secondary text-xs px-3 py-1">Compare</button>
              </div>
            </div>
          </ProSection>

          {/* §6 — Performance Lab (Pro) */}
          <ProSection
            isFree={isFree}
            eyebrow={<><Activity className="w-4 h-4"/> Performance Lab</>}
            title="Where Performance Comes From"
            unlockTitle="Unlock Performance Lab"
            unlockSub="PERF deltas, hero matchups, schedule heatmap and build trends."
          >
            {/* PERF breakdown */}
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
              <div className="text-center mt-3 font-condensed text-xs tracking-widest uppercase text-[var(--text-muted)]">
                Avg PERF · <span className="text-[var(--accent-brass)] text-base font-bold">{p.perf_avg.toFixed(1)}</span> / 10
              </div>
            </div>

            <div className="v2-rule" />

            {/* Hero matchups */}
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

            {/* Heatmap */}
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

            {/* Build trends */}
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
                <div className="text-[10px] text-[var(--text-faint)] mt-3 leading-relaxed">
                  Based on the player's last 30 games on {p.pinnedHero.name}.
                </div>
              </div>
            </div>
          </ProSection>

          {/* §7 — Trophy Cabinet */}
          <article className="mag-story">
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

        </div>
      </div>
    </div>
  );
}

// Pro-gated section: keeps eyebrow + title visible, blurs the body, overlays unlock card.
function ProSection({
  isFree, eyebrow, title, unlockTitle, unlockSub, children,
}: {
  isFree: boolean;
  eyebrow: React.ReactNode;
  title: string;
  unlockTitle: string;
  unlockSub: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`mag-story ${!isFree ? 'is-pro' : ''}`}>
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
