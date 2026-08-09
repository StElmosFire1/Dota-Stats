import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Social from './Social';
import PlayerBenchmarks from './PlayerBenchmarks';
import PaywallBlur from '../components/PaywallBlur';

const TABS = [
  { id: 'network', label: '★ Network', desc: 'Top duos, synergy, and player connections (Pro)', pro: true },
  { id: 'benchmarks', label: '★ Benchmarks', desc: 'Compare average stats across all players (Pro)', pro: true },
];

// Per-tab titles so /social and /benchmarks read as clearly different pages
// (they share this shell, which used to make them look identical).
// The combined page is called "Player Network" (Benchmarks folded in as a
// tab). The title is constant; only the per-tab description changes.
const TAB_HEADINGS = {
  network: {
    title: 'Player Network',
    desc: 'Who plays with whom — top duos, teammate synergy, and the connection graph across the league.',
  },
  benchmarks: {
    title: 'Player Network',
    desc: 'League-wide averages — compare every player\u2019s KDA, GPM, and core stats side by side in one table.',
  },
};

// Tab → canonical URL. Tab state is derived from the URL (not local state) so
// /benchmarks can never render the Network tab, switching tabs updates the
// address bar, and every tab view produces its own analytics pageview.
const TAB_ROUTES = { network: '/social', benchmarks: '/benchmarks' };

export default function PlayerInsights({ defaultTab = 'network' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = location.pathname.startsWith('/benchmarks') ? 'benchmarks'
    : (location.pathname.startsWith('/social') || location.pathname.startsWith('/player-network')) ? 'network'
    : defaultTab;
  const setTab = (id) => navigate(TAB_ROUTES[id] || TAB_ROUTES.network);
  const heading = TAB_HEADINGS[tab] || TAB_HEADINGS.network;

  return (
    <div>
      <h1 className="page-title">{heading.title}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        {heading.desc}
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
