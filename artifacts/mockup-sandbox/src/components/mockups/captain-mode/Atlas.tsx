import React, { useState } from "react";
import { Search, TrendingUp, ShieldAlert, Crosshair, Swords, Shield, Activity } from "lucide-react";
import "./_group.css";
import "./Atlas.css";

// ----------------------------------------------------------------------
// DATA
// ----------------------------------------------------------------------
const HEROES = [
  {
    id: 1,
    name: "Anti-Mage",
    slug: "antimage",
    roles: ["Carry", "Escape"],
    identity: "Split-Push",
    spike: "Late Game",
    stats: { wr: "51.2%", pb: "14.3%", kda: "3.2" },
    curve: [10, 40, 95], // E, M, L (0-100)
    counters: [
      { slug: "lion", type: "hard", name: "Lion" },
    ],
  },
  {
    id: 2,
    name: "Earthshaker",
    slug: "earthshaker",
    roles: ["Initiator", "Disabler"],
    identity: "Teamfight",
    spike: "Mid Game",
    stats: { wr: "49.8%", pb: "22.1%", kda: "2.8" },
    curve: [30, 85, 60],
  },
  {
    id: 3,
    name: "Crystal Maiden",
    slug: "crystal_maiden",
    roles: ["Support", "Nuker"],
    identity: "Lane Dominator",
    spike: "Early Game",
    stats: { wr: "52.4%", pb: "28.5%", kda: "2.1" },
    curve: [80, 50, 20],
  },
  {
    id: 4,
    name: "Invoker",
    slug: "invoker",
    roles: ["Nuker", "Escape"],
    identity: "Tempo Control",
    spike: "Mid Game",
    stats: { wr: "48.1%", pb: "19.4%", kda: "3.5" },
    curve: [20, 90, 75],
  },
  {
    id: 5,
    name: "Pudge",
    slug: "pudge",
    roles: ["Disabler", "Initiator"],
    identity: "Pickoff",
    spike: "Mid Game",
    stats: { wr: "50.9%", pb: "35.2%", kda: "2.5" },
    curve: [40, 80, 50],
  },
  {
    id: 6,
    name: "Phantom Assassin",
    slug: "phantom_assassin",
    roles: ["Carry", "Escape"],
    identity: "Burst",
    spike: "Late Game",
    stats: { wr: "50.1%", pb: "18.8%", kda: "3.1" },
    curve: [15, 60, 90],
    counters: [
      { slug: "axe", type: "hard", name: "Axe" },
      { slug: "lina", type: "soft", name: "Lina" },
    ],
  },
  {
    id: 7,
    name: "Lina",
    slug: "lina",
    roles: ["Nuker", "Carry"],
    identity: "Burst",
    spike: "Mid Game",
    stats: { wr: "53.2%", pb: "25.0%", kda: "3.4" },
    curve: [50, 95, 70],
  },
  {
    id: 8,
    name: "Mars",
    slug: "mars",
    roles: ["Initiator", "Durable"],
    identity: "Teamfight",
    spike: "Mid Game",
    stats: { wr: "49.5%", pb: "16.7%", kda: "2.9" },
    curve: [60, 85, 55],
  },
  {
    id: 9,
    name: "Storm Spirit",
    slug: "storm_spirit",
    roles: ["Carry", "Escape"],
    identity: "Pickoff",
    spike: "Mid Game",
    stats: { wr: "47.8%", pb: "12.4%", kda: "3.6" },
    curve: [30, 90, 80],
  },
  {
    id: 10,
    name: "Sven",
    slug: "sven",
    roles: ["Carry", "Initiator"],
    identity: "Burst",
    spike: "Mid Game",
    stats: { wr: "51.5%", pb: "15.9%", kda: "2.7" },
    curve: [40, 90, 60],
  },
  {
    id: 11,
    name: "Sniper",
    slug: "sniper",
    roles: ["Carry", "Nuker"],
    identity: "Siege",
    spike: "Late Game",
    stats: { wr: "52.1%", pb: "21.3%", kda: "3.3" },
    curve: [45, 65, 95],
  },
  {
    id: 12,
    name: "Lion",
    slug: "lion",
    roles: ["Support", "Disabler"],
    identity: "Pickoff",
    spike: "Mid Game",
    stats: { wr: "50.4%", pb: "26.8%", kda: "2.2" },
    curve: [60, 80, 40],
  },
];

// ----------------------------------------------------------------------
// COMPONENTS
// ----------------------------------------------------------------------

function Sparkline({ values }: { values: number[] }) {
  // Normalize 0-100 to SVG coordinates (0-20 for Y, reversed so 100 is top)
  const getY = (val: number) => 20 - (val / 100) * 20;
  
  // Coordinates for 3 points: x=0, x=25, x=50
  const d = `M 0,${getY(values[0])} L 25,${getY(values[1])} L 50,${getY(values[2])}`;
  const dBg = `M 0,10 L 25,10 L 50,10`;

  return (
    <svg width="50" height="20" viewBox="0 0 50 20" className="overflow-visible">
      {/* Background guide line */}
      <path d={dBg} className="sparkline-bg" />
      {/* Actual curve */}
      <path d={d} className="sparkline-path" />
    </svg>
  );
}

function StatItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="pb-eyebrow text-[9px] text-[var(--text-muted)] mb-1">{label}</span>
      <span className={`pb-num text-sm ${highlight ? 'text-[var(--amber)]' : 'text-[var(--text-primary)]'}`}>
        {value}
      </span>
    </div>
  );
}

