import React, { useState } from "react";
import { 
  ChevronDown, 
  Trophy, 
  Swords, 
  TrendingUp, 
  Target, 
  Shield, 
  Activity, 
  Flame, 
  Medal, 
  Star, 
  Award,
  Lock,
  Search,
  Crosshair,
  Zap,
  BarChart3
} from "lucide-react";
import "./_group.css";
import { PressBoxNav } from "./_shared/PressBoxNav";

// -----------------------------------------------------------------------------
// INLINE SVG CHARTS
// -----------------------------------------------------------------------------

function MmrChart() {
  const points = [
    { x: 0, y: 80 }, { x: 10, y: 75 }, { x: 20, y: 65 }, { x: 30, y: 70 },
    { x: 40, y: 55 }, { x: 50, y: 50 }, { x: 60, y: 60 }, { x: 70, y: 45 },
    { x: 80, y: 35 }, { x: 90, y: 40 }, { x: 100, y: 20 }
  ];
  
  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(" L ")}`;
  const areaD = `${pathD} L 100,100 L 0,100 Z`;

  return (
    <div className="relative w-full h-[180px]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
        {/* Grid lines */}
        {[25, 50, 75].map((y, i) => (
          <line key={i} x1="0" y1={y} x2="100" y2={y} stroke="var(--pb-line)" strokeWidth="0.5" strokeDasharray="2 2" />
        ))}
        <defs>
          <linearGradient id="mmr-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--pb-brass)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--pb-brass)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#mmr-gradient)" />
        <path d={pathD} fill="none" stroke="var(--pb-brass-bright)" strokeWidth="1.5" className="drop-shadow-[0_0_8px_rgba(225,199,154,0.5)]" />
        <circle cx="100" cy="20" r="2" fill="var(--pb-bg)" stroke="var(--pb-brass-bright)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function PerfChart() {
  const bars = [
    { val: 60 }, { val: 45 }, { val: -20 }, { val: 80 }, { val: 30 },
    { val: 90 }, { val: 100 }, { val: -10 }, { val: 50 }, { val: 75 }
  ];

  return (
    <div className="relative w-full h-[180px] flex items-end justify-between gap-1 pb-4">
      <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--pb-line)]" />
      {bars.map((bar, i) => {
        const isPos = bar.val >= 0;
        const height = Math.abs(bar.val) * 0.45;
        return (
          <div key={i} className="relative w-full flex flex-col justify-center h-full">
            {isPos ? (
              <div 
                className="absolute bottom-1/2 left-0 right-0 bg-[var(--pb-radiant)] opacity-80 rounded-t-sm"
                style={{ height: `${height}%` }}
              />
            ) : (
              <div 
                className="absolute top-1/2 left-0 right-0 bg-[var(--pb-dire)] opacity-80 rounded-b-sm"
                style={{ height: `${height}%` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------

export function PlayerProfile() {
  return (
    <div className="pressbox min-h-screen pb-24">
      <PressBoxNav active="Leaderboard" user="Sleek" />

      <main className="max-w-[1280px] mx-auto px-6 mt-12">
        {/* HEADER */}
        <header className="flex flex-col md:flex-row gap-8 items-start md:items-end justify-between mb-16">
          <div className="flex items-end gap-8">
            <div className="relative">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-xl overflow-hidden border-2 border-[var(--pb-brass)] shadow-[0_0_30px_rgba(197,169,117,0.15)] relative z-10">
                <img src="/__mockup/images/upscale-player-avatar.png" alt="Kelsier" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-4 -right-4 w-12 h-12 bg-[var(--pb-surface)] border border-[var(--pb-brass)] rounded-full flex items-center justify-center z-20 shadow-lg">
                <span className="pb-serif text-xl text-[var(--pb-brass-bright)]">#4</span>
              </div>
            </div>
            
            <div className="flex flex-col gap-3 pb-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded text-[10px] pb-cond tracking-widest bg-[var(--pb-brass)] text-[var(--pb-bg)] font-bold">
                  PRO DIV 1
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] pb-cond tracking-widest border border-[var(--pb-line)] text-[var(--pb-muted)]">
                  FOUNDING MEMBER
                </span>
              </div>
              <h1 className="pb-serif text-5xl md:text-7xl text-[var(--pb-text)] leading-none m-0">Kelsier</h1>
              <div className="flex items-center gap-6 mt-2">
                <div className="flex flex-col">
                  <span className="pb-eyebrow text-[var(--pb-faint)]">Current MMR</span>
                  <span className="pb-serif text-2xl text-[var(--pb-brass-bright)]">7,240</span>
                </div>
                <div className="w-px h-8 bg-[var(--pb-line)]"></div>
                <div className="flex flex-col">
                  <span className="pb-eyebrow text-[var(--pb-faint)]">Win Rate</span>
                  <span className="pb-serif text-2xl text-[var(--pb-text)]">54.2%</span>
                </div>
                <div className="w-px h-8 bg-[var(--pb-line)]"></div>
                <div className="flex flex-col">
                  <span className="pb-eyebrow text-[var(--pb-faint)]">Total Matches</span>
                  <span className="pb-serif text-2xl text-[var(--pb-text)]">1,402</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 w-full md:w-auto">
            <button className="pb-card px-6 py-3 flex items-center justify-between gap-8 hover:border-[var(--pb-brass)] transition-colors group">
              <span className="pb-cond text-sm tracking-widest text-[var(--pb-muted)] group-hover:text-[var(--pb-text)]">COMPARE VS.</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--pb-text)]">Select Player</span>
                <ChevronDown className="w-4 h-4 text-[var(--pb-faint)]" />
              </div>
            </button>
            <div className="flex gap-2">
              <button className="flex-1 pb-card px-4 py-2 text-center pb-cond text-[11px] tracking-widest text-[var(--pb-muted)] hover:text-[var(--pb-text)] hover:border-[var(--pb-brass)] transition-colors">
                VIEW MATCHES
              </button>
              <button className="flex-1 pb-card px-4 py-2 text-center pb-cond text-[11px] tracking-widest text-[var(--pb-muted)] hover:text-[var(--pb-text)] hover:border-[var(--pb-brass)] transition-colors">
                SHARE PROFILE
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-16">
          {/* MMR HISTORY */}
          <div className="pb-card p-6 lg:col-span-7 flex flex-col">
            <div className="flex items-center justify-between mb-8 border-b border-[var(--pb-line)] pb-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-[var(--pb-brass)]" />
                <h2 className="pb-cond text-lg tracking-widest text-[var(--pb-text)] m-0">RATING TRAJECTORY</h2>
              </div>
              <div className="flex gap-4">
                <span className="pb-eyebrow text-[var(--pb-brass-bright)]">SEASON 12</span>
                <span className="pb-eyebrow text-[var(--pb-faint)] cursor-pointer hover:text-[var(--pb-text)]">ALL TIME</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-end">
              <div className="flex justify-between items-end mb-2 px-2">
                <span className="text-[11px] text-[var(--pb-faint)]">6,500</span>
                <span className="text-[11px] text-[var(--pb-brass-bright)] font-bold">7,240 Peak</span>
              </div>
              <MmrChart />
            </div>
          </div>

          {/* PERF MODIFIER */}
          <div className="pb-card p-6 lg:col-span-5 flex flex-col">
            <div className="flex items-center justify-between mb-8 border-b border-[var(--pb-line)] pb-4">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-[var(--pb-brass)]" />
                <h2 className="pb-cond text-lg tracking-widest text-[var(--pb-text)] m-0">PERF MODIFIER</h2>
              </div>
              <span className="pb-serif text-xl text-[var(--pb-brass-bright)]">+142</span>
            </div>
            <div className="flex-1 flex flex-col justify-end">
              <PerfChart />
              <div className="flex justify-between mt-4 text-[10px] pb-cond tracking-widest text-[var(--pb-faint)]">
                <span>10 MATCHES AGO</span>
                <span>CURRENT</span>
              </div>
            </div>
          </div>
        </div>

        {/* ACHIEVEMENTS */}
        <div className="mb-16">
          <div className="flex items-center justify-between mb-6 border-b border-[var(--pb-line)] pb-4">
            <h2 className="pb-cond text-lg tracking-widest text-[var(--pb-text)] m-0">TROPHY CABINET</h2>
            <div className="flex gap-6">
              <span className="pb-eyebrow text-[var(--pb-brass-bright)]">ALL</span>
              <span className="pb-eyebrow text-[var(--pb-faint)]">SEASONAL</span>
              <span className="pb-eyebrow text-[var(--pb-faint)]">MILESTONES</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { icon: Trophy, title: "S11 CHAMPION", desc: "Div 1 Winner", earned: true },
              { icon: Star, title: "MVP", desc: "Grand Finals", earned: true },
              { icon: Flame, title: "STREAK", desc: "15+ Win Streak", earned: true },
              { icon: Swords, title: "GLADIATOR", desc: "1000+ Kills", earned: true },
              { icon: Medal, title: "VETERAN", desc: "500+ Matches", earned: true },
              { icon: Lock, title: "INVINCIBLE", desc: "0 Deaths in 5 games", earned: false },
            ].map((ach, i) => (
              <div key={i} className={`pb-card p-5 flex flex-col items-center text-center gap-3 ${!ach.earned ? 'opacity-40 grayscale' : ''}`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${ach.earned ? 'border-[var(--pb-brass)] bg-[var(--pb-brass)]/10' : 'border-[var(--pb-line)] bg-[var(--pb-surface-2)]'}`}>
                  <ach.icon className={`w-6 h-6 ${ach.earned ? 'text-[var(--pb-brass-bright)]' : 'text-[var(--pb-faint)]'}`} />
                </div>
                <div>
                  <div className="pb-cond text-[12px] tracking-widest text-[var(--pb-text)]">{ach.title}</div>
                  <div className="text-[11px] text-[var(--pb-faint)] mt-1">{ach.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* STAT SECTIONS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* HERO MASTERY */}
          <div className="lg:col-span-1">
            <h2 className="pb-cond text-lg tracking-widest text-[var(--pb-text)] mb-6 border-b border-[var(--pb-line)] pb-4">SIGNATURE HEROES</h2>
            <div className="flex flex-col gap-4">
              {[
                { name: "Earth Spirit", games: 142, win: 62.4, kda: "3.4", img: "earth_spirit" },
                { name: "Ember Spirit", games: 98, win: 58.1, kda: "4.1", img: "ember_spirit" },
                { name: "Rubick", games: 85, win: 55.3, kda: "2.8", img: "rubick" },
              ].map((hero, i) => (
                <div key={i} className="pb-card p-4 flex items-center gap-4 group hover:border-[var(--pb-brass)] transition-colors">
                  <div className="w-14 h-14 bg-[var(--pb-surface-2)] border border-[var(--pb-line)] rounded overflow-hidden flex-shrink-0">
                    {/* Placeholder for hero image */}
                    <div className="w-full h-full bg-[var(--pb-elevated)] flex items-center justify-center text-[var(--pb-faint)] pb-cond text-[10px]">
                      {hero.name.substring(0,3).toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="pb-serif text-lg text-[var(--pb-text)]">{hero.name}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-[var(--pb-muted)]"><span className="text-[var(--pb-brass-bright)]">{hero.games}</span> M</span>
                      <span className="text-[11px] text-[var(--pb-muted)]"><span className="text-[var(--pb-radiant)]">{hero.win}%</span> WR</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="pb-cond text-xl text-[var(--pb-text)]">{hero.kda}</div>
                    <div className="pb-eyebrow text-[var(--pb-faint)]">KDA</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ITEM BENCHMARKS */}
          <div className="lg:col-span-1">
            <h2 className="pb-cond text-lg tracking-widest text-[var(--pb-text)] mb-6 border-b border-[var(--pb-line)] pb-4">TIMING BENCHMARKS</h2>
            <div className="pb-card p-5">
              <div className="flex flex-col gap-5">
                {[
                  { item: "Blink Dagger", time: "14:20", avg: "15:30", stat: "Top 5%" },
                  { item: "BKB", time: "16:45", avg: "18:10", stat: "Top 8%" },
                  { item: "Aghanim's Scepter", time: "22:15", avg: "24:00", stat: "Top 12%" },
                  { item: "Black King Bar", time: "25:30", avg: "26:15", stat: "Top 20%" },
                ].map((bench, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[var(--pb-elevated)] border border-[var(--pb-line)] rounded"></div>
                      <span className="text-sm text-[var(--pb-text)]">{bench.item}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="pb-serif text-[var(--pb-brass-bright)]">{bench.time}</span>
                      <span className="text-[10px] text-[var(--pb-radiant)]">{bench.stat}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* NEMESIS */}
          <div className="lg:col-span-1">
            <h2 className="pb-cond text-lg tracking-widest text-[var(--pb-text)] mb-6 border-b border-[var(--pb-line)] pb-4">RIVALRY</h2>
            <div className="flex flex-col gap-4">
              <div className="pb-card p-5 border-l-2 border-l-[var(--pb-dire)]">
                <div className="pb-eyebrow text-[var(--pb-dire)] mb-3 flex items-center gap-2">
                  <Crosshair className="w-3 h-3" /> NEMESIS
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[var(--pb-elevated)] border border-[var(--pb-dire)]/30 flex items-center justify-center text-[var(--pb-faint)]">
                    <span className="pb-serif">S</span>
                  </div>
                  <div className="flex-1">
                    <div className="pb-serif text-lg text-[var(--pb-text)]">SaberLight</div>
                    <div className="text-sm text-[var(--pb-muted)]">35% Win Rate vs</div>
                  </div>
                  <div className="pb-serif text-2xl text-[var(--pb-dire)]">4 - 12</div>
                </div>
              </div>

              <div className="pb-card p-5 border-l-2 border-l-[var(--pb-radiant)]">
                <div className="pb-eyebrow text-[var(--pb-radiant)] mb-3 flex items-center gap-2">
                  <Zap className="w-3 h-3" /> PREY
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[var(--pb-elevated)] border border-[var(--pb-radiant)]/30 flex items-center justify-center text-[var(--pb-faint)]">
                    <span className="pb-serif">Q</span>
                  </div>
                  <div className="flex-1">
                    <div className="pb-serif text-lg text-[var(--pb-text)]">Qojqva</div>
                    <div className="text-sm text-[var(--pb-muted)]">78% Win Rate vs</div>
                  </div>
                  <div className="pb-serif text-2xl text-[var(--pb-radiant)]">14 - 4</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
