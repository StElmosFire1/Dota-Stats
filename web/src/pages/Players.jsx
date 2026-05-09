import React, { useState, useEffect } from 'react';
import SortableTh from '../components/SortableTh';
import { Link } from 'react-router-dom';
import { getAllPlayers, setNickname, setPlayerDiscordId, getLivePresences } from '../api';
import { useSeason } from '../context/SeasonContext';
import { useSuperuser } from '../context/SuperuserContext';

const POS_SHORT = { 1: 'Pos 1', 2: 'Pos 2', 3: 'Pos 3', 4: 'Pos 4', 5: 'Pos 5' };

export default function Players() {
  const { seasonId } = useSeason();
  const { isSuperuser, superuserKey, setShowModal } = useSuperuser();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [editingNickKey, setEditingNickKey] = useState(null);
  const [editNickValue, setEditNickValue] = useState('');
  const [editingDiscordKey, setEditingDiscordKey] = useState(null);
  const [editDiscordValue, setEditDiscordValue] = useState('');
  const [saving, setSaving] = useState(false);

  const [sortField, setSortField] = useState('games_played');
  const [sortDir, setSortDir] = useState(-1);
  const [search, setSearch] = useState('');

  // Task #213 — "Live now" tab. Polls /api/presence/live every 30s while
  // the tab is visible, mirroring the per-profile chip's polling shape.
  const [tab, setTab] = useState('all'); // 'all' | 'live'
  const [livePlayers, setLivePlayers] = useState([]);
  const [liveLoading, setLiveLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      getLivePresences()
        .then(d => { if (!cancelled) setLivePlayers(Array.isArray(d?.players) ? d.players : []); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLiveLoading(false); });
    };
    setLiveLoading(true);
    tick();
    const id = setInterval(tick, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const loadPlayers = () => {
    setLoading(true);
    getAllPlayers(seasonId)
      .then(data => setPlayers(data.players || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(loadPlayers, [seasonId]);

  const getPlayerKey = (p) => p.player_key || (p.account_id > 0 ? p.account_id.toString() : p.persona_name);
  const getProfileLink = (p) => {
    if (p.account_id > 0) return `/player/${p.account_id}`;
    return `/player/${encodeURIComponent(p.player_key || p.persona_name)}`;
  };

  const requireSuperuserCheck = () => {
    if (!isSuperuser) { setShowModal(true); return false; }
    return true;
  };

  const startEditNick = (player) => {
    setEditingNickKey(getPlayerKey(player));
    setEditNickValue(player.nickname || '');
    setEditingDiscordKey(null);
  };

  const saveNickname = async (player) => {
    if (player.account_id <= 0) {
      alert('Nickname editing requires a Steam account ID.');
      return;
    }
    if (!requireSuperuserCheck()) return;
    setSaving(true);
    try {
      await setNickname(player.account_id, editNickValue, superuserKey);
      setEditingNickKey(null);
      loadPlayers();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
    setSaving(false);
  };

  const startEditDiscord = (player) => {
    setEditingDiscordKey(getPlayerKey(player));
    setEditDiscordValue(player.discord_id || '');
    setEditingNickKey(null);
  };

  const saveDiscordId = async (player) => {
    if (player.account_id <= 0) {
      alert('Discord ID requires a Steam account ID to be linked.');
      return;
    }
    if (!player.nickname) {
      alert('Set a nickname for this player first before linking a Discord ID.');
      return;
    }
    if (!requireSuperuserCheck()) return;
    setSaving(true);
    try {
      await setPlayerDiscordId(player.account_id, editDiscordValue, superuserKey);
      setEditingDiscordKey(null);
      loadPlayers();
    } catch (err) {
      alert('Failed: ' + err.message);
    }
    setSaving(false);
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => -d);
    else { setSortField(field); setSortDir(-1); }
  };

  const si = (field) => sortField === field ? (sortDir > 0 ? ' ▲' : ' ▼') : '';

  const sorted = [...players].sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (sortField === 'win_rate') {
      va = a.games_played > 0 ? parseInt(a.wins) / parseInt(a.games_played) : 0;
      vb = b.games_played > 0 ? parseInt(b.wins) / parseInt(b.games_played) : 0;
    }
    if (sortField === 'persona_name' || sortField === 'nickname') {
      return String(va || '').localeCompare(String(vb || '')) * sortDir;
    }
    return (parseFloat(va || 0) - parseFloat(vb || 0)) * sortDir;
  });

  const inlineInput = (value, onChange, onSave, onCancel, placeholder) => (
    <div style={{ display: 'flex', gap: '0.3rem' }}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder}
        style={{
          background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #555',
          padding: '0.2rem 0.4rem', borderRadius: '3px', fontSize: '0.85rem', width: '130px',
        }}
        autoFocus
      />
      <button
        onClick={onSave}
        disabled={saving}
        style={{ background: '#4ade80', color: '#000', border: 'none', padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8rem' }}
      >Save</button>
      <button
        onClick={onCancel}
        aria-label="Cancel edit"
        style={{ background: 'transparent', color: '#888', border: '1px solid #444', padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.8rem' }}
      >✕</button>
    </div>
  );

  const editBtn = (onClick) => (
    <button
      onClick={onClick}
      style={{ background: 'transparent', color: '#666', border: '1px solid #333', padding: '0.1rem 0.35rem', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem' }}
    >Edit</button>
  );

  const filtered = search.trim()
    ? sorted.filter(p => {
        const s = search.toLowerCase();
        const name = (p.nickname || p.display_name || p.persona_name || '').toLowerCase();
        return name.includes(s);
      })
    : sorted;

  if (loading) return <div className="loading">Loading players...</div>;

  const liveCount = livePlayers.length;
  const tabBtnStyle = (active) => ({
    background: active ? 'var(--accent, #c5a975)' : 'transparent',
    color: active ? '#0d1424' : 'var(--text-primary, #e0e0e0)',
    border: '1px solid var(--border, #333)',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <h1 className="page-title">Players</h1>
      <div role="tablist" aria-label="Players view" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          onClick={() => setTab('all')}
          style={tabBtnStyle(tab === 'all')}
        >All players</button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'live'}
          onClick={() => setTab('live')}
          style={tabBtnStyle(tab === 'live')}
        >
          <span aria-hidden="true" style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: liveCount > 0 ? '#f59e0b' : '#666', marginRight: 6,
            boxShadow: liveCount > 0 ? '0 0 6px #f59e0b' : 'none',
            verticalAlign: 'middle',
          }} />
          Live now{liveCount > 0 ? ` (${liveCount})` : ''}
        </button>
      </div>
      {tab === 'live' ? (
        <LiveNowList loading={liveLoading} players={livePlayers} />
      ) : (
      <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <span style={{ color: '#888' }}>{players.length} players with recorded matches</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          style={{
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 12px', fontSize: 13, minWidth: 180,
          }}
        />
        {search && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Showing {filtered.length} of {players.length}
          </span>
        )}
      </div>
      {isSuperuser && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: '1rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
          💡 To link a Discord ID, set a nickname first, then click Edit in the Discord ID column and paste the player's Discord user ID (right-click their name in Discord → Copy User ID, with Developer Mode on).
        </p>
      )}
      <div className="scoreboard-wrapper">
        <table className="scoreboard">
          <thead>
            <tr>
              <SortableTh className="col-player" active={sortField === 'persona_name'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('persona_name')}>Player{si('persona_name')}</SortableTh>
              <SortableTh className="col-stat" active={sortField === 'games_played'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('games_played')}>Games{si('games_played')}</SortableTh>
              <SortableTh className="col-stat" active={sortField === 'wins'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('wins')}>W{si('wins')}</SortableTh>
              <SortableTh className="col-stat" active={sortField === 'win_rate'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('win_rate')}>Win%{si('win_rate')}</SortableTh>
              <SortableTh className="col-stat" active={sortField === 'avg_kills'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_kills')}>K{si('avg_kills')}</SortableTh>
              <SortableTh className="col-stat" active={sortField === 'avg_deaths'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_deaths')}>D{si('avg_deaths')}</SortableTh>
              <SortableTh className="col-stat" active={sortField === 'avg_assists'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_assists')}>A{si('avg_assists')}</SortableTh>
              <SortableTh className="col-stat" title="Kill Involvement" active={sortField === 'avg_kill_involvement'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('avg_kill_involvement')}>KI%{si('avg_kill_involvement')}</SortableTh>
              <SortableTh className="col-stat" active={sortField === 'most_played_position'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('most_played_position')}>Most Played{si('most_played_position')}</SortableTh>
              <SortableTh className="col-stat" active={sortField === 'best_position_score'} direction={sortDir > 0 ? 'asc' : 'desc'} onSort={() => handleSort('best_position_score')}>Best Pos{si('best_position_score')}</SortableTh>
              <th className="col-stat">Nickname</th>
              <th className="col-stat" title="Discord User ID — used for bot DMs">Discord ID</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, idx) => {
              const key = getPlayerKey(p);
              const games = parseInt(p.games_played) || 0;
              const wins = parseInt(p.wins) || 0;
              const winRate = games > 0 ? ((wins / games) * 100).toFixed(0) : '0';
              const originalName = p.persona_name || `Player ${p.account_id}`;
              return (
                <tr key={key || idx}>
                  <td className="col-player">
                    <Link to={getProfileLink(p)} className="player-link">{originalName}</Link>
                  </td>
                  <td className="col-stat">{games}</td>
                  <td className="col-stat" style={{ color: '#4ade80' }}>{wins}</td>
                  <td className="col-stat" style={{ color: parseInt(winRate) >= 50 ? '#4ade80' : '#f87171' }}>{winRate}%</td>
                  <td className="col-stat">{p.avg_kills}</td>
                  <td className="col-stat">{p.avg_deaths}</td>
                  <td className="col-stat">{p.avg_assists}</td>
                  <td className="col-stat">{p.avg_kill_involvement}%</td>
                  <td className="col-stat">{p.most_played_position ? POS_SHORT[p.most_played_position] || '-' : '-'}</td>
                  <td className="col-stat">
                    {p.best_position ? (
                      <span title={`${POS_SHORT[p.best_position]} — Rating: ${p.best_position_score}/10`}>
                        {POS_SHORT[p.best_position]}{' '}
                        <span style={{ color: p.best_position_score >= 7 ? '#4ade80' : p.best_position_score >= 4 ? '#facc15' : '#f87171', fontSize: '0.8rem' }}>
                          ({p.best_position_score})
                        </span>
                      </span>
                    ) : '-'}
                  </td>

                  <td className="col-stat">
                    {editingNickKey === key
                      ? inlineInput(editNickValue, setEditNickValue, () => saveNickname(p), () => setEditingNickKey(null), 'Nickname…')
                      : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ color: p.nickname ? '#e0e0e0' : '#555' }}>{p.nickname || '--'}</span>
                          {isSuperuser && editBtn(() => startEditNick(p))}
                        </div>
                      )
                    }
                  </td>

                  <td className="col-stat">
                    {editingDiscordKey === key
                      ? inlineInput(editDiscordValue, setEditDiscordValue, () => saveDiscordId(p), () => setEditingDiscordKey(null), 'Discord User ID…')
                      : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ color: p.discord_id ? '#7289da' : '#555', fontFamily: 'monospace', fontSize: 12 }} title={p.discord_id || 'Not set'}>
                            {p.discord_id ? `${p.discord_id.slice(0, 8)}…` : '--'}
                          </span>
                          {isSuperuser && editBtn(() => startEditDiscord(p))}
                        </div>
                      )
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
}

// Task #213 — "Live now" tab body. Rendered card-style so it reads like a
// spectator hook rather than a stats grid. Mirrors the chip styling used on
// the v3 magazine cover (MagazineCover.jsx) so the colours stay consistent.
// Only the four "actively doing something" statuses are part of the Live now
// rollup — plain Discord-online is intentionally excluded.
const LIVE_LABELS = {
  in_game:  { label: 'In game',  color: '#f59e0b', bg: 'rgba(245,158,11,0.18)' },
  in_lobby: { label: 'In lobby', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  in_queue: { label: 'In queue', color: '#a78bfa', bg: 'rgba(167,139,250,0.18)' },
  in_voice: { label: 'In voice', color: '#34d399', bg: 'rgba(52,211,153,0.18)' },
};
function LiveNowList({ loading, players }) {
  if (loading && players.length === 0) {
    return <div className="loading">Loading live presence…</div>;
  }
  if (!players || players.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '24px 16px', color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        Nobody's in a Dota game, lobby, or queue right now. Check back soon.
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
      {players.map(p => {
        const cfg = LIVE_LABELS[p.status];
        if (!cfg) return null;
        let label = cfg.label;
        if (p.status === 'in_game' && p.hero) label = `In game · ${p.hero}`;
        const profileUrl = p.account_id ? `/player/${p.account_id}` : null;
        const inner = (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${cfg.color}`, borderRadius: 6,
            padding: '10px 12px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                color: 'var(--text-primary)', fontWeight: 600, fontSize: 14,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.display_name || `Player ${p.account_id}`}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{label}</div>
            </div>
            <span style={{
              background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}55`,
              borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>{cfg.label}</span>
          </div>
        );
        return profileUrl ? (
          <Link
            key={p.account_id}
            to={profileUrl}
            style={{ textDecoration: 'none' }}
            title={p.updated_at ? `Updated ${new Date(p.updated_at).toLocaleTimeString()}` : label}
          >
            {inner}
          </Link>
        ) : (
          <div key={`${p.display_name}-${p.status}`}>{inner}</div>
        );
      })}
    </div>
  );
}
