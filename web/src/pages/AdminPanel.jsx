import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { useSeason } from '../context/SeasonContext';
import { getStoredReplays, extendReplayExpiry, getPlayerRanks, triggerRankSync, setManualRank, clearPlayerRank, getSignupRequests, updateSignupRequest, getAdminFeatureFlags, setFeatureFlag as apiSetFeatureFlag, launchSeason10, getSeasons, getSeasonTiers, ensureSeasonTiers, updateSeasonTier, placeAllPlayersInTiers, getSeasonTierPlayers } from '../api';
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

// Maps each feature flag key to the page(s) where the feature is visible.
// Used to render a direct "View →" link next to each flag row.
const FLAG_PREVIEW_URLS = {
  coaching_marketplace:   [{ label: 'Browse Coaches', url: '/coaches' }],
  hero_meta_v2:           [{ label: 'Heroes', url: '/heroes' }],
  draft_assistant_v2:     [{ label: 'Draft', url: '/draft' }],
  season_pass_s10:        [{ label: 'Leaderboard', url: '/leaderboard' }],
  profile_customization:  [{ label: 'Your Profile', url: '/player/me' }],
  pro_tier:               [{ label: 'Leaderboard', url: '/leaderboard' }],
  multi_tier_seasons:     [{ label: 'Leaderboard', url: '/leaderboard' }],
  new_rank_theme:         [{ label: 'Leaderboard', url: '/leaderboard' }],
  match_predictions:      [{ label: 'Predictions', url: '/predictions' }],
  player_network:         [{ label: 'Stats', url: '/stats' }],
};

