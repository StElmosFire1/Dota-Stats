import React, { useState } from 'react';
import Social from './Social';
import PlayerBenchmarks from './PlayerBenchmarks';

const TABS = [
  { id: 'network', label: '🕸️ Player Network', desc: 'Top duos, synergy, and player connections' },
  { id: 'benchmarks', label: '📊 Benchmarks', desc: 'Compare average stats across all players' },
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
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 20px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: tab === t.id ? 700 : 400,
              cursor: 'pointer',
              fontSize: 14,
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
            title={t.desc}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'network' && <Social />}
      {tab === 'benchmarks' && <PlayerBenchmarks />}
    </div>
  );
}
