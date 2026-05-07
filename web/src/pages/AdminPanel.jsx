import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSuperuser } from '../context/SuperuserContext';
import { useFeatureFlag } from '../context/FeatureFlagsContext';
import { useSeason } from '../context/SeasonContext';
import { getStoredReplays, extendReplayExpiry, getPlayerRanks, triggerRankSync, setManualRank, clearPlayerRank, getSignupRequests, updateSignupRequest, getSeasons, getSeasonTiers, ensureSeasonTiers, updateSeasonTier, placeAllPlayersInTiers, getSeasonTierPlayers, setSeasonEndConditions, closeSeasonApi, reannounceSeasonApi, setMatchReplayPath, getMatchReplayStatus, getAdminHeroTierOverrides, setAdminHeroTierOverride, deleteAdminHeroTierOverride, getTournaments, recomputeAchievements, getAdminFeatureFlags, setFeatureFlag, superuserFetch, getDiscordIdCollisions, resolveDiscordIdCollision, enforceDiscordIdUniqueIndex, getDiscordAutoJoinFailures, clearDiscordAutoJoinFailure } from '../api';
import RankBadge, { decodeRankTier } from '../components/RankBadge';
import { TierBadge, MMR_TIERS } from './Leaderboard';
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

// Task 114 — surfaces every Discord ID currently bound to >1 account in a
// table where the operator picks the canonical owner and clears the rest in
// one click. Once the listing is empty it lets them turn on the partial
// unique index without redeploying.
function DiscordIdCollisions({ superuserKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState({});
  const [enforcing, setEnforcing] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getDiscordIdCollisions(superuserKey)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  function handleResolve(discordId, keepAccountId, keeperLabel, otherCount) {
    if (!window.confirm(
      `Keep "${keeperLabel}" (account ${keepAccountId}) as the owner of Discord ID ${discordId}?\n\n` +
      `This will clear the Discord link from ${otherCount} other account${otherCount === 1 ? '' : 's'}. ` +
      `Those players can re-link from their settings if needed.`
    )) return;
    const key = `${discordId}|${keepAccountId}`;
    setResolving(prev => ({ ...prev, [key]: true }));
    setStatusMsg('');
    resolveDiscordIdCollision(discordId, keepAccountId, superuserKey)
      .then(r => {
        setStatusMsg(`✓ Cleared ${r.cleared.length} loser account${r.cleared.length === 1 ? '' : 's'} for Discord ID ${discordId}.`);
        load();
      })
      .catch(e => setError(e.message))
      .finally(() => setResolving(prev => ({ ...prev, [key]: false })));
  }

  function handleEnforce() {
    setEnforcing(true);
    setStatusMsg('');
    enforceDiscordIdUniqueIndex(superuserKey)
      .then(r => {
        if (r.index?.error) setError(r.index.error);
        else if (r.index?.created) setStatusMsg('✓ Unique index created — duplicate Discord IDs are now blocked at the DB layer.');
        else if (r.index?.exists) setStatusMsg('✓ Unique index already enforced.');
        load();
      })
      .catch(e => setError(e.message))
      .finally(() => setEnforcing(false));
  }

  const collisions = data?.collisions || [];
  const indexExists = data?.index?.exists;
  const indexError = data?.index?.error;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-discord-collisions" className="section-title" style={{ marginBottom: 6 }}>
        🔗 Discord ID Collisions
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        Lists every Discord ID currently bound to more than one player account. Pick the canonical
        owner and the rest will be cleared (<code>discord_id = ''</code>) in both the <code>nicknames</code>
        and legacy <code>players</code> tables. Once the list is empty the partial unique index can be
        enforced so future duplicates are blocked at the DB layer.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? '⏳ Loading…' : data === null ? 'Load' : 'Refresh'}
        </button>
        {data !== null && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {collisions.length === 0 ? 'No collisions found.' : `${collisions.length} colliding Discord ID${collisions.length === 1 ? '' : 's'}`}
          </span>
        )}
        {data !== null && (
          <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
                        background: indexExists ? 'rgba(74,222,128,0.12)' : 'rgba(245,158,11,0.12)',
                        color: indexExists ? '#4ade80' : '#f59e0b' }}>
            {indexExists ? '✓ Unique index enforced' : '⚠ Unique index NOT enforced'}
          </span>
        )}
        {data !== null && !indexExists && collisions.length === 0 && (
          <button className="btn btn-primary" onClick={handleEnforce} disabled={enforcing} style={{ fontSize: '0.82rem' }}>
            {enforcing ? 'Enforcing…' : '🔒 Enforce Unique Index Now'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#450a0a', border: '1px solid #f87171',
                      color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {statusMsg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#052e16', border: '1px solid #4ade80',
                      color: '#86efac', fontSize: 13, marginBottom: 12 }}>
          {statusMsg}
        </div>
      )}
      {indexError && !indexExists && data !== null && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.08)',
                      border: '1px solid #f59e0b', color: '#fbbf24', fontSize: 12, marginBottom: 12 }}>
          Index status: {indexError}
        </div>
      )}

      {data !== null && collisions.length === 0 && indexExists && (
        <p style={{ color: '#4ade80', fontSize: 13 }}>
          ✓ Nothing to reconcile. Every Discord ID maps to a single account and the unique index is in place.
        </p>
      )}

      {collisions.map(group => (
        <div key={group.discord_id} style={{
          border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
          marginBottom: 14, background: 'var(--bg-elevated)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Discord ID</span>
            <code style={{ fontSize: 13, fontWeight: 600 }}>{group.discord_id}</code>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              · {group.candidates.length} accounts
            </span>
          </div>
          <div className="scoreboard-wrapper">
            <table className="scoreboard" style={{ fontSize: 12, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Nickname</th>
                  <th style={{ textAlign: 'left' }}>Account ID</th>
                  <th>Source</th>
                  <th>Last Match</th>
                  <th>MMR</th>
                  <th>Games</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {group.candidates.map(c => {
                  const key = `${group.discord_id}|${c.account_id}`;
                  const label = c.nickname || `#${c.account_id}`;
                  return (
                    <tr key={c.account_id}>
                      <td style={{ fontWeight: 600 }}>
                        <a href={`/player/${c.account_id}`} target="_blank" rel="noopener noreferrer"
                           style={{ color: 'var(--accent)' }}>{label}</a>
                      </td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.account_id}</td>
                      <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                        {c.in_nicknames ? 'nicknames' : 'players (legacy)'}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        {c.last_match_id
                          ? <a href={`/match/${c.last_match_id}`} target="_blank" rel="noopener noreferrer"
                               style={{ color: 'var(--accent)' }}>{fmtDate(c.last_match_at)}</a>
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>{c.mmr ?? '—'}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{c.games_played}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-sm"
                          disabled={!!resolving[key]}
                          onClick={() => handleResolve(group.discord_id, c.account_id, label, group.candidates.length - 1)}
                          style={{ fontSize: 11, padding: '2px 8px', color: '#4ade80', borderColor: '#4ade80' }}
                        >
                          {resolving[key] ? 'Working…' : '✓ Keep this one'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

// Task #138 — surfaces the queue of users whose `bot.addUserToLeagueGuild`
// call failed mid-OAuth (Task #128). Each row shows the player nickname,
// the failure code/error, attempt count, and timing so admins can tell at
// a glance whether a recent perms fix has actually drained the queue. The
// per-row Clear button calls /api/admin/discord-autojoin-failures/clear so
// rows that the player has already self-resolved by re-linking can be
// pruned without waiting for the next successful auto-join.
function DiscordAutoJoinFailures({ superuserKey }) {
  const [failures, setFailures] = useState(null);
  const [pruneInfo, setPruneInfo] = useState({ thresholdDays: null, lastRunTs: null, lastRemoved: null });
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState({});
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const load = useCallback(() => {
    if (!superuserKey) return;
    setLoading(true);
    setError('');
    getDiscordAutoJoinFailures(superuserKey)
      .then(d => {
        setFailures(d.failures || []);
        setPruneInfo({
          thresholdDays: d.prune_threshold_days ?? null,
          lastRunTs: d.prune_last_run_ts ?? null,
          lastRemoved: d.prune_last_removed ?? null,
        });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  useEffect(() => { load(); }, [load]);

  function handleClear(row) {
    const label = row.nickname || `account ${row.account_id}`;
    if (!window.confirm(
      `Clear the pending Discord auto-join failure for ${label}?\n\n` +
      `Use this only if you've confirmed the player is now actually in the Discord server, ` +
      `or if they've re-linked. The banner will stop showing for them on their next page load.`
    )) return;
    const key = `${row.discord_id}|${row.account_id}`;
    setClearing(prev => ({ ...prev, [key]: true }));
    setStatusMsg('');
    clearDiscordAutoJoinFailure({ discord_id: row.discord_id, account_id: row.account_id }, superuserKey)
      .then(r => {
        setStatusMsg(r.cleared ? `✓ Cleared pending failure for ${label}.` : `Row was already gone for ${label}.`);
        load();
      })
      .catch(e => setError(e.message))
      .finally(() => setClearing(prev => ({ ...prev, [key]: false })));
  }

  function fmtTs(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  }

  const rows = failures || [];

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-discord-autojoin-failures" className="section-title" style={{ marginBottom: 6 }}>
        ⏳ Discord Auto-Join Retry Queue
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        Players whose <code>addUserToLeagueGuild</code> call failed during OAuth (Task #128). They see a
        site-wide banner prompting them to re-click <em>Reconnect with Discord</em>; the row is cleared
        automatically on the next successful auto-join. Use this list to confirm whether a recent perms
        fix has actually drained the queue.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? '⏳ Loading…' : 'Refresh'}
        </button>
        {failures !== null && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {rows.length === 0 ? 'No pending failures.' : `${rows.length} player${rows.length === 1 ? '' : 's'} stuck`}
          </span>
        )}
      </div>

      {pruneInfo.thresholdDays !== null && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -4, marginBottom: 12 }}>
          🧹 Auto-prune: rows with no fresh failure for{' '}
          <strong>{pruneInfo.thresholdDays} day{pruneInfo.thresholdDays === 1 ? '' : 's'}</strong>{' '}
          are dropped automatically (hourly, off the bot's auto-join write path).{' '}
          {pruneInfo.lastRunTs ? (
            <>
              Last run <strong>{fmtTs(pruneInfo.lastRunTs)}</strong>
              {typeof pruneInfo.lastRemoved === 'number'
                ? ` — removed ${pruneInfo.lastRemoved} row${pruneInfo.lastRemoved === 1 ? '' : 's'}.`
                : '.'}
            </>
          ) : (
            <>Has not run yet on this database.</>
          )}
        </p>
      )}

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#450a0a', border: '1px solid #f87171',
                      color: '#fca5a5', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {statusMsg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: '#052e16', border: '1px solid #4ade80',
                      color: '#86efac', fontSize: 13, marginBottom: 12 }}>
          {statusMsg}
        </div>
      )}

      {failures !== null && rows.length === 0 && !error && (
        <p style={{ color: '#4ade80', fontSize: 13 }}>
          ✓ No players are currently stuck waiting to retry their Discord auto-join.
        </p>
      )}

      {rows.length > 0 && (
        <div className="scoreboard-wrapper">
          <table className="scoreboard" style={{ fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Nickname</th>
                <th style={{ textAlign: 'left' }}>Account ID</th>
                <th style={{ textAlign: 'left' }}>Discord ID</th>
                <th style={{ textAlign: 'left' }}>Last Code</th>
                <th>Attempts</th>
                <th>First Failed</th>
                <th>Last Failed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const key = `${row.discord_id}|${row.account_id}`;
                const label = row.nickname || `#${row.account_id}`;
                return (
                  <tr key={key}>
                    <td style={{ fontWeight: 600 }}>
                      {row.account_id ? (
                        <a href={`/player/${row.account_id}`} target="_blank" rel="noopener noreferrer"
                           style={{ color: 'var(--accent)' }}>{label}</a>
                      ) : label}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{row.account_id || '—'}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{row.discord_id || '—'}</td>
                    <td>
                      <code style={{ fontSize: 11 }}>{row.last_code || 'unknown'}</code>
                      {row.last_error && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2,
                                      maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                             title={row.last_error}>
                          {row.last_error}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600,
                                 color: row.attempts > 1 ? '#f59e0b' : 'var(--text-muted)' }}>
                      {row.attempts}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                      {fmtTs(row.first_failed_at)}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                      {fmtTs(row.last_failed_at)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-sm"
                        disabled={!!clearing[key]}
                        onClick={() => handleClear(row)}
                        style={{ fontSize: 11, padding: '2px 8px', color: '#f87171', borderColor: '#f87171' }}
                      >
                        {clearing[key] ? 'Working…' : '✕ Clear'}
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
    superuserFetch('/api/admin/list-backups', { headers: authHeader })
      .then(r => r.json())
      .then(d => setBackups(d.backups || []))
      .catch(() => setBackups([]));
  }

  function handleBackup() {
    setBackupLoading(true);
    setBackupMsg('');
    superuserFetch('/api/admin/backup-db', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'manual' }) })
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
    superuserFetch('/api/admin/restore-backup', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ backup }) })
      .then(r => r.json())
      .then(d => { alert(d.message || d.error); loadBackups(); })
      .catch(e => alert('Restore failed: ' + e.message))
      .finally(() => setRestoring(''));
  }

  function handleDelete(backup) {
    if (!window.confirm(`Permanently delete backup: ${backup}?\n\nThis cannot be undone.`)) return;
    setDeleting(backup);
    superuserFetch(`/api/admin/delete-backup/${backup}`, { method: 'DELETE', headers: authHeader })
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
    superuserFetch('/api/admin/fix-nickname-account-ids', {
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
        <h3 id="ap-anchor-db-backups" style={{ margin: 0, fontSize: '1rem' }}>Database Backups</h3>
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
    superuserFetch(url, { headers: authHeader })
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
    superuserFetch(`/api/admin/reparse-replay/${matchId}`, { method: 'POST', headers: authHeader })
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
    superuserFetch('/api/admin/reparse-all-replays', { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(r => r.json())
      .then(d => {
        setReparseAllStatus(d);
        if (d.running || d.success) {
          const poll = setInterval(() => {
            superuserFetch('/api/admin/reparse-all-status', { headers: authHeader })
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
    superuserFetch('/api/admin/replays/set-all-permanent', { method: 'POST', headers: authHeader })
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
        <h2 id="ap-anchor-stored-replays" style={{ margin: 0 }}>Stored Replays</h2>
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
      <h2 id="ap-anchor-replay-archive">Replay Archive (Dedicated Server)</h2>
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
      const res = await superuserFetch('/api/admin/test-dm', {
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
        <h2 id="ap-anchor-test-dm" style={{ margin: 0 }}>Test Post-Match DM</h2>
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
      const res = await superuserFetch('/api/admin/test-rsvp-dm', {
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
        <h2 id="ap-anchor-test-rsvp-dm" style={{ margin: 0 }}>Test RSVP Registration DM</h2>
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
    superuserFetch(`/api/admin/error-log?${params}`, { headers: authHeader })
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => { setLogs([]); setLoading(false); });
  }

  function handleClear() {
    if (!window.confirm('Clear server logs older than 30 days?')) return;
    superuserFetch('/api/admin/error-log?days=30', { method: 'DELETE', headers: authHeader })
      .then(r => r.json())
      .then(d => { setClearMsg(d.message || 'Done.'); load(); })
      .catch(e => setClearMsg('Error: ' + e.message));
  }

  const levelColor = l => ({ error: '#f87171', warn: '#facc15', info: '#60a5fa' }[l] || '#aaa');

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 id="ap-anchor-error-log" style={{ margin: 0 }}>Server Error Log</h2>
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
// v5.89 — small standalone button + log viewer for the community → full
// nickname/discord/rank sync. Lives in the rank management section because
// it shares context (one-shot data imports for player metadata).
function CommunitySyncButton({ superuserKey }) {
  const [busy, setBusy] = React.useState(false);
  const [overwrite, setOverwrite] = React.useState(false);
  const [dryRun, setDryRun] = React.useState(true);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  async function run() {
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await superuserFetch('/api/admin/sync-community-nicknames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ overwrite, dryRun }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setResult(d);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} /> Dry run (preview only)
        </label>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} /> Overwrite existing values
        </label>
        <button className="btn btn-primary" disabled={busy} onClick={run}>
          {busy ? '⏳ Syncing…' : (dryRun ? '🔍 Preview Sync' : '📥 Run Sync Now')}
        </button>
      </div>
      {error && <div style={{ padding: 10, background: 'rgba(244,67,54,0.1)', border: '1px solid #f44336', borderRadius: 6, color: '#f44336', fontSize: 13 }}>{error}</div>}
      {result && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>{result.dryRun ? 'DRY RUN — nothing was written.' : 'Done.'}</strong>{' '}
            inserted={result.inserted} · updated={result.updated} · skipped={result.skipped} · players-linked={result.playerLinked} · total-source-rows={result.total}
          </div>
          <pre style={{ maxHeight: 280, overflow: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 11, lineHeight: 1.4 }}>
            {result.log}
          </pre>
        </div>
      )}
    </div>
  );
}

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
      <h2 id="ap-anchor-season-lifecycle" style={{ margin: '0 0 6px', fontSize: '1rem' }}>📅 Season Lifecycle</h2>
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
      <h2 id="ap-anchor-season-tiers" style={{ marginBottom: 6 }}>🏆 Season Tiers</h2>
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
                                dbTiers={[{ min_mmr: Number(draftFloor), name: draftName || t.name, sponsor_name: null }]}
                              />
                            </span>
                            {draftSponsor && (
                              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sponsored (when active)</span>
                                <TierBadge
                                  mmr={Number(draftFloor)}
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
      const r = await superuserFetch('/api/admin/steam/status', { headers: auth });
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
      const r = await superuserFetch(url, {
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
        <h2 id="ap-anchor-steam-bot" style={{ margin: 0 }}>🤖 Steam Bot Controls</h2>
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
                    const r = await superuserFetch('/api/admin/steam/friends/add-all', { method: 'POST', headers: auth });
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
    const r = await superuserFetch('/api/admin/settings', {
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
      <h2 id="ap-anchor-engagement" style={{ marginBottom: 6 }}>🎯 Engagement</h2>
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

function BroadcastTickerPanel({ superuserKey }) {
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [text, setText] = React.useState('');

  React.useEffect(() => {
    fetch('/api/settings/broadcast-ticker')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        let parsed = { enabled: true, items: [] };
        if (d?.value) {
          try { parsed = { ...parsed, ...(typeof d.value === 'string' ? JSON.parse(d.value) : d.value) }; } catch {}
        }
        setCfg(parsed);
        setText((parsed.items || []).join('\n'));
      })
      .catch(() => { setCfg({ enabled: true, items: [] }); setText(''); });
  }, []);

  if (!cfg) return null;

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const items = text.split('\n').map(s => s.trim()).filter(Boolean);
      if (items.length === 0) {
        setMsg('Error: at least one ticker item is required.');
        setSaving(false);
        return;
      }
      const r = await superuserFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ key: 'broadcast_ticker', value: JSON.stringify({ enabled: !!cfg.enabled, items }) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      let parsedValue = null;
      try {
        parsedValue = JSON.parse(d.setting.value);
        setCfg(parsedValue);
        setText((parsedValue.items || []).join('\n'));
      } catch {}
      // Notify the live <BroadcastTicker/> mounted in App.jsx so the bar
      // updates without a full page reload (and without waiting for the
      // visibilitychange refetch).
      try {
        window.dispatchEvent(new CustomEvent('broadcast-ticker-updated', {
          detail: parsedValue || { enabled: !!cfg.enabled, items },
        }));
      } catch {}
      setMsg('Saved.');
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
      <h2 id="ap-anchor-broadcast-ticker" style={{ marginBottom: 6 }}>📢 Broadcast Ticker (CMS)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Editor-controlled scrolling ticker that runs across the very top of every page.
        One headline per line. Disable to hide the bar entirely.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 580 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={!!cfg.enabled}
            onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))}
          />
          Ticker enabled
        </label>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            Items (one per line)
          </label>
          <textarea
            rows={8}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Season 10 ladder live\nInhouse lobby open · /inhouse\nCoaching marketplace beta'}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save ticker'}
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

// Read-only visual reference of the full IH ladder (V1 + V3 thresholds).
// Lives in the admin Config tab so admins can confirm at a glance how
// every rank is named, what its symbol is, and what MMR cutoff it uses
// — without leaving the panel.
function TierLadderPreview() {
  // v5.83 — single canonical ladder. Iterate the actual MMR_TIERS export
  // from Leaderboard.jsx (top tier first → bottom tier last) so the preview
  // is always in lockstep with what the leaderboard renders.
  // King is the leaderOnly tier; pass `isLeader` so it actually renders.
  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-tier-ladder" className="section-title" style={{ marginBottom: 6 }}>
        🎖️ Tier Ladder Preview
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Read-only reference of every IH rank (name, symbol, MMR cutoff) in the
        current ladder. Edit thresholds in <code>web/src/pages/Leaderboard.jsx</code>.
        <strong style={{ color: 'var(--accent)', marginLeft: 6 }}>King</strong> is reserved
        for the #1 leaderboard player only — every other player tops out at Warlord.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 460 }}>
        {MMR_TIERS.map((t) => {
          const isKing = t.leaderOnly;
          const previewMmr = isKing ? 9999 : t.min;
          return (
            <div key={t.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
            }}>
              <TierBadge mmr={previewMmr} dbTiers={null} isLeader={isKing} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {isKing ? '#1 leaderboard only' : `≥ ${t.min} MMR`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Task #127 — Discord guild auto-join health panel.
// Surfaces the in-memory ring buffer maintained by DiscordBot
// (`addUserToLeagueGuild` outcomes over the last 24h) so admins can see
// at a glance whether new signups are actually landing in the Discord
// server, instead of having to tail the throttled alert channel.
function DiscordAutoJoinStatusPanel({ superuserKey }) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  // Task #142 — 7-day history (sparkline buckets + paginated failure list).
  const [history, setHistory] = React.useState(null);
  const [historyErr, setHistoryErr] = React.useState('');
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [failuresOffset, setFailuresOffset] = React.useState(0);
  const FAILURES_PAGE_SIZE = 20;
  const HISTORY_DAYS = 7;

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    setLoading(true);
    superuserFetch('/api/admin/discord-autojoin-status', { headers: { 'x-superuser-key': superuserKey } })
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else { setData(d); setErr(''); } })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [superuserKey]);

  const loadHistory = React.useCallback((offset = 0) => {
    if (!superuserKey) return;
    setHistoryLoading(true);
    const qs = new URLSearchParams({
      days: String(HISTORY_DAYS),
      failures_limit: String(FAILURES_PAGE_SIZE),
      failures_offset: String(offset),
    }).toString();
    superuserFetch(`/api/admin/discord-autojoin-history?${qs}`, { headers: { 'x-superuser-key': superuserKey } })
      .then(r => r.json())
      .then(d => { if (d.error) setHistoryErr(d.error); else { setHistory(d); setHistoryErr(''); } })
      .catch(e => setHistoryErr(e.message))
      .finally(() => setHistoryLoading(false));
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { loadHistory(failuresOffset); }, [loadHistory, failuresOffset]);

  const counts = data?.counts || {};
  const successCount = (counts.success_added || 0) + (counts.success_already || 0);
  const failureCount = Object.entries(counts)
    .filter(([k]) => !k.startsWith('success_'))
    .reduce((sum, [, v]) => sum + v, 0);
  const totalRecent = data?.recent_count || 0;

  // Health logic: red if any failures in the last 24h AND no successes after
  // the last failure (i.e. broken right now); amber if there are failures but
  // also more recent successes (transient hiccup); green otherwise.
  let level = 'green';
  let levelLabel = 'Healthy';
  if (!data?.guild_configured || !data?.bot_token_configured) {
    level = 'red';
    levelLabel = 'Not configured';
  } else if (failureCount > 0) {
    const lastFailTs = data?.last_failure?.ts || 0;
    const hasRecentSuccess = (data?.last_success_ts || 0) > lastFailTs;
    level = hasRecentSuccess ? 'amber' : 'red';
    levelLabel = hasRecentSuccess ? 'Recovered after failures' : 'Failures in last 24h';
  } else if (totalRecent === 0) {
    level = 'amber';
    levelLabel = 'No signups recorded yet';
  }

  const COLORS = {
    green: { bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.4)', text: '#4ade80' },
    amber: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.45)', text: '#f59e0b' },
    red: { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.5)', text: '#ef4444' },
  };
  const c = COLORS[level];

  function fmtTs(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  }

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-discord-autojoin" className="section-title" style={{ marginBottom: 6 }}>
        🤝 Discord Auto-Join Health
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Outcomes of <code>bot.addUserToLeagueGuild</code> over the last 24 hours
        (in-memory ring buffer of the most recent {data?.buffer_capacity || 50} attempts —
        resets on bot restart). If new signups aren't landing in the Discord server,
        the most recent failure code and a remediation hint will show below.
      </p>

      {err && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 13, color: '#fca5a5', marginBottom: 12 }}>
          Status check failed: {err}
        </div>
      )}

      {data && (
        <>
          <div style={{ padding: '10px 14px', borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`, fontSize: 13, color: c.text, marginBottom: 12, fontWeight: 600 }}>
            ● {levelLabel} — {totalRecent} attempt{totalRecent === 1 ? '' : 's'} recorded in the last 24h
            ({successCount} success / {failureCount} failed)
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
            <StatPill label="Added (new member)" value={counts.success_added || 0} tone="ok" />
            <StatPill label="Already in guild" value={counts.success_already || 0} tone="ok" />
            <StatPill label="HTTP 403 (perms)" value={counts.http_403 || 0} tone={counts.http_403 ? 'bad' : 'muted'} />
            <StatPill label="HTTP 404 (not found)" value={counts.http_404 || 0} tone={counts.http_404 ? 'bad' : 'muted'} />
            <StatPill label="HTTP 429 (rate limit)" value={counts.http_429 || 0} tone={counts.http_429 ? 'bad' : 'muted'} />
            <StatPill label="HTTP 401 (token)" value={counts.http_401 || 0} tone={counts.http_401 ? 'bad' : 'muted'} />
            <StatPill label="Network errors" value={counts.network || 0} tone={counts.network ? 'bad' : 'muted'} />
            <StatPill label="Other failures" value={
              Object.entries(counts)
                .filter(([k]) => !k.startsWith('success_') && !['http_401','http_403','http_404','http_429','network'].includes(k))
                .reduce((s, [, v]) => s + v, 0)
            } tone="muted" />
          </div>

          {data.last_failure ? (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              <div style={{ color: '#fca5a5', fontWeight: 600, marginBottom: 4 }}>
                Last failure: <code>{data.last_failure.code}</code> at {fmtTs(data.last_failure.ts)}
                {data.last_failure.discordId && <> for user <code>{data.last_failure.discordId}</code></>}
              </div>
              <div>{data.last_failure.hint}</div>
              {data.last_failure.error && (
                <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                  Discord said: {data.last_failure.error}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.25)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              No failures recorded in the current ring buffer.
            </div>
          )}

          <DiscordAutoJoinHistorySection
            history={history}
            err={historyErr}
            loading={historyLoading}
            offset={failuresOffset}
            pageSize={FAILURES_PAGE_SIZE}
            days={HISTORY_DAYS}
            onPage={setFailuresOffset}
            onRefresh={() => loadHistory(failuresOffset)}
            fmtTs={fmtTs}
          />

          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span><code>DISCORD_GUILD_ID</code>: {data.guild_configured ? '✓ set' : '✗ missing'}</span>
            <span><code>DISCORD_TOKEN</code>: {data.bot_token_configured ? '✓ set' : '✗ missing'}</span>
            <span><code>DISCORD_LEAGUE_MEMBER_ROLE_ID</code>: {data.league_role_configured ? '✓ set' : '— optional'}</span>
            <span><code>DISCORD_ADMIN_LOG_CHANNEL_ID</code>: {data.admin_log_channel_configured ? '✓ set' : '— alerts disabled'}</span>
            <button className="btn" onClick={load} disabled={loading} style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// Task #142 — 7-day timeline + paginated failure list for the auto-join
// health panel. Renders per-day stacked success/failure bars (a poor-
// person's sparkline using divs) so admins can spot multi-day dips that
// the existing 24h rollup hides, plus a tabular drill-down of the failure
// rows behind those dips. All read-only.
function DiscordAutoJoinHistorySection({ history, err, loading, offset, pageSize, days, onPage, onRefresh, fmtTs }) {
  const buckets = history?.buckets || [];
  const failures = history?.failures || [];
  const total = history?.failures_total || 0;
  // Scale every bar against the busiest day so a quiet week isn't flattened.
  const maxCount = Math.max(
    1,
    ...buckets.map(b => (b.success || 0) + (b.failure || 0))
  );
  const dayLabel = (ms) => {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return ''; }
  };
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(total, offset + failures.length);
  const canPrev = offset > 0;
  const canNext = offset + failures.length < total;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
          Last {days} days — daily success vs failure
        </div>
        <button className="btn" onClick={onRefresh} disabled={loading} style={{ padding: '2px 8px', fontSize: 11 }}>
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {err && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>
          History load failed: {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, buckets.length)}, 1fr)`, gap: 6, alignItems: 'end', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', minHeight: 90, marginBottom: 12 }}>
        {buckets.length === 0 && !loading && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No history yet.
          </div>
        )}
        {buckets.map((b) => {
          const successFrac = (b.success || 0) / maxCount;
          const failureFrac = (b.failure || 0) / maxCount;
          const total = (b.success || 0) + (b.failure || 0);
          return (
            <div key={b.day} title={`${dayLabel(b.day)} — ${b.success} success / ${b.failure} failure`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 60, width: '100%' }}>
                <div style={{ height: `${failureFrac * 100}%`, background: 'rgba(239,68,68,0.7)', borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
                <div style={{ height: `${successFrac * 100}%`, background: 'rgba(74,222,128,0.7)', borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dayLabel(b.day)}</div>
              <div style={{ fontSize: 10, color: total === 0 ? 'var(--text-muted)' : 'var(--text)', fontWeight: 600 }}>
                {total === 0 ? '—' : total}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        Recent failures (last {days} days) — {total} total
      </div>
      {failures.length === 0 ? (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.25)', fontSize: 12, color: 'var(--text-muted)' }}>
          No failures in the last {days} days.
        </div>
      ) : (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-card)', textAlign: 'left' }}>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>When</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>Code</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>Discord ID</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-muted)' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((f, i) => (
                <tr key={`${f.ts}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtTs(f.ts)}</td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}><code>{f.code}</code></td>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{f.discordId || '—'}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-word' }}>{f.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > pageSize && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>Showing {showingFrom}–{showingTo} of {total}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" disabled={!canPrev || loading} onClick={() => onPage(Math.max(0, offset - pageSize))} style={{ padding: '2px 10px', fontSize: 11 }}>← Prev</button>
            <button className="btn" disabled={!canNext || loading} onClick={() => onPage(offset + pageSize)} style={{ padding: '2px 10px', fontSize: 11 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, tone }) {
  const TONES = {
    ok: { color: '#4ade80', border: 'rgba(74,222,128,0.3)' },
    bad: { color: '#ef4444', border: 'rgba(239,68,68,0.4)' },
    muted: { color: 'var(--text-muted)', border: 'var(--border)' },
  };
  const t = TONES[tone] || TONES.muted;
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-card)', border: `1px solid ${t.border}` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: t.color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

// Task #113 — Stripe configuration banner.
// Sits at the top of the Site Settings tab so an admin notices immediately
// when STRIPE_SECRET_KEY is missing in the current environment, rather than
// finding out via a user report of "Payments are not configured" on the
// coaching apply CTA. Reads /api/admin/stripe-status (superuser-only).
function StripeStatusBanner({ superuserKey }) {
  const [status, setStatus] = React.useState(null);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    if (!superuserKey) return;
    superuserFetch('/api/admin/stripe-status', { headers: { 'x-superuser-key': superuserKey } })
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setStatus(d); })
      .catch(e => setErr(e.message));
  }, [superuserKey]);

  if (err) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 13, color: '#fca5a5' }}>
        Stripe status check failed: {err}
      </div>
    );
  }
  if (!status) return null;

  const flagOn = status.coaching_marketplace_state === 'on' || status.coaching_marketplace_state === 'preview';
  if (!status.configured && flagOn) {
    return (
      <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.5)', fontSize: 13, color: '#fecaca' }}>
        <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>⚠️ Stripe not configured</div>
        <code>STRIPE_SECRET_KEY</code> is missing on this environment, but the
        coaching marketplace flag is <code>{status.coaching_marketplace_state}</code>.
        Every coaching checkout / "Continue with Stripe" call will return
        <em> "Payments are not configured"</em> until the secret is set on the
        prod host (e.g. <code>~/Dota-Stats-Full/.env</code>) and PM2 is
        restarted.
      </div>
    );
  }
  if (!status.configured) {
    return (
      <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', fontSize: 12, color: 'var(--text-muted)' }}>
        ℹ️ <code>STRIPE_SECRET_KEY</code> is not set. Payments are disabled.
        The coaching marketplace flag is currently <code>off</code>, so no
        user-facing 503s will fire — but enabling the flag without setting the
        secret will break the apply / booking flow.
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.3)', fontSize: 12, color: 'var(--text-muted)' }}>
      ✓ Stripe configured ({status.webhook_configured ? 'webhook secret set' : 'webhook secret missing'}).
      Coaching marketplace flag: <code>{status.coaching_marketplace_state}</code>.
    </div>
  );
}

// v5.93 — Coaching Marketplace launch kill-switch.
// Surfaces the `coaching_marketplace` feature flag in the admin Config tab so
// it can be flipped between 'on' / 'preview' / 'off' without a DB shell if
// anything goes sideways post-launch. 'preview' = visible to superusers only.
function CoachingMarketplaceFlagPanel({ superuserKey }) {
  const [state, setState] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const load = React.useCallback(() => {
    if (!superuserKey) return;
    getAdminFeatureFlags(superuserKey)
      .then(d => {
        const row = (d.flags || []).find(f => f.key === 'coaching_marketplace');
        setState(row?.state || 'off');
      })
      .catch(e => setMsg('Load failed: ' + e.message));
  }, [superuserKey]);

  React.useEffect(() => { load(); }, [load]);

  async function handleSet(next) {
    if (next === state) return;
    setSaving(true);
    setMsg('');
    try {
      await setFeatureFlag({ key: 'coaching_marketplace', state: next }, superuserKey);
      setState(next);
      setMsg(`Saved — flag is now ${next}.`);
    } catch (e) {
      setMsg('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const OPTIONS = [
    { value: 'on', label: 'On', hint: 'Live for everyone' },
    { value: 'preview', label: 'Preview', hint: 'Superusers only' },
    { value: 'off', label: 'Off', hint: 'Hidden + routes 404' },
  ];

  return (
    <section className="admin-section" style={{ marginTop: 32 }}>
      <h2 id="ap-anchor-coaching-flag" className="section-title" style={{ marginBottom: 6 }}>
        🎓 Coaching Marketplace — feature flag
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Single switch for the <code>coaching_marketplace</code> flag. Use this to roll back to
        <code> preview</code> (superusers only) or <code>off</code> (hidden + every coaching API
        route returns 404) if the launch needs to be paused. Flipping back to <code>on</code>
        re-opens the marketplace immediately for all users.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {OPTIONS.map(opt => {
          const active = state === opt.value;
          return (
            <button
              key={opt.value}
              className="btn"
              disabled={saving || state === null}
              onClick={() => handleSet(opt.value)}
              title={opt.hint}
              style={{
                padding: '6px 14px',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'rgba(245,158,11,0.15)' : 'var(--bg-card)',
                color: active ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: active ? 700 : 500,
              }}
            >
              {opt.label}
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                {opt.hint}
              </span>
            </button>
          );
        })}
        {msg && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{msg}</span>}
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
      // Always bump version on save so previously-dismissed users see the update.
      // The "Save without re-show" button (bumpVersion=false) is preserved for rare edits.
      if (bumpVersion !== false) payload.version = (parseInt(cfg.version, 10) || 1) + 1;
      const r = await superuserFetch('/api/admin/settings', {
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
      <h2 id="ap-anchor-welcome-modal" style={{ marginBottom: 6 }}>📣 Welcome Modal (CMS)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Editor-controlled welcome modal shown to all visitors. Bump the version to re-show it to users
        who already dismissed the previous one.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 580 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          alignSelf: 'flex-start',
          background: cfg.enabled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: cfg.enabled ? '#22c55e' : '#ef4444',
          border: `1px solid ${cfg.enabled ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
        }}>
          {cfg.enabled ? '✓ Currently ENABLED — visitors will see the modal' : '✗ Currently DISABLED — modal will not show'}
        </div>

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
          <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
            {saving ? 'Saving…' : 'Save & re-show to everyone'}
          </button>
          <button className="btn" disabled={saving} onClick={() => save(false)} title="Edit content without re-prompting users who already dismissed">
            Save quietly (no re-show)
          </button>
          <button
            className="btn"
            type="button"
            title="Clears your local dismiss flag for every modal version and reloads the home page so you can verify the modal renders."
            onClick={() => {
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k && k.startsWith('welcome_modal_dismissed_v')) {
                    localStorage.removeItem(k);
                    i--;
                  }
                }
              } catch {}
              window.open('/', '_blank');
            }}
          >
            🔍 Preview on home (new tab)
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

function HomeBannerPanel({ superuserKey }) {
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    fetch('/api/settings/home-banner')
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
      if (bumpVersion !== false) payload.version = (parseInt(cfg.version, 10) || 1) + 1;
      const r = await superuserFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-superuser-key': superuserKey },
        body: JSON.stringify({ key: 'home_banner', value: JSON.stringify(payload) }),
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
      <h2 id="ap-anchor-home-banner" style={{ marginBottom: 6 }}>🪧 Home Banner (CMS)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
        Editor-controlled dismissable banner shown at the top of the home page. Bump the version to re-show it to users
        who already dismissed the previous one.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 580 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          alignSelf: 'flex-start',
          background: cfg.enabled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: cfg.enabled ? '#22c55e' : '#ef4444',
          border: `1px solid ${cfg.enabled ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
        }}>
          {cfg.enabled ? '✓ Currently ENABLED — visitors will see the banner' : '✗ Currently DISABLED — banner will not show'}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={!!cfg.enabled} onChange={e => upd('enabled', e.target.checked)} />
          Banner enabled
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
          <textarea rows={3} value={cfg.body || ''} onChange={e => upd('body', e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>CTA text</label>
            <input type="text" value={cfg.ctaText || ''} onChange={e => upd('ctaText', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>CTA href</label>
            <input type="text" value={cfg.ctaHref || ''} onChange={e => upd('ctaHref', e.target.value)} placeholder="/leaderboard" style={inputStyle} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Current version: <strong>v{cfg.version || 1}</strong> · dismiss key: <code>home_banner_dismissed_v{cfg.version || 1}</code>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
            {saving ? 'Saving…' : 'Save & re-show to everyone'}
          </button>
          <button className="btn" disabled={saving} onClick={() => save(false)} title="Edit content without re-prompting users who already dismissed">
            Save quietly (no re-show)
          </button>
          <button
            className="btn"
            type="button"
            title="Clears your local dismiss flag for every banner version and reloads the home page so you can verify the banner renders."
            onClick={() => {
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k && k.startsWith('home_banner_dismissed_v')) {
                    localStorage.removeItem(k);
                    i--;
                  }
                }
              } catch {}
              window.open('/', '_blank');
            }}
          >
            🔍 Preview on home (new tab)
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
  // TrueSkill V3 is the sole production rating engine; the legacy V1
  // implementation and the V3-vs-V1 admin preview were removed in v5.95.
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
  const [searchQuery, setSearchQuery] = useState('');

  const loadRanks = useCallback(() => {
    if (!isSuperuser) return;
    getPlayerRanks().then(setRanks).catch(() => {});
  }, [isSuperuser]);

  useEffect(() => { loadRanks(); }, [loadRanks]);

  const loadUnregistered = useCallback(async () => {
    if (!isSuperuser) return;
    setUnregLoading(true);
    try {
      const r = await superuserFetch('/api/admin/unregistered-players', { headers: { 'x-superuser-key': superuserKey } });
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
    superuserFetch('/api/admin/overview', { headers: authHeader })
      .then(r => r.json())
      .then(setOverview)
      .catch(() => {});
  }, [isSuperuser, superuserKey]);

  useEffect(() => {
    loadOverview();
  }, [isSuperuser, loadOverview]);

  const loadSiteSettings = useCallback(() => {
    if (!isSuperuser) return;
    superuserFetch('/api/admin/settings', { headers: authHeader })
      .then(r => r.json())
      .then(d => setSiteSettings(d.settings || {}))
      .catch(() => {});
  }, [isSuperuser, superuserKey]);

  useEffect(() => { loadSiteSettings(); }, [loadSiteSettings]);

  const handleRecalculate = async () => {
    setRecalcLoading(true);
    setRecalcMsg('');
    try {
      const r = await superuserFetch('/api/admin/recalculate-ratings', { method: 'POST', headers: authHeader });
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
      const r = await superuserFetch('/api/admin/duplicate-matches', { headers: authHeader });
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

  // Searchable index of admin features. Each entry deep-links to a tab and
  // optionally scrolls to a specific section anchor within that tab.
  const SEARCH_INDEX = [
    { label: 'Overview', tab: 'overview', icon: '📊', kw: 'dashboard stats home' },
    { label: 'Quick Links', tab: 'overview', anchor: 'ap-anchor-quick-links', icon: '🔗', kw: 'shortcuts' },
    { label: 'Record a Match', tab: 'matches', anchor: 'ap-anchor-record-match', icon: '📝', kw: 'manual entry add game' },
    { label: 'Maintenance', tab: 'matches', anchor: 'ap-anchor-maintenance', icon: '🛠️', kw: 'recompute rebuild' },
    { label: 'Stored Replays', tab: 'matches', anchor: 'ap-anchor-stored-replays', icon: '🎞️', kw: 'replay file download reparse expire' },
    { label: 'Replay Archive (Dedicated Server)', tab: 'matches', anchor: 'ap-anchor-replay-archive', icon: '🗂️', kw: 'dedicated server path' },
    { label: 'Replay Inspector', tab: 'matches', anchor: 'ap-anchor-replay-inspector', icon: '🔍', kw: 'parse debug' },
    { label: 'Database Backups', tab: 'matches', anchor: 'ap-anchor-db-backups', icon: '💾', kw: 'restore snapshot pg_dump nicknames' },
    { label: 'Steam Bot Controls', tab: 'steambot', anchor: 'ap-anchor-steam-bot', icon: '🤖', kw: 'lobby login reconnect status' },
    { label: 'Test Post-Match DM', tab: 'steambot', anchor: 'ap-anchor-test-dm', icon: '✉️', kw: 'discord direct message debug' },
    { label: 'Test RSVP Registration DM', tab: 'steambot', anchor: 'ap-anchor-test-rsvp-dm', icon: '✉️', kw: 'discord rsvp invite' },
    { label: 'Server Error Log', tab: 'steambot', anchor: 'ap-anchor-error-log', icon: '🚨', kw: 'errors crashes log' },
    { label: 'Season Lifecycle', tab: 'seasons', anchor: 'ap-anchor-season-lifecycle', icon: '📅', kw: 'start end activate launch' },
    { label: 'Season Tiers', tab: 'seasons', anchor: 'ap-anchor-season-tiers', icon: '🏆', kw: 'rank divisions ladder' },
    { label: 'Rating System', tab: 'seasons', anchor: 'ap-anchor-rating-system', icon: '⚖️', kw: 'trueskill mmr recompute' },
    { label: 'Hero Tier Overrides', tab: 'seasons', anchor: 'ap-anchor-hero-tier', icon: '🏆', kw: 'meta heroes' },
    { label: 'Achievement System', tab: 'seasons', anchor: 'ap-anchor-achievements', icon: '🏅', kw: 'badges unlock' },
    { label: 'Engagement', tab: 'config', anchor: 'ap-anchor-engagement', icon: '🎯', kw: 'pinned highlights showcase' },
    { label: 'Broadcast Ticker (CMS)', tab: 'config', anchor: 'ap-anchor-broadcast-ticker', icon: '📢', kw: 'announcement banner' },
    { label: 'Welcome Modal (CMS)', tab: 'config', anchor: 'ap-anchor-welcome-modal', icon: '📣', kw: 'popup intro onboarding cta' },
    { label: 'Home Banner (CMS)', tab: 'config', anchor: 'ap-anchor-home-banner', icon: '🪧', kw: 'home banner hero ad announcement dismissable closeable' },
    { label: 'Tier Ladder Preview', tab: 'config', anchor: 'ap-anchor-tier-ladder', icon: '🎖️', kw: 'rank tier symbol badge ladder reference' },
    { label: 'Coaching Marketplace Flag', tab: 'config', anchor: 'ap-anchor-coaching-flag', icon: '🎓', kw: 'coaching marketplace feature flag toggle on off preview kill switch rollback' },
    { label: 'Draft Sandbox', tab: 'steambot', anchor: 'ap-anchor-draft-sandbox', icon: '🎮', kw: 'draft pick captain test simulator placeholder dummy lobby inhouse' },
    { label: 'Dota 2 Rank Management', tab: 'users', anchor: 'ap-anchor-rank-management', icon: '🎖️', kw: 'rank tier players' },
    { label: 'Manage Nicknames (Players page)', tab: 'users', anchor: 'ap-anchor-nicknames', icon: '✏️', kw: 'nickname rename alias display name' },
    { label: 'Profile Sandbox', tab: 'users', anchor: 'ap-anchor-profile-preview', icon: '👤', kw: 'profile customization edit bio title accent pin sample dummy sandbox test frame premium pro theme' },
    { label: 'Unregistered Players', tab: 'users', anchor: 'ap-anchor-unregistered-players', icon: '👤', kw: 'orphan link account' },
    { label: 'Discord ID Collisions', tab: 'users', anchor: 'ap-anchor-discord-collisions', icon: '🔗', kw: 'discord duplicate merge split collision unique link reconcile' },
    { label: 'Sign-Up Requests', tab: 'users', anchor: 'signup-requests', icon: '📋', kw: 'applications join approve reject pending' },
    { label: 'Gift Purchases', tab: 'marketplace', anchor: 'ap-anchor-gifts', icon: '🎁', kw: 'pro gift stripe' },
    { label: 'Coaching Marketplace', tab: 'marketplace', anchor: 'ap-anchor-coaching', icon: '🎓', kw: 'coach payout connect bookings' },
    { label: 'Tournament Brackets', tab: 'marketplace', anchor: 'ap-anchor-tournaments', icon: '🏆', kw: 'tournament prize pool buy-in' },
  ];

  const q = searchQuery.trim().toLowerCase();
  const searchResults = q
    ? SEARCH_INDEX.filter(s =>
        s.label.toLowerCase().includes(q) ||
        (s.kw && s.kw.includes(q)) ||
        s.tab.includes(q)
      ).slice(0, 12)
    : [];

  const goToResult = (r) => {
    setActiveTab(r.tab);
    setSearchQuery('');
    if (r.anchor) {
      // wait a tick for the tab to render, then scroll
      setTimeout(() => {
        const el = document.getElementById(r.anchor);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

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
          <div className="ap-search-wrap">
            <input
              type="search"
              className="ap-search-input"
              placeholder="🔍  Search admin…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search admin features"
            />
            {searchResults.length > 0 && (
              <div className="ap-search-results" role="listbox">
                {searchResults.map((r, i) => (
                  <button
                    key={`${r.tab}-${r.anchor || i}`}
                    type="button"
                    className="ap-search-result"
                    onClick={() => goToResult(r)}
                  >
                    <span className="ap-nav-icon" aria-hidden>{r.icon || '•'}</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{r.tab}</div>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {q && searchResults.length === 0 && (
              <div className="ap-search-empty">No matches.</div>
            )}
          </div>
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
      <section id="ap-anchor-quick-links" style={{ marginBottom: 28 }}>
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
      <section id="ap-anchor-record-match" style={{ marginBottom: 36 }}>
        <h2 style={{ marginBottom: 10 }}>Record a Match</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
          Manually record a match result when no replay is available.
        </p>
        <Link to="/admin/record-match" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          📝 Open Record Match Form
        </Link>
      </section>

      {/* Maintenance */}
      <section id="ap-anchor-maintenance" style={{ marginBottom: 36 }}>
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

      {/* Draft Sandbox launcher */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-draft-sandbox" className="section-title" style={{ marginBottom: 6 }}>
          🎮 Draft Sandbox
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Self-contained client-side simulator of the inhouse captain-pick draft using 10 placeholder
          players. Lets you walk through the full 8-pick sequence (manual or auto), see the team panels
          and MMR-balance readout, and verify the draft UX without touching the live lobby, the database,
          or the Steam bot. Picks made here have <strong>zero side effects</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/admin/draft-sandbox" className="btn btn-primary">▶ Launch Draft Sandbox</Link>
          <Link to="/admin/draft-sandbox" className="btn" target="_blank" rel="noreferrer">↗ Open in new tab</Link>
        </div>
      </section>
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
      {/* v5.90 — Rating System: read-only status. The V1/V3 toggle and the
          V3-vs-V1 preview were removed because V3 is now the only supported
          engine and we're not going back. The DB column / setting key is
          left in place so historical data and any external scripts keep
          working unchanged. */}
      <section>
        <h2 id="ap-anchor-rating-system" style={{ marginBottom: 6 }}>⚖️ Rating System</h2>
        <div style={{
          padding: 12, background: 'var(--surface-2, rgba(255,255,255,0.03))',
          borderRadius: 8, marginBottom: 16, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>Rating engine:</span>
          <strong style={{ color: 'var(--accent)' }}>TrueSkill V3</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            (per-match Impact-weighted µ updates, σ floored at 2.5, no draw probability)
          </span>
        </div>
      </section>

      </>)}

      {activeTab === 'config' && (<>
      {/* ── Stripe configuration banner (Task #113) ─────────────────── */}
      <StripeStatusBanner superuserKey={superuserKey} />
      {/* ── Discord auto-join health (Task #127) ─────────────────────── */}
      <DiscordAutoJoinStatusPanel superuserKey={superuserKey} />
      {/* ── Tier Ladder Preview ──────────────────────────────────────── */}
      <TierLadderPreview />
      {/* ── Coaching Marketplace flag (v5.93 launch kill-switch) ─────── */}
      <CoachingMarketplaceFlagPanel superuserKey={superuserKey} />
      {/* ── Engagement Settings ──────────────────────────────────────── */}
      <EngagementSettingsPanel superuserKey={superuserKey} siteSettings={siteSettings} onSaved={loadSiteSettings} />
      <WelcomeModalPanel superuserKey={superuserKey} />
      <HomeBannerPanel superuserKey={superuserKey} />
      <BroadcastTickerPanel superuserKey={superuserKey} />
      </>)}

      {activeTab === 'users' && (<>
      {/* ── Discord ID Collisions (Task 114) ─────────────────────────── */}
      <DiscordIdCollisions superuserKey={superuserKey} />

      {/* ── Discord Auto-Join Retry Queue (Task #138) ────────────────── */}
      <DiscordAutoJoinFailures superuserKey={superuserKey} />

      {/* ── Dota Rank Management ─────────────────────────────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-rank-management" className="section-title" style={{ marginBottom: 12 }}>🎖️ Dota 2 Rank Management</h2>
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

        {/* v5.89 — one-shot import of nicknames + Discord IDs + Dota ranks
            from the community-edition database into this (full-edition) DB.
            Conservative by default: existing rows are NOT overwritten. The
            server reads COMMUNITY_DATABASE_URL from its env, so set that
            secret on the prod host before clicking. */}
        <div style={{ marginTop: 24, padding: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>📥 Import from Community Edition</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Pulls nicknames, Discord IDs, and Dota ranks from the community-edition DB and upserts them here.
            Requires the <code>COMMUNITY_DATABASE_URL</code> secret to be set on the server, pointing at the
            community Postgres. By default only fills empty columns — toggle <em>overwrite</em> to clobber existing values.
          </p>
          <CommunitySyncButton superuserKey={superuserKey} />
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

      {/* ── Manage Nicknames (link to /players) ──────────────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-nicknames" className="section-title" style={{ marginBottom: 6 }}>✏️ Manage Nicknames</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          The full nickname editor lives on the <strong>Players</strong> page. Set, edit, or clear a nickname,
          link a Discord ID to a registered nickname, and search/sort the full roster from there.
          Discord shortcut: <code>!adminregister &lt;account_id&gt; &lt;nickname&gt;</code>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/players" className="btn btn-primary">👥 Open Players & Nicknames editor</Link>
          <Link to="/players" className="btn" target="_blank" rel="noreferrer">↗ Open in new tab</Link>
        </div>
      </section>

      {/* ── Profile Sandbox (fully editable test profile) ────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-profile-preview" className="section-title" style={{ marginBottom: 6 }}>👤 Profile Sandbox</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Fully interactive test profile with every customization control wired up — bio, custom title,
          theme accent, profile frame (free + premium), pinned hero with caption, pinned match. The live
          preview updates as you edit. Toggle the <strong>Pro mode</strong> switch to verify the locked
          state vs. the unlocked premium state. Nothing is persisted — pure client-side simulator of
          <code>/settings/profile</code> for previewing changes before they go live to real users.
          (If you instead want to peek at a real player's profile, paste their <code>account_id</code>
          into the URL: <code>/player/&lt;id&gt;</code>.)
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/admin/profile-sandbox" className="btn btn-primary">▶ Launch Profile Sandbox</Link>
          <Link to="/admin/profile-sandbox" className="btn" target="_blank" rel="noreferrer">↗ Open in new tab</Link>
        </div>
      </section>

      {/* ── Unregistered Players ──────────────────────────────────────── */}
      <section className="admin-section" style={{ marginTop: 32 }}>
        <h2 id="ap-anchor-unregistered-players" className="section-title" style={{ marginBottom: 12 }}>👤 Unregistered Players</h2>
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
        <h2 id="ap-anchor-hero-tier" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🏆 Hero Tier Overrides</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Manually set a hero's tier to override the auto-computed tier (based on win rate). Leave blank to revert to auto-computed.
        </p>
        <HeroTierOverridesPanel superuserKey={superuserKey} selectedSeason={activeSeason} />
      </section>

      </>)}

      {activeTab === 'matches' && (<>
      <section style={{ marginBottom: 36 }}>
        <h2 id="ap-anchor-replay-inspector" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🔍 Replay Inspector</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Upload a <code>.dem</code> file to see the raw account IDs extracted by the parser — useful for verifying accounts before committing a replay.
        </p>
        <ReplayInspectorPanel superuserKey={superuserKey} />
      </section>

      </>)}

      {activeTab === 'seasons' && (<>
      <section style={{ marginBottom: 36 }}>
        <h2 id="ap-anchor-achievements" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>🏅 Achievement System</h2>
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
      const res = await superuserFetch('/api/replay-inspect', {
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
      const r = await superuserFetch('/api/admin/gifts?limit=100', {
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
        <h2 id="ap-anchor-gifts" style={{ margin: 0 }}>🎁 Gift Purchases</h2>
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
      const r = await superuserFetch('/api/admin/coaching/dashboard', {
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
    const r = await superuserFetch(`/api/admin/coaching/dispute/${id}/resolve`, {
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
    const r = await superuserFetch('/api/admin/coaching/sanction', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Superuser-Key': superuserKey },
      body: JSON.stringify({ coach_account_id: coachAccountId, severity, reason }),
    });
    if (r.ok) { setMsg(`Sanction applied: ${severity}`); load(); }
    else setMsg(`Error: ${(await r.json()).error}`);
  };

  if (hidden) return null;
  if (!data) return (
    <section><h2 id="ap-anchor-coaching">🎓 Coaching Marketplace</h2>
      <p style={{ color: 'var(--text-muted)' }}>{msg || 'Loading…'}</p>
    </section>
  );

  return (
    <section>
      <h2 id="ap-anchor-coaching" style={{ marginBottom: 6 }}>🎓 Coaching Marketplace</h2>
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
      <h2 id="ap-anchor-tournaments" style={{ marginBottom: 6 }}>🏆 Tournament Brackets</h2>
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
