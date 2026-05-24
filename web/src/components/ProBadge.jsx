import React from 'react';

// Task #318 — added a Founder variant for grandfathered lifetime members.
// Pass variant='founder' to render the brass/parchment crown badge instead
// of the gold Pro pill.
export default function ProBadge({ size = 'sm', title, variant = 'pro' }) {
  const px = size === 'lg' ? { padding: '3px 9px', fontSize: 11 } : { padding: '1px 6px', fontSize: 10 };
  const isFounder = variant === 'founder';
  const label = isFounder ? '♛ Founder' : '★ Pro';
  const tip = title || (isFounder ? 'Founder — lifetime member' : 'Pro Member');
  const background = isFounder
    ? 'linear-gradient(135deg, #c5a975 0%, #f5efe2 100%)'
    : 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)';
  const color = isFounder ? '#0d1424' : '#1a1a1a';
  const shadow = isFounder
    ? '0 1px 3px rgba(197,169,117,0.5)'
    : '0 1px 3px rgba(245,158,11,0.4)';
  return (
    <span
      title={tip}
      aria-label={tip}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        ...px,
        background,
        color,
        borderRadius: 4, fontWeight: 800, letterSpacing: 0.4,
        textTransform: 'uppercase',
        boxShadow: shadow,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
