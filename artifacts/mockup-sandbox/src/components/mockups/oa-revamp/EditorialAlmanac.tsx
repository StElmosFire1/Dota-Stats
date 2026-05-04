import React from "react";
import "./_editorialalmanac.css";
import { BookOpen, Shield, Trophy, Activity, ArrowRight, User, Settings, Users, BookMarked, Search, ScrollText, Flag, Award, Swords, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function EditorialAlmanac() {
  return (
    <div className="editorial-almanac min-h-screen relative selection:bg-[#3a322c] selection:text-[#f4f1ea] paper-texture">
      <div className="max-w-[1280px] mx-auto bg-[#f4f1ea] shadow-2xl relative z-10 border-x border-[#3a322c]/20 min-h-screen flex flex-col">
        <Header />
        
        <main className="flex-1 px-8 md:px-16 py-12 space-y-20">
          <Hero />
          
          <div className="engraved-rule" />
          
          <StatsStrip />
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
            <div className="lg:col-span-8 space-y-16">
              <LatestMatches />
              <AdminSidebarPreview />
            </div>
            
            <div className="lg:col-span-4 relative">
              {/* Vertical divider rule */}
              <div className="hidden lg:block absolute -left-8 top-0 bottom-0 w-px bg-[#3a322c]/20" />
              <div className="hidden lg:block absolute -left-9 top-0 bottom-0 w-px bg-[#3a322c]/10" />
              
              <LeaderboardPreview />
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b-2 border-[#3a322c] bg-[#ece9df] relative">
      <div className="border-b border-[#3a322c]/30 py-1">
        <div className="px-8 md:px-16 flex items-center justify-between text-xs font-semibold tracking-widest text-[#665f58] uppercase">
          <span>Vol. X — MMXVI</span>
          <span>Australia & New Zealand</span>
        </div>
      </div>
      <div className="px-8 md:px-16 h-20 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 border border-[#3a322c] p-1 flex items-center justify-center bg-[#3a322c]">
            <img src="/__mockup/images/oa-logo.png" alt="OCE Inhouse" className="w-8 h-8 filter brightness-0 invert" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif-display text-2xl font-bold tracking-widest text-[#3a322c] leading-none">OCE INHOUSE</span>
            <span className="text-xs italic text-[#665f58]">The Premier Dota 2 League</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-8 text-[#3a322c] font-medium tracking-wide">
          <a href="#" className="border-b border-[#3a322c] pb-0.5">Index</a>
          <a href="#" className="hover:text-[#8b7355] transition-colors">Chronicle</a>
          <a href="#" className="hover:text-[#8b7355] transition-colors">Registry</a>
          <a href="#" className="hover:text-[#8b7355] transition-colors">Portraits</a>
          <div className="flex items-center gap-1 hover:text-[#8b7355] transition-colors cursor-pointer">
            <span>Appendix</span>
            <ChevronDown className="w-3 h-3" />
          </div>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex flex-col text-right">
            <span className="text-[10px] uppercase tracking-widest text-[#665f58] font-bold">Current Volume</span>
            <span className="font-serif-display font-bold text-[#3a322c]">Season 10</span>
          </div>
          
          <div className="flex items-center gap-3 pl-6 border-l border-[#3a322c]/30">
            <div className="text-right">
              <div className="text-sm font-bold text-[#3a322c]">u/cookie</div>
              <div className="text-xs font-serif-display font-bold text-[#8b7355]">7240 MMR</div>
            </div>
            <div className="w-10 h-10 border border-[#3a322c] p-0.5 bg-[#ece9df]">
              <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie&backgroundColor=ece9df&style=shape" alt="Avatar" className="w-full h-full portrait-slot object-cover" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative py-8 md:py-16 flex flex-col items-center text-center">
      <div className="w-16 h-16 mb-8 text-[#3a322c] border border-[#3a322c] rounded-full flex items-center justify-center">
        <Shield className="w-8 h-8" strokeWidth={1.5} />
      </div>
      
      <h1 className="font-serif-display text-5xl md:text-7xl font-black text-[#3a322c] leading-tight max-w-4xl mx-auto uppercase tracking-wide">
        Track Every Inhouse.<br />
        <span className="text-[#8b7355] brass-text">Climb the OCE Ladder.</span>
      </h1>
      
      <p className="mt-8 text-xl text-[#3a322c] max-w-2xl mx-auto leading-relaxed italic">
        An archival registry of the premier Dota 2 inhouse league for Australia and New Zealand. Compete with honor, analyze with precision, and immortalize your rank.
      </p>
      
      <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6">
        <Button className="bg-[#3a322c] text-[#f4f1ea] hover:bg-[#1c1914] rounded-none px-10 py-7 h-auto font-serif-display text-sm tracking-widest uppercase border border-[#1c1914]">
          View The Registry
        </Button>
        <Button variant="outline" className="border-[#3a322c] text-[#3a322c] hover:bg-[#ece9df] rounded-none px-10 py-7 h-auto font-serif-display text-sm tracking-widest uppercase bg-transparent">
          Join The League
        </Button>
      </div>
    </section>
  );
}

function StatsStrip() {
  const stats = [
    { label: "Matches Played", value: "1,284" },
    { label: "Active Roster", value: "87" },
    { label: "Hours Logged", value: "3,640" },
    { label: "Leading Hero", value: "Pudge" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-[#3a322c] bg-[#ece9df]">
      {stats.map((stat, i) => (
        <div key={i} className={`p-8 text-center ${i < stats.length - 1 ? 'border-r border-[#3a322c]' : ''}`}>
          <div className="font-serif-display text-4xl font-black text-[#3a322c] mb-2">{stat.value}</div>
          <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[#665f58]">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

function LatestMatches() {
  const matches = [
    { id: "IX-001", radiant: true, score: "42-38", duration: "45:12", mvp: "cookie", time: "11 May, 14:00" },
    { id: "IX-002", radiant: false, score: "12-30", duration: "24:05", mvp: "spicy", time: "11 May, 11:30" },
    { id: "IX-003", radiant: true, score: "55-54", duration: "62:10", mvp: "chobo", time: "10 May, 20:15" },
    { id: "IX-004", radiant: false, score: "22-18", duration: "30:45", mvp: "fuzion", time: "10 May, 18:00" },
    { id: "IX-005", radiant: true, score: "15-40", duration: "28:20", mvp: "cookie", time: "09 May, 21:45" },
  ];

  return (
    <section>
      <div className="flex items-end justify-between mb-6">
        <h2 className="font-serif-display text-3xl font-bold text-[#3a322c] uppercase tracking-wide flex items-center gap-4">
          <BookOpen className="w-6 h-6 text-[#8b7355]" />
          Recent Chronicle
        </h2>
        <a href="#" className="text-xs uppercase tracking-widest font-bold text-[#8b7355] hover:text-[#3a322c] transition-colors border-b border-[#8b7355] pb-0.5">
          Full Ledger
        </a>
      </div>
      
      <div className="border-t-2 border-b-2 border-[#3a322c]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#3a322c]">
              <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-bold text-[#665f58]">Ref</th>
              <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-bold text-[#665f58]">Victor</th>
              <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-bold text-[#665f58]">Score</th>
              <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-bold text-[#665f58]">Duration</th>
              <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-bold text-[#665f58]">Notable</th>
              <th className="py-4 px-4 text-[10px] uppercase tracking-widest font-bold text-[#665f58] text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#3a322c]/20">
            {matches.map((match) => (
              <tr key={match.id} className="hover:bg-[#ece9df] transition-colors">
                <td className="py-4 px-4 font-serif-display text-xs text-[#665f58] font-bold">{match.id}</td>
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#3a322c]">{match.radiant ? "Radiant" : "Dire"}</span>
                    {match.radiant && <Swords className="w-3 h-3 text-[#8b7355]" />}
                  </div>
                </td>
                <td className="py-4 px-4 font-serif-display text-lg font-bold text-[#3a322c]">{match.score}</td>
                <td className="py-4 px-4 text-[#665f58] text-sm">{match.duration}</td>
                <td className="py-4 px-4 text-[#8b7355] font-bold italic">{match.mvp}</td>
                <td className="py-4 px-4 text-right text-[#665f58] text-sm">{match.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeaderboardPreview() {
  const players = [
    { rank: "I", name: "cookie", mmr: 7240, wl: "41W-22L", tier: "Immortal" },
    { rank: "II", name: "spicy", mmr: 6980, wl: "38W-19L", tier: "Immortal" },
    { rank: "III", name: "chobo", mmr: 6850, wl: "35W-25L", tier: "Immortal" },
    { rank: "IV", name: "fuzion", mmr: 6420, wl: "40W-30L", tier: "Divine" },
    { rank: "V", name: "snute", mmr: 6100, wl: "28W-20L", tier: "Divine" },
  ];

  return (
    <section>
      <div className="text-center mb-8 border-b-2 border-[#3a322c] pb-4">
        <h2 className="font-serif-display text-2xl font-bold text-[#3a322c] uppercase tracking-widest mb-1">
          The Registry
        </h2>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8b7355]">Top 5 Honors — Season 10</p>
      </div>

      <div className="space-y-4">
        {players.map((p, i) => (
          <div key={p.rank} className="flex items-center gap-4 p-4 border border-[#3a322c] bg-[#ece9df] relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#3a322c]" />
            
            <div className="w-8 text-center font-serif-display text-2xl font-black text-[#8b7355] pl-2">{p.rank}</div>
            
            <div className="w-10 h-10 border border-[#3a322c] p-0.5 bg-[#f4f1ea]">
               <img src={`https://api.dicebear.com/9.x/identicon/svg?seed=${p.name}&backgroundColor=ece9df&style=shape`} alt={p.name} className="w-full h-full portrait-slot object-cover" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[#3a322c] text-lg leading-none mb-1 truncate">{p.name}</div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-[#665f58]">{p.tier}</div>
            </div>
            
            <div className="text-right">
              <div className="font-serif-display text-xl font-bold text-[#3a322c]">{p.mmr}</div>
              <div className="text-xs text-[#665f58] italic">{p.wl}</div>
            </div>
          </div>
        ))}
      </div>
      
      <Button variant="outline" className="w-full mt-6 border-[#3a322c] text-[#3a322c] hover:bg-[#3a322c] hover:text-[#f4f1ea] rounded-none py-6 font-serif-display text-xs uppercase tracking-widest bg-transparent transition-colors">
        Examine Complete Registry
      </Button>
    </section>
  );
}

function AdminSidebarPreview() {
  return (
    <section className="pt-8 border-t border-[#3a322c]/20">
      <div className="mb-8 text-center lg:text-left">
        <h2 className="font-serif-display text-3xl font-bold text-[#3a322c] uppercase tracking-wide">
          Chamber of Records
        </h2>
        <p className="text-sm text-[#665f58] italic mt-2">Administrative privileges granted.</p>
      </div>

      <div className="border-2 border-[#3a322c] flex flex-col md:flex-row min-h-[600px] bg-[#ece9df]">
        {/* Sidebar */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-[#3a322c] bg-[#f4f1ea] flex flex-col">
          <div className="p-4 border-b border-[#3a322c]">
            <div className="border border-[#3a322c] p-1 flex items-center bg-[#ece9df]">
              <Search className="w-4 h-4 ml-2 text-[#665f58]" />
              <input 
                type="text" 
                placeholder="Search records..." 
                className="w-full bg-transparent border-none py-1.5 px-3 text-sm text-[#3a322c] placeholder:text-[#665f58]/50 focus:outline-none italic"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto py-6">
            <SidebarSection title="Ledger">
              <SidebarItem icon={ScrollText} label="Record Match" />
              <SidebarItem icon={BookMarked} label="Replays" />
              <SidebarItem icon={BookOpen} label="Chronicle" />
            </SidebarSection>
            
            <SidebarSection title="Registry">
              <SidebarItem icon={Users} label="Roster" />
              <SidebarItem icon={User} label="Nicknames" />
              <SidebarItem icon={Shield} label="Excommunications" />
            </SidebarSection>

            <SidebarSection title="Volumes">
              <SidebarItem icon={Settings} label="Settings" />
              <SidebarItem icon={ScrollText} label="Patch Notes" />
              <SidebarItem icon={Flag} label="Proclamation" active />
            </SidebarSection>

            <SidebarSection title="Society">
              <SidebarItem icon={Trophy} label="Tournaments" />
              <SidebarItem icon={Award} label="Tutors" />
            </SidebarSection>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 md:p-10 bg-[#ece9df] overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8 border-b border-[#3a322c] pb-4">
              <h3 className="font-serif-display text-2xl font-bold text-[#3a322c] uppercase tracking-widest mb-2">Proclamation settings</h3>
              <p className="text-[#665f58] text-sm italic">The announcement presented to all members upon entry.</p>
            </div>

            <div className="border border-[#3a322c] bg-[#f4f1ea] p-8 mb-10 ornate-border relative shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <label className="text-[#3a322c] font-bold uppercase tracking-widest text-xs block mb-1">Enact Proclamation</label>
                  <p className="text-xs text-[#665f58] italic">Display this decree to all active members.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-[#3a322c]">Off</span>
                  <Switch defaultChecked className="data-[state=checked]:bg-[#8b7355] data-[state=unchecked]:bg-[#e2dbcd] border-2 border-[#3a322c]" />
                  <span className="text-xs font-bold uppercase tracking-widest text-[#3a322c]">On</span>
                </div>
              </div>
              
              <div className="engraved-rule-light mb-6" />
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#665f58] mb-2">Superscription (Eyebrow)</label>
                  <input type="text" defaultValue="Vol X. Decree" className="w-full border-b-2 border-[#3a322c] bg-transparent pb-2 text-[#3a322c] font-serif-display font-bold focus:outline-none focus:border-[#8b7355] transition-colors" />
                </div>
                
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#665f58] mb-2">Heading</label>
                  <input type="text" defaultValue="A New Era Dawns" className="w-full border-b-2 border-[#3a322c] bg-transparent pb-2 text-[#3a322c] font-serif-display text-xl font-bold focus:outline-none focus:border-[#8b7355] transition-colors" />
                </div>
                
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#665f58] mb-2">Decree Body</label>
                  <textarea 
                    rows={4}
                    className="w-full border border-[#3a322c] bg-[#ece9df] p-4 text-[#3a322c] italic focus:outline-none focus:border-[#8b7355] transition-colors resize-none"
                    defaultValue="The ranks have been cleansed. The captains stand ready. We commence the tenth season of our honorable league. Consult the full ledger for amendments."
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#665f58] mb-2">Action Inscription</label>
                    <input type="text" defaultValue="Read Amendments" className="w-full border-b-2 border-[#3a322c] bg-transparent pb-2 text-[#3a322c] font-serif-display font-bold focus:outline-none focus:border-[#8b7355] transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-[0.2em] font-bold text-[#665f58] mb-2">Edition (Version)</label>
                    <input type="text" defaultValue="v5.60" className="w-full border-b-2 border-[#3a322c] bg-transparent pb-2 text-[#3a322c] font-bold focus:outline-none focus:border-[#8b7355] transition-colors" />
                  </div>
                </div>
              </div>
              
              <div className="mt-8 flex justify-end">
                <Button className="bg-[#3a322c] text-[#f4f1ea] hover:bg-[#1c1914] rounded-none px-8 font-serif-display text-xs tracking-widest uppercase border border-[#1c1914]">
                  Seal Records
                </Button>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#665f58] text-center">Visual Proof</h4>
              <div className="border border-[#3a322c] p-8 md:p-12 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-[#1c1914] flex items-center justify-center">
                <div className="bg-[#f4f1ea] border-2 border-[#3a322c] p-1 shadow-2xl max-w-sm w-full">
                  <div className="border border-[#3a322c] p-8 text-center ornate-border">
                    <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#8b7355] mb-4">Vol X. Decree</div>
                    <h3 className="font-serif-display text-2xl font-black text-[#3a322c] mb-4 uppercase leading-tight">A New Era Dawns</h3>
                    <div className="w-12 h-px bg-[#3a322c] mx-auto mb-6" />
                    <p className="text-[#3a322c] text-sm italic leading-relaxed mb-8">
                      The ranks have been cleansed. The captains stand ready. We commence the tenth season of our honorable league. Consult the full ledger for amendments.
                    </p>
                    <Button className="w-full bg-[#3a322c] text-[#f4f1ea] hover:bg-[#1c1914] rounded-none py-6 font-serif-display text-xs tracking-widest uppercase mb-4">
                      Read Amendments
                    </Button>
                    <button className="text-[10px] uppercase tracking-widest text-[#665f58] hover:text-[#3a322c] font-bold transition-colors">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}

function SidebarSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="mb-8 px-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px bg-[#3a322c]/30 flex-1" />
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8b7355]">
          {title}
        </div>
        <div className="h-px bg-[#3a322c]/30 flex-1" />
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
}

function SidebarItem({ icon: Icon, label, active = false }: { icon: any, label: string, active?: boolean }) {
  return (
    <div className={`flex items-center gap-4 px-4 py-2 cursor-pointer transition-colors border-l-2 ${
      active 
        ? "border-[#8b7355] bg-[#ece9df] text-[#3a322c] font-bold" 
        : "border-transparent text-[#665f58] hover:bg-[#ece9df]/50 hover:text-[#3a322c]"
    }`}>
      <Icon className={`w-4 h-4 ${active ? "text-[#8b7355]" : "text-[#665f58]"}`} />
      <span className="text-sm font-serif-display tracking-wide">{label}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t-4 border-[#3a322c] bg-[#ece9df] py-12 text-sm text-[#665f58]">
      <div className="max-w-[1280px] mx-auto px-8 md:px-16 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 border border-[#3a322c] p-0.5 flex items-center justify-center bg-[#3a322c]">
            <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-5 h-5 filter brightness-0 invert" />
          </div>
          <span className="font-bold">© {new Date().getFullYear()} OCE Inhouse Society.</span>
        </div>
        <div className="flex items-center gap-6 text-xs uppercase tracking-widest font-bold">
          <a href="#" className="hover:text-[#3a322c] transition-colors border-b border-transparent hover:border-[#3a322c]">Telegraph (Discord)</a>
          <a href="#" className="hover:text-[#3a322c] transition-colors border-b border-transparent hover:border-[#3a322c]">Archives (GitHub)</a>
          <span className="text-[#3a322c]">|</span>
          <span className="font-serif-display">Vol 5.60 — <a href="#" className="text-[#8b7355] hover:text-[#3a322c] border-b border-[#8b7355] hover:border-[#3a322c] transition-colors">Amendments</a></span>
        </div>
      </div>
    </footer>
  );
}
