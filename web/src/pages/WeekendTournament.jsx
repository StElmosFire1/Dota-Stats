import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getWeekendTournaments, getWeekendTournament, createWeekendTournament, updateWeekendTournament, announceWeekendTournament } from '../api';
import { useSuperuser } from '../context/SuperuserContext';
import { fmtDate } from '../utils/dates';

const STATUS_COLORS = { upcoming: '#f59e0b', active: '#22c55e', completed: '#94a3b8' };
const STATUS_LABELS = { upcoming: '⏳ Upcoming', active: '🟢 Live', completed: '✅ Completed' };

const SCORE_BREAKDOWN = [
  { cat: 'Combat', rows: [
    { stat: 'Kills', pts: '+4 each' },
    { stat: 'Assists', pts: '+2.5 each' },
    { stat: 'Deaths', pts: '−3 each' },
  ]},
  { cat: 'Economy', rows: [
    { stat: 'Last Hits', pts: '+0.04 each' },
    { stat: 'GPM', pts: '+0.25 per GPM' },
    { stat: 'XPM', pts: '+0.22 per XPM' },
  ]},
  { cat: 'Damage & Objectives', rows: [
    { stat: 'Hero Damage', pts: '+1 per 2,000' },
    { stat: 'Tower Damage', pts: '+1 per 1,000' },
    { stat: 'Healing', pts: '+1 per 1,500' },
  ]},
  { cat: 'Support / Utility', rows: [
    { stat: 'Camps Stacked', pts: '+7 each', bold: true },
    { stat: 'Observer Wards', pts: '+6 each', bold: true },
    { stat: 'Sentry Wards', pts: '+8 each', bold: true },
    { stat: 'Enemy Wards Destroyed', pts: '+10 each', bold: true },
  ]},
  { cat: 'Game Result', rows: [
    { stat: 'Win', pts: '+25 flat', bold: true },
  ]},
];

