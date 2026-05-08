import React, { useEffect, useState } from 'react';
import { getMySponsorshipInbox, acceptSponsorship, declineSponsorship } from '../api';

export default function SponsorshipInbox() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function load() {
    getMySponsorshipInbox()
      .then(d => setItems(d.sponsorships || []))
      .catch(err => setError(err.message));
  }
  useEffect(() => { load(); }, []);

  async function act(id, fn) {
    setBusy(true);
    try { await fn(id); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <h2>Sponsorship Inbox</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Sponsors that have paid for a slot on your profile. Accept to publish, decline to dismiss.
      </p>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {items.length === 0 ? (
        <p>No pending sponsorships.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {items.map(s => (
            <li key={s.id} style={{
              border: '1px solid var(--brass, #c5a975)', padding: 12,
              borderRadius: 8, marginBottom: 12,
            }}>
              <div><strong>{s.headline}</strong></div>
              {s.body_md && <div style={{ marginTop: 6 }}>{s.body_md}</div>}
              {s.link_url && <div style={{ marginTop: 6, fontSize: 12 }}>
                Link: <code>{s.link_url}</code>
              </div>}
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button disabled={busy} onClick={() => act(s.id, acceptSponsorship)}>Accept</button>
                <button disabled={busy} onClick={() => act(s.id, declineSponsorship)}>Decline</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
