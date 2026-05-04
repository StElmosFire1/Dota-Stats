import React from "react";
import "./_tacticalbroadcast.css";
import { 
  ChevronDown, Trophy, Clock, Users, Activity, Crosshair, Shield,
  Settings, LogOut, FileText, UserCheck, Server, Monitor, Swords,
  AlertCircle, Info, Hash, CalendarDays, BarChart3, ChevronRight, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function TacticalBroadcast() {
  return (
    <div className="tactical-broadcast min-h-screen flex flex-col relative scanlines">
      {/* Ticker Tape */}
      <div className="bg-[#f59e0b] text-[#0f172a] h-6 flex items-center overflow-hidden uppercase font-display font-bold text-sm tracking-wider">
        <div className="animate-marquee px-4 whitespace-nowrap">
          <span className="mx-4">• MATCH OF THE DAY: RADIANT VS DIRE</span>
          <span className="mx-4">• S10 LEADERBOARD RESET IN 2 DAYS</span>
          <span className="mx-4">• U/COOKIE ACHIEVES 7K MMR MILESTONE</span>
          <span className="mx-4">• NEW DRAFT RULES IN EFFECT</span>
          <span className="mx-4">• MATCH OF THE DAY: RADIANT VS DIRE</span>
          <span className="mx-4">• S10 LEADERBOARD RESET IN 2 DAYS</span>
          <span className="mx-4">• U/COOKIE ACHIEVES 7K MMR MILESTONE</span>
          <span className="mx-4">• NEW DRAFT RULES IN EFFECT</span>
        </div>
      </div>

      <header className="border-b-2 border-[#1e293b] bg-[#111318]/95 backdrop-blur-sm sticky top-0 z-50 uppercase tracking-widest text-xs font-display">
        <div className="max-w-[1280px] mx-auto h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-[#f59e0b] p-1 clip-corner-tr">
                <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-8 h-8 invert" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-bold text-lg text-white">OCE</span>
                <span className="text-[#f59e0b] font-semibold tracking-[0.2em]">INHOUSE</span>
              </div>
            </div>

            <div className="h-8 w-0.5 bg-[#1e293b] mx-2 hidden md:block"></div>

            <nav className="hidden md:flex items-center gap-6 font-semibold text-[#94a3b8]">
              <a href="#" className="text-white hover:text-[#f59e0b] transition-colors flex items-center gap-1.5"><Monitor className="w-4 h-4 text-[#f59e0b]" /> HOME</a>
              <a href="#" className="hover:text-white transition-colors flex items-center gap-1.5"><Swords className="w-4 h-4" /> MATCHES</a>
              <a href="#" className="hover:text-white transition-colors flex items-center gap-1.5"><Trophy className="w-4 h-4" /> LEADERBOARD</a>
              <a href="#" className="hover:text-white transition-colors">HEROES</a>
              <a href="#" className="hover:text-white transition-colors flex items-center gap-1">TOOLS <ChevronDown className="w-3 h-3" /></a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-col text-right">
              <span className="text-[#94a3b8] text-[10px] leading-tight">CURRENT SEASON</span>
              <span className="text-white font-bold text-sm leading-none flex items-center gap-1 justify-end">S10 <ChevronDown className="w-3 h-3 text-[#f59e0b]" /></span>
            </div>
            
            <div className="h-8 w-0.5 bg-[#1e293b] mx-2 hidden md:block"></div>

            <div className="flex items-center gap-3 bg-[#1e293b] pl-4 pr-1 py-1 clip-corner">
              <div className="flex flex-col text-right">
                <span className="text-white font-bold lowercase tracking-normal">u/cookie</span>
                <span className="text-[#f59e0b] font-mono text-[10px]">7240 MMR</span>
              </div>
              <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie&backgroundColor=0f172a" className="w-8 h-8 clip-corner-tr" alt="Avatar" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1280px] mx-auto p-6 space-y-8">
        
        {/* Hero */}
        <section className="tactical-broadcast-hero-bg border-2 border-[#1e293b] clip-corner-tr bg-[#181a20] relative p-12 overflow-hidden flex flex-col justify-center min-h-[400px]">
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-1/4 translate-y-1/4">
            <Trophy className="w-[600px] h-[600px]" />
          </div>
          
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-3 py-1.5 mb-6 text-[#f59e0b] font-display font-bold uppercase tracking-widest text-sm">
              <div className="w-2 h-2 bg-[#f59e0b] animate-pulse"></div>
              BROADCAST LIVE
            </div>
            
            <h1 className="font-display text-6xl md:text-7xl font-bold uppercase text-white leading-none tracking-tight mb-4">
              TRACK EVERY INHOUSE<br/>
              <span className="text-[#f59e0b]">CLIMB THE LADDER</span>
            </h1>
            
            <p className="text-[#94a3b8] text-lg max-w-xl mb-8 font-medium">
              The premier Dota 2 league for OCE. Advanced stats, live drafts, and professional-grade tracking.
            </p>
            
            <div className="flex items-center gap-4">
              <Button className="bg-[#f59e0b] hover:bg-[#d97706] text-[#0f172a] font-display font-bold text-lg uppercase tracking-wider px-8 py-6 h-auto clip-corner">
                JOIN LEAGUE <Play className="w-5 h-5 ml-2 fill-current" />
              </Button>
              <Button variant="outline" className="border-[#334155] text-white hover:bg-[#1e293b] font-display font-bold text-lg uppercase tracking-wider px-8 py-6 h-auto clip-corner">
                VIEW STATS
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Matches", value: "1,284", icon: Swords },
            { label: "Players", value: "87", icon: Users },
            { label: "Hours", value: "3,640", icon: Clock },
            { label: "Top Hero", value: "Pudge", icon: Crosshair }
          ].map((stat, i) => (
            <div key={i} className="bg-[#181a20] border border-[#1e293b] p-6 clip-corner flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute right-0 top-0 w-16 h-16 bg-[#1e293b] -rotate-45 translate-x-8 -translate-y-8 flex items-end justify-center pb-2 group-hover:bg-[#f59e0b] transition-colors">
                <stat.icon className="w-4 h-4 text-[#0f172a]" />
              </div>
              <div className="font-display text-[#94a3b8] font-bold uppercase tracking-widest text-sm mb-1">{stat.label}</div>
              <div className="font-mono text-3xl font-bold text-white">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-end justify-between border-b-2 border-[#1e293b] pb-2">
              <h2 className="font-display text-2xl font-bold text-white uppercase tracking-wider">RECENT MATCHES</h2>
              <a href="#" className="font-display font-bold text-[#f59e0b] uppercase tracking-wider text-sm flex items-center hover:underline">
                ALL MATCHES <ChevronRight className="w-4 h-4" />
              </a>
            </div>

            <div className="bg-[#181a20] border border-[#1e293b] flex flex-col clip-corner-tr">
              <div className="flex bg-[#1e293b]/50 text-[#94a3b8] font-display font-bold uppercase tracking-widest text-xs p-3 border-b border-[#1e293b]">
                <div className="w-24">RESULT</div>
                <div className="flex-1">SCORE</div>
                <div className="w-24 text-center">TIME</div>
                <div className="w-32 text-center">MVP</div>
                <div className="w-24 text-right">AGO</div>
              </div>
              
              {[
                { r: true, s: "42 - 38", t: "45:12", m: "cookie", a: "2h" },
                { r: false, s: "12 - 30", t: "24:05", m: "spicy", a: "5h" },
                { r: true, s: "55 - 54", t: "62:10", m: "chobo", a: "1d" },
                { r: false, s: "22 - 18", t: "30:45", m: "fuzion", a: "1d" }
              ].map((m, i) => (
                <div key={i} className="flex items-center p-3 border-b border-[#1e293b]/50 last:border-0 hover:bg-[#1e293b]/30">
                  <div className="w-24">
                    <span className={`inline-block px-2 py-0.5 font-display font-bold text-[10px] uppercase tracking-widest ${m.r ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                      {m.r ? 'RADIANT' : 'DIRE'}
                    </span>
                  </div>
                  <div className="flex-1 font-mono font-bold text-lg">{m.s}</div>
                  <div className="w-24 text-center font-mono text-[#94a3b8]">{m.t}</div>
                  <div className="w-32 text-center font-bold text-[#f59e0b]">{m.m}</div>
                  <div className="w-24 text-right font-mono text-[#94a3b8] text-sm">{m.a}</div>
                </div>
              ))}
            </div>
            
            {/* Admin Block */}
            <div className="pt-8">
              <div className="flex items-end justify-between border-b-2 border-[#1e293b] pb-2 mb-6">
                <h2 className="font-display text-2xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-6 h-6 text-[#f59e0b]" /> ADMIN CONSOLE
                </h2>
                <div className="font-mono text-xs text-[#94a3b8] bg-[#1e293b] px-2 py-1">SYS.AUTH.OK</div>
              </div>

              <div className="border border-[#1e293b] bg-[#181a20] flex h-[500px] clip-corner-tr relative">
                {/* Admin Nav */}
                <div className="w-64 border-r border-[#1e293b] bg-[#111318]/50 flex flex-col p-4 overflow-y-auto font-display font-semibold uppercase tracking-wider text-sm">
                  <div className="space-y-1 mb-6">
                    <div className="text-[#94a3b8] text-[10px] tracking-widest mb-2 border-b border-[#1e293b] pb-1">OVERVIEW</div>
                    <button className="flex items-center gap-2 w-full text-left p-2 text-[#94a3b8] hover:text-white hover:bg-[#1e293b]"><BarChart3 className="w-4 h-4"/> Dashboard</button>
                    <button className="flex items-center gap-2 w-full text-left p-2 text-[#94a3b8] hover:text-white hover:bg-[#1e293b]"><Activity className="w-4 h-4"/> Live Matches</button>
                  </div>
                  
                  <div className="space-y-1 mb-6">
                    <div className="text-[#94a3b8] text-[10px] tracking-widest mb-2 border-b border-[#1e293b] pb-1">CONFIG</div>
                    <button className="flex items-center gap-2 w-full text-left p-2 bg-[#f59e0b] text-[#0f172a] font-bold clip-tab"><Info className="w-4 h-4"/> Welcome Modal</button>
                    <button className="flex items-center gap-2 w-full text-left p-2 text-[#94a3b8] hover:text-white hover:bg-[#1e293b]"><Settings className="w-4 h-4"/> Feature Flags</button>
                    <button className="flex items-center gap-2 w-full text-left p-2 text-[#94a3b8] hover:text-white hover:bg-[#1e293b]"><CalendarDays className="w-4 h-4"/> Seasons</button>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-[#94a3b8] text-[10px] tracking-widest mb-2 border-b border-[#1e293b] pb-1">USERS</div>
                    <button className="flex items-center gap-2 w-full text-left p-2 text-[#94a3b8] hover:text-white hover:bg-[#1e293b]"><Users className="w-4 h-4"/> Roster</button>
                    <button className="flex items-center gap-2 w-full text-left p-2 text-red-400 hover:bg-red-500/10"><LogOut className="w-4 h-4"/> Bans</button>
                  </div>
                </div>

                {/* Admin Content */}
                <div className="flex-1 p-6 flex flex-col">
                  <div className="mb-6 flex justify-between items-start">
                    <div>
                      <h3 className="font-display font-bold text-2xl uppercase tracking-tight text-white mb-1">Welcome Modal Editor</h3>
                      <p className="text-[#94a3b8] text-sm">Configure the announcement overlay shown to users on login.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-[#1e293b]/50 px-3 py-2 border border-[#334155]">
                      <span className="font-display font-bold uppercase text-xs tracking-widest text-[#94a3b8]">Status</span>
                      <Switch defaultChecked />
                    </div>
                  </div>

                  <div className="grid gap-6 flex-1 max-w-2xl">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="font-display font-bold uppercase tracking-widest text-xs text-[#94a3b8]">Eyebrow</label>
                        <input type="text" defaultValue="Patch Notes" className="w-full bg-[#111318] border border-[#334155] px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#f59e0b]" />
                      </div>
                      <div className="space-y-2">
                        <label className="font-display font-bold uppercase tracking-widest text-xs text-[#94a3b8]">Version / ID</label>
                        <input type="text" defaultValue="v5.60" className="w-full bg-[#111318] border border-[#334155] px-3 py-2 text-[#f59e0b] font-mono text-sm focus:outline-none focus:border-[#f59e0b]" />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="font-display font-bold uppercase tracking-widest text-xs text-[#94a3b8]">Headline</label>
                      <input type="text" defaultValue="Season 10 Is Live" className="w-full bg-[#111318] border border-[#334155] px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#f59e0b]" />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="font-display font-bold uppercase tracking-widest text-xs text-[#94a3b8]">Body Copy</label>
                      <textarea rows={4} defaultValue="We've reset the ladder and introduced new matchmaking rules. Read the full patch notes to see what's changed." className="w-full bg-[#111318] border border-[#334155] px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#f59e0b] resize-none" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="font-display font-bold uppercase tracking-widest text-xs text-[#94a3b8]">CTA Text</label>
                        <input type="text" defaultValue="Read Notes" className="w-full bg-[#111318] border border-[#334155] px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#f59e0b]" />
                      </div>
                      <div className="space-y-2">
                        <label className="font-display font-bold uppercase tracking-widest text-xs text-[#94a3b8]">CTA Link</label>
                        <input type="text" defaultValue="/patch-notes" className="w-full bg-[#111318] border border-[#334155] px-3 py-2 text-[#94a3b8] font-mono text-sm focus:outline-none focus:border-[#f59e0b]" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end border-t border-[#1e293b] pt-6">
                    <Button className="bg-[#f59e0b] text-[#0f172a] hover:bg-[#d97706] font-display font-bold uppercase tracking-wider clip-corner">Deploy Changes</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-end justify-between border-b-2 border-[#1e293b] pb-2">
              <h2 className="font-display text-2xl font-bold text-white uppercase tracking-wider">TOP 5 RANKED</h2>
              <span className="font-mono text-xs text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-1">LIVE</span>
            </div>

            <div className="space-y-3">
              {[
                { r: 1, n: "cookie", m: 7240, w: "41-22", t: "Immortal" },
                { r: 2, n: "spicy", m: 6980, w: "38-19", t: "Immortal" },
                { r: 3, n: "chobo", m: 6850, w: "35-25", t: "Divine" },
                { r: 4, n: "fuzion", m: 6420, w: "40-30", t: "Divine" },
                { r: 5, n: "snute", m: 6100, w: "28-20", t: "Divine" }
              ].map((p, i) => (
                <div key={i} className="bg-[#181a20] border border-[#1e293b] flex items-stretch clip-corner group hover:border-[#f59e0b]/50 transition-colors">
                  <div className="w-12 bg-[#1e293b] flex items-center justify-center font-display font-bold text-2xl text-[#94a3b8] group-hover:bg-[#f59e0b] group-hover:text-[#0f172a] transition-colors clip-tab">
                    {p.r}
                  </div>
                  <div className="flex-1 p-3 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-lg leading-none mb-1">{p.n}</div>
                      <div className="font-display font-bold uppercase tracking-widest text-[10px] text-[#94a3b8]">{p.t}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xl font-bold text-[#f59e0b] leading-none mb-1">{p.m}</div>
                      <div className="font-mono text-[10px] text-[#94a3b8]">{p.w}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-full border-[#334155] text-white hover:bg-[#1e293b] font-display font-bold text-lg uppercase tracking-wider clip-corner">
              FULL LEADERBOARD
            </Button>

            {/* Broadcast widget preview */}
            <div className="mt-8 border border-[#1e293b] bg-[#111318] p-4 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#f59e0b] to-transparent opacity-50"></div>
              <div className="text-center font-display font-bold uppercase tracking-widest text-[#f59e0b] mb-2 text-xs">Up Next</div>
              <div className="text-center font-bold text-xl mb-4">WEEKEND TOURNAMENT FINALS</div>
              <div className="flex justify-center gap-4 text-center font-mono">
                <div className="bg-[#181a20] px-4 py-2 border border-[#1e293b]">
                  <div className="text-2xl font-bold text-white">02</div>
                  <div className="text-[10px] text-[#94a3b8] uppercase">Days</div>
                </div>
                <div className="bg-[#181a20] px-4 py-2 border border-[#1e293b]">
                  <div className="text-2xl font-bold text-white">14</div>
                  <div className="text-[10px] text-[#94a3b8] uppercase">Hours</div>
                </div>
                <div className="bg-[#181a20] px-4 py-2 border border-[#1e293b]">
                  <div className="text-2xl font-bold text-[#f59e0b]">30</div>
                  <div className="text-[10px] text-[#94a3b8] uppercase">Mins</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <footer className="border-t-2 border-[#1e293b] bg-[#111318] py-6 mt-12 z-10">
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-display font-bold uppercase tracking-wider text-[#94a3b8]">
            <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-4 h-4 opacity-50 grayscale invert" />
            <span>© {new Date().getFullYear()} OCE INHOUSE</span>
          </div>
          <div className="flex items-center gap-6 font-display font-bold uppercase tracking-widest text-xs text-[#94a3b8]">
            <a href="#" className="hover:text-white transition-colors">DISCORD</a>
            <a href="#" className="hover:text-white transition-colors">GITHUB</a>
            <span className="text-[#334155]">|</span>
            <span className="font-mono">V5.59 — <a href="#" className="text-[#f59e0b] hover:underline">PATCH NOTES</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
