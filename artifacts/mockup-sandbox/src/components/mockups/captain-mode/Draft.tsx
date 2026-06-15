import React from "react";
import { 
  Clock, 
  Search, 
  ChevronRight, 
  Circle, 
  CircleDot, 
  Triangle,
  Swords,
  ShieldAlert,
  Brain,
  Crosshair,
  Ban
} from "lucide-react";
import "./_group.css";

const HERO_URL = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/";

const HEROES = [
  "antimage", "axe", "juggernaut", "crystal_maiden", "pudge", 
  "invoker", "lina", "lion", "phantom_assassin", "faceless_void", 
  "mars", "earthshaker", "drow_ranger", "storm_spirit", "tidehunter", 
  "sven", "sniper", "witch_doctor", "dazzle", "jakiro", 
  "slardar", "tiny", "ember_spirit", "void_spirit", "hoodwink", 
  "marci", "primal_beast", "muerta", "nevermore", "queenofpain"
];

function ProgressRail() {
  return (
    <div className="flex items-center justify-center gap-4 text-sm pb-eyebrow mb-2">
      <div className="flex items-center gap-2 text-[var(--amber)]">
        <CircleDot className="w-4 h-4" />
        <span>Draft</span>
      </div>
      <div className="w-16 h-px bg-[var(--line)]" />
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Circle className="w-4 h-4" />
        <span>Strategy</span>
      </div>
      <div className="w-16 h-px bg-[var(--line)]" />
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        <Circle className="w-4 h-4" />
        <span>Simulate</span>
      </div>
    </div>
  );
}

function PickSlot({ role, hero, name, team }: { role: string, hero?: string, name?: string, team: 'radiant' | 'dire' }) {
  const isRadiant = team === 'radiant';
  const color = isRadiant ? 'var(--radiant)' : 'var(--dire)';
  
  return (
    <div className="flex flex-col gap-1 mb-3">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider pl-2 border-l-2" style={{ borderColor: color }}>
        {role}
      </div>
      <div className="h-12 rounded border border-[var(--line)] bg-[var(--bg-elevated)] overflow-hidden flex items-center relative group cursor-default">
        {hero ? (
          <>
            <img 
              src={`${HERO_URL}${hero}.png`} 
              alt={name} 
              className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-luminosity grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-elevated)] via-transparent to-transparent opacity-80" />
            <span className="relative z-10 ml-3 font-semibold tracking-wide text-sm drop-shadow-md">{name}</span>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] pb-eyebrow text-xs opacity-50">
            Picking...
          </div>
        )}
      </div>
    </div>
  );
}

