import React, { useEffect, useState } from 'react';

export default function LobbyAutomationControl({ editable = false, onChange }) {
  const [enabled, setEnabled] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const load = () => fetch('/api/inhouse/automation', { signal: controller.signal, cache: 'no-store' })
      .then(async r => { if (!r.ok) throw new Error('Could not read automation setting'); return r.json(); })
      .then(d => { setEnabled(d.enabled); onChange?.(d.enabled); setError(''); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    load();
    const timer = setInterval(load, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [onChange]);
  async function toggle() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/inhouse/automation', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save setting');
      setEnabled(d.enabled);
      onChange?.(d.enabled);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <section className="card" aria-label="Lobby Dota automation" style={{ padding: 18, marginBottom: 16, border: '1px solid var(--border)', borderRadius: 10 }}>
      <h3 style={{ marginTop: 0 }}>Lobby Dota automation</h3>
      <p>{enabled === null ? 'Checking mode…' : enabled ? 'Automated Dota mode' : 'Website-only mode'}</p>
      <p style={{ color: 'var(--text-muted)' }}>Website joining, ready checks and player drafting work in either mode. When off, Dota lobby creation, joining, invitations, launching and game-server provisioning are blocked. Arrange the Dota match manually. Existing games are not disconnected.</p>
      {editable && <button type="button" className="btn" role="switch" aria-checked={enabled === true} disabled={busy || enabled === null} onClick={toggle}>
        {busy ? 'Saving…' : enabled ? 'Turn Dota automation off' : 'Turn Dota automation on'}
      </button>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
