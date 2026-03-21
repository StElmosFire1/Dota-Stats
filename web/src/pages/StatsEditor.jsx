import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMatch } from '../api';
import { useSuperuser } from '../context/SuperuserContext';
import { ALL_HEROES, getHeroName, getHeroImageUrl } from '../heroNames';

const BASE = '/api';

async function apiUpdateMatchDetails(matchId, body, key) {
  const res = await fetch(`${BASE}/matches/${matchId}/match-details`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': key },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

async function apiUpdatePlayerStats(matchId, players, key) {
  const res = await fetch(`${BASE}/matches/${matchId}/player-stats`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': key },
    body: JSON.stringify({ players }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

async function apiUpdateMatchDraft(matchId, entries, key) {
  const res = await fetch(`${BASE}/matches/${matchId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': key },
    body: JSON.stringify({ entries }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed');
  return data;
}

const CM_PATTERN = [0,1,0,1,0,1,0,0,1,1,0,1,1,0,0,1,1,0,0,1,0,1,0,1];

const TAB_GROUPS = [
  {
    label: 'Core',
    fields: [
      { key: 'kills', label: 'K', type: 'int' },
      { key: 'deaths', label: 'D', type: 'int' },
      { key: 'assists', label: 'A', type: 'int' },
      { key: 'last_hits', label: 'LH', type: 'int' },
      { key: 'denies', label: 'DN', type: 'int' },
      { key: 'gpm', label: 'GPM', type: 'int' },
      { key: 'xpm', label: 'XPM', type: 'int' },
      { key: 'level', label: 'Lvl', type: 'int' },
      { key: 'net_worth', label: 'NW', type: 'int' },
      { key: 'position', label: 'Pos', type: 'int' },
      { key: 'lane_cs_10min', label: 'CS@10', type: 'int' },
      { key: 'laning_nw', label: 'LaneNW', type: 'int_nullable' },
    ],
  },
  {
    label: 'Combat',
    fields: [
      { key: 'hero_damage', label: 'HD', type: 'int' },
      { key: 'tower_damage', label: 'TD', type: 'int' },
      { key: 'hero_healing', label: 'HH', type: 'int' },
      { key: 'damage_taken', label: 'DmgTkn', type: 'int' },
      { key: 'stun_duration', label: 'Stun', type: 'float' },
      { key: 'teamfight_participation', label: 'TFP', type: 'float' },
      { key: 'firstblood_claimed', label: 'FB', type: 'int' },
      { key: 'buybacks', label: 'BB', type: 'int' },
      { key: 'courier_kills', label: 'Courier', type: 'int' },
      { key: 'kill_streak', label: 'Streak', type: 'int' },
      { key: 'double_kills', label: '2k', type: 'int' },
      { key: 'triple_kills', label: '3k', type: 'int' },
      { key: 'ultra_kills', label: '4k', type: 'int' },
      { key: 'rampages', label: 'Rampage', type: 'int' },
      { key: 'smoke_kills', label: 'Smoke', type: 'int' },
      { key: 'first_death', label: 'FD', type: 'int' },
    ],
  },
  {
    label: 'Vision & Misc',
    fields: [
      { key: 'obs_placed', label: 'Obs', type: 'int' },
      { key: 'sen_placed', label: 'Sen', type: 'int' },
      { key: 'obs_purchased', label: 'ObsBuy', type: 'int' },
      { key: 'sen_purchased', label: 'SenBuy', type: 'int' },
      { key: 'wards_killed', label: 'WrdKill', type: 'int' },
      { key: 'creeps_stacked', label: 'Stacks', type: 'int' },
      { key: 'camps_stacked', label: 'Camps', type: 'int' },
      { key: 'rune_pickups', label: 'Runes', type: 'int' },
      { key: 'tp_scrolls_used', label: 'TPs', type: 'int' },
      { key: 'towers_killed', label: 'Towers', type: 'int' },
      { key: 'roshans_killed', label: 'Roshan', type: 'int' },
    ],
  },
  {
    label: 'Flags',
    fields: [
      { key: 'team', label: 'Team', type: 'team' },
      { key: 'is_captain', label: 'Captain', type: 'bool' },
      { key: 'has_scepter', label: 'Scepter', type: 'bool' },
      { key: 'has_shard', label: 'Shard', type: 'bool' },
    ],
  },
];

const cellStyle = {
  padding: '2px 2px',
  fontSize: '0.75rem',
};

const inputStyle = {
  width: '60px',
  background: '#1a1f2e',
  color: '#e0e0e0',
  border: '1px solid #333',
  borderRadius: 3,
  padding: '2px 4px',
  fontSize: '0.75rem',
  textAlign: 'center',
};

const wideInputStyle = { ...inputStyle, width: '80px' };

function PlayerCell({ player, field, onChange }) {
  const val = player[field.key];
  if (field.type === 'bool') {
    return (
      <td style={cellStyle}>
        <input
          type="checkbox"
          checked={!!val}
          onChange={e => onChange(field.key, e.target.checked)}
        />
      </td>
    );
  }
  if (field.type === 'team') {
    return (
      <td style={cellStyle}>
        <select
          value={val || 'radiant'}
          onChange={e => onChange(field.key, e.target.value)}
          style={{ ...inputStyle, width: '72px' }}
        >
          <option value="radiant">Radiant</option>
          <option value="dire">Dire</option>
        </select>
      </td>
    );
  }
  return (
    <td style={cellStyle}>
      <input
        type="number"
        value={val === null || val === undefined ? '' : val}
        onChange={e => onChange(field.key, e.target.value === '' ? (field.type === 'int_nullable' ? null : 0) : (field.type === 'float' ? parseFloat(e.target.value) : parseInt(e.target.value)))}
        style={inputStyle}
        step={field.type === 'float' ? '0.01' : '1'}
      />
    </td>
  );
}

export default function StatsEditor() {
  const { matchId } = useParams();
  const { isSuperuser, superuserKey, setShowModal } = useSuperuser();

  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matchInfo, setMatchInfo] = useState({ radiant_win: false, duration: 0, lobby_name: '' });
  const [draft, setDraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const [section, setSection] = useState('stats');

  useEffect(() => {
    setLoading(true);
    getMatch(matchId)
      .then(m => {
        setMatch(m);
        setMatchInfo({
          radiant_win: !!m.radiant_win,
          duration: m.duration || 0,
          lobby_name: m.lobby_name || '',
        });
        const sorted = [...(m.players || [])].sort((a, b) => {
          if (a.team === 'radiant' && b.team !== 'radiant') return -1;
          if (a.team !== 'radiant' && b.team === 'radiant') return 1;
          return (a.slot || 0) - (b.slot || 0);
        });
        setPlayers(sorted);
        setDraft((m.draft || []).map((d, i) => ({
          order_num: d.order_num ?? i,
          hero_id: d.hero_id || 0,
          is_pick: !!d.is_pick,
          team: d.team ?? 0,
        })));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [matchId]);

  const updatePlayer = useCallback((slot, field, value) => {
    setPlayers(prev => prev.map(p => p.slot === slot ? { ...p, [field]: value } : p));
  }, []);

  const updateDraftEntry = (idx, field, value) => {
    setDraft(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const addDraftEntry = () => {
    const nextOrder = draft.length > 0 ? Math.max(...draft.map(d => d.order_num)) + 1 : 0;
    const nextTeam = CM_PATTERN[draft.length] ?? 0;
    const nextIsPick = draft.length >= 6;
    setDraft(prev => [...prev, { order_num: nextOrder, hero_id: 1, is_pick: nextIsPick, team: nextTeam }]);
  };

  const removeDraftEntry = (idx) => {
    setDraft(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!isSuperuser) { setShowModal(true); return; }
    setSaving(true);
    setSaved(false);
    try {
      const calls = [
        apiUpdateMatchDetails(matchId, matchInfo, superuserKey),
        apiUpdatePlayerStats(matchId, players, superuserKey),
      ];
      if (section === 'draft' || draft.length > 0) {
        calls.push(apiUpdateMatchDraft(matchId, draft, superuserKey));
      }
      await Promise.all(calls);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const fmtDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  if (!isSuperuser) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ color: '#e0e0e0' }}>Superuser Access Required</h2>
        <p style={{ color: '#888' }}>You must be logged in as superuser to edit match stats.</p>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ marginTop: '1rem' }}>
          &#128081; Superuser Login
        </button>
      </div>
    );
  }

  if (loading) return <div style={{ padding: '2rem', color: '#888' }}>Loading…</div>;
  if (error) return <div style={{ padding: '2rem', color: '#f44' }}>{error}</div>;

  const fields = TAB_GROUPS[tab].fields;

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <Link to={`/match/${matchId}`} style={{ color: '#5c8fff', fontSize: '0.85rem' }}>
          ← Back to Match {matchId}
        </Link>
        <h2 style={{ color: '#e0e0e0', margin: 0, fontSize: '1.2rem' }}>
          &#128081; Stats Editor
        </h2>
        <span style={{
          background: '#ff9800', color: '#000', fontSize: '0.7rem', padding: '2px 8px',
          borderRadius: 3, fontWeight: 700,
        }}>SUPERUSER</span>
      </div>

      <div style={{
        background: '#111827', border: '1px solid #2a3a5c', borderRadius: 8,
        padding: '1rem', marginBottom: '1.5rem',
      }}>
        <h3 style={{ color: '#e0e0e0', margin: '0 0 0.75rem', fontSize: '0.9rem' }}>Match Info</h3>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#888', fontSize: '0.75rem' }}>Winner</label>
            <select
              value={matchInfo.radiant_win ? 'radiant' : 'dire'}
              onChange={e => setMatchInfo(m => ({ ...m, radiant_win: e.target.value === 'radiant' }))}
              style={{
                background: '#0d1117', color: matchInfo.radiant_win ? '#4caf50' : '#f44336',
                border: '1px solid #444', padding: '0.35rem 0.6rem', borderRadius: 4, fontSize: '0.85rem',
              }}
            >
              <option value="radiant">Radiant Win</option>
              <option value="dire">Dire Win</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#888', fontSize: '0.75rem' }}>Duration (seconds)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                value={matchInfo.duration}
                onChange={e => setMatchInfo(m => ({ ...m, duration: parseInt(e.target.value) || 0 }))}
                style={{ ...wideInputStyle, width: '90px', textAlign: 'left', padding: '4px 8px' }}
              />
              <span style={{ color: '#888', fontSize: '0.8rem' }}>{fmtDuration(matchInfo.duration)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ color: '#888', fontSize: '0.75rem' }}>Lobby Name</label>
            <input
              type="text"
              value={matchInfo.lobby_name}
              onChange={e => setMatchInfo(m => ({ ...m, lobby_name: e.target.value }))}
              style={{ ...wideInputStyle, width: '200px', textAlign: 'left', padding: '4px 8px' }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['stats', 'draft'].map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            style={{
              background: section === s ? '#2a3a5c' : 'transparent',
              color: section === s ? '#e0e0e0' : '#888',
              border: `1px solid ${section === s ? '#5c8fff' : '#333'}`,
              borderRadius: 4, padding: '6px 18px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            }}
          >
            {s === 'stats' ? 'Player Stats' : 'Draft / Picks & Bans'}
          </button>
        ))}
      </div>

      {section === 'stats' && (
        <div style={{
          background: '#111827', border: '1px solid #2a3a5c', borderRadius: 8,
          padding: '1rem', marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {TAB_GROUPS.map((g, i) => (
              <button
                key={i}
                onClick={() => setTab(i)}
                style={{
                  background: tab === i ? '#2a3a5c' : 'transparent',
                  color: tab === i ? '#e0e0e0' : '#888',
                  border: `1px solid ${tab === i ? '#5c8fff' : '#333'}`,
                  borderRadius: 4, padding: '4px 14px', cursor: 'pointer', fontSize: '0.82rem',
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a3a5c' }}>
                  <th style={{ ...cellStyle, padding: '4px 8px', textAlign: 'left', color: '#aaa', minWidth: 120, position: 'sticky', left: 0, background: '#111827' }}>
                    Player
                  </th>
                  <th style={{ ...cellStyle, padding: '4px 6px', color: '#aaa', minWidth: 60, whiteSpace: 'nowrap' }}>Hero</th>
                  {fields.map(f => (
                    <th key={f.key} style={{ ...cellStyle, padding: '4px 6px', color: '#aaa', minWidth: 52, whiteSpace: 'nowrap' }}>
                      {f.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((pl, idx) => {
                  const isRadiant = pl.team === 'radiant';
                  return (
                    <tr key={pl.slot} style={{ background: idx % 2 === 0 ? (isRadiant ? 'rgba(76,175,80,0.06)' : 'rgba(244,67,54,0.06)') : 'transparent', borderBottom: '1px solid #1a2130' }}>
                      <td style={{ ...cellStyle, padding: '4px 8px', position: 'sticky', left: 0, background: idx % 2 === 0 ? (isRadiant ? '#0e1c0f' : '#1c0e0e') : '#111827' }}>
                        <span style={{ color: isRadiant ? '#4caf50' : '#f44336', fontSize: '0.7rem' }}>{isRadiant ? 'R' : 'D'}</span>{' '}
                        <span style={{ color: '#e0e0e0' }}>{pl.persona_name || `Slot ${pl.slot}`}</span>
                      </td>
                      <td style={{ ...cellStyle, padding: '4px 6px', color: '#aaa', whiteSpace: 'nowrap' }}>{pl.hero_name || '—'}</td>
                      {fields.map(f => (
                        <PlayerCell key={f.key} player={pl} field={f} onChange={(field, val) => updatePlayer(pl.slot, field, val)} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === 'draft' && (
        <div style={{
          background: '#111827', border: '1px solid #2a3a5c', borderRadius: 8,
          padding: '1rem', marginBottom: '1.5rem',
        }}>
          <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 1rem' }}>
            {draft.length === 0
              ? 'No draft data for this match. Use "Add Entry" to build the pick/ban sequence manually.'
              : `${draft.length} entries. Team 0 = Radiant, Team 1 = Dire.`}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {draft.map((entry, idx) => {
              const heroName = getHeroName(entry.hero_id);
              const isPick = entry.is_pick;
              const isRadiant = entry.team === 0;
              return (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap',
                  padding: '0.4rem 0.6rem', borderRadius: 4,
                  background: isPick
                    ? (isRadiant ? 'rgba(76,175,80,0.08)' : 'rgba(244,67,54,0.08)')
                    : 'rgba(120,120,120,0.06)',
                  border: `1px solid ${isPick ? (isRadiant ? '#1e4d1e' : '#4d1e1e') : '#2a2a2a'}`,
                }}>
                  <span style={{ color: '#666', fontSize: '0.75rem', minWidth: 20, textAlign: 'right' }}>
                    #{idx + 1}
                  </span>
                  <img
                    src={getHeroImageUrl(entry.hero_id)}
                    alt={heroName}
                    style={{ width: 28, height: 16, objectFit: 'cover', borderRadius: 2, opacity: isPick ? 1 : 0.4, filter: isPick ? 'none' : 'grayscale(100%)' }}
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                  <select
                    value={entry.hero_id}
                    onChange={e => updateDraftEntry(idx, 'hero_id', parseInt(e.target.value))}
                    style={{ background: '#0d1117', color: '#e0e0e0', border: '1px solid #333', borderRadius: 3, padding: '2px 4px', fontSize: '0.8rem', minWidth: 160 }}
                  >
                    {ALL_HEROES.map(h => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                  <select
                    value={entry.is_pick ? 'pick' : 'ban'}
                    onChange={e => updateDraftEntry(idx, 'is_pick', e.target.value === 'pick')}
                    style={{ background: '#0d1117', color: isPick ? '#4caf50' : '#f44', border: '1px solid #333', borderRadius: 3, padding: '2px 4px', fontSize: '0.8rem' }}
                  >
                    <option value="pick">Pick</option>
                    <option value="ban">Ban</option>
                  </select>
                  <select
                    value={entry.team}
                    onChange={e => updateDraftEntry(idx, 'team', parseInt(e.target.value))}
                    style={{ background: '#0d1117', color: entry.team === 0 ? '#4caf50' : '#f44336', border: '1px solid #333', borderRadius: 3, padding: '2px 4px', fontSize: '0.8rem' }}
                  >
                    <option value={0}>Radiant</option>
                    <option value={1}>Dire</option>
                  </select>
                  <button
                    onClick={() => removeDraftEntry(idx)}
                    style={{ background: 'transparent', color: '#666', border: '1px solid #333', borderRadius: 3, padding: '1px 8px', cursor: 'pointer', fontSize: '0.8rem' }}
                    title="Remove entry"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <button
            onClick={addDraftEntry}
            style={{
              marginTop: '0.75rem', background: 'transparent', color: '#5c8fff',
              border: '1px dashed #5c8fff', borderRadius: 4, padding: '5px 16px',
              cursor: 'pointer', fontSize: '0.82rem',
            }}
          >
            + Add Entry
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{ padding: '0.6rem 2rem', fontSize: '0.9rem' }}
        >
          {saving ? 'Saving…' : '💾 Save All Changes'}
        </button>
        {saved && (
          <span style={{ color: '#4caf50', fontSize: '0.9rem' }}>✓ Saved successfully</span>
        )}
        <Link to={`/match/${matchId}`} style={{ color: '#888', fontSize: '0.85rem' }}>
          Cancel
        </Link>
      </div>
    </div>
  );
}
