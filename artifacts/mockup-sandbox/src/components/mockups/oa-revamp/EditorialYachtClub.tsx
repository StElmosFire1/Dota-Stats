import React from "react";
import "./_editorialyachtclub.css";
import { 
  ChevronDown, Search, Shield, Anchor, Wind,
  Trophy, Users, Clock, Activity, Settings, ListVideo, AlignLeft,
  UserX, SwitchCamera, Bell, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function EditorialYachtClub() {
  return (
    <div className="editorial-yacht-club min-h-screen selection:bg-[#C5A059] selection:text-white">
      <Header />
      <main className="max-w-[1280px] mx-auto px-8 py-16 space-y-24">
        <Hero />
        <StatsStrip />
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-8 space-y-20">
            <LatestMatches />
            <AdminPreview />
          </div>
          <div className="lg:col-span-4">
            <Leaderboard />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-[#E0DCD0] bg-[#F8F7F2]/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-[1280px] mx-auto h-20 px-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#0A192F] flex items-center justify-center rounded-sm">
            <img src="/__mockup/images/oa-logo.png" alt="OCE Inhouse" className="h-6 w-6" />
          </div>
          <div className="font-serif text-2xl flex items-baseline gap-2 text-[#0A192F]">
            <span className="font-semibold tracking-wider">OCE</span>
            <span className="italic text-[#C5A059]">Inhouse</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-10 text-xs font-medium uppercase tracking-widest text-[#6B7280]">
          <a href="#" className="text-[#0A192F] transition-colors border-b-2 border-[#C5A059] py-2">Club</a>
          <a href="#" className="hover:text-[#0A192F] transition-colors py-2">Matches</a>
          <a href="#" className="hover:text-[#0A192F] transition-colors py-2">Standings</a>
          <a href="#" className="hover:text-[#0A192F] transition-colors py-2">Heroes</a>
          <div className="flex items-center gap-1 cursor-pointer hover:text-[#0A192F] transition-colors py-2">
            <span>Tools</span>
            <ChevronDown className="w-3 h-3" />
          </div>
        </nav>

        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-2 text-xs uppercase tracking-widest text-[#0A192F] font-semibold border-r border-[#E0DCD0] pr-6">
            <span>Season 10</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right flex flex-col">
              <span className="text-xs font-semibold text-[#0A192F] uppercase tracking-wider">u/cookie</span>
              <span className="font-serif italic text-[#C5A059] text-sm leading-none">7240 MMR</span>
            </div>
            <div className="w-10 h-10 rounded-full border border-[#E0DCD0] p-1 bg-white">
              <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie&backgroundColor=0A192F" alt="Avatar" className="w-full h-full rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="editorial-yacht-club-hero text-center max-w-4xl mx-auto space-y-8 pt-12">
      <div className="inline-flex items-center justify-center gap-3 text-xs uppercase tracking-[0.3em] font-semibold text-[#6B7280]">
        <div className="w-8 h-px bg-[#C5A059]" />
        <span>Season X is underway</span>
        <div className="w-8 h-px bg-[#C5A059]" />
      </div>
      
      <h1 className="font-serif text-6xl md:text-8xl text-[#0A192F] leading-[1.1] font-medium">
        Track every inhouse.<br />
        <span className="italic text-[#C5A059] font-light">Climb the OCE ladder.</span>
      </h1>
      
      <p className="text-lg text-[#6B7280] max-w-2xl mx-auto font-light leading-relaxed">
        The premier Dota 2 inhouse league for Australia and New Zealand. Compete with distinction, analyze with precision, and rise through the ranks.
      </p>
      
      <div className="pt-8 flex items-center justify-center gap-6">
        <Button className="bg-[#0A192F] text-white hover:bg-[#0A192F]/90 rounded-sm px-10 py-7 h-auto text-sm uppercase tracking-widest font-semibold">
          View Standings
        </Button>
        <Button variant="outline" className="border-[#0A192F] text-[#0A192F] hover:bg-[#0A192F]/5 rounded-sm px-10 py-7 h-auto text-sm uppercase tracking-widest font-semibold bg-transparent">
          Join the Club
        </Button>
      </div>
    </section>
  );
}

function StatsStrip() {
  const stats = [
    { label: "Matches Contested", value: "1,284", icon: Anchor },
    { label: "Active Members", value: "87", icon: Users },
    { label: "Hours Logged", value: "3,640", icon: Clock },
    { label: "Top Hero (Weekly)", value: "Pudge", icon: Wind },
  ];

  return (
    <div className="stat-ribbon py-12 px-8 flex justify-between items-center gap-8 text-center flex-wrap">
      {stats.map((stat, i) => (
        <div key={i} className="flex-1 min-w-[200px]">
          <div className="flex items-center justify-center mb-4 text-[#C5A059]">
            <stat.icon className="w-6 h-6 stroke-[1.5]" />
          </div>
          <div className="font-serif text-4xl text-[#0A192F] mb-2">{stat.value}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

function LatestMatches() {
  const matches = [
    { id: 1, radiant: true, score: "42-38", duration: "45:12", mvp: "cookie", time: "2 hours ago", won: true },
    { id: 2, radiant: false, score: "12-30", duration: "24:05", mvp: "spicy", time: "5 hours ago", won: false },
    { id: 3, radiant: true, score: "55-54", duration: "62:10", mvp: "chobo", time: "Yesterday", won: true },
    { id: 4, radiant: false, score: "22-18", duration: "30:45", mvp: "fuzion", time: "Yesterday", won: true },
    { id: 5, radiant: true, score: "15-40", duration: "28:20", mvp: "cookie", time: "2 days ago", won: false },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between border-b border-[#E0DCD0] pb-4">
        <h2 className="font-serif text-3xl text-[#0A192F] italic">Recent Fixtures</h2>
        <a href="#" className="text-xs text-[#C5A059] uppercase tracking-widest font-semibold hover:text-[#0A192F] transition-colors flex items-center gap-2">
          View Ledger <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      
      <div className="deckled-card p-6 bg-white">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="px-4 py-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">Result</th>
              <th className="px-4 py-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">Score</th>
              <th className="px-4 py-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">Duration</th>
              <th className="px-4 py-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">MVP</th>
              <th className="px-4 py-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280] text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id} className="hover:bg-[#F8F7F2] transition-colors">
                <td className="px-4 py-5">
                  <div className="flex items-center gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full ${match.won ? 'bg-[#C5A059]' : 'bg-[#8B0000]'}`} />
                    <span className="font-medium text-[#0A192F] uppercase text-xs tracking-wider">{match.radiant ? "Radiant" : "Dire"}</span>
                  </div>
                </td>
                <td className="px-4 py-5 font-serif text-xl text-[#0A192F]">{match.score}</td>
                <td className="px-4 py-5 text-sm text-[#6B7280]">{match.duration}</td>
                <td className="px-4 py-5 text-sm font-semibold text-[#C5A059] uppercase tracking-wider">{match.mvp}</td>
                <td className="px-4 py-5 text-sm text-[#6B7280] text-right italic font-serif">{match.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Leaderboard() {
  const players = [
    { rank: 1, name: "cookie", mmr: 7240, wl: "41W - 22L", tier: "Immortal" },
    { rank: 2, name: "spicy", mmr: 6980, wl: "38W - 19L", tier: "Immortal" },
    { rank: 3, name: "chobo", mmr: 6850, wl: "35W - 25L", tier: "Immortal" },
    { rank: 4, name: "fuzion", mmr: 6420, wl: "40W - 30L", tier: "Divine" },
    { rank: 5, name: "snute", mmr: 6100, wl: "28W - 20L", tier: "Divine" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between border-b border-[#E0DCD0] pb-4">
        <h2 className="font-serif text-3xl text-[#0A192F] italic">Top Standings</h2>
      </div>

      <div className="deckled-card p-6 bg-white space-y-6">
        {players.map((p, i) => (
          <div key={p.rank} className="flex items-center gap-4 group">
            <div className="w-8 text-center font-serif text-2xl italic text-[#C5A059] opacity-80 group-hover:opacity-100 transition-opacity">
              {p.rank}.
            </div>
            
            <div className="flex-1 border-b border-dashed border-[#E0DCD0] pb-2 flex justify-between items-end">
              <div>
                <div className="font-semibold text-[#0A192F] text-sm uppercase tracking-wider">{p.name}</div>
                <div className="text-[10px] text-[#6B7280] uppercase tracking-widest mt-1">{p.tier}</div>
              </div>
              
              <div className="text-right">
                <div className="font-serif text-xl text-[#0A192F]">{p.mmr}</div>
                <div className="text-[10px] text-[#6B7280] uppercase tracking-widest mt-1">{p.wl}</div>
              </div>
            </div>
          </div>
        ))}
        
        <div className="pt-4 text-center">
          <a href="#" className="text-xs text-[#0A192F] uppercase tracking-widest font-semibold hover:text-[#C5A059] transition-colors underline underline-offset-4 decoration-[#E0DCD0] hover:decoration-[#C5A059]">
            Full Leaderboard
          </a>
        </div>
      </div>
    </div>
  );
}

function AdminPreview() {
  return (
    <div className="space-y-8 pt-12">
      <div className="flex items-end justify-between border-b border-[#E0DCD0] pb-4">
        <div>
          <h2 className="font-serif text-3xl text-[#0A192F] italic">Administration</h2>
          <p className="text-xs uppercase tracking-widest text-[#6B7280] font-semibold mt-2">Executive Overview</p>
        </div>
      </div>

      <div className="deckled-card flex h-[650px] bg-white overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-[#E0DCD0] bg-[#F8F7F2]/50 flex flex-col">
          <div className="p-6 border-b border-[#E0DCD0]">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
              <input 
                type="text" 
                placeholder="Search records..." 
                className="w-full bg-white border border-[#E0DCD0] rounded-sm py-2 pl-9 pr-3 text-xs uppercase tracking-wider text-[#0A192F] focus:outline-none focus:border-[#C5A059] transition-colors"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto py-6 px-4">
            <SidebarSection title="Match Ledger">
              <SidebarItem icon={AlignLeft} label="Record Fixture" />
              <SidebarItem icon={ListVideo} label="Archives" />
              <SidebarItem icon={AlignLeft} label="Match Index" />
            </SidebarSection>
            
            <SidebarSection title="Registry">
              <SidebarItem icon={Users} label="Members" />
              <SidebarItem icon={AlignLeft} label="Aliases" />
              <SidebarItem icon={UserX} label="Sanctions" />
            </SidebarSection>

            <SidebarSection title="Governance">
              <SidebarItem icon={Settings} label="Preferences" />
              <SidebarItem icon={AlignLeft} label="Decrees" />
              <SidebarItem icon={Bell} label="Announcements" active />
            </SidebarSection>

            <SidebarSection title="System">
              <SidebarItem icon={SwitchCamera} label="Feature Toggles" />
              <SidebarItem icon={Activity} label="Diagnostics" />
            </SidebarSection>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white p-10 overflow-y-auto">
          <div className="max-w-2xl mx-auto">
            <div className="mb-10 pb-6 border-b border-[#E0DCD0]">
              <h3 className="font-serif text-4xl text-[#0A192F] mb-3">Announcements</h3>
              <p className="text-[#6B7280] text-sm">Configure the bulletin presented to members upon entry.</p>
            </div>

            <div className="space-y-10">
              <div className="flex items-center justify-between p-6 bg-[#F8F7F2] border border-[#E0DCD0]">
                <div>
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-[#0A192F] mb-1">Enable Bulletin</h4>
                  <p className="text-xs text-[#6B7280]">Display this notice to all active members.</p>
                </div>
                <Switch defaultChecked />
              </div>
              
              <div className="grid gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">Eyebrow Marker</label>
                  <input 
                    type="text"
                    defaultValue="Official Decree" 
                    className="w-full bg-white border border-[#E0DCD0] rounded-sm p-3 text-sm focus:outline-none focus:border-[#C5A059] transition-colors" 
                  />
                </div>
                
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">Headline</label>
                  <input 
                    type="text"
                    defaultValue="Season X Inauguration" 
                    className="w-full bg-white border border-[#E0DCD0] rounded-sm p-3 text-sm focus:outline-none focus:border-[#C5A059] transition-colors font-serif text-xl" 
                  />
                </div>
                
                <div className="space-y-3">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">Body Copy</label>
                  <textarea 
                    className="w-full min-h-[120px] bg-white border border-[#E0DCD0] rounded-sm p-4 text-sm focus:outline-none focus:border-[#C5A059] transition-colors leading-relaxed"
                    defaultValue="The standings have been formally reset. New matchmaking directives are now in effect. We expect the highest standard of sportsmanship from all members. Review the full decrees before queuing."
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">Action Button</label>
                    <input 
                      type="text"
                      defaultValue="Review Decrees" 
                      className="w-full bg-white border border-[#E0DCD0] rounded-sm p-3 text-sm focus:outline-none focus:border-[#C5A059] transition-colors" 
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#6B7280]">Edition</label>
                    <input 
                      type="text"
                      defaultValue="v5.60" 
                      className="w-full bg-white border border-[#E0DCD0] rounded-sm p-3 text-sm focus:outline-none focus:border-[#C5A059] transition-colors" 
                    />
                  </div>
                </div>
              </div>
              
              <div className="pt-6 border-t border-[#E0DCD0] flex justify-end">
                <Button className="bg-[#0A192F] text-white hover:bg-[#0A192F]/90 rounded-sm px-8 py-6 h-auto text-xs uppercase tracking-widest font-semibold">
                  Publish Changes
                </Button>
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
    <div className="mb-8">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#C5A059] mb-4 px-3">
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
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-xs font-semibold uppercase tracking-wider cursor-pointer transition-colors ${
      active 
        ? "bg-[#0A192F] text-white" 
        : "text-[#6B7280] hover:bg-[#E0DCD0]/50 hover:text-[#0A192F]"
    }`}>
      <Icon className={`w-4 h-4 ${active ? "text-[#C5A059]" : ""}`} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#E0DCD0] bg-white py-12 text-xs uppercase tracking-widest font-semibold text-[#6B7280]">
      <div className="max-w-[1280px] mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-5 h-5 opacity-30 grayscale" />
          <span>© {new Date().getFullYear()} OCE Inhouse</span>
        </div>
        <div className="flex items-center gap-8">
          <a href="#" className="hover:text-[#0A192F] transition-colors">Discord</a>
          <a href="#" className="hover:text-[#0A192F] transition-colors">GitHub</a>
          <span className="text-[#E0DCD0]">|</span>
          <span>v5.59 — <a href="#" className="text-[#C5A059] hover:text-[#0A192F] transition-colors">Decrees</a></span>
        </div>
      </div>
    </footer>
  );
}
