import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const BASE = '/api';

function StatusPill({ s }) {
  const colors = {
    pending: '#9ca3af', paid: '#3b82f6', completed: '#10b981',
    disputed: '#f59e0b', refunded: '#ef4444', cancelled: '#6b7280',
  };
  return <span style={{
    display: 'inline-block', padding: '2px 10px', borderRadius: 12,
    fontSize: 11, fontWeight: 700, color: '#fff', background: colors[s] || '#6b7280',
  }}>{s}</span>;
}

export default function MyBookings() {
  const [data, setData] = useState({ as_student: [], as_coach: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reviewModal, setReviewModal] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${BASE}/me/coaching/bookings`, { credentials: 'include' });
      if (r.status === 404) { setError('Coaching marketplace is not yet open.'); setLoading(false); return; }
      if (r.status === 401) { setError('Sign in with Steam first.'); setLoading(false); return; }
      const d = await r.json();
      setData(d);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const action = async (path, body) => {
    try {
      const r = await fetch(`${BASE}${path}`, {
        method: 'POST', credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      load();
      return d;
    } catch (e) { alert(e.message); }
  };

  const submitReview = async () => {
    if (!reviewModal) return;
    const { booking_id, rating, written_review } = reviewModal;
    // Booking-keyed endpoint — works even when the coach has been
    // suspended / delisted between the session and the review (the old
    // /coaches/:id/reviews path required resolving the coach via the
    // public active-coach directory, which would 404 for non-active
    // coaches and silently break review submission).
    const r = await fetch(`${BASE}/bookings/${booking_id}/review`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, written_review }),
    });
    const d = await r.json();
    if (!r.ok) { alert(d.error || 'Failed'); return; }
    setReviewModal(null);
    alert('Thanks for the review!');
    load();
  };

  if (error) return <div style={{ padding: 24 }}><h1>My bookings</h1><p style={{ color: 'var(--text-muted)' }}>{error}</p></div>;
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  const renderRow = (b, mine = 'student') => (
    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: 8 }}>{mine === 'student' ? b.coach_name : b.student_name}</td>
      <td style={{ padding: 8, fontSize: 13 }}>{new Date(b.slot_start_at).toLocaleString()}</td>
      <td style={{ padding: 8 }}>{b.duration_minutes}m</td>
      <td style={{ padding: 8 }}><StatusPill s={b.status} /></td>
      <td style={{ padding: 8, textAlign: 'right' }}>${(b.amount_cents / 100).toFixed(2)}</td>
      <td style={{ padding: 8 }}>
        {b.status === 'paid' && (
          <>
            {mine === 'coach' && !b.coach_arrived_at && (
              <button onClick={() => action(`/bookings/${b.id}/coach-arrived`)}
                title="Locks out the student's no-show refund button. Click when you've shown up to the session."
                style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', marginRight: 6 }}>
                ✓ Mark arrived
              </button>
            )}
            <button onClick={() => action(`/bookings/${b.id}/confirm-completion`)}
              style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--radiant-color)', color: '#fff', border: 0, cursor: 'pointer', marginRight: 6 }}>
              Mark completed
            </button>
            {mine === 'student' && (
              <>
                <button onClick={() => {
                  const reason = prompt('Describe the issue:');
                  if (reason) action(`/bookings/${b.id}/dispute`, { reason });
                }} style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', marginRight: 6 }}>Dispute</button>
                <button onClick={() => { if (confirm('Coach no-show? This will refund you. (Available 10 minutes after slot start, only if the coach has not marked themselves arrived.)')) action(`/bookings/${b.id}/no-show-refund`); }}
                  style={{ padding: '4px 10px', borderRadius: 6, background: 'transparent', border: '1px solid var(--dire-color)', color: 'var(--dire-color)', cursor: 'pointer' }}>No-show refund</button>
              </>
            )}
          </>
        )}
        {b.status === 'completed' && mine === 'student' && (
          <button onClick={() => setReviewModal({ booking_id: b.id, rating: 5, written_review: '', coach_name: b.coach_name })}
            style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}>★ Leave review</button>
        )}
      </td>
    </tr>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      <h1>My coaching bookings</h1>

      <h3 style={{ marginTop: 24 }}>As student</h3>
      {data.as_student.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No bookings yet. <Link to="/coaches" style={{ color: 'var(--accent)' }}>Browse coaches →</Link></p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '2px solid var(--border)' }}><th align="left">Coach</th><th align="left">When</th><th align="left">Length</th><th align="left">Status</th><th align="right">Cost</th><th></th></tr></thead>
          <tbody>{data.as_student.map(b => renderRow(b, 'student'))}</tbody>
        </table>
      )}

      {data.as_coach.length > 0 && (
        <>
          <h3 style={{ marginTop: 32 }}>As coach</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}><th align="left">Student</th><th align="left">When</th><th align="left">Length</th><th align="left">Status</th><th align="right">Earning</th><th></th></tr></thead>
            <tbody>{data.as_coach.map(b => renderRow(b, 'coach'))}</tbody>
          </table>
        </>
      )}

      {reviewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setReviewModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', padding: 24, borderRadius: 10, maxWidth: 500, width: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Review {reviewModal.coach_name}</h3>
            <label>Rating:&nbsp;
              <select value={reviewModal.rating} onChange={e => setReviewModal(m => ({ ...m, rating: parseInt(e.target.value) }))}
                style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
              </select>
            </label>
            <textarea value={reviewModal.written_review} onChange={e => setReviewModal(m => ({ ...m, written_review: e.target.value }))}
              rows={4} placeholder="Optional written review"
              style={{ width: '100%', marginTop: 12, padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setReviewModal(null)} style={{ padding: '6px 14px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitReview} style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
