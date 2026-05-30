import React, { useState } from 'react';
import { 
  Trophy, 
  Clock, 
  Calendar, 
  Swords, 
  Activity, 
  TrendingUp, 
  Award, 
  Shield,
  Target,
  CircleDot,
  Crown
} from 'lucide-react';
import "./_group.css";
import { PressBoxNav } from "./_shared/PressBoxNav";

// Mock Data
const radiantPlayers = [
  { id: 1, handle: "Slick", hero: "Anti-Mage", k: 14, d: 2, a: 8, nw: "28.5k", gpm: 750, xpm: 810, mvp: true },
  { id: 2, handle: "Ducky", hero: "Puck", k: 8, d: 4, a: 12, nw: "19.2k", gpm: 580, xpm: 620, mvp: false },
  { id: 3, handle: "ChopChop", hero: "Axe", k: 6, d: 5, a: 15, nw: "14.1k", gpm: 420, xpm: 510, mvp: false },
  { id: 4, handle: "Vortex", hero: "Rubick", k: 4, d: 8, a: 22, nw: "11.5k", gpm: 340, xpm: 480, mvp: false },
  { id: 5, handle: "Oasis", hero: "Crystal Maiden", k: 2, d: 9, a: 28, nw: "8.2k", gpm: 250, xpm: 390, mvp: false },
];

const direPlayers = [
  { id: 6, handle: "Killa", hero: "Phantom Assassin", k: 9, d: 6, a: 4, nw: "21.3k", gpm: 620, xpm: 680, mvp: false },
  { id: 7, handle: "ShadowStep", hero: "Invoker", k: 7, d: 8, a: 11, nw: "16.8k", gpm: 490, xpm: 550, mvp: false },
  { id: 8, handle: "Brute", hero: "Centaur", k: 5, d: 7, a: 14, nw: "12.4k", gpm: 380, xpm: 460, mvp: false },
  { id: 9, handle: "Silent", hero: "Lion", k: 3, d: 11, a: 9, nw: "9.1k", gpm: 280, xpm: 350, mvp: false },
  { id: 10, handle: "Grim", hero: "Warlock", k: 4, d: 12, a: 12, nw: "8.5k", gpm: 260, xpm: 340, mvp: false },
];

function ItemsRow() {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="w-6 h-5 rounded-[3px] border pb-hairline" style={{ backgroundColor: 'var(--pb-surface-2)' }}></div>
      ))}
    </div>
  );
}

