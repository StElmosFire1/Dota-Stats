import React, { useState } from 'react';
import { Search, ChevronDown, Filter, Trophy, TrendingUp, Medal, Shield } from 'lucide-react';
import './_group.css';

// Mock Data Generation
const mockPlayers = [
  { rank: 1, name: 'Slick', handle: 'slickdota', tier: 'Immortal', rating: 3120, matches: 142, wins: 85, losses: 57, winRate: 59.8, perf: 8.2, streak: 'W3', form: ['W', 'W', 'W', 'L', 'W', 'L'] },
  { rank: 2, name: 'Kael', handle: 'kael_oce', tier: 'Immortal', rating: 3050, matches: 120, wins: 72, losses: 48, winRate: 60.0, perf: 7.9, streak: 'L1', form: ['L', 'W', 'W', 'W', 'W', 'W'] },
  { rank: 3, name: 'NoobSaibot', handle: 'ns_gaming', tier: 'Divine V', rating: 2980, matches: 155, wins: 88, losses: 67, winRate: 56.7, perf: 7.5, streak: 'W1', form: ['W', 'L', 'W', 'L', 'L', 'W'] },
  { rank: 4, name: 'Rex', handle: 'rex_aus', tier: 'Divine IV', rating: 2910, matches: 98, wins: 55, losses: 43, winRate: 56.1, perf: 8.5, streak: 'W5', form: ['W', 'W', 'W', 'W', 'W', 'L'] },
  { rank: 5, name: 'Ghost', handle: 'ghost99', tier: 'Divine III', rating: 2850, matches: 210, wins: 110, losses: 100, winRate: 52.3, perf: 6.8, streak: 'L2', form: ['L', 'L', 'W', 'W', 'L', 'W'] },
  { rank: 6, name: 'Zeus', handle: 'zeus_plays', tier: 'Divine II', rating: 2790, matches: 85, wins: 48, losses: 37, winRate: 56.4, perf: 7.2, streak: 'W2', form: ['W', 'W', 'L', 'L', 'W', 'W'] },
  { rank: 7, name: 'Manta', handle: 'manta_style', tier: 'Divine I', rating: 2710, matches: 130, wins: 68, losses: 62, winRate: 52.3, perf: 6.5, streak: 'L1', form: ['L', 'W', 'L', 'W', 'W', 'L'] },
  { rank: 8, name: 'Viper', handle: 'zap_viper', tier: 'Ancient V', rating: 2650, matches: 110, wins: 56, losses: 54, winRate: 50.9, perf: 6.9, streak: 'W1', form: ['W', 'L', 'L', 'L', 'W', 'W'] },
  { rank: 9, name: 'Shadow', handle: 'shadow_fiend', tier: 'Ancient IV', rating: 2580, matches: 95, wins: 49, losses: 46, winRate: 51.5, perf: 7.1, streak: 'L3', form: ['L', 'L', 'L', 'W', 'W', 'W'] },
  { rank: 10, name: 'Pudge', handle: 'toxic_pudge', tier: 'Ancient III', rating: 2510, matches: 140, wins: 71, losses: 69, winRate: 50.7, perf: 6.2, streak: 'W1', form: ['W', 'L', 'W', 'L', 'W', 'L'] },
  { rank: 11, name: 'Tide', handle: 'tidehunter', tier: 'Ancient II', rating: 2440, matches: 105, wins: 52, losses: 53, winRate: 49.5, perf: 6.4, streak: 'L1', form: ['L', 'W', 'L', 'W', 'L', 'W'] },
  { rank: 12, name: 'Crystal', handle: 'cm_support', tier: 'Ancient I', rating: 2380, matches: 160, wins: 80, losses: 80, winRate: 50.0, perf: 7.8, streak: 'W2', form: ['W', 'W', 'L', 'L', 'W', 'L'] },
  { rank: 13, name: 'Lion', handle: 'lion_king', tier: 'Legend V', rating: 2310, matches: 115, wins: 55, losses: 60, winRate: 47.8, perf: 6.1, streak: 'L4', form: ['L', 'L', 'L', 'L', 'W', 'W'] },
  { rank: 14, name: 'Sniper', handle: 'sniper_pro', tier: 'Legend IV', rating: 2250, matches: 90, wins: 42, losses: 48, winRate: 46.6, perf: 6.7, streak: 'W1', form: ['W', 'L', 'W', 'L', 'L', 'L'] },
];

