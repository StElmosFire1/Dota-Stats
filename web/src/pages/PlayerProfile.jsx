import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPlayer, getPlayerPositions } from '../api';
import { getHeroName } from '../heroNames';

const POS_NAMES = { 1: 'Pos 1 (Safe)', 2: 'Pos 2 (Mid)', 3: 'Pos 3 (Off)', 4: 'Pos 4 (Sup)', 5: 'Pos 5 (Hard Sup)' };

function formatDuration(seconds) {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlayerProfile() {
  const { accountId } = useParams();
  const [data, setData] = useState(null);
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPlayer(accountId).catch(() => null),
      getPlayerPositions(accountId).catch(() => ({ positions: [] })),
    ]).then(([playerData, posData]) => {
      setData(playerData);
      setPositions(posData?.positions || []);
    }).finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return <div className="loading">Loading player...</div>;
  if (!data) return <div className="error-state">Player not found</div>;

  const { rating, nickname, recentMatches, averages, heroes } = data;
  const displayName = nickname || rating?.display_name || `Player ${accountId}`;

  const totalMatches = averages ? parseInt(averages.total_matches) : 0;
  const totalKDA = averages && totalMatches > 0
    ? ((parseInt(averages.total_kills) + parseInt(averages.total_assists)) / Math.max(parseInt(averages.total_deaths), 1)).toFixed(2)
    : null;

  return (
    <div>
      <Link to="/players" className="back-link">&larr; Back to players</Link>

      <h1 className="page-title">
        {displayName}
        {nickname && rating?.display_name && nickname !== rating.display_name && (
          <span style={{ fontSize: '0.6em', color: '#888', marginLeft: '0.5rem' }}>
            ({rating.display_name})
          </span>
        )}
      </h1>

      {rating && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value mmr">{rating.mmr}</div>
            <div className="stat-label">MMR</div>
          </div>
          <div className="stat-card">
            <div className="stat-value wins">{rating.wins}</div>
            <div className="stat-label">Wins</div>
          </div>
          <div className="stat-card">
            <div className="stat-value losses">{rating.losses}</div>
            <div className="stat-label">Losses</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {rating.games_played > 0
                ? ((rating.wins / rating.games_played) * 100).toFixed(1) + '%'
                : '--'}
            </div>
            <div className="stat-label">Win Rate</div>
          </div>
          {totalKDA && (
            <div className="stat-card">
              <div className="stat-value">{totalKDA}</div>
              <div className="stat-label">KDA</div>
            </div>
          )}
        </div>
      )}

      {averages && totalMatches > 0 && (
        <section>
          <h2 className="section-title">Averages ({totalMatches} games)</h2>
          <div className="stats-grid">
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_kills}</div>
              <div className="stat-label">Kills</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_deaths}</div>
              <div className="stat-label">Deaths</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_assists}</div>
              <div className="stat-label">Assists</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_gpm}</div>
              <div className="stat-label">GPM</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_xpm}</div>
              <div className="stat-label">XPM</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseInt(averages.avg_hero_damage).toLocaleString()}</div>
              <div className="stat-label">Hero Dmg</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseInt(averages.avg_tower_damage).toLocaleString()}</div>
              <div className="stat-label">Tower Dmg</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{parseInt(averages.avg_hero_healing).toLocaleString()}</div>
              <div className="stat-label">Healing</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_last_hits}</div>
              <div className="stat-label">Last Hits</div>
            </div>
            <div className="stat-card sm">
              <div className="stat-value">{averages.avg_denies}</div>
              <div className="stat-label">Denies</div>
            </div>
          </div>
        </section>
      )}

      {positions.length > 0 && (
        <section>
          <h2 className="section-title">Position Breakdown</h2>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player">Position</th>
                  <th className="col-stat">Games</th>
                  <th className="col-stat">Wins</th>
                  <th className="col-stat">Win%</th>
                  <th className="col-stat">K</th>
                  <th className="col-stat">D</th>
                  <th className="col-stat">A</th>
                  <th className="col-stat">GPM</th>
                </tr>
              </thead>
              <tbody>
                {positions.filter(p => p.position > 0).map((p, i) => {
                  const wr = p.games > 0 ? ((p.wins / p.games) * 100).toFixed(0) : '0';
                  return (
                    <tr key={i}>
                      <td className="col-player">{POS_NAMES[p.position] || `Pos ${p.position}`}</td>
                      <td className="col-stat">{p.games}</td>
                      <td className="col-stat wins">{p.wins}</td>
                      <td className="col-stat" style={{ color: parseInt(wr) >= 50 ? '#4ade80' : '#f87171' }}>{wr}%</td>
                      <td className="col-stat">{p.avg_kills}</td>
                      <td className="col-stat">{p.avg_deaths}</td>
                      <td className="col-stat">{p.avg_assists}</td>
                      <td className="col-stat">{parseInt(p.avg_gpm).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {heroes && heroes.length > 0 && (
        <section>
          <h2 className="section-title">Most Played Heroes</h2>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player">Hero</th>
                  <th className="col-stat">Games</th>
                  <th className="col-stat">Wins</th>
                  <th className="col-stat">Win %</th>
                  <th className="col-stat">K</th>
                  <th className="col-stat">D</th>
                  <th className="col-stat">A</th>
                  <th className="col-stat">GPM</th>
                  <th className="col-stat">HD</th>
                </tr>
              </thead>
              <tbody>
                {heroes.slice(0, 20).map((h, i) => (
                  <tr key={i}>
                    <td className="col-player">{getHeroName(h.hero_id, h.hero_name)}</td>
                    <td className="col-stat">{h.games}</td>
                    <td className="col-stat wins">{h.wins}</td>
                    <td className="col-stat">
                      {h.games > 0 ? ((h.wins / h.games) * 100).toFixed(0) + '%' : '--'}
                    </td>
                    <td className="col-stat">{h.avg_kills}</td>
                    <td className="col-stat">{h.avg_deaths}</td>
                    <td className="col-stat">{h.avg_assists}</td>
                    <td className="col-stat">{parseInt(h.avg_gpm).toLocaleString()}</td>
                    <td className="col-stat">{parseInt(h.avg_hero_damage).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {recentMatches && recentMatches.length > 0 && (
        <section>
          <h2 className="section-title">Recent Matches</h2>
          <div className="scoreboard-wrapper">
            <table className="scoreboard">
              <thead>
                <tr>
                  <th className="col-player">Match</th>
                  <th className="col-hero">Hero</th>
                  <th className="col-stat">K</th>
                  <th className="col-stat">D</th>
                  <th className="col-stat">A</th>
                  <th className="col-stat">GPM</th>
                  <th className="col-stat">Result</th>
                </tr>
              </thead>
              <tbody>
                {recentMatches.map((m, i) => {
                  const won = (m.team === 'radiant' && m.radiant_win) ||
                              (m.team === 'dire' && !m.radiant_win);
                  return (
                    <tr key={i}>
                      <td className="col-player">
                        <Link to={`/match/${m.match_id}`} className="player-link">
                          #{m.match_id}
                        </Link>
                      </td>
                      <td className="col-hero">{getHeroName(m.hero_id, m.hero_name)}</td>
                      <td className="col-stat">{m.kills}</td>
                      <td className="col-stat">{m.deaths}</td>
                      <td className="col-stat">{m.assists}</td>
                      <td className="col-stat">{m.gpm}</td>
                      <td className={`col-stat ${won ? 'wins' : 'losses'}`}>
                        {won ? 'Won' : 'Lost'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
