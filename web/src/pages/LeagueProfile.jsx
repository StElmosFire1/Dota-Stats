// Task #383 — League profile: standings, bracket, operator controls.
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getLeague, listTeams, addLeagueTeam, removeLeagueTeam,
  generateLeagueBracket, setLeagueMatchWinner,
} from '../api';
import { useSuperuser } from '../context/SuperuserContext';

function fmt(d) { try { return d ? new Date(d).toLocaleDateString() : ''; } catch { return ''; } }

export default function LeagueProfile() {
  const { id } = useParams();
  const { isSuperuser } = useSuperuser();
  const [data, setData] = useState(null);
  const [allTeams, setAllTeams] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState('');
  const [seed, setSeed] = useState('');

  const refresh = () => getLeague(id).then(setData).catch(e => setErr(e.message));
  useEffect(() => {
    refresh();
    listTeams().then(d => setAllTeams(d.teams || [])).catch(() => {});
    // eslint-disable-next-line
  }, [id]);

  if (err && !data) return <p style={{ padding: 24, color: 'crimson' }}>{err}</p>;
  if (!data) return <p style={{ padding: 24 }}>Loading…</p>;

  const { league, teams, matches, standings } = data;
  const teamById = Object.fromEntries((teams || []).map(t => [t.team_id, t]));

  const act = async (fn) => { setBusy(true); setErr(null); try { await fn(); refresh(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  // Group bracket matches into rounds (W bracket only for visual bracket).
  const wMatches = (matches || []).filter(m => m.bracket === 'W');
  const rounds = {};
  for (const m of wMatches) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }
  Object.values(rounds).forEach(arr => arr.sort((a, b) => a.slot - b.slot));
  const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ borderLeft: '6px solid var(--accent)', background: 'var(--bg-secondary)', padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13 }}><Link to="/leagues">← All leagues</Link></p>
        <h1 style={{ margin: '6px 0 4px', fontFamily: 'var(--font-serif)' }}>{league.name}</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          {league.format.replace('_', ' ')} · {league.status} · {teams.length} team{teams.length === 1 ? '' : 's'}
          {league.starts_at ? ` · starts ${fmt(league.starts_at)}` : ''}
        </p>
        {league.description ? <p style={{ marginTop: 8 }}>{league.description}</p> : null}
      </header>

      {err ? <p style={{ color: 'crimson' }}>{err}</p> : null}

      <section className="card" style={{ padding: 14, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Standings</h2>
        {standings.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No teams yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '4px 6px' }}>#</th>
                <th style={{ padding: '4px 6px' }}>Team</th>
                <th style={{ padding: '4px 6px' }}>W</th>
                <th style={{ padding: '4px 6px' }}>L</th>
                {isSuperuser && <th style={{ padding: '4px 6px' }}>Manage</th>}
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.team_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px' }}>{i + 1}</td>
                  <td style={{ padding: '6px' }}>
                    <Link to={`/teams/${s.team_id}`}>{s.name} [{s.tag}]</Link>
                  </td>
                  <td style={{ padding: '6px', color: '#22c55e', fontWeight: 700 }}>{s.wins}</td>
                  <td style={{ padding: '6px', color: '#f08a8a' }}>{s.losses}</td>
                  {isSuperuser && (
                    <td style={{ padding: '6px' }}>
                      <button type="button" onClick={() => act(() => removeLeagueTeam(league.id, s.team_id))}
                        disabled={busy}
                        style={{ padding: '4px 8px', background: 'transparent', color: 'crimson', border: '1px solid crimson', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {isSuperuser && (
        <section className="card" style={{ padding: 14, marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Operator controls</h2>
          <form onSubmit={(e) => { e.preventDefault(); act(() => addLeagueTeam(league.id, parseInt(addId, 10), seed ? parseInt(seed, 10) : null)); setAddId(''); setSeed(''); }}
            style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <select required value={addId} onChange={e => setAddId(e.target.value)}
              style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }}>
              <option value="">— add a team —</option>
              {allTeams.filter(t => !teamById[t.id]).map(t => (
                <option key={t.id} value={t.id}>{t.name} [{t.tag}]</option>
              ))}
            </select>
            <input type="number" min={1} placeholder="Seed (opt.)" value={seed}
              onChange={e => setSeed(e.target.value)}
              style={{ width: 110, padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
            <button type="submit" disabled={busy} style={{ padding: '8px 14px', background: 'var(--brass)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
              Add team
            </button>
          </form>
          {league.format === 'single_elim' && (
            <button type="button" disabled={busy} onClick={() => act(() => generateLeagueBracket(league.id))}
              style={{ padding: '8px 14px', background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
              {busy ? 'Generating…' : 'Generate / regenerate bracket'}
            </button>
          )}
          {league.format !== 'single_elim' && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              Auto-generation is currently single-elim only. For {league.format.replace('_', ' ')}, record
              match winners manually by tagging recorded matches with this league id.
            </p>
          )}
        </section>
      )}

      <section className="card" style={{ padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Bracket</h2>
        {roundKeys.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No bracket generated yet.</p>
        ) : (
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
            {roundKeys.map(r => (
              <div key={r} style={{ minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Round {r}</h3>
                {rounds[r].map(m => (
                  <BracketCell key={m.id} m={m} isSuperuser={isSuperuser} onWinner={(winnerTeamId) =>
                    act(() => setLeagueMatchWinner(m.id, { winner_team_id: winnerTeamId }))
                  } />
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BracketCell({ m, isSuperuser, onWinner }) {
  const winner = m.winner_team_id;
  const teamLine = (id, name, tag) => {
    const isWinner = winner && id === winner;
    return (
      <div style={{
        padding: '6px 8px',
        background: isWinner ? 'rgba(34,197,94,0.12)' : 'var(--bg-secondary)',
        borderRadius: 4,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontWeight: isWinner ? 700 : 400,
        color: id ? 'inherit' : 'var(--text-muted)',
      }}>
        <span>{id ? `${name} [${tag}]` : 'TBD'}</span>
        {isSuperuser && id && !winner && (
          <button type="button" onClick={() => onWinner(id)}
            style={{ padding: '2px 6px', fontSize: 10, background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 700 }}>
            Win
          </button>
        )}
      </div>
    );
  };
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {teamLine(m.team_a_id, m.team_a_name, m.team_a_tag)}
      {teamLine(m.team_b_id, m.team_b_name, m.team_b_tag)}
      {m.match_id && (
        <Link to={`/match/${m.match_id}`} style={{ fontSize: 11, textAlign: 'right' }}>view match →</Link>
      )}
    </div>
  );
}
