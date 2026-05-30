import React, { useState } from 'react';
import { 
  ChevronDown, 
  ArrowUpRight, 
  Award, 
  ShieldCheck, 
  Swords, 
  Clock, 
  TrendingUp, 
  Search, 
  ChevronRight,
  Filter
} from 'lucide-react';
import './_group.css';
import { PressBoxNav } from './_shared/PressBoxNav';

// ----------------------------------------------------------------------
// Mock Data
// ----------------------------------------------------------------------

const MOCK_LEADERBOARD = [
  { id: '1', rank: 1, name: 'Slickz', isPro: true, isFounder: false, tier: 'Divine', mmr: 8140, winRate: 62.4, wins: 48, losses: 29, streak: ['W', 'W', 'W', 'L', 'W'] },
  { id: '2', rank: 2, name: 'QO', isPro: true, isFounder: true, tier: 'Divine', mmr: 8095, winRate: 59.8, wins: 55, losses: 37, streak: ['L', 'W', 'W', 'W', 'W'] },
  { id: '3', rank: 3, name: 'Kpii', isPro: true, isFounder: false, tier: 'Divine', mmr: 7920, winRate: 58.1, wins: 43, losses: 31, streak: ['W', 'L', 'W', 'L', 'W'] },
  { id: '4', rank: 4, name: 'kstars', isPro: false, isFounder: true, tier: 'Immortal', mmr: 7450, winRate: 54.2, wins: 65, losses: 55, streak: ['W', 'W', 'L', 'L', 'L'] },
  { id: '5', rank: 5, name: 'Splicko', isPro: false, isFounder: false, tier: 'Immortal', mmr: 7380, winRate: 55.6, wins: 50, losses: 40, streak: ['L', 'L', 'W', 'W', 'L'] },
  { id: '6', rank: 6, name: 'mizu', isPro: false, isFounder: false, tier: 'Immortal', mmr: 7120, winRate: 53.0, wins: 35, losses: 31, streak: ['W', 'L', 'L', 'W', 'W'] },
  { id: '7', rank: 7, name: 'Batz', isPro: true, isFounder: false, tier: 'Immortal', mmr: 7050, winRate: 51.5, wins: 34, losses: 32, streak: ['L', 'W', 'L', 'L', 'W'] },
  { id: '8', rank: 8, name: 'Ducks', isPro: false, isFounder: true, tier: 'Ascendant', mmr: 6890, winRate: 52.8, wins: 28, losses: 25, streak: ['W', 'W', 'W', 'W', 'L'] },
  { id: '9', rank: 9, name: 'vtfaded', isPro: true, isFounder: false, tier: 'Ascendant', mmr: 6740, winRate: 50.1, wins: 41, losses: 40, streak: ['L', 'L', 'W', 'L', 'L'] },
  { id: '10', rank: 10, name: 'Ranger', isPro: false, isFounder: false, tier: 'Ascendant', mmr: 6600, winRate: 49.5, wins: 30, losses: 31, streak: ['W', 'L', 'W', 'L', 'W'] },
];

const SPOTLIGHTS = [
  {
    title: 'Most Improved',
    playerName: 'mizu',
    stat: '+340 MMR',
    substat: 'Last 14 days',
    icon: TrendingUp
  },
  {
    title: 'Best & Fairest',
    playerName: 'kstars',
    stat: '4.8/5.0',
    substat: 'Sportsmanship Rating',
    icon: Award
  }
];

// ----------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------

const SpotlightCard = ({ title, playerName, stat, substat, icon: Icon }: any) => (
  <div className="pb-card p-6 flex flex-col justify-between group cursor-pointer hover:-translate-y-1 transition-transform duration-300">
    <div className="flex justify-between items-start mb-6">
      <h3 className="pb-eyebrow text-[var(--pb-muted)]">{title}</h3>
      <Icon size={16} className="text-[var(--pb-brass)]" />
    </div>
    
    <div className="flex items-end justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full border pb-hairline overflow-hidden flex-shrink-0">
          <div className="w-full h-full bg-gradient-to-br from-[var(--pb-elevated)] to-[var(--pb-surface-2)]"></div>
        </div>
        <div>
          <div className="pb-serif text-2xl text-[var(--pb-text)] mb-1">{playerName}</div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--pb-radiant)] text-sm font-semibold">{stat}</span>
            <span className="text-[var(--pb-faint)] text-xs">— {substat}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const RecentForm = ({ streak }: { streak: string[] }) => (
  <div className="flex gap-1.5 items-center">
    {streak.map((result, i) => (
      <div 
        key={i} 
        title={result}
        className={`w-2.5 h-2.5 rounded-full ${
          result === 'W' 
            ? 'bg-[var(--pb-radiant)] shadow-[0_0_8px_var(--pb-radiant)] shadow-opacity-20' 
            : 'bg-[var(--pb-dire)] shadow-[0_0_8px_var(--pb-dire)] shadow-opacity-20'
        }`} 
      />
    ))}
  </div>
);