function ScoreboardTable({ team, players, isWinner }: { team: string, players: any[], isWinner: boolean }) {
  const teamColor = team === 'Radiant' ? 'var(--pb-radiant)' : 'var(--pb-dire)';
  
  return (
    <div className="pb-card overflow-hidden">
      <div className="px-6 py-4 border-b pb-hairline flex items-center justify-between" style={{ backgroundColor: 'var(--pb-bg-2)' }}>
        <div className="flex items-center gap-3">
          <Shield size={18} style={{ color: teamColor }} />
          <h3 className="pb-cond text-lg tracking-widest uppercase" style={{ color: teamColor }}>
            {team}
          </h3>
          {isWinner && <span className="text-[10px] pb-cond uppercase tracking-widest px-2 py-0.5 rounded-sm" style={{ backgroundColor: 'rgba(52, 211, 153, 0.1)', color: 'var(--pb-radiant)', border: '1px solid rgba(52, 211, 153, 0.2)' }}>Winner</span>}
        </div>
        <div className="text-right">
          <span className="text-2xl pb-serif font-semibold" style={{ color: 'var(--pb-text)' }}>
            {players.reduce((acc, p) => acc + p.k, 0)}
          </span>
          <span className="text-xs pb-cond tracking-widest ml-2" style={{ color: 'var(--pb-faint)' }}>KILLS</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b pb-hairline" style={{ color: 'var(--pb-muted)' }}>
              <th className="px-6 py-3 pb-cond tracking-widest font-normal text-xs uppercase w-[250px]">Player</th>
              <th className="px-4 py-3 pb-cond tracking-widest font-normal text-xs uppercase text-center w-[120px]">K/D/A</th>
              <th className="px-4 py-3 pb-cond tracking-widest font-normal text-xs uppercase text-right w-[100px]">Net</th>
              <th className="px-4 py-3 pb-cond tracking-widest font-normal text-xs uppercase text-right w-[100px]">GPM/XPM</th>
              <th className="px-6 py-3 pb-cond tracking-widest font-normal text-xs uppercase text-right">Items</th>
            </tr>
          </thead>
          <tbody className="divide-y pb-hairline">
            {players.map((p) => (
              <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-6 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded border pb-hairline flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: 'var(--pb-elevated)' }}>
                    <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${p.hero}&backgroundColor=121b2e&textColor=eef3fb`} alt={p.hero} className="w-full h-full" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[15px]" style={{ color: 'var(--pb-text)' }}>{p.handle}</span>
                      {p.mvp && <Crown size={12} style={{ color: 'var(--pb-amber)' }} />}
                    </div>
                    <div className="text-[11px] pb-cond tracking-wider uppercase" style={{ color: 'var(--pb-faint)' }}>{p.hero}</div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-semibold" style={{ color: 'var(--pb-text)' }}>{p.k}</span>
                  <span style={{ color: 'var(--pb-faint)' }}>/</span>
                  <span className="font-semibold" style={{ color: 'var(--pb-dire)' }}>{p.d}</span>
                  <span style={{ color: 'var(--pb-faint)' }}>/</span>
                  <span className="font-semibold" style={{ color: 'var(--pb-muted)' }}>{p.a}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-medium" style={{ color: 'var(--pb-brass)' }}>{p.nw}</span>
                </td>
                <td className="px-4 py-3 text-right text-[13px]">
                  <span style={{ color: 'var(--pb-text)' }}>{p.gpm}</span>
                  <span className="mx-1" style={{ color: 'var(--pb-faint)' }}>/</span>
                  <span style={{ color: 'var(--pb-muted)' }}>{p.xpm}</span>
                </td>
                <td className="px-6 py-3 flex justify-end">
                  <ItemsRow />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchAnalysis() {
  const [metric, setMetric] = useState('networth');
  
  return (
    <div className="pb-card mt-8 overflow-hidden">
      <div className="px-8 py-5 border-b pb-hairline flex flex-wrap items-center justify-between gap-4" style={{ backgroundColor: 'var(--pb-bg-2)' }}>
        <div className="flex items-center gap-3">
          <Activity size={18} style={{ color: 'var(--pb-brass)' }} />
          <h3 className="pb-cond text-lg tracking-widest uppercase" style={{ color: 'var(--pb-text)' }}>Match Analysis</h3>
        </div>
        <div className="flex items-center gap-2 p-1 rounded-full border pb-hairline" style={{ backgroundColor: 'var(--pb-surface-2)' }}>
          {[
            { id: 'networth', label: 'Net Worth' },
            { id: 'xp', label: 'Experience' },
            { id: 'gold', label: 'Gold Lead' }
          ].map(m => (
            <button 
              key={m.id}
              onClick={() => setMetric(m.id)}
              className="px-4 py-1.5 rounded-full text-xs pb-cond tracking-widest transition-all duration-300"
              style={{ 
                backgroundColor: metric === m.id ? 'var(--pb-elevated)' : 'transparent',
                color: metric === m.id ? 'var(--pb-brass-bright)' : 'var(--pb-faint)',
                boxShadow: metric === m.id ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-8 relative">
        <div className="flex justify-between items-center mb-6 px-4">
          <span className="pb-cond text-xs tracking-widest" style={{ color: 'var(--pb-radiant)' }}>RADIANT LEAD</span>
          <span className="pb-cond text-xs tracking-widest" style={{ color: 'var(--pb-dire)' }}>DIRE LEAD</span>
        </div>
        
        {/* Hand-rolled SVG Area Chart */}
        <div className="w-full h-64 relative">
          {/* Zero baseline */}
          <div className="absolute top-1/2 left-0 w-full h-[1px] border-t border-dashed" style={{ borderColor: 'var(--pb-faint)', opacity: 0.5 }}></div>
          
          <svg viewBox="0 0 1000 200" className="w-full h-full preserve-3d" preserveAspectRatio="none">
            <defs>
              <linearGradient id="radiantGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--pb-radiant)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--pb-radiant)" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="direGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="var(--pb-dire)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--pb-dire)" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            
            {/* Radiant Area (Above 100) */}
            <path 
              d="M0,100 L0,90 L100,105 L200,80 L300,50 L400,60 L500,40 L600,80 L700,30 L800,10 L900,20 L1000,0 L1000,100 Z" 
              fill="url(#radiantGrad)" 
            />
            {/* Radiant Line */}
            <path 
              d="M0,90 L100,105 L200,80 L300,50 L400,60 L500,40 L600,80 L700,30 L800,10 L900,20 L1000,0" 
              fill="none" 
              stroke="var(--pb-radiant)" 
              strokeWidth="2" 
            />
            
            {/* Dire-favoured area crossing the zero baseline */}
            <path 
              d="M0,100 L50,110 L150,130 L250,90 L350,70 L450,120 L550,150 L650,90 L750,50 L850,20 L1000,0 L1000,100 Z" 
              fill="url(#radiantGrad)" 
              style={{ clipPath: 'polygon(0 0, 1000px 0, 1000px 100px, 0 100px)' }}
            />
            <path 
              d="M0,100 L50,110 L150,130 L250,90 L350,70 L450,120 L550,150 L650,90 L750,50 L850,20 L1000,0 L1000,100 Z" 
              fill="url(#direGrad)" 
              style={{ clipPath: 'polygon(0 100px, 1000px 100px, 1000px 200px, 0 200px)' }}
            />
            <path 
              d="M0,100 L50,110 L150,130 L250,90 L350,70 L450,120 L550,150 L650,90 L750,50 L850,20 L1000,0" 
              fill="none" 
              stroke="var(--pb-text)" 
              strokeWidth="2" 
            />
            
            {/* Event Markers */}
            <g transform="translate(150, 130)">
              <circle cx="0" cy="0" r="4" fill="var(--pb-dire)" />
              <text x="0" y="-15" fill="var(--pb-faint)" fontSize="12" textAnchor="middle" className="pb-cond">FIRST BLOOD</text>
            </g>
            <g transform="translate(550, 150)">
              <circle cx="0" cy="0" r="4" fill="var(--pb-dire)" />
              <text x="0" y="20" fill="var(--pb-faint)" fontSize="12" textAnchor="middle" className="pb-cond">ROSHAN (D)</text>
            </g>
            <g transform="translate(750, 50)">
              <circle cx="0" cy="0" r="4" fill="var(--pb-radiant)" />
              <text x="0" y="-15" fill="var(--pb-faint)" fontSize="12" textAnchor="middle" className="pb-cond">T3 RADIANT</text>
            </g>
            
          </svg>
        </div>
        
        {/* Timeline labels */}
        <div className="flex justify-between items-center mt-4 px-2 text-xs pb-cond tracking-wider" style={{ color: 'var(--pb-faint)' }}>
          <span>0:00</span>
          <span>10:00</span>
          <span>20:00</span>
          <span>30:00</span>
          <span>38:42</span>
        </div>
      </div>
    </div>
  );
}

export function MatchDetail() {
  return (
    <div className="pressbox">
      <PressBoxNav active="Matches" user="Slick" />
      
      <main className="max-w-[1280px] mx-auto px-8 py-12">
        {/* Result Header */}
        <div className="flex flex-col items-center justify-center mb-16 text-center">
          <div className="pb-eyebrow mb-6 flex items-center gap-4">
            <span className="flex items-center gap-2"><Calendar size={12} /> OCT 24, 2026</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-30"></span>
            <span className="flex items-center gap-2"><Trophy size={12} /> SEASON 4 PLAYOFFS</span>
            <span className="w-1 h-1 rounded-full bg-current opacity-30"></span>
            <span>MATCH ID: 749281190</span>
          </div>
          
          <div className="flex items-center justify-center gap-12 w-full max-w-4xl">
            <div className="flex-1 text-right">
              <h1 className="pb-serif text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 mb-2">Radiant</h1>
              <div className="pb-cond text-sm tracking-[0.3em] uppercase" style={{ color: 'var(--pb-radiant)' }}>Winner</div>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-6 pb-serif text-5xl md:text-7xl font-semibold tracking-tighter" style={{ color: 'var(--pb-brass-bright)' }}>
                <span>34</span>
                <span className="text-3xl" style={{ color: 'var(--pb-faint)' }}>-</span>
                <span>28</span>
              </div>
              <div className="mt-4 px-4 py-1.5 rounded-full border pb-hairline flex items-center gap-2 text-xs pb-cond tracking-widest" style={{ backgroundColor: 'var(--pb-surface)', color: 'var(--pb-muted)' }}>
                <Clock size={12} />
                38:42
              </div>
            </div>
            
            <div className="flex-1 text-left">
              <h1 className="pb-serif text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-br from-white to-white/70 mb-2 opacity-60">Dire</h1>
              <div className="pb-cond text-sm tracking-[0.3em] uppercase" style={{ color: 'var(--pb-dire)' }}>Defeated</div>
            </div>
          </div>
        </div>
        
        {/* Separator */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <div className="h-[1px] w-12" style={{ backgroundColor: 'var(--pb-line)' }}></div>
          <span className="pb-eyebrow">POST-GAME BREAKDOWN</span>
          <div className="h-[1px] w-12" style={{ backgroundColor: 'var(--pb-line)' }}></div>
        </div>
        
        {/* Scoreboards */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
          <ScoreboardTable team="Radiant" players={radiantPlayers} isWinner={true} />
          <ScoreboardTable team="Dire" players={direPlayers} isWinner={false} />
        </div>
        
        <MatchAnalysis />
        
      </main>
    </div>
  );
}
