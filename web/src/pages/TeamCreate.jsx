// Task #319 — Create-a-team page. Opens a Stripe checkout for the $10 fee.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTeamCheckout } from '../api';

export default function TeamCreate() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const { url } = await createTeamCheckout(name.trim(), tag.trim().toUpperCase());
      if (url) window.location.href = url;
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)' }}>Create a team</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        Pay a one-time $10 AUD fee to register a team. After payment, you can
        invite players, set your logo and colours, and play team-tournaments
        together. Optional $5 AUD upkeep keeps your team listed in the
        spotlight rotation.
      </p>
      <form onSubmit={submit} className="card" style={{ padding: 16, marginTop: 12 }}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 4 }}>Team name (3–32 chars)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 4 }}>Tag (2–6 uppercase chars)</span>
          <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} maxLength={6} required
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'inherit' }} />
        </label>
        {err ? <p style={{ color: 'crimson' }}>{err}</p> : null}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={busy}
            style={{ background: 'var(--gold)', color: '#000', padding: '8px 16px', border: 'none', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Opening Stripe…' : 'Pay $10 AUD & create'}
          </button>
          <button type="button" onClick={() => nav('/teams')}
            style={{ background: 'transparent', color: 'var(--text-muted)', padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
