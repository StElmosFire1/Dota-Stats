import React, { useState } from "react";
import "./_hybridnewsroom.css";
import { 
  ChevronDown, Trophy, Clock, Users, Activity, Crosshair, Shield,
  Settings, LogOut, FileText, UserCheck, Server, Monitor, Swords,
  AlertCircle, Info, Hash, CalendarDays, BarChart3, ChevronRight, Play,
  Sun, Moon, ExternalLink, Search, ListVideo, AlignLeft, UserX, SwitchCamera, Bell
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function HybridNewsroom() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const toggleTheme = () => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  };

  return (
    <div className={`hybrid-newsroom min-h-screen flex flex-col relative theme-${theme}`}>
      {/* Ticker Tape - Broadcast Machinery */}
      <div className="bg-[var(--ticker-bg)] text-[var(--ticker-fg)] h-6 flex items-center overflow-hidden uppercase font-display font-bold text-sm tracking-wider border-b border-[var(--border)]">
        <div className="animate-marquee px-4 whitespace-nowrap flex items-center">
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

      <header className="border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img src="/__mockup/images/oa-logo.png" alt="OA" className="h-9 w-auto" />
              <div className="flex flex-col leading-none font-serif">
                <span className="font-bold text-lg text-[var(--foreground)] tracking-wide">OCE</span>
                <span className="text-[var(--primary)] font-semibold italic text-sm">Inhouse</span>
              </div>
            </div>

            <div className="h-6 w-px bg-[var(--border)] mx-2 hidden md:block"></div>

            <nav className="hidden md:flex items-center gap-6 font-serif font-medium text-sm text-[var(--muted-foreground)]">
              <a href="#" className="text-[var(--foreground)] hover:text-[var(--primary)] transition-colors">Home</a>
              <a href="#" className="hover:text-[var(--foreground)] transition-colors">Matches</a>
              <a href="#" className="hover:text-[var(--foreground)] transition-colors">Leaderboard</a>
              <a href="#" className="hover:text-[var(--foreground)] transition-colors">Heroes</a>
              <a href="#" className="hover:text-[var(--foreground)] transition-colors flex items-center gap-1">Tools <ChevronDown className="w-3 h-3" /></a>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme} 
              className="p-1.5 rounded-full hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="flex flex-col text-right font-display">
              <span className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-widest font-bold">Season</span>
              <span className="text-[var(--foreground)] font-bold text-sm leading-none flex items-center gap-1 justify-end">S10 <ChevronDown className="w-3 h-3 text-[var(--primary)]" /></span>
            </div>
            
            <div className="h-6 w-px bg-[var(--border)] mx-1 hidden md:block"></div>

            <div className="flex items-center gap-3 border border-[var(--border)] bg-[var(--card)] rounded-full pl-1 pr-4 py-1">
              <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie&backgroundColor=1e325c" className="w-7 h-7 rounded-full" alt="Avatar" />
              <div className="flex flex-col text-right justify-center">
                <span className="text-[var(--foreground)] font-medium text-xs font-serif leading-none mb-0.5">u/cookie</span>
                <span className="text-[var(--primary)] font-mono text-[10px] leading-none">7240 MMR</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 py-10 space-y-12 scanlines">
        
        {/* Hero */}
        <section className="hybrid-newsroom-hero-bg border border-[var(--border)] bg-[var(--card)] relative p-12 overflow-hidden flex flex-col justify-center min-h-[400px]">
          <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none translate-x-1/4 translate-y-1/4">
            <Shield className="w-[600px] h-[600px]" />
          </div>
          
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-[var(--primary)]/10 border border-[var(--primary)]/30 px-3 py-1 mb-8 text-[var(--primary)] font-display font-bold uppercase tracking-widest text-xs rounded-sm">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse"></div>
              ON AIR: SEASON 10
            </div>
            
            <h1 className="font-serif text-5xl md:text-7xl font-bold text-[var(--foreground)] leading-[1.1] tracking-tight mb-6">
              Track every inhouse.<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/60">Climb the OCE ladder.</span>
            </h1>
            
            <p className="text-[var(--muted-foreground)] text-lg max-w-xl mb-10 font-serif leading-relaxed">
              The premier Dota 2 inhouse league for Australia and New Zealand. Compete, analyze, and rise through the ranks in a professional broadcast environment.
            </p>
            
            <div className="flex items-center gap-4">
              <Button className="bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 rounded-sm font-display font-bold text-base uppercase tracking-wider px-8 py-6 h-auto transition-transform hover:-translate-y-0.5">
                Join the League <Play className="w-4 h-4 ml-2 fill-current" />
              </Button>
              <Button variant="outline" className="border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] rounded-sm font-display font-bold text-base uppercase tracking-wider px-8 py-6 h-auto transition-colors">
                View Leaderboard
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border)] border border-[var(--border)]">
          {[
            { label: "Matches Played", value: "1,284", icon: Swords },
            { label: "Active Players", value: "87", icon: Users },
            { label: "Hours of Dota", value: "3,640", icon: Clock },
            { label: "Top Hero", value: "Pudge — 64% WR", icon: Crosshair }
          ].map((stat, i) => (
            <div key={i} className="bg-[var(--background)] p-6 group hover:bg-[var(--muted)] transition-colors flex items-center gap-4">
              <div className="w-12 h-12 rounded-full border border-[var(--border)] flex items-center justify-center text-[var(--primary)] bg-[var(--card)] group-hover:scale-110 transition-transform">
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="font-serif text-2xl font-bold text-[var(--foreground)] leading-none mb-1">{stat.value}</div>
                <div className="font-display text-[var(--muted-foreground)] font-bold uppercase tracking-widest text-[10px]">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          
          <div className="lg:col-span-2 space-y-10">
            {/* Matches */}
            <div>
              <div className="flex items-end justify-between border-b border-[var(--border)] pb-4 mb-6">
                <h2 className="font-serif text-2xl font-bold text-[var(--foreground)]">Latest Matches</h2>
                <a href="#" className="font-display font-bold text-[var(--primary)] uppercase tracking-wider text-xs flex items-center gap-1 hover:underline">
                  All Matches <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="border border-[var(--border)] bg-[var(--card)] overflow-hidden rounded-sm">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs font-display font-bold uppercase tracking-widest text-[var(--muted-foreground)] bg-[var(--muted)]/50 border-b border-[var(--border)]">
                    <tr>
                      <th className="px-6 py-3">Result</th>
                      <th className="px-6 py-3">Score</th>
                      <th className="px-6 py-3 text-center">Duration</th>
                      <th className="px-6 py-3 text-center">MVP</th>
                      <th className="px-6 py-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {[
                      { r: true, s: "42 - 38", t: "45:12", m: "cookie", a: "2h ago" },
                      { r: false, s: "12 - 30", t: "24:05", m: "spicy", a: "5h ago" },
                      { r: true, s: "55 - 54", t: "62:10", m: "chobo", a: "1d ago" },
                      { r: false, s: "22 - 18", t: "30:45", m: "fuzion", a: "1d ago" }
                    ].map((m, i) => (
                      <tr key={i} className="hover:bg-[var(--muted)] transition-colors group cursor-pointer">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${m.r ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="font-serif font-medium text-[var(--foreground)]">{m.r ? 'Radiant' : 'Dire'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-lg text-[var(--foreground)]">{m.s}</td>
                        <td className="px-6 py-4 text-center font-mono text-[var(--muted-foreground)]">{m.t}</td>
                        <td className="px-6 py-4 text-center font-serif text-[var(--primary)] font-medium italic">{m.m}</td>
                        <td className="px-6 py-4 text-right font-mono text-[var(--muted-foreground)] text-sm group-hover:text-[var(--foreground)] transition-colors">{m.a}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Admin Block */}
            <div>
              <div className="flex items-end justify-between border-b border-[var(--border)] pb-4 mb-6">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
                    <Settings className="w-5 h-5 text-[var(--primary)]" /> Admin Panel
                  </h2>
                  <p className="text-sm font-serif italic text-[var(--muted-foreground)] mt-1">Previewing configuration interface</p>
                </div>
                <div className="font-mono text-xs text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-1 rounded-sm border border-[var(--border)]">AUTH.OK</div>
              </div>

              <div className="border border-[var(--border)] flex h-[500px] bg-[var(--card)] rounded-sm overflow-hidden">
                {/* Admin Nav */}
                <div className="w-64 border-r border-[var(--border)] bg-[var(--background)] flex flex-col font-serif">
                  <div className="p-4 border-b border-[var(--border)]">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                      <input 
                        type="text" 
                        placeholder="Search settings..." 
                        className="w-full bg-[var(--card)] border border-[var(--border)] rounded-sm py-1.5 pl-9 pr-3 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto py-4">
                    <SidebarSection title="Match Data">
                      <SidebarItem icon={AlignLeft} label="Record Match" />
                      <SidebarItem icon={ListVideo} label="Replays" />
                    </SidebarSection>
                    
                    <SidebarSection title="Players">
                      <SidebarItem icon={Users} label="Roster" />
                      <SidebarItem icon={UserX} label="Bans" />
                    </SidebarSection>

                    <SidebarSection title="Seasons">
                      <SidebarItem icon={Settings} label="Settings" />
                      <SidebarItem icon={AlignLeft} label="Welcome Modal" active />
                    </SidebarSection>
                  </div>
                </div>

                {/* Admin Content */}
                <div className="flex-1 bg-[var(--card)] p-8 overflow-y-auto">
                  <div className="max-w-2xl mx-auto">
                    <div className="mb-6 flex justify-between items-start">
                      <div>
                        <h3 className="font-serif text-2xl font-bold text-[var(--foreground)] mb-1">Welcome Modal Editor</h3>
                        <p className="text-[var(--muted-foreground)] font-serif text-sm italic">Configure the announcement overlay shown to users on login.</p>
                      </div>
                    </div>

                    <div className="border border-[var(--border)] bg-[var(--background)] p-6 space-y-6 rounded-sm">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-[var(--foreground)] font-serif font-semibold text-base">Enable Modal</Label>
                          <p className="text-sm text-[var(--muted-foreground)] font-serif">Show this modal to all users who haven't dismissed it.</p>
                        </div>
                        <Switch defaultChecked />
                      </div>
                      
                      <div className="h-px bg-[var(--border)]" />

                      <div className="grid gap-5">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="font-display font-bold uppercase tracking-widest text-[10px] text-[var(--muted-foreground)]">Eyebrow</label>
                            <input type="text" defaultValue="Patch Notes" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-sm px-3 py-2 text-[var(--foreground)] font-serif text-sm focus:outline-none focus:border-[var(--primary)]" />
                          </div>
                          <div className="space-y-2">
                            <label className="font-display font-bold uppercase tracking-widest text-[10px] text-[var(--muted-foreground)]">Version Bump</label>
                            <input type="text" defaultValue="v5.60" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-sm px-3 py-2 text-[var(--primary)] font-mono text-sm focus:outline-none focus:border-[var(--primary)]" />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="font-display font-bold uppercase tracking-widest text-[10px] text-[var(--muted-foreground)]">Headline</label>
                          <input type="text" defaultValue="Season 10 is here" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-sm px-3 py-2 text-[var(--foreground)] font-serif text-sm focus:outline-none focus:border-[var(--primary)]" />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="font-display font-bold uppercase tracking-widest text-[10px] text-[var(--muted-foreground)]">Body Copy</label>
                          <textarea rows={3} defaultValue="We've reset the ladder and introduced new matchmaking rules. Read the full patch notes to see what's changed." className="w-full bg-[var(--card)] border border-[var(--border)] rounded-sm px-3 py-2 text-[var(--foreground)] font-serif text-sm focus:outline-none focus:border-[var(--primary)] resize-none" />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="font-display font-bold uppercase tracking-widest text-[10px] text-[var(--muted-foreground)]">CTA Text</label>
                            <input type="text" defaultValue="Read Notes" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-sm px-3 py-2 text-[var(--foreground)] font-serif text-sm focus:outline-none focus:border-[var(--primary)]" />
                          </div>
                          <div className="space-y-2">
                            <label className="font-display font-bold uppercase tracking-widest text-[10px] text-[var(--muted-foreground)]">CTA Link</label>
                            <input type="text" defaultValue="/patch-notes" className="w-full bg-[var(--card)] border border-[var(--border)] rounded-sm px-3 py-2 text-[var(--muted-foreground)] font-mono text-sm focus:outline-none focus:border-[var(--primary)]" />
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 flex justify-end">
                        <Button className="bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 rounded-sm font-display font-bold uppercase tracking-wider px-6">
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
            {/* Leaderboard */}
            <div>
              <div className="flex items-end justify-between border-b border-[var(--border)] pb-4 mb-6">
                <h2 className="font-serif text-2xl font-bold text-[var(--foreground)]">Top 5 Players</h2>
                <div className="font-display text-[10px] text-[var(--primary)] uppercase tracking-widest font-bold border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-2 py-0.5 rounded-sm">Season 10</div>
              </div>

              <div className="space-y-3">
                {[
                  { r: 1, n: "cookie", m: 7240, w: "41-22", t: "Immortal" },
                  { r: 2, n: "spicy", m: 6980, w: "38-19", t: "Immortal" },
                  { r: 3, n: "chobo", m: 6850, w: "35-25", t: "Divine" },
                  { r: 4, n: "fuzion", m: 6420, w: "40-30", t: "Divine" },
                  { r: 5, n: "snute", m: 6100, w: "28-20", t: "Divine" }
                ].map((p, i) => (
                  <div key={i} className="bg-[var(--card)] border border-[var(--border)] flex items-center p-3 group hover:border-[var(--primary)]/50 transition-colors rounded-sm">
                    <div className="w-8 text-center font-serif text-xl font-bold text-[var(--primary)]/50 group-hover:text-[var(--primary)] transition-colors">
                      {p.r}
                    </div>
                    
                    <div className="w-8 h-8 mx-3 rounded bg-[var(--background)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                      <Shield className="w-4 h-4 text-[var(--primary)]" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="font-serif font-bold text-[var(--foreground)] text-lg leading-none mb-1">{p.n}</div>
                      <div className="font-display font-bold uppercase tracking-widest text-[10px] text-[var(--muted-foreground)]">{p.t}</div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-mono text-xl font-bold text-[var(--primary)] leading-none mb-1">{p.m}</div>
                      <div className="font-mono text-[10px] text-[var(--muted-foreground)]">{p.w}</div>
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" className="w-full mt-4 border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] font-display font-bold text-sm uppercase tracking-wider rounded-sm">
                Full Leaderboard
              </Button>
            </div>

            {/* Broadcast widget preview */}
            <div className="border border-[var(--border)] bg-[var(--card)] p-6 relative overflow-hidden rounded-sm text-center">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent opacity-50"></div>
              <div className="font-display font-bold uppercase tracking-widest text-[var(--primary)] mb-2 text-xs">Up Next</div>
              <div className="font-serif font-bold text-xl mb-4 text-[var(--foreground)] leading-tight">Weekend Tournament<br/>Finals</div>
              <div className="flex justify-center gap-3 text-center font-mono">
                <div className="bg-[var(--background)] px-3 py-2 border border-[var(--border)] rounded-sm">
                  <div className="text-2xl font-bold text-[var(--foreground)]">02</div>
                  <div className="font-display font-bold text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Days</div>
                </div>
                <div className="bg-[var(--background)] px-3 py-2 border border-[var(--border)] rounded-sm">
                  <div className="text-2xl font-bold text-[var(--foreground)]">14</div>
                  <div className="font-display font-bold text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Hours</div>
                </div>
                <div className="bg-[var(--background)] px-3 py-2 border border-[var(--border)] rounded-sm">
                  <div className="text-2xl font-bold text-[var(--primary)]">30</div>
                  <div className="font-display font-bold text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider">Mins</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <footer className="border-t border-[var(--border)] bg-[var(--card)] py-8 mt-auto">
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm font-serif text-[var(--muted-foreground)]">
            <img src="/__mockup/images/oa-logo.png" alt="OA" className="h-5 w-auto opacity-70" />
            <span>© {new Date().getFullYear()} OCE Inhouse. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 font-display font-bold uppercase tracking-widest text-xs text-[var(--muted-foreground)]">
            <a href="#" className="hover:text-[var(--foreground)] transition-colors">DISCORD</a>
            <a href="#" className="hover:text-[var(--foreground)] transition-colors">GITHUB</a>
            <span className="text-[var(--border)]">|</span>
            <span className="font-mono">V5.59 — <a href="#" className="text-[var(--primary)] hover:underline">PATCH NOTES</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="mb-6 px-3">
      <div className="text-[10px] font-display font-bold uppercase tracking-widest text-[var(--muted-foreground)] mb-2 px-3">
        {title}
      </div>
      <div className="space-y-0.5">
        {children}
      </div>
    </div>
  );
}

function SidebarItem({ icon: Icon, label, active = false }: { icon: any, label: string, active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm cursor-pointer transition-colors ${
      active 
        ? "bg-[var(--muted)] text-[var(--foreground)] font-medium border-l-2 border-[var(--primary)]" 
        : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]/50 hover:text-[var(--foreground)] border-l-2 border-transparent"
    }`}>
      <Icon className={`w-4 h-4 ${active ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"}`} />
      <span>{label}</span>
    </div>
  );
}
