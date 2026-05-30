import React, { useState } from 'react';
import { Search, ChevronDown, Trophy, Medal, Crown, TrendingUp, ChevronRight } from 'lucide-react';
import './_group.css';

// --- MOCK DATA ---
type Player = {
  rank: number;
  name: string;
  steamHandle: string;
  tier: string;
  rating: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  perf: number;
  streak: string;
  form: ('W' | 'L')[];
};

const MOCK_DATA: Player[] = [
  { rank: 1, name: 'Slick', steamHandle: '@slickdota', tier: 'Immortal', rating: 3150, matches: 142, wins: 85, losses: 57, winRate: 59.8, perf: 8.7, streak: 'W3', form: ['W', 'W', 'W', 'L', 'W', 'W'] },
  { rank: 2, name: 'Vortex', steamHandle: '@vortex_oce', tier: 'Immortal', rating: 3080, matches: 128, wins: 72, losses: 56, winRate: 56.2, perf: 8.2, streak: 'W1', form: ['W', 'L', 'W', 'L', 'W', 'L'] },
  { rank: 3, name: 'Shadow', steamHandle: '@shadowstep', tier: 'Divine V', rating: 2990, matches: 156, wins: 82, losses: 74, winRate: 52.5, perf: 7.9, streak: 'L2', form: ['L', 'L', 'W', 'W', 'W', 'L'] },
  { rank: 4, name: 'Crimson', steamHandle: '@crimson_blade', tier: 'Divine IV', rating: 2850, matches: 94, wins: 51, losses: 43, winRate: 54.2, perf: 7.4, streak: 'W2', form: ['W', 'W', 'L', 'W', 'L', 'W'] },
  { rank: 5, name: 'Aether', steamHandle: '@aether_au', tier: 'Divine III', rating: 2720, matches: 112, wins: 58, losses: 54, winRate: 51.7, perf: 7.1, streak: 'L1', form: ['L', 'W', 'W', 'L', 'L', 'W'] },
  { rank: 6, name: 'Pulse', steamHandle: '@pulse_gaming', tier: 'Divine II', rating: 2650, matches: 88, wins: 45, losses: 43, winRate: 51.1, perf: 6.8, streak: 'W1', form: ['W', 'L', 'W', 'L', 'W', 'L'] },
  { rank: 7, name: 'Zenith', steamHandle: '@zenith_nz', tier: 'Divine I', rating: 2580, matches: 134, wins: 68, losses: 66, winRate: 50.7, perf: 6.9, streak: 'L3', form: ['L', 'L', 'L', 'W', 'W', 'W'] },
  { rank: 8, name: 'Echo', steamHandle: '@echodota', tier: 'Ancient V', rating: 2450, matches: 105, wins: 54, losses: 51, winRate: 51.4, perf: 6.5, streak: 'W4', form: ['W', 'W', 'W', 'W', 'L', 'L'] },
  { rank: 9, name: 'Nova', steamHandle: '@nova_oce', tier: 'Ancient IV', rating: 2380, matches: 92, wins: 44, losses: 48, winRate: 47.8, perf: 6.2, streak: 'L1', form: ['L', 'W', 'L', 'W', 'L', 'W'] },
  { rank: 10, name: 'Orbit', steamHandle: '@orbit_au', tier: 'Ancient III', rating: 2250, matches: 118, wins: 58, losses: 60, winRate: 49.1, perf: 6.0, streak: 'W1', form: ['W', 'L', 'L', 'W', 'L', 'L'] },
  { rank: 11, name: 'Nebula', steamHandle: '@nebula_gaming', tier: 'Ancient II', rating: 2180, matches: 76, wins: 36, losses: 40, winRate: 47.3, perf: 5.8, streak: 'L2', form: ['L', 'L', 'W', 'L', 'W', 'L'] },
  { rank: 12, name: 'Flux', steamHandle: '@flux_nz', tier: 'Ancient I', rating: 2050, matches: 145, wins: 70, losses: 75, winRate: 48.2, perf: 5.7, streak: 'W2', form: ['W', 'W', 'L', 'L', 'W', 'L'] },
  { rank: 13, name: 'Quasar', steamHandle: '@quasar_dota', tier: 'Legend V', rating: 1980, matches: 84, wins: 38, losses: 46, winRate: 45.2, perf: 5.4, streak: 'L4', form: ['L', 'L', 'L', 'L', 'W', 'W'] },
  { rank: 14, name: 'Meteor', steamHandle: '@meteor_oce', tier: 'Legend IV', rating: 1850, matches: 110, wins: 48, losses: 62, winRate: 43.6, perf: 5.1, streak: 'W1', form: ['W', 'L', 'L', 'L', 'W', 'L'] },
];

