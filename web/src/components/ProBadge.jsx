import React from 'react';

export default function ProBadge({ size = 'sm', title = 'Pro Member' }) {
  const px = size === 'lg' ? { padding: '3px 9px', fontSize: 11 } : { padding: '1px 6px', fontSize: 10 };
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        ...px,
        background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        color: '#1a1a1a',
        borderRadius: 4, fontWeight: 800, letterSpacing: 0.4,
        textTransform: 'uppercase',
        boxShadow: '0 1px 3px rgba(245,158,11,0.4)',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      ★ Pro
    </span>
  );
}
