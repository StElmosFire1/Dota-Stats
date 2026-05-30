import React, { useState, useMemo } from 'react';
import { Trophy, ChevronDown, Search, ChevronUp, Filter, Users, Swords, Crosshair } from 'lucide-react';
import './_group.css';

// --- MOCK DATA ---
const MOCK_DATA = [
  { id: 1, rank: 1, player: { name: 'Snoopy', steamHandle: '@snoopy', color: '#c5a975' }, tier: 'Immortal', rating: 3120, matches: 142, wins: 85, losses: 57, winRate: 59.9, perf: 8.7, streak: 'W3', form: ['W', 'W', 'W', 'L', 'W', 'L'] },
  { id: 2, rank: 2, player: { name: 'Kels', steamHandle: '@kels_dota', color: '#3b82f6' }, tier: 'Immortal', rating: 3045, matches: 128, wins: 72, losses: 56, winRate: 56.3, perf: 8.2, streak: 'L1', form: ['L', 'W', 'W', 'W', 'L', 'W'] },
  { id: 3, rank: 3, player: { name: 'Mushi', steamHandle: '@mushioce', color: '#10b981' }, tier: 'Divine V', rating: 2980, matches: 95, wins: 56, losses: 39, winRate: 58.9, perf: 9.1, streak: 'W5', form: ['W', 'W', 'W', 'W', 'W', 'L'] },
  { id: 4, rank: 4, player: { name: 'Trix', steamHandle: '@trixie', color: '#8b5cf6' }, tier: 'Divine III', rating: 2840, matches: 110, wins: 59, losses: 51, winRate: 53.6, perf: 7.5, streak: 'W1', form: ['W', 'L', 'L', 'W', 'L', 'W'] },
  { id: 5, rank: 5, player: { name: 'Frogs', steamHandle: '@frogs', color: '#f59e0b' }, tier: 'Divine II', rating: 2790, matches: 156, wins: 81, losses: 75, winRate: 51.9, perf: 6.8, streak: 'L2', form: ['L', 'L', 'W', 'W', 'L', 'L'] },
  { id: 6, rank: 6, player: { name: 'Bazza', steamHandle: '@bazza_nz', color: '#ef4444' }, tier: 'Divine I', rating: 2650, matches: 84, wins: 48, losses: 36, winRate: 57.1, perf: 8.0, streak: 'W2', form: ['W', 'W', 'L', 'W', 'L', 'W'] },
  { id: 7, rank: 7, player: { name: 'Chip', steamHandle: '@chip_dmg', color: '#ec4899' }, tier: 'Ancient V', rating: 2510, matches: 210, wins: 106, losses: 104, winRate: 50.5, perf: 6.5, streak: 'L1', form: ['L', 'W', 'L', 'W', 'L', 'W'] },
  { id: 8, rank: 8, player: { name: 'Vortex', steamHandle: '@vort', color: '#6366f1' }, tier: 'Ancient IV', rating: 2420, matches: 62, wins: 36, losses: 26, winRate: 58.1, perf: 7.9, streak: 'W4', form: ['W', 'W', 'W', 'W', 'L', 'L'] },
  { id: 9, rank: 9, player: { name: 'Phantom', steamHandle: '@phantom_oce', color: '#14b8a6' }, tier: 'Ancient II', rating: 2315, matches: 180, wins: 89, losses: 91, winRate: 49.4, perf: 5.8, streak: 'L3', form: ['L', 'L', 'L', 'W', 'L', 'W'] },
  { id: 10, rank: 10, player: { name: 'Slark Fan', steamHandle: '@slarky', color: '#06b6d4' }, tier: 'Ancient I', rating: 2200, matches: 134, wins: 68, losses: 66, winRate: 50.7, perf: 6.2, streak: 'W1', form: ['W', 'L', 'W', 'L', 'W', 'L'] },
  { id: 11, rank: 11, player: { name: 'Nix', steamHandle: '@nix11', color: '#f43f5e' }, tier: 'Legend V', rating: 2150, matches: 90, wins: 44, losses: 46, winRate: 48.9, perf: 5.5, streak: 'L2', form: ['L', 'L', 'W', 'L', 'W', 'L'] },
  { id: 12, rank: 12, player: { name: 'Rusty', steamHandle: '@rust_bucket', color: '#d946ef' }, tier: 'Legend III', rating: 2010, matches: 115, wins: 56, losses: 59, winRate: 48.7, perf: 6.0, streak: 'W1', form: ['W', 'L', 'W', 'L', 'L', 'W'] },
  { id: 13, rank: 13, player: { name: 'Dingo', steamHandle: '@dingo_dog', color: '#84cc16' }, tier: 'Legend II', rating: 1980, matches: 75, wins: 35, losses: 40, winRate: 46.7, perf: 5.2, streak: 'L4', form: ['L', 'L', 'L', 'L', 'W', 'L'] },
  { id: 14, rank: 14, player: { name: 'Salty', steamHandle: '@salt_lord', color: '#64748b' }, tier: 'Archon V', rating: 1850, matches: 205, wins: 98, losses: 107, winRate: 47.8, perf: 5.9, streak: 'W2', form: ['W', 'W', 'L', 'L', 'W', 'L'] },
];

