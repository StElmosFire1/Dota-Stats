import React, { useState, useEffect } from "react";
import { Clock, Shield, Target, Users, Check, X, AlertCircle, Crosshair, ChevronRight, ShieldHalf, Zap, Crown } from "lucide-react";
import "./_group.css";
import { PressBoxNav } from "./_shared/PressBoxNav";

// Mocks

const UNASSIGNED_PLAYERS = [
  { id: 1, name: "Kez", mmr: 8150, pos: "Mid", accepted: true },
  { id: 2, name: "Snoopy", mmr: 7800, pos: "Carry", accepted: true },
  { id: 3, name: "Viper", mmr: 7650, pos: "Offlane", accepted: true },
  { id: 4, name: "Godot", mmr: 7420, pos: "Support", accepted: true },
  { id: 5, name: "blackshibe", mmr: 7390, pos: "Hard Supp", accepted: true },
  { id: 6, name: "slick", mmr: 7200, pos: "Flex", accepted: true },
  { id: 7, name: "r0fl", mmr: 7100, pos: "Mid", accepted: false },
  { id: 8, name: "winter", mmr: 7050, pos: "Support", accepted: true },
];

const RADIANT_TEAM = [
  { id: 9, name: "Sylar", mmr: 8500, pos: "Carry", isCaptain: true, hero: "Slark" },
  { id: 10, name: "MidOne", mmr: 8200, pos: "Mid", isCaptain: false, hero: null },
];

const DIRE_TEAM = [
  { id: 11, name: "Fly", mmr: 8400, pos: "Hard Supp", isCaptain: true, hero: "Chen" },
  { id: 12, name: "S4", mmr: 8300, pos: "Support", isCaptain: false, hero: "Rubick" },
];