export function Draft() {
  return (
    <div className="cm-root min-h-[100dvh] flex flex-col p-6 box-border font-sans overflow-hidden bg-[var(--bg-primary)]">
      <style>{`
        @keyframes timer-pulse {
          0%, 100% { opacity: 1; text-shadow: 0 0 10px rgba(245, 158, 11, 0.5); }
          50% { opacity: 0.7; text-shadow: none; }
        }
        .animate-timer {
          animation: timer-pulse 2s infinite ease-in-out;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-tile {
          animation: fade-in-up 0.4s ease-out backwards;
        }
      `}</style>

      <ProgressRail />

      <div className="flex-1 grid grid-cols-[260px_1fr_260px] gap-8 overflow-hidden pt-4">
        
        {/* LEFT COLUMN - TEAMS */}
        <div className="flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-[var(--line)] pb-2">
              <h2 className="pb-serif text-xl tracking-wide text-[var(--text-primary)]">Radiant <span className="text-[var(--text-muted)] text-sm italic">(you)</span></h2>
            </div>
            <PickSlot team="radiant" role="Carry" hero="juggernaut" name="Juggernaut" />
            <PickSlot team="radiant" role="Mid" hero="storm_spirit" name="Storm Spirit" />
            <PickSlot team="radiant" role="Offlane" hero="mars" name="Mars" />
            <PickSlot team="radiant" role="Soft Sup" />
            <PickSlot team="radiant" role="Hard Sup" hero="crystal_maiden" name="Crystal Maiden" />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-4 border-b border-[var(--line)] pb-2">
              <h2 className="pb-serif text-xl tracking-wide text-[var(--text-primary)]">Dire <span className="text-[var(--text-muted)] text-sm italic">(AI)</span></h2>
            </div>
            <PickSlot team="dire" role="Carry" hero="phantom_assassin" name="Phantom Assassin" />
            <PickSlot team="dire" role="Mid" hero="nevermore" name="Shadow Fiend" />
            <PickSlot team="dire" role="Offlane" />
            <PickSlot team="dire" role="Soft Sup" hero="lion" name="Lion" />
            <PickSlot team="dire" role="Hard Sup" />
          </div>
        </div>

        {/* CENTER COLUMN - DRAFT BOARD */}
        <div className="flex flex-col min-h-0 bg-[var(--bg-elevated)] rounded-xl border border-[var(--line)] shadow-2xl overflow-hidden relative">
          
          {/* Header */}
          <div className="p-4 border-b border-[var(--line)] flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--amber)] animate-pulse" />
              <h3 className="pb-eyebrow text-[var(--text-primary)] m-0">Ban Phase</h3>
              <span className="text-[var(--text-muted)] text-sm italic">· your turn</span>
            </div>
            <div className="flex items-center gap-2 text-[var(--amber)] animate-timer bg-[var(--amber)]/10 px-3 py-1.5 rounded-md border border-[var(--amber)]/30">
              <Clock className="w-4 h-4" />
              <span className="pb-num text-xl font-medium tracking-tight">25s</span>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="p-4 flex items-center justify-between border-b border-[var(--line)] bg-[var(--bg-card)]">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input 
                type="text" 
                placeholder="Search heroes..." 
                className="w-full bg-[var(--bg-primary)] border border-[var(--line)] rounded px-9 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--brass)] transition-colors"
                defaultValue=""
              />
            </div>
            <div className="flex gap-2 pb-eyebrow text-xs">
              {['All', 'STR', 'AGI', 'INT', 'Uni'].map((f, i) => (
                <button key={f} className={`px-3 py-1 rounded border transition-colors ${i === 0 ? 'bg-[var(--brass)]/20 border-[var(--brass)] text-[var(--brass-bright)]' : 'border-[var(--line)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Hero Grid */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-5 gap-3">
              {HEROES.map((hero, i) => (
                <div 
                  key={hero} 
                  className="hero-tile relative aspect-[16/9] rounded border border-[var(--line)] overflow-hidden group cursor-pointer hover:-translate-y-1 hover:shadow-[0_4px_12px_rgba(197,169,117,0.15)] hover:border-[var(--brass)] transition-all duration-200"
                  style={{ animationDelay: `${i * 15}ms` }}
                >
                  <img 
                    src={`${HERO_URL}${hero}.png`} 
                    alt={hero} 
                    className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="absolute bottom-1.5 left-2 text-[10px] font-medium tracking-wide text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    {hero.replace('_', ' ')}
                  </span>
                  
                  {/* Coaching badges */}
                  {i === 2 && (
                    <div className="absolute top-1.5 right-1.5 bg-[var(--dire)]/90 text-white p-0.5 rounded shadow backdrop-blur-sm" title="Deny pick">
                      <Triangle className="w-3 h-3 fill-current rotate-180" />
                    </div>
                  )}
                  {i === 10 && (
                    <div className="absolute top-1.5 right-1.5 bg-[var(--radiant)]/90 text-white p-0.5 rounded shadow backdrop-blur-sm" title="Good answer">
                      <Triangle className="w-3 h-3 fill-current" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer / Ban Strip */}
          <div className="p-4 border-t border-[var(--line)] bg-[var(--bg-card)] flex flex-col gap-3">
            <div className="flex justify-between items-center text-xs pb-eyebrow text-[var(--text-muted)]">
              <span>Banned Heroes</span>
              <div className="flex gap-4">
                <div className="flex items-center gap-1">
                  <span className="text-[var(--radiant)]">Radiant Reserve</span>
                  <div className="flex gap-0.5 ml-1">
                    <Circle className="w-2.5 h-2.5 fill-[var(--amber)] text-[var(--amber)]" />
                    <Circle className="w-2.5 h-2.5 fill-[var(--amber)] text-[var(--amber)]" />
                    <Circle className="w-2.5 h-2.5 text-[var(--amber)]" />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--dire)]">Dire Reserve</span>
                  <div className="flex gap-0.5 ml-1">
                    <Circle className="w-2.5 h-2.5 fill-[var(--amber)] text-[var(--amber)]" />
                    <Circle className="w-2.5 h-2.5 text-[var(--amber)]" />
                    <Circle className="w-2.5 h-2.5 text-[var(--amber)]" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {['antimage', 'pudge', 'invoker'].map((h, i) => (
                <div key={h} className="w-16 aspect-[16/9] rounded border border-[var(--dire)]/50 relative overflow-hidden opacity-50 grayscale">
                  <img src={`${HERO_URL}${h}.png`} alt={h} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-red-900/30 flex items-center justify-center">
                    <Ban className="w-5 h-5 text-red-500 shadow-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN - ENEMY BRIEF */}
        <div className="flex flex-col">
          <div className="pb-card p-5 sticky top-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="pb-serif text-lg text-[var(--text-primary)]">Enemy Brief</h3>
              <span className="px-2 py-0.5 rounded text-[10px] pb-eyebrow bg-[var(--amber)]/10 text-[var(--amber)] border border-[var(--amber)]/20">Live Coaching</span>
            </div>

            <div className="space-y-5">
              <div className="flex gap-3">
                <div className="mt-0.5 text-[var(--brass)] bg-[var(--brass)]/10 p-1.5 rounded-sm">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] pb-eyebrow text-[var(--text-muted)] mb-1">AI Captain Style</div>
                  <div className="text-sm text-[var(--text-primary)]">Counter-drafter</div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-0.5 text-[var(--brass)] bg-[var(--brass)]/10 p-1.5 rounded-sm">
                  <Swords className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] pb-eyebrow text-[var(--text-muted)] mb-1">Plan</div>
                  <div className="text-sm text-[var(--text-primary)]">Snowball</div>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="mt-0.5 text-[var(--brass)] bg-[var(--brass)]/10 p-1.5 rounded-sm">
                  <Crosshair className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] pb-eyebrow text-[var(--text-muted)] mb-1">Priorities</div>
                  <div className="text-sm text-[var(--text-primary)]">Early cores</div>
                </div>
              </div>

              <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--line)] to-transparent my-2" />

              <div className="flex gap-3">
                <div className="mt-0.5 text-[var(--amber)] bg-[var(--amber)]/10 p-1.5 rounded-sm">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] pb-eyebrow text-[var(--text-muted)] mb-1">Likely Next Move</div>
                  <div className="text-sm font-medium text-[var(--amber)] tracking-tight">Ban your comfort</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
                    AI tends to respect-ban your most played mid heroes if left unpicked by phase 2.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