const getInitials = (name: string) => name.substring(0, 2).toUpperCase();
const getColorHash = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 40%)`;
};

const FormDisplay = ({ form }: { form: string[] }) => (
  <div className="flex gap-1 items-center" aria-label={`Recent form: ${form.join(', ')}`}>
    {form.map((res, i) => (
      <div 
        key={i} 
        className="w-3 h-3 rounded-full text-[8px] flex items-center justify-center font-bold font-condensed"
        style={{
          backgroundColor: res === 'W' ? 'var(--radiant-bg)' : 'var(--dire-bg)',
          color: res === 'W' ? 'var(--radiant-color)' : 'var(--dire-color)'
        }}
        aria-hidden="true"
      >
        {res}
      </div>
    ))}
  </div>
);

export function CardLadder() {
  const topPlayers = mockPlayers.slice(0, 6);
  const restPlayers = mockPlayers.slice(6);

  return (
    <div className="lb-pro min-h-screen text-[var(--text-primary)] font-[var(--font)] selection:bg-[var(--accent)] selection:text-[var(--bg-primary)] pb-24">
      
      {/* Header Area */}
      <header className="px-6 py-8 border-b border-[var(--border)] bg-[var(--bg-primary)]/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-[var(--accent)] text-sm font-condensed font-bold tracking-widest uppercase">OCE Inhouse</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></span>
              <span className="text-[var(--text-muted)] text-sm font-condensed tracking-widest uppercase">Season 12</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif font-black tracking-tight text-[var(--text-primary)]">
              Pro Roster <span className="text-[var(--accent)] italic">Ladder</span>
            </h1>
            <p className="text-[var(--text-secondary)] max-w-xl text-sm leading-relaxed mt-2">
              The highest tier of competitive play. Ranks are determined by TrueSkill™ MMR. The top 6 players at season end qualify for the grand finals.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" />
              <input 
                type="text" 
                placeholder="Search players..." 
                className="w-full sm:w-64 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-sm py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors placeholder-[var(--text-muted)]"
              />
            </div>
            <button className="flex items-center justify-center gap-2 bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--text-muted)] rounded-sm px-4 py-2 text-sm font-medium transition-colors" aria-label="Filter Leaderboard">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
          </div>

        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-10">
        
        {/* Top 6 Grid - The "Roster" */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-serif font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[var(--accent)]" />
              The Elite Six
            </h2>
            <div className="text-xs font-condensed tracking-widest text-[var(--text-muted)] uppercase border-b border-[var(--border)] pb-1">
              Top Performers
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topPlayers.map((p) => (
              <div 
                key={p.rank} 
                className="group relative bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-hidden hover:border-[var(--accent)] transition-all duration-300 shadow-[var(--shadow-card)] cursor-pointer flex flex-col"
              >
                {/* Brass top accent for rank 1-3, standard for 4-6 */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1 z-10" 
                  style={{ backgroundColor: p.rank <= 3 ? 'var(--accent)' : 'transparent' }}
                />

                <div className="p-5 flex gap-4 items-start relative z-10">
                  <div className="relative">
                    <div 
                      className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shadow-inner"
                      style={{ backgroundColor: getColorHash(p.name) }}
                    >
                      {getInitials(p.name)}
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-[var(--bg-primary)] border border-[var(--border)] flex items-center justify-center font-condensed font-bold text-xs text-[var(--accent)]">
                      #{p.rank}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-lg leading-tight truncate group-hover:text-[var(--accent)] transition-colors">{p.name}</h3>
                        <div className="text-xs text-[var(--text-muted)] truncate">@{p.handle}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-condensed font-bold text-xl text-[var(--accent)] tabular-nums">{p.rating}</div>
                        <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">MMR</div>
                      </div>
                    </div>
                    <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)]">
                      {p.tier}
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 bg-[var(--bg-primary)]/50 border-t border-[var(--border)] grid grid-cols-3 gap-4 mt-auto">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Win Rate</div>
                    <div className="font-condensed text-sm tabular-nums flex items-center gap-1">
                      <span className={p.winRate >= 50 ? 'text-[var(--radiant-color)]' : 'text-[var(--dire-color)]'}>
                        {p.winRate}%
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">PERF</div>
                    <div className="font-condensed text-sm tabular-nums text-[var(--text-primary)]">
                      {p.perf}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-1">Form</div>
                    <FormDisplay form={p.form} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rest of Ladder - Compact Table */}
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h2 className="text-lg font-serif font-bold text-[var(--text-primary)]">Contenders</h2>
            <div className="text-xs font-condensed tracking-widest text-[var(--text-muted)]">
              Ranks 7 - 14
            </div>
          </div>

          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md overflow-x-auto shadow-[var(--shadow-card)]">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-[var(--bg-primary)]/80 text-[10px] uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium w-16 text-center">Rank</th>
                  <th scope="col" className="px-4 py-3 font-medium">Player</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Tier</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right cursor-pointer hover:text-[var(--accent)] group transition-colors">
                    <button className="flex items-center justify-end gap-1 w-full font-inherit" aria-sort="descending">
                      Rating <ChevronDown className="w-3 h-3 text-[var(--accent)]" />
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium text-right hidden md:table-cell">W - L</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right hidden lg:table-cell">Win %</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right hidden lg:table-cell">PERF</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Form</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {restPlayers.map((p) => (
                  <tr key={p.rank} className="hover:bg-[var(--bg-hover)] transition-colors group cursor-pointer">
                    <td className="px-4 py-3 text-center font-condensed font-bold text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">
                      {p.rank}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: getColorHash(p.name) }}
                          aria-hidden="true"
                        >
                          {getInitials(p.name)}
                        </div>
                        <div>
                          <div className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] hidden sm:block">
                            @{p.handle}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-secondary)]">
                        {p.tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-condensed font-bold text-[var(--accent)] tabular-nums text-base">
                      {p.rating}
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell text-xs tabular-nums text-[var(--text-secondary)]">
                      {p.wins} - {p.losses}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell tabular-nums">
                      <span className={p.winRate >= 50 ? 'text-[var(--radiant-color)]' : 'text-[var(--dire-color)]'}>
                        {p.winRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell tabular-nums font-condensed text-[var(--text-primary)]">
                      {p.perf}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end">
                        <FormDisplay form={p.form} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 flex justify-center">
             <button className="text-sm font-condensed tracking-widest text-[var(--accent)] border border-[var(--accent)] rounded-sm px-6 py-2 hover:bg-[var(--accent)] hover:text-[var(--bg-primary)] transition-all uppercase">
               Load More Players
             </button>
          </div>

        </div>
      </main>

    </div>
  );
}
