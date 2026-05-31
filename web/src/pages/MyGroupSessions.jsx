import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';
import SignInPrompt from '../components/SignInPrompt';

function fmtPrice(c, cur = 'aud') { return `$${(c / 100).toFixed(2)} ${String(cur).toUpperCase()}`; }
function fmtWhen(iso) { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

const STATUS_COLOR = {
  pending: '#9ca3af', paid: '#3b82f6', refunded: '#ef4444', cancelled: '#6b7280',
};

export default function MyGroupSessions() {
  const { steamUser, loading: authLoading } = useSteamAuth() || {};
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listMyGroupSeats()
      .then(d => setSeats(d.seats || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (authLoading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!steamUser?.accountId) return <SignInPrompt title="My group sessions" message="Sign in with Steam to view the group sessions you've joined." />;
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--dire-color)' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
      <h1>My group sessions</h1>
      <p style={{ marginTop: 4 }}>
        <Link to="/group-sessions" style={{ color: 'var(--accent)' }}>→ Browse open sessions</Link>
      </p>
      {seats.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>You haven't joined any group sessions yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th align="left">Session</th><th align="left">Coach</th>
              <th align="left">When</th><th align="left">Status</th><th align="right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {seats.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 8 }}>{s.title}</td>
                <td style={{ padding: 8 }}>{s.coach_name}</td>
                <td style={{ padding: 8, fontSize: 13 }}>{fmtWhen(s.scheduled_at)}</td>
                <td style={{ padding: 8 }}>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, color: '#fff', background: STATUS_COLOR[s.status] || '#6b7280' }}>{s.status}</span>
                </td>
                <td style={{ padding: 8, textAlign: 'right' }}>{fmtPrice(s.amount_cents, s.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