export function PerformanceDashboard() {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'rating',
    direction: 'desc'
  });
  const [searchQuery, setSearchQuery] = useState('');

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const sortedData = useMemo(() => {
    let sortableItems = [...MOCK_DATA];
    
    if (searchQuery) {
      sortableItems = sortableItems.filter(item => 
        item.player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.player.steamHandle.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    sortableItems.sort((a, b) => {
      let aVal: any = a[sortConfig.key as keyof typeof a];
      let bVal: any = b[sortConfig.key as keyof typeof b];

      if (sortConfig.key === 'player') {
        aVal = a.player.name;
        bVal = b.player.name;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sortableItems;
  }, [sortConfig, searchQuery]);

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <ChevronDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-[var(--accent)]" /> : <ChevronDown className="w-3 h-3 text-[var(--accent)]" />;
  };

  const Th = ({ children, columnKey, className = "" }: { children: React.ReactNode, columnKey: string, className?: string }) => (
    <th scope="col" className={`py-3 px-4 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider ${className}`}>
      <button 
        className="group flex items-center gap-1 w-full uppercase focus:outline-none focus:ring-1 focus:ring-[var(--accent)] rounded"
        onClick={() => handleSort(columnKey)}
        aria-sort={sortConfig.key === columnKey ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {children}
        <SortIcon columnKey={columnKey} />
      </button>
    </th>
  );

  return (
    <div className="lb-pro min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-[var(--font)] selection:bg-[var(--accent)] selection:text-[var(--bg-primary)] pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* HEADER SECTION */}
        <header className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="px-2.5 py-1 text-xs font-bold uppercase tracking-widest bg-[var(--bg-secondary)] text-[var(--text-muted)] rounded border border-[var(--border)]">
                  Season 14
                </span>
                <span className="text-[var(--accent)] text-sm font-semibold tracking-wide">OCE INHOUSE</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black font-[var(--font-serif)] tracking-tight">Performance Dashboard</h1>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative group w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search player..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] text-sm rounded-md py-2 pl-10 pr-4 focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all placeholder:text-[var(--text-muted)]"
                />
              </div>
              <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors text-sm font-medium">
                <Filter className="w-4 h-4" />
                Filters
              </button>
            </div>
          </div>

          {/* SUMMARY STRIP */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-[var(--border)] rounded-lg bg-[var(--bg-secondary)] p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-4 px-4 border-r border-[var(--border)] last:border-0">
              <div className="w-10 h-10 rounded bg-[var(--bg-primary)] flex items-center justify-center border border-[var(--border)]">
                <Users className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Active Players</div>
                <div className="text-xl font-bold font-[var(--font-condensed)] tabular-nums">1,248</div>
              </div>
            </div>
            <div className="flex items-center gap-4 px-4 border-r border-[var(--border)] last:border-0">
              <div className="w-10 h-10 rounded bg-[var(--bg-primary)] flex items-center justify-center border border-[var(--border)]">
                <Swords className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Matches This Season</div>
                <div className="text-xl font-bold font-[var(--font-condensed)] tabular-nums">4,892</div>
              </div>
            </div>
            <div className="flex items-center gap-4 px-4">
              <div className="w-10 h-10 rounded bg-[var(--bg-primary)] flex items-center justify-center border border-[var(--border)]">
                <Crosshair className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Avg Rating</div>
                <div className="text-xl font-bold font-[var(--font-condensed)] tabular-nums">2,410 <span className="text-xs text-[var(--text-muted)]">MMR</span></div>
              </div>
            </div>
          </div>
        </header>

        {/* LADDER TABLE */}
        <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-[var(--bg-primary)] border-b border-[var(--border)] sticky top-0 z-10">
                <tr>
                  <Th columnKey="rank" className="w-16">#</Th>
                  <Th columnKey="player" className="min-w-[200px]">Player</Th>
                  <Th columnKey="rating" className="w-24"><span className="w-full text-right">Rating</span></Th>
                  <Th columnKey="tier" className="w-32">Tier</Th>
                  <Th columnKey="perf" className="w-24"><span className="w-full text-right">Perf</span></Th>
                  <Th columnKey="matches" className="w-24"><span className="w-full text-right">Games</span></Th>
                  <Th columnKey="winRate" className="min-w-[140px]">Win Rate</Th>
                  <Th columnKey="streak" className="w-24">Streak</Th>
                  <Th columnKey="form" className="w-32">Form (L6)</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sortedData.map((row, index) => (
                  <tr 
                    key={row.id} 
                    className="group hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-[var(--font-condensed)] font-semibold text-[var(--text-muted)] tabular-nums group-hover:text-[var(--text-primary)] transition-colors">
                      {row.rank}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ring-1 ring-black/20"
                          style={{ backgroundColor: row.player.color }}
                          aria-hidden="true"
                        >
                          {row.player.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-[var(--text-primary)]">{row.player.name}</div>
                          <div className="text-xs text-[var(--text-muted)]">{row.player.steamHandle}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-[var(--font-condensed)] text-lg font-bold text-[var(--accent)] tabular-nums">
                        {row.rating}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">{row.tier}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center justify-center w-9 h-9 rounded bg-[var(--bg-primary)] border border-[var(--border)] font-[var(--font-condensed)] font-bold tabular-nums"
                           style={{ 
                             borderColor: row.perf >= 8.0 ? 'var(--radiant-color)' : row.perf <= 6.0 ? 'var(--dire-color)' : 'var(--border)',
                             color: row.perf >= 8.0 ? 'var(--radiant-color)' : row.perf <= 6.0 ? 'var(--dire-color)' : 'var(--text-primary)'
                           }}>
                        {row.perf.toFixed(1)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-[var(--font-condensed)] text-[var(--text-secondary)] tabular-nums">
                      {row.matches}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-12 text-right font-[var(--font-condensed)] font-semibold tabular-nums text-[var(--text-primary)]">
                          {row.winRate.toFixed(1)}%
                        </div>
                        <div className="w-20 h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden border border-[var(--border)]">
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ 
                              width: `${row.winRate}%`,
                              backgroundColor: row.winRate >= 50 ? 'var(--radiant-color)' : 'var(--dire-color)'
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-[var(--font-condensed)] tabular-nums tracking-wider ${
                        row.streak.startsWith('W') 
                          ? 'bg-[var(--radiant-bg)] text-[var(--radiant-color)] border border-[var(--radiant-color)]/20' 
                          : 'bg-[var(--dire-bg)] text-[var(--dire-color)] border border-[var(--dire-color)]/20'
                      }`}>
                        {row.streak}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        {row.form.map((result, i) => (
                          <div 
                            key={i}
                            className={`w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[9px] font-bold ${
                              result === 'W' 
                                ? 'bg-[var(--radiant-color)] text-[var(--bg-primary)]' 
                                : 'bg-[var(--dire-color)] text-[var(--bg-primary)]'
                            }`}
                            aria-label={result === 'W' ? 'Win' : 'Loss'}
                          >
                            {result}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sortedData.length === 0 && (
            <div className="p-12 text-center text-[var(--text-muted)]">
              No players found matching "{searchQuery}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
