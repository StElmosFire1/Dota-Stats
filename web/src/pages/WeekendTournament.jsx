import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getWeekendTournament, updateWeekendTournament, announceWeekendTournament } from '../api';
import { useSuperuser } from '../context/SuperuserContext';

const STATUS_COLORS = { upcoming: '#f59e0b', active: '#22c55e', completed: '#94a3b8' };
const STATUS_LABELS = { upcoming: '⏳ Upcoming', active: '🟢 Live', completed: '✅ Completed' };

// datetime-local inputs have no timezone — they reflect the local browser clock.
// toLocalInput converts a UTC ISO string from the DB into local time for the input value.
// toUtcIso converts a datetime-local string (local time) into a UTC ISO string for storage.
function toLocalInput(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function toUtcIso(localStr) {
  if (!localStr) return null;
  return new Date(localStr).toISOString();
}

const SCORE_RULES = [
  { cat: 'Combat',
    rows: [
      { stat: 'Kill',     pts: '+4',   note: 'Each final blow on an enemy hero' },
      { stat: 'Assist',   pts: '+2.5', note: 'Each kill you contributed to without landing the last hit' },
      { stat: 'Death',    pts: '−3',   note: 'Each time your hero dies' },
    ],
  },
  { cat: 'Economy',
    rows: [
      { stat: 'Last Hit',    pts: '+0.04', note: '100 last hits = +4 pts' },
      { stat: 'GPM',         pts: '+0.25', note: '400 GPM = +100 pts; reflects how efficiently you farmed' },
      { stat: 'XPM',         pts: '+0.22', note: '500 XPM = +110 pts; rewards levelling up quickly' },
    ],
  },
  { cat: 'Damage & Objectives',
    rows: [
      { stat: 'Hero Damage',  pts: '+1 per 2,000',  note: 'Raw damage dealt to enemy heroes' },
      { stat: 'Tower Damage', pts: '+1 per 1,000',  note: 'Damage to buildings — pushers get rewarded' },
      { stat: 'Healing',      pts: '+1 per 1,500',  note: 'HP restored to allied heroes' },
    ],
  },
  { cat: 'Support & Utility',
    rows: [
      { stat: 'Observer Ward placed', pts: '+4', note: 'Vision wins games — each obs ward placed counts' },
      { stat: 'Sentry Ward placed',   pts: '+6', note: 'Dewarding and anti-vision are rewarded' },
      { stat: 'Ward Destroyed',       pts: '+7',   note: 'Deward enemy wards for a solid bonus' },
      { stat: 'Neutral Camp Stacked', pts: '+7',  note: 'Each neutral stack set up for your team' },
    ],
  },
  { cat: 'Result',
    rows: [
      { stat: 'Win', pts: '+25', note: 'Flat bonus for winning the game — winning still matters most' },
    ],
  },
];

const inputStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: '100%' };

