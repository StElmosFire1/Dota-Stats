import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useSeason } from '../context/SeasonContext';
import { getStoredReplays, extendReplayExpiry, getPlayerRanks, triggerRankSync, setManualRank, clearPlayerRank, getSignupRequests, updateSignupRequest } from '../api';
import RankBadge, { decodeRankTier } from '../components/RankBadge';

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

function ReplayManager({ superuserKey }) {
  const [replays, setReplays] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extending, setExtending] = useState({});
  const [reparsing, setReparsing] = useState({});
  const [reparseMsg, setReparseMsg] = useState({});
  const [reparseAllStatus, setReparseAllStatus] = useState(null);
  const [reparseAllLoading, setReparseAllLoading] = useState(false);
  const [setPermanentLoading, setSetPermanentLoading] = useState(false);
  const [setPermanentMsg, setSetPermanentMsg] = useState('');
  const authHeader = { 'x-superuser-key': superuserKey };

  function load() {
    setLoading(true);
    getStoredReplays(superuserKey)
      .then(d => { setReplays(d.replays || []); setLoading(false); })
      .catch(() => { setReplays([]); setLoading(false); });
  }

  function handleExtend(matchId, days) {
    setExtending(prev => ({ ...prev, [matchId]: true }));
    extendReplayExpiry(matchId, days, superuserKey)
      .then(() => load())
      .catch(e => alert('Error: ' + e.message))
      .finally(() => setExtending(prev => ({ ...prev, [matchId]: false })));
  }

  function handleDownload(matchId) {
    const url = `/api/replays/${matchId}/download`;
    fetch(url, { headers: authHeader })
      .then(r => {
        if (!r.ok) return r.json().then(j => { throw new Error(j.error || 'Not available'); });
        return r.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${matchId}.dem`;
        a.click();
      })
      .catch(err => alert('Download failed: ' + err.message));
  }

  function handleReparse(matchId) {
    if (!window.confirm(`Re-parse stored replay for match ${matchId}?\n\nThis will update all stats and recalculate MMR for all matches. Season assignment is preserved.`)) return;
    setReparsing(prev => ({ ...prev, [matchId]: true }));
    setReparseMsg(prev => ({ ...prev, [matchId]: '' }));
    fetch(`/api/admin/reparse-replay/${matchId}`, { method: 'POST', headers: authHeader })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setReparseMsg(prev => ({ ...prev, [matchId]: '✓ Reparsed + MMR updated' }));
        } else {
          setReparseMsg(prev => ({ ...prev, [matchId]: `Error: ${d.error}` }));
        }
      })
      .catch(e => setReparseMsg(prev => ({ ...prev, [matchId]: `Failed: ${e.message}` })))
      .finally(() => setReparsing(prev => ({ ...prev, [matchId]: false })));
  }

  function handleReparseAll() {
    if (!window.confirm(`Re-parse ALL stored replays?\n\nThis runs in the background and may take a long time. It updates stats for every replay on file and recalculates MMR for all players. Season assignments are preserved.`)) return;
    setReparseAllLoading(true);
    fetch('/api/admin/reparse-all-replays', { method: 'POST', headers: authHeader })
      .then(r => r.json())
      .then(d => {
        setReparseAllStatus(d);
        if (d.running || d.success) {
          const poll = setInterval(() => {
            fetch('/api/admin/reparse-all-status', { headers: authHeader })
              .then(r => r.json())
              .then(s => {
                setReparseAllStatus(s);
                if (s.status?.phase === 'complete' || !s.running) clearInterval(poll);
              })
              .catch(() => clearInterval(poll));
          }, 3000);
        }
      })
      .catch(e => setReparseAllStatus({ error: e.message }))
      .finally(() => setReparseAllLoading(false));
  }

  function handleSetAllPermanent() {
    if (!window.confirm('Set ALL stored replays to never expire?')) return;
    setSetPermanentLoading(true);
    setSetPermanentMsg('');
    fetch('/api/admin/replays/set-all-permanent', { method: 'POST', headers: authHeader })
      .then(r => r.json())
      .then(d => {
        setSetPermanentMsg(d.message || d.error || 'Done.');
        if (replays) load();
      })
      .catch(e => setSetPermanentMsg('Failed: ' + e.message))
      .finally(() => setSetPermanentLoading(false));
  }

  const fmtSize = bytes => {
    if (!bytes) return '—';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const isExpired = d => d && new Date(d) < new Date();

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Stored Replays</h2>
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px' }} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : replays === null ? 'Load' : 'Refresh'}
        </button>
        {replays !== null && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {replays.filter(r => r.available).length} / {replays.length} available
          </span>
        )}
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#4ade80', borderColor: '#4ade80' }}
          onClick={handleSetAllPermanent} disabled={setPermanentLoading}>
          {setPermanentLoading ? 'Setting…' : '♾️ Set All Permanent'}
        </button>
        {setPermanentMsg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{setPermanentMsg}</span>}
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#a78bfa', borderColor: '#a78bfa' }}
          onClick={handleReparseAll} disabled={reparseAllLoading}>
          🔄 Re-parse All
        </button>
      </div>
      {reparseAllStatus && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem' }}>
          {reparseAllStatus.error ? (
            <span style={{ color: '#f87171' }}>Error: {reparseAllStatus.error}</span>
          ) : reparseAllStatus.status ? (
            <span>
              Re-parse: {reparseAllStatus.status.phase === 'complete' ? '✓ Complete' : '⏳ Running'} —&nbsp;
              {reparseAllStatus.status.done}/{reparseAllStatus.status.total} done,&nbsp;
              {reparseAllStatus.status.failed} failed,&nbsp;
              {reparseAllStatus.status.remaining} remaining
              {reparseAllStatus.status.errors?.length > 0 && (
                <div style={{ color: '#f87171', marginTop: 4 }}>
                  {reparseAllStatus.status.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </span>
          ) : (
            <span>{reparseAllStatus.message}</span>
          )}
        </div>
      )}
      {replays !== null && replays.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No replay files stored yet. Upload replays and they will be archived automatically.</p>
      )}
      {replays !== null && replays.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Match ID</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Date</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>Size</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Expires</th>
                <th style={{ textAlign: 'center', padding: '6px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {replays.map(r => (
                <tr key={r.matchId} style={{ borderBottom: '1px solid var(--border)', opacity: r.available ? 1 : 0.5 }}>
                  <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>
                    <Link to={`/match/${r.matchId}`}>{r.matchId}</Link>
                  </td>
                  <td style={{ padding: '5px 8px' }}>{fmtDate(r.date)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtSize(r.fileSize)}</td>
                  <td style={{ padding: '5px 8px' }}>
                    {r.expiresAt
                      ? <span style={{ color: isExpired(r.expiresAt) ? '#f87171' : '#facc15' }}>{fmtDate(r.expiresAt)}{isExpired(r.expiresAt) ? ' (expired)' : ''}</span>
                      : <span style={{ color: '#4ade80' }}>Never</span>}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {r.available && (
                        <button className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                          onClick={() => handleDownload(r.matchId)}>
                          ⬇ Download
                        </button>
                      )}
                      {r.available && (
                        <button className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px', color: '#a78bfa', borderColor: '#a78bfa' }}
                          disabled={reparsing[r.matchId]}
                          onClick={() => handleReparse(r.matchId)}
                          title="Re-parse this replay and update all stats + MMR">
                          {reparsing[r.matchId] ? '⏳' : '🔄'} Re-parse
                        </button>
                      )}
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                        disabled={extending[r.matchId]}
                        onClick={() => handleExtend(r.matchId, 7)}>
                        +7 days
                      </button>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '2px 8px', color: '#4ade80', borderColor: '#4ade80' }}
                        disabled={extending[r.matchId]}
                        onClick={() => handleExtend(r.matchId, 0)}>
                        ♾️ Forever
                      </button>
                    </div>
                    {reparseMsg[r.matchId] && (
                      <div style={{ fontSize: '0.75rem', color: reparseMsg[r.matchId].startsWith('✓') ? '#4ade80' : '#f87171', marginTop: 4 }}>
                        {reparseMsg[r.matchId]}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Replays are kept permanently by default. Set <code>REPLAY_STORE_DAYS=N</code> to auto-expire after N days.
        Use <code>REPLAY_STORE_DIR</code> to set a custom storage path.
      </p>
    </section>
  );
}

function TestDmPanel({ superuserKey }) {
  const [discordId, setDiscordId] = useState('');
  const [status, setStatus] = useState(null); // null | { ok, message }
  const [loading, setLoading] = useState(false);

  const sendTestDm = async () => {
    const id = discordId.trim();
    if (!id) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/test-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ discordId: id }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus({ ok: true, message: `✅ Test DM sent to ${data.username} (${data.id})` });
      } else {
        setStatus({ ok: false, message: `❌ ${data.error}` });
      }
    } catch (e) {
      setStatus({ ok: false, message: `❌ Request failed: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Test Post-Match DM</h2>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Sends a mock MVP + attitude rating DM to verify the post-match DM system is working for a player.
        Replies are handled but not saved to the database.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Discord User ID (e.g. 135991380760592384)"
          value={discordId}
          onChange={e => setDiscordId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendTestDm()}
          style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 14, width: 320,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={sendTestDm}
          disabled={loading || !discordId.trim()}
          style={{
            padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 14,
            background: loading ? 'var(--bg-secondary)' : '#6366f1',
            color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sending…' : '📨 Send Test DM'}
        </button>
      </div>
      {status && (
        <div style={{
          marginTop: 12, padding: '8px 14px', borderRadius: 6, fontSize: 13,
          background: status.ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${status.ok ? '#4ade80' : '#f87171'}`,
          color: status.ok ? '#4ade80' : '#f87171',
        }}>
          {status.message}
        </div>
      )}
    </section>
  );
}

function TestRsvpDmPanel({ superuserKey }) {
  const [discordId, setDiscordId] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const id = discordId.trim();
    if (!id) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/admin/test-rsvp-dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ discordId: id }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus({ ok: true, message: `✅ RSVP registration DM sent to ${data.username} (${data.id}). Reply with a Steam ID to test the full flow, or "skip".` });
      } else {
        setStatus({ ok: false, message: `❌ ${data.error}` });
      }
    } catch (e) {
      setStatus({ ok: false, message: `❌ Request failed: ${e.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Test RSVP Registration DM</h2>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Sends the unregistered-player RSVP prompt DM. The reply handler is fully live — you can test
        replying with a Steam ID (Steam64, Steam3, Steam2, or profile URL) or type <code>skip</code>.
        Equivalent to <code>!testrsvpdm</code> in Discord.
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Discord User ID (e.g. 135991380760592384)"
          value={discordId}
          onChange={e => setDiscordId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 14, width: 320,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !discordId.trim()}
          style={{
            padding: '8px 18px', borderRadius: 6, fontWeight: 600, fontSize: 14,
            background: loading ? 'var(--bg-secondary)' : '#4ade80',
            color: loading ? 'var(--text-muted)' : '#000', border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sending…' : '🎮 Send RSVP Registration DM'}
        </button>
      </div>
      {status && (
        <div style={{
          marginTop: 12, padding: '8px 14px', borderRadius: 6, fontSize: 13,
          background: status.ok ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `1px solid ${status.ok ? '#4ade80' : '#f87171'}`,
          color: status.ok ? '#4ade80' : '#f87171',
        }}>
          {status.message}
        </div>
      )}
    </section>
  );
}

function ErrorLogViewer({ superuserKey }) {
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState('');
  const [clearMsg, setClearMsg] = useState('');
  const authHeader = { 'x-superuser-key': superuserKey };

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ limit: 100 });
    if (level) params.set('level', level);
    fetch(`/api/admin/error-log?${params}`, { headers: authHeader })
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => { setLogs([]); setLoading(false); });
  }

  function handleClear() {
    if (!window.confirm('Clear server logs older than 30 days?')) return;
    fetch('/api/admin/error-log?days=30', { method: 'DELETE', headers: authHeader })
      .then(r => r.json())
      .then(d => { setClearMsg(d.message || 'Done.'); load(); })
      .catch(e => setClearMsg('Error: ' + e.message));
  }

  const levelColor = l => ({ error: '#f87171', warn: '#facc15', info: '#60a5fa' }[l] || '#aaa');

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Server Error Log</h2>
        <select value={level} onChange={e => setLevel(e.target.value)} style={{ fontSize: '0.82rem', padding: '2px 6px' }}>
          <option value="">All levels</option>
          <option value="error">Errors only</option>
          <option value="warn">Warnings only</option>
          <option value="info">Info only</option>
        </select>
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px' }} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : logs === null ? 'Load' : 'Refresh'}
        </button>
        {logs !== null && (
          <>
            <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#f87171', borderColor: '#f87171' }} onClick={handleClear}>
              🗑 Clear Old
            </button>
            {clearMsg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{clearMsg}</span>}
          </>
        )}
      </div>
      {logs !== null && logs.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No server logs found. Errors encountered during API calls will appear here.</p>
      )}
      {logs !== null && logs.length > 0 && (
        <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', position: 'sticky', top: 0, background: 'var(--bg)' }}>
                <th style={{ textAlign: 'left', padding: '5px 8px', width: 60 }}>Level</th>
                <th style={{ textAlign: 'left', padding: '5px 8px', width: 140 }}>When</th>
                <th style={{ textAlign: 'left', padding: '5px 8px', width: 160 }}>Source</th>
                <th style={{ textAlign: 'left', padding: '5px 8px' }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px', color: levelColor(l.level), fontWeight: 600 }}>{l.level?.toUpperCase()}</td>
                  <td style={{ padding: '4px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('en-AU')}</td>
                  <td style={{ padding: '4px 8px', fontFamily: 'monospace', color: '#a78bfa' }}>{l.source}</td>
                  <td style={{ padding: '4px 8px', wordBreak: 'break-all' }}>{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Shows server-side errors logged during API operations. Useful for diagnosing replay parse failures and data issues.
      </p>
    </section>
  );
}

function SteamBotPanel({ superuserKey }) {
  const auth = { 'x-superuser-key': superuserKey };
  const [status, setStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Lobby create
  const [lobbyName, setLobbyName] = useState('OCE Inhouse');
  const [lobbyPass, setLobbyPass] = useState('');
  const [lobbyMsg, setLobbyMsg] = useState(null);
  const [lobbyLoading, setLobbyLoading] = useState(false);

  // Join lobby
  const [joinId, setJoinId] = useState('');
  const [joinPass, setJoinPass] = useState('');
  const [joinMsg, setJoinMsg] = useState(null);
  const [joinLoading, setJoinLoading] = useState(false);

  // Invite
  const [inviteSteamId, setInviteSteamId] = useState('');
  const [inviteMsg, setInviteMsg] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Friends
  const [friendsMsg, setFriendsMsg] = useState(null);
  const [friendsLoading, setFriendsLoading] = useState(false);

  // End lobby
  const [endMsg, setEndMsg] = useState(null);
  const [endLoading, setEndLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await fetch('/api/admin/steam/status', { headers: auth });
      setStatus(await r.json());
    } catch { setStatus(null); }
    setStatusLoading(false);
  }, [superuserKey]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const dot = (ok) => (
    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: ok ? '#4ade80' : '#ef4444', marginRight: 6 }} />
  );

  const callApi = async (url, body, setMsg, setLoading) => {
    setLoading(true); setMsg(null);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      setMsg({ ok: r.ok, text: d.error || d.message || (r.ok ? 'Done' : 'Failed') });
      if (r.ok) setTimeout(loadStatus, 1500);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setLoading(false);
  };

  const statusColor = (ok) => ok ? 'var(--radiant-color)' : 'var(--dire-color)';
  const msgEl = (m) => m && (
    <p style={{ marginTop: 6, fontSize: 13, color: m.ok ? 'var(--radiant-color)' : 'var(--dire-color)' }}>{m.ok ? '✅' : '❌'} {m.text}</p>
  );

  const lobbyState = status?.lobby?.lobby;
  const lobbyActive = !!lobbyState;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>🤖 Steam Bot Controls</h2>
        <button className="btn" style={{ fontSize: 12, padding: '3px 10px' }} onClick={loadStatus} disabled={statusLoading}>
          {statusLoading ? '...' : '↺ Refresh'}
        </button>
      </div>

      {/* Status row */}
      {status && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20, background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 8 }}>
          <span>{dot(status.steamConnected)}<strong>Steam</strong>: <span style={{ color: statusColor(status.steamConnected) }}>{status.steamConnected ? 'Connected' : 'Offline'}</span></span>
          <span>{dot(status.gcReady)}<strong>GC</strong>: <span style={{ color: statusColor(status.gcReady) }}>{status.gcReady ? 'Ready' : 'Not ready'}</span></span>
          <span>👥 <strong>Friends:</strong> {status.friendCount ?? '—'}</span>
          <span>🎮 <strong>Lobby:</strong> {lobbyActive ? <span style={{ color: 'var(--radiant-color)' }}>{lobbyState.name} ({status.lobby?.state})</span> : <span style={{ color: 'var(--text-muted)' }}>None</span>}</span>
          {lobbyActive && lobbyState.lobbyId && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>ID: {lobbyState.lobbyId}</span>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>

        {/* Create Lobby */}
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Create Lobby</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="input" placeholder="Lobby name" value={lobbyName} onChange={e => setLobbyName(e.target.value)} />
            <input className="input" placeholder="Password (optional)" value={lobbyPass} onChange={e => setLobbyPass(e.target.value)} />
            <button className="btn" disabled={lobbyLoading || !lobbyName.trim()}
              onClick={() => callApi('/api/admin/steam/lobby/create', { name: lobbyName, password: lobbyPass }, setLobbyMsg, setLobbyLoading)}>
              {lobbyLoading ? 'Creating…' : '🎮 Create Lobby'}
            </button>
            {msgEl(lobbyMsg)}
          </div>
        </div>

        {/* Join Lobby */}
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Join Existing Lobby</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="input" placeholder="Lobby ID" value={joinId} onChange={e => setJoinId(e.target.value)} />
            <input className="input" placeholder="Password (if any)" value={joinPass} onChange={e => setJoinPass(e.target.value)} />
            <button className="btn" disabled={joinLoading || !joinId.trim()}
              onClick={() => callApi('/api/admin/steam/lobby/join', { lobbyId: joinId, password: joinPass }, setJoinMsg, setJoinLoading)}>
              {joinLoading ? 'Joining…' : '🔗 Join Lobby'}
            </button>
            {msgEl(joinMsg)}
          </div>
        </div>

        {/* Invite Player */}
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Invite Player</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Accepts Steam64, Steam3 [U:1:N], or STEAM_0:Y:Z format. Lobby must be active.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input className="input" placeholder="e.g. STEAM_0:1:17972010" value={inviteSteamId} onChange={e => setInviteSteamId(e.target.value)} />
            <button className="btn" disabled={inviteLoading || !inviteSteamId.trim()}
              onClick={() => callApi('/api/admin/steam/lobby/invite', { steamId: inviteSteamId }, setInviteMsg, setInviteLoading)}>
              {inviteLoading ? 'Inviting…' : '📨 Send Invite'}
            </button>
            {msgEl(inviteMsg)}
          </div>
        </div>

        {/* End Lobby + Launch + Add Friends */}
        <div style={{ background: 'var(--bg-card)', padding: 16, borderRadius: 8 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Other Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Launch the game once all 10 players are seated. This cannot be undone.
              </p>
              <button className="btn" style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                disabled={!lobbyActive}
                onClick={() => callApi('/api/admin/steam/lobby/start', {}, setEndMsg, setEndLoading)}>
                🚀 Launch Game
              </button>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
            <div>
              <button className="btn" style={{ background: 'var(--dire-color)', borderColor: 'var(--dire-color)' }}
                disabled={endLoading}
                onClick={() => callApi('/api/admin/steam/lobby/end', {}, setEndMsg, setEndLoading)}>
                {endLoading ? 'Leaving…' : '🚪 End / Leave Lobby'}
              </button>
              {msgEl(endMsg)}
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Send friend requests to all registered players so they can receive Steam reminders.</p>
              <button className="btn" disabled={friendsLoading}
                onClick={async () => {
                  setFriendsLoading(true); setFriendsMsg(null);
                  try {
                    const r = await fetch('/api/admin/steam/friends/add-all', { method: 'POST', headers: auth });
                    const d = await r.json();
                    setFriendsMsg({ ok: r.ok, text: d.message || d.error || (r.ok ? 'Requests sent!' : 'Failed') });
                    setTimeout(loadStatus, 3000);
                  } catch (e) { setFriendsMsg({ ok: false, text: e.message }); }
                  setFriendsLoading(false);
                }}>
                {friendsLoading ? 'Sending…' : '👥 Add All Known Friends'}
              </button>
              {msgEl(friendsMsg)}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

export default function AdminPanel() {
  const { isSuperuser, superuserKey, logout } = useSuperuser();
  const { selectedSeason } = useSeason();

  const [overview, setOverview] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');
  const [ts2Data, setTs2Data] = useState(null);
  const [ts2Loading, setTs2Loading] = useState(false);
  const [ts2Error, setTs2Error] = useState('');
  const [ranks, setRanks] = useState([]);
  const [rankSyncing, setRankSyncing] = useState(false);
  const [rankSyncMsg, setRankSyncMsg] = useState('');
  const [rankEditId, setRankEditId] = useState(null);
  const [rankEditTier, setRankEditTier] = useState('');
  const [rankEditLbRank, setRankEditLbRank] = useState('');
  const [signups, setSignups] = useState([]);
  const [signupsFilter, setSignupsFilter] = useState('pending');
  const [signupNotes, setSignupNotes] = useState({});

  const loadRanks = useCallback(() => {
    if (!isSuperuser) return;
    getPlayerRanks().then(setRanks).catch(() => {});
  }, [isSuperuser]);

  useEffect(() => { loadRanks(); }, [loadRanks]);

  const loadSignups = useCallback(() => {
    if (!isSuperuser) return;
    getSignupRequests(superuserKey, signupsFilter || null)
      .then(d => setSignups(d.requests || []))
      .catch(() => {});
  }, [isSuperuser, superuserKey, signupsFilter]);

  useEffect(() => { loadSignups(); }, [loadSignups]);

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
  }, [isSuperuser, loadOverview]);

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

      {/* Quick Links */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ marginBottom: 14 }}>Quick Links</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { to: '/admin/record-match', label: '📝 Record Match' },
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

      {/* Manual Match Entry — moved to its own page */}
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ marginBottom: 10 }}>Record a Match</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
          Manually record a match result when no replay is available.
        </p>
        <Link to="/admin/record-match" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          📝 Open Record Match Form
        </Link>
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

      {/* Steam Bot Controls */}
      <SteamBotPanel superuserKey={superuserKey} />

      {/* Stored Replays */}
      <ReplayManager superuserKey={superuserKey} />

      {/* Test Post-Match DM */}
      <TestDmPanel superuserKey={superuserKey} />

      {/* Test RSVP Registration DM */}
      <TestRsvpDmPanel superuserKey={superuserKey} />

      {/* Server Error Log */}
      <ErrorLogViewer superuserKey={superuserKey} />

      {/* TrueSkill 2 — Hidden Preview */}
      <section>
        <h2 style={{ marginBottom: 6 }}>
          🧪 TrueSkill 2 — Experimental Leaderboard
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
          Simulates TrueSkill 2 from scratch across all matches. Identical to TrueSkill 1 except
          each player's μ update is scaled by their per-match K/D/A performance relative to the
          other 9 players (modifier&nbsp;≈&nbsp;0.65×&nbsp;–&nbsp;1.35×). σ reduction is unchanged.
          Not stored anywhere — fully read-only.
        </p>
        <button
          className="btn"
          disabled={ts2Loading}
          onClick={async () => {
            setTs2Loading(true);
            setTs2Error('');
            setTs2Data(null);
            try {
              const sid = selectedSeason?.id ?? null;
              const url = `/api/admin/ts2-leaderboard${sid ? `?season_id=${sid}` : ''}`;
              const res = await fetch(url, { headers: authHeader });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || 'Failed');
              setTs2Data(json.leaderboard || []);
            } catch (e) {
              setTs2Error(e.message);
            } finally {
              setTs2Loading(false);
            }
          }}
          style={{ marginBottom: 16 }}
        >
          {ts2Loading ? 'Computing…' : ts2Data ? '🔄 Recompute' : '▶ Run TS2 Simulation'}
        </button>
        {ts2Error && <p style={{ color: 'var(--dire-color)', marginBottom: 12 }}>{ts2Error}</p>}
        {ts2Data && (
          <div style={{ overflowX: 'auto' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
              {ts2Data.length} players — sorted by TS2 MMR.{' '}
              <strong style={{ color: 'var(--radiant-color)' }}>Green delta</strong> = TS2 benefits this player.{' '}
              <strong style={{ color: 'var(--dire-color)' }}>Red delta</strong> = TS2 hurts them.
            </p>
            <table className="scoreboard" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center', width: 36 }}>#</th>
                  <th style={{ textAlign: 'left' }}>Player</th>
                  <th title="TrueSkill 2 MMR (experimental)">TS2 MMR</th>
                  <th title="Current TrueSkill 1 MMR (live)">TS1 MMR</th>
                  <th title="TS2 minus TS1 — how much this player gains or loses">Δ MMR</th>
                  <th title="TrueSkill 2 mu (mean skill)">μ</th>
                  <th title="TrueSkill 2 sigma (uncertainty)">σ</th>
                  <th>W</th>
                  <th>L</th>
                  <th>Games</th>
                </tr>
              </thead>
              <tbody>
                {ts2Data.map((p, i) => {
                  const deltaColor = p.delta > 0
                    ? 'var(--radiant-color)'
                    : p.delta < 0 ? 'var(--dire-color)' : 'var(--text-muted)';
                  const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
                  return (
                    <tr key={p.player_id}>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{medal}</td>
                      <td style={{ fontWeight: 600 }}>{p.display_name}</td>
                      <td className="col-stat" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        {p.ts2_mmr.toLocaleString()}
                      </td>
                      <td className="col-stat" style={{ color: 'var(--text-secondary)' }}>
                        {p.ts1_mmr.toLocaleString()}
                      </td>
                      <td className="col-stat" style={{ fontWeight: 700, color: deltaColor }}>
                        {p.delta > 0 ? '+' : ''}{p.delta}
                      </td>
                      <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {p.ts2_mu.toFixed(2)}
                      </td>
                      <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {p.ts2_sigma.toFixed(2)}
                      </td>
                      <td className="col-stat" style={{ color: 'var(--radiant-color)' }}>{p.wins}</td>
                      <td className="col-stat" style={{ color: 'var(--dire-color)' }}>{p.losses}</td>
                      <td className="col-stat">{p.games}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Dota Rank Management ─────────────────────────────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>🎖️ Dota 2 Rank Management</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Sync Dota 2 rank medals from OpenDota (public profiles) and Steam GC (friends). Manual entries are never overwritten by sync.
          Ranks appear on the Leaderboard and Player Profiles.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button
            className="btn btn-primary"
            disabled={rankSyncing}
            onClick={async () => {
              setRankSyncing(true);
              setRankSyncMsg('');
              try {
                const r = await triggerRankSync(superuserKey);
                setRankSyncMsg(r.message || 'Sync started in background — refresh in ~30s.');
              } catch (e) {
                setRankSyncMsg(`Error: ${e.message}`);
              } finally {
                setRankSyncing(false);
                setTimeout(loadRanks, 5000);
              }
            }}
          >
            {rankSyncing ? '⏳ Syncing…' : '🔄 Sync Ranks from OpenDota/GC'}
          </button>
          {rankSyncMsg && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{rankSyncMsg}</span>
          )}
        </div>

        <div className="scoreboard-wrapper">
          <table className="scoreboard" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Player</th>
                <th style={{ textAlign: 'left' }}>Account ID</th>
                <th>Dota Rank</th>
                <th>Source</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map(r => {
                const isEditing = rankEditId === r.account_id;
                const decoded  = decodeRankTier(r.dota_rank_tier);
                return (
                  <tr key={r.account_id}>
                    <td style={{ fontWeight: 600 }}>{r.nickname || `#${r.account_id}`}</td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.account_id}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.dota_rank_tier
                        ? <RankBadge rankTier={r.dota_rank_tier} leaderboardRank={r.dota_leaderboard_rank} source={r.dota_rank_source} />
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      }
                    </td>
                    <td style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 11 }}>
                      {r.dota_rank_source || '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {r.dota_rank_updated_at ? new Date(r.dota_rank_updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="number"
                            placeholder="Tier (e.g. 75)"
                            value={rankEditTier}
                            onChange={e => setRankEditTier(e.target.value)}
                            style={{ width: 90, padding: '2px 6px', fontSize: 12 }}
                          />
                          <input
                            type="number"
                            placeholder="LB rank"
                            value={rankEditLbRank}
                            onChange={e => setRankEditLbRank(e.target.value)}
                            style={{ width: 70, padding: '2px 6px', fontSize: 12 }}
                          />
                          <button
                            className="btn btn-sm"
                            onClick={async () => {
                              try {
                                await setManualRank(r.account_id, rankEditTier || null, rankEditLbRank || null, superuserKey);
                                setRankEditId(null);
                                loadRanks();
                              } catch (e) { alert(e.message); }
                            }}
                          >Save</button>
                          <button
                            className="btn btn-sm"
                            style={{ background: 'var(--bg-hover)' }}
                            onClick={() => setRankEditId(null)}
                          >Cancel</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              setRankEditId(r.account_id);
                              setRankEditTier(r.dota_rank_tier || '');
                              setRankEditLbRank(r.dota_leaderboard_rank || '');
                            }}
                          >✏️ Edit</button>
                          {r.dota_rank_tier && (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={async () => {
                                if (!confirm(`Clear rank for ${r.nickname || r.account_id}?`)) return;
                                try {
                                  await clearPlayerRank(r.account_id, superuserKey);
                                  loadRanks();
                                } catch (e) { alert(e.message); }
                              }}
                            >✕</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="section-title">Sign-Up Requests</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {['pending', 'approved', 'rejected', ''].map(f => (
            <button
              key={f || 'all'}
              className="btn btn-sm"
              style={{ background: signupsFilter === f ? 'var(--accent)' : 'var(--bg-card)', color: signupsFilter === f ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)' }}
              onClick={() => setSignupsFilter(f)}
            >
              {f ? f.charAt(0).toUpperCase() + f.slice(1) : 'All'}
            </button>
          ))}
          <button className="btn btn-sm" onClick={loadSignups} style={{ marginLeft: 8 }}>Refresh</button>
        </div>
        {signups.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No sign-up requests found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {signups.map(req => {
              const pos = Array.isArray(req.preferred_positions) ? req.preferred_positions.sort((a,b)=>a-b).map(p => `Pos ${p}`).join(', ') : '';
              const date = req.submitted_at ? new Date(req.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
              const statusColor = req.status === 'approved' ? 'var(--accent-green)' : req.status === 'rejected' ? 'var(--accent-red)' : '#f59e0b';
              return (
                <div key={req.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>
                        {req.discord_username}
                        <span style={{ marginLeft: 10, fontSize: 12, color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>{req.status}</span>
                      </div>
                      {req.preferred_name && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Name: {req.preferred_name}</div>}
                      {req.steam_url && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Steam: <a href={req.steam_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{req.steam_url}</a></div>}
                      {pos && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Preferred: {pos}</div>}
                      {req.message && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic' }}>"{req.message}"</div>}
                      {req.admin_notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Admin notes: {req.admin_notes}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Submitted: {date}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
                      <textarea
                        placeholder="Admin notes (optional)…"
                        value={signupNotes[req.id] ?? (req.admin_notes || '')}
                        onChange={e => setSignupNotes(n => ({ ...n, [req.id]: e.target.value }))}
                        rows={2}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#15803d', color: '#fff', flex: 1 }}
                          onClick={async () => {
                            try {
                              await updateSignupRequest(req.id, { status: 'approved', adminNotes: signupNotes[req.id] ?? req.admin_notes }, superuserKey);
                              loadSignups();
                            } catch (e) { alert(e.message); }
                          }}
                        >Approve</button>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#7f1d1d', color: '#fff', flex: 1 }}
                          onClick={async () => {
                            try {
                              await updateSignupRequest(req.id, { status: 'rejected', adminNotes: signupNotes[req.id] ?? req.admin_notes }, superuserKey);
                              loadSignups();
                            } catch (e) { alert(e.message); }
                          }}
                        >Reject</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
