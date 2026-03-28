import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getHeroStats, getLeaderboard, getPlayerHeroes, getDraftSuggestions } from '../api';
import { getHeroName, getHeroImageUrl, ALL_HERO_IDS } from '../heroNames';
import { useSeason } from '../context/SeasonContext';

function WinRateBar({ wr }) {
  if (wr === null || isNaN(wr)) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const color = wr >= 60 ? '#4ade80' : wr >= 50 ? '#86efac' : wr >= 40 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--bg)', borderRadius: 3, minWidth: 60 }}>
        <div style={{ width: `${Math.min(100, wr)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: 13, minWidth: 36, textAlign: 'right' }}>
        {wr.toFixed(1)}%
      </span>
    </div>
  );
}

function HeroChip({ heroId, onRemove, team }) {
  const img = getHeroImageUrl(heroId);
  const name = getHeroName(heroId) || `Hero ${heroId}`;
  const bg = team === 'ally' ? 'rgba(76,175,80,0.2)' : team === 'enemy' ? 'rgba(244,67,54,0.2)' : 'rgba(100,100,100,0.2)';
  const border = team === 'ally' ? 'var(--accent-green)' : team === 'enemy' ? 'var(--accent-red)' : '#555';
  return (
    <div
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: '3px 8px 3px 4px', margin: '2px', cursor: 'pointer', fontSize: 12 }}
      onClick={() => onRemove(heroId)}
      title={`Remove ${name}`}
    >
      {img && <img src={img} alt="" style={{ width: 20, height: 20, borderRadius: 3 }} />}
      <span>{name}</span>
      <span style={{ color: '#888', marginLeft: 2 }}>✕</span>
    </div>
  );
}

function StatsTab({ seasonId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subtab, setSubtab] = useState('picks');
  const [sortKey, setSortKey] = useState('games');

  useEffect(() => {
    setLoading(true);
    getHeroStats(seasonId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [seasonId]);

  if (loading) return <div className="loading">Loading draft stats…</div>;
  if (!data || !data.heroes?.length) return (
    <div className="empty-state">
      <p>No pick data available yet. Play more matches!</p>
    </div>
  );

  const enriched = data.heroes.map(h => ({
    ...h,
    pick_count: parseInt(h.games) || 0,
    ban_count: parseInt(h.bans) || 0,
    wins: parseInt(h.wins) || 0,
    pick_winrate: parseInt(h.games) > 0 ? (parseInt(h.wins) / parseInt(h.games)) * 100 : null,
    pick_rate: data.totalMatches > 0 ? (parseInt(h.games) / data.totalMatches) * 100 : 0,
    ban_rate: data.draftMatches > 0 ? (parseInt(h.bans) / data.draftMatches) * 100 : 0,
    contested: (parseInt(h.games) || 0) + (parseInt(h.bans) || 0),
    contest_rate: data.draftMatches > 0 ? (((parseInt(h.games) || 0) + (parseInt(h.bans) || 0)) / data.draftMatches) * 100 : 0,
  }));

  const hasBanData = data.draftMatches > 0;

  const picks = [...enriched].sort((a, b) => {
    if (sortKey === 'pick_winrate') return (b.pick_winrate ?? -1) - (a.pick_winrate ?? -1);
    if (sortKey === 'pick_rate') return b.pick_rate - a.pick_rate;
    return b[sortKey === 'games' ? 'pick_count' : sortKey] - a[sortKey === 'games' ? 'pick_count' : sortKey];
  }).filter(h => h.pick_count > 0);

  const bans = hasBanData ? [...enriched].sort((a, b) => b.ban_count - a.ban_count).filter(h => h.ban_count > 0) : [];
  const contested = hasBanData ? [...enriched].sort((a, b) => b.contested - a.contested).filter(h => h.contested > 0) : [];

  const btnStyle = (active) => ({
    padding: '6px 18px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
    border: '1px solid',
    borderColor: active ? '#3b82f6' : 'var(--border)',
    background: active ? '#1d4ed8' : 'var(--bg-card)',
    color: active ? '#fff' : 'var(--text-primary)',
  });

  const sortBtnStyle = (active) => ({
    padding: '4px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
    border: '1px solid',
    borderColor: active ? '#7c3aed' : 'var(--border)',
    background: active ? '#4c1d95' : 'var(--bg-card)',
    color: active ? '#c4b5fd' : 'var(--text-muted)',
  });

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13 }}>
        Pick statistics across {data.totalMatches} tracked matches
        {hasBanData ? ` · ${data.draftMatches} with Captain's Mode draft data` : ' · No ban data (requires Captain\'s Mode replays)'}
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['picks', ...(hasBanData ? ['bans', 'contested'] : [])].map(t => (
          <button key={t} onClick={() => setSubtab(t)} style={btnStyle(subtab === t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {subtab === 'picks' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { key: 'games', label: 'Picks' },
              { key: 'pick_rate', label: 'Pick%' },
              { key: 'pick_winrate', label: 'Win Rate' },
              { key: 'wins', label: 'Wins' },
            ].map(s => (
              <button key={s.key} onClick={() => setSortKey(s.key)} style={sortBtnStyle(sortKey === s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scoreboard-wrapper">
        {subtab === 'picks' && (
          <table className="scoreboard">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th className="col-player">Hero</th>
                <th className="col-stat">Picks</th>
                <th className="col-stat">Pick%</th>
                <th className="col-stat">Wins</th>
                <th className="col-stat" style={{ minWidth: 140 }}>Win Rate</th>
                {hasBanData && <><th className="col-stat">Bans</th><th className="col-stat">Ban%</th></>}
              </tr>
            </thead>
            <tbody>
              {picks.map((h, i) => (
                <tr key={h.hero_id || h.hero_name || i}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td className="col-player">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getHeroImageUrl(h.hero_id) && <img src={getHeroImageUrl(h.hero_id)} alt="" style={{ width: 28, height: 16, borderRadius: 2 }} />}
                      <span>{getHeroName(h.hero_id, h.hero_name)}</span>
                    </div>
                  </td>
                  <td className="col-stat" style={{ fontWeight: 600 }}>{h.pick_count}</td>
                  <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.pick_rate.toFixed(0)}%</td>
                  <td className="col-stat wins">{h.wins}</td>
                  <td className="col-stat"><WinRateBar wr={h.pick_winrate} /></td>
                  {hasBanData && (
                    <>
                      <td className="col-stat" style={{ color: '#f87171' }}>{h.ban_count || '—'}</td>
                      <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.ban_count > 0 ? `${h.ban_rate.toFixed(0)}%` : '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {subtab === 'bans' && hasBanData && (
          <table className="scoreboard">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th className="col-player">Hero</th>
                <th className="col-stat">Bans</th>
                <th className="col-stat">Ban%</th>
                <th className="col-stat">Picks</th>
                <th className="col-stat" style={{ minWidth: 140 }}>Win Rate (when picked)</th>
              </tr>
            </thead>
            <tbody>
              {bans.map((h, i) => (
                <tr key={h.hero_id || i}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td className="col-player">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getHeroImageUrl(h.hero_id) && <img src={getHeroImageUrl(h.hero_id)} alt="" style={{ width: 28, height: 16, borderRadius: 2 }} />}
                      <span>{getHeroName(h.hero_id, h.hero_name)}</span>
                    </div>
                  </td>
                  <td className="col-stat" style={{ color: '#f87171', fontWeight: 600 }}>{h.ban_count}</td>
                  <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.ban_rate.toFixed(0)}%</td>
                  <td className="col-stat">{h.pick_count}</td>
                  <td className="col-stat">
                    {h.pick_count > 0 ? <WinRateBar wr={h.pick_winrate} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {subtab === 'contested' && hasBanData && (
          <table className="scoreboard">
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th className="col-player">Hero</th>
                <th className="col-stat">Contested</th>
                <th className="col-stat">Picks</th>
                <th className="col-stat">Bans</th>
                <th className="col-stat">Contest%</th>
                <th className="col-stat" style={{ minWidth: 140 }}>Win Rate (when picked)</th>
              </tr>
            </thead>
            <tbody>
              {contested.map((h, i) => (
                <tr key={h.hero_id || i}>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                  <td className="col-player">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {getHeroImageUrl(h.hero_id) && <img src={getHeroImageUrl(h.hero_id)} alt="" style={{ width: 28, height: 16, borderRadius: 2 }} />}
                      <span>{getHeroName(h.hero_id, h.hero_name)}</span>
                    </div>
                  </td>
                  <td className="col-stat" style={{ fontWeight: 700, color: 'var(--accent-blue)' }}>{h.contested}</td>
                  <td className="col-stat wins">{h.pick_count}</td>
                  <td className="col-stat" style={{ color: '#f87171' }}>{h.ban_count}</td>
                  <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {data.draftMatches > 0 ? `${Math.round(h.contest_rate)}%` : '—'}
                  </td>
                  <td className="col-stat">
                    {h.pick_count > 0 ? <WinRateBar wr={h.pick_winrate} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PlayerPoolPanel({ label, color, players, allPlayers, heroPool, pickedHeroIds, onAddPlayer, onRemovePlayer, onHeroClick }) {
  const [search, setSearch] = useState('');
  const filtered = search.length >= 1
    ? allPlayers.filter(p => {
        const name = (p.nickname || p.display_name || '').toLowerCase();
        return name.includes(search.toLowerCase()) && !players.find(x => x.account_id === p.account_id);
      }).slice(0, 8)
    : [];

  return (
    <div style={{ flex: 1, background: 'var(--bg-card)', border: `1px solid ${color}`, borderRadius: 10, padding: 14 }}>
      <div style={{ fontWeight: 700, color, marginBottom: 10, fontSize: 14 }}>{label}</div>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search player…"
          style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, boxSizing: 'border-box' }}
        />
        {filtered.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
            {filtered.map(p => (
              <div
                key={p.account_id}
                onClick={() => { onAddPlayer(p); setSearch(''); }}
                style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 13 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                {p.nickname || p.display_name}
              </div>
            ))}
          </div>
        )}
      </div>
      {players.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>No players selected</div>
      )}
      {players.map(p => {
        const name = p.nickname || p.display_name || `#${p.account_id}`;
        const heroes = heroPool[p.account_id] || [];
        return (
          <div key={p.account_id} style={{ marginBottom: 10, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
              <button onClick={() => onRemovePlayer(p.account_id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {heroes.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Loading hero pool…</span>}
              {heroes.slice(0, 8).map(h => {
                const img = getHeroImageUrl(h.hero_id);
                const heroName = getHeroName(h.hero_id, h.hero_name) || `#${h.hero_id}`;
                const alreadyAdded = pickedHeroIds.has(h.hero_id);
                return (
                  <button
                    key={h.hero_id}
                    onClick={() => !alreadyAdded && onHeroClick(h.hero_id)}
                    disabled={alreadyAdded}
                    title={`${heroName} — ${h.games}g ${h.wins}W`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      background: alreadyAdded ? 'var(--bg)' : `${color}22`,
                      border: `1px solid ${alreadyAdded ? '#555' : color}`,
                      borderRadius: 12, padding: '2px 6px 2px 3px',
                      fontSize: 11, cursor: alreadyAdded ? 'default' : 'pointer',
                      opacity: alreadyAdded ? 0.4 : 1,
                    }}
                  >
                    {img && <img src={img} alt="" style={{ width: 18, height: 18, borderRadius: 2 }} />}
                    <span>{heroName}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 2 }}>{h.games}g</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssistantTab({ seasonId }) {
  const [allPlayers, setAllPlayers] = useState([]);
  const [myTeamPlayers, setMyTeamPlayers] = useState([]);
  const [enemyTeamPlayers, setEnemyTeamPlayers] = useState([]);
  const [heroPool, setHeroPool] = useState({});
  const [showPlayerPanel, setShowPlayerPanel] = useState(true);

  const [search, setSearch] = useState('');
  const [allies, setAllies] = useState([]);
  const [enemies, setEnemies] = useState([]);
  const [banned, setBanned] = useState([]);
  const [position, setPosition] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [addMode, setAddMode] = useState('ally');

  useEffect(() => {
    getLeaderboard(100).then(d => setAllPlayers(d.leaderboard || [])).catch(() => {});
  }, []);

  const loadHeroPool = useCallback(async (accountId) => {
    if (!accountId || heroPool[accountId]) return;
    try {
      const data = await getPlayerHeroes(accountId);
      setHeroPool(prev => ({ ...prev, [accountId]: data.heroes || [] }));
    } catch {}
  }, [heroPool]);

  const addMyTeamPlayer = (p) => {
    setMyTeamPlayers(prev => [...prev, p]);
    if (p.account_id) loadHeroPool(p.account_id);
  };

  const addEnemyTeamPlayer = (p) => {
    setEnemyTeamPlayers(prev => [...prev, p]);
    if (p.account_id) loadHeroPool(p.account_id);
  };

  const allPicked = new Set([...allies, ...enemies, ...banned]);

  const filteredHeroes = search.length >= 2
    ? (ALL_HERO_IDS || []).filter(id => {
        const name = (getHeroName(id) || '').toLowerCase();
        return name.includes(search.toLowerCase()) && !allPicked.has(id);
      }).slice(0, 20)
    : [];

  const addHero = (id) => {
    if (allPicked.has(id)) return;
    if (addMode === 'ally') setAllies(a => [...a, id]);
    else if (addMode === 'enemy') setEnemies(e => [...e, id]);
    else setBanned(b => [...b, id]);
    setSearch('');
  };

  const getSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getDraftSuggestions({ allies, enemies, banned, position, seasonId });
      setSuggestions(d.suggestions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [allies, enemies, banned, position, seasonId]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Select players to see their hero pools, or add heroes manually below.
        </div>
        <button
          onClick={() => setShowPlayerPanel(p => !p)}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          {showPlayerPanel ? 'Hide' : 'Show'} Player Pools
        </button>
      </div>

      {showPlayerPanel && (
        <div style={{ display: 'flex', gap: 14, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <PlayerPoolPanel
            label="My Team"
            color="var(--accent-green)"
            players={myTeamPlayers}
            allPlayers={allPlayers}
            heroPool={heroPool}
            pickedHeroIds={allPicked}
            onAddPlayer={addMyTeamPlayer}
            onRemovePlayer={id => setMyTeamPlayers(p => p.filter(x => x.account_id !== id))}
            onHeroClick={id => setAllies(a => allPicked.has(id) ? a : [...a, id])}
          />
          <PlayerPoolPanel
            label="Enemy Team"
            color="var(--accent-red)"
            players={enemyTeamPlayers}
            allPlayers={allPlayers}
            heroPool={heroPool}
            pickedHeroIds={allPicked}
            onAddPlayer={addEnemyTeamPlayer}
            onRemovePlayer={id => setEnemyTeamPlayers(p => p.filter(x => x.account_id !== id))}
            onHeroClick={id => setEnemies(e => allPicked.has(id) ? e : [...e, id])}
          />
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div style={{ fontWeight: 600, color: 'var(--accent-green)', marginBottom: 8 }}>Your Team (Allies)</div>
          <div style={{ minHeight: 36 }}>
            {allies.map(id => <HeroChip key={id} heroId={id} team="ally" onRemove={id => setAllies(a => a.filter(x => x !== id))} />)}
            {allies.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No heroes yet — add from player pools above or search below</span>}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontWeight: 600, color: 'var(--accent-red)', marginBottom: 8 }}>Enemy Team</div>
          <div style={{ minHeight: 36 }}>
            {enemies.map(id => <HeroChip key={id} heroId={id} team="enemy" onRemove={id => setEnemies(e => e.filter(x => x !== id))} />)}
            {enemies.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No heroes yet</span>}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Banned Heroes</div>
          <div style={{ minHeight: 36 }}>
            {banned.map(id => <HeroChip key={id} heroId={id} team="ban" onRemove={id => setBanned(b => b.filter(x => x !== id))} />)}
            {banned.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No heroes yet</span>}
          </div>
        </div>
      </div>

      <div className="stat-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Add as</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['ally', 'enemy', 'ban'].map(m => (
                <button key={m} className={`btn btn-small${addMode === m ? ' btn-primary' : ''}`} onClick={() => setAddMode(m)}>
                  {m === 'ally' ? '+ Ally' : m === 'enemy' ? '+ Enemy' : '+ Ban'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Search hero manually</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type hero name…"
              style={{ width: '100%', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Suggest for position</label>
            <select
              value={position || ''}
              onChange={e => setPosition(e.target.value ? parseInt(e.target.value) : null)}
              style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px' }}
            >
              <option value="">Any position</option>
              {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>Pos {p}</option>)}
            </select>
          </div>
        </div>

        {filteredHeroes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filteredHeroes.map(id => {
              const img = getHeroImageUrl(id);
              return (
                <button key={id} className="btn btn-small" onClick={() => addHero(id)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {img && <img src={img} alt="" style={{ width: 18, height: 18, borderRadius: 2 }} />}
                  {getHeroName(id) || `#${id}`}
                </button>
              );
            })}
          </div>
        )}
        {search.length >= 2 && filteredHeroes.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No matching heroes found</div>
        )}
      </div>

      <button className="btn btn-primary" onClick={getSuggestions} disabled={loading}>
        {loading ? 'Analyzing…' : '🤖 Get Suggestions'}
      </button>
      {(allies.length > 0 || enemies.length > 0) && (
        <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          {allies.length > 0 && `${allies.length} ally hero${allies.length > 1 ? 'es' : ''}`}
          {allies.length > 0 && enemies.length > 0 && ' · '}
          {enemies.length > 0 && `${enemies.length} enemy hero${enemies.length > 1 ? 'es' : ''}`}
        </span>
      )}

      {error && <div className="error-state" style={{ marginTop: '1rem' }}>{error}</div>}

      {suggestions && (
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
            Top {suggestions.length} Suggestions {position ? `(Pos ${position})` : ''}
          </h2>
          {suggestions.length === 0 ? (
            <div className="empty-state"><p>Not enough data for suggestions. Play more matches!</p></div>
          ) : (
            <div className="scoreboard-wrapper">
              <table className="scoreboard">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Hero</th>
                    <th title="Overall win rate in inhouse data">Win Rate</th>
                    <th title="Win rate when playing with your allies">With Allies</th>
                    <th title="Win rate when facing the enemy heroes">vs Enemies</th>
                    <th title="Combined recommendation score">Score</th>
                    <th title="Sample size">Games</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s, i) => {
                    const img = getHeroImageUrl(s.hero_id);
                    const name = getHeroName(s.hero_id) || `Hero ${s.hero_id}`;
                    const pct = v => (v * 100).toFixed(1) + '%';
                    const scoreColor = s.score > 0.55 ? 'var(--accent-green)' : s.score < 0.45 ? 'var(--accent-red)' : 'var(--text-primary)';
                    return (
                      <tr key={s.hero_id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {img && <img src={img} alt="" style={{ width: 28, height: 28, borderRadius: 4 }} />}
                            <span style={{ fontWeight: 500 }}>{name}</span>
                          </div>
                        </td>
                        <td>{pct(s.base_wr)}</td>
                        <td>{allies.length > 0 ? pct(s.synergy_wr) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td>{enemies.length > 0 ? pct(s.counter_wr) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ fontWeight: 700, color: scoreColor }}>{(s.score * 100).toFixed(1)}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.games}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Draft() {
  const { seasonId } = useSeason();
  const [tab, setTab] = useState('assistant');

  const tabStyle = (active) => ({
    padding: '8px 18px', cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 400,
    background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
    color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
    borderRadius: 0, marginBottom: -1,
  });

  return (
    <div>
      <h1 className="page-title">Draft</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        <button onClick={() => setTab('assistant')} style={tabStyle(tab === 'assistant')}>🤖 Draft Assistant</button>
        <button onClick={() => setTab('stats')} style={tabStyle(tab === 'stats')}>📊 Pick &amp; Ban Stats</button>
      </div>
      {tab === 'assistant' && <AssistantTab seasonId={seasonId} />}
      {tab === 'stats' && <StatsTab seasonId={seasonId} />}
    </div>
  );
}
