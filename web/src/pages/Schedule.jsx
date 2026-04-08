import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getSchedule, createScheduledGame, cancelScheduledGame, rsvpScheduledGame, removeRsvp } from '../api';
import { useSuperuser } from '../context/SuperuserContext';
import { useSteamAuth } from '../context/SteamAuthContext';

function timeUntil(dt) {
  const diff = new Date(dt) - new Date();
  if (diff <= 0) return 'Starting soon';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `in ${d}d ${h % 24}h`;
  }
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function formatGameTime(dt) {
  return new Date(dt).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function ParticipantList({ rsvps }) {
  const yes = rsvps.filter(r => r.status === 'yes');
  const no = rsvps.filter(r => r.status === 'no');
  if (rsvps.length === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>No RSVPs yet.</p>;
  return (
    <div style={{ marginTop: 10, fontSize: 13 }}>
      {yes.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#4caf50', fontWeight: 600 }}>✅ In ({yes.length}): </span>
          <span style={{ color: 'var(--text-secondary)' }}>{yes.map(r => r.username).join(', ')}</span>
        </div>
      )}
      {no.length > 0 && (
        <div>
          <span style={{ color: '#f44336', fontWeight: 600 }}>❌ Out ({no.length}): </span>
          <span style={{ color: 'var(--text-muted)' }}>{no.map(r => r.username).join(', ')}</span>
        </div>
      )}
    </div>
  );
}

function GameCard({ game, steamUser, isSuperuser, superuserKey, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [rsvps, setRsvps] = useState(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpError, setRsvpError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const dt = new Date(game.scheduled_at);
  const isToday = dt.toDateString() === new Date().toDateString();
  const isTomorrow = dt.toDateString() === new Date(Date.now() + 86400000).toDateString();
  const until = timeUntil(game.scheduled_at);

  const myWebId = steamUser ? `web:${steamUser.accountId}` : null;
  const myRsvp = rsvps ? rsvps.find(r => r.discord_id === myWebId) : null;

  const loadRsvps = useCallback(async () => {
    try {
      const d = await fetch(`/api/schedule/${game.id}/rsvps`).then(r => r.json());
      setRsvps(d.rsvps || []);
    } catch {
      setRsvps([]);
    }
  }, [game.id]);

  useEffect(() => {
    if (expanded && rsvps === null) loadRsvps();
  }, [expanded, rsvps, loadRsvps]);

  const handleRsvp = async (status) => {
    if (!steamUser) return;
    setRsvpLoading(true);
    setRsvpError('');
    try {
      if (myRsvp && myRsvp.status === status) {
        await removeRsvp(game.id);
        setRsvps(prev => prev ? prev.filter(r => r.discord_id !== myWebId) : null);
      } else {
        const d = await rsvpScheduledGame(game.id, status);
        setRsvps(d.rsvps || []);
      }
      onRefresh();
    } catch (err) {
      setRsvpError(err.message || 'Failed to update RSVP');
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm(`Cancel game #${game.id}?`)) return;
    setCancelling(true);
    try {
      await cancelScheduledGame(game.id, superuserKey);
      onRefresh();
    } catch (err) {
      alert(err.message || 'Failed to cancel game');
    } finally {
      setCancelling(false);
    }
  };

  const accentColor = isToday ? 'var(--accent-green, #4caf50)' : isTomorrow ? 'var(--accent, #60a5fa)' : 'var(--border)';

  return (
    <div className="stat-card" style={{ padding: '18px 20px', borderLeft: `3px solid ${accentColor}`, maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{ fontSize: 30, minWidth: 36, textAlign: 'center', paddingTop: 2 }}>🎮</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{formatGameTime(game.scheduled_at)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>AEST · #{game.id}</div>
              {game.note && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{game.note}</div>}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Scheduled by {game.created_by || 'admin'}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: accentColor }}>{until}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                <span style={{ color: '#4caf50' }}>✅ {game.rsvp_yes ?? 0}</span>
                {' · '}
                <span style={{ color: '#f44336' }}>❌ {game.rsvp_no ?? 0}</span>
              </div>
            </div>
          </div>

          {/* RSVP buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {steamUser ? (
              <>
                <button
                  className="btn"
                  onClick={() => handleRsvp('yes')}
                  disabled={rsvpLoading}
                  style={{
                    fontSize: 13,
                    padding: '5px 14px',
                    background: myRsvp?.status === 'yes' ? '#4caf50' : undefined,
                    color: myRsvp?.status === 'yes' ? '#fff' : undefined,
                    fontWeight: myRsvp?.status === 'yes' ? 700 : undefined,
                  }}
                >
                  ✅ {myRsvp?.status === 'yes' ? "I'm In!" : "I'm In"}
                </button>
                <button
                  className="btn"
                  onClick={() => handleRsvp('no')}
                  disabled={rsvpLoading}
                  style={{
                    fontSize: 13,
                    padding: '5px 14px',
                    background: myRsvp?.status === 'no' ? '#f44336' : undefined,
                    color: myRsvp?.status === 'no' ? '#fff' : undefined,
                    fontWeight: myRsvp?.status === 'no' ? 700 : undefined,
                  }}
                >
                  ❌ {myRsvp?.status === 'no' ? "Can't Make It" : "Can't Make It"}
                </button>
                {myRsvp && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    (click again to undo)
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                <a href="/auth/steam" style={{ color: 'var(--accent)' }}>Sign in with Steam</a> to RSVP
              </span>
            )}
            <button
              onClick={() => { setExpanded(e => !e); if (!expanded && rsvps === null) loadRsvps(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', padding: '5px 8px' }}
            >
              {expanded ? '▲ Hide list' : '▼ Show players'}
            </button>
            {isSuperuser && (
              <button
                className="btn"
                onClick={handleCancel}
                disabled={cancelling}
                style={{ fontSize: 12, padding: '4px 10px', color: '#f87171', borderColor: '#f87171', marginLeft: 4 }}
              >
                {cancelling ? '…' : '✕ Cancel'}
              </button>
            )}
          </div>
          {rsvpError && <div style={{ fontSize: 12, color: '#f44336', marginTop: 6 }}>{rsvpError}</div>}
          {expanded && <ParticipantList rsvps={rsvps || []} />}
        </div>
      </div>
    </div>
  );
}

const QUICK_TIMES = [
  { label: '7:00 PM', val: '19:00' },
  { label: '7:30 PM', val: '19:30' },
  { label: '8:00 PM', val: '20:00' },
  { label: '8:30 PM', val: '20:30' },
  { label: '9:00 PM', val: '21:00' },
];

function getNextDayOfWeek(dow, weeksAhead = 0) {
  const d = new Date();
  let diff = (dow - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  diff += weeksAhead * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function CreateGameForm({ superuserKey, onCreated }) {
  const [dateVal, setDateVal] = useState(() => getNextDayOfWeek(5));
  const [timeVal, setTimeVal] = useState('20:00');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const QUICK_DAYS = [
    { label: 'This Fri',  val: () => getNextDayOfWeek(5) },
    { label: 'Next Fri',  val: () => getNextDayOfWeek(5, 1) },
    { label: 'This Sat',  val: () => getNextDayOfWeek(6) },
    { label: 'Next Sat',  val: () => getNextDayOfWeek(6, 1) },
    { label: 'This Sun',  val: () => getNextDayOfWeek(0) },
  ];

  const formattedPreview = (() => {
    try {
      return new Date(`${dateVal}T${timeVal}:00+10:00`).toLocaleString('en-AU', {
        timeZone: 'Australia/Sydney', weekday: 'short', month: 'short',
        day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
      }) + ' AEST';
    } catch { return ''; }
  })();

  const handleCreate = async () => {
    if (!dateVal || !timeVal) { setError('Date and time are required'); return; }
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const scheduledAt = new Date(`${dateVal}T${timeVal}:00+10:00`).toISOString();
      const result = await createScheduledGame(scheduledAt, note, superuserKey);
      setNote('');
      if (result?.discordPosted === false) {
        setSuccessMsg('✅ Game created! ⚠️ Discord post failed — check ANNOUNCE_CHANNEL_ID in server env.');
      } else {
        setSuccessMsg('✅ Game created and posted to Discord!');
      }
      setTimeout(() => setSuccessMsg(''), 6000);
      onCreated();
    } catch (err) {
      setError(err.message || 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  const btnStyle = (active) => ({
    padding: '4px 10px', fontSize: 12, borderRadius: 5, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'var(--bg-secondary)',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontWeight: active ? 700 : 400,
    transition: 'all 0.15s',
  });

  return (
    <div className="card" style={{ padding: 20, maxWidth: 640, marginBottom: 28 }}>
      <h3 style={{ marginBottom: 14, fontSize: 15 }}>📅 Schedule a Game</h3>

      {/* Date row */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Date</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {QUICK_DAYS.map(({ label, val }) => (
            <button key={label} style={btnStyle(dateVal === val())} onClick={() => setDateVal(val())}>
              {label}
            </button>
          ))}
          <input
            type="date"
            value={dateVal}
            onChange={e => setDateVal(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 13, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', marginLeft: 4 }}
          />
        </div>
      </div>

      {/* Time row */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Time (AEST)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {QUICK_TIMES.map(({ label, val }) => (
            <button key={label} style={btnStyle(timeVal === val)} onClick={() => setTimeVal(val)}>
              {label}
            </button>
          ))}
          <input
            type="time"
            value={timeVal}
            onChange={e => setTimeVal(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 13, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', marginLeft: 4 }}
          />
        </div>
        {formattedPreview && (
          <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>📍 {formattedPreview}</div>
        )}
      </div>

      {/* Note + Create */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Note (optional) — e.g. Weekly inhouse, Season 10"
          style={{ flex: '1 1 240px', padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={loading}
          style={{ whiteSpace: 'nowrap' }}
        >
          {loading ? 'Creating…' : '+ Create Game'}
        </button>
      </div>

      {error && <div style={{ fontSize: 13, color: '#f44336', marginTop: 8 }}>{error}</div>}
      {successMsg && <div style={{ fontSize: 13, color: '#4ade80', marginTop: 8 }}>{successMsg}</div>}
    </div>
  );
}

export default function Schedule() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isSuperuser, superuserKey } = useSuperuser();
  const { steamUser } = useSteamAuth();

  const load = useCallback(() => {
    setLoading(true);
    getSchedule()
      .then(d => setGames(d.games || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <div className="loading">Loading schedule…</div>;

  return (
    <div>
      <h1 className="page-title">📅 Game Schedule</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Upcoming inhouse sessions. RSVP here or react ✅/❌ on the Discord announcement.
      </p>

      {isSuperuser && (
        <CreateGameForm superuserKey={superuserKey} onCreated={load} />
      )}

      {games.length === 0 ? (
        <div className="empty-state">
          <p>No upcoming games scheduled.</p>
          {isSuperuser
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Use the form above or <code>!schedule</code> in Discord to add one.</p>
            : <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Use <code>!schedule YYYY-MM-DD HH:MM [note]</code> in Discord to schedule one.</p>
          }
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {games.map(g => (
            <GameCard
              key={g.id}
              game={g}
              steamUser={steamUser}
              isSuperuser={isSuperuser}
              superuserKey={superuserKey}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 32, padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, maxWidth: 640 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Discord Commands</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div><code>!upcoming</code> — list upcoming games in Discord</div>
          <div><code>!schedule 2026-04-10 20:00 Weekly inhouse</code> — schedule a game (AEST)</div>
          <div><code>!cancel 3</code> — cancel game #3</div>
          <div style={{ marginTop: 4 }}>React ✅/❌ on the RSVP post in Discord to mark attendance.</div>
        </div>
      </div>
    </div>
  );
}