function ScoreBreakdown({ game }) {
  const won = game.won;
  const rows = [
    { label: 'Kills', value: game.kills, pts: game.kills * 4 },
    { label: 'Assists', value: game.assists, pts: game.assists * 2.5 },
    { label: 'Deaths', value: game.deaths, pts: game.deaths * -3 },
    { label: 'Last Hits', value: game.last_hits, pts: Math.round(game.last_hits * 0.04 * 10) / 10 },
    { label: 'GPM', value: game.gpm, pts: Math.round(game.gpm * 0.25 * 10) / 10 },
    { label: 'XPM', value: game.xpm, pts: Math.round(game.xpm * 0.22 * 10) / 10 },
    { label: 'Hero Dmg', value: (game.hero_damage || 0).toLocaleString(), pts: Math.round(game.hero_damage / 2000 * 10) / 10 },
    { label: 'Tower Dmg', value: (game.tower_damage || 0).toLocaleString(), pts: Math.round(game.tower_damage / 1000 * 10) / 10 },
    { label: 'Healing', value: (game.hero_healing || 0).toLocaleString(), pts: Math.round(game.hero_healing / 1500 * 10) / 10 },
    { label: 'Camps Stacked', value: game.camps_stacked, pts: (game.camps_stacked || 0) * 7 },
    { label: 'Obs Wards', value: game.obs_placed, pts: (game.obs_placed || 0) * 6 },
    { label: 'Sentry Wards', value: game.sen_placed, pts: (game.sen_placed || 0) * 8 },
    { label: 'Dewarded', value: game.wards_killed, pts: (game.wards_killed || 0) * 10 },
    { label: 'Win Bonus', value: won ? 'Yes' : 'No', pts: won ? 25 : 0 },
  ].filter(r => r.pts !== 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6, padding: '10px 0 4px' }}>
      {rows.map(r => (
        <div key={r.label} style={{
          background: 'var(--bg-secondary)', borderRadius: 6, padding: '5px 10px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.label}</span>
          <span style={{ fontSize: 11, fontWeight: 700,
            color: r.pts > 0 ? '#22c55e' : '#ef4444',
          }}>{r.pts > 0 ? '+' : ''}{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

function PlayerRow({ player, rank, gamesToCount }) {
  const [expanded, setExpanded] = useState(false);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12, cursor: 'pointer',
          background: rank <= 3 ? `rgba(245,158,11,${0.06 - rank * 0.015})` : 'transparent' }}
      >
        <span style={{ fontSize: 18, minWidth: 28, textAlign: 'center' }}>
          {rank <= 3 ? medals[rank - 1] : <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>#{rank}</span>}
        </span>
        <Link to={`/player/${player.account_id}`} onClick={e => e.stopPropagation()}
          style={{ flex: 1, fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', textDecoration: 'none' }}>
          {player.display_name}
        </Link>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {player.games_counted}/{gamesToCount} games · {player.games_played} played
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', minWidth: 70, textAlign: 'right' }}>
            {player.total_score.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
          {player.top_games.map((game, i) => (
            <div key={game.match_id} style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Game {i + 1}</span>
                <Link to={`/match/${game.match_id}`} style={{ fontSize: 11, color: 'var(--accent)' }}>
                  #{game.match_id}
                </Link>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(game.date)}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: game.won ? '#22c55e' : '#ef4444' }}>
                  {game.won ? 'Win' : 'Loss'}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginLeft: 'auto' }}>
                  {parseFloat(game.game_score).toLocaleString(undefined, { maximumFractionDigits: 1 })} pts
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                {game.kills}/{game.deaths}/{game.assists} · {game.gpm} GPM · {game.xpm} XPM
              </div>
              <ScoreBreakdown game={game} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentDetail({ id }) {
  const navigate = useNavigate();
  const { isSuperuser, superuserKey } = useSuperuser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [announcing, setAnnouncing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getWeekendTournament(id)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (data?.tournament) {
      const t = data.tournament;
      setEditForm({
        name: t.name,
        description: t.description || '',
        startDate: t.start_date?.slice(0, 16) || '',
        endDate: t.end_date?.slice(0, 16) || '',
        gamesToCount: t.games_to_count,
        prizePool: t.prize_pool,
        buyIn: t.buy_in,
        status: t.status,
      });
    }
  }, [data]);

  const handleAnnounce = async () => {
    if (!window.confirm('Post tournament announcement to Discord?')) return;
    setAnnouncing(true);
    try {
      await announceWeekendTournament(id, superuserKey);
      alert('Announced!');
      load();
    } catch (e) { alert(e.message); }
    setAnnouncing(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateWeekendTournament(id, editForm, superuserKey);
      setEditMode(false);
      load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  if (loading) return <div className="loading">Loading tournament…</div>;
  if (error) return <div style={{ color: 'var(--accent-red)', padding: 40 }}>{error}</div>;
  if (!data) return null;

  const { tournament, leaderboard } = data;
  const now = new Date();
  const isLive = tournament.status === 'active' && new Date(tournament.start_date) <= now && new Date(tournament.end_date) >= now;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Link to="/weekend-tournament" className="back-link">← All Tournaments</Link>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{tournament.name}</h1>
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: `rgba(${tournament.status === 'active' ? '34,197,94' : tournament.status === 'completed' ? '148,163,184' : '245,158,11'},0.15)`,
                color: STATUS_COLORS[tournament.status] || 'var(--text-muted)' }}>
                {STATUS_LABELS[tournament.status] || tournament.status}
                {isLive && <span style={{ marginLeft: 4 }}>🔴</span>}
              </span>
            </div>
            {tournament.description && <p style={{ color: 'var(--text-secondary)', margin: '0 0 6px', fontSize: 14 }}>{tournament.description}</p>}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
              <span>📅 {new Date(tournament.start_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} → {new Date(tournament.end_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span>🎮 Top {tournament.games_to_count} games count</span>
              {tournament.prize_pool > 0 && <span>💰 ${tournament.prize_pool} prize pool</span>}
              {tournament.buy_in > 0 && <span>🎟 ${tournament.buy_in} buy-in</span>}
            </div>
          </div>
          {isSuperuser && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setEditMode(e => !e)} className="btn" style={{ fontSize: 13 }}>
                ✏️ Edit
              </button>
              <button onClick={handleAnnounce} disabled={announcing} className="btn btn-primary" style={{ fontSize: 13 }}>
                {announcing ? 'Posting…' : tournament.discord_announced ? '📣 Re-announce' : '📣 Announce'}
              </button>
            </div>
          )}
        </div>

        {isSuperuser && editMode && (
          <form onSubmit={handleSave} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
              {[
                { key: 'name', label: 'Name', type: 'text' },
                { key: 'startDate', label: 'Start Date', type: 'datetime-local' },
                { key: 'endDate', label: 'End Date', type: 'datetime-local' },
                { key: 'gamesToCount', label: 'Games to Count', type: 'number' },
                { key: 'prizePool', label: 'Prize Pool ($)', type: 'number' },
                { key: 'buyIn', label: 'Buy-in ($)', type: 'number' },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{label}</label>
                  <input type={type} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Status</label>
                <select value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%' }}>
                  <option value="upcoming">Upcoming</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Description</label>
              <input value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ fontSize: 13 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
              <button type="button" onClick={() => setEditMode(false)} className="btn" style={{ fontSize: 13 }}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        <div>
          <h2 className="section-title">Leaderboard</h2>
          {leaderboard.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '32px 0', textAlign: 'center', fontSize: 14 }}>
              No games recorded yet in the tournament window.
            </div>
          ) : (
            leaderboard.map((player, i) => (
              <PlayerRow key={player.account_id} player={player} rank={i + 1} gamesToCount={tournament.games_to_count} />
            ))
          )}
        </div>

        <div>
          <h2 className="section-title">Scoring Rules</h2>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {SCORE_BREAKDOWN.map(({ cat, rows }) => (
              <div key={cat}>
                <div style={{ background: 'var(--bg-secondary)', padding: '6px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {cat}
                </div>
                {rows.map(r => (
                  <div key={r.stat} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ color: r.bold ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: r.bold ? 600 : 400 }}>{r.stat}</span>
                    <span style={{ color: r.pts?.startsWith('−') ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{r.pts}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Play any games during the tournament window. Your <strong>top {tournament.games_to_count} individual game scores</strong> are added together for your final total.
          </div>
        </div>
      </div>
    </div>
  );
}

function TournamentList() {
  const { isSuperuser, superuserKey } = useSuperuser();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: 'ANZAC Weekend Points Tournament',
    description: 'Play any games across the long weekend — your top 3 scores count towards the prize!',
    startDate: '2026-04-25T00:00',
    endDate: '2026-04-28T23:59',
    gamesToCount: 3,
    prizePool: '',
    buyIn: '',
  });

  useEffect(() => {
    getWeekendTournaments()
      .then(d => setTournaments(d.tournaments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const result = await createWeekendTournament(form, superuserKey);
      navigate(`/weekend-tournament/${result.tournament.id}`);
    } catch (e) { alert(e.message); }
    setCreating(false);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>🏆 Weekend Tournaments</h1>
        {isSuperuser && (
          <button onClick={() => setShowCreate(s => !s)} className="btn btn-primary" style={{ fontSize: 13 }}>
            + New Tournament
          </button>
        )}
      </div>

      {isSuperuser && showCreate && (
        <form onSubmit={handleCreate} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Create Tournament</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            {[
              { key: 'name', label: 'Name *', type: 'text' },
              { key: 'startDate', label: 'Start Date *', type: 'datetime-local' },
              { key: 'endDate', label: 'End Date *', type: 'datetime-local' },
              { key: 'gamesToCount', label: 'Games to Count', type: 'number' },
              { key: 'prizePool', label: 'Prize Pool ($)', type: 'number' },
              { key: 'buyIn', label: 'Buy-in ($)', type: 'number' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{label}</label>
                <input required={label.includes('*')} type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '7px 10px', fontSize: 13, width: '100%' }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '7px 10px', fontSize: 13, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={creating} className="btn btn-primary" style={{ fontSize: 13 }}>{creating ? 'Creating…' : 'Create'}</button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn" style={{ fontSize: 13 }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? <div className="loading">Loading…</div> : (
        tournaments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
            <p>No weekend tournaments yet.</p>
            {isSuperuser && <p style={{ fontSize: 13 }}>Create one using the button above.</p>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tournaments.map(t => (
              <Link key={t.id} to={`/weekend-tournament/${t.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[t.status] || 'var(--text-muted)' }}>
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    </div>
                    {t.description && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{t.description}</p>}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {new Date(t.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      {' → '}
                      {new Date(t.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {t.prize_pool > 0 && <> · 💰 ${t.prize_pool}</>}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default function WeekendTournament() {
  const { id } = useParams();
  return id ? <TournamentDetail id={id} /> : <TournamentList />;
}