function ScoreBreakdownGrid({ game }) {
  const won = game.won;
  const items = [
    { label: 'Kills', value: game.kills, pts: game.kills * 4 },
    { label: 'Assists', value: game.assists, pts: game.assists * 2.5 },
    { label: 'Deaths', value: game.deaths, pts: game.deaths * -3 },
    { label: 'Last Hits', value: game.last_hits, pts: Math.round(game.last_hits * 0.04 * 10) / 10 },
    { label: 'GPM', value: game.gpm, pts: Math.round(game.gpm * 0.25 * 10) / 10 },
    { label: 'XPM', value: game.xpm, pts: Math.round(game.xpm * 0.22 * 10) / 10 },
    { label: 'Hero Dmg', value: (game.hero_damage || 0).toLocaleString(), pts: Math.round((game.hero_damage || 0) / 2000 * 10) / 10 },
    { label: 'Tower Dmg', value: (game.tower_damage || 0).toLocaleString(), pts: Math.round((game.tower_damage || 0) / 1000 * 10) / 10 },
    { label: 'Healing', value: (game.hero_healing || 0).toLocaleString(), pts: Math.round((game.hero_healing || 0) / 1500 * 10) / 10 },
    { label: 'Camps', value: game.camps_stacked || 0, pts: (game.camps_stacked || 0) * 7 },
    { label: 'Obs Wards', value: game.obs_placed || 0, pts: (game.obs_placed || 0) * 4 },
    { label: 'Sentries', value: game.sen_placed || 0, pts: (game.sen_placed || 0) * 6 },
    { label: 'Dewarded', value: game.wards_killed || 0, pts: (game.wards_killed || 0) * 7 },
    { label: 'Win', value: won ? 'Yes' : '—', pts: won ? 25 : 0 },
  ].filter(r => r.pts !== 0);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 0 2px' }}>
      {items.map(r => (
        <div key={r.label} style={{
          background: 'var(--bg-secondary)', borderRadius: 6, padding: '4px 9px',
          display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.label}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: r.pts > 0 ? '#22c55e' : '#ef4444' }}>
            {r.pts > 0 ? '+' : ''}{r.pts}
          </span>
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
      <div onClick={() => setExpanded(e => !e)} style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12, cursor: 'pointer',
        background: rank <= 3 ? `rgba(245,158,11,${0.07 - rank * 0.015})` : 'transparent',
      }}>
        <span style={{ fontSize: 18, minWidth: 26, textAlign: 'center' }}>
          {rank <= 3 ? medals[rank - 1] : <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>#{rank}</span>}
        </span>
        <Link to={`/player/${player.account_id}`} onClick={e => e.stopPropagation()}
          style={{ flex: 1, fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', textDecoration: 'none' }}>
          {player.display_name}
        </Link>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
          {player.games_counted}/{gamesToCount} games · {player.games_played} played
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', minWidth: 68, textAlign: 'right' }}>
          {parseFloat(player.total_score).toLocaleString(undefined, { maximumFractionDigits: 1 })}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '4px 16px 14px', borderTop: '1px solid var(--border)' }}>
          {player.top_games.map((game, i) => (
            <div key={game.match_id} style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Game {i + 1}</span>
                <Link to={`/match/${game.match_id}`} style={{ fontSize: 11, color: 'var(--accent)' }}>#{game.match_id}</Link>
                <span style={{ fontSize: 11, fontWeight: 700, color: game.won ? '#22c55e' : '#ef4444' }}>{game.won ? 'Win' : 'Loss'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {game.kills}/{game.deaths}/{game.assists} · {game.gpm} GPM · {game.xpm} XPM
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
                  {parseFloat(game.game_score).toLocaleString(undefined, { maximumFractionDigits: 1 })} pts
                </span>
              </div>
              <ScoreBreakdownGrid game={game} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoringExplanation({ gamesToCount }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
        padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>📊 How points are earned</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '0 0 14px' }}>
          <div style={{ padding: '12px 18px 6px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Every game you play during the tournament window earns you a score based on your individual performance.
            Your <strong>top {gamesToCount} game scores</strong> are added together for your final total — so you can play as many games as you like, only your best count.
            All stats are pulled automatically from replay data.
          </div>

          {SCORE_RULES.map(({ cat, rows }) => (
            <div key={cat} style={{ margin: '12px 18px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{cat}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {rows.map(r => (
                  <div key={r.stat} style={{ display: 'grid', gridTemplateColumns: '150px 90px 1fr', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{r.stat}</span>
                    <span style={{ fontWeight: 700, color: r.pts.startsWith('−') ? '#ef4444' : '#22c55e' }}>{r.pts}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.note}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div style={{ margin: '14px 18px 0', padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong>Supports are fairly rewarded</strong> — warding, dewarding and stacking carry some of the highest per-action values in the formula.
            You don't need to top-frag to score well; a support with 6 obs wards, 4 sentries, 3 dewarded and a win can easily outscore a carry who died 8 times.
          </div>
        </div>
      )}
    </div>
  );
}

export default function WeekendTournament() {
  const { id } = useParams();
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
        startDate: toLocalInput(t.start_date),
        endDate: toLocalInput(t.end_date),
        gamesToCount: t.games_to_count,
        prizePool: t.prize_pool || '',
        buyIn: t.buy_in || '',
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
      const payload = {
        ...editForm,
        startDate: toUtcIso(editForm.startDate),
        endDate: toUtcIso(editForm.endDate),
      };
      await updateWeekendTournament(id, payload, superuserKey);
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
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Link to="/tournaments" className="back-link">← Back to Tournaments</Link>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{tournament.name}</h1>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: `rgba(${tournament.status === 'active' ? '34,197,94' : tournament.status === 'completed' ? '148,163,184' : '245,158,11'},0.15)`,
                color: STATUS_COLORS[tournament.status] || 'var(--text-muted)',
              }}>
                {STATUS_LABELS[tournament.status] || tournament.status}
                {isLive && ' 🔴'}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                Points Tournament
              </span>
            </div>
            {tournament.description && <p style={{ color: 'var(--text-secondary)', margin: '0 0 6px', fontSize: 14 }}>{tournament.description}</p>}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
              <span>📅 {new Date(tournament.start_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} → {new Date(tournament.end_date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span>🎮 Top {tournament.games_to_count} games count</span>
              {tournament.prize_pool > 0 && <span>💰 ${tournament.prize_pool} prize pool</span>}
              {tournament.buy_in > 0 && <span>🎟 ${tournament.buy_in} buy-in</span>}
            </div>
          </div>
          {isSuperuser && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setEditMode(e => !e)} className="btn" style={{ fontSize: 13 }}>✏️ Edit</button>
              <button onClick={handleAnnounce} disabled={announcing} className="btn btn-primary" style={{ fontSize: 13 }}>
                {announcing ? 'Posting…' : tournament.discord_announced ? '📣 Re-announce' : '📣 Announce'}
              </button>
            </div>
          )}
        </div>

        {isSuperuser && editMode && (
          <form onSubmit={handleSave} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
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
                  <input type={type} value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Status</label>
                <select value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                  <option value="upcoming">Upcoming</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Description</label>
              <input value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ fontSize: 13 }}>{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => setEditMode(false)} className="btn" style={{ fontSize: 13 }}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      <ScoringExplanation gamesToCount={tournament.games_to_count} />

      <h2 className="section-title">Leaderboard</h2>
      {leaderboard.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center', fontSize: 14 }}>
          No games recorded yet during the tournament window.
        </div>
      ) : (
        leaderboard.map((player, i) => (
          <PlayerRow key={player.account_id} player={player} rank={i + 1} gamesToCount={tournament.games_to_count} />
        ))
      )}
    </div>
  );
}