function getInitials(name: string) {
  return name.substring(0, 2).toUpperCase();
}

function getAvatarColor(index: number) {
  const colors = [
    'linear-gradient(135deg, #1e3a8a, #3b82f6)',
    'linear-gradient(135deg, #4c1d95, #8b5cf6)',
    'linear-gradient(135deg, #831843, #d946ef)',
    'linear-gradient(135deg, #064e3b, #10b981)',
    'linear-gradient(135deg, #78350f, #f59e0b)',
    'linear-gradient(135deg, #7f1d1d, #ef4444)',
    'linear-gradient(135deg, #14532d, #059669)',
    'linear-gradient(135deg, #312e81, #f43f5e)'
  ];
  return colors[index % colors.length];
}

const PodiumSpot = ({ player, position }: { player: Player, position: 1 | 2 | 3 }) => {
  const isFirst = position === 1;
  const rankColors = {
    1: 'var(--amber)',
    2: '#94a3b8',
    3: '#b45309'
  };
  
  const rankIcons = {
    1: <Crown className="w-5 h-5" style={{ color: 'var(--amber)' }} />,
    2: <Medal className="w-5 h-5" style={{ color: '#94a3b8' }} />,
    3: <Medal className="w-5 h-5" style={{ color: '#b45309' }} />
  };

  return (
    <div className={`relative flex flex-col items-center ${isFirst ? 'z-10 -mt-8' : 'z-0 mt-8 opacity-90'}`}>
      <div 
        className={`relative rounded-full p-1 shadow-2xl flex items-center justify-center`}
        style={{ 
          background: isFirst ? 'linear-gradient(180deg, var(--amber), transparent)' : 'linear-gradient(180deg, rgba(255,255,255,0.2), transparent)',
          width: isFirst ? '120px' : '96px',
          height: isFirst ? '120px' : '96px',
        }}
      >
        <div 
          className="w-full h-full rounded-full flex items-center justify-center text-2xl font-bold shadow-inner"
          style={{ 
            background: getAvatarColor(player.rank),
            fontFamily: 'var(--font-condensed)'
          }}
        >
          {getInitials(player.name)}
        </div>
        
        <div className="absolute -bottom-4 flex items-center justify-center w-8 h-8 rounded-full bg-[#0d1424] border border-[#2a3b5c] shadow-lg">
          {rankIcons[position]}
        </div>
      </div>
      
      <div className={`mt-8 text-center flex flex-col items-center ${isFirst ? 'gap-2' : 'gap-1'}`}>
        <h3 
          style={{ fontFamily: 'var(--font-serif)', color: isFirst ? 'var(--amber)' : 'var(--text-primary)' }} 
          className={`${isFirst ? 'text-3xl' : 'text-xl'} font-bold tracking-wide`}
        >
          {player.name}
        </h3>
        <p style={{ color: 'var(--text-secondary)' }} className="text-sm">{player.tier}</p>
        <div 
          className="mt-2 px-4 py-1 rounded border border-[#2a3b5c]/50 bg-black/30 flex items-center gap-2"
          style={{ fontFamily: 'var(--font-condensed)' }}
        >
          <span className="text-xl font-bold tracking-wider" style={{ color: rankColors[position] }}>
            {player.rating}
          </span>
          <span className="text-xs uppercase tracking-widest text-[#6c7e9c]">MMR</span>
        </div>
      </div>
    </div>
  );
};

