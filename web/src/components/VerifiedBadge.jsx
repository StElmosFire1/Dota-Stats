import React, { useEffect, useState } from 'react';
import { getPlayerVerifiedBadges } from '../api';

const cache = new Map();

function CheckIcon({ size = 14, color = 'var(--amber, #f59e0b)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path fill={color}
        d="M10 0l2.39 2.05 3.1-.42.42 3.1L18 7l-2.05 2.39.42 3.1-3.1.42L10 15l-2.39-2.05-3.1.42-.42-3.1L2 7l2.05-2.39-.42-3.1 3.1-.42z" />
      <path fill="#0d1424" d="M8.7 11.6L6.4 9.3l1-1 1.3 1.3 3.6-3.6 1 1z" />
    </svg>
  );
}

export default function VerifiedBadge({ accountId, size = 14, inline = true }) {
  const [badges, setBadges] = useState(() => cache.get(accountId) || null);

  useEffect(() => {
    if (!accountId || cache.has(accountId)) return;
    getPlayerVerifiedBadges(accountId)
      .then(d => {
        const list = Array.isArray(d?.badges) ? d.badges : (d?.badges || []);
        cache.set(accountId, list);
        setBadges(list);
      })
      .catch(() => { cache.set(accountId, []); setBadges([]); });
  }, [accountId]);

  if (!badges || badges.length === 0) return null;
  const title = `Verified: ${badges.map(b => b.provider).join(', ')}`;
  return (
    <span title={title} aria-label={title}
          style={{
            display: inline ? 'inline-flex' : 'flex',
            alignItems: 'center', verticalAlign: 'middle', gap: 2,
          }}>
      <CheckIcon size={size} />
    </span>
  );
}
