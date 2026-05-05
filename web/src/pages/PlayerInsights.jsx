import React, { useState } from 'react';
import Social from './Social';
import PlayerBenchmarks from './PlayerBenchmarks';
import PaywallBlur from '../components/PaywallBlur';

const TABS = [
  { id: 'network', label: '★ Player Network', desc: 'Top duos, synergy, and player connections (Pro)', pro: true },
  { id: 'benchmarks', label: '★ Benchmarks', desc: 'Compare average stats across all players (Pro)', pro: true },
];

export default function PlayerInsights({ defaultTab = 'network' }) {
  const [tab, setTab] = useState(defaultTab);

  return (
    <div>
      <h1 className="page-title">Player Insights</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Community statistics, player networks, and performance benchmarks in one place.
      </p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => {
          const isActive = tab === t.id;
          const proColor = '#fbbf24';
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '9px 20px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? `2px solid ${proColor}` : '2px solid transparent',
                color: isActive ? proColor : 'rgba(251,191,36,0.65)',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 14,
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
              title={t.desc}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <PaywallBlur feature="player_insights" minHeight={520}>
        {tab === 'network' && <Social />}
        {tab === 'benchmarks' && <PlayerBenchmarks />}
      </PaywallBlur>
    </div>
  );
}
