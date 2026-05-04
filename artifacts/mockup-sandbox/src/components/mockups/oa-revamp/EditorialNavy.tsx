import React, { useEffect } from "react";
import "./_editorialnavy.css";
import { ChevronDown, Trophy, Clock, Users, Activity, ExternalLink, Settings, Shield, Bell, ListVideo, AlignLeft, UserX, SwitchCamera, Search, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function EditorialNavy() {
  return (
    <div className="editorial-navy min-h-screen selection:bg-primary selection:text-primary-foreground">
      <Header />
      <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-16">
        <Hero />
        <StatsStrip />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-12">
            <LatestMatches />
            <AdminSidebarPreview />
          </div>
          <div className="space-y-12">
            <LeaderboardPreview />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-[#1f315a] bg-[#0b1733]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1280px] mx-auto h-16 px-6 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <img src="/__mockup/images/oa-logo.png" alt="OCE Inhouse" className="h-8 w-8 opacity-90" />
          <div className="font-serif tracking-wide text-lg flex items-baseline gap-1.5">
            <span className="font-semibold text-white">OCE</span>
            <span className="text-white/80 font-normal italic">Inhouse</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm text-[#94a6cb]">
          <a href="#" className="text-white font-medium hover:text-white transition-colors">Home</a>
          <a href="#" className="hover:text-white transition-colors">Matches</a>
          <a href="#" className="hover:text-white transition-colors">Leaderboard</a>
          <a href="#" className="hover:text-white transition-colors">Heroes</a>
          <div className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
            <span>Tools</span>
            <ChevronDown className="w-3 h-3" />
          </div>
          <a href="#" className="hover:text-white transition-colors">Tournaments</a>
          <a href="#" className="hover:text-white transition-colors">Schedule</a>
          <div className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
            <span>Account</span>
            <ChevronDown className="w-3 h-3" />
          </div>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 text-xs text-[#94a6cb] border border-[#1f315a] px-3 py-1.5 rounded-full hover:bg-[#1f315a]/30 transition-colors cursor-pointer">
            <span className="font-medium text-white">Season 10</span>
            <ChevronDown className="w-3 h-3" />
          </div>
          <div className="flex items-center gap-2 border border-[#1f315a] rounded-full pl-1 pr-3 py-1 bg-[#122144]">
            <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie&backgroundColor=1f315a" alt="Avatar" className="w-6 h-6 rounded-full" />
            <div className="text-xs">
              <span className="text-white font-medium">u/cookie</span>
              <span className="text-[#94a6cb] mx-1">•</span>
              <span className="text-[#d4af37] font-medium">7240 MMR</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="editorial-navy-hero-bg pt-16 pb-12 text-center relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5 pointer-events-none">
        <Shield className="w-[600px] h-[600px]" />
      </div>
      
      <div className="relative z-10 max-w-3xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#d4af37] border border-[#d4af37]/30 px-3 py-1 rounded-sm bg-[#d4af37]/10">
          <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] animate-pulse" />
          Season 10 is live
        </div>
        
        <h1 className="font-serif text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight">
          Track every inhouse.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">Climb the OCE ladder.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-[#94a6cb] max-w-xl mx-auto font-light leading-relaxed">
          The premier Dota 2 inhouse league for Australia and New Zealand. Compete, analyze, and rise through the ranks.
        </p>
        
        <div className="pt-6 flex items-center justify-center gap-4">
          <Button className="bg-[#d4af37] text-black hover:bg-[#d4af37]/90 rounded-none px-8 py-6 h-auto font-medium tracking-wide">
            View leaderboard
          </Button>
          <Button variant="outline" className="border-[#1f315a] text-white hover:bg-[#122144] rounded-none px-8 py-6 h-auto tracking-wide">
            Join the league
          </Button>
        </div>
      </div>
    </section>
  );
}

function StatsStrip() {
  const stats = [
    { label: "Matches played", value: "1,284", icon: Trophy },
    { label: "Active players", value: "87", icon: Users },
    { label: "Hours of dota", value: "3,640", icon: Clock },
    { label: "Top hero last week", value: "Pudge — 64% WR", icon: Activity },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#1f315a] border border-[#1f315a]">
      {stats.map((stat, i) => (
        <div key={i} className="bg-[#0b1733] p-6 text-center group hover:bg-[#122144] transition-colors">
          <div className="flex items-center justify-center mb-3 text-[#d4af37]/70 group-hover:text-[#d4af37] transition-colors">
            <stat.icon className="w-5 h-5" />
          </div>
          <div className="font-serif text-3xl font-semibold text-white mb-1 tracking-tight">{stat.value}</div>
          <div className="text-xs uppercase tracking-wider text-[#94a6cb]">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

function LatestMatches() {
  const matches = [
    { id: 1, radiant: true, score: "42-38", duration: "45:12", mvp: "cookie", time: "2h ago", won: true },
    { id: 2, radiant: false, score: "12-30", duration: "24:05", mvp: "spicy", time: "5h ago", won: false },
    { id: 3, radiant: true, score: "55-54", duration: "62:10", mvp: "chobo", time: "1d ago", won: true },
    { id: 4, radiant: false, score: "22-18", duration: "30:45", mvp: "fuzion", time: "1d ago", won: true },
    { id: 5, radiant: true, score: "15-40", duration: "28:20", mvp: "cookie", time: "2d ago", won: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between border-b border-[#1f315a] pb-4">
        <h2 className="font-serif text-2xl font-semibold">Latest Matches</h2>
        <a href="#" className="text-sm text-[#d4af37] hover:underline uppercase tracking-wider font-medium flex items-center gap-1">
          View all <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      
      <div className="border border-[#1f315a] bg-[#122144] overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase tracking-wider text-[#94a6cb] bg-[#0b1733]/50 border-b border-[#1f315a]">
            <tr>
              <th className="px-6 py-4 font-medium">Result</th>
              <th className="px-6 py-4 font-medium">Score</th>
              <th className="px-6 py-4 font-medium">Duration</th>
              <th className="px-6 py-4 font-medium">MVP</th>
              <th className="px-6 py-4 font-medium text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f315a]">
            {matches.map((match) => (
              <tr key={match.id} className="hover:bg-[#1a2a52] transition-colors group cursor-pointer">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${match.won ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-medium text-white">{match.radiant ? "Radiant" : "Dire"}</span>
                  </div>
                </td>
                <td className="px-6 py-4 font-serif text-lg tracking-wider text-white/90">{match.score}</td>
                <td className="px-6 py-4 text-[#94a6cb]">{match.duration}</td>
                <td className="px-6 py-4 text-[#d4af37] font-medium">{match.mvp}</td>
                <td className="px-6 py-4 text-right text-[#94a6cb] group-hover:text-white transition-colors">{match.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaderboardPreview() {
  const players = [
    { rank: 1, name: "cookie", mmr: 7240, wl: "41W-22L", trend: "up", tier: "Immortal" },
    { rank: 2, name: "spicy", mmr: 6980, wl: "38W-19L", trend: "up", tier: "Immortal" },
    { rank: 3, name: "chobo", mmr: 6850, wl: "35W-25L", trend: "down", tier: "Immortal" },
    { rank: 4, name: "fuzion", mmr: 6420, wl: "40W-30L", trend: "up", tier: "Divine" },
    { rank: 5, name: "snute", mmr: 6100, wl: "28W-20L", trend: "same", tier: "Divine" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between border-b border-[#1f315a] pb-4">
        <h2 className="font-serif text-2xl font-semibold">Top 5 Players</h2>
        <span className="text-xs uppercase tracking-wider text-[#94a6cb]">Season 10</span>
      </div>

      <div className="flex flex-col gap-3">
        {players.map((p) => (
          <div key={p.rank} className="flex items-center gap-4 p-4 border border-[#1f315a] bg-[#122144] hover:border-[#d4af37]/50 transition-colors">
            <div className="w-6 text-center font-serif text-xl font-bold text-[#d4af37]/50">{p.rank}</div>
            
            <div className="w-8 h-8 rounded bg-[#1f315a] flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-[#d4af37]" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white truncate">{p.name}</div>
              <div className="text-xs text-[#94a6cb] uppercase tracking-wider">{p.tier}</div>
            </div>
            
            <div className="text-right">
              <div className="font-serif text-xl text-[#d4af37] font-semibold">{p.mmr}</div>
              <div className="text-xs text-[#94a6cb]">{p.wl}</div>
            </div>
          </div>
        ))}
      </div>
      
      <Button variant="outline" className="w-full border-[#1f315a] text-white hover:bg-[#122144] rounded-none">
        Full Leaderboard
      </Button>
    </div>
  );
}

function AdminSidebarPreview() {
  return (
    <div className="space-y-6 pt-8">
      <div className="flex items-end justify-between border-b border-[#1f315a] pb-4">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Admin Panel</h2>
          <p className="text-sm text-[#94a6cb] mt-1 italic">Previewing new layout</p>
        </div>
      </div>

      <div className="border border-[#1f315a] flex h-[600px] bg-[#0b1733]">
        {/* Sidebar */}
        <div className="w-64 border-r border-[#1f315a] bg-[#122144] flex flex-col">
          <div className="p-4 border-b border-[#1f315a]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#94a6cb]" />
              <input 
                type="text" 
                placeholder="Search settings..." 
                className="w-full bg-[#0b1733] border border-[#1f315a] rounded-sm py-1.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-[#d4af37]/50 transition-colors"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto py-4">
            <SidebarSection title="Match Data">
              <SidebarItem icon={AlignLeft} label="Record Match" />
              <SidebarItem icon={ListVideo} label="Replays" />
              <SidebarItem icon={AlignLeft} label="Match List" />
            </SidebarSection>
            
            <SidebarSection title="Players">
              <SidebarItem icon={Users} label="Roster" />
              <SidebarItem icon={AlignLeft} label="Nicknames" />
              <SidebarItem icon={UserX} label="Bans" />
            </SidebarSection>

            <SidebarSection title="Seasons">
              <SidebarItem icon={Settings} label="Settings" />
              <SidebarItem icon={AlignLeft} label="Patch Notes" />
              <SidebarItem icon={AlignLeft} label="Welcome Modal" active />
            </SidebarSection>

            <SidebarSection title="Community">
              <SidebarItem icon={Trophy} label="Tournaments" />
              <SidebarItem icon={Users} label="Coaching" />
              <SidebarItem icon={Bell} label="Notifications" />
            </SidebarSection>

            <SidebarSection title="System">
              <SidebarItem icon={SwitchCamera} label="Feature Flags" />
              <SidebarItem icon={AlignLeft} label="Audit Log" />
              <SidebarItem icon={Activity} label="Health" />
            </SidebarSection>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#0b1733] p-8 overflow-y-auto">
          <div className="max-w-2xl">
            <div className="mb-8">
              <h3 className="font-serif text-2xl font-semibold mb-2">Welcome Modal</h3>
              <p className="text-[#94a6cb] text-sm">Configure the announcement popup shown to users upon login.</p>
            </div>

            <Card className="bg-[#122144] border-[#1f315a] rounded-none shadow-none mb-8">
              <CardContent className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-white font-medium text-base">Enable Modal</Label>
                    <p className="text-sm text-[#94a6cb]">Show this modal to all users who haven't dismissed it.</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                
                <div className="h-px bg-[#1f315a]" />
                
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#94a6cb] uppercase tracking-wider text-xs font-semibold">Eyebrow</Label>
                    <Input defaultValue="Patch Notes" className="bg-[#0b1733] border-[#1f315a] rounded-none focus-visible:ring-[#d4af37]" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[#94a6cb] uppercase tracking-wider text-xs font-semibold">Title</Label>
                    <Input defaultValue="Season 10 is here" className="bg-[#0b1733] border-[#1f315a] rounded-none focus-visible:ring-[#d4af37]" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[#94a6cb] uppercase tracking-wider text-xs font-semibold">Body</Label>
                    <textarea 
                      className="w-full min-h-[100px] bg-[#0b1733] border border-[#1f315a] rounded-none p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#d4af37]"
                      defaultValue="We've reset the ladder and introduced new matchmaking rules. Read the full patch notes to see what's changed."
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[#94a6cb] uppercase tracking-wider text-xs font-semibold">CTA Text</Label>
                      <Input defaultValue="Read Notes" className="bg-[#0b1733] border-[#1f315a] rounded-none focus-visible:ring-[#d4af37]" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[#94a6cb] uppercase tracking-wider text-xs font-semibold">Version Bump</Label>
                      <Input defaultValue="v5.60" className="bg-[#0b1733] border-[#1f315a] rounded-none focus-visible:ring-[#d4af37]" />
                    </div>
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end">
                  <Button className="bg-[#d4af37] text-black hover:bg-[#d4af37]/90 rounded-none">
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-[#94a6cb]">Live Preview</h4>
              <div className="border border-[#1f315a] p-8 bg-black/40 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-[#0b1733]/60 backdrop-blur-sm" />
                <div className="relative bg-[#122144] border border-[#1f315a] p-8 max-w-sm w-full text-center shadow-2xl">
                  <div className="text-xs uppercase tracking-widest text-[#d4af37] mb-3">Patch Notes</div>
                  <h3 className="font-serif text-3xl font-bold text-white mb-4">Season 10 is here</h3>
                  <p className="text-[#94a6cb] text-sm leading-relaxed mb-8">
                    We've reset the ladder and introduced new matchmaking rules. Read the full patch notes to see what's changed.
                  </p>
                  <Button className="bg-[#d4af37] text-black hover:bg-[#d4af37]/90 rounded-none w-full py-6 text-base tracking-wide">
                    Read Notes
                  </Button>
                  <button className="mt-4 text-xs text-[#94a6cb] hover:text-white uppercase tracking-wider underline-offset-4 hover:underline">
                    Dismiss
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="mb-6 px-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-[#94a6cb] mb-2 px-3">
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
        ? "bg-[#1f315a] text-white font-medium" 
        : "text-[#94a6cb] hover:bg-[#1f315a]/50 hover:text-white"
    }`}>
      <Icon className={`w-4 h-4 ${active ? "text-[#d4af37]" : "text-[#94a6cb]"}`} />
      <span>{label}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#1f315a] bg-[#0b1733] py-8 text-sm text-[#94a6cb]">
      <div className="max-w-[1280px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-4 h-4 grayscale opacity-50" />
          <span>© {new Date().getFullYear()} OCE Inhouse. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-white transition-colors">Discord</a>
          <a href="#" className="hover:text-white transition-colors">GitHub</a>
          <span className="text-[#1f315a]">|</span>
          <span className="font-mono text-xs">v5.59 — <a href="#" className="text-[#d4af37] hover:underline">patch notes</a></span>
        </div>
      </div>
    </footer>
  );
}
