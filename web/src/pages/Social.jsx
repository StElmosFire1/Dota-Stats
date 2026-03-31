import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSocialGraph, getPlayerConnections, getAllPlayers } from '../api';
import { useSeason } from '../context/SeasonContext';

function WinRateBar({ wins, games }) {
  const wr = games > 0 ? (wins / games) * 100 : 0;
  const color = wr >= 60 ? 'var(--accent-green, #4caf50)' : wr >= 50 ? '#81c784' : wr >= 40 ? 'var(--text-muted)' : 'var(--accent-red, #f44336)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 60, background: '#333', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${wr}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 600, minWidth: 38 }}>{wr.toFixed(0)}%</span>
    </div>
  );
}

function TopDuosTab() {
  const { seasonId } = useSeason();
  const [duos, setDuos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [minGames, setMinGames] = useState(3);
  const [sortField, setSortField] = useState('wr');
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => {
    setLoading(true);
    getSocialGraph(seasonId, minGames)
      .then(d => setDuos(d.duos || []))
      .catch(() => setDuos([]))
      .finally(() => setLoading(false));
  }, [seasonId, minGames]);

  const handleSort = (f) => {
    if (sortField === f) setSortDir(d => -d);
    else { setSortField(f); setSortDir(-1); }
  };
  const si = (f) => sortField === f ? (sortDir > 0 ? ' ▲' : ' ▼') : '';

  const sorted = [...duos].sort((a, b) => {
    let av, bv;
    if (sortField === 'wr') {
      av = parseInt(a.games) > 0 ? parseInt(a.wins) / parseInt(a.games) : -1;
      bv = parseInt(b.games) > 0 ? parseInt(b.wins) / parseInt(b.games) : -1;
    } else {
      av = parseFloat(a[sortField]) ?? -1;
      bv = parseFloat(b[sortField]) ?? -1;
    }
    return (av - bv) * sortDir;
  });

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Best teammate pairings by win rate — how much better (or worse) two players do when on the same team.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <label style={{ color: 'var(--text-muted)', fontSize: 13 }}>Min games together:</label>
        {[2, 3, 5, 10].map(n => (
          <button
            key={n}
            onClick={() => setMinGames(n)}
            style={{
              padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              background: minGames === n ? 'var(--accent-blue)' : 'var(--bg-secondary)',
              color: minGames === n ? '#fff' : 'var(--text-primary)',
              border: `1px solid ${minGames === n ? 'var(--accent-blue)' : 'var(--border)'}`,
            }}
          >{n}+</button>
        ))}
      </div>
      {loading && <div className="loading">Loading duo data…</div>}
      {!loading && duos.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>No duo data found. Lower the minimum games filter or add more matches.</p>
      )}
      {!loading && sorted.length > 0 && (
        <div className="scoreboard-wrapper">
          <table className="scoreboard">
            <thead>
              <tr>
                <th className="col-rank">#</th>
                <th className="col-player">Player 1</th>
                <th className="col-player">Player 2</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('games')}>Games{si('games')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('wins')}>Wins{si('wins')}</th>
                <th className="col-stat" style={{ cursor: 'pointer' }} onClick={() => handleSort('wr')}>Win %{si('wr')}</th>
                <th className="col-stat">Form</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((duo, i) => {
                const games = parseInt(duo.games) || 0;
                const wins = parseInt(duo.wins) || 0;
                return (
                  <tr key={`${duo.p1_id}-${duo.p2_id}`} className={i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : ''}>
                    <td className="col-rank">{i + 1}</td>
                    <td className="col-player">
                      <Link to={`/player/${duo.p1_id}`} className="player-link">{duo.p1_name || duo.p1_id}</Link>
                    </td>
                    <td className="col-player">
                      <Link to={`/player/${duo.p2_id}`} className="player-link">{duo.p2_name || duo.p2_id}</Link>
                    </td>
                    <td className="col-stat">{games}</td>
                    <td className="col-stat wins">{wins}</td>
                    <td className="col-stat">{games > 0 ? ((wins / games) * 100).toFixed(1) : '—'}%</td>
                    <td className="col-stat"><WinRateBar wins={wins} games={games} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlayerConnectionsTab() {
  const { seasonId } = useSeason();
  const [players, setPlayers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [connections, setConnections] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setPlayersLoading(true);
    getAllPlayers(seasonId)
      .then(d => setPlayers(d.players || []))
      .catch(() => setPlayers([]))
      .finally(() => setPlayersLoading(false));
  }, [seasonId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    getPlayerConnections(selectedId, seasonId)
      .then(d => setConnections(d))
      .catch(() => setConnections(null))
      .finally(() => setLoading(false));
  }, [selectedId, seasonId]);

  const filteredPlayers = players.filter(p =>
    !search || (p.nickname || p.persona_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const renderTable = (rows, type) => {
    if (!rows || rows.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data.</p>;
    const idField = type === 'teammates' ? 'partner_id' : 'opp_id';
    const nameField = type === 'teammates' ? 'partner_name' : 'opp_name';
    return (
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <th className="col-player">{type === 'teammates' ? 'Teammate' : 'Opponent'}</th>
              <th className="col-stat">Games</th>
              <th className="col-stat">{type === 'teammates' ? 'Wins Together' : 'Your Wins'}</th>
              <th className="col-stat">Win %</th>
              <th className="col-stat">Bar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const games = parseInt(r.games) || 0;
              const wins = parseInt(r.wins) || 0;
              return (
                <tr key={r[idField]}>
                  <td className="col-player">
                    {r[idField] ? <Link to={`/player/${r[idField]}`} className="player-link">{r[nameField] || r[idField]}</Link> : <span>{r[nameField]}</span>}
                  </td>
                  <td className="col-stat">{games}</td>
                  <td className="col-stat wins">{wins}</td>
                  <td className="col-stat" style={{ color: games > 0 && (wins / games) >= 0.5 ? 'var(--accent-green, #4caf50)' : 'var(--accent-red, #f44336)' }}>
                    {games > 0 ? ((wins / games) * 100).toFixed(1) : '—'}%
                  </td>
                  <td className="col-stat"><WinRateBar wins={wins} games={games} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Select a player to see who they most often team up with and who they most often face.
      </p>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search player…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, width: 200 }}
        />
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14, minWidth: 200 }}
        >
          <option value="">— Select a player —</option>
          {filteredPlayers.map(p => (
            <option key={p.account_id} value={p.account_id}>{p.nickname || p.persona_name || p.account_id}</option>
          ))}
        </select>
      </div>
      {loading && <div className="loading">Loading connections…</div>}
      {!loading && connections && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 32 }}>
          <div>
            <h3 style={{ color: 'var(--accent-green, #4caf50)', marginBottom: 12 }}>🤝 Top Teammates</h3>
            {renderTable(connections.teammates, 'teammates')}
          </div>
          <div>
            <h3 style={{ color: 'var(--accent-red, #f44336)', marginBottom: 12 }}>⚔️ Most Faced Opponents</h3>
            {renderTable(connections.opponents, 'opponents')}
          </div>
        </div>
      )}
      {!loading && !connections && selectedId && (
        <p style={{ color: 'var(--text-muted)' }}>No connection data found for this player.</p>
      )}
    </div>
  );
}

export default function Social() {
  const [tab, setTab] = useState('duos');

  const TABS = [
    { key: 'duos', label: '👥 Top Duos' },
    { key: 'connections', label: '🔗 Player Connections' },
  ];

  return (
    <div>
      <h1 className="page-title">Player Network</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: tab === t.key ? 700 : 400,
              background: 'none', border: 'none', borderBottom: tab === t.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: tab === t.key ? 'var(--accent-blue)' : 'var(--text-muted)',
              borderRadius: 0, marginBottom: -1,
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'duos' && <TopDuosTab />}
      {tab === 'connections' && <PlayerConnectionsTab />}
    </div>
  );
}