export function Leaderboard() {
  const [season, setSeason] = useState('Season 12');

  return (
    <div className="pressbox flex flex-col min-h-screen">
      <PressBoxNav active="Leaderboard" user="Slickz" />

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-8 py-12">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <div className="pb-eyebrow mb-3 flex items-center gap-2">
              <Swords size={14} />
              Competitive Ladder
            </div>
            <h1 className="pb-serif text-5xl text-[var(--pb-text)]">
              Seasonal Rankings
            </h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-[var(--pb-faint)] text-xs uppercase tracking-widest font-semibold mb-1">Ends In</span>
              <div className="flex items-center gap-2 text-[var(--pb-brass-bright)] pb-cond text-lg">
                <Clock size={16} />
                <span>14D : 08H : 22M</span>
              </div>
            </div>
            <div className="h-10 w-[1px] bg-[var(--pb-line)]"></div>
            <button className="flex items-center gap-3 px-5 py-2.5 rounded border pb-hairline bg-[var(--pb-surface)] hover:bg-[var(--pb-elevated)] transition-colors group">
              <span className="pb-cond text-sm uppercase tracking-widest text-[var(--pb-text)]">{season}</span>
              <ChevronDown size={14} className="text-[var(--pb-brass)] group-hover:text-[var(--pb-amber)] transition-colors" />
            </button>
          </div>
        </header>

        {/* Spotlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {SPOTLIGHTS.map((spotlight, i) => (
            <SpotlightCard key={i} {...spotlight} />
          ))}
        </div>

        {/* Table Section */}
        <div className="pb-card overflow-hidden">
          <div className="px-6 py-4 border-b pb-hairline flex justify-between items-center bg-[var(--pb-surface-2)]">
            <h2 className="pb-cond text-sm uppercase tracking-widest text-[var(--pb-text)]">Global Standings</h2>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pb-faint)]" />
                <input 
                  type="text" 
                  placeholder="Search player..." 
                  className="bg-[var(--pb-bg)] border pb-hairline rounded px-8 py-1.5 text-sm text-[var(--pb-text)] placeholder-[var(--pb-faint)] focus:outline-none focus:border-[var(--pb-brass)] transition-colors w-48"
                />
              </div>
              <button className="p-1.5 border pb-hairline rounded hover:bg-[var(--pb-elevated)] text-[var(--pb-muted)] transition-colors">
                <Filter size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b pb-hairline bg-[var(--pb-bg)]">
                  <th className="px-6 py-4 pb-eyebrow text-[var(--pb-faint)] w-20">Rank</th>
                  <th className="px-6 py-4 pb-eyebrow text-[var(--pb-faint)]">Player</th>
                  <th className="px-6 py-4 pb-eyebrow text-[var(--pb-faint)]">Tier</th>
                  <th className="px-6 py-4 pb-eyebrow text-[var(--pb-faint)] cursor-pointer hover:text-[var(--pb-brass)] transition-colors flex items-center gap-1 group">
                    MMR <ChevronDown size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </th>
                  <th className="px-6 py-4 pb-eyebrow text-[var(--pb-faint)]">Win Rate</th>
                  <th className="px-6 py-4 pb-eyebrow text-[var(--pb-faint)]">W-L</th>
                  <th className="px-6 py-4 pb-eyebrow text-[var(--pb-faint)] text-right">Recent Form</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_LEADERBOARD.map((player, i) => (
                  <tr 
                    key={player.id} 
                    className="border-b pb-hairline hover:bg-[var(--pb-surface-2)] transition-colors group"
                  >
                    <td className="px-6 py-4">
                      {player.rank <= 3 ? (
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--pb-elevated)] border border-[var(--pb-brass)]">
                          <span className="pb-serif text-lg text-[var(--pb-brass-bright)] font-bold">{player.rank}</span>
                        </div>
                      ) : (
                        <div className="w-8 h-8 flex items-center justify-center text-[var(--pb-muted)] font-medium">
                          {player.rank}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full border pb-hairline bg-[var(--pb-bg-2)] overflow-hidden"></div>
                        <span className="font-semibold text-[var(--pb-text)] text-lg">{player.name}</span>
                        <div className="flex gap-1 ml-1">
                          {player.isPro && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[var(--pb-brass)]/10 text-[var(--pb-brass-bright)] border border-[var(--pb-brass)]/20">
                              Pro
                            </span>
                          )}
                          {player.isFounder && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/20">
                              Founder
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--pb-muted)] text-sm font-medium">{player.tier}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="pb-serif text-xl text-[var(--pb-brass-bright)] tracking-tight">
                        {player.mmr.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[var(--pb-text)] font-medium">{player.winRate}%</span>
                    </td>
                    <td className="px-6 py-4 text-[var(--pb-muted)] text-sm">
                      {player.wins} - {player.losses}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end pr-2">
                        <RecentForm streak={player.streak} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="px-6 py-4 border-t pb-hairline bg-[var(--pb-surface-2)] flex justify-center">
            <button className="pb-cond text-sm uppercase tracking-widest text-[var(--pb-brass)] hover:text-[var(--pb-amber)] flex items-center gap-2 transition-colors">
              View Full Standings <ChevronDown size={14} />
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
