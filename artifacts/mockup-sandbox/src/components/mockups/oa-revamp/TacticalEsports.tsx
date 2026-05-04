import React from "react";
import "./_tacticalesports.css";
import { 
  ChevronDown, Monitor, Trophy, Swords, Calendar, Settings,
  LogOut, Crosshair, Users, Activity, Clock, TrendingUp, ShieldAlert, FileText,
  UserCheck, Server, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function TacticalEsports() {
  return (
    <div className="tactical-esports min-h-screen bg-grid bg-[#0a0a0c] text-zinc-100 flex flex-col relative overflow-hidden scanline">
      {/* Top App Bar */}
      <header className="sticky top-0 z-50 bg-[#0a0a0c]/90 backdrop-blur-md border-b border-zinc-800/50 uppercase tracking-wide text-xs font-semibold">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img src="/__mockup/images/oa-logo.png" alt="OCE Inhouse" className="h-8 w-8 object-contain" />
              <div className="flex flex-col justify-center">
                <span className="leading-tight"><span className="text-zinc-100 font-bold">OCE</span> <span className="text-zinc-400 font-medium">INHOUSE</span></span>
              </div>
            </div>
            
            <nav className="hidden md:flex items-center gap-6 ml-4 text-zinc-400">
              <a href="#" className="hover:text-emerald-400 transition-colors text-emerald-400 flex items-center gap-2">
                <Monitor className="w-4 h-4" /> Home
              </a>
              <a href="#" className="hover:text-emerald-400 transition-colors flex items-center gap-2">
                <Swords className="w-4 h-4" /> Matches
              </a>
              <a href="#" className="hover:text-emerald-400 transition-colors flex items-center gap-2">
                <Trophy className="w-4 h-4" /> Leaderboard
              </a>
              <a href="#" className="hover:text-emerald-400 transition-colors">Heroes</a>
              <a href="#" className="hover:text-emerald-400 transition-colors flex items-center gap-1">Tools <ChevronDown className="w-3 h-3" /></a>
              <a href="#" className="hover:text-emerald-400 transition-colors">Tournaments</a>
              <a href="#" className="hover:text-emerald-400 transition-colors flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Schedule
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 px-3 py-1.5 clip-angled">
              <span className="text-emerald-400">S10</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </div>
            
            <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 p-1 pl-3 clip-angled hover:border-zinc-700 transition-colors cursor-pointer">
              <div className="flex flex-col text-right">
                <span className="text-zinc-200 lowercase font-mono tracking-normal text-[11px] leading-tight">u/cookie</span>
                <span className="text-emerald-400 font-mono text-[10px] leading-tight">7240 MMR</span>
              </div>
              <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie" alt="avatar" className="w-8 h-8 bg-zinc-800 p-0.5" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-8 flex flex-col gap-12 relative z-10">
        
        {/* Hero Section */}
        <section className="relative w-full overflow-hidden bg-zinc-950 border border-zinc-800 clip-angled-br p-12">
          {/* Subtle background decoration */}
          <div className="absolute top-0 right-0 w-[600px] h-full opacity-10 pointer-events-none">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full text-emerald-400 fill-current">
              <polygon points="0,100 100,0 100,100" />
            </svg>
          </div>
          
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-mono text-sm uppercase tracking-widest">Season 10 is Live</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold uppercase tracking-tight mb-4 leading-[1.1]">
              Track every inhouse.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
                Climb the OCE ladder.
              </span>
            </h1>
            
            <p className="text-zinc-400 text-lg mb-10 max-w-xl">
              OCE community Dota 2 stats & inhouse league. Real-time match data, advanced analytics, and competitive leaderboards.
            </p>
            
            <div className="flex items-center gap-4">
              <Button className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold uppercase tracking-wide px-8 h-12 clip-angled rounded-none border-none">
                Join the League
              </Button>
              <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white uppercase tracking-wide px-8 h-12 clip-angled rounded-none">
                View Leaderboard
              </Button>
            </div>
          </div>
        </section>

        {/* Quick Stats Strip */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Matches Played", value: "1,284", icon: Swords, color: "text-emerald-400" },
            { label: "Active Players", value: "87", icon: Users, color: "text-cyan-400" },
            { label: "Hours of Dota", value: "3,640", icon: Clock, color: "text-purple-400" },
            { label: "Top Hero (Last Wk)", value: "Pudge", sub: "64% WR", icon: Crosshair, color: "text-rose-400" }
          ].map((stat, i) => (
            <div key={i} className="bg-[#0a0a0c] border border-zinc-800/80 p-5 flex items-start justify-between relative overflow-hidden group hover:border-zinc-700 transition-colors">
              <div className="absolute top-0 left-0 w-1 h-full bg-zinc-800 group-hover:bg-zinc-600 transition-colors" />
              <div>
                <p className="text-zinc-500 uppercase text-[10px] font-bold tracking-wider mb-2">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-mono text-zinc-100">{stat.value}</span>
                  {stat.sub && <span className="text-xs font-mono text-emerald-400">{stat.sub}</span>}
                </div>
              </div>
              <stat.icon className={`w-5 h-5 ${stat.color} opacity-70`} />
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Latest Matches */}
          <section className="lg:col-span-2 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="uppercase font-bold tracking-widest text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> Recent Inhouses
              </h2>
              <a href="#" className="text-xs font-mono text-emerald-400 hover:underline">View All &gt;</a>
            </div>
            
            <div className="flex flex-col gap-2">
              {[
                { side: "Radiant", score: "42 - 38", duration: "45:12", mvp: "cookie", time: "2h ago", won: true },
                { side: "Dire", score: "21 - 45", duration: "32:04", mvp: "skitz", time: "4h ago", won: false },
                { side: "Radiant", score: "55 - 50", duration: "61:20", mvp: "phantom", time: "5h ago", won: true },
                { side: "Radiant", score: "30 - 15", duration: "25:40", mvp: "ninja", time: "8h ago", won: true },
                { side: "Dire", score: "39 - 41", duration: "48:15", mvp: "vortex", time: "12h ago", won: false },
              ].map((match, i) => (
                <div key={i} className="flex items-center justify-between bg-zinc-900/40 border border-zinc-800/50 p-3 hover:bg-zinc-800/60 transition-colors">
                  <div className="flex items-center gap-4 w-1/3">
                    <Badge className={`rounded-none uppercase tracking-widest text-[10px] px-2 py-0.5 ${match.side === 'Radiant' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900' : 'bg-rose-950/50 text-rose-400 border border-rose-900'}`}>
                      {match.side}
                    </Badge>
                    <span className="font-mono text-sm">{match.score}</span>
                  </div>
                  
                  <div className="w-1/4 text-center font-mono text-zinc-400 text-sm">
                    {match.duration}
                  </div>
                  
                  <div className="w-1/4 flex items-center gap-2 justify-center">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">MVP</span>
                    <span className="font-medium text-sm">{match.mvp}</span>
                  </div>
                  
                  <div className="w-1/6 text-right font-mono text-xs text-zinc-500">
                    {match.time}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Live Leaderboard Preview */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h2 className="uppercase font-bold tracking-widest text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Top Players
              </h2>
            </div>
            
            <div className="bg-zinc-900/40 border border-zinc-800/50 flex flex-col">
              {/* Header row */}
              <div className="flex items-center justify-between p-3 border-b border-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-950/50">
                <span className="w-8 text-center">#</span>
                <span className="flex-1">Player</span>
                <span className="w-16 text-right">MMR</span>
                <span className="w-20 text-right">W-L</span>
              </div>
              
              {[
                { rank: 1, name: "cookie", mmr: 7240, wl: "41-22", tier: "Immortal", color: "text-rose-400" },
                { rank: 2, name: "skitz", mmr: 6980, wl: "38-20", tier: "Immortal", color: "text-rose-400" },
                { rank: 3, name: "phantom", mmr: 6540, wl: "35-25", tier: "Divine", color: "text-yellow-400" },
                { rank: 4, name: "ninja", mmr: 6120, wl: "30-18", tier: "Divine", color: "text-yellow-400" },
                { rank: 5, name: "vortex", mmr: 5890, wl: "28-22", tier: "Ancient", color: "text-purple-400" },
              ].map((player, i) => (
                <div key={i} className="flex items-center justify-between p-3 border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/40 transition-colors">
                  <span className="w-8 text-center font-mono text-emerald-400">{player.rank}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${player.color} bg-current shadow-[0_0_8px_currentColor]`} />
                    <span className="font-medium text-sm truncate">{player.name}</span>
                  </div>
                  <span className="w-16 text-right font-mono text-zinc-300">{player.mmr}</span>
                  <span className="w-20 text-right font-mono text-zinc-500 text-xs">{player.wl}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Admin Sidebar Preview Block */}
        <section className="mt-8 border border-zinc-800 bg-zinc-950 clip-angled-tl flex flex-col">
          <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              <h2 className="uppercase font-bold tracking-widest text-sm">Admin Panel — New Layout</h2>
            </div>
            <Badge className="bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-none uppercase text-[10px]">Preview</Badge>
          </div>
          
          <div className="flex h-[500px]">
            {/* Admin Sidebar */}
            <div className="w-64 border-r border-zinc-800 bg-[#0a0a0c] p-4 flex flex-col gap-6 overflow-y-auto">
              
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Match Data</span>
                <button className="text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <FileText className="w-3.5 h-3.5" /> Record Match
                </button>
                <button className="text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <Activity className="w-3.5 h-3.5" /> Replays
                </button>
                <button className="text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <Monitor className="w-3.5 h-3.5" /> Match List
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Players</span>
                <button className="text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <Users className="w-3.5 h-3.5" /> Roster
                </button>
                <button className="text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <UserCheck className="w-3.5 h-3.5" /> Nicknames
                </button>
                <button className="text-left text-sm text-rose-400/80 hover:text-rose-400 hover:bg-rose-950/30 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <LogOut className="w-3.5 h-3.5" /> Bans
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Seasons</span>
                <button className="text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <Settings className="w-3.5 h-3.5" /> Settings
                </button>
                <button className="text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <FileText className="w-3.5 h-3.5" /> Patch Notes
                </button>
                <button className="text-left text-sm text-zinc-100 bg-zinc-800/80 border border-zinc-700/50 px-3 py-1.5 flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-emerald-400" /> Welcome Modal
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">System</span>
                <button className="text-left text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-3 py-1.5 flex items-center gap-2 transition-colors">
                  <Server className="w-3.5 h-3.5" /> Feature Flags
                </button>
              </div>

            </div>

            {/* Admin Right Pane */}
            <div className="flex-1 bg-zinc-950 p-8 flex gap-8">
              {/* Form */}
              <div className="flex-1 flex flex-col gap-5">
                <h3 className="text-xl font-bold uppercase tracking-tight border-b border-zinc-800 pb-4">Welcome Modal Settings</h3>
                
                <div className="flex flex-col gap-4 max-w-md">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Eyebrow Text</label>
                    <input type="text" defaultValue="UPDATE 5.59" className="bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm font-mono focus:border-emerald-500 outline-none transition-colors" />
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Title</label>
                    <input type="text" defaultValue="Season 10 Kickoff" className="bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm font-mono focus:border-emerald-500 outline-none transition-colors" />
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Body Content</label>
                    <textarea rows={4} defaultValue="MMR has been softly reset. Draft phase is now captain's mode by default. Good luck out there." className="bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm font-mono focus:border-emerald-500 outline-none transition-colors resize-none" />
                  </div>
                  
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-4 bg-emerald-500/20 border border-emerald-500/50 p-0.5 flex">
                        <div className="w-3 h-3 bg-emerald-400 translate-x-3.5 transition-transform" />
                      </div>
                      <span className="text-xs font-mono uppercase text-zinc-300">Enabled</span>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-[10px] uppercase tracking-widest text-zinc-500">Version</span>
                      <input type="text" defaultValue="v2.1" className="bg-zinc-900 border border-zinc-800 w-16 px-2 py-1 text-center text-xs font-mono" />
                    </div>
                  </div>
                  
                  <Button className="mt-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-none clip-angled uppercase font-bold tracking-wider">Save Changes</Button>
                </div>
              </div>

              {/* Live Preview */}
              <div className="w-[320px] flex flex-col gap-3">
                <span className="text-[10px] uppercase font-bold text-zinc-600 tracking-wider">Live Preview</span>
                <div className="border border-zinc-700 bg-[#0a0a0c] p-6 shadow-2xl relative overflow-hidden clip-angled-br">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500" />
                  <span className="text-emerald-400 font-mono text-[10px] uppercase tracking-widest block mb-2">UPDATE 5.59</span>
                  <h4 className="text-xl font-bold uppercase tracking-tight mb-3">Season 10 Kickoff</h4>
                  <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                    MMR has been softly reset. Draft phase is now captain's mode by default. Good luck out there.
                  </p>
                  <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-white rounded-none border border-zinc-700 uppercase text-xs tracking-wider">
                    Acknowledge
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 bg-[#0a0a0c] mt-auto relative z-10">
        <div className="max-w-[1280px] mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-mono text-zinc-500">
          <div>
            &copy; {new Date().getFullYear()} OCE INHOUSE. All rights reserved.
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-emerald-400 transition-colors uppercase tracking-wider">Discord</a>
            <a href="#" className="hover:text-emerald-400 transition-colors uppercase tracking-wider">GitHub</a>
            <div className="w-1 h-1 bg-zinc-700 rounded-full" />
            <span className="text-zinc-400">v5.59 — Patch Notes</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
