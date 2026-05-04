import React, { useState, useEffect } from "react";
import "./_hybridpressbox.css";
import { 
  ChevronDown, Trophy, Clock, Users, Activity, ExternalLink, Settings, 
  Shield, Bell, ListVideo, AlignLeft, UserX, SwitchCamera, Search, 
  ChevronRight, Play, Sun, Moon, ArrowUpRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function HybridPressBox() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  return (
    <div className={`hybrid-pressbox min-h-screen flex flex-col theme-${theme}`}>
      {/* Live Ticker */}
      <div className="h-7 flex items-center overflow-hidden uppercase font-semibold text-[11px] tracking-widest" style={{ backgroundColor: 'var(--ticker-bg)', color: 'var(--ticker-text)' }}>
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

      <header className="hairline-b sticky top-0 z-50 backdrop-blur-md" style={{ backgroundColor: 'var(--header-bg)' }}>
        <div className="max-w-[1280px] mx-auto h-16 px-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <img src="/__mockup/images/oa-logo.png" alt="OA" className="h-8 w-8 opacity-90 filter dark:invert-0" style={{ filter: theme === 'light' ? 'invert(1) sepia(1) saturate(5) hue-rotate(175deg) brightness(0.5)' : 'none' }} />
              <div className="font-serif tracking-wide text-xl flex items-baseline gap-1.5">
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>OCE</span>
                <span className="italic opacity-80" style={{ color: 'var(--foreground)' }}>Inhouse</span>
              </div>
            </div>

            <div className="h-8 w-px" style={{ backgroundColor: 'var(--border)' }}></div>

            <nav className="hidden md:flex items-center gap-6 text-[13px] font-semibold tracking-wide uppercase" style={{ color: 'var(--muted-foreground)' }}>
              <a href="#" className="hover:text-primary transition-colors flex items-center gap-1.5" style={{ color: 'var(--foreground)' }}>Home</a>
              <a href="#" className="hover:text-primary transition-colors flex items-center gap-1.5">Matches</a>
              <a href="#" className="hover:text-primary transition-colors flex items-center gap-1.5">Leaderboard</a>
              <a href="#" className="hover:text-primary transition-colors">Heroes</a>
              <div className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors">
                <span>Tools</span>
                <ChevronDown className="w-3 h-3" />
              </div>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={toggleTheme} className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ color: 'var(--foreground)' }}>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="hidden lg:flex items-center gap-2 text-xs hairline-l hairline-r px-4 h-8 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--primary)' }}>Season 10</span>
              <ChevronDown className="w-3 h-3" style={{ color: 'var(--muted-foreground)' }} />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col text-right">
                <span className="font-bold text-sm leading-none" style={{ color: 'var(--foreground)' }}>u/cookie</span>
                <span className="font-serif italic text-xs" style={{ color: 'var(--muted-foreground)' }}>7240 MMR</span>
              </div>
              <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie&backgroundColor=1e293b" className="w-8 h-8 rounded-sm" alt="Avatar" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1280px] mx-auto p-6 space-y-8">
        
        {/* Hero */}
        <section className="hybrid-pressbox-hero-bg hairline-b hairline-t hairline-l hairline-r relative p-12 lg:p-16 flex flex-col justify-center min-h-[400px]" style={{ backgroundColor: 'var(--card)' }}>
          <div className="absolute right-0 bottom-0 opacity-[0.03] pointer-events-none translate-x-1/4 translate-y-1/4">
            <Shield className="w-[600px] h-[600px]" style={{ color: 'var(--foreground)' }} />
          </div>
          
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 uppercase tracking-widest text-xs font-bold" style={{ backgroundColor: 'var(--accent-light)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--primary)' }}></div>
              Broadcast Live
            </div>
            
            <h1 className="font-serif text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-6">
              Track every inhouse.<br/>
              <span className="italic font-normal opacity-80">Climb the OCE ladder.</span>
            </h1>
            
            <p className="text-lg max-w-xl mb-10 font-medium" style={{ color: 'var(--muted-foreground)' }}>
              The premier Dota 2 inhouse league for Australia and New Zealand. Compete, analyze, and rise through the ranks.
            </p>
            
            <div className="flex items-center gap-4">
              <Button className="font-bold text-[13px] uppercase tracking-wider px-8 py-6 h-auto rounded-none border-none" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                Join League <ArrowUpRight className="w-4 h-4 ml-2" />
              </Button>
              <Button variant="outline" className="font-bold text-[13px] uppercase tracking-wider px-8 py-6 h-auto rounded-none" style={{ borderColor: 'var(--border)', color: 'var(--foreground)', backgroundColor: 'transparent' }}>
                View Leaderboard
              </Button>
            </div>
          </div>
        </section>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ backgroundColor: 'var(--border)', border: '1px solid var(--border)' }}>
          {[
            { label: "Matches Played", value: "1,284", icon: Trophy },
            { label: "Active Players", value: "87", icon: Users },
            { label: "Hours of Dota", value: "3,640", icon: Clock },
            { label: "Top Hero", value: "Pudge (64%)", icon: Activity }
          ].map((stat, i) => (
            <div key={i} className="p-6 flex flex-col justify-center text-center relative overflow-hidden group transition-colors" style={{ backgroundColor: 'var(--card)' }}>
              <div className="flex items-center justify-center mb-4 transition-colors" style={{ color: 'var(--primary)' }}>
                <stat.icon className="w-5 h-5 opacity-70" />
              </div>
              <div className="font-serif text-4xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>{stat.value}</div>
              <div className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-8">
            {/* Matches */}
            <div className="space-y-4">
              <div className="flex items-end justify-between hairline-b pb-3">
                <h2 className="font-serif text-2xl font-bold uppercase tracking-wide">Latest Matches</h2>
                <a href="#" className="font-bold uppercase tracking-wider text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--primary)' }}>
                  View All <ChevronRight className="w-3 h-3" />
                </a>
              </div>

              <div className="almanac-frame">
                <div className="almanac-frame-inner p-0">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] uppercase tracking-widest hairline-b" style={{ color: 'var(--muted-foreground)', backgroundColor: 'var(--background)' }}>
                      <tr>
                        <th className="px-4 py-3 font-semibold">Result</th>
                        <th className="px-4 py-3 font-semibold">Score</th>
                        <th className="px-4 py-3 font-semibold">Duration</th>
                        <th className="px-4 py-3 font-semibold">MVP</th>
                        <th className="px-4 py-3 font-semibold text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {[
                        { r: true, s: "42-38", t: "45:12", m: "cookie", a: "2h ago" },
                        { r: false, s: "12-30", t: "24:05", m: "spicy", a: "5h ago" },
                        { r: true, s: "55-54", t: "62:10", m: "chobo", a: "1d ago" },
                        { r: false, s: "22-18", t: "30:45", m: "fuzion", a: "1d ago" }
                      ].map((m, i) => (
                        <tr key={i} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${m.r ? 'bg-green-500' : 'bg-red-500'}`}></div>
                              <span className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--foreground)' }}>{m.r ? 'Radiant' : 'Dire'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-serif text-lg font-semibold tracking-wide" style={{ color: 'var(--foreground)' }}>{m.s}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{m.t}</td>
                          <td className="px-4 py-3 font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--primary)' }}>{m.m}</td>
                          <td className="px-4 py-3 text-right" style={{ color: 'var(--muted-foreground)' }}>{m.a}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            {/* Admin Block */}
            <div className="pt-4 space-y-4">
              <div className="flex items-end justify-between hairline-b pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                  <h2 className="font-serif text-2xl font-bold uppercase tracking-wide">Admin Panel</h2>
                </div>
                <span className="font-serif italic text-sm" style={{ color: 'var(--muted-foreground)' }}>Preview Mode</span>
              </div>

              <div className="almanac-frame flex h-[600px]">
                {/* Admin Nav */}
                <div className="w-64 hairline-r flex flex-col bg-black/5 dark:bg-white/5">
                  <div className="p-4 hairline-b">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }} />
                      <input 
                        type="text" 
                        placeholder="Search..." 
                        className="w-full bg-transparent border rounded-none py-1.5 pl-8 pr-3 text-xs focus:outline-none"
                        style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest px-2 mb-2" style={{ color: 'var(--muted-foreground)' }}>Match Data</div>
                      <div className="space-y-0.5 text-sm font-medium">
                        <button className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--muted-foreground)' }}>Record Match</button>
                        <button className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--muted-foreground)' }}>Replays</button>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest px-2 mb-2" style={{ color: 'var(--muted-foreground)' }}>Seasons</div>
                      <div className="space-y-0.5 text-sm font-medium">
                        <button className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--muted-foreground)' }}>Settings</button>
                        <button className="w-full text-left px-2 py-1.5 rounded-sm" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>Welcome Modal</button>
                        <button className="w-full text-left px-2 py-1.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--muted-foreground)' }}>Patch Notes</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Admin Content */}
                <div className="flex-1 p-8 overflow-y-auto" style={{ backgroundColor: 'var(--background)' }}>
                  <div className="max-w-2xl space-y-8">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-serif text-3xl font-bold mb-2">Welcome Modal</h3>
                        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Configure the announcement overlay shown to users on login.</p>
                      </div>
                      <div className="flex items-center gap-3 px-3 py-2 border rounded-none" style={{ borderColor: 'var(--border)' }}>
                        <span className="font-bold uppercase text-[10px] tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Enabled</span>
                        <Switch defaultChecked />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Eyebrow</Label>
                          <Input defaultValue="Patch Notes" className="rounded-none border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Version</Label>
                          <Input defaultValue="v5.60" className="rounded-none border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Title</Label>
                        <Input defaultValue="Season 10 Is Live" className="rounded-none border font-serif text-lg py-5" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Body</Label>
                        <textarea 
                          rows={4} 
                          defaultValue="We've reset the ladder and introduced new matchmaking rules. Read the full patch notes to see what's changed." 
                          className="w-full rounded-none border p-3 text-sm focus:outline-none focus:ring-1" 
                          style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)', '--tw-ring-color': 'var(--primary)' } as React.CSSProperties}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>CTA Text</Label>
                          <Input defaultValue="Read Notes" className="rounded-none border" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                        </div>
                        <div className="space-y-2">
                          <Label className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>CTA Link</Label>
                          <Input defaultValue="/patch-notes" className="rounded-none border font-mono text-xs" style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }} />
                        </div>
                      </div>

                      <div className="pt-4 flex justify-end">
                        <Button className="font-bold text-[11px] uppercase tracking-widest rounded-none border-none px-6" style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                          Save Configuration
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex items-end justify-between hairline-b pb-3">
                <h2 className="font-serif text-2xl font-bold uppercase tracking-wide">Leaderboard</h2>
                <span className="font-serif italic text-sm" style={{ color: 'var(--muted-foreground)' }}>Top 5</span>
              </div>

              <div className="almanac-frame">
                <div className="almanac-frame-inner p-0">
                  {[
                    { r: 1, n: "cookie", m: 7240, w: "41W-22L", t: "Immortal" },
                    { r: 2, n: "spicy", m: 6980, w: "38W-19L", t: "Immortal" },
                    { r: 3, n: "chobo", m: 6850, w: "35W-25L", t: "Divine" },
                    { r: 4, n: "fuzion", m: 6420, w: "40W-30L", t: "Divine" },
                    { r: 5, n: "snute", m: 6100, w: "28W-20L", t: "Divine" }
                  ].map((p, i) => (
                    <div key={i} className="flex items-center p-4 hairline-b last:border-b-0 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      <div className="w-8 font-serif text-2xl font-bold opacity-30" style={{ color: 'var(--foreground)' }}>{p.r}</div>
                      <div className="flex-1 min-w-0 px-2">
                        <div className="font-bold text-base leading-none mb-1 truncate" style={{ color: 'var(--foreground)' }}>{p.n}</div>
                        <div className="font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{p.t}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-serif text-xl font-bold mb-0.5" style={{ color: 'var(--primary)' }}>{p.m}</div>
                        <div className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{p.w}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button variant="outline" className="w-full font-bold text-[11px] uppercase tracking-widest rounded-none bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                Full Rankings
              </Button>
            </div>

            {/* Broadcast Clock Widget */}
            <div className="almanac-frame">
              <div className="almanac-frame-inner p-6 text-center">
                <div className="font-bold uppercase tracking-widest text-[10px] mb-4" style={{ color: 'var(--primary)' }}>Next Broadcast</div>
                <div className="font-serif text-xl font-bold mb-6" style={{ color: 'var(--foreground)' }}>Weekend Finals</div>
                <div className="flex justify-center gap-4">
                  {[ { v: "02", l: "Days" }, { v: "14", l: "Hours" }, { v: "30", l: "Mins" } ].map((t, i) => (
                    <div key={i} className="px-3 py-2 border text-center min-w-[64px]" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
                      <div className="font-serif text-2xl font-bold" style={{ color: i === 2 ? 'var(--primary)' : 'var(--foreground)' }}>{t.v}</div>
                      <div className="font-bold uppercase tracking-widest text-[9px] mt-1" style={{ color: 'var(--muted-foreground)' }}>{t.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <footer className="hairline-t py-8 mt-12" style={{ backgroundColor: 'var(--card)' }}>
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-4 h-4 opacity-50 filter dark:invert-0" style={{ filter: theme === 'light' ? 'invert(1) sepia(1) saturate(5) hue-rotate(175deg) brightness(0.5)' : 'none' }} />
            <span>© {new Date().getFullYear()} OCE Inhouse</span>
          </div>
          <div className="flex items-center gap-6 font-bold uppercase tracking-widest text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
            <a href="#" className="hover:text-primary transition-colors" style={{ color: 'var(--foreground)' }}>Discord</a>
            <a href="#" className="hover:text-primary transition-colors" style={{ color: 'var(--foreground)' }}>GitHub</a>
            <span>|</span>
            <span className="font-serif italic text-xs capitalize tracking-normal">v5.59 — <a href="#" className="hover:underline" style={{ color: 'var(--primary)' }}>Patch Notes</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
