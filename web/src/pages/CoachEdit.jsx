import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const BASE = '/api';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CoachEdit() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [coach, setCoach] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [rating, setRating] = useState(null);
  const [kyc, setKyc] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${BASE}/coach/me`, { credentials: 'include' });
      if (r.status === 404) { setError('You don\'t have a coach profile yet. Apply to coach first.'); setLoading(false); return; }
      if (r.status === 401) { setError('Sign in with Steam first.'); setLoading(false); return; }
      const d = await r.json();
      setCoach(d.coach); setAvailability(d.availability || []);
      setBookings(d.bookings || []); setRating(d.rating);
      const k = await fetch(`${BASE}/coach/onboarding-status`, { credentials: 'include' });
      if (k.ok) setKyc(await k.json());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const f = new FormData(e.target);
      const patch = Object.fromEntries(f.entries());
      patch.hourly_rate_cents = parseInt(patch.hourly_rate_dollars || '0') * 100;
      delete patch.hourly_rate_dollars;
      const r = await fetch(`${BASE}/coach/me`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setCoach(d.coach);
      setMsg('Saved.');
    } catch (err) { setMsg(`Error: ${err.message}`); }
  };

  const saveAvail = async () => {
    setMsg('');
    try {
      const r = await fetch(`${BASE}/coach/me/availability`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: availability }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setAvailability(d.availability || []);
      setMsg('Availability saved.');
    } catch (err) { setMsg(`Error: ${err.message}`); }
  };

  const addSlot = () => setAvailability(a => [...a, { day_of_week: 1, start_time: '19:00', end_time: '21:00', timezone: 'Australia/Sydney' }]);
  const updSlot = (i, k, v) => setAvailability(a => a.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const rmSlot = (i) => setAvailability(a => a.filter((_, idx) => idx !== i));

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) return <div style={{ padding: 24 }}>
    <h1>Coach editor</h1>
    <p style={{ color: 'var(--text-muted)' }}>{error}</p>
    <Link to="/coach/onboarding" style={{ color: 'var(--accent)' }}>→ Apply to coach</Link>
  </div>;

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
      <h1>Coach editor</h1>

      {kyc && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <strong>KYC status:</strong>{' '}
          <span style={{ color: kyc.charges_enabled ? 'var(--radiant-color)' : '#fbbf24' }}>
            {kyc.charges_enabled ? 'Active — accepting bookings' : `Pending (${kyc.requirements_due?.length || 0} requirements due)`}
          </span>
          {!kyc.charges_enabled && (
            <button
              onClick={async () => {
                const r = await fetch(`${BASE}/coach/onboard`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                const d = await r.json();
                if (d.url) window.location.href = d.url;
                else setMsg(`Error: ${d.error}`);
              }}
              style={{ marginLeft: 12, padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}>
              Continue Stripe setup
            </button>
          )}
        </div>
      )}

      <form onSubmit={save} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Profile</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>Hourly rate (AUD): <input type="number" name="hourly_rate_dollars" min={10} max={500} step={1}
            defaultValue={Math.round((coach.hourly_rate_cents || 5000) / 100)} required
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 100 }} /></label>
          <label>Bio:<br/>
            <textarea name="bio" defaultValue={coach.bio || ''} rows={5}
              placeholder="Tell students why they should book you (peak rank, teams, coaching style, etc.)"
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} /></label>
          <label>Languages: <input name="languages" defaultValue={coach.languages || ''} placeholder="English, Mandarin"
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
          <label>Roles taught: <input name="taught_roles" defaultValue={coach.taught_roles || ''} placeholder="1, 2, 3"
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
          <label>Heroes specialised: <input name="taught_heroes" defaultValue={coach.taught_heroes || ''} placeholder="Invoker, Pudge"
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
          <label>Intro video URL: <input name="intro_video_url" defaultValue={coach.intro_video_url || ''} placeholder="https://youtube.com/..."
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
          <label>Sample replays: <input name="sample_replays" defaultValue={coach.sample_replays || ''}
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: '100%' }} /></label>
        </div>
        <button type="submit" style={{ marginTop: 12, padding: '8px 16px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700 }}>Save profile</button>
      </form>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Weekly availability</h3>
        {availability.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={s.day_of_week} onChange={e => updSlot(i, 'day_of_week', parseInt(e.target.value))}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
            </select>
            <input type="time" value={s.start_time} onChange={e => updSlot(i, 'start_time', e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <span>–</span>
            <input type="time" value={s.end_time} onChange={e => updSlot(i, 'end_time', e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
            <input value={s.timezone} onChange={e => updSlot(i, 'timezone', e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', width: 180 }} />
            <button type="button" onClick={() => rmSlot(i)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--dire-color)', cursor: 'pointer' }}>Remove</button>
          </div>
        ))}
        <div style={{ marginTop: 10 }}>
          <button type="button" onClick={addSlot} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', marginRight: 8 }}>+ Add slot</button>
          <button type="button" onClick={saveAvail} style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer' }}>Save availability</button>
        </div>
      </div>

      {msg && <p style={{ color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--radiant-color)' }}>{msg}</p>}

      <h3>Recent bookings</h3>
      {bookings.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No bookings yet.</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}><th align="left">Student</th><th align="left">When</th><th align="left">Status</th><th align="right">Earning</th><th></th></tr></thead>
          <tbody>{bookings.map(b => (
            <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: 6 }}>{b.student_name}</td>
              <td style={{ padding: 6 }}>{new Date(b.slot_start_at).toLocaleString()}</td>
              <td style={{ padding: 6 }}>{b.status}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>${((b.amount_cents - b.platform_fee_cents) / 100).toFixed(2)}</td>
              <td style={{ padding: 6 }}>
                {b.status === 'paid' && !b.coach_confirmed_at && (
                  <button onClick={async () => {
                    const r = await fetch(`${BASE}/bookings/${b.id}/confirm-completion`, { method: 'POST', credentials: 'include' });
                    if (r.ok) load();
                  }} style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--radiant-color)', color: '#fff', border: 0, cursor: 'pointer' }}>Confirm done</button>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {rating && (
        <p style={{ marginTop: 20, color: 'var(--text-muted)' }}>
          Average rating: {rating.avg_rating ? `★ ${rating.avg_rating} (${rating.review_count})` : 'No ratings yet'}
        </p>
      )}
    </div>
  );
}
