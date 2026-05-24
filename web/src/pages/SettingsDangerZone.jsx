import React, { useEffect, useState } from 'react';
import { useSteamAuth } from '../context/SteamAuthContext';
import Dialog from '../components/Dialog';

export default function SettingsDangerZone() {
  const { steamUser } = useSteamAuth() || {};
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/me/account-status', { credentials: 'include' });
      if (r.ok) setStatus(await r.json());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (steamUser?.accountId) load(); }, [steamUser?.accountId]);

  const requestDeletion = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/me/account/request-deletion', { method: 'POST', credentials: 'include' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to request deletion');
      }
      setConfirmOpen(false);
      setConfirmText('');
      // The request-deletion endpoint destroys the session server-side
      // (authoritative cut). Reload so the app re-fetches /api/auth/me
      // and reflects the signed-out state.
      window.location.href = '/?account_deletion_requested=1';
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const cancelDeletion = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/me/account/cancel-deletion', { method: 'POST', credentials: 'include' });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Failed to cancel deletion');
      }
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  if (!steamUser?.accountId) {
    return <div><h2>Danger zone</h2><p>Sign in with Steam to manage account deletion.</p></div>;
  }

  const pending = status?.pending_deletion_at;
  const purgeAt = status?.scheduled_purge_at;
  const graceDays = status?.grace_days || 30;

  return (
    <div>
      <h2 style={{ marginTop: 0, color: '#f87171' }}>Danger zone</h2>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Account deletion is a two-step process. After you request it, you have a {graceDays}-day grace
        period — signing in with Steam during that window cancels the request. After {graceDays} days
        your account is permanently anonymised: your name is replaced with &quot;Deleted Player #N&quot;,
        your Discord link is removed and all profile customisations are wiped. Your historical match data
        stays so that other players&apos; stats remain correct.
      </p>

      {error && <div className="error-state" style={{ margin: '12px 0' }}>{error}</div>}

      <div style={{
        marginTop: 16, padding: 18,
        background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.4)',
        borderRadius: 12,
      }}>
        {loading && <div className="loading">Loading\u2026</div>}

        {!loading && !pending && (
          <>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Delete my account
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              You can cancel this within {graceDays} days by signing back in with Steam.
            </div>
            <button
              type="button"
              className="btn"
              style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
            >
              Request account deletion
            </button>
          </>
        )}

        {!loading && pending && (
          <>
            <div style={{ fontWeight: 700, color: '#f87171', marginBottom: 6 }}>
              Account deletion pending
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
              Requested on <strong>{new Date(pending).toLocaleString()}</strong>.<br />
              Scheduled to be anonymised on <strong>{purgeAt ? new Date(purgeAt).toLocaleString() : 'a future date'}</strong>.<br />
              Cancel any time before then to keep your account.
            </div>
            <button type="button" className="btn btn-primary" onClick={cancelDeletion} disabled={busy}>
              {busy ? 'Working\u2026' : 'Cancel deletion request'}
            </button>
          </>
        )}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => { if (!busy) { setConfirmOpen(false); setConfirmText(''); } }}
        label="Confirm account deletion"
        backdropStyle={{ background: 'rgba(0,0,0,0.7)' }}
        contentStyle={{
          background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.5)',
          borderRadius: 14, padding: '24px 28px', maxWidth: 480, width: '100%',
        }}
      >
        <h3 style={{ marginTop: 0, color: '#f87171' }}>Confirm account deletion</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          Type <strong>DELETE</strong> below to confirm. You\u2019ll be signed out and your account will be
          anonymised after {graceDays} days unless you sign back in.
        </p>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            Type DELETE to confirm
          </span>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={busy}
            autoFocus
            style={{
              width: '100%', padding: '8px 10px',
              background: 'var(--bg-hover)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)', fontSize: 14,
            }}
          />
        </label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => { setConfirmOpen(false); setConfirmText(''); }} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
            onClick={requestDeletion}
            disabled={busy || confirmText.trim() !== 'DELETE'}
          >
            {busy ? 'Working\u2026' : 'Delete my account'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
