import React from "react";
import "./_editorialbroadsheet.css";
import { ChevronDown, Trophy, Clock, Users, Activity, Settings, Shield, Bell, ListVideo, AlignLeft, UserX, SwitchCamera, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function EditorialBroadsheet() {
  return (
    <div className="editorial-broadsheet min-h-screen news-texture selection:bg-[#c1272d] selection:text-white pb-20">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8">
        <Header />
        
        <main className="mt-6">
          <Hero />
          
          <div className="double-rule my-8" />
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Latest Matches & Leaderboard */}
            <div className="lg:col-span-8 flex flex-col gap-8 lg:pr-8 column-rule">
              <LatestMatches />
              <div className="h-px bg-black w-full my-2" />
              <AdminSidebarPreview />
            </div>
            
            {/* Right Column: Stats & Admin */}
            <div className="lg:col-span-4 flex flex-col gap-8">
              <StatsStrip />
              <div className="h-px bg-black w-full" />
              <LeaderboardPreview />
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}

function Header() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  return (
    <header className="pt-6">
      {/* Top small bar */}
      <div className="flex items-center justify-between border-b border-black pb-2 mb-4 text-xs font-condensed tracking-widest text-black/70">
        <div>EDITION NO. 402</div>
        <div>SYDNEY / AUCKLAND</div>
        <div>{today.toUpperCase()}</div>
      </div>
      
      {/* Masthead */}
      <div className="flex items-center justify-between py-6 border-b-4 border-black mb-1">
        <div className="flex items-center gap-4">
          <img src="/__mockup/images/oa-logo.png" alt="OCE Inhouse" className="h-16 w-16 invert" />
          <div className="flex flex-col">
            <h1 className="font-condensed text-6xl md:text-8xl leading-none tracking-tight font-bold ink-bleed">
              OCE INHOUSE
            </h1>
            <span className="font-serif italic text-sm md:text-lg -mt-1 tracking-wide">The Premier Dota 2 Daily</span>
          </div>
        </div>
        
        <div className="hidden md:flex flex-col items-end text-right">
          <div className="border border-black p-2 font-condensed tracking-widest text-xs flex flex-col items-center justify-center bg-black text-white px-4">
            <span className="opacity-80">CURRENT SEASON</span>
            <span className="text-xl font-bold">SEASON 10</span>
          </div>
        </div>
      </div>
      <div className="border-b border-black mb-4" />

      {/* Nav */}
      <div className="flex items-center justify-between py-2 border-b border-black">
        <nav className="hidden md:flex items-center gap-6 font-condensed text-lg tracking-wide">
          <a href="#" className="text-[#c1272d] font-bold hover:underline underline-offset-4 decoration-2">HOME</a>
          <a href="#" className="hover:text-[#c1272d] transition-colors">MATCHES</a>
          <a href="#" className="hover:text-[#c1272d] transition-colors">LEADERBOARD</a>
          <a href="#" className="hover:text-[#c1272d] transition-colors">HEROES</a>
          <a href="#" className="hover:text-[#c1272d] transition-colors">TOURNAMENTS</a>
          <a href="#" className="hover:text-[#c1272d] transition-colors">SCHEDULE</a>
        </nav>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border border-black px-2 py-1 cursor-pointer hover:bg-black hover:text-white transition-colors">
            <span className="font-condensed text-sm font-bold tracking-wider">SUBSCRIBE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-headline font-bold text-sm">u/cookie</span>
            <span className="font-condensed text-xs text-[#c1272d] tracking-widest">7240 MMR</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="py-6">
      <div className="text-center max-w-4xl mx-auto space-y-6">
        <div className="font-condensed text-[#c1272d] text-xl font-bold tracking-widest uppercase">
          BREAKING NEWS — THE CLIMB BEGINS
        </div>
        <h2 className="font-headline text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight ink-bleed">
          Track Every Inhouse.<br />
          Climb the OCE Ladder.
        </h2>
        <p className="font-serif text-xl md:text-2xl text-black/80 leading-relaxed max-w-2xl mx-auto pt-4">
          The proving grounds for Australia and New Zealand's finest. A new season dawns, bringing fierce rivalries and unprecedented analytics to the region.
        </p>
        <div className="pt-8 flex items-center justify-center gap-4">
          <Button className="bg-black text-white hover:bg-[#c1272d] rounded-none px-8 py-6 h-auto font-condensed text-xl tracking-widest uppercase">
            Read The Rules
          </Button>
          <Button variant="outline" className="border-2 border-black text-black hover:bg-black hover:text-white rounded-none px-8 py-6 h-auto font-condensed text-xl tracking-widest uppercase">
            Join The League
          </Button>
        </div>
      </div>
    </section>
  );
}