function FeatureFlagsPanel({ superuserKey }) {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAdminFeatureFlags(superuserKey);
      setFlags(data.flags || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [superuserKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateFlag = async (key, patch) => {
    try {
      setSaving(key);
      await apiSetFeatureFlag({ key, ...patch }, superuserKey);
      await refresh();
    } catch (err) {
      setError(err.message || 'Failed to update');
    } finally {
      setSaving(null);
    }
  };

  const handleLaunch = async () => {
    const previewKeys = flags.filter(f => f.state === 'preview').map(f => f.key);

    // Step 1 — high-level confirmation. Spell out the consequences in plain
    // English so this can't be misclicked.
    const step1 = previewKeys.length
      ? `Launch Season 10 NOW?\n\nThis will:\n  • Flip ${previewKeys.length} preview flag(s) to ON for everyone:\n${previewKeys.map(k => `      - ${k}`).join('\n')}\n  • Force-enable the home launch banner.\n  • Stamp the launch timestamp (cannot be undone via this UI).\n  • Post the launch announcement to Discord.\n\nThe automatic launch cron has been removed — this button is the ONLY way to launch.\n\nProceed to confirmation step 2?`
      : `Launch Season 10 NOW?\n\nNo preview flags are currently staged, but this will still:\n  • Stamp the launch timestamp (cannot be undone via this UI).\n  • Force-enable the home banner.\n  • Post the launch announcement to Discord.\n\nProceed to confirmation step 2?`;
    if (!window.confirm(step1)) return;

    // Step 2 — typed-phrase confirmation. The user must literally type
    // "LAUNCH SEASON 10" to proceed; an empty/cancel/wrong value aborts.
    const PHRASE = 'LAUNCH SEASON 10';
    const typed = window.prompt(
      `Final confirmation.\n\nType "${PHRASE}" exactly (without quotes) to launch.\nThis is irreversible.`,
      ''
    );
    if (typed === null) return; // cancelled
    if (String(typed).trim() !== PHRASE) {
      setError(`Launch aborted — confirmation phrase did not match "${PHRASE}".`);
      return;
    }

    try {
      setLaunching(true);
      setLaunchResult(null);
      setError('');
      const result = await launchSeason10(superuserKey);
      setLaunchResult(result);
      await refresh();
    } catch (err) {
      setError(err.message || 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  const stateColor = s => s === 'on' ? '#22c55e' : s === 'preview' ? '#a855f7' : '#6b7280';

  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ marginBottom: 6 }}>🚩 Feature Flags</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Three-state staging for new features. <strong>Off</strong> hides from everyone; <strong>Preview</strong> shows only to logged-in superusers (you); <strong>On</strong> goes live for all visitors.
      </p>

      {/* Season 10 Launch button */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(124,58,237,0.05) 100%)',
        border: '1px solid rgba(168,85,247,0.4)', borderRadius: 10, padding: 16, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>⚡ Season 10 Launch</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Manual-only launch (the cron has been removed). Two-step confirmation required.
              Flips all preview flags to ON, force-enables the home banner, and posts the Discord announcement.
            </div>
          </div>
          <button
            onClick={handleLaunch}
            disabled={launching}
            className="btn btn-primary"
            style={{ background: '#a855f7', borderColor: '#9333ea' }}
          >
            {launching ? 'Launching…' : 'Launch Season 10 Now'}
          </button>
        </div>
        {launchResult && (
          <div style={{ marginTop: 10, fontSize: 12, color: launchResult.alreadyLaunched ? '#fbbf24' : '#22c55e' }}>
            {launchResult.alreadyLaunched
              ? `Already launched at ${new Date(launchResult.launchedAt).toLocaleString('en-AU')}.`
              : `✓ Launched! Flipped ${launchResult.flippedKeys?.length || 0} flag(s)${launchResult.discordPosted ? ' · Discord announcement posted' : ''}.`}
          </div>
        )}
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {loading ? <div>Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Key</th>
                <th style={{ padding: '8px 10px' }}>State</th>
                <th style={{ padding: '8px 10px' }}>Description</th>
                <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>Enabled at</th>
                <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>View</th>
              </tr>
            </thead>
            <tbody>
              {flags.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 16, color: 'var(--text-muted)', textAlign: 'center' }}>No feature flags yet.</td></tr>
              )}
              {flags.map(f => {
                const previewLinks = FLAG_PREVIEW_URLS[f.key] || [];
                const showLinks = f.state === 'preview' || f.state === 'on';
                return (
                  <tr key={f.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#a78bfa' }}>{f.key}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <select
                        value={f.state}
                        disabled={saving === f.key}
                        onChange={e => updateFlag(f.key, { state: e.target.value })}
                        style={{
                          background: 'var(--bg-card)', color: stateColor(f.state),
                          border: `1px solid ${stateColor(f.state)}`, borderRadius: 6,
                          padding: '4px 8px', fontWeight: 600, fontSize: 12, textTransform: 'uppercase',
                        }}
                      >
                        <option value="off">Off</option>
                        <option value="preview">Preview</option>
                        <option value="on">On</option>
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{f.description || <em>—</em>}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {f.enabled_at ? new Date(f.enabled_at).toLocaleString('en-AU') : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {showLinks && previewLinks.length > 0 ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {previewLinks.map(link => (
                            <a
                              key={link.url}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 11, fontWeight: 600, padding: '3px 8px',
                                borderRadius: 6, textDecoration: 'none',
                                background: f.state === 'preview' ? 'rgba(168,85,247,0.15)' : 'rgba(34,197,94,0.12)',
                                border: `1px solid ${f.state === 'preview' ? 'rgba(168,85,247,0.5)' : 'rgba(34,197,94,0.4)'}`,
                                color: f.state === 'preview' ? '#a855f7' : '#22c55e',
                              }}
                            >
                              {link.label} →
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
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
      const list = await getSeasons();
      setSeasons(list || []);
      if (!seasonId && list?.length) {
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
                <th style={{ padding: '8px 10px' }}>Players</th>
                <th style={{ padding: '8px 10px' }}></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(t => {
                const draftName = edits[t.tier_number]?.name ?? t.name;
                const draftFloor = edits[t.tier_number]?.min_mmr ?? t.min_mmr;
                const dirty = edits[t.tier_number] && (
                  edits[t.tier_number].name !== undefined && edits[t.tier_number].name !== t.name
                  || edits[t.tier_number].min_mmr !== undefined && Number(edits[t.tier_number].min_mmr) !== Number(t.min_mmr)
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

export default function AdminPanel() {
  const { isSuperuser, superuserKey, logout } = useSuperuser();
  const { selectedSeason } = useSeason();

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
      const sid = selectedSeason?.id ?? null;
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

      {/* Database Backups */}
      <DbBackupManager superuserKey={superuserKey} />

      {/* Stored Replays */}
      <ReplayManager superuserKey={superuserKey} />

      {/* Test Post-Match DM */}
      <TestDmPanel superuserKey={superuserKey} />

      {/* Test RSVP Registration DM */}
      <TestRsvpDmPanel superuserKey={superuserKey} />

      {/* Server Error Log */}
      <ErrorLogViewer superuserKey={superuserKey} />

      {/* Feature Flags — preview/launch staging */}
      <FeatureFlagsPanel superuserKey={superuserKey} />

      {/* Season Tiers — 8-tier ladder per season */}
      <SeasonTiersPanel superuserKey={superuserKey} />

      {/* Coaching Marketplace — pending KYC + open disputes + revenue (T13) */}
      <CoachingAdminPanel superuserKey={superuserKey} />

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

      <section style={{ marginBottom: 36 }}>
        <h2 style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🔍 Replay Inspector</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Upload a <code>.dem</code> file to see the raw account IDs extracted by the parser — useful for verifying accounts before committing a replay.
        </p>
        <ReplayInspectorPanel superuserKey={superuserKey} />
      </section>

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
