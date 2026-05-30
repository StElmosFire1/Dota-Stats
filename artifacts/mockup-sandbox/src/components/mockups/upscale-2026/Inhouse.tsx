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

type TeamPlayer = { id: number; name: string; mmr: number; pos: string; isCaptain: boolean; hero: string | null };

function TeamColumn({
  team, color, players, pick, mirrored = false,
}: {
  team: string; color: string; players: TeamPlayer[]; pick: string; mirrored?: boolean;
}) {
  const filled = players.length;
  const avg = filled ? Math.round(players.reduce((a, p) => a + p.mmr, 0) / filled) : 0;
  return (
    <div className="pb-card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b pb-hairline pb-4">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: color }}></div>
          <h2 className="pb-serif text-3xl" style={{ color }}>{team}</h2>
          <span className="px-2 py-0.5 rounded text-[10px] pb-cond tracking-widest uppercase border pb-hairline text-[var(--pb-muted)]">{pick}</span>
        </div>
        <div className="text-right">
          <div className="pb-serif text-lg text-[var(--pb-brass-bright)]">{avg.toLocaleString()}</div>
          <div className="pb-eyebrow text-[var(--pb-faint)]">Avg MMR · {filled}/5</div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4, 5].map((pos, idx) => {
          const player = players[idx];
          return (
            <div
              key={`${team}-${pos}`}
              className={`p-4 rounded-lg border pb-hairline flex items-center gap-4 ${mirrored ? 'flex-row-reverse text-right' : ''}`}
              style={{ backgroundColor: player ? 'var(--pb-surface)' : 'transparent', borderStyle: player ? 'solid' : 'dashed' }}
            >
              <div className="w-7 h-7 flex items-center justify-center rounded-sm bg-[var(--pb-surface-2)] text-xs pb-cond text-[var(--pb-muted)] flex-shrink-0">
                {pos}
              </div>

              {player ? (
                <>
                  <div className="w-11 h-11 rounded bg-[var(--pb-elevated)] border pb-hairline flex items-center justify-center text-base pb-serif text-[var(--pb-brass)] flex-shrink-0">
                    {player.name[0].toUpperCase()}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className={`flex items-center gap-2 ${mirrored ? 'justify-end' : ''}`}>
                      {mirrored && player.isCaptain && <Crown className="w-3.5 h-3.5 text-[var(--pb-amber)]" />}
                      <span className="text-base font-medium truncate">{player.name}</span>
                      {!mirrored && player.isCaptain && <Crown className="w-3.5 h-3.5 text-[var(--pb-amber)]" />}
                    </div>
                    <span className="text-xs text-[var(--pb-faint)] pb-cond">{player.mmr.toLocaleString()} MMR • {player.pos}</span>
                  </div>
                  {player.hero && (
                    <div className="text-[11px] pb-cond tracking-wider text-[var(--pb-brass)] border pb-hairline px-2.5 py-1.5 rounded bg-[var(--pb-elevated)] flex-shrink-0">
                      {player.hero.toUpperCase()}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs pb-cond text-[var(--pb-faint)] tracking-widest py-2.5">
                  AWAITING PICK
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

      <main className="flex-1 p-6 md:p-8 max-w-[1500px] mx-auto w-full flex flex-col gap-8">
        
        {/* Accept / Ready Bar */}
        <section className="pb-card relative overflow-hidden border-[var(--pb-amber)]/40">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'linear-gradient(90deg, var(--pb-line) 1px, transparent 1px)', backgroundSize: '120px 100%', opacity: 0.08 }}></div>
          <div className="absolute top-0 right-0 w-80 h-full bg-[var(--pb-amber)]/5 blur-[90px] rounded-full pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row items-stretch">
            {/* Timer block */}
            <div className="flex items-center gap-8 p-6 lg:border-r border-[var(--pb-line)]">
              <div className="text-center">
                <div className="pb-eyebrow mb-1">Accept Window</div>
                <div className="pb-serif text-6xl font-medium leading-none tabular-nums" style={{ color: timeLeft < 15 ? 'var(--pb-dire)' : 'var(--pb-brass-bright)' }}>
                  00:{timeLeft.toString().padStart(2, '0')}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="pb-eyebrow">Lobby Configuration</div>
                <div className="flex items-center gap-2.5 text-sm pb-cond tracking-widest text-[var(--pb-muted)]">
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-[var(--pb-amber)]" /> OCEANIA</span>
                  <span className="text-[var(--pb-faint)]">•</span>
                  <span>CAPTAINS DRAFT</span>
                  <span className="text-[var(--pb-faint)]">•</span>
                  <span>SYDNEY AWS</span>
                </div>
              </div>
            </div>

            {/* Ready pips + accept */}
            <div className="flex flex-1 flex-col md:flex-row items-center justify-between gap-6 p-6">
              <div className="w-full md:w-auto flex-1">
                <div className="flex justify-between items-center text-xs pb-cond mb-3 tracking-widest">
                  <span className="text-[var(--pb-muted)]">PLAYERS READY</span>
                  <span style={{ color: 'var(--pb-brass-bright)' }}>9 / 10</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-2.5 flex-1 rounded-full transition-all duration-500"
                      style={{ backgroundColor: i < 9 ? 'var(--pb-brass)' : 'var(--pb-elevated)' }}
                    />
                  ))}
                </div>
                <div className="mt-2 text-[11px] pb-cond tracking-wider text-[var(--pb-faint)]">Waiting on <span className="text-[var(--pb-amber)]">r0fl</span> to accept…</div>
              </div>

              <button
                type="button"
                onClick={() => setHasAccepted(true)}
                disabled={hasAccepted}
                className={`px-10 py-4 pb-cond tracking-widest text-base font-semibold rounded transition-all flex items-center justify-center gap-2 w-full md:w-auto
                  ${hasAccepted
                    ? 'bg-[var(--pb-surface-2)] text-[var(--pb-muted)] border pb-hairline cursor-not-allowed'
                    : 'bg-[var(--pb-amber)] text-black hover:bg-[var(--pb-brass-bright)] shadow-[0_0_28px_rgba(245,158,11,0.3)]'
                  }`}
              >
                {hasAccepted ? (<><Check className="w-5 h-5" /> ACCEPTED</>) : (<>ACCEPT MATCH</>)}
              </button>
            </div>
          </div>
        </section>

        {/* Teams — roomy, side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <TeamColumn team="Radiant" color="var(--pb-radiant)" players={RADIANT_TEAM} pick="Pick 1" />
          <TeamColumn team="Dire" color="var(--pb-dire)" players={DIRE_TEAM} pick="Pick 2" mirrored />
        </div>

        {/* Pool + Advisor */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Available Players — wide horizontal tray */}
          <div className="lg:col-span-2 pb-card p-6">
            <div className="flex items-center justify-between border-b pb-hairline pb-3 mb-5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--pb-brass)]" />
                <h2 className="pb-serif text-xl">Available Players</h2>
              </div>
              <div className="text-xs pb-cond tracking-widest text-[var(--pb-muted)]">8 REMAINING</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {UNASSIGNED_PLAYERS.map(player => (
                <div key={player.id} className="flex items-center justify-between gap-3 p-3 border pb-hairline bg-[var(--pb-surface)] hover:bg-[var(--pb-elevated)] transition-colors rounded">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${player.accepted ? 'bg-[var(--pb-radiant)]' : 'bg-[var(--pb-faint)]'}`} title={player.accepted ? 'Accepted' : 'Pending'}></span>
                    <div className="w-8 h-8 rounded bg-[var(--pb-elevated)] border pb-hairline flex items-center justify-center text-xs pb-serif text-[var(--pb-brass)] flex-shrink-0">
                      {player.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{player.name}</div>
                      <div className="text-[11px] text-[var(--pb-faint)] pb-cond">{player.mmr} MMR • {player.pos}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button type="button" className="text-[10px] pb-cond px-2.5 py-1.5 rounded border pb-hairline text-[var(--pb-muted)] hover:bg-[var(--pb-radiant)] hover:text-black hover:border-transparent transition-colors">TO RAD</button>
                    <button type="button" className="text-[10px] pb-cond px-2.5 py-1.5 rounded border pb-hairline text-[var(--pb-muted)] hover:bg-[var(--pb-dire)] hover:text-black hover:border-transparent transition-colors">TO DIRE</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pick Advisor */}
          <div className="lg:col-span-1 flex flex-col pb-card overflow-hidden">
            <div className="flex items-center gap-2 border-b pb-hairline px-5 py-4">
              <Crosshair className="w-4 h-4 text-[var(--pb-brass)]" />
              <h3 className="pb-serif text-lg">Pick Advisor</h3>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <p className="text-xs text-[var(--pb-muted)] leading-relaxed">
                Analyzing team compositions and historical match data. Suggesting heroes to balance Radiant's current draft.
              </p>

              {[
                { name: "Tusk", match: "92% MATCH", tone: 'var(--pb-radiant)', note: "Provides save against Slark leash, strong lane presence with Sylar.", lead: true },
                { name: "Earthshaker", match: "88% MATCH", tone: 'var(--pb-radiant)', note: "Excellent counter-initiation vs Rubick steal, chain stuns." },
                { name: "Puck", match: "76% MATCH", tone: 'var(--pb-amber)', note: "Strong mid matchup, but vulnerable to Chen's early push." },
              ].map((s, i) => (
                <div key={s.name} className="flex flex-col gap-2">
                  {i > 0 && <div className="w-full h-px bg-[var(--pb-line-soft)] -mt-2 mb-1"></div>}
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${s.lead ? 'text-[var(--pb-brass-bright)]' : 'text-[var(--pb-text)]'}`}>{s.name}</span>
                    <span className="text-xs pb-cond" style={{ color: s.tone }}>{s.match}</span>
                  </div>
                  <div className="text-xs text-[var(--pb-muted)]">{s.note}</div>
                </div>
              ))}
            </div>

            <div className="mt-auto border-t pb-hairline bg-[var(--pb-surface-2)] p-5">
              <div className="pb-eyebrow mb-3">Draft Analysis</div>
              <div className="flex flex-col gap-3">
                {[
                  { label: "Team Fight", filled: 2 },
                  { label: "Push", filled: 1 },
                  { label: "Sustain", filled: 3 },
                ].map((d) => (
                  <div key={d.label} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--pb-muted)]">{d.label}</span>
                    <div className="flex gap-1">
                      {[0, 1, 2].map((n) => (
                        <div key={n} className="w-8 h-1.5 rounded-full" style={{ backgroundColor: n < d.filled ? 'var(--pb-brass)' : 'var(--pb-elevated)' }}></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
