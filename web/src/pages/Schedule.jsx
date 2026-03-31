import React, { useState, useEffect } from 'react';
import { getSchedule } from '../api';
import { useSuperuser } from '../context/SuperuserContext';

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

export default function Schedule() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isSuperuser } = useSuperuser();

  const load = () => {
    setLoading(true);
    getSchedule()
      .then(d => setGames(d.games || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <div className="loading">Loading schedule…</div>;

  return (
    <div>
      <h1 className="page-title">📅 Upcoming Games</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Scheduled inhouse sessions. Use <code>!upcoming</code> in Discord to see this list, or <code>!schedule YYYY-MM-DD HH:MM [note]</code> to add one.
      </p>

      {games.length === 0 ? (
        <div className="empty-state">
          <p>No upcoming games scheduled.</p>
          {isSuperuser && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Use <code>!schedule</code> in Discord to add one.</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 600 }}>
          {games.map(g => {
            const dt = new Date(g.scheduled_at);
            const dateStr = dt.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const timeStr = dt.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: true });
            const until = timeUntil(g.scheduled_at);
            const isToday = new Date(g.scheduled_at).toDateString() === new Date().toDateString();

            return (
              <div key={g.id} className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderLeft: `3px solid ${isToday ? 'var(--accent-green)' : 'var(--accent)'}` }}>
                <div style={{ fontSize: 32, minWidth: 40, textAlign: 'center' }}>🎮</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{dateStr}</div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>{timeStr} AEST</div>
                  {g.note && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{g.note}</div>}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Scheduled by {g.created_by || 'admin'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isToday ? 'var(--accent-green)' : 'var(--text-secondary)' }}>{until}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>#{g.id}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 32, padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, maxWidth: 600 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Discord Commands</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div><code>!upcoming</code> — list upcoming games in Discord</div>
          <div><code>!schedule 2026-04-10 20:00 Weekly inhouse</code> — schedule a game (AEST)</div>
          <div><code>!cancel 3</code> — cancel game #3</div>
        </div>
      </div>
    </div>
  );
}