export function BroadcastStandings() {
  const top3 = MOCK_DATA.slice(0, 3);
  const rest = MOCK_DATA.slice(3);

  return (
    <div className="lb-pro min-h-screen pb-24 font-sans antialiased text-[#e6edf8] bg-[#0d1424]">
      {/* Header / Masthead */}
      <header className="border-b border-[#2a3b5c]/50 bg-[#0d1424]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-baseline gap-4">
            <h1 
              style={{ fontFamily: 'var(--font-serif)', color: 'var(--accent)' }} 
              className="text-2xl font-bold tracking-wide uppercase"
            >
              Court & Pitch
            </h1>
            <span className="text-[#6c7e9c] text-sm tracking-widest uppercase">
              Season 14 Standings
            </span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6c7e9c] group-focus-within:text-[#c5a975] transition-colors" />
              <input 
                type="text" 
                placeholder="Find Player..." 
                className="bg-[#152036] border border-[#2a3b5c] rounded-full py-1.5 pl-9 pr-4 text-sm text-[#e6edf8] placeholder-[#6c7e9c] focus:outline-none focus:border-[#c5a975]/50 focus:ring-1 focus:ring-[#c5a975]/50 transition-all w-48"
              />
            </div>
            <button className="flex items-center gap-2 text-sm text-[#94a6cb] hover:text-[#e6edf8] transition-colors uppercase tracking-wider">
              <span>All Divisions</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-16">
        {/* Title Area */}
        <div className="text-center mb-20 space-y-4 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 bg-[#c5a975]/10 blur-[100px] rounded-full pointer-events-none" />
          <h2 
            style={{ fontFamily: 'var(--font-serif)' }} 
            className="text-5xl font-black tracking-tight"
          >
            Oceanic <span style={{ color: 'var(--accent)' }}>Masters</span> Ladder
          </h2>
          <p className="text-[#94a6cb] max-w-2xl mx-auto text-lg">
            The definitive ranking of the region's elite.
          </p>
        </div>

        {/* Podium Area */}
        <div className="flex justify-center items-end gap-16 mb-24 px-12">
          <PodiumSpot player={top3[1]} position={2} />
          <PodiumSpot player={top3[0]} position={1} />
          <PodiumSpot player={top3[2]} position={3} />
        </div>

        {/* The Broadsheet Table */}
        <div className="bg-[#152036]/50 border border-[#2a3b5c]/30 rounded-xl overflow-hidden backdrop-blur-sm shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2a3b5c]/50 bg-[#0d1424]/40">
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-[#6c7e9c] uppercase tracking-widest w-16 text-center">Rank</th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-[#6c7e9c] uppercase tracking-widest">Player</th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-[#6c7e9c] uppercase tracking-widest text-right">Rating</th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-[#6c7e9c] uppercase tracking-widest text-right">Matches</th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-[#6c7e9c] uppercase tracking-widest text-right">Win %</th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-[#6c7e9c] uppercase tracking-widest text-right hidden md:table-cell">Perf</th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-[#6c7e9c] uppercase tracking-widest text-center hidden lg:table-cell">Form</th>
                  <th scope="col" className="py-4 px-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a3b5c]/20">
                {rest.map((player) => (
                  <tr 
                    key={player.rank} 
                    className="group hover:bg-[#1a2744]/50 transition-colors duration-200"
                  >
                    <td className="py-4 px-6 text-center">
                      <span 
                        style={{ fontFamily: 'var(--font-condensed)' }} 
                        className="text-xl font-bold text-[#6c7e9c] group-hover:text-[#c5a975] transition-colors"
                      >
                        {player.rank}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm"
                          style={{ background: getAvatarColor(player.rank), fontFamily: 'var(--font-condensed)' }}
                        >
                          {getInitials(player.name)}
                        </div>
                        <div>
                          <div className="font-bold text-[#e6edf8] tracking-wide flex items-center gap-2">
                            {player.name}
                            <span className="text-[10px] uppercase tracking-widest text-[#6c7e9c] bg-[#0d1424] px-1.5 py-0.5 rounded border border-[#2a3b5c]/50">
                              {player.tier}
                            </span>
                          </div>
                          <div className="text-sm text-[#6c7e9c]">{player.steamHandle}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span style={{ fontFamily: 'var(--font-condensed)' }} className="text-xl font-medium tracking-wider text-[#c5a975]">
                        {player.rating}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right text-[#94a6cb] tabular-nums">
                      {player.matches}
                      <div className="text-xs text-[#6c7e9c] mt-0.5">{player.wins}W - {player.losses}L</div>
                    </td>
                    <td className="py-4 px-6 text-right tabular-nums">
                      <span className={`font-medium ${player.winRate >= 50 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                        {player.winRate}%
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right tabular-nums hidden md:table-cell">
                      <span className="inline-flex items-center gap-1 text-[#94a6cb] bg-[#0d1424]/50 px-2 py-1 rounded">
                        <TrendingUp className="w-3 h-3 text-[#c5a975]" />
                        {player.perf.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-4 px-6 hidden lg:table-cell">
                      <div className="flex items-center justify-center gap-1">
                        {player.form.map((res, i) => (
                          <div 
                            key={i} 
                            className={`w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold ${
                              res === 'W' ? 'bg-[#34d399]/20 text-[#34d399]' : 'bg-[#f87171]/20 text-[#f87171]'
                            }`}
                          >
                            {res}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button className="p-2 hover:bg-[#c5a975]/10 rounded-full text-[#6c7e9c] hover:text-[#c5a975] transition-colors" aria-label="View Profile">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
