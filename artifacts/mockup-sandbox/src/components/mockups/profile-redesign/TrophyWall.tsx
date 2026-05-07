import React, { useState } from "react";
import "./_profile.css";
import { PERSONAS, heroImg, fmtDuration, fmtDate, type Persona } from "./_mockProfile";
import { Moon, Sun, ArrowLeft, ExternalLink, Activity, Trophy, Shield, Crosshair, Star, Gift, Settings, Twitch, Youtube, Gamepad2, Search, ArrowUpRight } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

export function TrophyWall() {
  const [persona, setPersona] = useState<Persona>("pro");
  const [isLight, setIsLight] = useState(false);
  const [scoutingTab, setScoutingTab] = useState<"tldr" | "strengths" | "weaknesses">("tldr");

  const player = PERSONAS[persona];
  const isPro = player.is_pro;
  const isOG = player.is_og_pro;

  const toggleTheme = () => setIsLight(!isLight);

  const themeClass = isLight ? "theme-light" : "";

  // Sparkline data
  const sparklineData = player.mmrHistory.map((val, i) => ({ val, index: i }));
  const minMmr = Math.min(...player.mmrHistory);
  const maxMmr = Math.max(...player.mmrHistory);

  return (
    <div className={`pp-redesign ${themeClass} min-h-screen flex flex-col font-sans transition-colors duration-300`}>
      {/* Top Navigation & Controls */}
      <header className="sticky top-0 z-50 border-b bg-base/90 backdrop-blur" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'color-mix(in srgb, var(--bg-base) 90%, transparent)' }}>
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="#" className="flex items-center gap-3">
              <img src="/__mockup/images/oa-logo.png" alt="OA" className="h-8 w-auto" />
              <div className="flex flex-col leading-none">
                <span className="font-serif font-bold text-lg" style={{ color: 'var(--text-main)' }}>OCE</span>
                <span className="font-condensed font-medium tracking-[0.2em] text-[10px]" style={{ color: 'var(--accent-amber)' }}>INHOUSE</span>
              </div>
            </a>
            <div className="hidden md:block w-px h-6 bg-[var(--border-subtle)]" />
            <a href="#" className="hidden md:flex items-center gap-2 text-sm font-condensed tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
              <ArrowLeft className="w-4 h-4" /> LEADERBOARD
            </a>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center p-1 rounded-full border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
              {(["free", "pro", "ogpro"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPersona(p)}
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${persona === p ? 'shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                  style={{
                    backgroundColor: persona === p ? (p === 'free' ? 'var(--bg-card-2)' : 'var(--accent-brass)') : 'transparent',
                    color: persona === p ? (p === 'free' ? 'var(--text-main)' : '#1a1a1a') : 'var(--text-muted)'
                  }}
                >
                  {p === 'ogpro' ? 'OG Pro' : p}
                </button>
              ))}
            </div>
            
            <button onClick={toggleTheme} className="p-2 rounded-full border transition-colors hover:bg-[var(--bg-card)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
              {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-8 md:py-12 flex flex-col md:flex-row gap-10">
        
        {/* Left Column: Hero & Content */}
        <div className="flex-1 space-y-10 min-w-0">
          
          {/* Magazine Hero Header */}
          <section className="relative">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="font-serif italic text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold leading-none tracking-tight break-words" style={{ color: 'var(--text-main)' }}>
                    {player.display_name}
                  </h1>
                  {player.customization.custom_title && (
                    <div className="font-condensed text-xl md:text-2xl mt-2 tracking-widest uppercase" style={{ color: player.customization.theme_accent }}>
                      {player.customization.custom_title}
                    </div>
                  )}
                </div>
                
                {/* Persona Chips */}
                <div className="flex items-center gap-3 mb-2">
                  {isPro && (
                    <span className="pro-chip text-sm px-3 py-1">
                      ★ {isOG ? 'FOUNDER' : 'PRO'}
                    </span>
                  )}
                  <span className="pos-pill text-sm px-3 py-1">POS {player.primary_pos}</span>
                  {(player.customization.extras.flair_override || player.flairAuto) && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full border" style={{ borderColor: `${player.customization.theme_accent}40`, color: player.customization.theme_accent, backgroundColor: `${player.customization.theme_accent}10` }}>
                      ✦ {player.customization.extras.flair_unlocked ? player.customization.extras.flair_override : player.flairAuto}
                    </span>
                  )}
                </div>
              </div>

              {/* Bio & Strip */}
              <div className="flex flex-col md:flex-row gap-6 md:items-center">
                <div className="flex-1 text-lg font-light leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {player.customization.bio ? `"${player.customization.bio}"` : "No bio provided."}
                </div>
                
                {/* Rank & Impact Card */}
                <div className="flex items-center gap-6 p-4 rounded-xl border shrink-0" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
                  <div className="flex flex-col">
                    <span className="font-condensed text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--text-faint)' }}>Rating</span>
                    <span className="font-serif font-bold text-2xl" style={{ color: 'var(--accent-brass)' }}>{player.rank.mmr}</span>
                  </div>
                  <div className="w-px h-10 bg-[var(--border-subtle)]" />
                  <div className="flex flex-col">
                    <span className="font-condensed text-xs tracking-widest uppercase mb-1" style={{ color: 'var(--text-faint)' }}>Impact</span>
                    <span className="font-serif font-bold text-2xl" style={{ color: 'var(--text-main)' }}>{player.impact.score.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div className="h-16 w-full mt-2 relative rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card-2)' }}>
                <div className="absolute top-2 left-3 font-condensed text-[10px] tracking-widest uppercase z-10" style={{ color: 'var(--text-faint)' }}>MMR Trend (30 games)</div>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparklineData}>
                    <YAxis domain={[minMmr - 50, maxMmr + 50]} hide />
                    <Line type="monotone" dataKey="val" stroke={player.customization.theme_accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* AI Scouting (Pro Only) */}
          <section className={`relative rounded-xl border overflow-hidden transition-all duration-500 ${!isPro ? 'lock-overlay' : ''}`} style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Search className="w-5 h-5" style={{ color: 'var(--accent-brass)' }} />
                <h2 className="font-serif text-2xl font-bold" style={{ color: 'var(--text-main)' }}>AI Scouting Report</h2>
              </div>
              
              <div className="flex gap-2 border-b mb-6" style={{ borderColor: 'var(--border-subtle)' }}>
                {(['tldr', 'strengths', 'weaknesses'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setScoutingTab(tab)}
                    className="px-4 py-2 font-condensed uppercase tracking-wider text-sm transition-colors border-b-2"
                    style={{
                      color: scoutingTab === tab ? 'var(--text-main)' : 'var(--text-muted)',
                      borderColor: scoutingTab === tab ? 'var(--accent-brass)' : 'transparent',
                    }}
                  >
                    {tab === 'tldr' ? 'Overview' : tab}
                  </button>
                ))}
              </div>

              <div className="min-h-[100px]">
                {scoutingTab === 'tldr' && (
                  <p className="text-lg italic leading-relaxed" style={{ color: 'var(--text-main)' }}>"{player.scouting.tldr}"</p>
                )}
                {scoutingTab === 'strengths' && (
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {player.scouting.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="mt-1"><Shield className="w-4 h-4 text-emerald-500" /></div>
                        <span style={{ color: 'var(--text-main)' }}>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {scoutingTab === 'weaknesses' && (
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {player.scouting.weaknesses.map((s, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="mt-1"><Crosshair className="w-4 h-4 text-rose-500" /></div>
                        <span style={{ color: 'var(--text-main)' }}>{s}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {!isPro && (
              <div className="lock-msg flex flex-col items-center gap-3">
                <Search className="w-8 h-8 opacity-50" />
                <span>Unlock AI Scouting with Pro</span>
              </div>
            )}
          </section>

          {/* Performance & Top Heroes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section>
              <h3 className="font-condensed uppercase tracking-widest text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Recent Form (30g)</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Win Rate", val: `${Math.round((player.recent.wins / (player.recent.wins + player.recent.losses)) * 100)}%` },
                  { label: "KDA", val: player.recent.kda.toFixed(2) },
                  { label: "GPM", val: player.recent.gpm },
                  { label: "XPM", val: player.recent.xpm },
                ].map(stat => (
                  <div key={stat.label} className="p-4 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
                    <div className="font-condensed text-[10px] tracking-widest uppercase mb-1" style={{ color: 'var(--text-faint)' }}>{stat.label}</div>
                    <div className="font-serif text-xl font-bold" style={{ color: 'var(--text-main)' }}>{stat.val}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="font-condensed uppercase tracking-widest text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Top Heroes</h3>
              <div className="flex flex-col gap-2">
                {player.topHeroes.slice(0, 5).map(h => {
                  const wr = Math.round((h.wins / h.games) * 100);
                  return (
                    <div key={h.hero_id} className="flex items-center gap-4 p-2 rounded-lg border transition-colors hover:bg-[var(--bg-card)]" style={{ borderColor: 'var(--border-subtle)' }}>
                      <img src={heroImg(h.hero_id)} alt={h.name} className="w-12 h-7 object-cover rounded shadow-sm" />
                      <div className="flex-1 font-bold text-sm" style={{ color: 'var(--text-main)' }}>{h.name}</div>
                      <div className="text-right text-xs font-mono">
                        <span style={{ color: wr >= 55 ? '#10b981' : 'var(--text-muted)' }}>{wr}%</span>
                        <span className="mx-2" style={{ color: 'var(--border-subtle)' }}>|</span>
                        <span style={{ color: 'var(--text-muted)' }}>{h.games}g</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Achievements Grid */}
          <section>
            <div className="flex items-end justify-between mb-6">
              <h2 className="font-serif text-2xl font-bold" style={{ color: 'var(--text-main)' }}>Achievements</h2>
              <span className="font-condensed text-sm tracking-wider" style={{ color: 'var(--text-muted)' }}>{player.achievements.length} UNLOCKED</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {player.achievements.map((a, i) => (
                <div key={i} className="flex flex-col items-center text-center p-4 rounded-xl border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
                  <span className="text-4xl mb-3 drop-shadow-md">{a.emoji}</span>
                  <span className="font-bold text-sm leading-tight mb-1" style={{ color: 'var(--text-main)' }}>{a.label}</span>
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{a.sub}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Customization Surface */}
          <section className="p-6 rounded-xl border mt-8" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card-2)' }}>
            <h3 className="font-condensed uppercase tracking-widest text-sm mb-4 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <Settings className="w-4 h-4" /> Profile Customization
            </h3>
            <div className="flex flex-wrap gap-6 items-center">
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-faint)]">Theme:</span>
                <div className="w-6 h-6 rounded-full border-2" style={{ backgroundColor: player.customization.theme_accent, borderColor: 'var(--bg-base)' }} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-faint)]">Frame:</span>
                <span className="text-sm px-3 py-1 rounded bg-[var(--bg-base)] border border-[var(--border-subtle)] capitalize">{player.customization.profile_frame}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-faint)]">Socials:</span>
                <div className="flex gap-2">
                  {player.socials.twitch && <Twitch className="w-5 h-5 text-purple-400" />}
                  {player.socials.youtube && <Youtube className="w-5 h-5 text-red-500" />}
                  {player.socials.steam && <Gamepad2 className="w-5 h-5 text-slate-400" />}
                  {!player.socials.twitch && !player.socials.youtube && !player.socials.steam && <span className="text-sm text-[var(--text-muted)]">None linked</span>}
                </div>
              </div>
            </div>
          </section>

          {!isPro && (
            <div className="flex justify-center mt-8">
              <button className="cta-primary">
                <Gift className="w-4 h-4" /> Gift Pro to {player.display_name}
              </button>
            </div>
          )}

        </div>

        {/* Right Column: Trophy Wall Sidebar */}
        <aside className="w-full md:w-80 shrink-0 flex flex-col gap-6">
          <div className="font-condensed uppercase tracking-widest text-xs text-center border-b pb-2 mb-2" style={{ color: 'var(--text-faint)', borderColor: 'var(--border-subtle)' }}>
            The Trophy Wall
          </div>

          {/* Pinned Achievement */}
          <div className="relative group">
            <div className="absolute -inset-0.5 rounded-xl opacity-20 group-hover:opacity-40 transition-opacity blur" style={{ backgroundColor: 'var(--accent-amber)' }} />
            <div className="relative p-6 rounded-xl border text-center flex flex-col items-center" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--accent-brass)' }}>
              <div className="pro-corner" />
              <div className="font-condensed text-[10px] tracking-widest uppercase mb-4" style={{ color: 'var(--text-faint)' }}>Pinned Honor</div>
              <span className="text-6xl mb-4 drop-shadow-lg">{player.pinnedAchievement.emoji}</span>
              <h4 className="font-serif font-bold text-xl mb-1" style={{ color: 'var(--text-main)' }}>{player.pinnedAchievement.label}</h4>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{player.pinnedAchievement.sub}</p>
            </div>
          </div>

          {/* Pinned Hero */}
          <div className="p-6 rounded-xl border flex flex-col items-center text-center" style={{ backgroundColor: 'var(--bg-card)', borderColor: player.pinnedHero.borderColor || 'var(--border-strong)' }}>
            <div className="font-condensed text-[10px] tracking-widest uppercase mb-4" style={{ color: 'var(--text-faint)' }}>Signature Hero</div>
            <div className={`mb-5 ${
              isOG && player.customization.extras.frame_animated ? 'frame-animated'
                : player.customization.profile_frame === 'gold' ? 'frame-gold'
                : player.customization.profile_frame === 'silver' ? 'frame-silver'
                : ''
            }`}>
              <img 
                src={heroImg(player.pinnedHero.hero_id)} 
                alt={player.pinnedHero.name} 
                className="w-32 h-auto rounded-lg shadow-xl block"
              />
            </div>
            <h4 className="font-bold text-lg mb-2" style={{ color: 'var(--text-main)' }}>{player.pinnedHero.name}</h4>
            <div className="flex gap-4 text-sm font-mono mb-4">
              <div className="flex flex-col"><span style={{ color: 'var(--text-faint)', fontSize: 10 }}>GAMES</span><span style={{ color: 'var(--text-main)' }}>{player.pinnedHero.games}</span></div>
              <div className="flex flex-col"><span style={{ color: 'var(--text-faint)', fontSize: 10 }}>WIN%</span><span className="text-emerald-500">{Math.round((player.pinnedHero.wins / player.pinnedHero.games) * 100)}</span></div>
              <div className="flex flex-col"><span style={{ color: 'var(--text-faint)', fontSize: 10 }}>KDA</span><span style={{ color: 'var(--text-main)' }}>{player.pinnedHero.kda}</span></div>
            </div>
            <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>"{player.pinnedHero.caption}"</p>
          </div>

          {/* Pinned Match */}
          <a href="#" className="block p-5 rounded-xl border hover:-translate-y-1 transition-transform" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}>
            <div className="flex justify-between items-center mb-4">
              <div className="font-condensed text-[10px] tracking-widest uppercase" style={{ color: 'var(--text-faint)' }}>Pinned Match</div>
              <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </div>
            
            <div className="flex items-center gap-4 mb-4">
              <span className="px-3 py-1 text-xs font-bold rounded-full border bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                {player.pinnedMatch.player_won ? 'VICTORY' : 'DEFEAT'}
              </span>
              <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-main)' }}>
                {player.pinnedMatch.kills}/{player.pinnedMatch.deaths}/{player.pinnedMatch.assists}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={heroImg(player.pinnedMatch.hero_id)} alt={player.pinnedMatch.hero} className="w-12 h-7 rounded object-cover" />
                <div className="flex flex-col">
                  <span className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{player.pinnedMatch.hero}</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{fmtDuration(player.pinnedMatch.duration)}</span>
                </div>
              </div>
            </div>
          </a>

        </aside>

      </main>
    </div>
  );
}
