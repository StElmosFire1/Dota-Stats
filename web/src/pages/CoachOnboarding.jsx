import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const BASE = '/api';

export default function CoachOnboarding() {
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`${BASE}/coaching/eligibility/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setEligibility(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const startOnboarding = async () => {
    setMsg('Connecting to Stripe…');
    try {
      const r = await fetch(`${BASE}/coach/onboard`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'AU' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      window.location.href = d.url;
    } catch (e) { setMsg(`Error: ${e.message}`); }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!eligibility?.signed_in) return <div style={{ padding: 24 }}><h1>Apply to coach</h1><p>Sign in with Steam to apply.</p></div>;
  if (!eligibility.eligible) return <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
    <h1>Apply to coach</h1>
    <p>Coaching is invite-only. To qualify you must be either:</p>
    <ul><li>Top 5 on the all-time leaderboard, or</li><li>Immortal+ on Dota 2 ranked matchmaking</li></ul>
    <p style={{ color: 'var(--text-muted)' }}>Climb the leaderboard or link your Steam rank to unlock this.</p>
  </div>;

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <h1>🎓 Apply to coach</h1>
      <p>You're eligible to join the coaching marketplace. To start accepting paid bookings:</p>
      <ol style={{ lineHeight: 1.8 }}>
        <li>Connect a Stripe Express account so we can pay out your earnings.</li>
        <li>Stripe will ask for ID + bank details (handled entirely by Stripe — we never see them).</li>
        <li>Once approved, fill out your coach profile (rate, bio, availability) and you'll appear on the public Coaches page.</li>
      </ol>
      <p style={{ color: 'var(--text-muted)' }}>Platform fee: 10% of each booking. You keep the other 90%, paid out to your bank by Stripe.</p>
      <button onClick={startOnboarding}
        style={{ padding: '12px 24px', borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 0, cursor: 'pointer', fontWeight: 700, fontSize: 16, marginTop: 12 }}>
        Continue with Stripe →
      </button>
      {eligibility.has_coach_row && (
        <p style={{ marginTop: 16 }}>
          Already onboarded? <Link to="/coach/edit" style={{ color: 'var(--accent)' }}>→ Open coach editor</Link>
        </p>
      )}
      {msg && <p style={{ color: msg.startsWith('Error') ? 'var(--dire-color)' : 'var(--text-muted)', marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
