// Task #319 — Team profile page.
// Task #383 — Team v2: tabbed interface (Roster / Schedule / Matches / Manage)
// with roster history (joined → left dates), scrim scheduling, recent team
// matches, captain-edit, and two-captain roster transfers.
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getTeam, payTeamUpkeep, inviteToTeam, leaveTeam, editTeam,
  getTeamRosterHistory, getTeamRecentMatches, getTeamSchedule,
  proposeScrim, respondScrim, cancelScrim,
  listTeams, proposeRosterTransfer, getMyRosterTransfers, respondRosterTransfer,
} from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';

const TABS = [
  { id: 'roster',   label: 'Roster' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'matches',  label: 'Recent matches' },
  { id: 'manage',   label: 'Manage' },
];

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}
function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString(); } catch { return '—'; }
}
function fmtDuration(secs) {
  if (!secs) return '—';
  const m = Math.floor(secs / 60); const s = secs % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export default function TeamProfile() {
  const { id } = useParams();
  const { user } = useSteamAuth();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [matches, setMatches] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('roster');

  const refresh = async () => {
    try {
      const [t, h, m, s] = await Promise.all([
        getTeam(id),
        getTeamRosterHistory(id).catch(() => ({ history: [] })),
        getTeamRecentMatches(id).catch(() => ({ matches: [] })),
        getTeamSchedule(id).catch(() => ({ schedule: [] })),
      ]);
      setData(t); setHistory(h.history || []);
      setMatches(m.matches || []); setSchedule(s.schedule || []);
    } catch (e) { setErr(e.message); }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [id]);

  useEffect(() => {
    if (!user?.account_id) return;
    listTeams().then(d => setAllTeams(d.teams || [])).catch(() => {});
    getMyRosterTransfers().then(d => setTransfers(d.transfers || [])).catch(() => {});
  }, [user?.account_id, id]);

  if (err && !data) return <p style={{ padding: 24, color: 'crimson' }}>{err}</p>;
  if (!data) return <p style={{ padding: 24 }}>Loading…</p>;

  const { team, members, stats } = data;
  const myRole = members.find((m) => String(m.account_id) === String(user?.account_id))?.role;
  const canManage = myRole === 'owner' || myRole === 'captain';
  const upkeepUntil = team.upkeep_paid_until ? new Date(team.upkeep_paid_until) : null;
  const upkeepActive = upkeepUntil && upkeepUntil > new Date();

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{
        borderLeft: `6px solid ${team.color_primary || 'var(--accent)'}`,
        background: 'var(--bg-secondary)', padding: 16, borderRadius: 6, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        {team.logo_url ? (
          <img src={team.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
        ) : null}
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)' }}>
            {team.name} <span style={{ color: 'var(--text-muted)' }}>[{team.tag}]</span>
          </h1>
          {team.bio ? <p style={{ marginTop: 6, color: 'var(--text-muted)' }}>{team.bio}</p> : null}
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{stats.wins}W – {stats.losses}L</strong>
            {' · '}{stats.win_rate}% win rate · {stats.games} matches
            {stats.streak ? (
              <span style={{ marginLeft: 6, color: stats.streak > 0 ? '#22c55e' : '#f08a8a', fontWeight: 700 }}>
                {stats.streak > 0 ? `W${stats.streak}` : `L${Math.abs(stats.streak)}`} streak
              </span>
            ) : null}
            {stats.avg_mmr ? ` · avg MMR ${stats.avg_mmr}` : ''}
            {upkeepActive ? ` · upkeep paid until ${upkeepUntil.toLocaleDateString()}` : ''}
          </p>
          {(stats.hero_pool?.length || stats.signature_drafts?.length) ? (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {stats.hero_pool?.length ? (
                <span><strong style={{ color: 'var(--text-primary)' }}>Hero pool:</strong>{' '}
                  {stats.hero_pool.map(h => `#${h.hero_id} (${h.games}g ${h.games ? Math.round(100 * h.wins / h.games) : 0}%)`).join(', ')}
                </span>
              ) : null}
              {stats.signature_drafts?.length ? (
                <span><strong style={{ color: 'var(--text-primary)' }}>Signature drafts:</strong>{' '}
                  {stats.signature_drafts.map(d => (
                    <Link key={d.match_id} to={`/match/${d.match_id}`} style={{ marginRight: 6 }}>
                      #{d.match_id} ({(d.picks || []).slice(0, 5).join('/')})
                    </Link>
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {err ? <p style={{ color: 'crimson' }}>{err}</p> : null}

      <div role="tablist" aria-label="Team sections" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            type="button"
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: tab === t.id ? 700 : 500,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'roster' && (
        <div role="tabpanel" id="tabpanel-roster" aria-labelledby="tab-roster">
          <RosterPanel team={team} members={members} history={history} />
        </div>
      )}

      {tab === 'schedule' && (
        <div role="tabpanel" id="tabpanel-schedule" aria-labelledby="tab-schedule">
          <SchedulePanel
            teamId={Number(id)}
            schedule={schedule}
            canManage={canManage}
            allTeams={allTeams}
            onChange={refresh}
            setErr={setErr}
          />
        </div>
      )}

      {tab === 'matches' && (
        <div role="tabpanel" id="tabpanel-matches" aria-labelledby="tab-matches">
          <RecentMatchesPanel matches={matches} />
        </div>
      )}

      {tab === 'manage' && (
        <div role="tabpanel" id="tabpanel-manage" aria-labelledby="tab-manage">
          {canManage ? (
            <ManagePanel
              team={team}
              onChange={refresh}
              setErr={setErr}
              busy={busy}
              setBusy={setBusy}
              transfers={transfers}
              onTransfersChange={() => getMyRosterTransfers().then(d => setTransfers(d.transfers || []))}
            />
          ) : (
            <p style={{ color: 'var(--text-muted)' }}>
              Only the team owner or a captain can manage this team.
            </p>
          )}
          {myRole && myRole !== 'owner' ? (
            <button type="button" onClick={async () => {
              if (!window.confirm(`Leave ${team.name}?`)) return;
              try { await leaveTeam(team.id); refresh(); } catch (e) { setErr(e.message); }
            }}
              style={{ marginTop: 16, padding: '6px 12px', background: 'transparent', color: 'crimson', border: '1px solid crimson', borderRadius: 4, cursor: 'pointer' }}>
              Leave team
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RosterPanel({ members, history }) {
  const current = members;
  const past = useMemo(() => (history || []).filter(h => h.left_at), [history]);
  return (
    <>
      <section className="card" style={{ padding: 14, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Current roster ({current.length})</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {current.map((m) => (
            <li key={m.account_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <Link to={`/player/${m.account_id}`}>{m.nickname}</Link>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {m.role} · since {fmtDate(m.joined_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" style={{ padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Historical members</h2>
        {past.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No past members yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '4px 6px' }}>Player</th>
                <th style={{ padding: '4px 6px' }}>Role</th>
                <th style={{ padding: '4px 6px' }}>Joined</th>
                <th style={{ padding: '4px 6px' }}>Left</th>
              </tr>
            </thead>
            <tbody>
              {past.map((h) => (
                <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px' }}><Link to={`/player/${h.account_id}`}>{h.nickname}</Link></td>
                  <td style={{ padding: '6px' }}>{h.role}</td>
                  <td style={{ padding: '6px' }}>{fmtDate(h.joined_at)}</td>
                  <td style={{ padding: '6px' }}>{fmtDate(h.left_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function SchedulePanel({ teamId, schedule, canManage, allTeams, onChange, setErr }) {
  const [opponentId, setOpponentId] = useState('');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await proposeScrim(teamId, {
        opponent_team_id: parseInt(opponentId, 10),
        scheduled_at: new Date(when).toISOString(),
        note,
      });
      setOpponentId(''); setWhen(''); setNote('');
      onChange();
    } catch (e) { setErr(e.message); }
  };

  const act = async (fn) => { try { await fn(); onChange(); } catch (e) { setErr(e.message); } };
  const opponents = allTeams.filter(t => t.id !== teamId);

  return (
    <>
      {canManage && (
        <section className="card" style={{ padding: 14, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Propose a scrim</h2>
          <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Opponent team</span>
              <select required value={opponentId} onChange={e => setOpponentId(e.target.value)}
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }}>
                <option value="">— pick a team —</option>
                {opponents.map(t => <option key={t.id} value={t.id}>{t.name} [{t.tag}]</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>When</span>
              <input required type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
            </label>
            <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Note (optional)</span>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} maxLength={500}
                placeholder="bo3, captains mode, etc."
                style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
            </label>
            <button type="submit" style={{ gridColumn: '1 / -1', padding: '8px 14px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
              Send scrim request
            </button>
          </form>
        </section>
      )}

      <section className="card" style={{ padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Upcoming &amp; recent scrims</h2>
        {schedule.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No scrims scheduled yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {schedule.map((s) => {
              const opponentId2 = s.proposer_team_id === teamId ? s.opponent_team_id : s.proposer_team_id;
              const opponentLabel = s.proposer_team_id === teamId
                ? `${s.opponent_name} [${s.opponent_tag}]`
                : `${s.proposer_name} [${s.proposer_tag}] (proposed)`;
              const weAreOpponent = s.opponent_team_id === teamId && s.status === 'pending';
              return (
                <li key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <strong>vs <Link to={`/teams/${opponentId2}`}>{opponentLabel}</Link></strong>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {fmtDateTime(s.scheduled_at)} · {s.status}
                      {s.note ? ` · ${s.note}` : ''}
                    </div>
                  </div>
                  {canManage && s.status === 'pending' && (
                    <span style={{ display: 'flex', gap: 6 }}>
                      {weAreOpponent && (
                        <>
                          <button type="button" onClick={() => act(() => respondScrim(s.id, true))}
                            style={{ padding: '4px 10px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
                            Accept
                          </button>
                          <button type="button" onClick={() => act(() => respondScrim(s.id, false))}
                            style={{ padding: '4px 10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                            Decline
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => act(() => cancelScrim(s.id))}
                        style={{ padding: '4px 10px', background: 'transparent', color: 'crimson', border: '1px solid crimson', borderRadius: 4, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function RecentMatchesPanel({ matches }) {
  if (!matches || matches.length === 0) {
    return <p style={{ color: 'var(--text-muted)' }}>No recorded team matches yet.</p>;
  }
  return (
    <section className="card" style={{ padding: 14 }}>
      <h2 style={{ marginTop: 0 }}>Last {matches.length} team matches</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
            <th style={{ padding: '4px 6px' }}>Match</th>
            <th style={{ padding: '4px 6px' }}>Date</th>
            <th style={{ padding: '4px 6px' }}>Side</th>
            <th style={{ padding: '4px 6px' }}>Result</th>
            <th style={{ padding: '4px 6px' }}>Duration</th>
            <th style={{ padding: '4px 6px' }}>Players</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.match_id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px' }}><Link to={`/match/${m.match_id}`}>{m.match_id}</Link></td>
              <td style={{ padding: '6px' }}>{fmtDate(m.date)}</td>
              <td style={{ padding: '6px' }}>{m.team_side}</td>
              <td style={{ padding: '6px', color: m.won ? '#22c55e' : '#f08a8a', fontWeight: 700 }}>
                {m.won ? 'WIN' : 'LOSS'}
              </td>
              <td style={{ padding: '6px' }}>{fmtDuration(m.duration)}</td>
              <td style={{ padding: '6px' }}>{m.members_on_side}/5</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ManagePanel({ team, onChange, setErr, busy, setBusy, transfers, onTransfersChange }) {
  const [form, setForm] = useState({
    name: team.name || '',
    bio: team.bio || '',
    color_primary: team.color_primary || '#c5a975',
    color_secondary: team.color_secondary || '#0d1424',
    logo_url: team.logo_url || '',
  });
  const [inviteId, setInviteId] = useState('');
  const [transferId, setTransferId] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await editTeam(team.id, form); onChange(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const buyUpkeep = async () => {
    setBusy(true); setErr(null);
    try { const { url } = await payTeamUpkeep(team.id); if (url) window.location.href = url; }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    try { await inviteToTeam(team.id, parseInt(inviteId, 10)); setInviteId(''); onChange(); }
    catch (err) { setErr(err.message); }
  };

  const sendTransfer = async (e) => {
    e.preventDefault();
    try {
      await proposeRosterTransfer(team.id, transferId.trim());
      setTransferId('');
      onTransfersChange();
    } catch (err) { setErr(err.message); }
  };

  const respond = async (id, approve) => {
    try { await respondRosterTransfer(id, approve); onTransfersChange(); onChange(); }
    catch (err) { setErr(err.message); }
  };

  const myTransfers = (transfers || []).filter(
    t => t.from_team_id === team.id || t.to_team_id === team.id
  );

  return (
    <>
      <section className="card" style={{ padding: 14, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Team profile</h2>
        <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Team name</span>
            <input type="text" minLength={3} maxLength={60} value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
          </label>
          <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bio</span>
            <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={3}
              style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Logo URL</span>
            <input type="url" value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })}
              style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Primary colour</span>
            <input type="color" value={form.color_primary} onChange={e => setForm({ ...form, color_primary: e.target.value })}
              style={{ padding: 4, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', height: 36 }} />
          </label>
          <button type="submit" disabled={busy} style={{ gridColumn: '1 / -1', padding: '8px 14px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </section>

      <section className="card" style={{ padding: 14, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Invite a player</h2>
        <form onSubmit={sendInvite} style={{ display: 'flex', gap: 8 }}>
          <input type="number" placeholder="Steam account_id" value={inviteId}
            onChange={(e) => setInviteId(e.target.value)} required
            style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
          <button type="submit" style={{ padding: '8px 14px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
            Invite
          </button>
        </form>
      </section>

      <section className="card" style={{ padding: 14, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Roster transfer (two-captain confirm)</h2>
        <p style={{ marginTop: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Propose pulling a player currently on another team. Both this team's
          captain (you) and the source team's captain must approve before the
          move executes. Free-agent transfers only need your approval.
        </p>
        <form onSubmit={sendTransfer} style={{ display: 'flex', gap: 8 }}>
          <input type="number" placeholder="Player account_id" value={transferId}
            onChange={(e) => setTransferId(e.target.value)} required
            style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
          <button type="submit" style={{ padding: '8px 14px', background: 'var(--brass)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
            Propose transfer
          </button>
        </form>
        {myTransfers.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
            {myTransfers.map(t => (
              <li key={t.id} style={{ padding: '8px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13 }}>
                  <Link to={`/player/${t.account_id}`}>{t.nickname || t.account_id}</Link>:{' '}
                  {t.from_team_name ? `${t.from_team_name} [${t.from_team_tag}]` : 'free agent'}
                  {' → '}{t.to_team_name} [{t.to_team_tag}]
                  <span style={{ marginLeft: 6, color: 'var(--text-muted)' }}>
                    (from {t.from_approved ? '✓' : '…'} / to {t.to_approved ? '✓' : '…'})
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => respond(t.id, true)}
                    style={{ padding: '4px 10px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
                    Approve
                  </button>
                  <button type="button" onClick={() => respond(t.id, false)}
                    style={{ padding: '4px 10px', background: 'transparent', color: 'crimson', border: '1px solid crimson', borderRadius: 4, cursor: 'pointer' }}>
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Upkeep</h2>
        <button type="button" onClick={buyUpkeep} disabled={busy}
          style={{ padding: '8px 14px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
          {busy ? 'Opening Stripe…' : `Pay upkeep — $5 AUD / 30 days`}
        </button>
      </section>
    </>
  );
}
