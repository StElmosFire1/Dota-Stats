import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useSeason } from '../context/SeasonContext';

const POSITIONS = ['', 'Pos 1', 'Pos 2', 'Pos 3', 'Pos 4', 'Pos 5'];

function makeEmptyPlayer(team) {
  return { team, accountId: '', personaName: '', heroName: '', heroId: 0, position: 0, kills: 0, deaths: 0, assists: 0 };
}

function PlayerRow({ player, idx, allPlayers, heroes, onChange }) {
  return (
    <tr>
      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{idx + 1}</td>
      <td>
        <select
          value={player.accountId}
          onChange={e => {
            const selected = allPlayers.find(p => String(p.account_id) === e.target.value);
            onChange({ accountId: e.target.value, personaName: selected ? (selected.nickname || selected.persona_name || '') : '' });
          }}
          style={{ width: '100%', minWidth: 140 }}
        >
          <option value="">— Select player —</option>
          {allPlayers.map(p => (
            <option key={p.account_id} value={String(p.account_id)}>
              {p.nickname || p.persona_name || p.account_id}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={player.position} onChange={e => onChange({ position: parseInt(e.target.value) })} style={{ width: 90 }}>
          {POSITIONS.map((label, i) => <option key={i} value={i}>{i === 0 ? '—' : label}</option>)}
        </select>
      </td>
      <td>
        <input
          list={`heroes-list-${idx}-${player.team}`}
          value={player.heroName}
          onChange={e => {
            const name = e.target.value;
            const match = heroes.find(h => h.localized_name.toLowerCase() === name.toLowerCase());
            onChange({ heroName: name, heroId: match ? match.id : 0 });
          }}
          placeholder="Hero name"
          style={{ width: 140 }}
        />
        <datalist id={`heroes-list-${idx}-${player.team}`}>
          {heroes.map(h => <option key={h.id} value={h.localized_name} />)}
        </datalist>
      </td>
      <td><input type="number" min={0} max={50} value={player.kills} onChange={e => onChange({ kills: parseInt(e.target.value) || 0 })} style={{ width: 50 }} /></td>
      <td><input type="number" min={0} max={50} value={player.deaths} onChange={e => onChange({ deaths: parseInt(e.target.value) || 0 })} style={{ width: 50 }} /></td>
      <td><input type="number" min={0} max={50} value={player.assists} onChange={e => onChange({ assists: parseInt(e.target.value) || 0 })} style={{ width: 50 }} /></td>
    </tr>
  );
}

export default function RecordMatch() {
  const { isSuperuser, superuserKey } = useSuperuser();
  const { seasonId } = useSeason();
  const navigate = useNavigate();

  const [allPlayers, setAllPlayers] = useState([]);
  const [heroes, setHeroes] = useState([]);
  const [matchDate, setMatchDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [durationMins, setDurationMins] = useState(35);
  const [durationSecs, setDurationSecs] = useState(0);
  const [radiantWin, setRadiantWin] = useState(true);
  const [lobbyName, setLobbyName] = useState('');
  const [patch, setPatch] = useState('');
  const [radiantPlayers, setRadiantPlayers] = useState(() => Array.from({ length: 5 }, () => makeEmptyPlayer('radiant')));
  const [direPlayers, setDirePlayers] = useState(() => Array.from({ length: 5 }, () => makeEmptyPlayer('dire')));
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  const authHeader = { 'x-superuser-key': superuserKey };

  useEffect(() => {
    fetch('/api/players')
      .then(r => r.json())
      .then(d => setAllPlayers(d.players || []))
      .catch(() => {});
    fetch('https://api.opendota.com/api/heroes')
      .then(r => r.json())
      .then(data => setHeroes(data.sort((a, b) => a.localized_name.localeCompare(b.localized_name))))
      .catch(() => {});
  }, []);

  const updateRadiant = (idx, changes) => {
    setRadiantPlayers(prev => prev.map((p, i) => i === idx ? { ...p, ...changes } : p));
  };
  const updateDire = (idx, changes) => {
    setDirePlayers(prev => prev.map((p, i) => i === idx ? { ...p, ...changes } : p));
  };

  const handleSubmit = async () => {
    setSubmitMsg('');
    const players = [
      ...radiantPlayers.map(p => ({ ...p, team: 'radiant' })),
      ...direPlayers.map(p => ({ ...p, team: 'dire' })),
    ];
    const missing = players.filter(p => !p.accountId);
    if (missing.length > 0) {
      setSubmitMsg('All 10 player slots must be filled.');
      return;
    }
    const accountIds = players.map(p => p.accountId);
    if (new Set(accountIds).size !== 10) {
      setSubmitMsg('Duplicate players detected — each player must appear only once.');
      return;
    }
    setSubmitting(true);
    try {
      const duration = (parseInt(durationMins) || 0) * 60 + (parseInt(durationSecs) || 0);
      const r = await fetch('/api/admin/matches/manual', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date(matchDate).toISOString(),
          duration,
          radiantWin,
          players,
          lobbyName: lobbyName || 'Manual Entry',
          patch: patch || null,
          seasonId: seasonId && seasonId !== 'legacy' ? seasonId : null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setSubmitMsg(`Match recorded! Redirecting to match ${d.matchId}…`);
        setTimeout(() => { navigate(`/match/${d.matchId}`); }, 1500);
      } else {
        setSubmitMsg(d.error || 'Failed to record match.');
      }
    } catch {
      setSubmitMsg('Request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 16 }}>🔒 Record Match</h2>
        <p style={{ color: 'var(--text-muted)' }}>You must be logged in as superuser to access this page.</p>
        <Link to="/admin" className="btn" style={{ textDecoration: 'none', marginTop: 16, display: 'inline-block' }}>Back to Admin Panel</Link>
      </div>
    );
  }

  const teamTable = (players, update, color, label, emoji) => (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ color, marginBottom: 10 }}>{emoji} {label}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'left' }}>
              <th style={{ paddingBottom: 6, width: 24 }}>#</th>
              <th style={{ paddingBottom: 6 }}>Player</th>
              <th style={{ paddingBottom: 6 }}>Position</th>
              <th style={{ paddingBottom: 6 }}>Hero</th>
              <th style={{ paddingBottom: 6 }}>K</th>
              <th style={{ paddingBottom: 6 }}>D</th>
              <th style={{ paddingBottom: 6 }}>A</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <PlayerRow key={i} player={p} idx={i} allPlayers={allPlayers} heroes={heroes} onChange={changes => update(i, changes)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <Link to="/admin" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 14 }}>← Admin Panel</Link>
      </div>
      <h1 className="page-title">📝 Record Match</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>
        Manually record a match result when no replay is available. All 10 slots must be filled.
      </p>

      <div className="card" style={{ padding: 24 }}>
        {/* Match metadata */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label>Match Date &amp; Time</label>
            <input type="datetime-local" value={matchDate} onChange={e => setMatchDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Duration</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" min={0} max={120} value={durationMins} onChange={e => setDurationMins(e.target.value)} style={{ width: 64 }} />
              <span>m</span>
              <input type="number" min={0} max={59} value={durationSecs} onChange={e => setDurationSecs(e.target.value)} style={{ width: 56 }} />
              <span>s</span>
            </div>
          </div>
          <div className="form-group">
            <label>Winner</label>
            <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <button
                onClick={() => setRadiantWin(true)}
                style={{ flex: 1, padding: '7px 18px', background: radiantWin ? '#4caf50' : 'transparent', color: radiantWin ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: radiantWin ? 700 : 400 }}
              >
                ✅ Radiant
              </button>
              <button
                onClick={() => setRadiantWin(false)}
                style={{ flex: 1, padding: '7px 18px', background: !radiantWin ? '#f44336' : 'transparent', color: !radiantWin ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: !radiantWin ? 700 : 400 }}
              >
                ☠️ Dire
              </button>
            </div>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label>Lobby Name (optional)</label>
            <input type="text" value={lobbyName} onChange={e => setLobbyName(e.target.value)} placeholder="e.g. OCE Inhouse #42" />
          </div>
          <div className="form-group" style={{ flex: '0 1 100px' }}>
            <label>Patch</label>
            <input type="text" value={patch} onChange={e => setPatch(e.target.value)} placeholder="7.38" style={{ width: 90 }} />
          </div>
        </div>

        {teamTable(radiantPlayers, updateRadiant, '#4caf50', 'Radiant Team', '🟢')}
        {teamTable(direPlayers, updateDire, '#f44336', 'Dire Team', '🔴')}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Recording…' : '📝 Record Match'}
          </button>
          <Link to="/admin" className="btn" style={{ textDecoration: 'none' }}>Cancel</Link>
          {submitMsg && (
            <span style={{ color: submitMsg.startsWith('Match') ? '#4caf50' : '#f44336', fontSize: '0.9rem' }}>
              {submitMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
