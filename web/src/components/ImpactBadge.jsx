import React from 'react';

const IMPACT_COLOURS = {
  10: { bg: 'rgba(56,220,80,0.18)',  border: 'rgba(56,220,80,0.55)',  text: '#38dc50' },
  9:  { bg: 'rgba(100,220,60,0.16)', border: 'rgba(100,220,60,0.5)',  text: '#72dc3c' },
  8:  { bg: 'rgba(160,215,40,0.15)', border: 'rgba(160,215,40,0.45)', text: '#a8d028' },
  7:  { bg: 'rgba(200,210,20,0.14)', border: 'rgba(200,210,20,0.45)', text: '#c8d214' },
  6:  { bg: 'rgba(230,200,10,0.14)', border: 'rgba(230,200,10,0.4)',  text: '#e6c80a' },
  5:  { bg: 'rgba(240,170,10,0.14)', border: 'rgba(240,170,10,0.4)',  text: '#f0aa0a' },
  4:  { bg: 'rgba(245,130,20,0.15)', border: 'rgba(245,130,20,0.45)', text: '#f58214' },
  3:  { bg: 'rgba(245,90,30,0.15)',  border: 'rgba(245,90,30,0.45)',  text: '#f55a1e' },
  2:  { bg: 'rgba(235,50,50,0.15)',  border: 'rgba(235,50,50,0.45)',  text: '#eb3232' },
  1:  { bg: 'rgba(200,20,20,0.15)',  border: 'rgba(200,20,20,0.45)',  text: '#c81414' },
};

export default function ImpactBadge({ score, size = 'md', title: titleProp }) {
  if (score == null) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const c = IMPACT_COLOURS[score] || IMPACT_COLOURS[5];
  const isLg = size === 'lg';
  const defaultTitle = `Impact Score ${score}/10 — ranked by kill involvement, win rate, K/D/A and games played`;
  return (
    <span
      title={titleProp || defaultTitle}
      style={{
        display: 'inline-block',
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        borderRadius: isLg ? 8 : 6,
        padding: isLg ? '4px 14px' : '1px 8px',
        fontSize: isLg ? 22 : 13,
        fontWeight: 800,
        minWidth: isLg ? 36 : 24,
        textAlign: 'center',
        cursor: 'default',
        letterSpacing: '0.02em',
      }}
    >
      {score}
    </span>
  );
}
