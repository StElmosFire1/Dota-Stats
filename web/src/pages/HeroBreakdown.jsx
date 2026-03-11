import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPlayerHeroProfiles } from '../api';
import { getHeroName, getHeroImageUrl } from '../heroNames';

export default function HeroBreakdown() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    setLoading(true);
    getPlayerHeroProfiles()
      .then(data => setPlayers(data.players || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleExpanded = (key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const allKeys = {};
    players.forEach(p => { allKeys[p.player_key] = true; });
    setExpanded(allKeys);
  };

  const collapseAll = () => setExpanded({});

  const playerLink = (p) => {
    if (p.account_id > 0) return `/player/${p.account_id}`;
    return `/player/${encodeURIComponent(p.player_key)}`;
  };

  if (loading) return <div className="loading">Loading hero breakdown...</div>;

  return (
    <div>
      <h1 className="page-title">Hero Breakdown</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={expandAll} style={{ background: '#1e293b', color: '#e0e0e0', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          Expand All
        </button>
        <button onClick={collapseAll} style={{ background: '#1e293b', color: '#e0e0e0', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}>
          Collapse All
        </button>
      </div>
      <p style={{ color: '#888', marginBottom: '1rem' }}>{players.length} players — click a player to see their hero history</p>
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player">Player</th>
              <th className="col-hero" style={{ minWidth: '120px' }}>Hero</th>
              <th className="col-stat">Avg K / D / A</th>
              <th className="col-stat">Games</th>
              <th className="col-stat">Win % (Overall / Dire / Radiant)</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const displayName = p.nickname || p.persona_name;
              const totalWinPct = p.total_games > 0 ? Math.round((p.total_wins / p.total_games) * 100) : 0;
              const isExpanded = expanded[p.player_key];
              const diversification = p.total_games > 0 ? Math.round((p.unique_heroes / p.total_games) * 100) : 0;
              return (
                <React.Fragment key={p.player_key}>
                  <tr
                    onClick={() => toggleExpanded(p.player_key)}
                    style={{ cursor: 'pointer', background: isExpanded ? 'rgba(59,130,246,0.1)' : 'transparent' }}
                    className="player-profile-header"
                  >
                    <td className="col-player" style={{ fontWeight: 'bold' }}>
                      <Link to={playerLink(p)} style={{ color: '#60a5fa', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                        {displayName}
                      </Link>
                    </td>
                    <td className="col-hero" style={{ color: '#888' }}></td>
                    <td className="col-stat" style={{ fontWeight: 'bold' }}>
                      {p.avg_kills} / {p.avg_deaths} / {p.avg_assists}
                    </td>
                    <td className="col-stat" style={{ fontWeight: 'bold' }}>
                      Games: {p.total_games}, Unique: {p.unique_heroes}
                    </td>
                    <td className="col-stat" style={{ fontWeight: 'bold', color: totalWinPct >= 50 ? '#4ade80' : '#f87171' }}>
                      Win: {totalWinPct}% | Div: {diversification}%
                    </td>
                  </tr>
                  {isExpanded && p.heroes.length > 0 && (
                    <>
                      <tr style={{ background: 'rgba(30,41,59,0.5)' }}>
                        <td className="col-player"></td>
                        <td className="col-hero" style={{ color: '#888', fontSize: '0.8rem' }}>Hero</td>
                        <td className="col-stat" style={{ color: '#888', fontSize: '0.8rem' }}>Avg K / D / A</td>
                        <td className="col-stat" style={{ color: '#888', fontSize: '0.8rem' }}>Games</td>
                        <td className="col-stat" style={{ color: '#888', fontSize: '0.8rem' }}>Win % (Dire / Radiant)</td>
                      </tr>
                      {p.heroes.map((h) => {
                        const heroName = getHeroName(h.hero_id, h.hero_name);
                        const heroImg = getHeroImageUrl(h.hero_id, h.hero_name);
                        const overallWinPct = h.games > 0 ? Math.round((h.wins / h.games) * 100) : 0;
                        const direWinPct = h.dire_games > 0 ? Math.round((h.dire_wins / h.dire_games) * 100) : 0;
                        const radWinPct = h.radiant_games > 0 ? Math.round((h.radiant_wins / h.radiant_games) * 100) : 0;
                        return (
                          <tr key={h.hero_id} style={{ background: 'rgba(30,41,59,0.3)' }}>
                            <td className="col-player" style={{ paddingLeft: '2rem' }}></td>
                            <td className="col-hero">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {heroImg && <img src={heroImg} alt={heroName} style={{ width: '24px', height: '14px', borderRadius: '2px' }} />}
                                <span>{heroName}</span>
                              </div>
                            </td>
                            <td className="col-stat">
                              {h.avg_kills} / {h.avg_deaths} / {h.avg_assists}
                            </td>
                            <td className="col-stat">{h.games}</td>
                            <td className="col-stat" style={{ color: overallWinPct >= 50 ? '#4ade80' : '#f87171' }}>
                              {overallWinPct}% (Dire: {direWinPct}% / Rad: {radWinPct}%)
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                  {isExpanded && p.heroes.length === 0 && (
                    <tr style={{ background: 'rgba(30,41,59,0.3)' }}>
                      <td colSpan={5} style={{ color: '#666', paddingLeft: '2rem', fontStyle: 'italic' }}>No hero data available</td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
