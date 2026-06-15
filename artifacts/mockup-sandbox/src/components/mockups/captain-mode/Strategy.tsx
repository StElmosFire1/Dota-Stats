import React, { useState } from "react";
import { Check, ChevronRight, Swords, Trophy, Activity, Flag } from "lucide-react";
import "./_group.css";
import "./Strategy.css";

const RADIANT_HEROES = [
  { slug: "antimage", name: "Anti-Mage", role: "Carry" },
  { slug: "ember_spirit", name: "Ember Spirit", role: "Mid" },
  { slug: "earthshaker", name: "Earthshaker", role: "Offlane" },
  { slug: "crystal_maiden", name: "Crystal Maiden", role: "Soft Sup" },
  { slug: "pudge", name: "Pudge", role: "Hard Sup" }
];

const DIRE_HEROES = [
  { slug: "juggernaut", name: "Juggernaut" },
  { slug: "nevermore", name: "Shadow Fiend" },
  { slug: "mars", name: "Mars" },
  { slug: "lina", name: "Lina" },
  { slug: "axe", name: "Axe" }
];

const WIN_PLAN_SLIDERS = [
  { label: "Tempo", left: "Early", right: "Late", value: -20 },
  { label: "Risk", left: "Aggressive", right: "Passive", value: -40 },
  { label: "Map", left: "Fight", right: "Split", value: 30 },
  { label: "Structure", left: "Farm", right: "Gank", value: 10 },
  { label: "Win Condition", left: "Rosh", right: "Siege", value: -10 },
  { label: "Vision", left: "Wards", right: "Smokes", value: 20 }
];

