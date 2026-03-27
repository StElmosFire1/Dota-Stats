import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useSeason } from '../context/SeasonContext';

const POSITIONS = ['', 'Pos 1', 'Pos 2', 'Pos 3', 'Pos 4', 'Pos 5'];

function makeEmptyPlayer(team) {
  return { team, accountId: '', personaName: '', heroName: '', heroId: 0, position: 0, kills: 0, deaths: 0, assists: 0 };
}

function OverviewCard({ label, value, sub }) {
  return (
    <div className="stat-card" style={{ minWidth: 160 }}>
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
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

export default function AdminPanel() {
  const { isSuperuser, superuserKey, logout } = useSuperuser();
  const { selectedSeason } = useSeason();

  const [overview, setOverview] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [heroes, setHeroes] = useState([]);
  const [duplicates, setDuplicates] = useState(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');

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

  const loadOverview = useCallback(() => {
    if (!isSuperuser) return;
    fetch('/api/admin/overview', { headers: authHeader })
      .then(r => r.json())
      .then(setOverview)
      .catch(() => {});
  }, [isSuperuser, superuserKey]);

  useEffect(() => {
    loadOverview();
    fetch('/api/players')
      .then(r => r.json())
      .then(d => setAllPlayers(d.players || []))
      .catch(() => {});
    fetch('https://api.opendota.com/api/heroes')
      .then(r => r.json())
      .then(data => setHeroes(data.sort((a, b) => a.localized_name.localeCompare(b.localized_name))))
      .catch(() => {});
  }, [isSuperuser]);

  const updateRadiant = (idx, changes) => {
    setRadiantPlayers(prev => prev.map((p, i) => i === idx ? { ...p, ...changes } : p));
  };
  const updateDire = (idx, changes) => {
    setDirePlayers(prev => prev.map((p, i) => i === idx ? { ...p, ...changes } : p));
  };

  const handleRecalculate = async () => {
    setRecalcLoading(true);
    setRecalcMsg('');
    try {
      const r = await fetch('/api/admin/recalculate-ratings', { method: 'POST', headers: authHeader });
      const d = await r.json();
      setRecalcMsg(d.message || d.error || 'Done.');
    } catch {
      setRecalcMsg('Request failed.');
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleLoadDuplicates = async () => {
    setDupLoading(true);
    try {
      const r = await fetch('/api/admin/duplicate-matches', { headers: authHeader });
      const d = await r.json();
      setDuplicates(d.duplicates || d || []);
    } catch {
      setDuplicates([]);
    } finally {
      setDupLoading(false);
    }
  };

  const handleSubmitMatch = async () => {
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
          seasonId: selectedSeason && selectedSeason !== 'legacy' ? selectedSeason : null,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setSubmitMsg(`Match recorded! ID: ${d.matchId}`);
        setRadiantPlayers(Array.from({ length: 5 }, () => makeEmptyPlayer('radiant')));
        setDirePlayers(Array.from({ length: 5 }, () => makeEmptyPlayer('dire')));
        setLobbyName('');
        loadOverview();
        setTimeout(() => { window.location.href = `/match/${d.matchId}`; }, 1500);
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
        <h2 style={{ marginBottom: 16 }}>🔒 Admin Panel</h2>
        <p style={{ color: 'var(--text-muted)' }}>You must be logged in as superuser to access this page.</p>
        <p style={{ marginTop: 12, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Use the 🛡️ Superuser button in the top navigation to log in.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>🔒 Admin Panel</h1>
        <button className="btn" onClick={logout} style={{ fontSize: '0.85rem' }}>Log out</button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 28 }}>Manage matches, ratings, and data.</p>

      {/* Overview */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ marginBottom: 14 }}>Overview</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <OverviewCard label="Total Matches" value={overview?.totalMatches} />
          <OverviewCard label="Registered Players" value={overview?.totalPlayers} />
          <OverviewCard label="Manual Entries" value={overview?.manualMatches} />
          <OverviewCard
            label="Active Season"
            value={overview?.activeSeason?.name || 'None'}
            sub={overview?.activeSeason ? `ID: ${overview.activeSeason.id}` : null}
          />
        </div>
      </section>

      {/* Manual Match Entry */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ marginBottom: 14 }}>Manual Match Entry</h2>
        <div className="card" style={{ padding: 24 }}>
          {/* Match metadata */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 20 }}>
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

          {/* Radiant team */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ color: '#4caf50', marginBottom: 10 }}>🟢 Radiant Team</h3>
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
                  {radiantPlayers.map((p, i) => (
                    <PlayerRow key={i} player={p} idx={i} allPlayers={allPlayers} heroes={heroes} onChange={changes => updateRadiant(i, changes)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dire team */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#f44336', marginBottom: 10 }}>🔴 Dire Team</h3>
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
                  {direPlayers.map((p, i) => (
                    <PlayerRow key={i} player={p} idx={i} allPlayers={allPlayers} heroes={heroes} onChange={changes => updateDire(i, changes)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button className="btn btn-primary" onClick={handleSubmitMatch} disabled={submitting}>
              {submitting ? 'Recording…' : '📝 Record Match'}
            </button>
            {submitMsg && (
              <span style={{ color: submitMsg.startsWith('Match') ? '#4caf50' : '#f44336', fontSize: '0.9rem' }}>
                {submitMsg}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Maintenance */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ marginBottom: 14 }}>Maintenance</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: 20, flex: '1 1 280px' }}>
            <h3 style={{ marginBottom: 8 }}>Recalculate Ratings</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 14 }}>
              Wipes and rebuilds all TrueSkill MMR from scratch using every match in chronological order. Run this after any data correction or base MMR change.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-primary" onClick={handleRecalculate} disabled={recalcLoading}>
                {recalcLoading ? 'Recalculating…' : '⚙️ Recalculate Now'}
              </button>
              {recalcMsg && <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{recalcMsg}</span>}
            </div>
          </div>

          <div className="card" style={{ padding: 20, flex: '1 1 280px' }}>
            <h3 style={{ marginBottom: 8 }}>Duplicate Match Detector</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 14 }}>
              Finds matches that share the same players and duration — likely uploaded more than once.
            </p>
            <button className="btn" onClick={handleLoadDuplicates} disabled={dupLoading}>
              {dupLoading ? 'Scanning…' : '🔍 Scan for Duplicates'}
            </button>
            {duplicates !== null && (
              <div style={{ marginTop: 14 }}>
                {duplicates.length === 0 ? (
                  <p style={{ color: '#4caf50', fontSize: '0.88rem' }}>✓ No duplicates found.</p>
                ) : (
                  <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>Match ID</th>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>Date</th>
                        <th style={{ textAlign: 'left', paddingBottom: 4 }}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicates.map((d, i) => (
                        <tr key={i}>
                          <td><Link to={`/match/${d.match_id}`} style={{ color: 'var(--accent)' }}>{String(d.match_id).slice(0, 16)}</Link></td>
                          <td>{d.date ? new Date(d.date).toLocaleDateString() : '—'}</td>
                          <td>{d.duration ? `${Math.floor(d.duration / 60)}m` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section>
        <h2 style={{ marginBottom: 14 }}>Quick Links</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { to: '/upload', label: '⬆️ Upload Replay' },
            { to: '/seasons', label: '🏆 Seasons' },
            { to: '/players', label: '👥 Players & Nicknames' },
            { to: '/patch-notes', label: '📋 Patch Notes' },
            { to: '/matches', label: '📊 Match List' },
          ].map(({ to, label }) => (
            <Link key={to} to={to} className="btn" style={{ textDecoration: 'none' }}>{label}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}