function MatchupChip({ slug, type, name }: { slug: string; type: "hard" | "soft"; name: string }) {
  const isHard = type === "hard";
  const iconColor = isHard ? "text-[var(--dire)]" : "text-[var(--amber)]";
  const borderColor = isHard ? "border-[rgba(210,75,75,0.3)]" : "border-[rgba(245,158,11,0.3)]";
  
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded-full border ${borderColor} bg-[rgba(0,0,0,0.2)]`} title={`${type === 'hard' ? 'Hard' : 'Soft'} counter: ${name}`}>
      <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-[var(--line)]">
        <img 
          src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`}
          alt={name}
          className="w-full h-full object-cover"
        />
      </div>
      <span className={`text-[10px] pb-cond uppercase tracking-wider font-semibold ${iconColor}`}>
        {isHard ? 'VS HARD' : 'VS SOFT'}
      </span>
    </div>
  );
}

export function Atlas() {
  const [activeFilter, setActiveFilter] = useState("All");

  const filters = ["All", "STR", "AGI", "INT", "UNI"];

  return (
    <div className="cm-root min-h-[100dvh] w-full flex flex-col items-center pb-24">
      {/* TOP NAVIGATION / HEADER */}
      <div className="w-full max-w-[1300px] px-6 pt-12 pb-8 flex flex-col gap-6">
        
        {/* Title Block */}
        <div className="flex flex-col gap-2">
          <span className="pb-eyebrow text-[var(--brass)] flex items-center gap-2">
            <Activity className="w-4 h-4" />
            OpenDota Intelligence
          </span>
          <h1 className="pb-serif text-5xl font-medium text-[var(--parchment)] tracking-tight">
            Draft Atlas
          </h1>
        </div>

        {/* Filter Rail */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            {filters.map(f => (
              <button
                key={f}
                data-active={activeFilter === f}
                onClick={() => setActiveFilter(f)}
                className="filter-pill px-5 py-2 rounded-full border text-sm font-medium tracking-wide flex items-center justify-center cursor-pointer"
              >
                {f}
              </button>
            ))}
            <div className="h-6 w-[1px] bg-[var(--line)] mx-2" />
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search heroes, roles, identities..." 
                className="bg-[rgba(0,0,0,0.2)] border border-[var(--line)] rounded-full pl-9 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--brass)] w-[260px] transition-colors"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <span className="text-sm">Showing</span>
            <span className="pb-num text-[var(--parchment)] font-medium text-base">127</span>
            <span className="text-sm">of</span>
            <span className="pb-num text-[var(--parchment)] font-medium text-base">127</span>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className="w-full max-w-[1300px] px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {HEROES.map((hero, index) => {
          // Calculate animation delay for stagger
          const delay = `${index * 0.05}s`;
          
          return (
            <div 
              key={hero.id} 
              className="pb-card hero-card flex flex-col overflow-hidden relative group cursor-pointer hero-card-enter"
              style={{ animationDelay: delay }}
            >
              {/* Portrait Header */}
              <div className="w-full h-[120px] relative overflow-hidden bg-[var(--ink-navy)] border-b border-[var(--line)] shrink-0">
                <img 
                  src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${hero.slug}.png`}
                  alt={hero.name}
                  loading="lazy"
                  className="w-full h-full object-cover hero-portrait"
                />
                <div className="absolute inset-0 hero-portrait-overlay" />
                
                {/* Top badges (Roles) */}
                <div className="absolute top-3 left-3 flex gap-2">
                  {hero.roles.map(role => (
                    <span key={role} className="bg-[rgba(13,20,36,0.8)] backdrop-blur-sm border border-[var(--line)] px-2 py-0.5 rounded text-[10px] uppercase font-semibold tracking-wider text-[var(--parchment)]">
                      {role}
                    </span>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="p-4 flex flex-col flex-grow">
                {/* Title & Identity */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="pb-serif text-xl font-medium text-[var(--parchment)] leading-none group-hover:text-[var(--amber)] transition-colors">
                      {hero.name}
                    </h2>
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
                      <Crosshair className="w-3 h-3 text-[var(--brass)]" />
                      {hero.identity}
                    </span>
                  </div>
                  
                  {/* Spike / Power Curve */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="pb-eyebrow text-[9px] text-[var(--text-muted)]">Power Spike</span>
                    <div className="flex items-center gap-2">
                      <Sparkline values={hero.curve} />
                      <div className="flex flex-col items-end">
                        <span className="pb-cond text-[10px] text-[var(--amber)] uppercase tracking-widest font-semibold leading-none">
                          {hero.spike.split(' ')[0]}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Matchup Chips (If any) */}
                {hero.counters && hero.counters.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {hero.counters.map(counter => (
                      <MatchupChip key={counter.slug} slug={counter.slug} type={counter.type as any} name={counter.name} />
                    ))}
                  </div>
                )}

                <div className="flex-grow" />

                {/* Stats Footer */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[var(--line-soft)]">
                  <StatItem label="WINRATE" value={hero.stats.wr} highlight={parseFloat(hero.stats.wr) > 50} />
                  <StatItem label="PICK/BAN" value={hero.stats.pb} />
                  <StatItem label="KDA AVG" value={hero.stats.kda} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
