import React, { useState } from 'react';

const POS_OPTIONS = [
  { value: 1, label: 'Pos 1 — Safe Lane (Carry)' },
  { value: 2, label: 'Pos 2 — Mid Lane' },
  { value: 3, label: 'Pos 3 — Off Lane' },
  { value: 4, label: 'Pos 4 — Soft Support' },
  { value: 5, label: 'Pos 5 — Hard Support' },
];

export default function Join() {
  const [form, setForm] = useState({
    discordUsername: '',
    steamUrl: '',
    preferredName: '',
    preferredPositions: [],
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const togglePosition = (pos) => {
    setForm(f => ({
      ...f,
      preferredPositions: f.preferredPositions.includes(pos)
        ? f.preferredPositions.filter(p => p !== pos)
        : [...f.preferredPositions, pos],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.discordUsername.trim()) {
      setError('Discord username is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ maxWidth: 560, margin: '3rem auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
        <h1 style={{ color: 'var(--accent-green)', marginBottom: 12 }}>Request Received!</h1>
        <p style={{ color: 'var(--text-primary)', fontSize: 16, lineHeight: 1.6 }}>
          Thanks for your interest in the OCE Dota 2 Inhouse League. An admin will review your request and reach out via Discord shortly.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 16 }}>
          Make sure your Discord DMs are open so we can contact you.
        </p>
      </div>
    );
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--bg-input, #1a1a2e)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 14,
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 className="page-title">Join the Inhouse League</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
        Interested in joining the OCE Dota 2 Inhouse community? Fill out the form below and an admin will be in touch.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={labelStyle}>Discord Username <span style={{ color: 'var(--accent-red)' }}>*</span></label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. username#1234 or username"
            value={form.discordUsername}
            onChange={e => setForm(f => ({ ...f, discordUsername: e.target.value }))}
            required
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Your Discord username so we can reach you.
          </div>
        </div>

        <div>
          <label style={labelStyle}>Steam Profile URL</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="https://steamcommunity.com/id/yourname or /profiles/76561198..."
            value={form.steamUrl}
            onChange={e => setForm(f => ({ ...f, steamUrl: e.target.value }))}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Optional but helps us verify your account.
          </div>
        </div>

        <div>
          <label style={labelStyle}>Preferred In-Game Name</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="What should we call you?"
            value={form.preferredName}
            onChange={e => setForm(f => ({ ...f, preferredName: e.target.value }))}
          />
        </div>

        <div>
          <label style={labelStyle}>Preferred Positions</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {POS_OPTIONS.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={form.preferredPositions.includes(opt.value)}
                  onChange={() => togglePosition(opt.value)}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                <span style={{ color: form.preferredPositions.includes(opt.value) ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Anything else?</label>
          <textarea
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
            placeholder="Tell us your MMR, experience level, availability, or anything else..."
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(244,67,54,0.1)', border: '1px solid #f44336', borderRadius: 6, padding: '10px 14px', color: '#f44336', fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            background: submitting ? 'var(--bg-card)' : 'var(--accent-green)',
            color: submitting ? 'var(--text-muted)' : '#000',
            border: 'none',
            borderRadius: 8,
            padding: '12px 24px',
            fontSize: 15,
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit Interest'}
        </button>
      </form>
    </div>
  );
}
