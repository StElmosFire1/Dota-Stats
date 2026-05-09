import React from 'react';
import { Link } from 'react-router-dom';
import {
  getMyVanitySlug, checkVanitySlugAvailability,
  claimMyVanitySlug, releaseMyVanitySlug,
} from '../api';

// v6.64 / Task #208 — Shared vanity slug picker. Used in both Settings →
// Profile and the Cosmetics Shop identity section. Pro-gated; non-Pro
// users who already own a slug (grandfathered) keep edit access.
// Availability is debounced (~300ms) on input change to avoid hammering
// the API. Server enforces shape (3–24 lowercase a–z / 0–9 / hyphen, no
// leading/trailing hyphen, no `--`) + reserved deny-list authoritatively.
export default function VanitySlugPicker({ compact = false }) {
  const [state, setState] = React.useState({
    loading: true, slug: null, isPro: false, grandfathered: false,
  });
  const [draft, setDraft] = React.useState('');
  const [check, setCheck] = React.useState({ status: 'idle', message: '' });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [msg, setMsg] = React.useState(null);
  const debounceRef = React.useRef(null);

  const reload = React.useCallback(async () => {
    try {
      const data = await getMyVanitySlug();
      setState({
        loading: false,
        slug: data?.slug || null,
        isPro: !!data?.is_pro,
        grandfathered: !!data?.grandfathered,
      });
      setDraft(data?.slug || '');
    } catch (e) {
      setState(s => ({ ...s, loading: false }));
      setError(e.message || 'Failed to load slug.');
    }
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  const onChangeDraft = (val) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
    setDraft(cleaned);
    setError(null); setMsg(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!cleaned || cleaned === state.slug) {
      setCheck({ status: 'idle', message: '' });
      return;
    }
    setCheck({ status: 'checking', message: 'Checking…' });
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await checkVanitySlugAvailability(cleaned);
        if (r?.available) setCheck({ status: 'ok', message: 'Available' });
        else setCheck({ status: 'taken', message: r?.reason || 'Unavailable' });
      } catch (e) {
        setCheck({ status: 'taken', message: e.message || 'Unavailable' });
      }
    }, 300);
  };

  const onClaim = async () => {
    setError(null); setMsg(null); setBusy(true);
    try {
      await claimMyVanitySlug(draft);
      setMsg(`Claimed /p/${draft}`);
      await reload();
    } catch (e) {
      setError(e.message || 'Failed to claim slug.');
    }
    setBusy(false);
  };

  const onRelease = async () => {
    if (!window.confirm(`Release /p/${state.slug}? You'll have a 30-day cooldown before anyone else can claim it.`)) return;
    setError(null); setMsg(null); setBusy(true);
    try {
      await releaseMyVanitySlug();
      setMsg('Slug released.');
      setDraft('');
      await reload();
    } catch (e) {
      setError(e.message || 'Failed to release slug.');
    }
    setBusy(false);
  };

  // Grandfathered non-Pro keeps the existing slug visible but the picker
  // is read-only — they cannot change to a new slug or release without
  // Pro. The server enforces the same rule on POST and DELETE.
  const canEdit = state.isPro;
  const canClaim = canEdit && draft && draft !== state.slug && check.status === 'ok' && !busy;

  if (state.loading) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <div>
      {!compact ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0, marginBottom: 10 }}>
          Claim a short link to your profile, like <code>/p/your-name</code>.
          3–24 chars, lowercase a–z / 0–9 / hyphen. {canEdit
            ? 'Pro members can claim, change, or release at any time.'
            : state.grandfathered
              ? 'Your existing slug is grandfathered in — go Pro to change or release it.'
              : 'Reserved for Pro members.'}
        </p>
      ) : null}

      {state.slug ? (
        <div style={{
          padding: '8px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.10)',
          border: '1px solid #16a34a55', color: 'var(--text-primary)', fontSize: 13,
          marginBottom: 10,
        }}>
          Current: <strong>/p/{state.slug}</strong>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/p/</span>
        <input
          type="text"
          value={draft}
          onChange={(e) => onChangeDraft(e.target.value)}
          placeholder="your-name"
          disabled={!canEdit || busy}
          maxLength={24}
          aria-label="Vanity slug"
          style={{
            flex: 1, minWidth: 200, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', fontSize: 14,
            fontFamily: 'monospace', letterSpacing: 0.4,
          }}
        />
        <button type="button" className="btn btn-small"
          onClick={onClaim} disabled={!canClaim}>
          {busy ? 'Saving…' : state.slug ? 'Change' : 'Claim'}
        </button>
        {state.slug && canEdit ? (
          <button type="button" className="btn btn-small"
            onClick={onRelease} disabled={busy}
            style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444' }}>
            Release
          </button>
        ) : null}
      </div>

      {check.status !== 'idle' && draft && draft !== state.slug ? (
        <div style={{
          marginTop: 6, fontSize: 12,
          color: check.status === 'ok' ? '#22c55e'
            : check.status === 'checking' ? 'var(--text-muted)'
            : '#ef4444',
        }}>{check.message}</div>
      ) : null}

      {!canEdit ? (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <Link to="/pro" style={{ color: 'var(--accent)' }}>Go Pro →</Link> to claim a slug.
        </div>
      ) : null}

      {error && <div style={{ marginTop: 6, color: '#ef4444', fontSize: 12 }}>{error}</div>}
      {msg && <div style={{ marginTop: 6, color: '#22c55e', fontSize: 12 }}>{msg}</div>}
    </div>
  );
}
