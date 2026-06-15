import React, { useEffect, useState } from "react";
import { Check, Star, Activity, AlertCircle, AlertTriangle, Map, Clock, Crosshair, Icon } from "lucide-react";
import "./_group.css";

const EVENT_LOG = [
  { time: "00:00", text: "Match started", type: "neutral" },
  { time: "02:15", text: "First blood secured top", type: "payoff", icon: Star },
  { time: "05:00", text: "Bounty runes traded 2-2", type: "on-plan" },
  { time: "08:30", text: "Roshan vision secured", type: "on-plan" },
  { time: "12:04", text: "Fight at mid · Radiant win", type: "on-plan" },
  { time: "16:00", text: "Caught out top · Dire punish", type: "off-script", icon: AlertCircle },
  { time: "18:45", text: "Tower push stalled · reset", type: "stress", icon: AlertTriangle },
  { time: "22:10", text: "Aegis secured · 5 alive", type: "payoff", icon: Star },
  { time: "26:30", text: "High ground siege initiated", type: "on-plan" },
  { time: "30:00", text: "Megacreeps secured", type: "payoff", icon: Star },
  { time: "31:45", text: "GG · Radiant Victory", type: "on-plan" },
];

export function Simulator() {
  return (
    <div className="cm-root min-h-[100dvh] w-full flex flex-col p-6 gap-6 relative overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      <style>{`
        @keyframes scrollUp {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes fadeSlideIn {
          0% { opacity: 0; transform: translateX(-20px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes momentumPulse {
          0%, 100% { transform: scaleX(1); }
          50% { transform: scaleX(1.02); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        
        .event-log-container {
          mask-image: linear-gradient(to bottom, transparent, black 10%, black 90%, transparent);
        }
        .event-list {
          animation: scrollUp 40s linear infinite;
        }
        .event-list:hover {
          animation-play-state: paused;
        }
        .event-item {
          animation: fadeSlideIn 0.5s ease-out forwards;
        }
        .momentum-radiant {
          animation: momentumPulse 4s ease-in-out infinite;
          transform-origin: left;
        }
        .momentum-dire {
          animation: momentumPulse 4s ease-in-out infinite reverse;
          transform-origin: right;
        }
        .map-dot {
          animation: pulseGlow 2s infinite;
        }
      `}</style>

      {/* TOP: Captain Playbook Bar */}
      <div className="pb-card flex items-center justify-between px-6 py-4 shrink-0 z-10 relative">
        <div className="flex items-center gap-6">
          <div>
            <div className="pb-eyebrow mb-1 opacity-70">Status</div>
            <div className="flex items-center gap-2 text-[var(--accent-green)] text-sm font-medium">
              <Check className="w-4 h-4" />
              <span>Brief working</span>
            </div>
          </div>
          
          <div className="w-[1px] h-8" style={{ background: "var(--line)" }} />
          
          <div>
            <div className="pb-eyebrow mb-1 opacity-70">Context</div>
            <div className="text-sm" style={{ color: "var(--text-primary)" }}>
              laning <span className="opacity-50 mx-1">·</span> <span className="pb-num">+2.4k</span> <span className="opacity-50 mx-1">·</span> <span className="pb-num">12m</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-center">
            <div className="pb-eyebrow mb-1 opacity-70">Draft Fit</div>
            <div className="pb-num text-xl text-[var(--accent)]">78%</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="pb-eyebrow mb-1 opacity-70">Coherence</div>
            <div className="pb-num text-xl text-[var(--accent)]">82%</div>
          </div>
          <div className="flex flex-col items-center">
            <div className="pb-eyebrow mb-1 opacity-70">Discipline</div>
            <div className="pb-num text-xl text-[var(--accent)]">71%</div>
          </div>
        </div>

        <div className="w-[1px] h-8" style={{ background: "var(--line)" }} />

        <div>
          <div className="pb-eyebrow mb-2 opacity-70">Win Path</div>
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5 text-[var(--accent-green)] text-xs">
              <Check className="w-3.5 h-3.5" /> Stop split push
            </div>
            <div className="flex items-center gap-1.5 text-[var(--accent-green)] text-xs">
              <Check className="w-3.5 h-3.5" /> Secure Roshan 1
            </div>
            <div className="flex items-center gap-1.5 text-[var(--text-muted)] text-xs">
              <div className="w-3.5 h-3.5 rounded-full border border-current opacity-50" /> End before 35m
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 relative z-10 pb-32">
        {/* CENTER-LEFT: Event Log */}
        <div className="col-span-8 flex flex-col">
          <div className="pb-eyebrow mb-4 opacity-70">Match Event Log</div>
          <div className="flex-1 overflow-hidden event-log-container relative">
            <div className="event-list flex flex-col gap-3 absolute top-0 left-0 w-full pb-8">
              {/* Duplicate list for seamless infinite scroll */}
              {[...EVENT_LOG, ...EVENT_LOG].map((event, i) => {
                let badgeColor = "var(--text-muted)";
                let badgeBg = "transparent";
                let badgeBorder = "var(--line)";
                let badgeText = "Neutral";
                
                if (event.type === "on-plan") {
                  badgeColor = "var(--accent-green)";
                  badgeBorder = "var(--accent-green)";
                  badgeText = "On plan";
                } else if (event.type === "off-script") {
                  badgeColor = "var(--accent-red)";
                  badgeBorder = "var(--accent-red)";
                  badgeText = "Off script";
                } else if (event.type === "stress") {
                  badgeColor = "var(--amber)";
                  badgeBorder = "var(--amber)";
                  badgeText = "Plan stress";
                } else if (event.type === "payoff") {
                  badgeColor = "var(--bg-primary)";
                  badgeBg = "var(--gold)";
                  badgeBorder = "var(--gold)";
                  badgeText = "Plan payoff";
                }

                const Icon = event.icon;

                return (
                  <div 
                    key={i} 
                    className="event-item flex items-center gap-4 py-2 px-4 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.02)", animationDelay: `${(i % EVENT_LOG.length) * 0.1}s` }}
                  >
                    <div className="pb-num text-[var(--accent)] opacity-80 w-12 shrink-0">{event.time}</div>
                    <div className="flex-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>{event.text}</div>
                    <div 
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0"
                      style={{ color: badgeColor, background: badgeBg, border: `1px solid ${badgeBorder}` }}
                    >
                      {Icon && <Icon className="w-3 h-3" />}
                      {badgeText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Minimap / Momentum & Scoreboard Tab */}
        <div className="col-span-4 flex flex-col gap-6">
          <div className="pb-card p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="pb-eyebrow opacity-70">Momentum</div>
              <div className="pb-num text-xs opacity-50 text-[var(--accent)]">65% / 35%</div>
            </div>
            
            {/* Momentum Bar */}
            <div className="h-2 w-full rounded-full overflow-hidden flex bg-[#111]">
              <div className="momentum-radiant h-full" style={{ width: "65%", background: "var(--radiant)" }} />
              <div className="momentum-dire h-full" style={{ width: "35%", background: "var(--dire)" }} />
            </div>

            {/* Stylized Minimap */}
            <div className="relative w-full aspect-square border border-[var(--line)] rounded-lg overflow-hidden flex items-center justify-center bg-[#0a0f1c] mt-4 shadow-inner">
              <div className="absolute inset-0 opacity-20" style={{ 
                background: "linear-gradient(45deg, var(--radiant) 0%, transparent 40%, transparent 60%, var(--dire) 100%)" 
              }} />
              {/* Map grid lines */}
              <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)", backgroundSize: "20% 20%", opacity: 0.1 }} />
              
              {/* River line roughly */}
              <div className="absolute w-[140%] h-px bg-[var(--accent)] rotate-45 opacity-20" />
              
              {/* Position dots */}
              <div className="absolute map-dot w-3 h-3 rounded-full shadow-[0_0_10px_var(--radiant)]" style={{ background: "var(--radiant)", top: "30%", left: "40%" }} />
              <div className="absolute map-dot w-2 h-2 rounded-full shadow-[0_0_10px_var(--radiant)]" style={{ background: "var(--radiant)", top: "60%", left: "20%" }} />
              <div className="absolute map-dot w-3 h-3 rounded-full shadow-[0_0_10px_var(--dire)]" style={{ background: "var(--dire)", top: "25%", left: "65%", animationDelay: "1s" }} />
              <div className="absolute map-dot w-2 h-2 rounded-full shadow-[0_0_10px_var(--dire)]" style={{ background: "var(--dire)", top: "45%", left: "55%", animationDelay: "0.5s" }} />
              
              <Map className="absolute bottom-4 left-4 w-6 h-6 opacity-20 text-[var(--accent)]" />
            </div>
          </div>

          <div className="pb-card flex-1 p-1 flex flex-col">
            <div className="flex border-b border-[var(--line)] p-1">
              <button className="flex-1 py-2 text-xs font-semibold uppercase tracking-wider bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded">Recap</button>
              <button className="flex-1 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">Scoreboard</button>
            </div>
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center gap-4">
              <Activity className="w-8 h-8 text-[var(--accent)] opacity-20" />
              <div className="text-sm text-[var(--text-muted)] max-w-[200px]">
                Generating full match statistics and performance deltas...
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM: Recap Card */}
      <div className="absolute bottom-6 left-6 right-6 z-20">
        <div className="pb-card p-8 flex flex-col gap-4 shadow-[0_-20px_40px_rgba(13,20,36,0.9)] border-t border-t-[var(--amber)] border-opacity-30">
          <div className="flex items-start justify-between">
            <div>
              <div className="pb-eyebrow mb-2 text-[var(--amber)]">Match Verdict</div>
              <h2 className="pb-serif text-3xl md:text-4xl text-[var(--parchment)] max-w-3xl leading-tight">
                Draft mattered more than execution. Off-script errors were punished heavily by Dire lineup.
              </h2>
            </div>
            <div className="flex flex-col items-end text-right">
              <div className="pb-eyebrow mb-1 opacity-70">Captain Rating</div>
              <div className="pb-num text-4xl text-[var(--accent-green)]">+18</div>
            </div>
          </div>

          <div className="w-full h-px my-2" style={{ background: "var(--line)" }} />

          <div className="flex items-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Plan adherence:</span>
              <span className="pb-num text-lg text-[var(--accent)]">73%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">Pivotal moment:</span>
              <span className="pb-num text-lg text-[var(--accent-red)]">16:00</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-muted)]">XP Gained:</span>
              <span className="pb-num text-lg text-[var(--accent)]">+120</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
