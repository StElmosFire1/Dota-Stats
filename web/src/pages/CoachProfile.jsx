import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const BASE = '/api';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatPrice(cents, currency = 'aud') {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(0)} ${String(currency).toUpperCase()}`;
}

export default function CoachProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [bookForm, setBookForm] = useState({ slot_start_at: '', duration_minutes: 60 });
  const [bookMsg, setBookMsg] = useState('');
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/coaches/${id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(new Error(b.error || 'Failed'))))
      .then(setData)
      .catch(e => setError(e.message));
  }, [id]);

  const handleBook = async (e) => {
    e.preventDefault();
    setBookMsg('');
    setBooking(true);
    try {
      const iso = new Date(bookForm.slot_start_at).toISOString();
      const res = await fetch(`${BASE}/coaches/${id}/book`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_start_at: iso, duration_minutes: parseInt(bookForm.duration_minutes) || 60 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Booking failed');
      window.location.href = body.url;
    } catch (err) {
      setBookMsg(`Error: ${err.message}`);
    } finally { setBooking(false); }
  };

  if (error) return <div style={{ padding: 24 }}><h1>Coach</h1><p style={{ color: 'var(--dire-color)' }}>{error}</p></div>;
  if (!data) return <div style={{ padding: 24 }}>Loading…</div>;

  const { coach, availability, reviews, rating, credibility } = data;
  const totalCost = Math.round((coach.hourly_rate_cents * (parseInt(bookForm.duration_minutes) || 60)) / 60);

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
      <h1 style={{ marginBottom: 4 }}>{coach.display_name || `Coach #${coach.id}`}</h1>
      <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
        {rating?.review_count > 0
          ? `★ ${rating.avg_rating} from ${rating.review_count} review${rating.review_count !== 1 ? 's' : ''}`
          : 'No reviews yet'}
        {' · '}
        Responds within ~{coach.response_time_hours || 24}h
      </div>

      {(credibility?.mmr || credibility?.games_played > 0) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 16, padding: 12, marginBottom: 16,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
        }}>
          {credibility.mmr && (
            <div><span style={{ color: 'var(--text-muted)' }}>Inhouse MMR </span>
              <strong>{credibility.mmr}</strong></div>
          )}
          {credibility.games_played > 0 && (
            <>
              <div><span style={{ color: 'var(--text-muted)' }}>Record </span>
                <strong>{credibility.wins}W – {credibility.losses}L</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Win rate </span>
                <strong>{Math.round((credibility.wins / Math.max(1, credibility.games_played)) * 100)}%</strong>
                <span style={{ color: 'var(--text-muted)' }}> ({credibility.games_played} games)</span></div>
            </>
          )}
          {credibility.top_hero_id && (
            <div><span style={{ color: 'var(--text-muted)' }}>Most-played hero </span>
              <strong>#{credibility.top_hero_id}</strong>
              <span style={{ color: 'var(--text-muted)' }}> ({credibility.top_hero_games} games)</span></div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
          {formatPrice(coach.hourly_rate_cents, coach.currency)}/hr
        </div>
        {coach.bio && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{coach.bio}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 12, fontSize: 13 }}>
          {coach.languages && <div><strong>Languages:</strong> {coach.languages}</div>}
          {coach.taught_roles && <div><strong>Roles:</strong> {coach.taught_roles}</div>}
          {coach.taught_heroes && <div><strong>Heroes:</strong> {coach.taught_heroes}</div>}
        </div>
        {coach.intro_video_url && <p style={{ marginTop: 12 }}><a href={coach.intro_video_url} target="_blank" rel="noreferrer">▶ Watch intro video</a></p>}
        {coach.sample_replays && <p style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Sample replays: {coach.sample_replays}</p>}
      </div>

      <h3>Weekly availability</h3>
      {availability?.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No published availability — message the coach in Discord first.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 500, marginBottom: 20 }}>
          <thead><tr><th align="left">Day</th><th align="left">Time</th><th align="left">Timezone</th></tr></thead>
          <tbody>{availability?.map(s => (
            <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: '6px 0' }}>{DAYS[s.day_of_week]}</td>
              <td>{s.start_time} – {s.end_time}</td>
              <td style={{ color: 'var(--text-muted)' }}>{s.timezone}</td>
            </tr>
          ))}</tbody>
        </table>
      )}

      <h3>Book a session</h3>
      <form onSubmit={handleBook} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            Start time (your local)
            <input type="datetime-local" required value={bookForm.slot_start_at}
              onChange={e => setBookForm(f => ({ ...f, slot_start_at: e.target.value }))}
              style={{ padding: 8, marginTop: 4, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            Duration
            <select value={bookForm.duration_minutes}
              onChange={e => setBookForm(f => ({ ...f, duration_minutes: e.target.value }))}
              style={{ padding: 8, marginTop: 4, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
              <option value={120}>2 hours</option>
            </select>
          </label>
          <div style={{ fontSize: 14 }}>
            <div style={{ color: 'var(--text-muted)' }}>Total</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{formatPrice(totalCost, coach.currency)}</div>
          </div>
          <button type="submit" disabled={booking}
            style={{ padding: '10px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 }}>
            {booking ? 'Redirecting…' : '💳 Pay & book'}
          </button>
        </div>
        {bookMsg && <p style={{ color: bookMsg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)', marginTop: 8 }}>{bookMsg}</p>}
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          Funds are held in escrow until both you and the coach confirm the session. 10% platform fee.
          Sessions take place in your community Discord — no built-in video.
        </p>
      </form>

      <h3>Recent reviews</h3>
      {reviews?.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No reviews yet.</p>
      ) : (
        <div>{reviews?.map(r => (
          <div key={r.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <strong>{r.student_name}</strong>
              <span style={{ color: '#fbbf24' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
            </div>
            {r.written_review && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.written_review}</div>}
          </div>
        ))}</div>
      )}
    </div>
  );
}
