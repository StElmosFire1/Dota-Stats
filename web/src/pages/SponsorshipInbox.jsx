import React, { useEffect, useState } from 'react';
import { getMySponsorshipInbox, getMySponsorshipOrders, acceptSponsorship, declineSponsorship } from '../api';

export default function SponsorshipInbox() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Task #342 — sponsor-side stats for orders the signed-in user has paid for.
  // Loaded independently so an unauthenticated/empty inbox doesn't suppress
  // the orders panel (and vice versa). A 401 from /me/sponsorship-orders is
  // treated as "not signed in / no orders" and quietly hides the section.
  const [orders, setOrders] = useState([]);

  function load() {
    getMySponsorshipInbox()
      .then(d => setItems(d.sponsorships || []))
      .catch(err => setError(err.message));
    getMySponsorshipOrders()
      .then(d => setOrders(d.orders || []))
      .catch(() => setOrders([]));
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

      {/* Task #342 — buyer-side telemetry. Hidden when the signed-in user
          has no sponsorship orders; otherwise shows impressions, clicks,
          and CTR per order so a sponsor can decide whether to renew. */}
      {orders.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3>My sponsorship orders</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Lifetime impressions and clicks for the slots you've sponsored. CTR shows "—" until your placement has been served.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--brass, #c5a975)' }}>
              <th align="left">Slot</th>
              <th align="left">Sponsor name</th>
              <th align="left">Status</th>
              <th align="left">Ends</th>
              <th align="right">Impressions</th>
              <th align="right">Clicks</th>
              <th align="right">CTR</th>
            </tr></thead>
            <tbody>{orders.map(o => (
              <tr key={o.id} style={{ borderBottom: '1px solid var(--border, #2a2f3a)' }}>
                <td style={{ padding: 6 }}>{o.slot_label}</td>
                <td style={{ padding: 6 }}>{o.sponsor_name}</td>
                <td style={{ padding: 6 }}>{o.status}</td>
                <td style={{ padding: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  {o.ends_at ? new Date(o.ends_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: 6, textAlign: 'right' }}>{Number(o.impressions || 0).toLocaleString()}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{Number(o.clicks || 0).toLocaleString()}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>
                  {o.ctr == null ? '—' : `${(o.ctr * 100).toFixed(2)}%`}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
