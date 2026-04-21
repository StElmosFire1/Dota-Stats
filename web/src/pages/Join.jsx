import React, { useState } from 'react';

const POS_OPTIONS = [
  { value: 1, label: 'Pos 1', sublabel: 'Safe Lane (Carry)' },
  { value: 2, label: 'Pos 2', sublabel: 'Mid Lane' },
  { value: 3, label: 'Pos 3', sublabel: 'Off Lane' },
  { value: 4, label: 'Pos 4', sublabel: 'Soft Support' },
  { value: 5, label: 'Pos 5', sublabel: 'Hard Support' },
];

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

export default function Join() {
  const [form, setForm] = useState({
    discordUsername: '',
    steamUrl: '',
    preferredName: '',
    mmr: '',
    preferredPositions: [],
    referral: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const togglePosition = (pos) => {
    setForm(f => {
      if (f.preferredPositions.includes(pos)) {
        return { ...f, preferredPositions: f.preferredPositions.filter(p => p !== pos) };
      }
      return { ...f, preferredPositions: [...f.preferredPositions, pos] };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.discordUsername.trim()) { setError('Discord ID is required.'); return; }
    if (!form.steamUrl.trim()) { setError('Steam Profile URL is required.'); return; }
    if (!form.mmr.trim()) { setError('Peak MMR / Rank is required.'); return; }
    if (!form.referral.trim()) { setError('Please tell us how you heard about us.'); return; }
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

  const required = <span style={{ color: 'var(--accent-red)' }}>*</span>;

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 className="page-title">Join the Inhouse League</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: 1.6 }}>
        Interested in joining the OCE Dota 2 Inhouse community? Fill out the form below and an admin will be in touch.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div>
          <label style={labelStyle}>Discord ID {required}</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. 123456789012345678"
            value={form.discordUsername}
            onChange={e => setForm(f => ({ ...f, discordUsername: e.target.value }))}
            required
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Your numeric Discord User ID. To find it: Discord Settings → Advanced → enable Developer Mode, then right-click your username and select <strong style={{ color: 'var(--text-secondary)' }}>Copy User ID</strong>.
          </div>
        </div>

        <div>
          <label style={labelStyle}>Steam Profile URL {required}</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="https://steamcommunity.com/id/yourname or /profiles/76561198…"
            value={form.steamUrl}
            onChange={e => setForm(f => ({ ...f, steamUrl: e.target.value }))}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Peak MMR / Dota 2 Rank {required}</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. 4200 MMR, Ancient 3, Immortal…"
            value={form.mmr}
            onChange={e => setForm(f => ({ ...f, mmr: e.target.value }))}
            required
          />
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
          <label style={labelStyle}>Preferred Positions <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(click in order of preference)</span></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {POS_OPTIONS.map(opt => {
              const rank = form.preferredPositions.indexOf(opt.value);
              const selected = rank !== -1;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => togglePosition(opt.value)}
                  style={{
                    position: 'relative',
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: selected ? '2px solid var(--accent-green)' : '1px solid var(--border)',
                    background: selected ? 'rgba(74,222,128,0.08)' : 'var(--bg-card)',
                    color: selected ? 'var(--accent-green)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: 'center',
                    minWidth: 90,
                    transition: 'all 0.15s',
                  }}
                >
                  {selected && (
                    <span style={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      background: 'var(--accent-green)',
                      color: '#000',
                      borderRadius: '50%',
                      width: 20,
                      height: 20,
                      fontSize: 10,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {ORDINAL[rank]}
                    </span>
                  )}
                  <div>{opt.label}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{opt.sublabel}</div>
                </button>
              );
            })}
          </div>
          {form.preferredPositions.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              Order: {form.preferredPositions.map((p, i) => (
                <span key={p} style={{ color: 'var(--text-secondary)' }}>
                  {i > 0 && ' → '}{ORDINAL[i]} Pos {p}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>How did you hear about us / who do you know from the group? {required}</label>
          <input
            style={inputStyle}
            type="text"
            placeholder="e.g. I know Corvidae, saw it on Reddit, friend referred me…"
            value={form.referral}
            onChange={e => setForm(f => ({ ...f, referral: e.target.value }))}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Anything else?</label>
          <textarea
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
            placeholder="Availability, experience, anything you'd like us to know…"
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

        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Fields marked {required} are required.
        </p>
      </form>
    </div>
  );
}
