import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as api from '../api';

const BASE = '/api';

export default function VodReviewRequest() {
  const { id } = useParams();
  const [coach, setCoach] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ match_id: '', replay_url: '', question: '', price_cents: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/coaches/${id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(new Error(b.error || 'Failed'))))
      .then(d => {
        setCoach(d.coach);
        setForm(f => ({ ...f, price_cents: Math.max(2000, Math.round((d.coach.hourly_rate_cents || 6000) * 0.5)) }));
      })
      .catch(e => setError(e.message));
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!form.match_id.trim() && !form.replay_url.trim()) {
        throw new Error('Provide a match ID or a replay URL');
      }
      const r = await api.requestVodReview(id, {
        match_id: form.match_id.trim() || null,
        replay_url: form.replay_url.trim() || null,
        question: form.question.trim(),
        price_cents: parseInt(form.price_cents),
      });
      window.location.href = r.url;
    } catch (err) { alert(err.message); setSubmitting(false); }
  };

  if (error) return <div style={{ padding: 24, color: 'var(--dire-color)' }}>{error}</div>;
  if (!coach) return <div style={{ padding: 24 }}>Loading…</div>;

  const max = coach.hourly_rate_cents || 30000;

  return (
    <div style={{ maxWidth: 700, margin: '24px auto', padding: 16 }}>
      <h1>Request async VOD review</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        From <strong>{coach.display_name || `Coach #${coach.id}`}</strong>. The coach will leave timestamped notes on your replay. Funds escrow until the review is delivered.
      </p>
      <p><Link to={`/coaches/${id}`} style={{ color: 'var(--accent)' }}>← Back to coach</Link></p>

      <form onSubmit={submit} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'grid', gap: 12, marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Provide either a recorded match ID (preferred — opens in our 2D replay viewer with the coach's annotations overlaid) or a hosted replay URL (e.g. .dem link, Dotabuff/Stratz). One of the two is required.
        </p>
        <label>Match ID<br/>
          <input type="text" value={form.match_id} onChange={e => setForm(f => ({ ...f, match_id: e.target.value }))}
            placeholder="e.g. 8123456789"
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </label>
        <label>…or replay URL<br/>
          <input type="url" value={form.replay_url} onChange={e => setForm(f => ({ ...f, replay_url: e.target.value }))}
            placeholder="https://… (link to a .dem file or replay viewer)"
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </label>
        <label>Your question (≥10 chars)<br/>
          <textarea required rows={5} value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
            placeholder="What do you want feedback on? e.g. itemisation, decision-making in the mid-game, lane mistakes…"
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
        </label>
        <label>Your offer (cents, max {max})<br/>
          <input required type="number" min={1000} max={max} value={form.price_cents}
            onChange={e => setForm(f => ({ ...f, price_cents: e.target.value }))}
            style={{ width: 200, padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 13 }}>
            = ${(parseInt(form.price_cents || 0) / 100).toFixed(2)} {String(coach.currency || 'aud').toUpperCase()}
          </span>
        </label>
        <button type="submit" disabled={submitting || form.question.trim().length < 10 || (!form.match_id.trim() && !form.replay_url.trim())}
          style={{ padding: '10px 20px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700, justifySelf: 'start', opacity: (submitting || form.question.trim().length < 10 || (!form.match_id.trim() && !form.replay_url.trim())) ? 0.5 : 1 }}>
          {submitting ? 'Redirecting…' : '💳 Pay & request'}
        </button>
      </form>
    </div>
  );
}
