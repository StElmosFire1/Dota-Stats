import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';

function fmtPrice(c, cur = 'aud') { return `$${(c / 100).toFixed(0)} ${String(cur).toUpperCase()}`; }
function fmtWhen(iso) { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

export default function GroupSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(null);

  const load = () => {
    setLoading(true);
    api.listOpenGroupSessions()
      .then(d => setSessions(d.sessions || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const join = async (id) => {
    setJoining(id);
    try {
      const r = await api.joinGroupSession(id);
      window.location.href = r.url;
    } catch (e) { alert(e.message); setJoining(null); }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--dire-color)' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 16 }}>
      <h1>Group coaching sessions</h1>
      <p style={{ color: 'var(--text-muted)' }}>One coach, up to 8 students. Funds escrow until completion — refundable if cancelled.</p>
      <p style={{ marginTop: 8 }}>
        <Link to="/me/coaching/group" style={{ color: 'var(--accent)' }}>→ My seats</Link>
      </p>
      {sessions.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', marginTop: 24 }}>No upcoming group sessions. Check back soon.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {sessions.map(s => {
            const full = s.seats_taken >= s.capacity || s.status === 'full';
            return (
              <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontWeight: 700, fontSize: 17 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                      Hosted by <strong>{s.coach_name}</strong> · {fmtWhen(s.scheduled_at)} · {s.duration_minutes}m
                    </div>
                    {s.description && <p style={{ fontSize: 13, marginTop: 8, whiteSpace: 'pre-wrap' }}>{s.description}</p>}
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                      Seats: <strong>{s.seats_taken}/{s.capacity}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
                      {fmtPrice(s.price_per_seat_cents, s.currency)}/seat
                    </div>
                    <button type="button" onClick={() => join(s.id)} disabled={full || joining === s.id}
                      aria-label={full ? 'Session full' : `Join ${s.title}`}
                      style={{ marginTop: 8, padding: '8px 16px', borderRadius: 6, background: full ? 'var(--bg-secondary)' : 'var(--accent)', color: '#fff', border: 0, cursor: full ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: full ? 0.5 : 1 }}>
                      {full ? 'Full' : (joining === s.id ? 'Redirecting…' : '💳 Join')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
