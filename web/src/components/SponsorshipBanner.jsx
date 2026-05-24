import React, { useEffect, useState, useRef } from 'react';

// Task #320 — public sponsorship placement.
// Fetches the active sponsor for a slot slug, renders the creative with a
// clearly visible "Sponsored by" label (FTC-style disclosure), and fires
// best-effort impression + click beacons to /api/sponsorships/track/*.
// Silently renders nothing when no sponsor is active so it can be dropped
// into any layout safely.
export default function SponsorshipBanner({ slug, layout = 'banner', style = {} }) {
  const [sponsor, setSponsor] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const trackedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sponsorships/active/${encodeURIComponent(slug)}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { sponsorships: [] })
      .then(j => { if (!cancelled) { setSponsor((j.sponsorships || [])[0] || null); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!sponsor || trackedRef.current) return;
    trackedRef.current = true;
    fetch('/api/sponsorships/track/impression', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: sponsor.id }),
    }).catch(() => {});
  }, [sponsor]);

  if (!loaded || !sponsor) return null;

  // Defense-in-depth: even though the API validates sponsor_url on write,
  // re-check at render time so a legacy unsafe URL or a hand-edited DB row
  // can't turn into a `javascript:` click on a public page.
  let safeHref = null;
  if (sponsor.sponsor_url) {
    try {
      const u = new URL(sponsor.sponsor_url);
      if (u.protocol === 'http:' || u.protocol === 'https:') safeHref = u.toString();
    } catch { /* drop unsafe/invalid URL */ }
  }
  let safeImg = null;
  if (sponsor.sponsor_image_url) {
    try {
      const u = new URL(sponsor.sponsor_image_url);
      if (u.protocol === 'http:' || u.protocol === 'https:') safeImg = u.toString();
    } catch { /* drop */ }
  }

  const handleClick = () => {
    fetch('/api/sponsorships/track/click', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: sponsor.id }),
    }).catch(() => {});
  };

  const isCompact = layout === 'compact';
  const baseStyle = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: isCompact ? '8px 12px' : '12px 16px',
    background: 'var(--bg-card, #1a1a1a)',
    border: '1px solid var(--border, #333)',
    borderRadius: 8, fontSize: 13,
    ...style,
  };

  const body = (
    <>
      <span aria-hidden="true" style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
        padding: '2px 6px', borderRadius: 3,
        background: 'var(--bg-secondary, #2a2a2a)', color: 'var(--text-muted, #888)',
        fontWeight: 600,
      }}>Sponsored</span>
      {safeImg && (
        <img src={safeImg} alt=""
          style={{ height: isCompact ? 24 : 32, width: 'auto', objectFit: 'contain' }} />
      )}
      <span style={{ flex: 1, color: 'var(--text-primary)' }}>
        <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Sponsored by</span>
        <strong>{sponsor.sponsor_name}</strong>
      </span>
    </>
  );

  if (safeHref) {
    return (
      <a href={safeHref} target="_blank" rel="noopener sponsored nofollow"
        onClick={handleClick}
        aria-label={`Sponsored by ${sponsor.sponsor_name} — opens in new tab`}
        style={{ ...baseStyle, textDecoration: 'none', cursor: 'pointer' }}>
        {body}
      </a>
    );
  }
  return <div role="complementary" aria-label={`Sponsored by ${sponsor.sponsor_name}`} style={baseStyle}>{body}</div>;
}
