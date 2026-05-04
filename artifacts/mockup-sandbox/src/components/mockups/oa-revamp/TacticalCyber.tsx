import React from "react";
import "./_tacticalcyber.css";
import { 
  Terminal, Server, Activity, Users, Clock, ShieldAlert, Cpu, 
  Wifi, HardDrive, Binary, PlaySquare, FileTerminal, Hash,
  RadioReceiver, Lock, Power, CornerDownRight, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function TacticalCyber() {
  return (
    <div className="tactical-cyber min-h-screen relative overflow-hidden bg-[#020202] text-[#39FF14] scanlines vignette crt selection:bg-[#39FF14] selection:text-black">
      
      {/* Top Bar / Status Line */}
      <header className="border-b border-[#39FF14] bg-[#020202] sticky top-0 z-40">
        <div className="max-w-[1280px] mx-auto px-4 h-12 flex items-center justify-between text-xs font-bold uppercase tracking-widest">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 terminal-border px-2 py-1 bg-[#39FF14] text-black">
              <img src="/__mockup/images/oa-logo.png" alt="OCE Inhouse" className="h-5 w-5 invert" />
              <span>SYS.OCE.INHOUSE</span>
            </div>
            
            <nav className="hidden md:flex items-center gap-6 opacity-80">
              <a href="#" className="hover:opacity-100 hover:bg-[#39FF14] hover:text-black px-2 py-0.5 transition-colors glitch-hover">[01] HOME</a>
              <a href="#" className="hover:opacity-100 hover:bg-[#39FF14] hover:text-black px-2 py-0.5 transition-colors">[02] MATCHES</a>
              <a href="#" className="hover:opacity-100 hover:bg-[#39FF14] hover:text-black px-2 py-0.5 transition-colors">[03] LADDER</a>
              <a href="#" className="hover:opacity-100 hover:bg-[#39FF14] hover:text-black px-2 py-0.5 transition-colors">[04] TOOLS</a>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 border border-[#39FF14] px-2 py-0.5">
              <span className="opacity-70">SESSION:</span>
              <span className="blink">S10_ACTIVE</span>
            </div>
            
            <div className="flex items-center gap-2 border border-[#39FF14] px-2 py-0.5 hover:bg-[#39FF14] hover:text-black cursor-pointer transition-colors">
              <Terminal className="w-3 h-3" />
              <span>USR:COOKIE_7240</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 py-6 flex flex-col gap-6 relative z-10">
        
        {/* Main Terminal Window */}
        <section className="terminal-border bg-black p-1">
          <div className="terminal-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              <span>root@oce-mainframe:~# ./start_season.sh</span>
            </div>
            <div className="flex gap-2">
              <div className="w-3 h-3 bg-black"></div>
              <div className="w-3 h-3 bg-black"></div>
              <div className="w-3 h-3 bg-black"></div>
            </div>
          </div>
          
          <div className="p-8 pb-12 relative overflow-hidden">
            <div className="absolute top-4 right-4 opacity-20">
              <pre className="font-display text-xs leading-none">
{`   _____ 
  /     \\ 
 | () () | 
  \\  ^  / 
   |||||   `}
              </pre>
            </div>
            
            <div className="mb-4">
              <span className="text-[#1c7a0a]">Sys_Init:: OK... Loading modules... DONE.</span>
              <br />
              <span className="text-[#39FF14] font-bold">Connection established. Secure link to OCE database.</span>
            </div>
            
            <h1 className="font-display text-5xl md:text-7xl font-bold uppercase tracking-tight mb-4">
              &gt; TRACK EVERY INHOUSE<span className="blink">_</span>
              <br />
              <span className="opacity-80">&gt; CLIMB THE LADDER</span>
            </h1>
            
            <p className="text-[#1c7a0a] text-lg mb-8 max-w-xl font-bold uppercase tracking-wider">
              // WARNING: PREMIER DOTA 2 ENVIRONMENT DETECTED.<br/>
              // PROCEED WITH CAUTION.
            </p>
            
            <div className="flex items-center gap-6">
              <Button className="bg-[#39FF14] hover:bg-[#39FF14]/80 text-black font-bold uppercase tracking-widest px-8 h-12 rounded-none border border-[#39FF14]">
                [ EXECUTE: JOIN ]
              </Button>
              <Button variant="outline" className="border-[#39FF14] text-[#39FF14] hover:bg-[#39FF14] hover:text-black uppercase tracking-widest px-8 h-12 rounded-none">
                [ VIEW LADDER ]
              </Button>
            </div>
          </div>
        </section>

        {/* Status Strip */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "MATCH_LOGS", value: "001284", icon: HardDrive },
            { label: "ACTIVE_NODES", value: "000087", icon: Activity },
            { label: "UPTIME_HRS", value: "003640", icon: Clock },
            { label: "PRIME_ASSET", value: "PUDGE [64%]", icon: Cpu }
          ].map((stat, i) => (
            <div key={i} className="terminal-border p-4 bg-black flex flex-col gap-2 relative overflow-hidden group hover:bg-[#39FF14] hover:text-black transition-colors cursor-default">
              <div className="flex items-center justify-between opacity-50 group-hover:opacity-100">
                <span className="text-[10px] uppercase font-bold tracking-widest">{stat.label}</span>
                <stat.icon className="w-4 h-4" />
              </div>
              <div className="font-display text-3xl font-bold tracking-wider">{stat.value}</div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Match Feed */}
          <section className="lg:col-span-2 flex flex-col gap-0 terminal-border bg-black">
            <div className="terminal-header flex items-center justify-between">
              <span>SYS.LOGS.MATCHES // RECENT</span>
              <span className="text-[10px] bg-black text-[#39FF14] px-2 hover:bg-white hover:text-black cursor-pointer">QUERY_ALL</span>
            </div>
            
            <div className="p-4 flex flex-col gap-2 font-display text-lg">
              <div className="flex items-center justify-between text-[#1c7a0a] border-b border-[#1c7a0a] pb-2 mb-2 uppercase text-sm">
                <span className="w-24">FACTION</span>
                <span className="flex-1">RESULT</span>
                <span className="w-24 text-center">DUR</span>
                <span className="w-32 text-center">PRIME</span>
                <span className="w-24 text-right">TS</span>
              </div>
              
              {[
                { side: "RADIANT", score: "42:38", duration: "45.12", mvp: "COOKIE", time: "-2H", won: true },
                { side: "DIRE", score: "21:45", duration: "32.04", mvp: "SKITZ", time: "-4H", won: false },
                { side: "RADIANT", score: "55:50", duration: "61.20", mvp: "PHANTOM", time: "-5H", won: true },
                { side: "RADIANT", score: "30:15", duration: "25.40", mvp: "NINJA", time: "-8H", won: true },
                { side: "DIRE", score: "39:41", duration: "48.15", mvp: "VORTEX", time: "-12H", won: false },
              ].map((match, i) => (
                <div key={i} className="flex items-center justify-between hover:bg-[#39FF14] hover:text-black px-2 py-1 cursor-pointer">
                  <span className={`w-24 font-bold ${match.won ? '' : 'text-[#ff003c]'} hover:text-black`}>[{match.side}]</span>
                  <span className="flex-1">{match.score}</span>
                  <span className="w-24 text-center">{match.duration}</span>
                  <span className="w-32 text-center">@{match.mvp}</span>
                  <span className="w-24 text-right opacity-70">{match.time}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Leaderboard */}
          <section className="flex flex-col gap-0 terminal-border bg-black">
            <div className="terminal-header">
              <span>SYS.USERS.TOP_NODES</span>
            </div>
            
            <div className="p-4 flex flex-col gap-0 font-display text-lg">
              <div className="flex items-center justify-between text-[#1c7a0a] border-b border-[#1c7a0a] pb-2 mb-2 uppercase text-sm">
                <span className="w-8">ID</span>
                <span className="flex-1">USER</span>
                <span className="w-16 text-right">PWR</span>
                <span className="w-16 text-right">W/L</span>
              </div>
              
              {[
                { rank: "01", name: "COOKIE", mmr: 7240, wl: "41/22" },
                { rank: "02", name: "SKITZ", mmr: 6980, wl: "38/20" },
                { rank: "03", name: "PHANTOM", mmr: 6540, wl: "35/25" },
                { rank: "04", name: "NINJA", mmr: 6120, wl: "30/18" },
                { rank: "05", name: "VORTEX", mmr: 5890, wl: "28/22" },
              ].map((player, i) => (
                <div key={i} className="flex items-center justify-between hover:bg-[#39FF14] hover:text-black px-2 py-1 border-b border-[#39FF14]/20 last:border-0 cursor-pointer">
                  <span className="w-8 opacity-70">{player.rank}</span>
                  <span className="flex-1 font-bold">{player.name}</span>
                  <span className="w-16 text-right">{player.mmr}</span>
                  <span className="w-16 text-right opacity-70">{player.wl}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Admin Interface */}
        <section className="mt-8 terminal-border bg-black flex flex-col">
          <div className="terminal-header flex items-center gap-2">
            <Lock className="w-3 h-3" />
            <span>ROOT_ACCESS // SYS.ADMIN_CFG</span>
          </div>
          
          <div className="flex h-[450px]">
            {/* Sidebar */}
            <div className="w-56 border-r border-[#39FF14] p-4 flex flex-col gap-6 overflow-y-auto bg-[#050505]">
              
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#1c7a0a] tracking-widest mb-1">DIR /DATA</span>
                <button className="text-left text-sm hover:bg-[#39FF14] hover:text-black px-2 py-1 flex items-center gap-2">
                  <Binary className="w-3 h-3" /> ./record_match
                </button>
                <button className="text-left text-sm hover:bg-[#39FF14] hover:text-black px-2 py-1 flex items-center gap-2">
                  <PlaySquare className="w-3 h-3" /> ./replays
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#1c7a0a] tracking-widest mb-1">DIR /USR</span>
                <button className="text-left text-sm hover:bg-[#39FF14] hover:text-black px-2 py-1 flex items-center gap-2">
                  <Users className="w-3 h-3" /> ./roster
                </button>
                <button className="text-left text-sm hover:bg-[#ff003c] hover:text-black text-[#ff003c] px-2 py-1 flex items-center gap-2">
                  <ShieldAlert className="w-3 h-3" /> ./ban_list
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#1c7a0a] tracking-widest mb-1">DIR /CFG</span>
                <button className="text-left text-sm hover:bg-[#39FF14] hover:text-black px-2 py-1 flex items-center gap-2">
                  <Settings className="w-3 h-3" /> ./settings
                </button>
                <button className="text-left text-sm bg-[#39FF14] text-black font-bold px-2 py-1 flex items-center gap-2">
                  <FileTerminal className="w-3 h-3" /> ./motd_config
                </button>
              </div>
            </div>

            {/* Main Form */}
            <div className="flex-1 p-6 flex gap-8">
              <div className="flex-1 flex flex-col gap-6">
                <h3 className="font-display text-2xl font-bold uppercase tracking-tight flex items-center gap-2 border-b border-[#39FF14] pb-2">
                  <CornerDownRight className="w-5 h-5" /> MOD_MESSAGE_OF_THE_DAY
                </h3>
                
                <div className="flex flex-col gap-4 font-display text-lg">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs uppercase tracking-widest text-[#1c7a0a] font-bold">PARAM: EYEBROW</label>
                    <input type="text" defaultValue="UPDATE 5.59" className="bg-transparent border border-[#39FF14] px-3 py-2 text-[#39FF14] focus:outline-none focus:bg-[#39FF14]/10 transition-colors" />
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-xs uppercase tracking-widest text-[#1c7a0a] font-bold">PARAM: TITLE</label>
                    <input type="text" defaultValue="SEASON 10 INITIALIZED" className="bg-transparent border border-[#39FF14] px-3 py-2 text-[#39FF14] focus:outline-none focus:bg-[#39FF14]/10 transition-colors" />
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-xs uppercase tracking-widest text-[#1c7a0a] font-bold">PARAM: BODY</label>
                    <textarea rows={4} defaultValue="MMR HAS BEEN SOFT RESET. DRAFT PROTOCOL: CAPTAINS_MODE. PREPARE FOR COMBAT." className="bg-transparent border border-[#39FF14] px-3 py-2 text-[#39FF14] focus:outline-none focus:bg-[#39FF14]/10 transition-colors resize-none" />
                  </div>
                  
                  <div className="flex items-center gap-6 mt-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-6 border border-[#39FF14] p-1 flex">
                        <div className="w-4 h-full bg-[#39FF14] translate-x-5"></div>
                      </div>
                      <span className="text-sm uppercase tracking-widest font-bold">STATUS: ENABLED</span>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs uppercase tracking-widest text-[#1c7a0a]">PARAM: VER</span>
                      <input type="text" defaultValue="V2.1" className="bg-transparent border border-[#39FF14] w-16 px-2 py-1 text-center text-sm" />
                    </div>
                  </div>
                  
                  <Button className="mt-4 bg-[#39FF14] hover:bg-[#39FF14]/80 text-black rounded-none border border-[#39FF14] uppercase font-bold tracking-widest h-10 font-sans">
                    [ OVERWRITE CFG ]
                  </Button>
                </div>
              </div>

              {/* Preview */}
              <div className="w-[300px] flex flex-col gap-2">
                <span className="text-xs uppercase font-bold text-[#1c7a0a] tracking-widest border-b border-[#1c7a0a] pb-1">OUTPUT_PREVIEW</span>
                <div className="border border-[#39FF14] bg-[#020202] p-4 shadow-[0_0_15px_rgba(57,255,20,0.15)] mt-2">
                  <div className="flex justify-between items-start mb-4 border-b border-[#39FF14] pb-2">
                    <span className="text-[#39FF14] font-bold text-xs uppercase tracking-widest">UPDATE 5.59</span>
                    <Hash className="w-4 h-4" />
                  </div>
                  <h4 className="font-display text-2xl font-bold uppercase tracking-tight mb-2">SEASON 10 INITIALIZED</h4>
                  <p className="text-sm leading-relaxed mb-6 font-display opacity-80 uppercase">
                    MMR HAS BEEN SOFT RESET. DRAFT PROTOCOL: CAPTAINS_MODE. PREPARE FOR COMBAT.
                  </p>
                  <Button className="w-full bg-transparent hover:bg-[#39FF14] hover:text-black text-[#39FF14] rounded-none border border-[#39FF14] uppercase text-xs tracking-widest font-bold font-sans">
                    [ ACKNOWLEDGE ]
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-[#39FF14] bg-[#020202] mt-12 relative z-20">
        <div className="max-w-[1280px] mx-auto px-4 h-12 flex items-center justify-between text-xs font-bold uppercase tracking-widest opacity-60">
          <div>
            EOF // OCE_INHOUSE &copy; {new Date().getFullYear()}
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:opacity-100 hover:text-[#39FF14] transition-colors">COMM_LINK: DISCORD</a>
            <a href="#" className="hover:opacity-100 hover:text-[#39FF14] transition-colors">SRC: GITHUB</a>
            <span className="text-[#1c7a0a]">|</span>
            <span className="flex items-center gap-2"><Power className="w-3 h-3" /> SYS.V5.59</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
