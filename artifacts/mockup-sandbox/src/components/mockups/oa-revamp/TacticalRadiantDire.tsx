import React from "react";
import "./_tacticalradiantdire.css";
import { 
  Crosshair, Shield, Swords, Activity, Users, Clock, Trophy, 
  Terminal, MonitorPlay, History, ShieldAlert, Settings, Webhook,
  Bell, ListFilter, SlidersHorizontal, ChevronRight, Zap, Target
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function TacticalRadiantDire() {
  return (
    <div className="tactical-radiant-dire min-h-screen bg-[#06070a] relative overflow-hidden flex flex-col">
      <div className="noise-overlay" />
      <div className="scanlines absolute inset-0 pointer-events-none opacity-20 z-0" />
      
      <Header />
      
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-10 relative z-10 flex flex-col gap-16">
        <Hero />
        <StatsStrip />
        
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
          <div className="xl:col-span-2 space-y-12">
            <LatestMatches />
            <AdminPreview />
          </div>
          <div className="space-y-12">
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
    <header className="h-20 border-b border-white/10 bg-[#06070a]/90 backdrop-blur-md sticky top-0 z-50 flex items-center">
      <div className="max-w-[1280px] w-full mx-auto px-6 flex items-center justify-between">
        
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative hex-clip bg-white p-2">
              <img src="/__mockup/images/oa-logo.png" alt="OA" className="w-8 h-8 object-contain" />
            </div>
            <div className="flex flex-col justify-center font-display leading-none">
              <span className="text-3xl font-bold tracking-wider text-white">OCE</span>
              <span className="text-xl font-bold tracking-[0.2em] text-white/50 -mt-1">INHOUSE</span>
            </div>
          </div>
          
          {/* Nav */}
          <nav className="hidden md:flex items-center gap-1 font-display text-xl tracking-wide text-white/60">
            {['HOME', 'MATCHES', 'LEADERBOARD', 'HEROES', 'TOOLS'].map((item, i) => (
              <a key={i} href="#" className="px-4 py-2 hover:text-white hover:bg-white/5 transition-colors uppercase">
                {item}
              </a>
            ))}
          </nav>
        </div>

        {/* Right Nav */}
        <div className="flex items-center gap-6">
          <div className="font-display text-xl tracking-wider text-[#10b981] glow-radiant border border-[#10b981]/30 px-4 py-1 hex-clip-sm bg-[#10b981]/10">
            SEASON 10
          </div>
          
          <div className="flex items-center gap-4 pl-6 border-l border-white/10">
            <div className="text-right font-display leading-none">
              <div className="text-xl text-white tracking-wide">U/COOKIE</div>
              <div className="text-lg text-[#10b981]">7240 MMR</div>
            </div>
            <img src="https://api.dicebear.com/9.x/identicon/svg?seed=cookie" alt="Avatar" className="w-12 h-12 hex-clip bg-white/10 p-1" />
          </div>
        </div>

      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative w-full h-[500px] split-gradient tech-border flex items-center overflow-hidden">
      {/* VS Spine */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 -translate-x-1/2">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-4xl text-white/20 tracking-widest bg-[#06070a] px-4 py-8">
          V S
        </div>
      </div>
      
      <div className="w-full flex items-center justify-between px-20 relative z-10">
        <div className="max-w-xl space-y-6">
          <div className="flex items-center gap-3 font-mono text-sm font-bold tracking-widest text-[#10b981]">
            <span className="w-3 h-3 bg-[#10b981] box-glow-radiant" />
            <span className="glow-radiant">SYS.ONLINE // S10_ACTIVE</span>
          </div>
          
          <h1 className="font-display text-7xl lg:text-[7rem] font-bold leading-[0.85] tracking-tight uppercase text-white">
            TRACK EVERY INHOUSE.<br/>
            CLIMB THE <span className="text-[#10b981] glow-radiant">LADDER</span>.
          </h1>
          
          <p className="font-mono text-white/50 text-base max-w-lg leading-relaxed">
            THE PREMIER DOTA 2 GLADIATORIAL ARENA FOR OCEANIA. NO MERCY. ONLY MMR.
          </p>
          
          <div className="pt-4 flex items-center gap-4">
            <Button className="font-display text-2xl h-14 px-8 tracking-widest bg-white text-black hover:bg-white/90 rounded-none diag-r">
              JOIN LOBBY <ChevronRight className="w-6 h-6 ml-2" />
            </Button>
            <Button variant="outline" className="font-display text-2xl h-14 px-8 tracking-widest text-white border-white/20 hover:bg-white/10 rounded-none diag-l bg-transparent">
              LEADERBOARD
            </Button>
          </div>
        </div>
        
        {/* Abstract Faction Graphics */}
        <div className="hidden lg:flex items-center gap-16 pointer-events-none opacity-30">
          <Shield className="w-64 h-64 text-[#10b981]" strokeWidth={1} />
          <Target className="w-64 h-64 text-[#f43f5e]" strokeWidth={1} />
        </div>
      </div>
    </section>
  );
}

function StatsStrip() {
  const stats = [
    { label: "Matches", val: "1,284", sub: "TOTAL LOGGED", col: "text-white" },
    { label: "Active", val: "87", sub: "GLADIATORS", col: "text-white" },
    { label: "Top Hero", val: "PUDGE", sub: "64% WINRATE", col: "text-[#10b981]" },
    { label: "Most Banned", val: "TINKER", sub: "82% BANRATE", col: "text-[#f43f5e]" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {stats.map((s, i) => (
        <div key={i} className="bg-white/5 p-6 tech-border hover:bg-white/10 transition-colors cursor-default">
          <div className="font-mono text-sm text-white/40 tracking-widest uppercase mb-4">{s.label}</div>
          <div className={`font-display text-6xl font-bold leading-none tracking-tight mb-2 ${s.col}`}>
            {s.val}
          </div>
          <div className="font-mono text-xs text-white/30 tracking-widest">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

function LatestMatches() {
  const matches = [
    { id: 'M-4892', side: 'RADIANT', score: '42 - 38', duration: '45:12', mvp: 'COOKIE', time: '2H AGO', res: 'WIN' },
    { id: 'M-4891', side: 'DIRE', score: '21 - 45', duration: '32:04', mvp: 'SKITZ', time: '4H AGO', res: 'LOSS' },
    { id: 'M-4890', side: 'RADIANT', score: '55 - 50', duration: '61:20', mvp: 'PHANTOM', time: '5H AGO', res: 'WIN' },
    { id: 'M-4889', side: 'RADIANT', score: '30 - 15', duration: '25:40', mvp: 'NINJA', time: '8H AGO', res: 'WIN' },
    { id: 'M-4888', side: 'DIRE', score: '39 - 41', duration: '48:15', mvp: 'VORTEX', time: '12H AGO', res: 'LOSS' },
  ];

  return (
    <section>
      <div className="flex items-end justify-between mb-6 border-b border-white/10 pb-4">
        <h2 className="font-display text-4xl font-bold tracking-wide uppercase flex items-center gap-3">
          <Activity className="w-8 h-8 text-[#10b981]" /> COMBAT LOG
        </h2>
        <Button variant="ghost" className="font-display text-xl tracking-wider text-white/50 hover:text-white uppercase p-0 h-auto">
          VIEW ARCHIVE
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {matches.map((m) => (
          <div key={m.id} className="group relative flex items-center tech-border bg-white/5 hover:bg-white/10 transition-colors p-4 cursor-pointer">
            <div className={`absolute left-0 top-0 bottom-0 w-2 ${m.side === 'RADIANT' ? 'bg-[#10b981]' : 'bg-[#f43f5e]'}`} />
            
            <div className="flex-1 pl-6 flex items-center justify-between">
              {/* Left col */}
              <div className="flex items-center gap-6 w-1/3">
                <div className="font-mono text-sm text-white/50 tracking-wider w-20">{m.id}</div>
                <div className={`font-display text-2xl tracking-widest font-bold ${m.side === 'RADIANT' ? 'text-[#10b981] glow-radiant' : 'text-[#f43f5e] glow-dire'}`}>
                  {m.side}
                </div>
              </div>
              
              {/* Score & Duration */}
              <div className="w-1/3 flex items-center justify-center gap-8">
                <div className="font-display text-4xl font-bold tracking-wider">{m.score}</div>
                <div className="font-mono text-sm text-white/50">{m.duration}</div>
              </div>

              {/* MVP & Time */}
              <div className="w-1/3 flex items-center justify-end gap-8">
                <div className="flex flex-col text-right">
                  <span className="font-mono text-xs text-white/30 tracking-widest uppercase">MVP</span>
                  <span className="font-display text-2xl font-bold tracking-wide text-white">{m.mvp}</span>
                </div>
                <div className="font-mono text-sm text-white/40 w-20 text-right">{m.time}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Leaderboard() {
  const players = [
    { rank: 1, name: "COOKIE", mmr: 7240, wl: "41W 22L", tier: "IMMORTAL" },
    { rank: 2, name: "SKITZ", mmr: 6980, wl: "38W 20L", tier: "IMMORTAL" },
    { rank: 3, name: "PHANTOM", mmr: 6540, wl: "35W 25L", tier: "DIVINE" },
    { rank: 4, name: "NINJA", mmr: 6120, wl: "30W 18L", tier: "DIVINE" },
    { rank: 5, name: "VORTEX", mmr: 5890, wl: "28W 22L", tier: "ANCIENT" },
    { rank: 6, name: "CHOBIE", mmr: 5700, wl: "25W 20L", tier: "ANCIENT" },
    { rank: 7, name: "RAZOR", mmr: 5650, wl: "22W 15L", tier: "ANCIENT" },
  ];

  return (
    <section>
      <div className="flex items-end justify-between mb-6 border-b border-white/10 pb-4">
        <h2 className="font-display text-4xl font-bold tracking-wide uppercase flex items-center gap-3">
          <Trophy className="w-8 h-8 text-white" /> LEADERBOARD
        </h2>
      </div>

      <div className="tech-border bg-white/5 p-1">
        <div className="flex items-center px-4 py-3 border-b border-white/10 font-mono text-xs text-white/40 tracking-widest uppercase">
          <div className="w-12 text-center">RK</div>
          <div className="flex-1">GLADIATOR</div>
          <div className="w-20 text-right">RATING</div>
        </div>

        <div className="flex flex-col">
          {players.map((p) => (
            <div key={p.rank} className="flex items-center px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer">
              <div className={`w-12 text-center font-display text-3xl font-bold ${p.rank <= 3 ? 'text-[#10b981]' : 'text-white/40'}`}>
                {p.rank}
              </div>
              <div className="flex-1 flex flex-col justify-center pl-2">
                <span className="font-display text-2xl font-bold tracking-wide leading-none">{p.name}</span>
                <span className="font-mono text-[10px] text-white/40 tracking-widest">{p.tier}</span>
              </div>
              <div className="w-24 text-right flex flex-col justify-center">
                <span className="font-display text-3xl font-bold tracking-wide text-white leading-none">{p.mmr}</span>
                <span className="font-mono text-[10px] text-[#10b981] tracking-widest">{p.wl}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminPreview() {
  return (
    <section className="mt-8 border border-[#10b981]/50 bg-[#06070a] shadow-[0_0_50px_rgba(16,185,129,0.05)] relative z-20 diag-tl">
      <div className="bg-[#10b981]/10 border-b border-[#10b981]/30 p-4 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-[#10b981]" />
          <h2 className="font-display text-3xl font-bold tracking-widest uppercase text-[#10b981] glow-radiant leading-none pt-1">
            COMMAND CENTER // ADMIN
          </h2>
        </div>
        <div className="font-mono text-xs text-[#10b981]/70 tracking-widest border border-[#10b981]/30 px-3 py-1 bg-[#10b981]/10">
          SECURE CONNECTION
        </div>
      </div>

      <div className="flex h-[600px]">
        {/* Sidebar */}
        <div className="w-72 border-r border-[#10b981]/20 bg-black/40 flex flex-col p-6 overflow-y-auto">
          <AdminSidebarSection title="OPERATIONS">
            <AdminSidebarItem icon={MonitorPlay} label="MATCH CONTROL" />
            <AdminSidebarItem icon={History} label="REPLAY DB" />
            <AdminSidebarItem icon={ListFilter} label="ARCHIVES" />
          </AdminSidebarSection>

          <AdminSidebarSection title="PERSONNEL">
            <AdminSidebarItem icon={Users} label="ROSTER" />
            <AdminSidebarItem icon={ShieldAlert} label="BANS/PENALTIES" />
          </AdminSidebarSection>

          <AdminSidebarSection title="SYSTEM">
            <AdminSidebarItem icon={Settings} label="CONFIG" />
            <AdminSidebarItem icon={Webhook} label="WELCOME MODAL" active />
            <AdminSidebarItem icon={SlidersHorizontal} label="FEATURE FLAGS" />
            <AdminSidebarItem icon={Bell} label="BROADCASTS" />
          </AdminSidebarSection>
        </div>

        {/* Content */}
        <div className="flex-1 bg-[#06070a] p-10 flex gap-10">
          <div className="flex-1 max-w-xl space-y-8">
            <div>
              <h3 className="font-display text-4xl font-bold tracking-wide uppercase mb-2">WELCOME MODAL CFG</h3>
              <p className="font-mono text-sm text-white/50 tracking-wide uppercase">Broadcast message to all connecting users.</p>
            </div>

            <div className="space-y-6 bg-white/5 border border-white/10 p-6 relative">
              <div className="absolute top-0 right-0 p-2 font-mono text-[10px] text-white/20 tracking-widest">ID: MODAL_CFG_01</div>
              
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                <div>
                  <div className="font-display text-2xl font-bold tracking-wide">SYSTEM OVERRIDE</div>
                  <div className="font-mono text-xs text-[#10b981]">STATUS: ENABLED</div>
                </div>
                <div className="w-14 h-7 bg-[#10b981]/20 border border-[#10b981] p-1 cursor-pointer relative">
                  <div className="absolute right-1 top-1 bottom-1 w-5 bg-[#10b981] box-glow-radiant" />
                </div>
              </div>

              <div className="space-y-4">
                <AdminInput label="CLASSIFICATION (EYEBROW)" defaultValue="PATCH NOTES 5.59" />
                <AdminInput label="HEADLINE" defaultValue="SEASON 10 DIRECTIVE" />
                <div className="space-y-2">
                  <label className="font-mono text-xs text-white/50 tracking-widest uppercase">BODY TRANSMISSION</label>
                  <textarea 
                    className="w-full h-24 bg-black border border-white/20 p-3 font-mono text-sm text-white focus:border-[#10b981] focus:outline-none transition-colors resize-none"
                    defaultValue="MMR algorithms recalibrated. Captain's mode enforced for all high-tier engagements. Glory to the victors."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <AdminInput label="ACTION LABEL" defaultValue="ACKNOWLEDGE" />
                  <AdminInput label="VERSION TAG" defaultValue="v5.60" />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button className="font-display text-2xl h-12 px-8 tracking-widest bg-[#10b981] text-black hover:bg-[#10b981]/80 rounded-none diag-r">
                  COMMIT CHANGES
                </Button>
              </div>
            </div>
          </div>

          <div className="w-80">
            <h3 className="font-mono text-xs text-white/50 tracking-widest uppercase mb-4">LIVE PREVIEW TERMINAL</h3>
            <div className="tech-border p-6 bg-[#06070a] shadow-2xl relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#10b981] box-glow-radiant" />
              <div className="font-mono text-[10px] text-[#10b981] tracking-widest mb-4">PATCH NOTES 5.59</div>
              <h4 className="font-display text-4xl font-bold tracking-tight uppercase leading-none mb-4">SEASON 10 DIRECTIVE</h4>
              <p className="font-mono text-sm text-white/70 leading-relaxed mb-8">
                MMR algorithms recalibrated. Captain's mode enforced for all high-tier engagements. Glory to the victors.
              </p>
              <Button className="w-full font-display text-2xl h-12 tracking-widest bg-white text-black hover:bg-white/90 rounded-none diag-r">
                ACKNOWLEDGE
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminSidebarSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="font-mono text-[10px] font-bold text-white/30 tracking-widest uppercase mb-3 pl-3">
        {title}
      </div>
      <div className="space-y-1">
        {children}
      </div>
    </div>
  );
}

function AdminSidebarItem({ icon: Icon, label, active }: { icon: any, label: string, active?: boolean }) {
  return (
    <div className={`flex items-center gap-4 px-3 py-2 cursor-pointer transition-colors ${
      active 
      ? "bg-[#10b981]/10 text-[#10b981] border-l-2 border-[#10b981]" 
      : "text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
    }`}>
      <Icon className="w-5 h-5" />
      <span className="font-display text-xl tracking-wider uppercase leading-none pt-1">{label}</span>
    </div>
  );
}

function AdminInput({ label, defaultValue }: { label: string, defaultValue: string }) {
  return (
    <div className="space-y-2">
      <label className="font-mono text-xs text-white/50 tracking-widest uppercase">{label}</label>
      <input 
        type="text" 
        className="w-full bg-black border border-white/20 px-3 py-2 font-mono text-sm text-white focus:border-[#10b981] focus:outline-none transition-colors"
        defaultValue={defaultValue}
      />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#06070a] mt-auto">
      <div className="max-w-[1280px] mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs text-white/40 tracking-widest uppercase">
        <div>
          SYS.LOG: © {new Date().getFullYear()} OCE INHOUSE. ALL PROTOCOLS ACTIVE.
        </div>
        <div className="flex items-center gap-8">
          <a href="#" className="hover:text-[#10b981] transition-colors">DISCORD_UPLINK</a>
          <a href="#" className="hover:text-[#10b981] transition-colors">GITHUB_REPO</a>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10b981] box-glow-radiant" />
            <span className="text-[#10b981]">v5.59 ONLINE</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
