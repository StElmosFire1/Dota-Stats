import React, { useState, useEffect } from "react";
import "./_hybridcourtpitch.css";
import {
  ChevronDown, Trophy, Clock, Users, Activity,
  Search, Shield, Bell, ListVideo, AlignLeft,
  UserX, SwitchCamera, Sun, Moon, ExternalLink,
  ChevronRight, Swords, Monitor
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function HybridCourtPitch() {
  const [isLight, setIsLight] = useState(false);

  // Apply theme class to root wrapper
  const themeClass = isLight ? "theme-light" : "theme-dark";

  return (
    <div className={`hybrid-court-pitch min-h-screen flex flex-col ${themeClass}`}>
      {/* Broadcast Ticker */}
      <div className="h-7 flex items-center overflow-hidden uppercase font-condensed font-medium text-sm tracking-wider" style={{ backgroundColor: 'var(--ticker-bg)', color: 'var(--ticker-text)' }}>
        <div className="animate-marquee px-4 whitespace-nowrap">
          <span className="mx-6">• S10 LEADERBOARD RESET IMMINENT</span>
          <span className="mx-6">• MATCH OF THE DAY: RADIANT VS DIRE</span>
          <span className="mx-6">• NEW DRAFT RULES IN EFFECT</span>
          <span className="mx-6">• RECORD-BREAKING MMR PEAK THIS WEEK</span>
          <span className="mx-6">• S10 LEADERBOARD RESET IMMINENT</span>
          <span className="mx-6">• MATCH OF THE DAY: RADIANT VS DIRE</span>
          <span className="mx-6">• NEW DRAFT RULES IN EFFECT</span>
          <span className="mx-6">• RECORD-BREAKING MMR PEAK THIS WEEK</span>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-header)', backdropFilter: 'blur(8px)' }}>
        <div className="max-w-[1280px] mx-auto h-16 px-6 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="p-1.5 clip-tr" style={{ backgroundColor: 'var(--accent-brass)' }}>
                <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-7 h-7 filter brightness-0" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-serif font-bold text-xl" style={{ color: 'var(--text-main)' }}>OCE</span>
                <span className="font-condensed font-medium tracking-[0.2em] text-xs" style={{ color: 'var(--accent-amber)' }}>INHOUSE</span>
              </div>
            </div>

            <div className="h-8 hairline-vertical hidden md:block"></div>

            <nav className="hidden md:flex items-center gap-6 font-condensed font-medium tracking-wide text-sm" style={{ color: 'var(--text-muted)' }}>
              <a href="#" className="flex items-center gap-1.5 transition-colors hover:text-opacity-80" style={{ color: 'var(--text-main)' }}>
                <Monitor className="w-4 h-4" style={{ color: 'var(--accent-amber)' }} /> HOME
              </a>
              <a href="#" className="flex items-center gap-1.5 transition-colors hover:text-opacity-80">MATCHES</a>
              <a href="#" className="flex items-center gap-1.5 transition-colors hover:text-opacity-80">LEADERBOARD</a>
              <a href="#" className="flex items-center gap-1.5 transition-colors hover:text-opacity-80">HEROES</a>
              <div className="flex items-center gap-1 cursor-pointer transition-colors hover:text-opacity-80">
                TOOLS <ChevronDown className="w-3 h-3" />
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle */}
            <button
              onClick={() => setIsLight(!isLight)}
              className="p-2 rounded-full border transition-colors hover:bg-opacity-10"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              title="Toggle Theme"
            >
              {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            <div className="hidden lg:flex items-center gap-2 text-xs font-condensed tracking-wider border px-3 py-1.5 clip-bl cursor-pointer transition-colors"
                 style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
              <span className="font-medium" style={{ color: 'var(--text-main)' }}>SEASON 10</span>
              <ChevronDown className="w-3 h-3" />
            </div>

            <div className="flex items-center gap-3 border pl-1 pr-4 py-1 clip-tr" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
              <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie&backgroundColor=1f315a" alt="Avatar" className="w-7 h-7 rounded-sm" />
              <div className="flex flex-col text-left justify-center">
                <span className="font-serif text-sm font-bold leading-none" style={{ color: 'var(--text-main)' }}>u/cookie</span>
                <span className="font-condensed text-[10px] tracking-wide" style={{ color: 'var(--accent-brass)' }}>7240 MMR</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] w-full mx-auto px-6 py-10 space-y-12 flex-1">
        
        {/* Hero */}
        <section className="relative border p-12 clip-tr overflow-hidden flex flex-col justify-center min-h-[380px]" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
          <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none translate-x-1/4 translate-y-1/4">
            <Shield className="w-[500px] h-[500px]" style={{ color: 'var(--text-main)' }} />
          </div>

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 border px-3 py-1 mb-6 font-condensed font-medium uppercase tracking-widest text-xs"
                 style={{ borderColor: 'var(--accent-brass)', color: 'var(--accent-brass)', backgroundColor: 'transparent' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--accent-amber)' }} />
              Season 10 is live
            </div>
            
            <h1 className="font-serif text-5xl md:text-7xl font-bold leading-[1.1] mb-6">
              Track every inhouse.<br />
              <span className="font-serif italic font-normal" style={{ color: 'var(--accent-brass)' }}>Climb the OCE ladder.</span>
            </h1>
            
            <p className="text-lg md:text-xl font-light mb-8 max-w-xl" style={{ color: 'var(--text-muted)' }}>
              The premier Dota 2 inhouse league for Australia and New Zealand. Compete, analyze, and rise through the ranks.
            </p>
            
            <div className="flex items-center gap-4">
              <Button className="font-condensed font-medium text-lg uppercase tracking-wider px-8 py-6 h-auto clip-br border-0" style={{ backgroundColor: 'var(--accent-brass)', color: '#000' }}>
                Join the league
              </Button>
              <Button variant="outline" className="font-condensed font-medium text-lg uppercase tracking-wider px-8 py-6 h-auto clip-bl transition-colors"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-main)', backgroundColor: 'transparent' }}>
                View Leaderboard
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--border-subtle)' }}>
          {[
            { label: "Matches played", value: "1,284", icon: Trophy },
            { label: "Active players", value: "87", icon: Users },
            { label: "Hours of dota", value: "3,640", icon: Clock },
            { label: "Top hero last week", value: "Pudge — 64%", icon: Activity },
          ].map((stat, i) => (
            <div key={i} className="p-6 text-center flex flex-col justify-center transition-colors" style={{ backgroundColor: 'var(--bg-card)' }}>
              <div className="flex items-center justify-center mb-3">
                <stat.icon className="w-5 h-5" style={{ color: 'var(--accent-brass)' }} />
              </div>
              <div className="font-serif text-3xl font-bold mb-1" style={{ color: 'var(--text-main)' }}>{stat.value}</div>
              <div className="font-condensed text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          
          <div className="lg:col-span-2 space-y-10">
            {/* Latest Matches */}
            <div>
              <div className="flex items-end justify-between border-b pb-3 mb-6" style={{ borderColor: 'var(--border-subtle)' }}>
                <h2 className="font-serif text-2xl font-bold" style={{ color: 'var(--text-main)' }}>Latest Matches</h2>
                <a href="#" className="font-condensed font-medium text-sm uppercase tracking-wider flex items-center gap-1 transition-colors hover:opacity-80" style={{ color: 'var(--accent-brass)' }}>
                  View all <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="border clip-tr flex flex-col" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
                <div className="flex border-b font-condensed font-medium uppercase tracking-widest text-xs p-4" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-base)' }}>
                  <div className="w-24">Result</div>
                  <div className="flex-1">Score</div>
                  <div className="w-24 text-center">Duration</div>
                  <div className="w-32 text-center">MVP</div>
                  <div className="w-24 text-right">Time</div>
                </div>
                
                {[
                  { id: 1, r: true, s: "42 - 38", d: "45:12", m: "cookie", t: "2h ago" },
                  { id: 2, r: false, s: "12 - 30", d: "24:05", m: "spicy", t: "5h ago" },
                  { id: 3, r: true, s: "55 - 54", d: "62:10", m: "chobo", t: "1d ago" },
                  { id: 4, r: false, s: "22 - 18", d: "30:45", m: "fuzion", t: "1d ago" },
                  { id: 5, r: true, s: "15 - 40", d: "28:20", m: "cookie", t: "2d ago" },
                ].map((m) => (
                  <div key={m.id} className="flex items-center p-4 border-b last:border-0 transition-colors hover:bg-opacity-50" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="w-24">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 clip-br ${m.r ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="font-serif font-semibold text-sm" style={{ color: 'var(--text-main)' }}>{m.r ? "Radiant" : "Dire"}</span>
                      </div>
                    </div>
                    <div className="flex-1 font-condensed font-semibold text-xl tracking-wide" style={{ color: 'var(--text-main)' }}>{m.s}</div>
                    <div className="w-24 text-center font-condensed text-sm tracking-wide" style={{ color: 'var(--text-muted)' }}>{m.d}</div>
                    <div className="w-32 text-center font-serif font-bold italic" style={{ color: 'var(--accent-brass)' }}>{m.m}</div>
                    <div className="w-24 text-right font-condensed text-sm tracking-wide" style={{ color: 'var(--text-muted)' }}>{m.t}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin Panel Preview */}
            <div className="pt-6">
              <div className="flex items-end justify-between border-b pb-3 mb-6" style={{ borderColor: 'var(--border-subtle)' }}>
                <div>
                  <h2 className="font-serif text-2xl font-bold" style={{ color: 'var(--text-main)' }}>Admin Panel</h2>
                  <p className="font-serif italic text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Workspace preview</p>
                </div>
              </div>

              <div className="border flex h-[550px] clip-tr" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-base)' }}>
                {/* Sidebar */}
                <div className="w-64 border-r flex flex-col" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
                  <div className="p-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        className="w-full border rounded-sm py-1.5 pl-9 pr-3 text-sm focus:outline-none transition-colors"
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto py-4 space-y-6">
                    <div className="px-3">
                      <div className="font-condensed font-medium text-[10px] uppercase tracking-widest mb-2 px-3" style={{ color: 'var(--text-muted)' }}>Match Data</div>
                      <div className="flex items-center gap-3 px-3 py-1.5 rounded-sm text-sm cursor-pointer transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <AlignLeft className="w-4 h-4" /> <span>Record Match</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-1.5 rounded-sm text-sm cursor-pointer transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <ListVideo className="w-4 h-4" /> <span>Replays</span>
                      </div>
                    </div>

                    <div className="px-3">
                      <div className="font-condensed font-medium text-[10px] uppercase tracking-widest mb-2 px-3" style={{ color: 'var(--text-muted)' }}>Config</div>
                      <div className="flex items-center gap-3 px-3 py-1.5 rounded-sm text-sm cursor-pointer transition-colors font-medium clip-br" style={{ backgroundColor: 'var(--accent-brass)', color: '#000' }}>
                        <AlignLeft className="w-4 h-4" /> <span>Welcome Modal</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-1.5 rounded-sm text-sm cursor-pointer transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <SwitchCamera className="w-4 h-4" /> <span>Feature Flags</span>
                      </div>
                    </div>

                    <div className="px-3">
                      <div className="font-condensed font-medium text-[10px] uppercase tracking-widest mb-2 px-3" style={{ color: 'var(--text-muted)' }}>Users</div>
                      <div className="flex items-center gap-3 px-3 py-1.5 rounded-sm text-sm cursor-pointer transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <Users className="w-4 h-4" /> <span>Roster</span>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-1.5 rounded-sm text-sm cursor-pointer transition-colors" style={{ color: 'var(--text-muted)' }}>
                        <UserX className="w-4 h-4" /> <span>Bans</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-8 overflow-y-auto">
                  <div className="max-w-2xl mx-auto space-y-8">
                    <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div>
                        <h3 className="font-serif text-2xl font-bold mb-1" style={{ color: 'var(--text-main)' }}>Welcome Modal</h3>
                        <p className="font-serif italic text-sm" style={{ color: 'var(--text-muted)' }}>Configure the announcement popup shown upon login.</p>
                      </div>
                      <div className="flex items-center gap-3 border px-3 py-2 clip-bl" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
                        <span className="font-condensed font-medium text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Enabled</span>
                        <Switch defaultChecked />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="font-condensed font-medium uppercase tracking-widest text-[11px]" style={{ color: 'var(--text-muted)' }}>Eyebrow</label>
                          <input type="text" defaultValue="Patch Notes" className="w-full border px-3 py-2 text-sm focus:outline-none focus:border-opacity-100" style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }} />
                        </div>
                        <div className="space-y-2">
                          <label className="font-condensed font-medium uppercase tracking-widest text-[11px]" style={{ color: 'var(--text-muted)' }}>Version</label>
                          <input type="text" defaultValue="v5.60" className="w-full border px-3 py-2 text-sm focus:outline-none font-condensed tracking-wide" style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-subtle)', color: 'var(--accent-brass)' }} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="font-condensed font-medium uppercase tracking-widest text-[11px]" style={{ color: 'var(--text-muted)' }}>Title</label>
                        <input type="text" defaultValue="Season 10 is here" className="w-full border px-3 py-2 text-sm font-serif font-bold focus:outline-none" style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }} />
                      </div>

                      <div className="space-y-2">
                        <label className="font-condensed font-medium uppercase tracking-widest text-[11px]" style={{ color: 'var(--text-muted)' }}>Body</label>
                        <textarea rows={3} defaultValue="We've reset the ladder and introduced new matchmaking rules. Read the full patch notes to see what's changed." className="w-full border px-3 py-2 text-sm focus:outline-none resize-none font-serif italic" style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }} />
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="font-condensed font-medium uppercase tracking-widest text-[11px]" style={{ color: 'var(--text-muted)' }}>CTA Text</label>
                          <input type="text" defaultValue="Read Notes" className="w-full border px-3 py-2 text-sm focus:outline-none" style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }} />
                        </div>
                        <div className="space-y-2">
                          <label className="font-condensed font-medium uppercase tracking-widest text-[11px]" style={{ color: 'var(--text-muted)' }}>CTA Link</label>
                          <input type="text" defaultValue="/patch-notes" className="w-full border px-3 py-2 text-sm focus:outline-none font-condensed" style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }} />
                        </div>
                      </div>

                      <div className="flex justify-end pt-4">
                        <Button className="font-condensed font-medium text-base uppercase tracking-wider px-6 py-5 clip-br border-0" style={{ backgroundColor: 'var(--accent-brass)', color: '#000' }}>
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="space-y-10">
            {/* Leaderboard Preview */}
            <div>
              <div className="flex items-end justify-between border-b pb-3 mb-6" style={{ borderColor: 'var(--border-subtle)' }}>
                <h2 className="font-serif text-2xl font-bold" style={{ color: 'var(--text-main)' }}>Top 5 Players</h2>
                <span className="font-condensed font-medium text-xs uppercase tracking-widest border px-2 py-0.5" style={{ color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }}>S10 Live</span>
              </div>

              <div className="space-y-3">
                {[
                  { rank: 1, name: "cookie", mmr: 7240, wl: "41-22", tier: "Immortal" },
                  { rank: 2, name: "spicy", mmr: 6980, wl: "38-19", tier: "Immortal" },
                  { rank: 3, name: "chobo", mmr: 6850, wl: "35-25", tier: "Divine" },
                  { rank: 4, name: "fuzion", mmr: 6420, wl: "40-30", tier: "Divine" },
                  { rank: 5, name: "snute", mmr: 6100, wl: "28-20", tier: "Divine" },
                ].map((p) => (
                  <div key={p.rank} className="border flex items-center clip-bl transition-colors hover:bg-opacity-50" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
                    <div className="w-12 h-16 flex items-center justify-center font-condensed font-bold text-2xl border-r" style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                      {p.rank}
                    </div>
                    <div className="flex-1 p-4 flex items-center justify-between">
                      <div>
                        <div className="font-serif font-bold text-lg leading-none mb-1" style={{ color: 'var(--text-main)' }}>{p.name}</div>
                        <div className="font-condensed font-medium text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{p.tier}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-condensed font-bold text-xl leading-none mb-1" style={{ color: 'var(--accent-brass)' }}>{p.mmr}</div>
                        <div className="font-condensed text-[11px] tracking-wide" style={{ color: 'var(--text-muted)' }}>{p.wl}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" className="w-full mt-4 font-condensed font-medium text-sm uppercase tracking-widest clip-br"
                      style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-main)', backgroundColor: 'transparent' }}>
                Full Leaderboard
              </Button>
            </div>
            
            {/* Small Editorial Highlight */}
            <div className="border p-6 clip-tr relative" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                 <Trophy className="w-16 h-16" style={{ color: 'var(--text-main)' }} />
              </div>
              <div className="font-condensed font-medium text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--accent-brass)' }}>Editor's Pick</div>
              <h3 className="font-serif text-xl font-bold mb-2 leading-tight" style={{ color: 'var(--text-main)' }}>The rise of position 4 Pudge in S10</h3>
              <p className="font-serif italic text-sm mb-4 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                An in-depth look at how the meta is shifting away from traditional roamers.
              </p>
              <a href="#" className="font-condensed font-medium text-xs uppercase tracking-wider flex items-center gap-1 hover:underline" style={{ color: 'var(--accent-amber)' }}>
                Read Article <ChevronRight className="w-3 h-3" />
              </a>
            </div>

          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-auto" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}>
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 font-condensed font-medium uppercase tracking-widest text-xs" style={{ color: 'var(--text-muted)' }}>
            <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-5 h-5 filter grayscale opacity-50" />
            <span>© {new Date().getFullYear()} OCE INHOUSE</span>
          </div>
          <div className="flex items-center gap-6 font-condensed font-medium uppercase tracking-widest text-xs" style={{ color: 'var(--text-muted)' }}>
            <a href="#" className="transition-colors hover:text-opacity-80" style={{ color: 'var(--text-main)' }}>DISCORD</a>
            <a href="#" className="transition-colors hover:text-opacity-80" style={{ color: 'var(--text-main)' }}>GITHUB</a>
            <span style={{ color: 'var(--border-subtle)' }}>|</span>
            <span className="font-condensed tracking-wider">
              V5.60 — <a href="#" className="hover:underline" style={{ color: 'var(--accent-brass)' }}>PATCH NOTES</a>
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
