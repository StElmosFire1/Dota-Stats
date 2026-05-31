import React, { useEffect, useState } from 'react';
import * as api from '../api';
import { useSteamAuth } from '../context/SteamAuthContext';
import SignInPrompt from '../components/SignInPrompt';

function fmtPrice(c, cur = 'aud') { return `$${(c / 100).toFixed(0)} ${String(cur).toUpperCase()}`; }

export default function CoachGroupSessionsManage() {
  const { steamUser, loading: authLoading } = useSteamAuth() || {};
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    title: '', description: '', scheduled_at: '',
    duration_minutes: 90, capacity: 6, price_per_seat_cents: 2000,
  });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    api.listMyCoachGroupSessions()
      .then(d => setRows(d.sessions || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createGroupSession({
        title: form.title.trim(),
        description: form.description.trim() || null,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_minutes: parseInt(form.duration_minutes),
        capacity: parseInt(form.capacity),
        price_per_seat_cents: parseInt(form.price_per_seat_cents),
      });
      setForm({ title: '', description: '', scheduled_at: '', duration_minutes: 90, capacity: 6, price_per_seat_cents: 2000 });
      load();
    } catch (err) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  const act = async (fn, id, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { await fn(id); load(); } catch (e) { alert(e.message); }
  };

  if (authLoading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!steamUser?.accountId) return <SignInPrompt title="Group sessions" message="Sign in with Steam to manage your coaching group sessions." />;
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--dire-color)' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 16 }}>
      <h1>My group sessions (coach)</h1>

      <h3 style={{ marginTop: 16 }}>Schedule a new session</h3>
      <form onSubmit={create} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'grid', gap: 10 }}>
        <label>Title<br/>
          <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </label>
        <label>Description (optional)<br/>
          <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <label>Start (local time)<br/>
            <input required type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </label>
          <label>Duration (min)<br/>
            <input required type="number" min={30} max={240} value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </label>
          <label>Capacity (2–8)<br/>
            <input required type="number" min={2} max={8} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </label>
          <label>Price per seat (cents)<br/>
            <input required type="number" min={500} value={form.price_per_seat_cents} onChange={e => setForm(f => ({ ...f, price_per_seat_cents: e.target.value }))}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </label>
        </div>
        <button type="submit" disabled={submitting}
          style={{ padding: '10px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700, justifySelf: 'start' }}>
          {submitting ? 'Creating…' : 'Create session'}
        </button>
      </form>

      <h3 style={{ marginTop: 24 }}>Your sessions</h3>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No sessions yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th align="left">Title</th><th align="left">When</th><th align="left">Seats</th>
              <th align="right">Price</th><th align="left">Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: 8 }}>{s.title}</td>
                <td style={{ padding: 8, fontSize: 13 }}>{new Date(s.scheduled_at).toLocaleString()}</td>
                <td style={{ padding: 8 }}>{s.seats_taken}/{s.capacity}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{fmtPrice(s.price_per_seat_cents, s.currency)}</td>
                <td style={{ padding: 8 }}>{s.status}</td>
                <td style={{ padding: 8 }}>
                  {['open', 'full', 'in_progress'].includes(s.status) && (
                    <>
                      <button type="button" aria-label={`Complete session ${s.title}`}
                        onClick={() => act(api.completeGroupSession, s.id, `Mark "${s.title}" complete? This captures payment from all paid seats.`)}
                        style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--radiant-color)', color: '#fff', border: 0, cursor: 'pointer', marginRight: 6 }}>
                        ✓ Complete
                      </button>
                      <button type="button" aria-label={`Cancel session ${s.title}`}
                        onClick={() => act(api.cancelGroupSession, s.id, `Cancel "${s.title}"? Paid seats will be refunded.`)}
                        style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--dire-color)', color: 'var(--dire-color)', cursor: 'pointer' }}>
                        ✕ Cancel
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
