// Task #319 — Teams / clans browse page.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTeams, getMyTeam, respondTeamInvite } from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';

export default function Teams() {
  const { user } = useSteamAuth();
  const [teams, setTeams] = useState([]);
  const [my, setMy] = useState({ team: null, invites: [] });
  const [err, setErr] = useState(null);

  const refresh = async () => {
    try { setTeams((await listTeams()).teams || []); } catch (e) { setErr(e.message); }
    if (user?.account_id) setMy(await getMyTeam());
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user?.account_id]);

  const respond = async (inviteId, accept) => {
    try { await respondTeamInvite(inviteId, accept); await refresh(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', margin: 0 }}>Teams</h1>
        {user?.account_id && !my.team ? (
          <Link to="/teams/new" className="button" style={{ background: 'var(--gold)', color: '#000', padding: '8px 14px', borderRadius: 4, textDecoration: 'none', fontWeight: 700 }}>
            Create a team — $10 AUD
          </Link>
        ) : null}
      </header>

      {err ? <p style={{ color: 'crimson' }}>{err}</p> : null}

      {my.team ? (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>You are on:</p>
          <h2 style={{ margin: '4px 0' }}>
            <Link to={`/teams/${my.team.id}`}>{my.team.name} [{my.team.tag}]</Link> — {my.team.role}
          </h2>
        </div>
      ) : null}

      {(my.invites || []).length > 0 ? (
        <section className="card" style={{ padding: 14, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Pending invites</h2>
          {my.invites.map((inv) => (
            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{inv.team_name} [{inv.team_tag}]</span>
              <span>
                <button type="button" onClick={() => respond(inv.id, true)}
                  style={{ marginRight: 8, padding: '4px 10px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
                  Accept
                </button>
                <button type="button" onClick={() => respond(inv.id, false)}
                  style={{ padding: '4px 10px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                  Decline
                </button>
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        {teams.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No teams yet. Be the first to found one.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {teams.map((t) => (
              <Link key={t.id} to={`/teams/${t.id}`} className="card" style={{
                padding: 14, textDecoration: 'none', color: 'inherit',
                borderLeft: `4px solid ${t.color_primary || 'var(--accent)'}`,
              }}>
                <h3 style={{ margin: '0 0 4px' }}>{t.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>[{t.tag}]</span></h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{t.member_count} member{t.member_count === 1 ? '' : 's'}</p>
                {t.bio ? <p style={{ margin: '6px 0 0', fontSize: 13 }}>{t.bio.slice(0, 100)}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
