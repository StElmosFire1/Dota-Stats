import React from "react";
import { 
  Trophy, ChevronRight, Sword, Shield, Clock, Users, Play, ArrowUpRight, Check, X, ShieldHalf, TrendingUp, Calendar, ArrowRight
} from "lucide-react";
import "./_group.css";
import { PressBoxNav } from "./_shared/PressBoxNav";

export function Home() {
  return (
    <div className="pressbox min-h-screen pb-16">
      <PressBoxNav active="Home" user="Sleek" />

      {/* Hero Section */}
      <div className="relative">
        <div className="absolute inset-0 z-0">
          <img 
            src="/__mockup/images/pressbox-hero.png" 
            alt="Arena" 
            className="w-full h-full object-cover opacity-30 mix-blend-overlay"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--pb-bg)]/20 via-[var(--pb-bg)]/80 to-[var(--pb-bg)]" />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-16">
          <div className="flex flex-col md:flex-row gap-12 items-end justify-between">
            <div className="max-w-2xl">
              <div className="pb-eyebrow mb-4 flex items-center gap-3">
                <span className="inline-block w-8 h-px bg-[var(--pb-brass)]"></span>
                Season 14 • Week 3
              </div>
              <h1 className="pb-serif text-5xl md:text-7xl mb-6 leading-tight">
                The Premier <br />
                <span className="text-[var(--pb-brass-bright)] italic">Oceanic Pro</span> League.
              </h1>
              <p className="text-[var(--pb-muted)] text-lg mb-8 max-w-lg leading-relaxed">
                Elevating the competitive standard for Dota 2 in Oceania. Exclusive divisions, nightly lobbies, and prize-pool tournaments.
              </p>
              <div className="flex items-center gap-4">
                <button className="bg-[var(--pb-amber)] hover:bg-[#d97706] text-black font-semibold px-8 py-3 rounded pb-cond tracking-widest text-sm transition-colors flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" />
                  Join Queue
                </button>
                <button className="border border-[var(--pb-line)] hover:border-[var(--pb-brass)] text-[var(--pb-text)] px-8 py-3 rounded pb-cond tracking-widest text-sm transition-colors flex items-center gap-2">
                  View Leaderboard
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Personal Welcome Strip */}
            <div className="pb-card p-6 min-w-[320px] backdrop-blur-md bg-[var(--pb-surface)]/80 border-[var(--pb-brass)]/30">
              <div className="flex justify-between items-center mb-6">
                <div className="pb-eyebrow">Your Status</div>
                <div className="flex items-center gap-1 text-[var(--pb-radiant)] text-xs font-semibold uppercase tracking-wider">
                  <TrendingUp className="w-3 h-3" />
                  +42 MMR (Week)
                </div>
              </div>
              <div className="flex items-end gap-6 mb-6">
                <div>
                  <div className="text-[var(--pb-faint)] text-xs uppercase tracking-wider mb-1">Rating</div>
                  <div className="pb-serif text-4xl text-[var(--pb-brass-bright)]">6,420</div>
                </div>
                <div>
                  <div className="text-[var(--pb-faint)] text-xs uppercase tracking-wider mb-1">Rank</div>
                  <div className="pb-serif text-2xl">#14</div>
                </div>
              </div>
              <div className="h-px bg-gradient-to-r from-[var(--pb-line)] to-transparent mb-4" />
              <div className="flex justify-between items-center text-sm text-[var(--pb-muted)]">
                <span>Streak: <span className="text-[var(--pb-radiant)] font-medium">3W</span></span>
                <span>Win Rate: <span className="text-[var(--pb-text)]">54.2%</span></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Active Lobby Status */}
        <div className="pb-card border-[var(--pb-brass)]/50 mb-12 flex flex-col md:flex-row items-center justify-between p-6 gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-full bg-[var(--pb-brass)]/5 blur-[80px] rounded-full pointer-events-none" />
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 rounded-full border border-[var(--pb-amber)] flex items-center justify-center relative">
              <div className="absolute inset-0 rounded-full border border-[var(--pb-amber)] animate-ping opacity-20" />
              <Users className="w-6 h-6 text-[var(--pb-amber)]" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="pb-serif text-2xl">Active Lobby</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[var(--pb-elevated)] border border-[var(--pb-line)] text-[var(--pb-radiant)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--pb-radiant)] animate-pulse" />
                  Queueing
                </span>
              </div>
              <p className="text-[var(--pb-muted)] text-sm">Div 1 & 2 • Captains Mode</p>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-3xl pb-serif text-[var(--pb-text)]">7<span className="text-[var(--pb-faint)]">/10</span></div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--pb-muted)]">Players</div>
            </div>
            <button className="bg-[var(--pb-elevated)] hover:bg-[var(--pb-surface-2)] border border-[var(--pb-line)] hover:border-[var(--pb-amber)] text-[var(--pb-text)] px-8 py-3 rounded pb-cond tracking-widest text-sm transition-all shadow-[0_0_15px_rgba(245,158,11,0.1)] hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              Join Lobby
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Recent Matches */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="pb-serif text-2xl flex items-center gap-3">
                Recent Matches
                <span className="h-px w-12 bg-[var(--pb-line)] inline-block" />
              </h2>
              <button className="text-[var(--pb-brass)] hover:text-[var(--pb-brass-bright)] text-sm pb-cond uppercase tracking-widest flex items-center gap-1 transition-colors">
                View All <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <MatchRow id="891244" result="W" hero="Puck" role="Mid" kda="12/3/15" duration="34:12" date="2 hrs ago" rating="+25" />
              <MatchRow id="891231" result="L" hero="Storm Spirit" role="Mid" kda="4/6/8" duration="41:05" date="5 hrs ago" rating="-24" />
              <MatchRow id="891198" result="W" hero="Ember Spirit" role="Mid" kda="18/1/10" duration="28:45" date="Yesterday" rating="+26" />
              <MatchRow id="891142" result="W" hero="Void Spirit" role="Mid" kda="9/4/12" duration="36:20" date="Yesterday" rating="+25" />
              <MatchRow id="891005" result="L" hero="Queen of Pain" role="Mid" kda="6/8/4" duration="31:15" date="2 days ago" rating="-25" />
            </div>
          </div>

          {/* Right Column: Stats & MMR */}
          <div className="space-y-8">
            <div>
              <h2 className="pb-serif text-2xl mb-6 flex items-center gap-3">
                Rating Trend
                <span className="h-px w-12 bg-[var(--pb-line)] inline-block" />
              </h2>
              <div className="pb-card p-5 h-48 flex flex-col justify-end relative">
                {/* Hand-rolled area chart */}
                <div className="absolute inset-0 p-5 pb-8 pt-10 overflow-hidden">
                  <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible preserve-3d" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--pb-brass)" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="var(--pb-brass)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path 
                      d="M0,35 L10,32 L20,38 L30,25 L40,28 L50,15 L60,18 L70,8 L80,12 L90,5 L100,2 L100,40 L0,40 Z" 
                      fill="url(#area-gradient)" 
                    />
                    <path 
                      d="M0,35 L10,32 L20,38 L30,25 L40,28 L50,15 L60,18 L70,8 L80,12 L90,5 L100,2" 
                      fill="none" 
                      stroke="var(--pb-brass)" 
                      strokeWidth="1.5" 
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle cx="100" cy="2" r="3" fill="var(--pb-bg)" stroke="var(--pb-brass-bright)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </svg>
                </div>
                <div className="relative flex justify-between items-end border-t border-[var(--pb-line)]/50 pt-2 mt-auto">
                  <div className="text-[10px] text-[var(--pb-faint)] uppercase tracking-widest">30 Days</div>
                  <div className="text-xs text-[var(--pb-radiant)] font-medium">+145</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <StatCard title="Matches" value="128" subtitle="This Season" />
              <StatCard title="Win Rate" value="54.2%" subtitle="Top 15%" />
              <StatCard title="Avg KDA" value="4.2" subtitle="3.5 League Avg" />
              <StatCard title="Best Hero" value="Puck" subtitle="68% WR (25 GM)" />
            </div>

          </div>
        </div>

        {/* Upcoming Games Rail */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="pb-serif text-2xl flex items-center gap-3">
              Upcoming Scheduled Games
              <span className="h-px w-12 bg-[var(--pb-line)] inline-block" />
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScheduledGame date="Today, 8:00 PM AEST" title="Div 1 Showdown" teams="Team Alpha vs Team Beta" />
            <ScheduledGame date="Tomorrow, 7:30 PM AEST" title="Div 2 Qualifier" teams="Omega vs Delta" />
            <ScheduledGame date="Friday, 9:00 PM AEST" title="All-Star Lobby" teams="Captains Draft" />
          </div>
        </div>

      </div>
      
      {/* Footer */}
      <footer className="mt-20 border-t border-[var(--pb-line)] bg-[var(--pb-bg-2)] py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-[var(--pb-brass)] opacity-50" />
            <span className="pb-serif text-lg text-[var(--pb-faint)]">OCE Inhouse</span>
          </div>
          <div className="flex gap-6 pb-cond text-sm tracking-widest uppercase text-[var(--pb-faint)]">
            <a href="#" className="hover:text-[var(--pb-brass)] transition-colors">Rules</a>
            <a href="#" className="hover:text-[var(--pb-brass)] transition-colors">Discord</a>
            <a href="#" className="hover:text-[var(--pb-brass)] transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Sub-components

function MatchRow({ id, result, hero, role, kda, duration, date, rating }: any) {
  const isWin = result === 'W';
  return (
    <div className="pb-card p-4 flex items-center justify-between hover:border-[var(--pb-brass)]/50 transition-colors cursor-pointer group">
      <div className="flex items-center gap-5">
        <div className={`w-10 h-10 rounded bg-[var(--pb-elevated)] border flex items-center justify-center ${
          isWin ? 'border-[var(--pb-radiant)]/30 text-[var(--pb-radiant)]' : 'border-[var(--pb-dire)]/30 text-[var(--pb-dire)]'
        }`}>
          <Sword className="w-5 h-5 opacity-80" />
        </div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-[var(--pb-text)] font-medium">{hero}</span>
            <span className="text-[10px] uppercase tracking-widest text-[var(--pb-faint)] px-1.5 py-0.5 rounded bg-[var(--pb-elevated)]">{role}</span>
          </div>
          <div className="text-xs text-[var(--pb-muted)] flex items-center gap-2">
            <span>Match #{id}</span>
            <span className="w-1 h-1 rounded-full bg-[var(--pb-line)]" />
            <span>{date}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-8 text-right">
        <div className="hidden sm:block">
          <div className="text-[var(--pb-text)] text-sm mb-1">{kda}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--pb-faint)]">K/D/A</div>
        </div>
        <div className="hidden sm:block">
          <div className="text-[var(--pb-text)] text-sm mb-1">{duration}</div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--pb-faint)]">Duration</div>
        </div>
        <div className="w-16">
          <div className={`text-sm font-bold ${isWin ? 'text-[var(--pb-radiant)]' : 'text-[var(--pb-dire)]'}`}>
            {rating}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--pb-faint)]">MMR</div>
        </div>
        <ChevronRight className="w-5 h-5 text-[var(--pb-faint)] group-hover:text-[var(--pb-brass)] transition-colors" />
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string, value: string, subtitle: string }) {
  return (
    <div className="pb-card p-4">
      <div className="text-[10px] text-[var(--pb-faint)] uppercase tracking-widest mb-2">{title}</div>
      <div className="pb-serif text-2xl text-[var(--pb-text)] mb-1">{value}</div>
      <div className="text-xs text-[var(--pb-muted)]">{subtitle}</div>
    </div>
  );
}

function ScheduledGame({ date, title, teams }: { date: string, title: string, teams: string }) {
  return (
    <div className="pb-card p-5 hover:border-[var(--pb-brass)]/40 transition-colors cursor-pointer group">
      <div className="flex items-center gap-2 text-[var(--pb-amber)] text-xs font-semibold uppercase tracking-wider mb-3">
        <Calendar className="w-3.5 h-3.5" />
        {date}
      </div>
      <div className="pb-serif text-lg text-[var(--pb-text)] mb-1 group-hover:text-[var(--pb-brass-bright)] transition-colors">{title}</div>
      <div className="text-sm text-[var(--pb-muted)]">{teams}</div>
    </div>
  );
}
