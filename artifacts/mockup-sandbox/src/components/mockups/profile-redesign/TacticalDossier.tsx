import React, { useState } from "react";
import "./_profile.css";
import "./_tacticaldossier.css";
import { PERSONAS, heroImg, fmtDuration, fmtDate, type Persona } from "./_mockProfile";
import { Sun, Moon, ArrowLeft, Trophy, Target, Shield, Settings2, BarChart2, ShieldAlert, Zap, Lock, Star } from "lucide-react";

export function TacticalDossier() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [persona, setPersona] = useState<Persona>("pro");

  const p = PERSONAS[persona];
  const isFree = persona === "free";
  const isPro = persona === "pro" || persona === "ogpro";
  const isOgPro = persona === "ogpro";

  const themeClass = theme === "light" ? "theme-light" : "";

  const toggleTheme = () => setTheme(t => (t === "dark" ? "light" : "dark"));

  const tileAccentStyle = { "--tile-accent": p.customization.theme_accent } as React.CSSProperties;

  return (
    <div className={`pp-redesign tactical-dossier min-h-screen ${themeClass}`}>
      {/* Persona Switcher & Header */}
      <header className="border-b" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-card)" }}>
        <div className="max-w-[1280px] mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <img src="/__mockup/images/oa-logo.png" alt="Logo" className="h-6 w-auto" />
              <div className="font-condensed font-bold tracking-widest text-sm leading-none flex flex-col">
                <span>OCE</span>
                <span className="text-[10px]" style={{ color: "var(--accent-brass)" }}>INHOUSE</span>
              </div>
            </div>
            <a href="#" className="hidden md:flex items-center gap-1 text-xs font-condensed tracking-wider transition-opacity hover:opacity-80" style={{ color: "var(--text-muted)" }}>
              <ArrowLeft className="w-3 h-3" /> LEADERBOARD
            </a>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-black/20 p-1 rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
              {(["free", "pro", "ogpro"] as Persona[]).map(pers => (
                <button
                  key={pers}
                  onClick={() => setPersona(pers)}
                  className={`text-[10px] font-condensed tracking-widest px-3 py-1 rounded transition-colors ${persona === pers ? 'bg-white/10 shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                  style={{ color: persona === pers ? "var(--text-main)" : "var(--text-muted)" }}
                >
                  {pers.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={toggleTheme} className="p-1.5 rounded-full border transition-colors hover:bg-white/5" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">

        {/* Top Scoreboard Strip */}
        <section className="scoreboard-strip rounded-lg p-4 md:p-6 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="flex items-center gap-5">
            <div className={`relative ${isOgPro ? 'frame-animated' : p.customization.profile_frame === 'gold' ? 'frame-gold' : p.customization.profile_frame === 'silver' ? 'frame-silver' : ''}`}>
              <img src={`https://api.dicebear.com/9.x/identicon/svg?seed=${p.steam_id}&backgroundColor=152036`} className="w-20 h-20 md:w-24 md:h-24 rounded-lg bg-black/50" alt="Avatar" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-serif text-3xl font-bold m-0 leading-none">{p.display_name}</h1>
                {isPro && <span className="pro-chip" style={{ fontSize: '9px', padding: '1px 5px' }}>PRO</span>}
              </div>
              {p.customization.custom_title && (
                <div className="text-sm font-condensed tracking-wider" style={{ color: p.customization.theme_accent }}>{p.customization.custom_title}</div>
              )}
              {p.customization.bio && (
                <div className="text-[11px] mt-2 max-w-sm" style={{ color: "var(--text-faint)" }}>"{p.customization.bio}"</div>
              )}
            </div>
          </div>

          <div className="w-full md:w-px h-px md:h-16 hidden md:block" style={{ backgroundColor: "var(--border-strong)" }} />

          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 w-full text-center md:text-left">
            <div>
              <div className="text-[10px] font-condensed tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>RANK TIER</div>
              <div className="text-lg font-bold" style={{ color: "var(--accent-brass)" }}>{p.rank.tier}</div>
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>{p.rank.mmr} MMR</div>
            </div>
            <div>
              <div className="text-[10px] font-condensed tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>IMPACT SCORE</div>
              <div className="text-lg font-bold">{p.impact.score.toFixed(1)}</div>
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>Top {p.impact.rank_pct}%</div>
            </div>
            <div>
              <div className="text-[10px] font-condensed tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>ROLE</div>
              <div className="text-lg font-bold flex items-center justify-center md:justify-start gap-1">
                {p.flairAuto} <span className="pos-pill ml-1">POS {p.primary_pos}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-condensed tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>W/L RECORD</div>
              <div className="text-lg font-bold">{p.recent.wins}W - {p.recent.losses}L</div>
              <div className="text-xs" style={{ color: "var(--text-faint)" }}>Last 30 games</div>
            </div>
          </div>
        </section>

        {/* Card Grid */}
        <section className="grid-layout">
          
          {/* Pinned Hero */}
          <div className="dossier-tile rounded-md overflow-hidden" style={tileAccentStyle}>
            <div className="tile-header">
              <span className="font-condensed">PINNED HERO</span>
              <Target className="w-3.5 h-3.5" />
            </div>
            <div className="tile-content flex flex-col items-center text-center">
               <img src={heroImg(p.pinnedHero.hero_id)} alt="Hero" className="w-16 h-16 rounded mb-3" style={p.customization.extras.pinned_hero_border ? { border: `2px solid ${p.customization.extras.pinned_hero_border}` } : {}} />
               <div className="font-bold text-sm mb-1">{p.pinnedHero.name}</div>
               <div className="text-[11px] mb-3 max-w-[200px]" style={{ color: "var(--text-faint)" }}>"{p.pinnedHero.caption}"</div>
               <div className="flex gap-4 w-full mt-auto pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                 <div className="flex-1">
                   <div className="text-[10px] text-muted">WR</div>
                   <div className="text-sm font-bold" style={{ color: p.pinnedHero.wins/p.pinnedHero.games > 0.5 ? "#22c55e" : "#ef4444" }}>
                     {Math.round((p.pinnedHero.wins/p.pinnedHero.games)*100)}%
                   </div>
                 </div>
                 <div className="flex-1">
                   <div className="text-[10px] text-muted">KDA</div>
                   <div className="text-sm font-bold">{p.pinnedHero.kda}</div>
                 </div>
                 <div className="flex-1">
                   <div className="text-[10px] text-muted">GAMES</div>
                   <div className="text-sm font-bold">{p.pinnedHero.games}</div>
                 </div>
               </div>
            </div>
          </div>

          {/* Recent Form */}
          <div className={`dossier-tile rounded-md overflow-hidden ${isFree ? 'lock-overlay' : ''} pro-card`} style={tileAccentStyle}>
            <div className="tile-header">
              <span className="font-condensed">RECENT FORM (30G)</span>
              <BarChart2 className="w-3.5 h-3.5" />
            </div>
            <div className="tile-content">
              {isPro && <div className="pro-corner" />}
              <div className="stat-row"><span>KDA</span> <strong>{p.recent.kda}</strong></div>
              <div className="stat-row"><span>GPM</span> <strong className="amber-text">{p.recent.gpm}</strong></div>
              <div className="stat-row"><span>XPM</span> <strong>{p.recent.xpm}</strong></div>
              <div className="stat-row"><span>Last Hits</span> <strong>{p.recent.lh}</strong></div>
              
              {isPro && (
                 <div className="mt-4 pt-4 border-t border-dashed" style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="text-[10px] text-muted mb-2 font-condensed">AVG PERF</div>
                    <div className="text-2xl font-bold accent-text">{p.perf_avg}</div>
                 </div>
              )}
            </div>
            {isFree && (
              <div className="lock-msg">
                <Lock className="w-4 h-4 mx-auto mb-1" />
                UNLOCK ADVANCED FORM WITH PRO
              </div>
            )}
          </div>

          {/* AI Scout */}
          <div className={`dossier-tile rounded-md overflow-hidden ${isFree ? 'lock-overlay' : ''} pro-card`} style={tileAccentStyle}>
            <div className="tile-header">
              <span className="font-condensed">AI SCOUTING REPORT</span>
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div className="tile-content text-[11px] leading-relaxed">
              {isPro && <div className="pro-corner" />}
              {isPro ? (
                <>
                  <div className="mb-2"><strong className="text-[#22c55e]">STRENGTHS:</strong> {p.scouting.strengths.join(", ")}</div>
                  <div className="mb-3"><strong className="text-[#ef4444]">WEAKNESSES:</strong> {p.scouting.weaknesses.join(", ")}</div>
                  <div className="p-2 bg-black/20 rounded border-l-2" style={{ borderColor: "var(--accent-amber)" }}>
                    <em className="text-muted">"{p.scouting.tldr}"</em>
                  </div>
                </>
              ) : (
                <div className="blur-sm opacity-50 space-y-2">
                  <div><strong>STRENGTHS:</strong> Farm, scaling</div>
                  <div><strong>WEAKNESSES:</strong> Early game</div>
                  <div><em>"Generic scout summary here..."</em></div>
                </div>
              )}
            </div>
            {isFree && (
              <div className="lock-msg">
                <Lock className="w-4 h-4 mx-auto mb-1" />
                UNLOCK SCOUTING WITH PRO
              </div>
            )}
          </div>

          {/* Top Heroes Strip */}
          <div className="dossier-tile rounded-md overflow-hidden md:col-span-2" style={tileAccentStyle}>
            <div className="tile-header">
              <span className="font-condensed">HERO POOL (TOP 5)</span>
              <Shield className="w-3.5 h-3.5" />
            </div>
            <div className="tile-content flex gap-3 overflow-x-auto hide-scrollbar">
               {p.topHeroes.map(h => (
                 <div key={h.hero_id} className="min-w-[120px] flex-1 bg-black/10 border rounded p-2 text-center" style={{ borderColor: "var(--border-subtle)" }}>
                    <img src={heroImg(h.hero_id)} alt="hero" className="w-full h-14 object-cover rounded mb-2 opacity-80" />
                    <div className="text-xs font-bold truncate mb-1">{h.name}</div>
                    <div className="text-[10px] text-muted flex justify-between px-1">
                      <span>{h.games}g</span>
                      <span style={{ color: (h.wins/h.games) >= 0.5 ? "#22c55e" : "#ef4444" }}>{Math.round((h.wins/h.games)*100)}%</span>
                    </div>
                 </div>
               ))}
            </div>
          </div>

          {/* MMR Sparkline */}
          <div className="dossier-tile rounded-md overflow-hidden" style={tileAccentStyle}>
            <div className="tile-header">
              <span className="font-condensed">MMR TRAJECTORY</span>
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div className="tile-content flex flex-col">
              <div className="text-2xl font-bold mb-1">{p.rank.mmr} <span className="text-xs font-normal text-muted">CURRENT</span></div>
              <div className="text-xs text-muted mb-4">Peak: {p.rank.peak}</div>
              
              <div className="sparkline">
                {p.mmrHistory.map((val, i) => {
                  const min = Math.min(...p.mmrHistory);
                  const max = Math.max(...p.mmrHistory);
                  const range = max - min || 1;
                  const pct = Math.max(5, ((val - min) / range) * 100);
                  return (
                    <div key={i} className="spark-bar" style={{ height: `${pct}%` }} title={`MMR: ${val}`} />
                  )
                })}
              </div>
            </div>
          </div>

          {/* Pinned Match */}
          <div className="dossier-tile rounded-md overflow-hidden" style={tileAccentStyle}>
             <div className="tile-header">
              <span className="font-condensed">PINNED MATCH</span>
              <Trophy className="w-3.5 h-3.5" />
            </div>
            <div className="tile-content flex flex-col justify-center">
              <div className="flex justify-between items-center mb-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.pinnedMatch.player_won ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                  {p.pinnedMatch.player_won ? 'VICTORY' : 'DEFEAT'}
                </span>
                <span className="text-xs text-muted">{fmtDuration(p.pinnedMatch.duration)}</span>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <img src={heroImg(p.pinnedMatch.hero_id)} alt="hero" className="w-12 h-10 rounded" />
                <div>
                  <div className="font-bold text-sm">{p.pinnedMatch.hero}</div>
                  <div className="text-xs font-mono">{p.pinnedMatch.kills} / {p.pinnedMatch.deaths} / {p.pinnedMatch.assists}</div>
                </div>
              </div>
              <div className="text-[10px] text-muted text-center mt-auto">MATCH #{p.pinnedMatch.match_id}</div>
            </div>
          </div>

          {/* Achievements & Badges */}
          <div className="dossier-tile rounded-md overflow-hidden" style={tileAccentStyle}>
             <div className="tile-header">
              <span className="font-condensed">ACHIEVEMENTS</span>
              <Star className="w-3.5 h-3.5" />
            </div>
            <div className="tile-content">
              {p.pinnedAchievement && (
                <div className="flex items-center gap-3 mb-4 p-2 bg-black/10 border rounded" style={{ borderColor: "var(--border-subtle)" }}>
                  <span className="text-2xl">{p.pinnedAchievement.emoji}</span>
                  <div>
                    <div className="text-xs font-bold">{p.pinnedAchievement.label}</div>
                    <div className="text-[10px] text-muted">{p.pinnedAchievement.sub}</div>
                  </div>
                </div>
              )}
              <div className="achievement-grid mt-2">
                {p.achievements.map((ach, i) => (
                  <div key={i} className={`achievement-item ${ach.rarity}`} title={`${ach.label}\n${ach.sub}`}>
                    {ach.emoji}
                  </div>
                ))}
              </div>
            </div>
          </div>

           {/* Customization Surface (Abstracted for dossier view) */}
           <div className="dossier-tile rounded-md overflow-hidden bg-black/20" style={tileAccentStyle}>
             <div className="tile-header">
              <span className="font-condensed">DOSSIER THEME</span>
            </div>
            <div className="tile-content flex flex-col justify-center items-center text-center opacity-70">
               <div className="w-8 h-8 rounded-full mb-3" style={{ backgroundColor: p.customization.theme_accent, border: '2px solid white' }}></div>
               <div className="flex flex-wrap gap-1 justify-center mb-2">
                 {([
                   { key: 'none',     label: 'None',   border: 'var(--border-strong)', tier: 'free' },
                   { key: 'silver',   label: 'Silver', border: '#9ca3af',              tier: 'free' },
                   { key: 'gold',     label: 'Gold',   border: 'var(--accent-brass)',  tier: 'pro' },
                   { key: 'animated', label: 'Cosmic', border: '#a78bfa',              tier: 'ogpro' },
                 ] as const).map(sw => {
                   const selected = (sw.key === 'animated' ? p.customization.extras.frame_animated : p.customization.profile_frame === sw.key);
                   const locked = (sw.tier === 'pro' && !isPro) || (sw.tier === 'ogpro' && !isOgPro);
                   return (
                     <span key={sw.key} className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${selected ? 'ring-1 ring-white' : ''} ${locked ? 'opacity-50' : ''}`}
                       style={{ borderColor: sw.border }}>
                       {sw.label}{locked && '🔒'}
                     </span>
                   );
                 })}
               </div>
               <div className="text-[10px] text-muted">Theme applied to dossier grid.</div>
            </div>
          </div>

        </section>

        {isFree && (
          <div className="text-center mt-12 mb-4">
            <button className="cta-primary px-6 py-3">GIFT PRO TO {p.display_name.toUpperCase()}</button>
          </div>
        )}

      </main>

      <div className="fab-customize shadow-lg">
        <Settings2 className="w-6 h-6" />
      </div>
    </div>
  );
}
