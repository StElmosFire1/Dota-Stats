import React, { useState } from "react";
import "./_profile.css";
import "./_magazinespread.css";
import { PERSONAS, heroImg, fmtDuration, fmtDate, type Persona } from "./_mockProfile";
import { Moon, Sun, ArrowLeft, Twitch, Youtube, Gamepad2, Settings2, BarChart2, Star, Unlock, Eye, Sparkles, Activity, Trophy } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts";

export function MagazineSpread() {
  const [isLight, setIsLight] = useState(false);
  const [persona, setPersona] = useState<Persona>("pro");

  const p = PERSONAS[persona];
  const isFree = persona === "free";
  const c = p.customization;
  const ex = c.extras;

  const themeClass = isLight ? "theme-light" : "theme-dark";
  const accent = c.theme_accent || "#c5a975";

  // Recharts data
  const mmrData = p.mmrHistory.map((val, idx) => ({ match: idx + 1, mmr: val }));

  return (
    <div className={`pp-redesign magazine-layout ${themeClass}`} style={{ "--theme-accent": accent } as React.CSSProperties}>
      
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
            <ArrowLeft className="w-4 h-4" />
            Leaderboard
          </a>
        </div>

        <div className="flex items-center gap-6">
          {/* Persona Switcher */}
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

      {/* Main Content */}
      <div className="magazine-container flex-1">
        
        {/* LEFT COLUMN: Profile & Identity */}
        <div className="magazine-left-col">
          
          {/* Profile Card Analog */}
          <div className={`mag-profile-card ${p.is_pro ? "pro-card" : ""} ${ex.frame_animated ? "frame-animated" : ""}`} style={{ "--theme-accent": accent } as React.CSSProperties}>
            {p.is_pro && <div className="pro-corner" />}
            
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="font-serif text-4xl font-bold leading-none mb-1 text-[var(--text-main)]">{p.display_name}</h1>
                  {c.custom_title && (
                    <div className="font-condensed text-sm font-semibold tracking-widest uppercase mt-2" style={{ color: accent }}>
                      {c.custom_title}
                    </div>
                  )}
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  {p.is_pro && <div className="pro-chip"><Star className="w-3 h-3"/> PRO</div>}
                  <div className="pos-pill">POS {p.primary_pos}</div>
                </div>
              </div>

              {/* Flair & Streak */}
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

              {/* Bio Pull Quote */}
              {c.bio && (
                <div className="mag-pull-quote">
                  "{c.bio}"
                </div>
              )}

              {/* Socials */}
              <div className="mag-social-chips">
                {ex.social_twitch && <a href={ex.social_twitch} className="mag-social-chip hover:bg-[#9146FF] hover:text-white hover:border-[#9146FF]"><Twitch className="w-3 h-3"/> Twitch</a>}
                {ex.social_youtube && <a href={ex.social_youtube} className="mag-social-chip hover:bg-[#FF0000] hover:text-white hover:border-[#FF0000]"><Youtube className="w-3 h-3"/> YouTube</a>}
                {ex.social_steam && <a href={ex.social_steam} className="mag-social-chip hover:bg-[#1b2838] hover:text-white hover:border-[#1b2838]"><Gamepad2 className="w-3 h-3"/> Steam</a>}
              </div>
            </div>
          </div>

          {/* Large Pinned Hero Portrait */}
          <div className="relative group">
            <img 
              src={heroImg(p.pinnedHero.hero_id)} 
              alt={p.pinnedHero.name} 
              className={`mag-hero-large ${ex.pinned_hero_border ? "has-border" : ""}`}
              style={{ "--hero-border": ex.pinned_hero_border } as React.CSSProperties}
            />
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

          {/* Top Heroes Strip */}
          {ex.show_top_heroes && p.topHeroes.length > 0 && (
            <div className="mt-2">
              <div className="mag-eyebrow mb-4"><Star className="w-3 h-3"/> Top Heroes</div>
              <div className="mag-top-heroes-strip">
                {p.topHeroes.map(h => (
                  <div key={h.hero_id} className="mag-hero-card">
                    <img src={heroImg(h.hero_id)} alt={h.name} />
                    <div className="font-condensed text-xs font-bold truncate text-[var(--text-main)]">{h.name}</div>
                    <div className="flex justify-between font-condensed text-[10px] text-[var(--text-muted)]">
                      <span>{h.games}g</span>
                      <span className={Math.round((h.wins / h.games) * 100) >= 55 ? "text-[var(--radiant)]" : ""}>{Math.round((h.wins / h.games) * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Profile Rail */}
          <div className="mag-edit-rail">
            <div className="mag-eyebrow"><Settings2 className="w-4 h-4"/> Customization</div>
            <div className="flex flex-col gap-4 mt-4">
              
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-2">Theme Accent</label>
                <div className="flex gap-2">
                  {['#3b82f6', '#f59e0b', '#ef4444', '#10b981'].map(color => (
                    <div key={color} className={`w-6 h-6 rounded-full cursor-pointer border-2 ${color === accent ? 'border-white' : 'border-transparent'}`} style={{ background: color }} />
                  ))}
                  <div className="w-6 h-6 rounded-full cursor-not-allowed border border-[var(--border-subtle)] flex items-center justify-center bg-[var(--bg-card)]" title="Pro Colors">
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

        {/* RIGHT COLUMN: Stories & Insights */}
        <div className="magazine-right-col">
          
          {/* STORY: Latest Game */}
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

          {/* STORY: Current Form */}
          <article className="mag-story">
            <div className="mag-eyebrow"><Activity className="w-4 h-4"/> Current Form</div>
            <h2 className="mag-title">By The Numbers</h2>
            <p className="mag-subtitle">Recent performance over the last 30 matches</p>
            
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

            {/* MMR History Chart */}
            <div className="mt-8 p-6 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <div className="font-serif font-bold text-xl text-[var(--text-main)]">MMR Trajectory</div>
                  <div className="font-condensed text-xs text-[var(--text-muted)] uppercase tracking-widest mt-1">Peak: {p.rank.peak}</div>
                </div>
                <div className="font-condensed text-3xl font-bold text-[var(--accent-brass)]">{p.rank.mmr}</div>
              </div>
              
              <div className="h-[120px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mmrData}>
                    <Line type="monotone" dataKey="mmr" stroke={accent} strokeWidth={3} dot={false} />
                    <Tooltip 
                      contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}
                      labelStyle={{ display: 'none' }}
                      itemStyle={{ color: 'var(--text-main)', fontFamily: 'Oswald, sans-serif', fontWeight: 'bold' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </article>

          {/* STORY: AI Scouting Report (Pro Only) */}
          <article className={`mag-story ${isFree ? 'lock-overlay' : 'is-pro'}`}>
            <div className="mag-eyebrow"><Eye className="w-4 h-4"/> AI Scout Report {p.is_pro && <div className="pro-chip ml-2"><Star className="w-3 h-3"/> PRO</div>}</div>
            <h2 className="mag-title">The Book on {p.display_name}</h2>
            
            <div className="bg-[var(--bg-elev)] border border-[var(--border-subtle)] p-8 rounded-lg mt-6 relative">
              <div className="absolute top-4 right-4 text-[var(--border-strong)] opacity-20"><Sparkles className="w-16 h-16"/></div>
              
              <div className="font-serif italic text-xl text-[var(--text-main)] leading-relaxed border-l-4 border-[var(--accent-brass)] pl-6 mb-8 relative z-10">
                "{p.scouting.tldr}"
              </div>
              
              <div className="grid sm:grid-cols-2 gap-8 relative z-10">
                <div>
                  <h4 className="font-condensed text-sm font-bold uppercase tracking-widest text-[var(--radiant)] mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--radiant)]"></span> Strengths
                  </h4>
                  <ul className="space-y-2">
                    {p.scouting.strengths.map((s, i) => (
                      <li key={i} className="text-[var(--text-main)] text-sm font-medium border-b border-[var(--border-subtle)] pb-2 last:border-0">{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-condensed text-sm font-bold uppercase tracking-widest text-[var(--dire)] mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--dire)]"></span> Weaknesses
                  </h4>
                  <ul className="space-y-2">
                    {p.scouting.weaknesses.map((w, i) => (
                      <li key={i} className="text-[var(--text-main)] text-sm font-medium border-b border-[var(--border-subtle)] pb-2 last:border-0">{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {isFree && (
              <div className="lock-msg">
                <LockMessage />
              </div>
            )}
          </article>

          {/* STORY: Achievement Spotlight */}
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

function LockMessage() {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-[var(--bg-card)] border border-[var(--accent-amber)] rounded-lg shadow-2xl max-w-sm mx-auto">
      <Unlock className="w-8 h-8 text-[var(--accent-amber)] mb-3" />
      <div className="font-serif text-lg font-bold text-[var(--text-main)] mb-1">Unlock AI Scouting</div>
      <div className="text-xs text-[var(--text-muted)] text-center normal-case tracking-normal mb-4">Pro members get deep-dive AI analysis on every player in the league.</div>
      <button className="cta-primary text-sm px-6 py-2">Upgrade to Pro</button>
    </div>
  );
}