export function Inhouse() {
  const [timeLeft, setTimeLeft] = useState(45);
  const [hasAccepted, setHasAccepted] = useState(false);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  return (
    <div className="pressbox min-h-screen flex flex-col">
      <PressBoxNav active="Inhouse" user="stardust" />

      <main className="flex-1 p-6 md:p-8 max-w-[1400px] mx-auto w-full flex flex-col gap-6">
        
        {/* Status Bar */}
        <section className="pb-card p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          {/* Decorative background lines */}
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(90deg, var(--pb-line) 1px, transparent 1px)', backgroundSize: '100px 100%', opacity: 0.1 }}></div>
          
          <div className="flex items-center gap-8 relative z-10">
            <div className="text-center">
              <div className="pb-eyebrow mb-1">Time Remaining</div>
              <div className="pb-serif text-5xl font-medium" style={{ color: timeLeft < 15 ? 'var(--pb-dire)' : 'var(--pb-brass-bright)' }}>
                00:{timeLeft.toString().padStart(2, '0')}
              </div>
            </div>
            
            <div className="w-px h-12 bg-[var(--pb-line)]"></div>
            
            <div className="flex flex-col gap-1">
              <div className="pb-eyebrow">Lobby Configuration</div>
              <div className="flex items-center gap-3 text-sm pb-cond tracking-widest text-[var(--pb-muted)]">
                <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-[var(--pb-amber)]" /> OCEANIA</span>
                <span>•</span>
                <span>CAPTAINS DRAFT</span>
                <span>•</span>
                <span>SYDNEY AWS</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
            <div className="flex-1 md:w-48">
              <div className="flex justify-between text-xs pb-cond mb-2 text-[var(--pb-muted)] tracking-widest">
                <span>ACCEPT PHASE</span>
                <span style={{ color: 'var(--pb-brass-bright)' }}>9/10 READY</span>
              </div>
              <div className="h-1.5 w-full bg-[var(--pb-elevated)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--pb-brass)] rounded-full transition-all duration-1000" style={{ width: '90%' }}></div>
              </div>
            </div>
            
            <button 
              onClick={() => setHasAccepted(true)}
              disabled={hasAccepted}
              className={`px-8 py-3 pb-cond tracking-widest text-sm font-semibold rounded transition-all flex items-center gap-2
                ${hasAccepted 
                  ? 'bg-[var(--pb-surface-2)] text-[var(--pb-muted)] border pb-hairline cursor-not-allowed' 
                  : 'bg-[var(--pb-amber)] text-black hover:bg-[var(--pb-brass-bright)] shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                }`}
            >
              {hasAccepted ? (
                <><Check className="w-4 h-4" /> ACCEPTED</>
              ) : (
                <>ACCEPT MATCH</>
              )}
            </button>
          </div>
        </section>

        {/* Draft Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Main Draft Area */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Radiant Column */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-hairline pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--pb-radiant)' }}></div>
                  <h2 className="pb-serif text-2xl">Radiant</h2>
                </div>
                <div className="pb-eyebrow">Pick 1</div>
              </div>
              
              <div className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5].map((pos, idx) => {
                  const player = RADIANT_TEAM[idx];
                  return (
                    <div key={`rad-${pos}`} className="pb-card p-3 flex items-center gap-3 relative group">
                      <div className="w-6 h-6 flex items-center justify-center rounded-sm bg-[var(--pb-surface-2)] text-xs pb-cond text-[var(--pb-muted)]">
                        {pos}
                      </div>
                      
                      {player ? (
                        <>
                          <div className="w-8 h-8 rounded bg-[var(--pb-elevated)] border pb-hairline flex items-center justify-center text-xs pb-serif text-[var(--pb-brass)]">
                            {player.name[0]}
                          </div>
                          <div className="flex flex-col flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{player.name}</span>
                              {player.isCaptain && <Crown className="w-3 h-3 text-[var(--pb-amber)]" />}
                            </div>
                            <span className="text-xs text-[var(--pb-faint)] pb-cond">{player.mmr} MMR • {player.pos}</span>
                          </div>
                          {player.hero && (
                            <div className="text-xs pb-cond text-[var(--pb-brass)] border pb-hairline px-2 py-1 bg-[var(--pb-elevated)]">
                              {player.hero.toUpperCase()}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-xs pb-cond text-[var(--pb-faint)] tracking-widest border border-dashed border-[var(--pb-line-soft)] py-2 bg-[var(--pb-bg)]">
                          EMPTY SLOT
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unassigned Pool */}
            <div className="flex flex-col gap-4 pb-card p-4 bg-[var(--pb-surface-2)]">
              <div className="flex items-center justify-between border-b pb-hairline pb-2 mb-2">
                <h2 className="pb-eyebrow text-[var(--pb-text)]">Available Players</h2>
                <div className="text-xs pb-cond text-[var(--pb-muted)]">8 REMAINING</div>
              </div>
              
              <div className="flex flex-col gap-2 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
                {UNASSIGNED_PLAYERS.map(player => (
                  <div key={player.id} className="group flex flex-col p-3 border pb-hairline bg-[var(--pb-surface)] hover:bg-[var(--pb-elevated)] transition-colors rounded">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${player.accepted ? 'bg-[var(--pb-radiant)]' : 'bg-[var(--pb-faint)]'}`}></span>
                        <span className="text-sm font-medium">{player.name}</span>
                      </div>
                      <span className="text-xs pb-cond text-[var(--pb-brass)]">{player.pos.toUpperCase()}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--pb-faint)] pb-cond">{player.mmr} MMR</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="text-[10px] pb-cond px-2 py-1 border pb-hairline hover:bg-[var(--pb-radiant)] hover:text-black transition-colors">TO RAD</button>
                        <button className="text-[10px] pb-cond px-2 py-1 border pb-hairline hover:bg-[var(--pb-dire)] hover:text-black transition-colors">TO DIRE</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dire Column */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-hairline pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--pb-dire)' }}></div>
                  <h2 className="pb-serif text-2xl">Dire</h2>
                </div>
                <div className="pb-eyebrow">Pick 2</div>
              </div>
              
              <div className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5].map((pos, idx) => {
                  const player = DIRE_TEAM[idx];
                  return (
                    <div key={`dire-${pos}`} className="pb-card p-3 flex items-center gap-3 relative flex-row-reverse text-right">
                      <div className="w-6 h-6 flex items-center justify-center rounded-sm bg-[var(--pb-surface-2)] text-xs pb-cond text-[var(--pb-muted)]">
                        {pos}
                      </div>
                      
                      {player ? (
                        <>
                          <div className="w-8 h-8 rounded bg-[var(--pb-elevated)] border pb-hairline flex items-center justify-center text-xs pb-serif text-[var(--pb-brass)]">
                            {player.name[0]}
                          </div>
                          <div className="flex flex-col flex-1">
                            <div className="flex items-center gap-2 justify-end">
                              {player.isCaptain && <Crown className="w-3 h-3 text-[var(--pb-amber)]" />}
                              <span className="text-sm font-medium">{player.name}</span>
                            </div>
                            <span className="text-xs text-[var(--pb-faint)] pb-cond">{player.mmr} MMR • {player.pos}</span>
                          </div>
                          {player.hero && (
                            <div className="text-xs pb-cond text-[var(--pb-brass)] border pb-hairline px-2 py-1 bg-[var(--pb-elevated)]">
                              {player.hero.toUpperCase()}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-xs pb-cond text-[var(--pb-faint)] tracking-widest border border-dashed border-[var(--pb-line-soft)] py-2 bg-[var(--pb-bg)]">
                          EMPTY SLOT
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Pick Advisor Side Panel */}
          <div className="lg:col-span-1 flex flex-col gap-4 pb-card p-5">
            <div className="flex items-center gap-2 border-b pb-hairline pb-4 mb-2">
              <Crosshair className="w-4 h-4 text-[var(--pb-brass)]" />
              <h3 className="pb-serif text-lg">Pick Advisor</h3>
            </div>
            
            <p className="text-xs text-[var(--pb-muted)] leading-relaxed mb-4">
              Analyzing team compositions and historical match data. Suggesting heroes to balance Radiant's current draft.
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--pb-brass-bright)]">Tusk</span>
                  <span className="text-xs pb-cond text-[var(--pb-radiant)]">92% MATCH</span>
                </div>
                <div className="text-xs text-[var(--pb-muted)]">Provides save against Slark leash, strong lane presence with Sylar.</div>
              </div>
              
              <div className="w-full h-px bg-[var(--pb-line-soft)]"></div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--pb-text)]">Earthshaker</span>
                  <span className="text-xs pb-cond text-[var(--pb-radiant)]">88% MATCH</span>
                </div>
                <div className="text-xs text-[var(--pb-muted)]">Excellent counter-initiation vs Rubick steal, chain stuns.</div>
              </div>

              <div className="w-full h-px bg-[var(--pb-line-soft)]"></div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--pb-text)]">Puck</span>
                  <span className="text-xs pb-cond text-[var(--pb-amber)]">76% MATCH</span>
                </div>
                <div className="text-xs text-[var(--pb-muted)]">Strong mid matchup, but vulnerable to Chen's early push.</div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t pb-hairline bg-[var(--pb-surface-2)] -mx-5 -mb-5 p-5">
              <div className="pb-eyebrow mb-2">Draft Analysis</div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--pb-muted)]">Team Fight</span>
                  <div className="flex gap-1">
                    <div className="w-8 h-1.5 bg-[var(--pb-brass)]"></div>
                    <div className="w-8 h-1.5 bg-[var(--pb-brass)]"></div>
                    <div className="w-8 h-1.5 bg-[var(--pb-elevated)]"></div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--pb-muted)]">Push</span>
                  <div className="flex gap-1">
                    <div className="w-8 h-1.5 bg-[var(--pb-brass)]"></div>
                    <div className="w-8 h-1.5 bg-[var(--pb-elevated)]"></div>
                    <div className="w-8 h-1.5 bg-[var(--pb-elevated)]"></div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
