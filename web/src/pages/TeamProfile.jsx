// Task #319 — Team profile page. Shows roster, team stats, invite + upkeep
// controls for owner/captain.
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTeam, payTeamUpkeep, inviteToTeam, leaveTeam } from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';

export default function TeamProfile() {
  const { id } = useParams();
  const { user } = useSteamAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [inviteId, setInviteId] = useState('');

  const refresh = () => getTeam(id).then(setData).catch((e) => setErr(e.message));

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [id]);

  if (err && !data) return <p style={{ padding: 24, color: 'crimson' }}>{err}</p>;
  if (!data) return <p style={{ padding: 24 }}>Loading…</p>;

  const { team, members, stats } = data;
  const myRole = members.find((m) => String(m.account_id) === String(user?.account_id))?.role;
  const canManage = myRole === 'owner' || myRole === 'captain';
  const upkeepUntil = team.upkeep_paid_until ? new Date(team.upkeep_paid_until) : null;
  const upkeepActive = upkeepUntil && upkeepUntil > new Date();

  const buyUpkeep = async () => {
    setBusy(true); setErr(null);
    try { const { url } = await payTeamUpkeep(team.id); if (url) window.location.href = url; }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    setErr(null);
    try { await inviteToTeam(team.id, parseInt(inviteId, 10)); setInviteId(''); refresh(); }
    catch (e) { setErr(e.message); }
  };

  const handleLeave = async () => {
    if (!window.confirm(`Leave ${team.name}?`)) return;
    try { await leaveTeam(team.id); refresh(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{
        borderLeft: `6px solid ${team.color_primary || 'var(--accent)'}`,
        background: 'var(--bg-secondary)', padding: 16, borderRadius: 6, marginBottom: 16,
      }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)' }}>
          {team.name} <span style={{ color: 'var(--text-muted)' }}>[{team.tag}]</span>
        </h1>
        {team.bio ? <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>{team.bio}</p> : null}
        <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
          {upkeepActive ? `Upkeep paid until ${upkeepUntil.toLocaleDateString()}` : 'No active upkeep.'}
        </p>
      </header>

      {err ? <p style={{ color: 'crimson' }}>{err}</p> : null}

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 14 }}>
          <h2 style={{ marginTop: 0 }}>Team record</h2>
          <p style={{ fontSize: 24, margin: '4px 0' }}>{stats.wins}W – {stats.losses}L</p>
          <p style={{ color: 'var(--text-muted)' }}>{stats.win_rate}% win rate across {stats.games} matches</p>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <h2 style={{ marginTop: 0 }}>Roster ({members.length})</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {members.map((m) => (
              <li key={m.account_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <Link to={`/player/${m.account_id}`}>{m.nickname}</Link>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{m.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {canManage ? (
        <section className="card" style={{ padding: 14, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Team management</h2>
          <form onSubmit={sendInvite} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input type="number" placeholder="Invite by account_id" value={inviteId}
              onChange={(e) => setInviteId(e.target.value)} required
              style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
            <button type="submit" style={{ padding: '8px 14px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
              Invite
            </button>
          </form>
          <button type="button" onClick={buyUpkeep} disabled={busy}
            style={{ padding: '8px 14px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
            {busy ? 'Opening Stripe…' : `Pay upkeep — $5 AUD / 30 days`}
          </button>
        </section>
      ) : null}

      {myRole && myRole !== 'owner' ? (
        <button type="button" onClick={handleLeave}
          style={{ padding: '6px 12px', background: 'transparent', color: 'crimson', border: '1px solid crimson', borderRadius: 4, cursor: 'pointer' }}>
          Leave team
        </button>
      ) : null}
    </div>
  );
}
