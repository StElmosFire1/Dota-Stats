import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { useSeason } from '../context/SeasonContext';
import { getStoredReplays, extendReplayExpiry, getPlayerRanks, triggerRankSync, setManualRank, clearPlayerRank, getSignupRequests, updateSignupRequest, getSeasons, getSeasonTiers, ensureSeasonTiers, updateSeasonTier, placeAllPlayersInTiers, getSeasonTierPlayers, setSeasonEndConditions, closeSeasonApi, reannounceSeasonApi, setMatchReplayPath, getMatchReplayStatus, getAdminHeroTierOverrides, setAdminHeroTierOverride, deleteAdminHeroTierOverride, getTournaments, recomputeAchievements } from '../api';
import RankBadge, { decodeRankTier } from '../components/RankBadge';
import { TierBadge } from './Leaderboard';
import { ALL_HEROES, getHeroName } from '../heroNames';

// Catches render-phase errors in any child component and shows a helpful
// message instead of a blank screen.
class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          margin: '40px auto', maxWidth: 640, padding: 24,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 10, fontFamily: 'monospace', fontSize: 13,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#ef4444', marginBottom: 8 }}>
            ⚠️ Admin panel crashed
          </div>
          <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
            A section failed to render. This is usually caused by a newly-enabled feature flag
            whose component encountered unexpected data. Try disabling the most recently
            enabled preview flag and refreshing.
          </div>
          <pre style={{
            background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: 12,
            color: '#fca5a5', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {this.state.error?.message || String(this.state.error)}
            {this.state.error?.stack ? '\n\n' + this.state.error.stack : ''}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 12, padding: '6px 16px', borderRadius: 6,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

function DbBackupManager({ superuserKey }) {
  const [backups, setBackups] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');
  const [restoring, setRestoring] = useState('');
  const [deleting, setDeleting] = useState('');
  const [fixNickLoading, setFixNickLoading] = useState(false);
  const [fixNickResult, setFixNickResult] = useState(null);
  const authHeader = { 'x-superuser-key': superuserKey };

  function loadBackups() {
    fetch('/api/admin/list-backups', { headers: authHeader })
      .then(r => r.json())
      .then(d => setBackups(d.backups || []))
      .catch(() => setBackups([]));
  }

  function handleBackup() {
    setBackupLoading(true);
    setBackupMsg('');
    fetch('/api/admin/backup-db', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'manual' }) })
      .then(r => r.json())
      .then(d => {
        setBackupMsg(d.message || d.error || 'Done.');
        loadBackups();
      })
      .catch(e => setBackupMsg('Failed: ' + e.message))
      .finally(() => setBackupLoading(false));
  }

  function handleRestore(backup) {
    if (!window.confirm(`Restore from backup: ${backup}?\n\nThis will OVERWRITE the current player_stats, ratings, and rating_history tables with data from this snapshot. The current state cannot be recovered unless you have another backup.`)) return;
    setRestoring(backup);
    fetch('/api/admin/restore-backup', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ backup }) })
      .then(r => r.json())
      .then(d => { alert(d.message || d.error); loadBackups(); })
      .catch(e => alert('Restore failed: ' + e.message))
      .finally(() => setRestoring(''));
  }

  function handleDelete(backup) {
    if (!window.confirm(`Permanently delete backup: ${backup}?\n\nThis cannot be undone.`)) return;
    setDeleting(backup);
    fetch(`/api/admin/delete-backup/${backup}`, { method: 'DELETE', headers: authHeader })
      .then(r => r.json())
      .then(d => { loadBackups(); })
      .catch(e => alert('Delete failed: ' + e.message))
      .finally(() => setDeleting(''));
  }

  function handleFixNicknames(backup) {
    if (!window.confirm(
      `Fix nickname account IDs using backup: ${backup}?\n\n` +
      `This compares the backup (old wrong IDs) against current player_stats (correct IDs) ` +
      `to build a precise mapping, then updates every row in the nicknames table.\n\n` +
      `Any existing rank data on nicknames will be cleared so rank sync re-fetches with the correct IDs.`
    )) return;
    setFixNickLoading(true);
    setFixNickResult(null);
    fetch('/api/admin/fix-nickname-account-ids', {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup })
    })
      .then(r => r.json())
      .then(d => setFixNickResult(d))
      .catch(e => setFixNickResult({ error: e.message }))
      .finally(() => setFixNickLoading(false));
  }

  const fmtBackupDate = slug => {
    const m = slug.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!m) return slug;
    return `${m[4]}:${m[5]} ${m[3]}/${m[2]}/${m[1]}`;
  };
  const fmtBackupLabel = slug => slug.replace(/_\d{14}$/, '').replace(/_/g, ' ');

  return (
    <section style={{ marginBottom: 36, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Database Backups</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Snapshots of player_stats, ratings &amp; rating_history</span>
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px' }} onClick={loadBackups} disabled={backups !== null && backupLoading}>
          {backups === null ? 'Load' : 'Refresh'}
        </button>
        <button className="btn" style={{ fontSize: '0.8rem', padding: '3px 10px', color: '#4ade80', borderColor: '#4ade80' }}
          onClick={handleBackup} disabled={backupLoading}>
          {backupLoading ? 'Backing up…' : '💾 Backup Now'}
        </button>
        {backupMsg && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{backupMsg}</span>}
      </div>
      {backups === null && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Click "Load" to see existing backups.</p>}
      {backups !== null && backups.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No backups found. Backups are created automatically before "Re-parse All" runs.</p>}
      {backups !== null && backups.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Label</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Created (UTC)</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>Backup ID</th>
                <th style={{ padding: '4px 8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 8px' }}>{fmtBackupLabel(b)}</td>
                  <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{fmtBackupDate(b)}</td>
                  <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{b}</td>
                  <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button className="btn" style={{ fontSize: '0.72rem', padding: '2px 7px', color: '#fb923c', borderColor: '#fb923c' }}
                        onClick={() => handleFixNicknames(b)} disabled={fixNickLoading}>
                        {fixNickLoading ? 'Fixing…' : '🔧 Fix Nickname IDs'}
                      </button>
                      <button className="btn" style={{ fontSize: '0.72rem', padding: '2px 7px', color: '#facc15', borderColor: '#facc15' }}
                        onClick={() => handleRestore(b)} disabled={restoring === b}>
                        {restoring === b ? 'Restoring…' : '↩ Restore'}
                      </button>
                      <button className="btn" style={{ fontSize: '0.72rem', padding: '2px 7px', color: '#f87171', borderColor: '#f87171' }}
                        onClick={() => handleDelete(b)} disabled={deleting === b}>
                        {deleting === b ? 'Deleting…' : '🗑 Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {fixNickResult && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: fixNickResult.error ? '#450a0a' : '#052e16', border: `1px solid ${fixNickResult.error ? '#f87171' : '#4ade80'}`, fontSize: '0.82rem' }}>
              {fixNickResult.error ? (
                <span style={{ color: '#f87171' }}>Error: {fixNickResult.error}</span>
              ) : (
                <div>
                  <div style={{ color: '#4ade80' }}>✓ {fixNickResult.message}</div>
                  {fixNickResult.updated > 0 && (
                    <div style={{ color: '#86efac', marginTop: 4 }}>
                      <strong>Now go to Dota 2 Rank Management and run Rank Sync.</strong>
                    </div>
                  )}
                  {fixNickResult.skipped_conflicts > 0 && fixNickResult.skipped_details?.length > 0 && (
                    <div style={{ marginTop: 6, color: '#facc15' }}>
                      ⚠ Genuinely ambiguous IDs (equal matches for two different players) — set these manually:
                      {fixNickResult.skipped_details.map((s, i) => (
                        <div key={i} style={{ fontFamily: 'monospace', fontSize: '0.75rem', marginTop: 2 }}>
                          old {s.old_id} → candidates: {s.candidates.map(c => `${c.new_id} (${c.occurrences} matches)`).join(' vs ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
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
    if (!window.confirm(`Re-parse ALL stored replays?\n\nA snapshot of the current database will be created automatically before starting, so you can roll back if needed.\n\nThis runs in the background and may take a long time. Stats for every replay on file will be updated and MMR recalculated for all players in chronological order. Season assignments are preserved.`)) return;
    setReparseAllLoading(true);
    fetch('/api/admin/reparse-all-replays', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
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
              Re-parse: {reparseAllStatus.status.phase === 'complete' ? '✓ Complete — MMR recalculated' : '⏳ Running'} —&nbsp;
              {reparseAllStatus.status.done}/{reparseAllStatus.status.total} done,&nbsp;
              {reparseAllStatus.status.failed} failed,&nbsp;
              {reparseAllStatus.status.remaining} remaining
              {reparseAllStatus.status.backup && (
                <div style={{ color: '#4ade80', marginTop: 4 }}>
                  💾 Backup taken before start: <code style={{ fontSize: '0.75rem' }}>{reparseAllStatus.status.backup}</code>
                  &nbsp;— use the Database Backups panel above to restore if needed.
                </div>
              )}
              {reparseAllStatus.status.errors?.length > 0 && (
                <div style={{ color: '#f87171', marginTop: 4 }}>
                  {reparseAllStatus.status.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </span>
          ) : (
            <div>
              <span>{reparseAllStatus.message}</span>
              {reparseAllStatus.backup && (
                <div style={{ color: '#4ade80', marginTop: 4, fontSize: '0.8rem' }}>
                  💾 Backup: <code style={{ fontSize: '0.75rem' }}>{reparseAllStatus.backup}</code>
                </div>
              )}
            </div>
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

function ReplayArchiveManager({ superuserKey }) {
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pathInputs, setPathInputs] = useState({});
  const [saving, setSaving] = useState({});
  const [saveMsg, setSaveMsg] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMatchReplayStatus(superuserKey);
      setMatches(data.matches || []);
    } catch (err) {
      setMatches([]);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  const handleSavePath = useCallback(async (matchId) => {
    const p = (pathInputs[matchId] || '').trim();
    setSaving(s => ({ ...s, [matchId]: true }));
    setSaveMsg(s => ({ ...s, [matchId]: '' }));
    try {
      const result = await setMatchReplayPath(matchId, p, superuserKey);
      const storedPath = result?.replay_path || null;
      setSaveMsg(s => ({ ...s, [matchId]: storedPath ? `✓ Saved: ${storedPath}` : '✓ Cleared' }));
      setMatches(ms => ms.map(m => m.match_id === matchId ? { ...m, replay_path: storedPath } : m));
    } catch (err) {
      setSaveMsg(s => ({ ...s, [matchId]: '✗ ' + err.message }));
    } finally {
      setSaving(s => ({ ...s, [matchId]: false }));
    }
  }, [pathInputs, superuserKey]);

  return (
    <section className="admin-section">
      <h2>Replay Archive (Dedicated Server)</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
        Matches archived from the dedicated server via SSH. Pro members and admins can download these. Use the path field to manually link a .dem file.
      </p>
      <button className="btn" onClick={load} disabled={loading}>
        {loading ? 'Loading…' : matches === null ? 'Load Replay Archive Status' : 'Refresh'}
      </button>
      {matches !== null && matches.length === 0 && (
        <p style={{ fontSize: 13, marginTop: 10, color: 'var(--text-muted)' }}>No matches found.</p>
      )}
      {matches !== null && matches.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="admin-table" style={{ fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th>Match ID</th>
                <th>Date</th>
                <th>Archive Status</th>
                <th>Remote Path</th>
                <th>Set Path Manually</th>
              </tr>
            </thead>
            <tbody>
              {matches.map(m => (
                <tr key={m.match_id}>
                  <td>
                    <a href={`/match/${m.match_id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                      {m.match_id}
                    </a>
                  </td>
                  <td>{m.date ? new Date(m.date).toLocaleDateString() : '—'}</td>
                  <td>
                    {m.replay_path
                      ? <span style={{ color: '#4ade80', fontWeight: 600 }}>✓ Archived</span>
                      : <span style={{ color: '#f87171' }}>✗ Not archived</span>}
                  </td>
                  <td style={{ maxWidth: 260, wordBreak: 'break-all', fontSize: 11, color: 'var(--text-muted)' }}>
                    {m.replay_path || '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="match_123.dem or full path (empty to clear)"
                        value={pathInputs[m.match_id] || ''}
                        onChange={e => setPathInputs(p => ({ ...p, [m.match_id]: e.target.value }))}
                        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, minWidth: 220,
                          background: 'var(--bg-input, #0f172a)', border: '1px solid var(--border, #334155)',
                          color: 'var(--text-primary, #f1f5f9)' }}
                      />
                      <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }}
                        disabled={saving[m.match_id]}
                        onClick={() => handleSavePath(m.match_id)}>
                        {saving[m.match_id] ? '…' : 'Save'}
                      </button>
                      {saveMsg[m.match_id] && (
                        <span style={{ fontSize: 11, color: saveMsg[m.match_id].startsWith('✓') ? '#4ade80' : '#f87171' }}>
                          {saveMsg[m.match_id]}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        Archive directory is controlled by <code>REPLAY_ARCHIVE_DIR</code> on the dedicated server.
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

// Season Lifecycle panel — configure end conditions (end date / match limit) and
// manually close a season + post the Discord summary embed.
function SeasonLifecyclePanel({ superuserKey }) {
  const [seasons, setSeasons] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [endDate, setEndDate] = useState('');
  const [matchLimit, setMatchLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [reannouncing, setReannouncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getSeasons()
      .then(raw => {
        const list = raw?.seasons || (Array.isArray(raw) ? raw : []);
        setSeasons(list);
        const active = list.find(s => s.active) || list[0];
        if (active) {
          setSelectedId(String(active.id));
          setEndDate(active.end_date ? active.end_date.slice(0, 10) : '');
          setMatchLimit(active.match_count_limit != null ? String(active.match_count_limit) : '');
        }
      })
      .catch(() => {});
  }, []);

  const selectedSeason = seasons.find(s => String(s.id) === selectedId);

  function handleSeasonChange(e) {
    const id = e.target.value;
    setSelectedId(id);
    setMsg(''); setError('');
    const s = seasons.find(s => String(s.id) === id);
    if (s) {
      setEndDate(s.end_date ? s.end_date.slice(0, 10) : '');
      setMatchLimit(s.match_count_limit != null ? String(s.match_count_limit) : '');
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    try {
      const res = await setSeasonEndConditions(
        selectedId,
        { end_date: endDate || null, match_count_limit: matchLimit ? parseInt(matchLimit) : null },
        superuserKey
      );
      const s = res.season;
      setSeasons(prev => prev.map(x => String(x.id) === selectedId ? { ...x, ...s } : x));
      setMsg('End conditions saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    if (!selectedId) return;
    const s = selectedSeason;
    if (!window.confirm(
      `Close season "${s?.name}"?\n\n` +
      `This will archive the season, generate the end-of-season summary, post a Discord embed, ` +
      `and automatically activate the next pending season (if one exists).\n\nThis cannot be undone.`
    )) return;
    setClosing(true); setMsg(''); setError('');
    try {
      const res = await closeSeasonApi(selectedId, superuserKey);
      setMsg(res.message || 'Season closed and announced.');
      const raw = await getSeasons();
      const list = raw?.seasons || (Array.isArray(raw) ? raw : []);
      setSeasons(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setClosing(false);
    }
  }

  async function handleReannounce() {
    if (!selectedId) return;
    const s = selectedSeason;
    if (!window.confirm(
      `Repost the end-of-season announcement for "${s?.name}"?\n\n` +
      `This will re-send the season summary embed to the Discord announce channel. ` +
      `No data will be changed — the season stays archived.`
    )) return;
    setReannouncing(true); setMsg(''); setError('');
    try {
      const res = await reannounceSeasonApi(selectedId, superuserKey);
      setMsg(res.message || 'Announcement reposted.');
    } catch (err) {
      setError(err.message);
    } finally {
      setReannouncing(false);
    }
  }

  return (
    <section style={{ marginBottom: 36, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: '1rem' }}>📅 Season Lifecycle</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        Configure automatic end conditions for each season, or manually close a season and post the
        end-of-season summary to Discord. The bot checks conditions after every match is recorded.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Season:&nbsp;
          <select value={selectedId} onChange={handleSeasonChange} style={{ marginLeft: 6 }}>
            <option value="">— Select —</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.active ? ' (active)' : s.is_legacy ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedId && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                End Date (auto-close on this date)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                Match Count Limit (auto-close after N games)
              </label>
              <input
                type="number"
                min={1}
                value={matchLimit}
                onChange={e => setMatchLimit(e.target.value)}
                placeholder="e.g. 50"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="submit" disabled={saving} style={{ fontSize: 13 }}>
              {saving ? 'Saving…' : '💾 Save End Conditions'}
            </button>
            <button
              className="btn"
              type="button"
              disabled={closing || !selectedSeason || !!selectedSeason?.is_legacy}
              onClick={handleClose}
              title={selectedSeason?.is_legacy ? 'Season already archived — use Repost Announcement instead' : undefined}
              style={{ fontSize: 13, color: '#f87171', borderColor: '#f87171', opacity: selectedSeason?.is_legacy ? 0.4 : 1 }}
            >
              {closing ? 'Closing…' : '🏁 Close Season & Post Summary'}
            </button>
            {selectedSeason?.is_legacy && (
              <button
                className="btn"
                type="button"
                disabled={reannouncing}
                onClick={handleReannounce}
                style={{ fontSize: 13, color: '#a78bfa', borderColor: '#a78bfa' }}
              >
                {reannouncing ? 'Reposting…' : '📢 Repost Announcement'}
              </button>
            )}
            {selectedSeason && (
              <a
                href={`/seasons/${selectedId}/summary`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'underline' }}
              >
                View Summary Page ↗
              </a>
            )}
          </div>
          {msg && <div style={{ fontSize: 13, color: '#4ade80' }}>✓ {msg}</div>}
          {error && <div style={{ fontSize: 13, color: '#f87171' }}>Error: {error}</div>}
        </form>
      )}
    </section>
  );
}

// 1.6 — Season Tiers admin panel.
// Lists tiers per season with name/MMR-floor editing, plus actions to seed default
// tiers and place all rated players into their MMR-derived tier in one shot.
// Whole panel is gated on the `multi_tier_seasons` feature flag — when off the
// panel is hidden even from superusers (preview/on flips it back on).
function SeasonTiersPanel({ superuserKey }) {
  const enabled = useFeatureFlag('multi_tier_seasons');
  if (!enabled) return null;
  return <SeasonTiersPanelInner superuserKey={superuserKey} />;
}

function SeasonTiersPanelInner({ superuserKey }) {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [tiers, setTiers] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savingTier, setSavingTier] = useState(null);
  const [busy, setBusy] = useState(null);
  const [edits, setEdits] = useState({});

  const refreshSeasons = useCallback(async () => {
    try {
      const raw = await getSeasons();
      const list = raw?.seasons || (Array.isArray(raw) ? raw : []);
      setSeasons(list);
      if (!seasonId && list.length) {
        const active = list.find(s => s.is_active) || list[list.length - 1];
        setSeasonId(String(active.id));
      }
    } catch (err) {
      setError(err.message || 'Failed to load seasons');
    }
  }, [seasonId]);

  const refreshTiers = useCallback(async () => {
    if (!seasonId) return;
    try {
      setLoading(true);
      const data = await getSeasonTiers(seasonId);
      const tierList = data.tiers || [];
      setTiers(tierList);
      // Pull player counts per tier in parallel.
      const counts = {};
      await Promise.all(tierList.map(async t => {
        try {
          const r = await getSeasonTierPlayers(seasonId, t.tier_number);
          counts[t.tier_number] = (r.players || []).length;
        } catch {
          counts[t.tier_number] = 0;
        }
      }));
      setCounts(counts);
      setEdits({});
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load tiers');
    } finally {
      setLoading(false);
    }
  }, [seasonId]);

  useEffect(() => { refreshSeasons(); }, [refreshSeasons]);
  useEffect(() => { refreshTiers(); }, [refreshTiers]);

  const handleSeed = async () => {
    if (!seasonId) return;
    if (!window.confirm('Seed the default 8-tier ladder for this season?\n\nExisting tier names/floors will be left alone — only missing tiers are inserted.')) return;
    try {
      setBusy('seed');
      await ensureSeasonTiers(seasonId, superuserKey);
      await refreshTiers();
    } catch (err) {
      setError(err.message || 'Failed to seed tiers');
    } finally {
      setBusy(null);
    }
  };

  const handlePlaceAll = async () => {
    if (!seasonId) return;
    if (!window.confirm('Place every rated player into their MMR-derived tier?\n\nThis is safe to re-run — players are re-placed based on current TrueSkill MMR.')) return;
    try {
      setBusy('place');
      // helper signature is (seasonId, force, superuserKey) — force=true so
      // re-running re-places players based on current MMR.
      const r = await placeAllPlayersInTiers(seasonId, true, superuserKey);
      await refreshTiers();
      alert(`Placed ${r.placed || 0} player(s) into tiers.`);
    } catch (err) {
      setError(err.message || 'Failed to place players');
    } finally {
      setBusy(null);
    }
  };

  const setEdit = (tn, patch) => setEdits(e => ({ ...e, [tn]: { ...(e[tn] || {}), ...patch } }));

  const saveTier = async (tn) => {
    const patch = edits[tn];
    if (!patch) return;
    try {
      setSavingTier(tn);
      await updateSeasonTier(seasonId, tn, {
        name: patch.name,
        min_mmr: patch.min_mmr !== undefined ? Number(patch.min_mmr) : undefined,
        sponsor_name: patch.sponsor_name !== undefined ? (patch.sponsor_name || null) : undefined,
        sponsor_active_from: patch.sponsor_active_from !== undefined ? (patch.sponsor_active_from || null) : undefined,
        sponsor_active_until: patch.sponsor_active_until !== undefined ? (patch.sponsor_active_until || null) : undefined,
      }, superuserKey);
      await refreshTiers();
    } catch (err) {
      setError(err.message || 'Failed to update tier');
    } finally {
      setSavingTier(null);
    }
  };

  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ marginBottom: 6 }}>🏆 Season Tiers</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Manage the 8-tier MMR ladder for each season. Players are auto-placed by their TrueSkill MMR
        (display MMR = round((μ − 3σ) × 100) + 5000). Default Tier V floor is <strong>5000</strong>.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ fontSize: 13 }}>Season:&nbsp;
          <select
            value={seasonId}
            onChange={e => setSeasonId(e.target.value)}
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px' }}
          >
            <option value="">— select —</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>
                #{s.id} {s.name || ''}{s.is_active ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button onClick={handleSeed} disabled={!seasonId || busy === 'seed'} className="btn">
          {busy === 'seed' ? 'Seeding…' : 'Seed default tiers'}
        </button>
        <button onClick={handlePlaceAll} disabled={!seasonId || busy === 'place' || tiers.length === 0} className="btn btn-primary">
          {busy === 'place' ? 'Placing…' : 'Place all players by MMR'}
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {loading ? <div>Loading…</div> : tiers.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {seasonId ? 'No tiers yet — click "Seed default tiers" to create the 8-tier ladder.' : 'Pick a season above.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>#</th>
                <th style={{ padding: '8px 10px' }}>Name</th>
                <th style={{ padding: '8px 10px' }}>Min MMR</th>
                <th style={{ padding: '8px 10px' }}>Sponsor (optional)</th>
                <th style={{ padding: '8px 10px' }}>Players</th>
                <th style={{ padding: '8px 10px' }}></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(t => {
                const draftName = edits[t.tier_number]?.name ?? t.name;
                const draftFloor = edits[t.tier_number]?.min_mmr ?? t.min_mmr;
                const draftSponsor = edits[t.tier_number]?.sponsor_name ?? (t.sponsor_name || '');
                const draftSponsorFrom = edits[t.tier_number]?.sponsor_active_from ?? (t.sponsor_active_from ? t.sponsor_active_from.slice(0, 10) : '');
                const draftSponsorUntil = edits[t.tier_number]?.sponsor_active_until ?? (t.sponsor_active_until ? t.sponsor_active_until.slice(0, 10) : '');
                const dirty = edits[t.tier_number] && (
                  (edits[t.tier_number].name !== undefined && edits[t.tier_number].name !== t.name)
                  || (edits[t.tier_number].min_mmr !== undefined && Number(edits[t.tier_number].min_mmr) !== Number(t.min_mmr))
                  || edits[t.tier_number].sponsor_name !== undefined
                  || edits[t.tier_number].sponsor_active_from !== undefined
                  || edits[t.tier_number].sponsor_active_until !== undefined
                );
                return (
                  <tr key={t.tier_number} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#a78bfa' }}>{t.tier_number}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="text"
                        value={draftName}
                        onChange={e => setEdit(t.tier_number, { name: e.target.value })}
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 200 }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="number"
                        value={draftFloor}
                        onChange={e => setEdit(t.tier_number, { min_mmr: e.target.value })}
                        style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 100 }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          value={draftSponsor}
                          onChange={e => setEdit(t.tier_number, { sponsor_name: e.target.value })}
                          placeholder="Sponsor name (optional)"
                          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 180 }}
                        />
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="date"
                            value={draftSponsorFrom}
                            onChange={e => setEdit(t.tier_number, { sponsor_active_from: e.target.value })}
                            title="Sponsor active from"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 12 }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→</span>
                          <input
                            type="date"
                            value={draftSponsorUntil}
                            onChange={e => setEdit(t.tier_number, { sponsor_active_until: e.target.value })}
                            title="Sponsor active until"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', fontSize: 12 }}
                          />
                        </div>
                        {draftFloor != null && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Preview:</span>
                            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Normal</span>
                              <TierBadge
                                mmr={Number(draftFloor)}
                                useV3={true}
                                dbTiers={[{ min_mmr: Number(draftFloor), name: draftName || t.name, sponsor_name: null }]}
                              />
                            </span>
                            {draftSponsor && (
                              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sponsored (when active)</span>
                                <TierBadge
                                  mmr={Number(draftFloor)}
                                  useV3={true}
                                  dbTiers={[{
                                    min_mmr: Number(draftFloor),
                                    name: draftName || t.name,
                                    sponsor_name: draftSponsor,
                                    sponsor_active_from: '2000-01-01',
                                    sponsor_active_until: '2099-01-01',
                                  }]}
                                />
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{counts[t.tier_number] ?? '—'}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <button
                        onClick={() => saveTier(t.tier_number)}
                        disabled={!dirty || savingTier === t.tier_number}
                        className="btn btn-primary"
                        style={{ fontSize: 12, padding: '4px 10px', opacity: dirty ? 1 : 0.5 }}
                      >
                        {savingTier === t.tier_number ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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

function EngagementSettingsPanel({ superuserKey, siteSettings, onSaved }) {
  const [milestones, setMilestones] = React.useState('');
  const [referralXp, setReferralXp] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    if (siteSettings.engagement_milestone_thresholds !== undefined) {
      setMilestones(siteSettings.engagement_milestone_thresholds ?? '50,100,150,200');
    }
    if (siteSettings.engagement_referral_xp !== undefined) {
      setReferralXp(siteSettings.engagement_referral_xp ?? '50');
    }
  }, [siteSettings.engagement_milestone_thresholds, siteSettings.engagement_referral_xp]);

  const saveSetting = async (key, value) => {
    const r = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
      body: JSON.stringify({ key, value }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed');
  };

  const handleSave = async () => {
    const thresholdNums = milestones.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
    if (thresholdNums.length === 0) {
      setMsg('Error: Enter at least one valid milestone number.');
      return;
    }
    const xpNum = parseInt(referralXp, 10);
    if (isNaN(xpNum) || xpNum < 0) {
      setMsg('Error: Referral XP must be a non-negative number.');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      await Promise.all([
        saveSetting('engagement_milestone_thresholds', thresholdNums.join(',')),
        saveSetting('engagement_referral_xp', String(xpNum)),
      ]);
      setMsg('Saved.');
      if (onSaved) onSaved();
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ marginBottom: 6 }}>🎯 Engagement</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Configure milestone thresholds and referral XP. Changes take effect immediately — no redeploy required.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Milestone thresholds (comma-separated match counts)
          </label>
          <input
            type="text"
            value={milestones}
            onChange={e => setMilestones(e.target.value)}
            placeholder="50,100,150,200"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: 14,
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            A Discord announcement is posted when a player's total match count hits any of these values.
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Referral XP amount
          </label>
          <input
            type="number"
            min="0"
            value={referralXp}
            onChange={e => setReferralXp(e.target.value)}
            placeholder="50"
            style={{
              width: 120,
              padding: '7px 10px', borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: 14,
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            XP granted to the referrer when a player they invited completes registration.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Engagement Settings'}
          </button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function WelcomeModalPanel({ superuserKey }) {
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    fetch('/api/settings/welcome-modal')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        let parsed = { enabled: false, version: 1, eyebrow: '', title: '', body: '', ctaText: '', ctaHref: '' };
        if (d?.value) {
          try { parsed = { ...parsed, ...(typeof d.value === 'string' ? JSON.parse(d.value) : d.value) }; } catch {}
        }
        setCfg(parsed);
      })
      .catch(() => setCfg({ enabled: false, version: 1, eyebrow: '', title: '', body: '', ctaText: '', ctaHref: '' }));
  }, []);

  if (!cfg) return null;
  const upd = (k, v) => setCfg(c => ({ ...c, [k]: v }));

  const save = async (bumpVersion) => {
    setSaving(true); setMsg('');
    try {
      const payload = { ...cfg };
      if (bumpVersion) payload.version = (parseInt(cfg.version, 10) || 1) + 1;
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ key: 'welcome_modal', value: JSON.stringify(payload) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      try { setCfg(JSON.parse(d.setting.value)); } catch {}
      setMsg(bumpVersion ? 'Saved & re-shown to all users.' : 'Saved.');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '7px 10px', borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
    fontSize: 14, fontFamily: 'inherit',
  };

  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ marginBottom: 6 }}>📣 Welcome Modal (CMS)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Editor-controlled welcome modal shown to all visitors. Bump the version to re-show it to users
        who already dismissed the previous one.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 580 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={!!cfg.enabled} onChange={e => upd('enabled', e.target.checked)} />
          Modal enabled
        </label>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Eyebrow</label>
          <input type="text" value={cfg.eyebrow || ''} onChange={e => upd('eyebrow', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Title *</label>
          <input type="text" value={cfg.title || ''} onChange={e => upd('title', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Body</label>
          <textarea rows={4} value={cfg.body || ''} onChange={e => upd('body', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>CTA text</label>
            <input type="text" value={cfg.ctaText || ''} onChange={e => upd('ctaText', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>CTA href</label>
            <input type="text" value={cfg.ctaHref || ''} onChange={e => upd('ctaHref', e.target.value)} placeholder="/patch-notes" style={inputStyle} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Current version: <strong>v{cfg.version || 1}</strong> · dismiss key: <code>welcome_modal_dismissed_v{cfg.version || 1}</code>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" disabled={saving} onClick={() => save(false)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
            Save & re-show to everyone (bump version)
          </button>
          {msg && (
            <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>
              {msg}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

export default function AdminPanel() {
  const { isSuperuser, superuserKey, logout } = useSuperuser();
  const { activeSeason } = useSeason();

  const [overview, setOverview] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const [dupLoading, setDupLoading] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState('');
  const [siteSettings, setSiteSettings] = useState({});
  const [ratingToggleSaving, setRatingToggleSaving] = useState(false);
  const [ratingToggleMsg, setRatingToggleMsg] = useState('');
  const [v3PreviewOpen, setV3PreviewOpen] = useState(false);
  const [v3PreviewData, setV3PreviewData] = useState(null);
  const [v3PreviewLoading, setV3PreviewLoading] = useState(false);
  const [v3PreviewError, setV3PreviewError] = useState('');
  const [ranks, setRanks] = useState([]);
  const [rankSyncing, setRankSyncing] = useState(false);
  const [rankSyncMsg, setRankSyncMsg] = useState('');
  const [rankEditId, setRankEditId] = useState(null);
  const [rankEditTier, setRankEditTier] = useState('');
  const [rankEditLbRank, setRankEditLbRank] = useState('');
  const [rankEditMedal, setRankEditMedal] = useState('');
  const [rankEditStars, setRankEditStars] = useState('');
  const MEDAL_NAMES = ['Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  const [signups, setSignups] = useState([]);
  const [signupsFilter, setSignupsFilter] = useState('pending');
  const [signupNotes, setSignupNotes] = useState({});
  const [signupFeedback, setSignupFeedback] = useState({});
  const [pendingSignupCount, setPendingSignupCount] = useState(null);

  const [unregistered, setUnregistered] = useState(null);
  const [unregLoading, setUnregLoading] = useState(false);

  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('admin_active_tab') || 'overview'; } catch { return 'overview'; }
  });
  useEffect(() => {
    try { localStorage.setItem('admin_active_tab', activeTab); } catch {}
  }, [activeTab]);

  const loadRanks = useCallback(() => {
    if (!isSuperuser) return;
    getPlayerRanks().then(setRanks).catch(() => {});
  }, [isSuperuser]);

  useEffect(() => { loadRanks(); }, [loadRanks]);

  const loadUnregistered = useCallback(async () => {
    if (!isSuperuser) return;
    setUnregLoading(true);
    try {
      const r = await fetch('/api/admin/unregistered-players', { headers: { 'x-superuser-key': superuserKey } });
      const d = await r.json();
      setUnregistered(Array.isArray(d) ? d : []);
    } catch {
      setUnregistered([]);
    } finally {
      setUnregLoading(false);
    }
  }, [isSuperuser, superuserKey]);

  const loadSignups = useCallback(() => {
    if (!isSuperuser) return;
    getSignupRequests(superuserKey, signupsFilter || null)
      .then(d => setSignups(d.requests || []))
      .catch(() => {});
  }, [isSuperuser, superuserKey, signupsFilter]);

  useEffect(() => { loadSignups(); }, [loadSignups]);

  // Keep a stable pending count for the Quick Links badge
  useEffect(() => {
    if (signupsFilter === 'pending') setPendingSignupCount(signups.length);
  }, [signups, signupsFilter]);

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

  const loadSiteSettings = useCallback(() => {
    if (!isSuperuser) return;
    fetch('/api/admin/settings', { headers: authHeader })
      .then(r => r.json())
      .then(d => setSiteSettings(d.settings || {}))
      .catch(() => {});
  }, [isSuperuser, superuserKey]);

  useEffect(() => { loadSiteSettings(); }, [loadSiteSettings]);

  const useV3 = siteSettings.use_v3_trueskill === 'true';

  const handleToggleRatingSystem = async () => {
    const target = useV3 ? 'V1 (Standard)' : 'V3 (Enhanced)';
    const ok = window.confirm(
      `Switch the active rating system to ${target}?\n\n`
      + 'This will immediately recompute the public leaderboard and all player MMRs '
      + 'on the next API call. Intended for season-start use only.'
    );
    if (!ok) return;
    setRatingToggleSaving(true);
    setRatingToggleMsg('');
    try {
      const r = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'use_v3_trueskill', value: useV3 ? 'false' : 'true' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setSiteSettings(s => ({ ...s, use_v3_trueskill: useV3 ? 'false' : 'true' }));
      setRatingToggleMsg(`Now using ${useV3 ? 'V1 (Standard)' : 'V3 (Enhanced)'}.`);
    } catch (e) {
      setRatingToggleMsg(`Error: ${e.message}`);
    } finally {
      setRatingToggleSaving(false);
    }
  };

  const handleRunV3Preview = async () => {
    setV3PreviewLoading(true);
    setV3PreviewError('');
    setV3PreviewData(null);
    try {
      const sid = activeSeason?.id ?? null;
      const url = `/api/admin/v3-preview${sid ? `?season_id=${sid}` : ''}`;
      const res = await fetch(url, { headers: authHeader });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setV3PreviewData(json.leaderboard || []);
    } catch (e) {
      setV3PreviewError(e.message);
    } finally {
      setV3PreviewLoading(false);
    }
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

  if (!isSuperuser) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: 16 }}>🔒 Admin Panel</h2>
        <p style={{ color: 'var(--text-muted)' }}>You must be logged in as superuser to access this page.</p>
        <p style={{ marginTop: 12, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Use the 🛡️ Superuser button in the top navigation to log in.</p>
      </div>
    );
  }

  const ADMIN_NAV = [
    { label: 'Dashboard', items: [
      { id: 'overview', icon: '📊', label: 'Overview' },
    ]},
    { label: 'Match Data', items: [
      { id: 'matches', icon: '🎮', label: 'Matches & Replays' },
    ]},
    { label: 'Bot Tools', items: [
      { id: 'steambot', icon: '🤖', label: 'Steam Bot & Test DMs' },
    ]},
    { label: 'Config', items: [
      { id: 'seasons', icon: '🏆', label: 'Seasons & Ratings' },
      { id: 'config', icon: '⚙️', label: 'Site Settings' },
    ]},
    { label: 'Users', items: [
      { id: 'users', icon: '👥', label: 'Players & Sign-Ups', badge: pendingSignupCount > 0 ? pendingSignupCount : null },
    ]},
    { label: 'Marketplace', items: [
      { id: 'marketplace', icon: '💰', label: 'Gifts, Coaching & Tournaments' },
    ]},
  ];

  return (
    <AdminErrorBoundary>
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>🔒 Admin Panel</h1>
        <button className="btn" onClick={logout} style={{ fontSize: '0.85rem' }}>Log out</button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Manage matches, ratings, and data.</p>

      <div className="ap-grid">
        <aside className="ap-sidebar">
          {ADMIN_NAV.map(group => (
            <div key={group.label} className="ap-nav-group">
              <div className="ap-nav-group-label">{group.label}</div>
              {group.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`ap-nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <span className="ap-nav-icon" aria-hidden>{item.icon}</span>
                  <span className="ap-nav-label">{item.label}</span>
                  {item.badge ? <span className="ap-nav-badge">{item.badge}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </aside>
        <div className="ap-main">

      {activeTab === 'overview' && (<>
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
          <button
            className="btn"
            onClick={() => {
              const el = document.getElementById('signup-requests');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            style={{ position: 'relative' }}
          >
            📋 Applications
            {pendingSignupCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#e74c3c', color: '#fff',
                borderRadius: '50%', width: 18, height: 18,
                fontSize: '0.7rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>{pendingSignupCount}</span>
            )}
          </button>
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

      </>)}

      {activeTab === 'matches' && (<>
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

      </>)}

      {activeTab === 'steambot' && (<>
      {/* Steam Bot Controls */}
      <SteamBotPanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'matches' && (<>
      {/* Database Backups */}
      <DbBackupManager superuserKey={superuserKey} />

      {/* Stored Replays */}
      <ReplayManager superuserKey={superuserKey} />

      {/* Replay Archive (dedicated server) */}
      <ReplayArchiveManager superuserKey={superuserKey} />
      </>)}

      {activeTab === 'steambot' && (<>
      {/* Test Post-Match DM */}
      <TestDmPanel superuserKey={superuserKey} />

      {/* Test RSVP Registration DM */}
      <TestRsvpDmPanel superuserKey={superuserKey} />

      {/* Server Error Log */}
      <ErrorLogViewer superuserKey={superuserKey} />
      </>)}

      {activeTab === 'seasons' && (<>
      {/* Season Tiers — 8-tier ladder per season */}
      <SeasonTiersPanel superuserKey={superuserKey} />

      {/* Season Lifecycle — end conditions + manual close */}
      <SeasonLifecyclePanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'marketplace' && (<>
      {/* Gift Purchases — audit all sent/received gifts */}
      <GiftPurchasesPanel superuserKey={superuserKey} />

      {/* Coaching Marketplace — pending KYC + open disputes + revenue */}
      <CoachingAdminPanel superuserKey={superuserKey} />

      {/* Tournament Brackets — active tournaments and bracket management */}
      <TournamentBracketPanel />
      </>)}

      {activeTab === 'seasons' && (<>
      {/* Rating System — V1 vs V3 toggle + preview */}
      <section>
        <h2 style={{ marginBottom: 6 }}>⚖️ Rating System</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
          Controls which TrueSkill engine powers the public leaderboard and player profiles.
          Switching rating systems takes effect immediately — only flip this at the start of a season.
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          padding: 14, background: 'var(--surface-2, rgba(255,255,255,0.03))',
          borderRadius: 8, marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Currently Active</div>
            <span style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 12,
              fontWeight: 700, fontSize: 13,
              background: useV3 ? 'var(--radiant-color)' : 'var(--text-muted)',
              color: '#fff',
            }}>
              {useV3 ? 'V3 (Enhanced)' : 'V1 (Standard)'}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 220, fontSize: 12, color: 'var(--text-muted)' }}>
            {useV3 ? (
              <>V3 fixes draw probability (Dota can't draw), floors σ at 2.5 to keep veterans fluid, and applies a per-match Impact-style modifier (±20%) to the μ update.</>
            ) : (
              <>V1 is the original TrueSkill default — uniform team-based rating updates, no per-player performance weighting.</>
            )}
          </div>
          <button
            className="btn"
            disabled={ratingToggleSaving}
            onClick={handleToggleRatingSystem}
          >
            {ratingToggleSaving ? 'Saving…' : useV3 ? 'Switch to V1' : 'Switch to V3'}
          </button>
        </div>
        {ratingToggleMsg && (
          <p style={{
            marginTop: -8, marginBottom: 12, fontSize: 13,
            color: ratingToggleMsg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)',
          }}>
            {ratingToggleMsg}
          </p>
        )}

        <button
          className="btn"
          onClick={() => setV3PreviewOpen(o => !o)}
          style={{ marginBottom: 12 }}
        >
          {v3PreviewOpen ? '▲ Hide V3 vs V1 Preview' : '▼ Show V3 vs V1 Preview'}
        </button>

        {v3PreviewOpen && (
          <div>
            <button
              className="btn"
              disabled={v3PreviewLoading}
              onClick={handleRunV3Preview}
              style={{ marginBottom: 16 }}
            >
              {v3PreviewLoading ? 'Computing…' : v3PreviewData ? '🔄 Recompute' : '▶ Run Comparison'}
            </button>
            {v3PreviewError && <p style={{ color: 'var(--dire-color)', marginBottom: 12 }}>{v3PreviewError}</p>}
            {v3PreviewData && (
              <div style={{ overflowX: 'auto' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
                  {v3PreviewData.length} players — sorted by V3 MMR.{' '}
                  <strong style={{ color: 'var(--radiant-color)' }}>Green delta</strong> = V3 benefits this player.{' '}
                  <strong style={{ color: 'var(--dire-color)' }}>Red delta</strong> = V3 hurts them.
                </p>
                <table className="scoreboard" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center', width: 36 }}>#</th>
                      <th style={{ textAlign: 'left' }}>Player</th>
                      <th title="TrueSkill V3 MMR">V3 MMR</th>
                      <th title="Current TrueSkill V1 MMR">V1 MMR</th>
                      <th title="V3 minus V1">Δ MMR</th>
                      <th title="V3 μ (mean skill)">μ</th>
                      <th title="V3 σ (uncertainty)">σ</th>
                      <th>W</th>
                      <th>L</th>
                      <th>Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v3PreviewData.map((p, i) => {
                      const deltaColor = p.delta > 0
                        ? 'var(--radiant-color)'
                        : p.delta < 0 ? 'var(--dire-color)' : 'var(--text-muted)';
                      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
                      return (
                        <tr key={p.player_id}>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{medal}</td>
                          <td style={{ fontWeight: 600 }}>{p.display_name}</td>
                          <td className="col-stat" style={{ fontWeight: 700, color: 'var(--accent)' }}>
                            {p.v3_mmr.toLocaleString()}
                          </td>
                          <td className="col-stat" style={{ color: 'var(--text-secondary)' }}>
                            {p.v1_mmr.toLocaleString()}
                          </td>
                          <td className="col-stat" style={{ fontWeight: 700, color: deltaColor }}>
                            {p.delta > 0 ? '+' : ''}{p.delta}
                          </td>
                          <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {Number(p.v3_mu).toFixed(2)}
                          </td>
                          <td className="col-stat" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {Number(p.v3_sigma).toFixed(2)}
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
          </div>
        )}
      </section>

      </>)}

      {activeTab === 'config' && (<>
      {/* ── Engagement Settings ──────────────────────────────────────── */}
      <EngagementSettingsPanel superuserKey={superuserKey} siteSettings={siteSettings} onSaved={loadSiteSettings} />
      <WelcomeModalPanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'users' && (<>
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
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <select
                            value={rankEditMedal}
                            onChange={e => {
                              const m = e.target.value;
                              setRankEditMedal(m);
                              if (m === '8') {
                                setRankEditTier(80);
                                setRankEditStars('');
                              } else if (m && rankEditStars) {
                                setRankEditTier(parseInt(m) * 10 + parseInt(rankEditStars));
                              }
                            }}
                            style={{ padding: '2px 6px', fontSize: 12 }}
                          >
                            <option value="">Medal…</option>
                            {MEDAL_NAMES.map((name, i) => (
                              <option key={i + 1} value={i + 1}>{name}</option>
                            ))}
                          </select>
                          {rankEditMedal && rankEditMedal !== '8' && (
                            <select
                              value={rankEditStars}
                              onChange={e => {
                                const s = e.target.value;
                                setRankEditStars(s);
                                if (rankEditMedal && s) {
                                  setRankEditTier(parseInt(rankEditMedal) * 10 + parseInt(s));
                                }
                              }}
                              style={{ padding: '2px 6px', fontSize: 12 }}
                            >
                              <option value="">Stars…</option>
                              {[1, 2, 3, 4, 5].map(s => (
                                <option key={s} value={s}>{'★'.repeat(s)}</option>
                              ))}
                            </select>
                          )}
                          {rankEditMedal === '8' && (
                            <input
                              type="number"
                              placeholder="LB rank (optional)"
                              value={rankEditLbRank}
                              onChange={e => setRankEditLbRank(e.target.value)}
                              style={{ width: 130, padding: '2px 6px', fontSize: 12 }}
                            />
                          )}
                          {rankEditTier && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>tier={rankEditTier}</span>
                          )}
                          <button
                            className="btn btn-sm"
                            disabled={!rankEditTier}
                            onClick={async () => {
                              try {
                                const lbRank = rankEditMedal === '8' ? (rankEditLbRank || null) : null;
                                await setManualRank(r.account_id, rankEditTier || null, lbRank, superuserKey);
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
                              const existingTier = r.dota_rank_tier || '';
                              setRankEditTier(existingTier);
                              setRankEditLbRank(r.dota_leaderboard_rank || '');
                              if (existingTier) {
                                const medal = Math.floor(existingTier / 10);
                                const stars = existingTier % 10;
                                setRankEditMedal(String(medal));
                                setRankEditStars(medal === 8 ? '' : String(stars));
                              } else {
                                setRankEditMedal('');
                                setRankEditStars('');
                              }
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

      {/* ── Unregistered Players ──────────────────────────────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>👤 Unregistered Players</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Players with match history but no registered nickname. Highlighted rows share a persona name with another account — possible duplicates or alternate accounts.
          Register via <code>!adminregister &lt;account_id&gt; &lt;nickname&gt;</code> in Discord.
        </p>
        <button
          className="btn btn-sm"
          disabled={unregLoading}
          onClick={loadUnregistered}
          style={{ marginBottom: 14 }}
        >
          {unregLoading ? '⏳ Loading…' : '🔍 Check Unregistered Players'}
        </button>
        {unregistered !== null && (
          unregistered.length === 0
            ? <p style={{ color: 'var(--accent-green)', fontSize: 13 }}>✓ All active players are registered.</p>
            : (
              <div className="scoreboard-wrapper">
                <table className="scoreboard" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Account ID</th>
                      <th style={{ textAlign: 'left' }}>Steam Name</th>
                      <th>Games</th>
                      <th>Last Played</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unregistered.map(p => (
                      <tr key={p.account_id} style={p.possible_duplicate ? { background: 'rgba(245,158,11,0.08)' } : {}}>
                        <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          <a href={`/player/${p.account_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{p.account_id}</a>
                        </td>
                        <td style={{ fontWeight: 600 }}>{p.persona_name}</td>
                        <td style={{ textAlign: 'center' }}>{p.games}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          {p.last_played ? new Date(p.last_played).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 11 }}>
                          {p.possible_duplicate && (
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ possible duplicate</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </section>

      <section id="signup-requests" style={{ marginTop: 40 }}>
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
              const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];
              const pos = Array.isArray(req.preferred_positions) && req.preferred_positions.length > 0
                ? req.preferred_positions.map((p, i) => `${ORDINAL[i] || (i+1+'th')} Pos ${p}`).join(' → ')
                : '';
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
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Discord ID</div>
                      {req.preferred_name && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Name: {req.preferred_name}</div>}
                      {req.steam_url && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Steam: <a href={req.steam_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{req.steam_url}</a></div>}
                      {req.mmr && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Peak MMR / Rank: <strong style={{ color: 'var(--text-primary)' }}>{req.mmr}</strong></div>}
                      {pos && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Position preference: {pos}</div>}
                      {req.referral && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Referral: <span style={{ color: 'var(--text-secondary)' }}>{req.referral}</span></div>}
                      {req.message && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic' }}>"{req.message}"</div>}
                      {req.admin_notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Admin notes: {req.admin_notes}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Submitted: {date}</div>
                      {signupFeedback[req.id] && (
                        <div style={{ marginTop: 6, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ color: signupFeedback[req.id].dmSent ? 'var(--accent-green)' : '#f59e0b' }}>
                            {signupFeedback[req.id].dmSent ? '✉️ DM sent' : '⚠️ DM not sent (user may have DMs off)'}
                          </span>
                          {signupFeedback[req.id].registered && <span style={{ color: 'var(--accent-green)' }}>✅ Auto-registered</span>}
                          {signupFeedback[req.id].registerError && <span style={{ color: '#f59e0b' }}>⚠️ {signupFeedback[req.id].registerError}</span>}
                        </div>
                      )}
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
                              const result = await updateSignupRequest(req.id, { status: 'approved', adminNotes: signupNotes[req.id] ?? req.admin_notes }, superuserKey);
                              setSignupFeedback(f => ({ ...f, [req.id]: result }));
                              loadSignups();
                            } catch (e) { alert(e.message); }
                          }}
                        >Approve</button>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#7f1d1d', color: '#fff', flex: 1 }}
                          onClick={async () => {
                            try {
                              const result = await updateSignupRequest(req.id, { status: 'rejected', adminNotes: signupNotes[req.id] ?? req.admin_notes }, superuserKey);
                              setSignupFeedback(f => ({ ...f, [req.id]: result }));
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

      </>)}

      {activeTab === 'seasons' && (<>
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🏆 Hero Tier Overrides</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Manually set a hero's tier to override the auto-computed tier (based on win rate). Leave blank to revert to auto-computed.
        </p>
        <HeroTierOverridesPanel superuserKey={superuserKey} selectedSeason={activeSeason} />
      </section>

      </>)}

      {activeTab === 'matches' && (<>
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🔍 Replay Inspector</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Upload a <code>.dem</code> file to see the raw account IDs extracted by the parser — useful for verifying accounts before committing a replay.
        </p>
        <ReplayInspectorPanel superuserKey={superuserKey} />
      </section>

      </>)}

      {activeTab === 'seasons' && (<>
      <section style={{ marginBottom: 36 }}>
        <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🏅 Achievement System</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Achievements are automatically checked after each match. Use this to backfill achievements for all existing matches in the database.
        </p>
        <RecomputeAchievementsPanel superuserKey={superuserKey} />
      </section>
      </>)}

        </div>
      </div>
    </div>
    </AdminErrorBoundary>
  );
}

function RecomputeAchievementsPanel({ superuserKey }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleRecompute = async () => {
    if (!window.confirm('This will scan all players and grant any achievements they have earned but not yet been awarded. This may take a moment. Continue?')) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const data = await recomputeAchievements(superuserKey);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleRecompute}
        disabled={loading}
        style={{
          background: loading ? 'var(--bg-secondary)' : 'var(--accent-blue)',
          color: loading ? 'var(--text-muted)' : '#fff',
          border: 'none', borderRadius: 8, padding: '10px 22px',
          cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14,
        }}
      >
        {loading ? '⏳ Recomputing…' : '🔄 Recompute All Achievements'}
      </button>
      {result && (
        <div style={{ marginTop: 12, padding: '10px 16px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--radiant-color)', color: 'var(--radiant-color)', fontSize: 14 }}>
          ✅ Done! Processed <strong>{result.players}</strong> players and granted <strong>{result.granted}</strong> new achievements.
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, padding: '10px 16px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--dire-color)', color: 'var(--dire-color)', fontSize: 14 }}>
          ❌ Error: {error}
        </div>
      )}
    </div>
  );
}

function HeroTypeahead({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedHero = value ? ALL_HEROES.find(h => h.id === value) : null;

  const filtered = query.trim()
    ? ALL_HEROES.filter(h => h.name.toLowerCase().includes(query.trim().toLowerCase()))
    : ALL_HEROES;

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery(selectedHero ? selectedHero.name : '');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectedHero]);

  const handleFocus = () => {
    if (selectedHero && !query) setQuery(selectedHero.name);
    setOpen(true);
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    onChange(null);
  };

  const handleSelect = (hero) => {
    onChange(hero.id);
    setQuery(hero.name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: 220 }}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder="Search hero name…"
        autoComplete="off"
        style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
          maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {filtered.map(hero => (
            <div
              key={hero.id}
              onMouseDown={() => handleSelect(hero)}
              style={{
                padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                color: value === hero.id ? 'var(--accent-blue)' : 'var(--text-primary)',
                background: value === hero.id ? 'rgba(59,130,246,0.1)' : 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = value === hero.id ? 'rgba(59,130,246,0.1)' : 'transparent'}
            >
              {hero.name} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>#{hero.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeroTierOverridesPanel({ superuserKey, selectedSeason }) {
  const seasonId = selectedSeason ? selectedSeason.id : null;
  const [overrides, setOverrides] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [heroId, setHeroId] = useState(null);
  const [tier, setTier] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoadingList(true);
    try {
      const d = await getAdminHeroTierOverrides(seasonId, superuserKey);
      setOverrides(d.overrides || []);
    } catch (e) {
      setMsg('Error: ' + e.message);
    } finally {
      setLoadingList(false);
    }
  }, [seasonId, superuserKey]);

  useEffect(() => { load(); }, [load]);

  const handleSet = async (e) => {
    e.preventDefault();
    if (!heroId || !tier) { setMsg('Hero name and Tier are required'); return; }
    setSaving(true); setMsg('');
    try {
      await setAdminHeroTierOverride({ season_id: seasonId, hero_id: heroId, tier }, superuserKey);
      setHeroId(null); setTier('');
      setMsg('Override saved.');
      await load();
    } catch (e) {
      setMsg('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (hid) => {
    if (!window.confirm('Remove this tier override?')) return;
    try {
      await deleteAdminHeroTierOverride(hid, seasonId, superuserKey);
      setMsg('Override removed.');
      await load();
    } catch (e) {
      setMsg('Error: ' + e.message);
    }
  };

  const TIER_COLORS = { S: '#ff6b35', A: '#f7c059', B: '#a3e635', C: '#60a5fa', D: '#f87171' };

  return (
    <div>
      <form onSubmit={handleSet} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hero</label>
          <HeroTypeahead value={heroId} onChange={setHeroId} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <option value="">-- Select --</option>
            {['S', 'A', 'B', 'C', 'D'].map(t => <option key={t} value={t}>{t} Tier</option>)}
          </select>
        </div>
        <button type="submit" disabled={saving} style={{ padding: '7px 18px', borderRadius: 6, background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {saving ? 'Saving…' : 'Set Override'}
        </button>
      </form>

      {msg && <p style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)', marginBottom: 10 }}>{msg}</p>}

      {loadingList ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading overrides…</p>
      ) : overrides.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No overrides set{selectedSeason ? ` for ${selectedSeason.name}` : ' for all-time'}.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Hero</th>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Tier</th>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Set By</th>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Set At</th>
              <th style={{ textAlign: 'left', padding: '6px 10px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map(ov => (
              <tr key={ov.hero_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ fontWeight: 600 }}>{getHeroName(ov.hero_id)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>#{ov.hero_id}</span>
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ background: TIER_COLORS[ov.tier] || '#888', color: '#111', fontWeight: 700, padding: '2px 10px', borderRadius: 5 }}>{ov.tier}</span>
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{ov.set_by || '—'}</td>
                <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{ov.set_at ? new Date(ov.set_at).toLocaleString() : '—'}</td>
                <td style={{ padding: '8px 10px' }}>
                  <button onClick={() => handleDelete(ov.hero_id)} style={{ padding: '3px 10px', borderRadius: 5, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReplayInspectorPanel({ superuserKey }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('replay', file);
      const res = await fetch('/api/replay-inspect', {
        method: 'POST',
        headers: { 'x-superuser-key': superuserKey },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <input
          type="file"
          accept=".dem"
          onChange={e => setFile(e.target.files[0] || null)}
          style={{ color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          disabled={!file || loading}
          style={{ padding: '0.4rem 1.2rem', background: '#1e3a5f', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
        >
          {loading ? 'Parsing…' : 'Inspect Replay'}
        </button>
        {file && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>}
      </form>
      {error && <div style={{ color: '#f87171', padding: '0.5rem', background: '#1a0808', borderRadius: 4, marginBottom: '1rem' }}>❌ {error}</div>}
      {result && (
        <div>
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {result.match_id && <span>Match ID: <strong style={{ color: 'var(--text-primary)' }}>{result.match_id}</strong></span>}
            {result.duration && <span>Duration: <strong style={{ color: 'var(--text-primary)' }}>{Math.floor(result.duration / 60)}:{String(result.duration % 60).padStart(2, '0')}</strong></span>}
            {result.radiant_win != null && <span>Winner: <strong style={{ color: result.radiant_win ? '#4ade80' : '#f87171' }}>{result.radiant_win ? 'Radiant' : 'Dire'}</strong></span>}
            <span>Players: <strong style={{ color: 'var(--text-primary)' }}>{result.players?.length ?? 0}</strong></span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  {['Slot', 'Team', 'Steam32 (account_id)', 'Steam64', 'Persona Name', 'Hero', 'K/D/A'].map(h => (
                    <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(result.players || []).map((p, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-muted)' }}>{p.slot}</td>
                    <td style={{ padding: '0.35rem 0.6rem', color: p.team === 'radiant' ? '#4ade80' : '#f87171', fontWeight: 600 }}>{p.team}</td>
                    <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'monospace', color: '#60a5fa' }}>{p.account_id || <span style={{ color: '#555' }}>unknown</span>}</td>
                    <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'monospace', color: '#a78bfa', fontSize: '0.78rem' }}>{p.steam64 || '—'}</td>
                    <td style={{ padding: '0.35rem 0.6rem' }}>{p.persona_name || <span style={{ color: '#555' }}>—</span>}</td>
                    <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-muted)' }}>{p.hero_name ? p.hero_name.replace('npc_dota_hero_', '').replace(/_/g, ' ') : '—'}</td>
                    <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-muted)' }}>{p.kills}/{p.deaths}/{p.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── Gift Purchases audit panel ─────────
function GiftPurchasesPanel({ superuserKey }) {
  const [gifts, setGifts] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!superuserKey) return;
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/gifts?limit=100', {
        credentials: 'include',
        headers: { 'X-Superuser-Key': superuserKey },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setGifts(d.gifts || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  function formatGiftType(t) {
    if (!t) return '—';
    if (t === 'pro') return 'Pro Membership';
    if (t === 'season_pass') return 'Season Pass';
    return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function formatMoney(cents, currency) {
    if (cents == null) return '—';
    return `${(currency || 'AUD').toUpperCase()} $${(cents / 100).toFixed(2)}`;
  }

  function formatDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleString(); } catch (_) { return s; }
  }

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>🎁 Gift Purchases</h2>
        <button className="btn" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? 'Loading…' : gifts ? 'Refresh' : 'Load'}
        </button>
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {gifts && gifts.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No gift purchases recorded yet.</p>
      )}
      {gifts && gifts.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Gifter</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Recipient</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Amount</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '4px 10px 8px 0', fontWeight: 600 }}>Completed</th>
              </tr>
            </thead>
            <tbody>
              {gifts.map(g => (
                <tr key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>{formatDate(g.created_at)}</td>
                  <td style={{ padding: '5px 10px 5px 0' }}>{formatGiftType(g.gift_type)}</td>
                  <td style={{ padding: '5px 10px 5px 0' }}>{g.gifter_name || g.gifter_account_id}</td>
                  <td style={{ padding: '5px 10px 5px 0' }}>{g.recipient_name || g.recipient_account_id}</td>
                  <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>{formatMoney(g.amount_cents, g.currency)}</td>
                  <td style={{ padding: '5px 10px 5px 0' }}>
                    <span style={{ color: g.status === 'completed' ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: g.status === 'completed' ? 600 : 400 }}>
                      {g.status || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '5px 10px 5px 0', whiteSpace: 'nowrap' }}>{formatDate(g.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ───────── Coaching Marketplace admin panel (T13) ─────────
// Renders nothing if /api/admin/coaching/dashboard returns 404 (flag off).
// Shows pending KYC, open disputes, and revenue summary; lets superusers
// resolve disputes (release/refund) and apply sanctions (warn/suspend).
function CoachingAdminPanel({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [hidden, setHidden] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(async () => {
    if (!superuserKey) return;
    try {
      const r = await fetch('/api/admin/coaching/dashboard', {
        credentials: 'include',
        headers: { 'X-Superuser-Key': superuserKey },
      });
      if (r.status === 404) { setHidden(true); return; }
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setData(await r.json());
    } catch (e) { setMsg(`Error: ${e.message}`); }
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);

  const resolveDispute = async (id, resolution) => {
    const note = prompt(`Note for ${resolution} (audit log only):`);
    if (note === null) return;
    const r = await fetch(`/api/admin/coaching/dispute/${id}/resolve`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ resolution, note }),
    });
    if (r.ok) { setMsg('Dispute resolved'); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  const sanction = async (coachAccountId) => {
    const reason = prompt('Sanction reason:');
    if (!reason) return;
    // Backend (db.applyCoachSanction) accepts only these three canonical
    // severities — must match the CHECK constraint on coach_sanctions.
    const severity = prompt('Severity (warning / suspended / delisted):', 'warning');
    if (!['warning', 'suspended', 'delisted'].includes(severity)) return;
    const r = await fetch('/api/admin/coaching/sanction', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ coach_account_id: coachAccountId, severity, reason }),
    });
    if (r.ok) { setMsg(`Sanction applied: ${severity}`); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  if (hidden) return null;
  if (!data) return (
    <section><h2>🎓 Coaching Marketplace</h2>
      <p style={{ color: 'var(--text-muted)' }}>{msg || 'Loading…'}</p>
    </section>
  );

  return (
    <section>
      <h2 style={{ marginBottom: 6 }}>🎓 Coaching Marketplace</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Operational dashboard. Revenue figures show the gross 10% platform fee on completed bookings (excluding Stripe processor fees, which are deducted from the coach's split).
        Sanctions are immediate; dispute resolutions trigger refunds/releases.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="Active coaches" value={data.stats?.active_coaches ?? 0} />
        <Stat label="Pending KYC" value={data.stats?.pending_kyc ?? 0} />
        <Stat label="Open disputes" value={data.stats?.open_disputes ?? 0} accent={data.stats?.open_disputes > 0 ? '#fbbf24' : null} />
        <Stat label="Bookings (30d)" value={data.stats?.bookings_30d ?? 0} />
        <Stat label="Platform fees (30d)" value={`$${((data.stats?.platform_fees_30d_cents || 0) / 100).toFixed(2)}`} />
        <Stat label="Lifetime revenue" value={`$${((data.revenue?.total_cents || 0) / 100).toFixed(2)}`}
              accent="var(--radiant-color)" />
      </div>

      {(data.pending_kyc?.length || 0) > 0 && (
        <>
          <h3 style={{ marginBottom: 6 }}>Pending KYC</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th align="left">Coach</th><th align="left">Stripe acct</th><th align="left">Created</th>
            </tr></thead>
            <tbody>{data.pending_kyc.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6 }}>{c.display_name || `#${c.id}`}</td>
                <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{c.stripe_account_id || '—'}</td>
                <td style={{ padding: 6 }}>{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      {(data.open_disputes?.length || 0) > 0 && (
        <>
          <h3 style={{ marginBottom: 6, color: '#fbbf24' }}>Open disputes ({data.open_disputes.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th align="left">Booking</th><th align="left">Student</th><th align="left">Coach</th>
              <th align="left">Reason</th><th align="right">Amount</th><th></th>
            </tr></thead>
            <tbody>{data.open_disputes.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6 }}>#{d.id}</td>
                <td style={{ padding: 6 }}>{d.student_name}</td>
                <td style={{ padding: 6 }}>{d.coach_name}</td>
                <td style={{ padding: 6, maxWidth: 280, fontSize: 12 }}>{d.dispute_reason}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>${(d.amount_cents / 100).toFixed(2)}</td>
                <td style={{ padding: 6 }}>
                  <button onClick={() => resolveDispute(d.id, 'release')}
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--radiant-color)', color: '#fff', border: 0, cursor: 'pointer', marginRight: 4, fontSize: 12 }}>Release</button>
                  <button onClick={() => resolveDispute(d.id, 'refund')}
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--dire-color)', color: '#fff', border: 0, cursor: 'pointer', marginRight: 4, fontSize: 12 }}>Refund</button>
                  <button onClick={() => sanction(d.coach_account_id)}
                    style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>Sanction coach</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      {(data.recent_sanctions?.length || 0) > 0 && (
        <>
          <h3 style={{ marginBottom: 6 }}>Recent sanctions</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th align="left">When</th><th align="left">Coach</th>
              <th align="left">Severity</th><th align="left">Reason</th><th align="left">Expires</th>
            </tr></thead>
            <tbody>{data.recent_sanctions.slice(0, 25).map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(s.applied_at).toLocaleString()}
                </td>
                <td style={{ padding: 6 }}>{s.coach_name || `#${s.coach_account_id}`}</td>
                <td style={{ padding: 6 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: s.severity === 'delisted' ? 'var(--dire-color)'
                              : s.severity === 'suspended' ? '#fbbf24' : 'var(--border)',
                    color: s.severity === 'warning' ? 'var(--text-primary)' : '#fff',
                  }}>{s.severity}</span>
                </td>
                <td style={{ padding: 6, maxWidth: 320, fontSize: 12 }}>{s.reason}</td>
                <td style={{ padding: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}

      {(!data.pending_kyc?.length && !data.open_disputes?.length && !data.recent_sanctions?.length) && (
        <p style={{ color: 'var(--text-muted)' }}>No pending KYC, open disputes, or sanctions. ✓</p>
      )}

      {msg && <p style={{ color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>{msg}</p>}
    </section>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 12,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: accent || 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

function TournamentBracketPanel() {
  const [tournaments, setTournaments] = useState(null);

  useEffect(() => {
    getTournaments().then(d => setTournaments(Array.isArray(d) ? d : (d?.tournaments || []))).catch(() => setTournaments([]));
  }, []);

  const STATUS_LABELS = { upcoming: 'Upcoming', active: 'Active', completed: 'Completed' };
  const STATUS_COLORS = { upcoming: 'var(--text-muted)', active: 'var(--accent-gold, #f59e0b)', completed: 'var(--radiant-color)' };
  const FORMAT_LABELS = { single_elim: 'Single Elim', double_elim: 'Double Elim', weekend_points: 'Points' };

  const active = tournaments?.filter(t => t.status !== 'completed') || [];
  const completed = tournaments?.filter(t => t.status === 'completed') || [];

  return (
    <section>
      <h2 style={{ marginBottom: 6 }}>🏆 Tournament Brackets</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Manage bracket configuration, seeding, and match results from each tournament's detail page.
      </p>

      {tournaments === null ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : tournaments.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No tournaments yet. Create one from the <Link to="/tournaments" style={{ color: 'var(--accent-blue)' }}>Tournaments</Link> page.</p>
      ) : (
        <>
          {active.length > 0 && (
            <>
              <h3 style={{ marginBottom: 8, fontSize: 14 }}>Active / Upcoming</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {active.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {FORMAT_LABELS[t.format] || t.format}
                        {t.bracket_size ? ` · ${t.bracket_size}-player` : ''}
                        {t.bracket_type && t.bracket_type !== 'none' ? ` · ${t.bracket_type}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLORS[t.status] }}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                    <Link
                      to={`/tournaments/${t.id}`}
                      style={{
                        padding: '5px 12px', background: 'var(--accent-blue)', color: '#fff',
                        borderRadius: 6, fontSize: 12, textDecoration: 'none', fontWeight: 600,
                      }}
                    >
                      Manage →
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}

          {completed.length > 0 && (
            <>
              <h3 style={{ marginBottom: 8, fontSize: 14, color: 'var(--text-muted)' }}>Completed ({completed.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {completed.slice(0, 5).map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8,
                    opacity: 0.75,
                  }}>
                    <div style={{ flex: 1, fontSize: 13 }}>{t.name}</div>
                    <Link to={`/tournaments/${t.id}`} style={{ fontSize: 12, color: 'var(--accent-blue)', textDecoration: 'none' }}>View bracket</Link>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 14 }}>
            <Link to="/tournaments" style={{
              display: 'inline-block', padding: '7px 16px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
              color: 'var(--text-primary)', textDecoration: 'none',
            }}>
              + Create / manage all tournaments
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
