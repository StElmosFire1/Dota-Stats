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

function CreateGameForm({ superuserKey, onCreated }) {
  const [date, setDate] = useState(() => {
    const now = new Date();
    now.setDate(now.getDate() + 7);
    now.setHours(20, 0, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!date) { setError('Date and time are required'); return; }
    setLoading(true);
    setError('');
    try {
      const scheduledAt = new Date(date).toISOString();
      await createScheduledGame(scheduledAt, note, superuserKey);
      setNote('');
      onCreated();
    } catch (err) {
      setError(err.message || 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: 20, maxWidth: 640, marginBottom: 28 }}>
      <h3 style={{ marginBottom: 14, fontSize: 15 }}>📅 Schedule a Game</h3>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
          <label style={{ fontSize: 12, marginBottom: 4, display: 'block', color: 'var(--text-muted)' }}>Date &amp; Time (local)</label>
          <input
            type="datetime-local"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div className="form-group" style={{ flex: '2 1 220px', marginBottom: 0 }}>
          <label style={{ fontSize: 12, marginBottom: 4, display: 'block', color: 'var(--text-muted)' }}>Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="e.g. Weekly inhouse, Season 10"
            style={{ width: '100%' }}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={loading}
          style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
        >
          {loading ? 'Creating…' : '+ Create Game'}
        </button>
      </div>
      {error && <div style={{ fontSize: 13, color: '#f44336', marginTop: 8 }}>{error}</div>}
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