export function Strategy() {
  return (
    <div className="cm-root min-h-screen flex flex-col font-sans selection:bg-amber-500/30">
      {/* Top Chrome / Progress Rail */}
      <div className="h-16 border-b border-[#2a3b5c] flex items-center justify-between px-8 bg-[#0d1424] z-10 shrink-0 relative">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-gradient-to-br from-[#c5a975] to-[#8a7246] flex items-center justify-center text-black font-bold pb-serif">
            C
          </div>
          <span className="pb-eyebrow text-[14px]">Captain's Mode</span>
        </div>

        <div className="flex items-center gap-12">
          {/* Draft - Done */}
          <div className="flex items-center gap-3 opacity-60">
            <div className="w-6 h-6 rounded-full bg-[#1a2744] border border-[#2a3b5c] flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-[#6c7e9c]" />
            </div>
            <span className="pb-eyebrow text-[#aab8cf]">1. Draft</span>
            <ChevronRight className="w-4 h-4 text-[#6c7e9c]" />
          </div>

          {/* Strategy - Active */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
            </div>
            <span className="pb-eyebrow text-amber-500">2. Strategy</span>
            <ChevronRight className="w-4 h-4 text-[#6c7e9c]" />
          </div>

          {/* Simulate - Upcoming */}
          <div className="flex items-center gap-3 opacity-40">
            <div className="w-6 h-6 rounded-full bg-[#1a2744] border border-[#2a3b5c] flex items-center justify-center">
              <span className="pb-num text-xs">3</span>
            </div>
            <span className="pb-eyebrow text-[#aab8cf]">3. Simulate</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[#6c7e9c] text-sm">
          <Activity className="w-4 h-4" />
          <span>Simulation Engine Ready</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT: Teams Lineup */}
        <div className="w-[280px] shrink-0 border-r border-[#2a3b5c] bg-[#0d1424] flex flex-col">
          {/* Radiant */}
          <div className="flex-1 border-b border-[#2a3b5c] p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="pb-eyebrow text-[#6cc04a]">Radiant</h2>
              <span className="pb-num text-[#6c7e9c]">Your Team</span>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              {RADIANT_HEROES.map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-1.5 rounded bg-[#1a2744] border border-[#2a3b5c]">
                  <img 
                    src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${h.slug}.png`}
                    alt={h.name}
                    className="w-12 h-7 object-cover rounded-sm"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{h.name}</div>
                    <div className="text-[10px] text-[#aab8cf]">{h.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dire */}
          <div className="flex-1 p-6 flex flex-col bg-[#0d1424]/50">
             <div className="flex items-center justify-between mb-4">
              <h2 className="pb-eyebrow text-[#d24b4b]">Dire</h2>
              <span className="pb-num text-[#6c7e9c]">Opponent</span>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              {DIRE_HEROES.map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-1.5 rounded bg-[#152036] border border-[#2a3b5c] opacity-80 grayscale-[0.2]">
                  <img 
                    src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${h.slug}.png`}
                    alt={h.name}
                    className="w-12 h-7 object-cover rounded-sm"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#aab8cf] truncate">{h.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER: Lineup Assignment + Win Plan */}
        <div className="flex-1 flex flex-col p-8 overflow-y-auto bg-[#0d1424]">
          <div className="max-w-4xl mx-auto w-full space-y-10">
            
            {/* Header */}
            <div>
              <h1 className="pb-serif text-4xl mb-2 text-white">Define Strategy</h1>
              <p className="text-[#aab8cf] pb-serif italic text-lg">Assign roles and dictate the match tempo before simulating.</p>
            </div>

            {/* Lineup Panel */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-[#c5a975]" />
                <h3 className="pb-eyebrow">Lineup & Roles</h3>
              </div>
              
              <div className="grid grid-cols-5 gap-4">
                {RADIANT_HEROES.map((h, i) => (
                  <div key={i} className="pb-card bg-[#1a2744] overflow-hidden flex flex-col hero-card">
                    <div className="aspect-[16/9] w-full relative">
                      <img 
                        src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${h.slug}.png`}
                        alt={h.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1a2744] via-transparent to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="text-sm font-bold text-white shadow-sm">{h.name}</div>
                      </div>
                    </div>
                    <div className="p-3 bg-[#1a2744]">
                      <select className="role-dropdown w-full" defaultValue={h.role}>
                        <option>Carry</option>
                        <option>Mid</option>
                        <option>Offlane</option>
                        <option>Soft Sup</option>
                        <option>Hard Sup</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Win Plan */}
            <div className="space-y-6 pb-card p-6 relative">
              <div className="strategy-glow" />
              
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Swords className="w-4 h-4 text-[#c5a975]" />
                  <h3 className="pb-eyebrow">Win Plan</h3>
                </div>
                <div className="text-xs text-[#6c7e9c] italic pb-serif">Adjust the macroscopic directives</div>
              </div>

              <div className="grid grid-cols-2 gap-x-12 gap-y-8 mt-4">
                {WIN_PLAN_SLIDERS.map((slider, i) => (
                  <div key={i} className="space-y-3">
                    <div className="flex items-center justify-between text-xs pb-eyebrow text-[#aab8cf]">
                      <span>{slider.label}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-medium text-[#6c7e9c] w-16 text-right uppercase pb-cond tracking-wider">{slider.left}</span>
                      <div className="flex-1 strategy-slider-track">
                        {/* Fill from center */}
                        <div 
                          className="strategy-slider-fill" 
                          style={{
                            left: slider.value < 0 ? `calc(50% + ${slider.value}%)` : '50%',
                            width: `${Math.abs(slider.value)}%`,
                            background: slider.value < 0 ? 'var(--gold)' : 'var(--amber)'
                          }}
                        />
                        {/* Center marker */}
                        <div className="absolute top-1/2 left-1/2 w-0.5 h-3 bg-[#2a3b5c] -translate-y-1/2 -translate-x-1/2" />
                        
                        {/* Knob */}
                        <div 
                          className="strategy-slider-knob"
                          style={{ left: `${50 + slider.value}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-[#6c7e9c] w-16 text-left uppercase pb-cond tracking-wider">{slider.right}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT: Meters & Lock In */}
        <div className="w-[320px] shrink-0 border-l border-[#2a3b5c] bg-[#152036] p-6 flex flex-col relative z-20">
          
          <div className="pb-card p-5 space-y-8 flex-1">
            
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-[#c5a975]" />
                <h3 className="pb-eyebrow">Predictions</h3>
              </div>
              
              <div className="space-y-6">
                
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <span className="text-sm font-medium text-[#eef2f8]">Draft Fit</span>
                    <span className="pb-num text-2xl text-amber-500">78%</span>
                  </div>
                  <div className="strategy-meter-track">
                    <div className="strategy-meter-fill" style={{ width: '78%' }} />
                  </div>
                  <p className="text-xs text-[#aab8cf] italic pb-serif mt-2">
                    Solid synergy, but slightly vulnerable to physical burst.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <span className="text-sm font-medium text-[#eef2f8]">Coherence</span>
                    <span className="pb-num text-2xl text-[#c5a975]">82%</span>
                  </div>
                  <div className="strategy-meter-track">
                    <div className="strategy-meter-fill bg-[#c5a975]" style={{ width: '82%' }} />
                  </div>
                  <p className="text-xs text-amber-500/80 italic pb-serif mt-2">
                    Low fit? One pick fights your plan.
                  </p>
                </div>

              </div>
            </div>

            <div className="pt-6 border-t border-[#2a3b5c]">
               <div className="text-sm text-[#6c7e9c] mb-4 pb-serif italic">
                 "A good plan violently executed now is better than a perfect plan executed next week."
               </div>
               
               <button className="strategy-btn w-full py-4 rounded font-bold uppercase pb-cond tracking-widest text-sm flex items-center justify-center gap-2">
                 <span>Lock In & Simulate</span>
                 <ChevronRight className="w-4 h-4" />
               </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