function StatsStrip() {
  const stats = [
    { label: "Matches Played", value: "1,284" },
    { label: "Active Players", value: "87" },
    { label: "Hours Logged", value: "3,640" },
    { label: "Top Hero", value: "Pudge" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="font-condensed text-2xl font-bold border-b-2 border-black pb-1 uppercase tracking-widest">
        The Numbers
      </div>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="border border-black p-4 text-center">
            <div className="font-headline text-3xl font-bold text-[#c1272d] mb-1">{stat.value}</div>
            <div className="font-condensed text-xs uppercase tracking-widest text-black/70">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LatestMatches() {
  const matches = [
    { id: 1, side: "Radiant", score: "42-38", duration: "45:12", mvp: "cookie", time: "2h ago", won: true },
    { id: 2, side: "Dire", score: "12-30", duration: "24:05", mvp: "spicy", time: "5h ago", won: false },
    { id: 3, side: "Radiant", score: "55-54", duration: "62:10", mvp: "chobo", time: "1d ago", won: true },
    { id: 4, side: "Dire", score: "22-18", duration: "30:45", mvp: "fuzion", time: "1d ago", won: true },
    { id: 5, side: "Radiant", score: "15-40", duration: "28:20", mvp: "cookie", time: "2d ago", won: false },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between border-b-4 border-black pb-2">
        <h2 className="font-headline text-4xl font-bold">Latest Results</h2>
        <a href="#" className="font-condensed text-sm text-[#c1272d] hover:underline uppercase tracking-widest font-bold">
          See Full Ledger &rarr;
        </a>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left font-serif">
          <thead className="border-b-2 border-black font-condensed text-sm">
            <tr>
              <th className="py-3 font-bold tracking-widest uppercase">Victor</th>
              <th className="py-3 font-bold tracking-widest uppercase">Score</th>
              <th className="py-3 font-bold tracking-widest uppercase">Duration</th>
              <th className="py-3 font-bold tracking-widest uppercase">MVP</th>
              <th className="py-3 font-bold tracking-widest uppercase text-right">Printed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/20">
            {matches.map((match) => (
              <tr key={match.id} className="hover:bg-black/5 transition-colors cursor-pointer group">
                <td className="py-4">
                  <span className={`font-condensed font-bold tracking-wider px-2 py-0.5 text-xs ${match.won ? 'bg-black text-white' : 'border border-black text-black'}`}>
                    {match.side.toUpperCase()}
                  </span>
                </td>
                <td className="py-4 font-headline text-xl font-bold tracking-wide">{match.score}</td>
                <td className="py-4 text-black/70 italic">{match.duration}</td>
                <td className="py-4 font-bold text-[#c1272d]">{match.mvp}</td>
                <td className="py-4 text-right text-sm text-black/60 italic">{match.time}</td>
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
    { rank: 1, name: "cookie", mmr: 7240, wl: "41W-22L", tier: "Immortal" },
    { rank: 2, name: "spicy", mmr: 6980, wl: "38W-19L", tier: "Immortal" },
    { rank: 3, name: "chobo", mmr: 6850, wl: "35W-25L", tier: "Immortal" },
    { rank: 4, name: "fuzion", mmr: 6420, wl: "40W-30L", tier: "Divine" },
    { rank: 5, name: "snute", mmr: 6100, wl: "28W-20L", tier: "Divine" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between border-b-4 border-black pb-2">
        <h2 className="font-headline text-3xl font-bold">The Top 5</h2>
      </div>

      <div className="flex flex-col gap-2">
        {players.map((p) => (
          <div key={p.rank} className="flex items-center gap-4 py-3 border-b border-black/20 group hover:bg-black/5">
            <div className="w-8 text-center font-headline text-3xl font-bold text-black/30 group-hover:text-black transition-colors">{p.rank}</div>
            
            <div className="flex-1 min-w-0">
              <div className="font-bold font-headline text-lg truncate">{p.name}</div>
              <div className="font-condensed text-[10px] text-black/60 uppercase tracking-widest">{p.tier}</div>
            </div>
            
            <div className="text-right">
              <div className="font-condensed text-xl text-[#c1272d] font-bold">{p.mmr}</div>
              <div className="font-serif italic text-xs text-black/70">{p.wl}</div>
            </div>
          </div>
        ))}
      </div>
      
      <Button variant="outline" className="w-full mt-4 border-2 border-black text-black hover:bg-black hover:text-white rounded-none font-condensed uppercase tracking-widest font-bold">
        Complete Standings
      </Button>
    </div>
  );
}

function AdminSidebarPreview() {
  return (
    <div className="space-y-6 pt-6">
      <div className="border-b-2 border-black pb-2 mb-6">
        <div className="font-condensed text-[#c1272d] font-bold tracking-widest text-sm mb-1 uppercase">Behind The Scenes</div>
        <h2 className="font-headline text-4xl font-bold">Editorial Desk (Admin)</h2>
      </div>

      <div className="flex flex-col md:flex-row border-t-2 border-b-2 border-l border-r border-black bg-white">
        {/* Sidebar */}
        <div className="w-full md:w-64 border-r border-black bg-black/5 flex flex-col">
          <div className="p-4 border-b border-black">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-black/50" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="w-full bg-white border border-black rounded-none py-1.5 pl-9 pr-3 text-sm text-black focus:outline-none focus:border-[#c1272d] font-condensed uppercase tracking-wider"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto py-4 font-condensed">
            <SidebarSection title="Operations">
              <SidebarItem icon={AlignLeft} label="Record Match" />
              <SidebarItem icon={ListVideo} label="Archives" />
              <SidebarItem icon={AlignLeft} label="Ledger" />
            </SidebarSection>
            
            <SidebarSection title="Personnel">
              <SidebarItem icon={Users} label="Roster" />
              <SidebarItem icon={UserX} label="Blacklist" />
            </SidebarSection>

            <SidebarSection title="Publications">
              <SidebarItem icon={Settings} label="Printing Press" />
              <SidebarItem icon={AlignLeft} label="Bulletin" active />
            </SidebarSection>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 md:p-10 bg-white">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8 text-center border-b border-black/20 pb-6">
              <h3 className="font-headline text-3xl font-bold mb-2">The Bulletin Board</h3>
              <p className="font-serif italic text-black/70">Draft the front-page announcement for our readers.</p>
            </div>

            <Card className="bg-transparent border border-black rounded-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-12">
              <CardContent className="p-6 md:p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label className="font-condensed text-xl font-bold tracking-widest uppercase">Print Bulletin</Label>
                    <p className="font-serif italic text-sm text-black/70">Display this notice prominently.</p>
                  </div>
                  <Switch defaultChecked className="data-[state=checked]:bg-[#c1272d]" />
                </div>
                
                <div className="h-px bg-black/20" />
                
                <div className="grid gap-6">
                  <div className="space-y-2">
                    <Label className="font-condensed uppercase tracking-widest text-sm font-bold text-black/60">Kicker</Label>
                    <Input defaultValue="Patch Notes" className="border-black rounded-none focus-visible:ring-[#c1272d] font-condensed uppercase text-lg px-4 py-6 h-auto" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="font-condensed uppercase tracking-widest text-sm font-bold text-black/60">Headline</Label>
                    <Input defaultValue="Season 10 Commences" className="border-black rounded-none focus-visible:ring-[#c1272d] font-headline text-2xl px-4 py-6 h-auto font-bold" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="font-condensed uppercase tracking-widest text-sm font-bold text-black/60">Story</Label>
                    <textarea 
                      className="w-full min-h-[120px] border border-black rounded-none p-4 font-serif text-lg leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#c1272d]"
                      defaultValue="The ladders have been cleared and the ink is fresh. Read the latest changes to the tournament structure before stepping into the fray."
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="font-condensed uppercase tracking-widest text-sm font-bold text-black/60">Action Text</Label>
                      <Input defaultValue="Read Full Story" className="border-black rounded-none focus-visible:ring-[#c1272d] font-condensed uppercase text-lg py-6 h-auto" />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-condensed uppercase tracking-widest text-sm font-bold text-black/60">Edition</Label>
                      <Input defaultValue="Vol 5.60" className="border-black rounded-none focus-visible:ring-[#c1272d] font-condensed uppercase text-lg py-6 h-auto" />
                    </div>
                  </div>
                </div>
                
                <div className="pt-6 border-t border-black/20 flex justify-end">
                  <Button className="bg-black text-white hover:bg-[#c1272d] rounded-none px-8 py-6 h-auto font-condensed text-xl tracking-widest uppercase">
                    Publish to Press
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <div className="space-y-4">
              <h4 className="font-condensed font-bold uppercase tracking-widest text-lg border-b-2 border-black inline-block pb-1">Preview</h4>
              <div className="border-2 border-black p-8 bg-[#f7f5f0] flex items-center justify-center relative bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')]">
                <div className="relative bg-white border border-black p-8 max-w-md w-full text-center shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                  <div className="font-condensed text-sm font-bold tracking-widest text-[#c1272d] mb-4 uppercase">Patch Notes</div>
                  <h3 className="font-headline text-4xl font-bold text-black mb-4 leading-tight">Season 10 Commences</h3>
                  <p className="font-serif text-lg text-black/80 leading-relaxed mb-8 italic">
                    The ladders have been cleared and the ink is fresh. Read the latest changes to the tournament structure before stepping into the fray.
                  </p>
                  <Button className="bg-black text-white hover:bg-[#c1272d] rounded-none w-full py-6 text-xl font-condensed tracking-widest uppercase mb-4">
                    Read Full Story
                  </Button>
                  <button className="text-sm font-condensed font-bold text-black/50 hover:text-black uppercase tracking-widest underline decoration-1 underline-offset-4">
                    Close Edition
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
    <div className="mb-6 px-4">
      <div className="text-sm font-bold uppercase tracking-widest text-black/50 mb-3 pb-1 border-b border-black/20">
        {title}
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
}

function SidebarItem({ icon: Icon, label, active = false }: { icon: any, label: string, active?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 text-base uppercase tracking-wider font-bold cursor-pointer transition-colors ${
      active 
        ? "bg-black text-white" 
        : "text-black/70 hover:bg-black/10 hover:text-black"
    }`}>
      <Icon className={`w-4 h-4 ${active ? "text-white" : "text-black/50"}`} />
      <span>{label}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t-4 border-black bg-black text-white py-12 mt-16 font-condensed">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-8 h-8 invert" />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-widest">OCE INHOUSE</span>
            <span className="text-xs text-white/50 tracking-wider">© {new Date().getFullYear()} ALL RIGHTS RESERVED.</span>
          </div>
        </div>
        <div className="flex items-center gap-8 text-sm font-bold tracking-widest text-white/70">
          <a href="#" className="hover:text-white transition-colors">TELEGRAPH (DISCORD)</a>
          <a href="#" className="hover:text-white transition-colors">ARCHIVES (GITHUB)</a>
          <span className="text-white/30">|</span>
          <span className="text-[#c1272d]">VOL 5.59</span>
        </div>
      </div>
    </footer>
  );
}
