import React, { useEffect, useState } from 'react';
import { getPlayerSponsorships } from '../api';

export default function SponsorChip({ accountId }) {
  const [sponsorship, setSponsorship] = useState(null);

  useEffect(() => {
    if (!accountId) return;
    getPlayerSponsorships(accountId)
      .then(d => {
        const list = d.sponsorships || [];
        if (list.length > 0) setSponsorship(list[0]);
      })
      .catch(() => {});
  }, [accountId]);

  if (!sponsorship) return null;

  // SECURITY (Task #157 round-4): defence-in-depth against unsafe link_url.
  // Server-side validation already rejects non-http(s) URLs at write time
  // (`/api/sponsorships/checkout` in `src/monetization/magazineV3.js`),
  // but we re-validate here so any historical row, manual DB edit, or
  // future API change can never produce a `javascript:` / `data:` href.
  const safeHref = (() => {
    const s = sponsorship.link_url;
    if (typeof s !== 'string' || s.length === 0 || s.length > 2048) return null;
    try {
      const u = new URL(s);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? s : null;
    } catch { return null; }
  })();

  const inner = (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', borderRadius: 6,
      background: 'rgba(197,169,117,.12)',
      border: '1px solid var(--brass, #c5a975)',
      fontSize: 13,
    }}>
      <span style={{ opacity: .7 }}>Sponsored:</span>
      <strong>{sponsorship.headline}</strong>
    </div>
  );
  return safeHref
    ? <a href={safeHref} target="_blank" rel="noopener noreferrer"
         style={{ textDecoration: 'none' }}>{inner}</a>
    : inner;
}
